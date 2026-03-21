#include "engine/log.h"
#include "engine/transport.h"
#include "engine/version.h"

#include <ixwebsocket/IXWebSocket.h>
#include <ixwebsocket/IXGetFreePort.h>
#include <ixwebsocket/IXNetSystem.h>
#include "protocol/transport.pb.h"
#include "mechanism/mechanism.pb.h"

#include <cassert>
#include <chrono>
#include <condition_variable>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

#include <BRepPrimAPI_MakeBox.hxx>
#include <gp_Pnt.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

using namespace motionlab::protocol;
namespace fs = std::filesystem;

static const std::string TEST_TOKEN = "test-token-12345";

static std::string write_face_test_step_file() {
    auto path = fs::temp_directory_path() / "motionlab_face_test_box.step";

    Handle(XCAFApp_Application) app = XCAFApp_Application::GetApplication();
    Handle(TDocStd_Document) doc;
    app->NewDocument("MDTV-XCAF", doc);

    Handle(XCAFDoc_ShapeTool) shape_tool =
        XCAFDoc_DocumentTool::ShapeTool(doc->Main());

    // Two independent shapes — the importer should yield two distinct bodies
    TopoDS_Shape box1 = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
    TDF_Label box1_label = shape_tool->AddShape(box1);
    TDataStd_Name::Set(box1_label, "FaceTestBox");

    // Second box with different dimensions so OCCT treats it as a distinct shape
    TopoDS_Shape box2 = BRepPrimAPI_MakeBox(gp_Pnt(50.0, 0.0, 0.0), 8.0, 15.0, 25.0).Shape();
    TDF_Label box2_label = shape_tool->AddShape(box2);
    TDataStd_Name::Set(box2_label, "FaceTestBox2");

    STEPCAFControl_Writer writer;
    writer.SetNameMode(true);
    writer.SetColorMode(false);
    writer.SetLayerMode(false);
    writer.Transfer(doc, STEPControl_AsIs);
    IFSelect_ReturnStatus status = writer.Write(path.string().c_str());
    assert(status == IFSelect_RetDone);

    app->Close(doc);
    return path.string();
}

// ──────────────────────────────────────────────
// Helper: synchronous WS test client (binary protobuf)
// ──────────────────────────────────────────────
class TestClient {
public:
    TestClient() {
        ws_.disableAutomaticReconnection();
        ws_.disablePerMessageDeflate();
        ws_.setPingInterval(0);

        ws_.setOnMessageCallback([this](const ix::WebSocketMessagePtr& msg) {
            if (msg->type == ix::WebSocketMessageType::Open) {
                std::lock_guard<std::mutex> lock(mutex_);
                connected_ = true;
                cv_.notify_all();
            } else if (msg->type == ix::WebSocketMessageType::Close) {
                std::lock_guard<std::mutex> lock(mutex_);
                connected_ = false;
                cv_.notify_all();
            } else if (msg->type == ix::WebSocketMessageType::Message && msg->binary) {
                std::lock_guard<std::mutex> lock(mutex_);
                Event event;
                if (event.ParseFromString(msg->str)) {
                    messages_.push_back(std::move(event));
                }
                cv_.notify_all();
            }
        });
    }

    void connect(uint16_t port) {
        ws_.setUrl("ws://127.0.0.1:" + std::to_string(port));
        ws_.start();

        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait_for(lock, std::chrono::seconds(5), [this] { return connected_; });
        assert(connected_);
    }

    void send_command(const Command& cmd) {
        std::string serialized;
        cmd.SerializeToString(&serialized);
        ws_.sendBinary(serialized);
    }

    const Event& wait_for_message(size_t index, int timeout_ms = 3000) {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms),
            [this, index] { return messages_.size() > index; });
        assert(messages_.size() > index);
        return messages_[index];
    }

    void wait_for_disconnect(int timeout_ms = 3000) {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms),
            [this] { return !connected_; });
    }

    bool is_connected() {
        std::lock_guard<std::mutex> lock(mutex_);
        return connected_;
    }

    // Scan for the next Event matching a sequence_id, starting from scan_from.
    // On success, advances scan_from past the matched index.
    const Event* wait_for_response(uint64_t seq_id, size_t& scan_from, int timeout_ms = 5000) {
        auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
        size_t idx = scan_from;
        while (std::chrono::steady_clock::now() < deadline) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait_for(lock, std::chrono::milliseconds(50),
                [this, idx] { return messages_.size() > idx; });
            if (messages_.size() > idx) {
                if (messages_[idx].sequence_id() == seq_id) {
                    scan_from = idx + 1;
                    return &messages_[idx];
                }
                lock.unlock();
                idx++;
            }
        }
        return nullptr;
    }

    size_t message_count() {
        std::lock_guard<std::mutex> lock(mutex_);
        return messages_.size();
    }

    bool wait_for_message_count(size_t min_count, int timeout_ms = 3000) {
        std::unique_lock<std::mutex> lock(mutex_);
        return cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms),
            [this, min_count] { return messages_.size() >= min_count; });
    }

    void close() {
        ws_.stop();
    }

    ~TestClient() {
        ws_.stop();
    }

private:
    ix::WebSocket ws_;
    std::vector<Event> messages_;
    std::mutex mutex_;
    std::condition_variable cv_;
    bool connected_ = false;
};

// ──────────────────────────────────────────────
// Helper: build a handshake Command
// ──────────────────────────────────────────────
static Command make_handshake(uint64_t sequence_id, const std::string& token,
                              const std::string& proto_name = "motionlab",
                              uint32_t proto_version = motionlab::PROTOCOL_VERSION) {
    Command cmd;
    cmd.set_sequence_id(sequence_id);
    auto* hs = cmd.mutable_handshake();
    hs->set_session_token(token);
    auto* pv = hs->mutable_protocol();
    pv->set_name(proto_name);
    pv->set_version(proto_version);
    return cmd;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

static void test_version_constants() {
    assert(MOTIONLAB_ENGINE_VERSION_MAJOR == 0);
    assert(MOTIONLAB_ENGINE_VERSION_MINOR == 0);
    assert(MOTIONLAB_ENGINE_VERSION_PATCH == 1);
    std::cout << "  PASS: version constants" << std::endl;
}

static void test_valid_handshake(uint16_t port) {
    TestClient client;
    client.connect(port);

    client.send_command(make_handshake(1, TEST_TOKEN));

    const auto& ack_event = client.wait_for_message(0);
    assert(ack_event.sequence_id() == 1);
    assert(ack_event.payload_case() == Event::kHandshakeAck);
    const auto& ack = ack_event.handshake_ack();
    assert(ack.compatible() == true);
    assert(ack.engine_protocol().name() == "motionlab");
    assert(ack.engine_protocol().version() == motionlab::PROTOCOL_VERSION);
    assert(ack.engine_version() == "0.0.1");

    const auto& status_event = client.wait_for_message(1);
    assert(status_event.payload_case() == Event::kEngineStatus);
    assert(status_event.engine_status().state() == EngineStatus::STATE_READY);

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: valid handshake" << std::endl;
}

static void test_wrong_token(uint16_t port) {
    TestClient client;
    client.connect(port);

    client.send_command(make_handshake(2, "wrong-token"));

    const auto& ack_event = client.wait_for_message(0);
    assert(ack_event.payload_case() == Event::kHandshakeAck);
    assert(ack_event.handshake_ack().compatible() == false);

    client.wait_for_disconnect();
    assert(!client.is_connected());

    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: wrong token rejected" << std::endl;
}

static void test_ping_pong(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Authenticate first
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // Wait for ack + status

    // Send ping
    uint64_t ts = 1234567890;
    Command ping_cmd;
    ping_cmd.set_sequence_id(3);
    ping_cmd.mutable_ping()->set_timestamp(ts);
    client.send_command(ping_cmd);

    const auto& pong_event = client.wait_for_message(2);
    assert(pong_event.sequence_id() == 3);
    assert(pong_event.payload_case() == Event::kPong);
    assert(pong_event.pong().timestamp() == ts);

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: ping/pong" << std::endl;
}

static void test_protocol_roundtrip(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Handshake
    client.send_command(make_handshake(100, TEST_TOKEN));

    const auto& ack_event = client.wait_for_message(0);
    assert(ack_event.sequence_id() == 100);
    assert(ack_event.payload_case() == Event::kHandshakeAck);
    assert(ack_event.handshake_ack().compatible() == true);
    assert(ack_event.handshake_ack().engine_protocol().name() == "motionlab");
    assert(ack_event.handshake_ack().engine_protocol().version() == motionlab::PROTOCOL_VERSION);
    assert(ack_event.handshake_ack().engine_version() == "0.0.1");

    const auto& status_event = client.wait_for_message(1);
    assert(status_event.payload_case() == Event::kEngineStatus);
    assert(status_event.engine_status().state() == EngineStatus::STATE_READY);

    // Ping → Pong
    uint64_t ts = 9876543210ULL;
    Command ping_cmd;
    ping_cmd.set_sequence_id(101);
    ping_cmd.mutable_ping()->set_timestamp(ts);
    client.send_command(ping_cmd);

    const auto& pong_event = client.wait_for_message(2);
    assert(pong_event.sequence_id() == 101);
    assert(pong_event.payload_case() == Event::kPong);
    assert(pong_event.pong().timestamp() == ts);

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: protocol roundtrip" << std::endl;
}

static void test_create_datum_invalid_parent(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Authenticate first
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status

    // Send CreateDatumCommand with bogus parent body ID
    Command cmd;
    cmd.set_sequence_id(200);
    auto* cd = cmd.mutable_create_datum();
    cd->mutable_parent_body_id()->set_id("nonexistent-body");
    cd->set_name("BadDatum");
    auto* pose = cd->mutable_local_pose();
    pose->mutable_position()->set_x(0);
    pose->mutable_position()->set_y(0);
    pose->mutable_position()->set_z(0);
    pose->mutable_orientation()->set_w(1);
    pose->mutable_orientation()->set_x(0);
    pose->mutable_orientation()->set_y(0);
    pose->mutable_orientation()->set_z(0);
    client.send_command(cmd);

    const auto& evt = client.wait_for_message(2);
    assert(evt.sequence_id() == 200);
    assert(evt.payload_case() == Event::kCreateDatumResult);
    assert(evt.create_datum_result().result_case() ==
           CreateDatumResult::kErrorMessage);
    assert(!evt.create_datum_result().error_message().empty());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: create datum invalid parent" << std::endl;
}

static void test_delete_datum_nonexistent(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Authenticate first
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status

    // Send DeleteDatumCommand with nonexistent datum ID
    Command cmd;
    cmd.set_sequence_id(201);
    cmd.mutable_delete_datum()->mutable_datum_id()->set_id("nonexistent-datum");
    client.send_command(cmd);

    const auto& evt = client.wait_for_message(2);
    assert(evt.sequence_id() == 201);
    assert(evt.payload_case() == Event::kDeleteDatumResult);
    assert(evt.delete_datum_result().result_case() ==
           DeleteDatumResult::kErrorMessage);
    assert(!evt.delete_datum_result().error_message().empty());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: delete datum nonexistent" << std::endl;
}

static void test_create_joint_invalid_datum(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Authenticate
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status

    // Send CreateJointCommand with bad datum IDs
    Command cmd;
    cmd.set_sequence_id(300);
    auto* cj = cmd.mutable_create_joint();
    cj->mutable_parent_datum_id()->set_id("bad-datum-1");
    cj->mutable_child_datum_id()->set_id("bad-datum-2");
    cj->set_type(motionlab::mechanism::JOINT_TYPE_REVOLUTE);
    cj->set_name("BadJoint");
    cj->set_lower_limit(-1.0);
    cj->set_upper_limit(1.0);
    client.send_command(cmd);

    const auto& evt = client.wait_for_message(2);
    assert(evt.sequence_id() == 300);
    assert(evt.payload_case() == Event::kCreateJointResult);
    assert(evt.create_joint_result().result_case() ==
           CreateJointResult::kErrorMessage);
    assert(!evt.create_joint_result().error_message().empty());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: create joint invalid datum" << std::endl;
}

static void test_delete_joint_nonexistent(uint16_t port) {
    TestClient client;
    client.connect(port);

    // Authenticate
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status

    // Send DeleteJointCommand with bad ID
    Command cmd;
    cmd.set_sequence_id(301);
    cmd.mutable_delete_joint()->mutable_joint_id()->set_id("nonexistent-joint");
    client.send_command(cmd);

    const auto& evt = client.wait_for_message(2);
    assert(evt.sequence_id() == 301);
    assert(evt.payload_case() == Event::kDeleteJointResult);
    assert(evt.delete_joint_result().result_case() ==
           DeleteJointResult::kErrorMessage);
    assert(!evt.delete_joint_result().error_message().empty());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: delete joint nonexistent" << std::endl;
}

static void test_create_datum_from_face_after_import(uint16_t port,
                                                     const std::string& step_file,
                                                     const char* label) {
    TestClient client;
    client.connect(port);

    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status

    Command import_cmd;
    import_cmd.set_sequence_id(400);
    import_cmd.mutable_import_asset()->set_file_path(step_file);
    client.send_command(import_cmd);

    const auto& import_evt = client.wait_for_message(2, 5000);
    assert(import_evt.sequence_id() == 400);
    assert(import_evt.payload_case() == Event::kImportAssetResult);
    assert(import_evt.import_asset_result().success());
    assert(import_evt.import_asset_result().bodies_size() >= 1);

    const auto& body = import_evt.import_asset_result().bodies(0);
    assert(body.part_index_size() > 0);

    Command face_cmd;
    face_cmd.set_sequence_id(401);
    auto* create = face_cmd.mutable_create_datum_from_face();
    create->mutable_parent_body_id()->set_id(body.body_id());
    create->set_face_index(0);
    create->set_name("Face Datum");
    client.send_command(face_cmd);

    const auto& face_evt = client.wait_for_message(3, 5000);
    assert(face_evt.sequence_id() == 401);
    assert(face_evt.payload_case() == Event::kCreateDatumFromFaceResult);
    assert(face_evt.create_datum_from_face_result().result_case() ==
           CreateDatumFromFaceResult::kSuccess);
    const auto& success = face_evt.create_datum_from_face_result().success();
    assert(success.face_index() == 0);
    assert(success.surface_class() == FACE_SURFACE_CLASS_PLANAR);
    assert(success.datum().parent_body_id().id() == body.body_id());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: " << label << std::endl;
}

// Helper: wait for an event of a specific payload_case, with timeout
static const Event* wait_for_event_type(TestClient& client, Event::PayloadCase target,
                                         size_t start_index, int timeout_ms = 5000) {
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
    size_t idx = start_index;
    while (std::chrono::steady_clock::now() < deadline) {
        if (!client.wait_for_message_count(idx + 1, 100)) {
            continue;
        }

        size_t total = client.message_count();
        while (idx < total) {
            const auto& evt = client.wait_for_message(idx, 0);
            if (evt.payload_case() == target) return &evt;
            idx++;
        }
    }
    return nullptr;
}

static const Event* wait_for_sim_state(TestClient& client, SimStateEnum target,
                                       size_t start_index, int timeout_ms = 5000) {
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
    size_t idx = start_index;
    while (std::chrono::steady_clock::now() < deadline) {
        if (!client.wait_for_message_count(idx + 1, 100)) {
            continue;
        }

        size_t total = client.message_count();
        while (idx < total) {
            const auto& evt = client.wait_for_message(idx, 0);
            idx++;
            if (evt.payload_case() == Event::kSimulationState &&
                evt.simulation_state().state() == target) {
                return &evt;
            }
        }
    }
    return nullptr;
}

static void test_update_datum_pose(uint16_t port) {
    TestClient client;
    client.connect(port);

    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1);

    Command import_cmd;
    import_cmd.set_sequence_id(410);
    import_cmd.mutable_import_asset()->set_file_path(write_face_test_step_file());
    client.send_command(import_cmd);

    size_t scan_from = 2;
    const auto* import_evt = client.wait_for_response(410, scan_from, 10000);
    assert(import_evt != nullptr);
    assert(import_evt->payload_case() == Event::kImportAssetResult);
    assert(import_evt->import_asset_result().success());

    const std::string body_id = import_evt->import_asset_result().bodies(0).body_id();

    Command create_cmd;
    create_cmd.set_sequence_id(411);
    auto* create = create_cmd.mutable_create_datum();
    create->mutable_parent_body_id()->set_id(body_id);
    create->set_name("MovableDatum");
    create->mutable_local_pose()->mutable_orientation()->set_w(1);
    client.send_command(create_cmd);

    const auto* create_evt = client.wait_for_response(411, scan_from);
    assert(create_evt != nullptr);
    assert(create_evt->payload_case() == Event::kCreateDatumResult);
    assert(create_evt->create_datum_result().result_case() == CreateDatumResult::kDatum);
    const std::string datum_id = create_evt->create_datum_result().datum().id().id();

    Command update_cmd;
    update_cmd.set_sequence_id(412);
    auto* update = update_cmd.mutable_update_datum_pose();
    update->mutable_datum_id()->set_id(datum_id);
    auto* pose = update->mutable_new_local_pose();
    pose->mutable_position()->set_x(1.25);
    pose->mutable_position()->set_y(-2.5);
    pose->mutable_position()->set_z(3.75);
    pose->mutable_orientation()->set_w(0.5);
    pose->mutable_orientation()->set_x(0.5);
    pose->mutable_orientation()->set_y(0.5);
    pose->mutable_orientation()->set_z(0.5);
    client.send_command(update_cmd);

    const auto* update_evt = client.wait_for_response(412, scan_from);
    assert(update_evt != nullptr);
    assert(update_evt->payload_case() == Event::kUpdateDatumPoseResult);
    assert(update_evt->update_datum_pose_result().result_case() == UpdateDatumPoseResult::kDatum);

    const auto& datum = update_evt->update_datum_pose_result().datum();
    assert(datum.id().id() == datum_id);
    assert(datum.local_pose().position().x() == 1.25);
    assert(datum.local_pose().position().y() == -2.5);
    assert(datum.local_pose().position().z() == 3.75);
    assert(datum.local_pose().orientation().w() == 0.5);
    assert(datum.local_pose().orientation().x() == 0.5);
    assert(datum.local_pose().orientation().y() == 0.5);
    assert(datum.local_pose().orientation().z() == 0.5);

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: update datum pose" << std::endl;
}

static void test_import_unit_system_and_project_roundtrip(uint16_t port) {
    TestClient client;
    client.connect(port);

    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1);

    std::string step_file = write_face_test_step_file();
    size_t scan_from = 2;

    Command bad_import;
    bad_import.set_sequence_id(420);
    auto* bad = bad_import.mutable_import_asset();
    bad->set_file_path(step_file);
    bad->mutable_import_options()->set_unit_system("parsec");
    client.send_command(bad_import);

    const auto* bad_evt = client.wait_for_response(420, scan_from, 10000);
    assert(bad_evt != nullptr);
    assert(bad_evt->payload_case() == Event::kImportAssetResult);
    assert(!bad_evt->import_asset_result().success());

    Command import_cmd;
    import_cmd.set_sequence_id(421);
    auto* import = import_cmd.mutable_import_asset();
    import->set_file_path(step_file);
    import->mutable_import_options()->set_unit_system("inch");
    client.send_command(import_cmd);

    const auto* import_evt = client.wait_for_response(421, scan_from, 10000);
    assert(import_evt != nullptr);
    assert(import_evt->payload_case() == Event::kImportAssetResult);
    assert(import_evt->import_asset_result().success());
    assert(import_evt->import_asset_result().bodies_size() >= 1);

    const auto& body = import_evt->import_asset_result().bodies(0);
    assert(body.has_source_asset_ref());
    assert(body.source_asset_ref().content_hash().size() == 64);
    assert(std::abs(body.mass_properties().center_of_mass().x() - 0.127) < 1e-4);

    Command save_cmd;
    save_cmd.set_sequence_id(422);
    save_cmd.mutable_save_project()->set_project_name("unit-test-project");
    client.send_command(save_cmd);

    const auto* save_evt = client.wait_for_response(422, scan_from, 10000);
    assert(save_evt != nullptr);
    assert(save_evt->payload_case() == Event::kSaveProjectResult);
    assert(save_evt->save_project_result().result_case() == SaveProjectResult::kProjectData);

    Command load_cmd;
    load_cmd.set_sequence_id(423);
    load_cmd.mutable_load_project()->set_project_data(save_evt->save_project_result().project_data());
    client.send_command(load_cmd);

    const auto* load_evt = client.wait_for_response(423, scan_from, 10000);
    assert(load_evt != nullptr);
    assert(load_evt->payload_case() == Event::kLoadProjectResult);
    assert(load_evt->load_project_result().result_case() == LoadProjectResult::kSuccess);

    const auto& success = load_evt->load_project_result().success();
    assert(success.bodies_size() >= 1);
    assert(success.mechanism().bodies_size() >= 1);
    assert(success.bodies(0).has_source_asset_ref());
    assert(success.mechanism().bodies(0).has_source_asset_ref());
    assert(success.bodies(0).source_asset_ref().content_hash() == body.source_asset_ref().content_hash());
    assert(success.mechanism().bodies(0).source_asset_ref().content_hash() == body.source_asset_ref().content_hash());
    assert(success.bodies(0).source_asset_ref().original_filename() == body.source_asset_ref().original_filename());

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: import units and project roundtrip" << std::endl;
}

static void test_output_channels_and_scrub(uint16_t port, const std::string& step_file) {
    TestClient client;
    client.connect(port);

    // Handshake
    client.send_command(make_handshake(1, TEST_TOKEN));
    client.wait_for_message(1); // ack + status
    size_t scan_from = 2;

    // Import box STEP file
    Command import_cmd;
    import_cmd.set_sequence_id(500);
    import_cmd.mutable_import_asset()->set_file_path(step_file);
    client.send_command(import_cmd);

    const auto* import_evt = client.wait_for_response(500, scan_from, 10000);
    assert(import_evt != nullptr);
    assert(import_evt->payload_case() == Event::kImportAssetResult);
    assert(import_evt->import_asset_result().success());
    assert(import_evt->import_asset_result().bodies_size() >= 2);
    const std::string body1_id = import_evt->import_asset_result().bodies(0).body_id();
    const std::string body2_id = import_evt->import_asset_result().bodies(1).body_id();

    // Create datums on two different bodies (joints require distinct bodies)
    Command d1_cmd;
    d1_cmd.set_sequence_id(501);
    auto* cd1 = d1_cmd.mutable_create_datum();
    cd1->mutable_parent_body_id()->set_id(body1_id);
    cd1->set_name("Datum1");
    auto* p1 = cd1->mutable_local_pose();
    p1->mutable_position()->set_x(0); p1->mutable_position()->set_y(0); p1->mutable_position()->set_z(0);
    p1->mutable_orientation()->set_w(1); p1->mutable_orientation()->set_x(0);
    p1->mutable_orientation()->set_y(0); p1->mutable_orientation()->set_z(0);
    client.send_command(d1_cmd);

    const auto* d1_evt = client.wait_for_response(501, scan_from);
    assert(d1_evt != nullptr);
    assert(d1_evt->payload_case() == Event::kCreateDatumResult);
    assert(d1_evt->create_datum_result().result_case() == CreateDatumResult::kDatum);
    const std::string datum1_id = d1_evt->create_datum_result().datum().id().id();

    Command d2_cmd;
    d2_cmd.set_sequence_id(502);
    auto* cd2 = d2_cmd.mutable_create_datum();
    cd2->mutable_parent_body_id()->set_id(body2_id);
    cd2->set_name("Datum2");
    auto* p2 = cd2->mutable_local_pose();
    p2->mutable_position()->set_x(1); p2->mutable_position()->set_y(0); p2->mutable_position()->set_z(0);
    p2->mutable_orientation()->set_w(1); p2->mutable_orientation()->set_x(0);
    p2->mutable_orientation()->set_y(0); p2->mutable_orientation()->set_z(0);
    client.send_command(d2_cmd);

    const auto* d2_evt = client.wait_for_response(502, scan_from);
    assert(d2_evt != nullptr);
    assert(d2_evt->payload_case() == Event::kCreateDatumResult);
    assert(d2_evt->create_datum_result().result_case() == CreateDatumResult::kDatum);
    const std::string datum2_id = d2_evt->create_datum_result().datum().id().id();

    // Create a revolute joint
    Command jcmd;
    jcmd.set_sequence_id(503);
    auto* cj = jcmd.mutable_create_joint();
    cj->mutable_parent_datum_id()->set_id(datum1_id);
    cj->mutable_child_datum_id()->set_id(datum2_id);
    cj->set_type(motionlab::mechanism::JOINT_TYPE_REVOLUTE);
    cj->set_name("RevJoint1");
    cj->set_lower_limit(-3.14);
    cj->set_upper_limit(3.14);
    client.send_command(jcmd);

    const auto* j_evt = client.wait_for_response(503, scan_from);
    assert(j_evt != nullptr);
    assert(j_evt->payload_case() == Event::kCreateJointResult);
    assert(j_evt->create_joint_result().result_case() == CreateJointResult::kJoint);

    // Compile mechanism
    Command compile_cmd;
    compile_cmd.set_sequence_id(504);
    compile_cmd.mutable_compile_mechanism();
    client.send_command(compile_cmd);

    // Wait for CompilationResultEvent (uses type scanning — compilation may send extra SimState events)
    const auto* compile_evt = wait_for_event_type(client, Event::kCompilationResult, scan_from);
    assert(compile_evt != nullptr);
    assert(compile_evt->compilation_result().success());
    // Should have at least 4 channels (position, velocity, reaction_force, reaction_torque)
    assert(compile_evt->compilation_result().channels_size() >= 4);

    // Verify channel IDs match pattern
    bool found_position = false;
    for (int i = 0; i < compile_evt->compilation_result().channels_size(); ++i) {
        const auto& ch = compile_evt->compilation_result().channels(i);
        assert(!ch.channel_id().empty());
        assert(!ch.name().empty());
        assert(!ch.unit().empty());
        assert(ch.data_type() != CHANNEL_DATA_TYPE_UNSPECIFIED);

        if (ch.channel_id().find("/position") != std::string::npos) {
            found_position = true;
            assert(ch.unit() == "rad"); // revolute joint
            assert(ch.data_type() == CHANNEL_DATA_TYPE_SCALAR);
        }
    }
    assert(found_position);

    // Let any pending events arrive
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    scan_from = client.message_count();

    // Play simulation for ~1s
    Command play_cmd;
    play_cmd.set_sequence_id(505);
    play_cmd.mutable_simulation_control()->set_action(SIMULATION_ACTION_PLAY);
    client.send_command(play_cmd);

    std::this_thread::sleep_for(std::chrono::seconds(1));

    // Pause
    scan_from = client.message_count();
    Command pause_cmd;
    pause_cmd.set_sequence_id(506);
    pause_cmd.mutable_simulation_control()->set_action(SIMULATION_ACTION_PAUSE);
    client.send_command(pause_cmd);

    const auto* paused_evt = wait_for_sim_state(client, SIM_STATE_PAUSED, scan_from);
    assert(paused_evt != nullptr);

    // Scan all received messages for SimulationFrame events
    bool found_frame = false;
    size_t total = client.message_count();
    for (size_t i = scan_from; i < total; ++i) {
        const auto& evt = client.wait_for_message(i, 50);
        if (evt.payload_case() == Event::kSimulationFrame) {
            found_frame = true;
        }
    }
    assert(found_frame); // Should have received simulation frames

    // Scrub to a time in the buffered range
    scan_from = client.message_count();
    Command scrub_cmd;
    scrub_cmd.set_sequence_id(507);
    scrub_cmd.mutable_scrub()->set_time(0.5);
    client.send_command(scrub_cmd);

    // Wait for a SimulationFrame in response to scrub
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    bool found_scrub_frame = false;
    bool found_scrub_trace = false;
    total = client.message_count();
    for (size_t i = scan_from; i < total; ++i) {
        const auto& evt = client.wait_for_message(i, 100);
        if (evt.payload_case() == Event::kSimulationFrame) {
            found_scrub_frame = true;
        }
        if (evt.payload_case() == Event::kSimulationTrace) {
            found_scrub_trace = true;
            assert(!evt.simulation_trace().channel_id().empty());
            assert(evt.simulation_trace().samples_size() > 0);
        }
    }
    assert(found_scrub_frame);
    assert(found_scrub_trace);

    client.close();
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "  PASS: output channels and scrub" << std::endl;
}

int main() {
    motionlab::init_logging(spdlog::level::debug);
    ix::initNetSystem();

    std::cout << "Engine integration tests" << std::endl;
    std::string step_file = write_face_test_step_file();

    test_version_constants();

    // Start server on a free port
    int freePort = ix::getFreePort();
    assert(freePort > 0);
    auto port = static_cast<uint16_t>(freePort);

    motionlab::TransportServer server(TEST_TOKEN);
    server.init(port);

    std::thread server_thread([&server]() { server.run(); });

    // Let the server start
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    test_valid_handshake(port);
    test_wrong_token(port);
    test_ping_pong(port);
    test_protocol_roundtrip(port);
    test_create_datum_invalid_parent(port);
    test_delete_datum_nonexistent(port);
    test_create_joint_invalid_datum(port);
    test_delete_joint_nonexistent(port);
    test_create_datum_from_face_after_import(port, step_file, "create datum from face after cold import");
    test_update_datum_pose(port);
    test_import_unit_system_and_project_roundtrip(port);
    test_output_channels_and_scrub(port, step_file);

    // Shutdown
    server.stop();
    server_thread.join();

    // Start a fresh server instance so shape state must be rebuilt from import/cache.
    freePort = ix::getFreePort();
    assert(freePort > 0);
    port = static_cast<uint16_t>(freePort);

    motionlab::TransportServer cache_server(TEST_TOKEN);
    cache_server.init(port);
    std::thread cache_server_thread([&cache_server]() { cache_server.run(); });
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    test_create_datum_from_face_after_import(port, step_file, "create datum from face after cached import");

    cache_server.stop();
    cache_server_thread.join();

    ix::uninitNetSystem();
    google::protobuf::ShutdownProtobufLibrary();

    std::error_code ec;
    fs::remove(step_file, ec);

    std::cout << "All engine tests passed." << std::endl;
    return 0;
}

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
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using namespace motionlab::protocol;

static const std::string TEST_TOKEN = "test-token-12345";

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
                              uint32_t proto_version = 1) {
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
    assert(ack.engine_protocol().version() == 1);
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
    assert(ack_event.handshake_ack().engine_protocol().version() == 1);
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

int main() {
    ix::initNetSystem();

    std::cout << "Engine integration tests" << std::endl;

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

    // Shutdown
    server.stop();
    server_thread.join();

    ix::uninitNetSystem();
    google::protobuf::ShutdownProtobufLibrary();

    std::cout << "All engine tests passed." << std::endl;
    return 0;
}

#pragma once

#include "engine/log.h"
#include "ring_buffer.h"
#include "simulation.h"

#include <ixwebsocket/IXWebSocket.h>
#include "mechanism/mechanism.pb.h"
#include "protocol/transport.pb.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace motionlab::transport_detail {

class RuntimeSession {
public:
    using SendEventFn = std::function<void(ix::WebSocket&, const protocol::Event&)>;

    struct ChannelMapping {
        std::string joint_id;
        int measurement = -1; // 0=position, 1=velocity, 2=reaction_force, 3=reaction_torque
    };

    RuntimeSession() = default;

    ~RuntimeSession() {
        stop();
    }

    void set_send_event_callback(SendEventFn send_event) {
        send_event_ = std::move(send_event);
    }

    void set_active_ws(ix::WebSocket* ws) {
        active_ws_ = ws;
    }

    void clear_active_ws() {
        active_ws_ = nullptr;
    }

    void stop() {
        stop_thread();
        active_ws_ = nullptr;
    }

    engine::SimState published_state() const {
        return published_sim_state_.load();
    }

    void handle_compile_mechanism(ix::WebSocket& ws,
                                  uint64_t sequence_id,
                                  const protocol::CompileMechanismCommand& compile_cmd,
                                  const mechanism::Mechanism& mechanism) {
        stop_thread();
        published_sim_state_.store(engine::SimState::COMPILING);

        engine::SimulationConfig config;
        if (compile_cmd.has_settings()) {
            const auto& settings = compile_cmd.settings();
            if (settings.timestep() > 0) {
                config.timestep = settings.timestep();
            }
            if (settings.has_gravity()) {
                config.gravity[0] = settings.gravity().x();
                config.gravity[1] = settings.gravity().y();
                config.gravity[2] = settings.gravity().z();
            }
        }

        spdlog::info("Compiling mechanism...");
        auto result = simulation_runtime_.compile(mechanism, config);
        sim_dt_ = config.timestep;

        ring_buffer_.clear();
        trace_batch_step_ = 0;
        trace_channel_index_ = 0;
        channel_descriptors_.clear();
        channel_mappings_.clear();

        protocol::Event event;
        event.set_sequence_id(sequence_id);
        auto* cr = event.mutable_compilation_result();
        cr->set_success(result.success);
        cr->set_error_message(result.error_message);
        for (const auto& diag : result.diagnostics) {
            cr->add_diagnostics(diag);
        }

        if (result.success) {
            channel_descriptors_ = simulation_runtime_.getChannelDescriptors();
            for (const auto& desc : channel_descriptors_) {
                auto* ch = cr->add_channels();
                ch->set_channel_id(desc.channel_id);
                ch->set_name(desc.name);
                ch->set_unit(desc.unit);
                ch->set_data_type(static_cast<protocol::ChannelDataType>(desc.data_type));
                channel_mappings_.push_back(build_channel_mapping(desc.channel_id));
            }
        }

        send_event(ws, event);

        if (result.success) {
            spdlog::info("Compilation succeeded: {} channels", channel_descriptors_.size());
            published_sim_state_.store(engine::SimState::PAUSED);
            sim_command_ = SimCommand::NONE;
            sim_thread_ = std::thread([this]() { simulation_loop(); });
            send_sim_state_event();
        } else {
            spdlog::error("Compilation failed: {}", result.error_message);
            published_sim_state_.store(engine::SimState::ERROR);
        }
    }

    void handle_simulation_control(const protocol::SimulationControlCommand& cmd) {
        static const char* action_names[] = {"UNSPECIFIED", "PLAY", "PAUSE", "STEP", "RESET"};
        int action_idx = static_cast<int>(cmd.action());
        spdlog::info("Simulation control: {}",
                     (action_idx >= 0 && action_idx <= 4) ? action_names[action_idx] : "UNKNOWN");

        SimCommand sc = SimCommand::NONE;
        switch (cmd.action()) {
            case protocol::SIMULATION_ACTION_PLAY:  sc = SimCommand::PLAY; break;
            case protocol::SIMULATION_ACTION_PAUSE: sc = SimCommand::PAUSE; break;
            case protocol::SIMULATION_ACTION_STEP:  sc = SimCommand::STEP_ONCE; break;
            case protocol::SIMULATION_ACTION_RESET: sc = SimCommand::RESET; break;
            default: return;
        }
        {
            std::lock_guard<std::mutex> lock(sim_mutex_);
            sim_command_ = sc;
        }
        sim_cv_.notify_one();
    }

    void handle_scrub(const protocol::ScrubCommand& cmd) {
        {
            std::lock_guard<std::mutex> lock(sim_mutex_);
            if (sim_command_ == SimCommand::PLAY ||
                published_sim_state_.load() == engine::SimState::RUNNING) {
                sim_command_ = SimCommand::PAUSE;
            }
            sim_cv_.notify_one();
        }

        auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
        while (published_sim_state_.load() == engine::SimState::RUNNING &&
               std::chrono::steady_clock::now() < deadline) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }

        const double target = cmd.time();
        const auto* frame = ring_buffer_.find_nearest(target);
        if (frame) {
            send_sim_frame_data(frame->body_poses, frame->joint_states,
                                frame->sim_time, frame->step_count);

            auto window_frames = ring_buffer_.find_window(target, 1.0);
            if (!window_frames.empty()) {
                for (size_t i = 0; i < channel_descriptors_.size(); ++i) {
                    send_trace_window(channel_descriptors_[i], channel_mappings_[i], window_frames);
                }
            }
        }

        published_sim_state_.store(engine::SimState::PAUSED);
        send_sim_state_event();
    }

private:
    enum class SimCommand { NONE, PLAY, PAUSE, STEP_ONCE, RESET, SHUTDOWN };

    static constexpr double FRAME_INTERVAL = 1.0 / 60.0;
    static constexpr int TRACE_BATCH_INTERVAL = 10;

    static ChannelMapping build_channel_mapping(const std::string& channel_id) {
        ChannelMapping mapping;
        auto first_slash = channel_id.find('/');
        auto last_slash = channel_id.rfind('/');
        if (first_slash != std::string::npos &&
            last_slash != std::string::npos &&
            first_slash != last_slash) {
            mapping.joint_id = channel_id.substr(first_slash + 1, last_slash - first_slash - 1);
            std::string meas = channel_id.substr(last_slash + 1);
            if (meas == "position") mapping.measurement = 0;
            else if (meas == "velocity") mapping.measurement = 1;
            else if (meas == "reaction_force") mapping.measurement = 2;
            else if (meas == "reaction_torque") mapping.measurement = 3;
        }
        return mapping;
    }

    void stop_thread() {
        if (sim_thread_.joinable()) {
            {
                std::lock_guard<std::mutex> lock(sim_mutex_);
                sim_command_ = SimCommand::SHUTDOWN;
            }
            sim_cv_.notify_one();
            sim_thread_.join();
        }
        published_sim_state_.store(engine::SimState::IDLE);
    }

    void simulation_loop() {
        bool playing = false;

        while (true) {
            std::unique_lock<std::mutex> lock(sim_mutex_);

            if (!playing) {
                sim_cv_.wait(lock, [this]() { return sim_command_ != SimCommand::NONE; });
            } else {
                sim_cv_.wait_for(lock, std::chrono::milliseconds(0));
            }

            SimCommand cmd = sim_command_;
            sim_command_ = SimCommand::NONE;
            lock.unlock();

            switch (cmd) {
                case SimCommand::SHUTDOWN:
                    return;
                case SimCommand::PLAY:
                    playing = true;
                    published_sim_state_.store(engine::SimState::RUNNING);
                    send_sim_state_event();
                    break;
                case SimCommand::PAUSE:
                    playing = false;
                    simulation_runtime_.pause();
                    published_sim_state_.store(engine::SimState::PAUSED);
                    send_sim_state_event();
                    break;
                case SimCommand::STEP_ONCE:
                    playing = false;
                    simulation_runtime_.step(sim_dt_);
                    simulation_runtime_.pause();
                    published_sim_state_.store(engine::SimState::PAUSED);
                    send_sim_frame();
                    send_sim_state_event();
                    break;
                case SimCommand::RESET:
                    playing = false;
                    simulation_runtime_.reset();
                    published_sim_state_.store(engine::SimState::IDLE);
                    send_sim_frame();
                    send_sim_state_event();
                    break;
                case SimCommand::NONE:
                    break;
            }

            if (playing) {
                auto frame_start = std::chrono::steady_clock::now();
                double accumulated = 0.0;
                while (accumulated < FRAME_INTERVAL) {
                    {
                        std::lock_guard<std::mutex> lk(sim_mutex_);
                        if (sim_command_ != SimCommand::NONE) break;
                    }
                    simulation_runtime_.step(sim_dt_);
                    accumulated += sim_dt_;
                }

                auto poses = simulation_runtime_.getBodyPoses();
                auto joint_states = simulation_runtime_.getJointStates();

                engine::BufferedFrame bf;
                bf.sim_time = simulation_runtime_.getCurrentTime();
                bf.step_count = simulation_runtime_.getStepCount();
                bf.body_poses = poses;
                bf.joint_states = joint_states;
                bf.joint_index_by_id.reserve(joint_states.size());
                for (size_t i = 0; i < joint_states.size(); ++i) {
                    bf.joint_index_by_id.emplace(joint_states[i].joint_id, i);
                }
                ring_buffer_.push(bf);

                send_sim_frame_data(poses, joint_states,
                                    simulation_runtime_.getCurrentTime(),
                                    simulation_runtime_.getStepCount());

                trace_batch_step_++;
                if (!channel_descriptors_.empty() &&
                    trace_batch_step_ >= static_cast<uint64_t>(TRACE_BATCH_INTERVAL)) {
                    trace_batch_step_ = 0;
                    send_trace_batch();
                }

                auto frame_end = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration<double>(frame_end - frame_start).count();
                if (elapsed < FRAME_INTERVAL) {
                    std::this_thread::sleep_for(std::chrono::duration<double>(FRAME_INTERVAL - elapsed));
                }
            }
        }
    }

    const engine::JointState* find_joint_state(const engine::BufferedFrame& frame,
                                               const ChannelMapping& mapping) const {
        auto it = frame.joint_index_by_id.find(mapping.joint_id);
        if (it == frame.joint_index_by_id.end() || it->second >= frame.joint_states.size()) {
            return nullptr;
        }
        return &frame.joint_states[it->second];
    }

    void send_event(ix::WebSocket& ws, const protocol::Event& event) {
        if (send_event_) {
            send_event_(ws, event);
        }
    }

    void send_sim_state_event() {
        if (!active_ws_) return;

        auto state = published_sim_state_.load();
        protocol::SimStateEnum proto_state;
        switch (state) {
            case engine::SimState::IDLE:      proto_state = protocol::SIM_STATE_IDLE; break;
            case engine::SimState::COMPILING: proto_state = protocol::SIM_STATE_COMPILING; break;
            case engine::SimState::RUNNING:   proto_state = protocol::SIM_STATE_RUNNING; break;
            case engine::SimState::PAUSED:    proto_state = protocol::SIM_STATE_PAUSED; break;
            case engine::SimState::ERROR:     proto_state = protocol::SIM_STATE_ERROR; break;
            default:                          proto_state = protocol::SIM_STATE_IDLE; break;
        }

        protocol::Event event;
        auto* se = event.mutable_simulation_state();
        se->set_state(proto_state);
        se->set_sim_time(simulation_runtime_.getCurrentTime());
        se->set_step_count(simulation_runtime_.getStepCount());
        send_event(*active_ws_, event);
    }

    void send_sim_frame() {
        if (!active_ws_) return;
        auto poses = simulation_runtime_.getBodyPoses();
        auto joint_states = simulation_runtime_.getJointStates();
        send_sim_frame_data(poses, joint_states,
                            simulation_runtime_.getCurrentTime(),
                            simulation_runtime_.getStepCount());
    }

    void send_sim_frame_data(const std::vector<engine::BodyPose>& poses,
                             const std::vector<engine::JointState>& joint_states,
                             double sim_time,
                             uint64_t step_count) {
        if (!active_ws_) return;

        protocol::SimulationFrame frame;
        frame.set_sim_time(sim_time);
        frame.set_step_count(step_count);

        for (const auto& bp : poses) {
            auto* pd = frame.add_body_poses();
            pd->set_body_id(bp.body_id);
            auto* pos = pd->mutable_position();
            pos->set_x(bp.position[0]);
            pos->set_y(bp.position[1]);
            pos->set_z(bp.position[2]);
            auto* rot = pd->mutable_orientation();
            rot->set_w(bp.orientation[0]);
            rot->set_x(bp.orientation[1]);
            rot->set_y(bp.orientation[2]);
            rot->set_z(bp.orientation[3]);
        }

        for (const auto& js : joint_states) {
            auto* pj = frame.add_joint_states();
            pj->set_joint_id(js.joint_id);
            pj->set_position(js.position);
            pj->set_velocity(js.velocity);
            auto* rf = pj->mutable_reaction_force();
            rf->set_x(js.reaction_force[0]);
            rf->set_y(js.reaction_force[1]);
            rf->set_z(js.reaction_force[2]);
            auto* rt = pj->mutable_reaction_torque();
            rt->set_x(js.reaction_torque[0]);
            rt->set_y(js.reaction_torque[1]);
            rt->set_z(js.reaction_torque[2]);
        }

        protocol::Event event;
        *event.mutable_simulation_frame() = std::move(frame);
        send_event(*active_ws_, event);
    }

    void send_trace_batch() {
        if (!active_ws_ || channel_descriptors_.empty()) return;

        size_t idx = trace_channel_index_ % channel_descriptors_.size();
        trace_channel_index_++;

        double newest = ring_buffer_.newest_time();
        auto frames = ring_buffer_.find_window(newest - 0.25, 0.25);
        if (frames.empty()) return;

        send_trace_window(channel_descriptors_[idx], channel_mappings_[idx], frames);
    }

    void send_trace_window(const engine::ChannelDescriptor& desc,
                           const ChannelMapping& mapping,
                           const std::vector<const engine::BufferedFrame*>& frames) {
        if (!active_ws_) return;

        protocol::SimulationTrace trace;
        trace.set_channel_id(desc.channel_id);

        for (const auto* frame : frames) {
            const engine::JointState* js = find_joint_state(*frame, mapping);
            if (!js) continue;

            auto* sample = trace.add_samples();
            sample->set_time(frame->sim_time);
            switch (mapping.measurement) {
                case 0:
                    sample->set_scalar(js->position);
                    break;
                case 1:
                    sample->set_scalar(js->velocity);
                    break;
                case 2: {
                    auto* v = sample->mutable_vector();
                    v->set_x(js->reaction_force[0]);
                    v->set_y(js->reaction_force[1]);
                    v->set_z(js->reaction_force[2]);
                    break;
                }
                case 3: {
                    auto* v = sample->mutable_vector();
                    v->set_x(js->reaction_torque[0]);
                    v->set_y(js->reaction_torque[1]);
                    v->set_z(js->reaction_torque[2]);
                    break;
                }
                default:
                    break;
            }
        }

        protocol::Event event;
        *event.mutable_simulation_trace() = std::move(trace);
        send_event(*active_ws_, event);
    }

    SendEventFn send_event_;
    engine::SimulationRuntime simulation_runtime_;
    std::thread sim_thread_;
    std::mutex sim_mutex_;
    std::condition_variable sim_cv_;
    SimCommand sim_command_{SimCommand::NONE};
    ix::WebSocket* active_ws_ = nullptr;
    std::atomic<engine::SimState> published_sim_state_{engine::SimState::IDLE};
    engine::SimulationRingBuffer ring_buffer_;
    uint64_t trace_batch_step_ = 0;
    size_t trace_channel_index_ = 0;
    std::vector<engine::ChannelDescriptor> channel_descriptors_;
    std::vector<ChannelMapping> channel_mappings_;
    double sim_dt_ = 0.001;
};

} // namespace motionlab::transport_detail

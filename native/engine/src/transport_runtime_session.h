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
#include <unordered_map>
#include <vector>

namespace motionlab::transport_detail {

class RuntimeSession {
public:
    using SendEventFn = std::function<void(ix::WebSocket&, const protocol::Event&)>;

    RuntimeSession() = default;
    ~RuntimeSession();

    void set_send_event_callback(SendEventFn send_event);
    void set_active_ws(ix::WebSocket* ws);
    void clear_active_ws();
    void stop();

    engine::SimState published_state() const {
        return published_sim_state_.load();
    }

    void handle_compile_mechanism(ix::WebSocket& ws,
                                  uint64_t sequence_id,
                                  const protocol::CompileMechanismCommand& compile_cmd,
                                  const mechanism::Mechanism& mechanism);
    void handle_simulation_control(const protocol::SimulationControlCommand& cmd);
    void handle_scrub(const protocol::ScrubCommand& cmd);

    void stop_thread();

private:
    enum class SimCommand { NONE, PLAY, PAUSE, STEP_ONCE, RESET, SHUTDOWN };

    static constexpr double FRAME_INTERVAL = 1.0 / 60.0;
    static constexpr int TRACE_BATCH_INTERVAL = 10;

    void simulation_loop();
    const engine::ChannelValue* find_channel_value(const engine::BufferedFrame& frame,
                                                   const std::string& channel_id) const;
    void send_event(ix::WebSocket& ws, const protocol::Event& event);
    void send_sim_state_event();
    void send_sim_frame();
    void send_sim_frame_data(const std::vector<engine::BodyPose>& poses,
                             double sim_time,
                             uint64_t step_count);
    void send_trace_batch();
    void send_trace_window(const engine::ChannelDescriptor& desc,
                           const std::vector<const engine::BufferedFrame*>& frames);

    SendEventFn send_event_;
    engine::SimulationRuntime simulation_runtime_;
    std::thread sim_thread_;
    std::mutex sim_mutex_;
    std::condition_variable sim_cv_;
    SimCommand sim_command_{SimCommand::NONE};
    mutable std::mutex ws_mutex_;
    ix::WebSocket* active_ws_ = nullptr;
    std::atomic<engine::SimState> published_sim_state_{engine::SimState::IDLE};
    engine::SimulationRingBuffer ring_buffer_;
    uint64_t trace_batch_step_ = 0;
    std::vector<engine::ChannelDescriptor> channel_descriptors_;
    std::unordered_map<std::string, double> channel_last_sent_time_;
    double sim_dt_ = 0.001;

    // Scrub / replay state
    double scrub_cursor_time_  = 0.0;
    uint64_t scrub_cursor_step_ = 0;
    bool is_scrubbed_           = false;
    bool is_replaying_          = false;
    double replay_cursor_time_  = 0.0;
};

} // namespace motionlab::transport_detail

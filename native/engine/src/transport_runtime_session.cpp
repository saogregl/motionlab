#include "transport_runtime_session.h"

namespace motionlab::transport_detail {

RuntimeSession::~RuntimeSession() {
    stop();
}

void RuntimeSession::set_send_event_callback(SendEventFn send_event) {
    send_event_ = std::move(send_event);
}

void RuntimeSession::set_active_ws(ix::WebSocket* ws) {
    std::lock_guard<std::mutex> lock(ws_mutex_);
    active_ws_ = ws;
    spdlog::info("RuntimeSession: set_active_ws={}", (void*)ws);
}

void RuntimeSession::clear_active_ws() {
    std::lock_guard<std::mutex> lock(ws_mutex_);
    spdlog::info("RuntimeSession: clear_active_ws (was {})", (void*)active_ws_);
    active_ws_ = nullptr;
}

void RuntimeSession::stop() {
    spdlog::info("RuntimeSession: stop() called");
    stop_thread();
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        spdlog::info("RuntimeSession: stop() clearing active_ws_ (was {})", (void*)active_ws_);
        active_ws_ = nullptr;
    }
}

void RuntimeSession::handle_compile_mechanism(ix::WebSocket& ws,
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

        if (settings.duration() > 0) config.duration = settings.duration();

        if (settings.has_solver()) {
            const auto& solver = settings.solver();
            switch (solver.type()) {
                case protocol::SOLVER_PSOR:
                    config.solver.type = engine::SolverType::PSOR; break;
                case protocol::SOLVER_BARZILAI_BORWEIN:
                    config.solver.type = engine::SolverType::BARZILAI_BORWEIN; break;
                case protocol::SOLVER_APGD:
                    config.solver.type = engine::SolverType::APGD; break;
                case protocol::SOLVER_MINRES:
                    config.solver.type = engine::SolverType::MINRES; break;
                default: break;
            }
            if (solver.max_iterations() > 0) config.solver.max_iterations = solver.max_iterations();
            if (solver.tolerance() > 0) config.solver.tolerance = solver.tolerance();
            switch (solver.integrator()) {
                case protocol::INTEGRATOR_EULER_IMPLICIT_LINEARIZED:
                    config.solver.integrator = engine::IntegratorType::EULER_IMPLICIT_LINEARIZED; break;
                case protocol::INTEGRATOR_HHT:
                    config.solver.integrator = engine::IntegratorType::HHT; break;
                case protocol::INTEGRATOR_NEWMARK:
                    config.solver.integrator = engine::IntegratorType::NEWMARK; break;
                default: break;
            }
        }

        if (settings.has_contact()) {
            const auto& contact = settings.contact();
            config.contact.friction = contact.friction() > 0 ? contact.friction() : 0.3;
            config.contact.restitution = contact.restitution();
            config.contact.compliance = contact.compliance();
            config.contact.damping = contact.damping();
            config.contact.enable_contact = contact.enable_contact();
        }
    }

    spdlog::info("Compiling mechanism...");
    auto result = simulation_runtime_.compile(mechanism, config);
    sim_dt_ = config.timestep;

    ring_buffer_.clear();
    trace_batch_step_ = 0;
    trace_channel_index_ = 0;
    channel_descriptors_.clear();

    protocol::Event event;
    event.set_sequence_id(sequence_id);
    auto* cr = event.mutable_compilation_result();
    cr->set_success(result.success);
    cr->set_error_message(result.error_message);
    for (const auto& diag : result.diagnostics) {
        cr->add_diagnostics(diag);
    }
    for (const auto& sd : result.structured_diagnostics) {
        auto* proto_diag = cr->add_structured_diagnostics();
        proto_diag->set_severity(static_cast<protocol::DiagnosticSeverity>(
            static_cast<int>(sd.severity)));
        proto_diag->set_message(sd.message);
        for (const auto& id : sd.affected_entity_ids) {
            proto_diag->add_affected_entity_ids(id);
        }
        proto_diag->set_suggestion(sd.suggestion);
        proto_diag->set_code(sd.code);
    }

    if (result.success) {
        channel_descriptors_ = simulation_runtime_.getChannelDescriptors();
        for (const auto& desc : channel_descriptors_) {
            auto* ch = cr->add_channels();
            ch->set_channel_id(desc.channel_id);
            ch->set_name(desc.name);
            ch->set_unit(desc.unit);
            ch->set_data_type(static_cast<protocol::ChannelDataType>(desc.data_type));
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

void RuntimeSession::handle_simulation_control(const protocol::SimulationControlCommand& cmd) {
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

void RuntimeSession::handle_scrub(const protocol::ScrubCommand& cmd) {
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
        send_sim_frame_data(frame->body_poses, frame->sim_time, frame->step_count);

        auto window_frames = ring_buffer_.find_window(target, 1.0);
        if (!window_frames.empty()) {
            for (size_t i = 0; i < channel_descriptors_.size(); ++i) {
                send_trace_window(channel_descriptors_[i], window_frames);
            }
        }
    }

    published_sim_state_.store(engine::SimState::PAUSED);
    send_sim_state_event();
}

void RuntimeSession::stop_thread() {
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

void RuntimeSession::simulation_loop() {
    spdlog::info("sim_loop: thread started");
    try {
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
                spdlog::info("sim_loop: SHUTDOWN");
                return;
            case SimCommand::PLAY:
                playing = true;
                published_sim_state_.store(engine::SimState::RUNNING);
                send_sim_state_event();
                spdlog::info("sim_loop: PLAY, entering stepping (sim_dt={:.6f}, bodies={})",
                             sim_dt_, simulation_runtime_.getBodyPoses().size());
                break;
            case SimCommand::PAUSE:
                playing = false;
                simulation_runtime_.pause();
                published_sim_state_.store(engine::SimState::PAUSED);
                send_sim_state_event();
                spdlog::info("sim_loop: PAUSE");
                break;
            case SimCommand::STEP_ONCE: {
                playing = false;
                simulation_runtime_.step(sim_dt_);
                simulation_runtime_.pause();
                published_sim_state_.store(engine::SimState::PAUSED);
                send_sim_frame();
                send_sim_state_event();
                spdlog::info("sim_loop: STEP_ONCE t={:.4f}", simulation_runtime_.getCurrentTime());
                break;
            }
            case SimCommand::RESET:
                playing = false;
                simulation_runtime_.reset();
                published_sim_state_.store(engine::SimState::IDLE);
                send_sim_frame();
                send_sim_state_event();
                spdlog::info("sim_loop: RESET");
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
            auto channel_values = simulation_runtime_.getChannelValues();

            engine::BufferedFrame bf;
            bf.sim_time = simulation_runtime_.getCurrentTime();
            bf.step_count = simulation_runtime_.getStepCount();
            bf.body_poses = poses;
            bf.channel_values = channel_values;
            bf.channel_index_by_id.reserve(channel_values.size());
            for (size_t i = 0; i < channel_values.size(); ++i) {
                bf.channel_index_by_id.emplace(channel_values[i].channel_id, i);
            }
            ring_buffer_.push(bf);

            send_sim_frame_data(poses, simulation_runtime_.getCurrentTime(), simulation_runtime_.getStepCount());

            spdlog::debug("sim_loop: frame t={:.4f} steps={}",
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
    } catch (const std::exception& e) {
        spdlog::error("sim_loop: exception: {}", e.what());
        published_sim_state_.store(engine::SimState::ERROR);
        send_sim_state_event();
    }
}

const engine::ChannelValue* RuntimeSession::find_channel_value(const engine::BufferedFrame& frame,
                                                               const std::string& channel_id) const {
    auto it = frame.channel_index_by_id.find(channel_id);
    if (it == frame.channel_index_by_id.end() || it->second >= frame.channel_values.size()) {
        return nullptr;
    }
    return &frame.channel_values[it->second];
}

void RuntimeSession::send_event(ix::WebSocket& ws, const protocol::Event& event) {
    if (send_event_) {
        send_event_(ws, event);
    } else {
        spdlog::warn("sim: send_event: callback not set, dropping event");
    }
}

void RuntimeSession::send_sim_state_event() {
    ix::WebSocket* ws;
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        ws = active_ws_;
    }
    if (!ws) {
        spdlog::warn("sim: send_sim_state_event: active_ws_ is null, dropping event");
        return;
    }

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
    send_event(*ws, event);
}

void RuntimeSession::send_sim_frame() {
    ix::WebSocket* ws;
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        ws = active_ws_;
    }
    if (!ws) return;
    auto poses = simulation_runtime_.getBodyPoses();
    send_sim_frame_data(poses, simulation_runtime_.getCurrentTime(), simulation_runtime_.getStepCount());
}

void RuntimeSession::send_sim_frame_data(const std::vector<engine::BodyPose>& poses,
                                         double sim_time,
                                         uint64_t step_count) {
    ix::WebSocket* ws;
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        ws = active_ws_;
    }
    if (!ws) {
        spdlog::warn("sim: send_sim_frame_data: active_ws_ is null, dropping frame");
        return;
    }

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

    protocol::Event event;
    *event.mutable_simulation_frame() = std::move(frame);
    send_event(*ws, event);
}

void RuntimeSession::send_trace_batch() {
    ix::WebSocket* ws;
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        ws = active_ws_;
    }
    if (!ws || channel_descriptors_.empty()) return;

    size_t idx = trace_channel_index_ % channel_descriptors_.size();
    trace_channel_index_++;

    double newest = ring_buffer_.newest_time();
    auto frames = ring_buffer_.find_window(newest - 0.25, 0.25);
    if (frames.empty()) return;

    send_trace_window(channel_descriptors_[idx], frames);
}

void RuntimeSession::send_trace_window(const engine::ChannelDescriptor& desc,
                                       const std::vector<const engine::BufferedFrame*>& frames) {
    ix::WebSocket* ws;
    {
        std::lock_guard<std::mutex> lock(ws_mutex_);
        ws = active_ws_;
    }
    if (!ws) return;

    protocol::SimulationTrace trace;
    trace.set_channel_id(desc.channel_id);

    for (const auto* frame : frames) {
        const engine::ChannelValue* value = find_channel_value(*frame, desc.channel_id);
        if (!value) continue;

        auto* sample = trace.add_samples();
        sample->set_time(frame->sim_time);
        if (value->data_type == static_cast<int>(protocol::CHANNEL_DATA_TYPE_VEC3)) {
            auto* v = sample->mutable_vector();
            v->set_x(value->vector[0]);
            v->set_y(value->vector[1]);
            v->set_z(value->vector[2]);
        } else {
            sample->set_scalar(value->scalar);
        }
    }

    protocol::Event event;
    *event.mutable_simulation_trace() = std::move(trace);
    send_event(*ws, event);
}

} // namespace motionlab::transport_detail

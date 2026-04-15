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
    channel_descriptors_.clear();
    channel_index_by_id_.clear();
    traces_last_sent_time_ = -1.0;
    is_scrubbed_   = false;
    is_replaying_  = false;

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
        channel_index_by_id_.reserve(channel_descriptors_.size());
        for (size_t i = 0; i < channel_descriptors_.size(); ++i) {
            channel_index_by_id_.emplace(channel_descriptors_[i].channel_id, i);
        }
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
        sim_command_.store(SimCommand::NONE);
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
        sim_command_.store(sc);
    }
    sim_cv_.notify_one();
}

void RuntimeSession::handle_scrub(const protocol::ScrubCommand& cmd) {
    {
        std::unique_lock<std::mutex> lock(sim_mutex_);
        if (sim_command_.load() == SimCommand::PLAY ||
            published_sim_state_.load() == engine::SimState::RUNNING) {
            sim_command_.store(SimCommand::PAUSE);
        }
        sim_cv_.notify_one();

        sim_paused_cv_.wait_for(lock, std::chrono::milliseconds(250), [this]() {
            return published_sim_state_.load() != engine::SimState::RUNNING;
        });
    }

    const double target = cmd.time();
    const auto* frame = ring_buffer_.find_nearest(target);
    if (frame) {
        // Cache the scrubbed position so send_sim_state_event() reports the right time.
        scrub_cursor_time_  = frame->sim_time;
        scrub_cursor_step_  = frame->step_count;
        is_scrubbed_        = true;
        is_replaying_       = false;

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
            sim_command_.store(SimCommand::SHUTDOWN);
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

    // Real-time-ratio window: counts wall + sim time over a fixed number of
    // live frames, then logs steps_per_sec, ms/frame, and rt_ratio. A ratio
    // below 1.0 means physics can't keep up with wall time at the current dt.
    constexpr int RT_WINDOW_FRAMES = 60; // ~1 s at 60 Hz when keeping up
    int    rt_window_frames    = 0;
    double rt_window_sim_time  = 0.0;
    double rt_window_work_secs = 0.0; // time spent inside step+publish, no sleep
    auto   rt_window_wall_start = std::chrono::steady_clock::now();

    while (true) {
        std::unique_lock<std::mutex> lock(sim_mutex_);

        if (!playing) {
            sim_paused_cv_.notify_all();
            sim_cv_.wait(lock, [this]() { return sim_command_.load() != SimCommand::NONE; });
        } else {
            sim_cv_.wait_for(lock, std::chrono::milliseconds(0));
        }

        SimCommand cmd = sim_command_.load();
        sim_command_.store(SimCommand::NONE);
        lock.unlock();

        switch (cmd) {
            case SimCommand::SHUTDOWN:
                spdlog::info("sim_loop: SHUTDOWN");
                return;
            case SimCommand::PLAY:
                if (is_scrubbed_) {
                    // Scrubbed to a past time: replay ring-buffer frames until we
                    // catch up to the live position, then resume live stepping.
                    is_replaying_       = true;
                    replay_cursor_time_ = scrub_cursor_time_;
                    is_scrubbed_        = false;
                } else {
                    is_replaying_ = false;
                }
                playing = true;
                published_sim_state_.store(engine::SimState::RUNNING);
                send_sim_state_event();
                spdlog::info("sim_loop: PLAY, replay={} (sim_dt={:.6f}, bodies={})",
                             is_replaying_, sim_dt_, simulation_runtime_.getBodyPoses().size());
                break;
            case SimCommand::PAUSE:
                playing       = false;
                is_replaying_ = false;
                simulation_runtime_.pause();
                published_sim_state_.store(engine::SimState::PAUSED);
                send_sim_state_event();
                sim_paused_cv_.notify_all();
                spdlog::info("sim_loop: PAUSE");
                break;
            case SimCommand::STEP_ONCE: {
                playing       = false;
                is_replaying_ = false;
                is_scrubbed_  = false;
                simulation_runtime_.step(sim_dt_);
                simulation_runtime_.pause();
                published_sim_state_.store(engine::SimState::PAUSED);
                send_sim_frame();
                send_sim_state_event();
                sim_paused_cv_.notify_all();
                spdlog::info("sim_loop: STEP_ONCE t={:.4f}", simulation_runtime_.getCurrentTime());
                break;
            }
            case SimCommand::RESET:
                playing       = false;
                is_replaying_ = false;
                is_scrubbed_  = false;
                traces_last_sent_time_ = -1.0;
                simulation_runtime_.reset();
                published_sim_state_.store(engine::SimState::IDLE);
                send_sim_frame();
                send_sim_state_event();
                sim_paused_cv_.notify_all();
                spdlog::info("sim_loop: RESET");
                break;
            case SimCommand::NONE:
                break;
        }

        if (playing) {
            auto frame_start = std::chrono::steady_clock::now();

            if (is_replaying_) {
                // Walk ring-buffer frames at real-time speed until we reach the
                // buffered head, then fall through to live stepping.
                const double live_head = ring_buffer_.newest_time();
                const auto* nf = ring_buffer_.find_next_after(replay_cursor_time_);
                if (nf && nf->sim_time < live_head) {
                    replay_cursor_time_ = nf->sim_time;
                    send_sim_frame_data(nf->body_poses, nf->sim_time, nf->step_count);
                    // Trace data for this time range is already in the frontend store
                    // from the original live run; don't resend duplicates.
                    spdlog::debug("sim_loop: replay frame t={:.4f}", nf->sim_time);
                } else {
                    // Caught up to the live position — resume physics stepping.
                    is_replaying_ = false;
                    spdlog::info("sim_loop: replay complete at t={:.4f}, resuming live", live_head);
                }
            } else {
                // Live physics stepping (original behaviour).
                double accumulated = 0.0;
                while (accumulated < FRAME_INTERVAL) {
                    if (sim_command_.load(std::memory_order_relaxed) != SimCommand::NONE) break;
                    simulation_runtime_.step(sim_dt_);
                    accumulated += sim_dt_;
                }

                auto poses = simulation_runtime_.getBodyPoses();
                auto channel_values = simulation_runtime_.getChannelValues();
                const double current_time = simulation_runtime_.getCurrentTime();
                const uint64_t step_count = simulation_runtime_.getStepCount();

                send_sim_frame_data(poses, current_time, step_count);

                engine::BufferedFrame bf;
                bf.sim_time = current_time;
                bf.step_count = step_count;
                bf.body_poses = std::move(poses);
                bf.channel_values = std::move(channel_values);
                ring_buffer_.push(std::move(bf));

                spdlog::debug("sim_loop: frame t={:.4f} steps={}", current_time, step_count);

                trace_batch_step_++;
                if (!channel_descriptors_.empty() &&
                    trace_batch_step_ >= static_cast<uint64_t>(TRACE_BATCH_INTERVAL)) {
                    trace_batch_step_ = 0;
                    send_trace_batch();
                }

                // Real-time-ratio window accounting. Work-time excludes the
                // throttling sleep so we can distinguish "headroom" from
                // "falling behind".
                const auto work_end = std::chrono::steady_clock::now();
                rt_window_work_secs += std::chrono::duration<double>(work_end - frame_start).count();
                rt_window_sim_time  += accumulated;
                rt_window_frames    += 1;
                if (rt_window_frames >= RT_WINDOW_FRAMES) {
                    const double wall_elapsed =
                        std::chrono::duration<double>(work_end - rt_window_wall_start).count();
                    const double rt_ratio =
                        wall_elapsed > 0.0 ? (rt_window_sim_time / wall_elapsed) : 0.0;
                    const double headroom =
                        rt_window_sim_time > 0.0
                            ? (rt_window_sim_time - rt_window_work_secs) / rt_window_sim_time
                            : 0.0;
                    const double ms_per_frame =
                        (rt_window_work_secs * 1000.0) / static_cast<double>(rt_window_frames);
                    const double steps_per_sec =
                        rt_window_work_secs > 0.0
                            ? (rt_window_sim_time / sim_dt_) / rt_window_work_secs
                            : 0.0;
                    spdlog::info(
                        "sim_loop: rt_ratio={:.3f} headroom={:+.1f}% work={:.2f}ms/frame "
                        "steps/s={:.0f} (window={} frames, dt={:.4f})",
                        rt_ratio, headroom * 100.0, ms_per_frame, steps_per_sec,
                        rt_window_frames, sim_dt_);
                    rt_window_frames     = 0;
                    rt_window_sim_time   = 0.0;
                    rt_window_work_secs  = 0.0;
                    rt_window_wall_start = work_end;
                }
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
    auto it = channel_index_by_id_.find(channel_id);
    if (it == channel_index_by_id_.end() || it->second >= frame.channel_values.size()) {
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
    // Use the scrub cursor when paused after a seek, so the frontend
    // timeline doesn't snap back to the actual engine time.
    const double report_time  = is_scrubbed_ ? scrub_cursor_time_  : simulation_runtime_.getCurrentTime();
    const uint64_t report_step = is_scrubbed_ ? scrub_cursor_step_ : simulation_runtime_.getStepCount();
    se->set_sim_time(report_time);
    se->set_step_count(report_step);
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

    auto frames = ring_buffer_.find_frames_after(traces_last_sent_time_);
    if (frames.empty()) return;

    const double newest = frames.back()->sim_time;

    // TODO(plan shimmying-drifting-reddy phase 2 #6): bundle all channels into
    // one Event once protocol::Event.simulation_trace is repeated (ADR required).
    for (const auto& desc : channel_descriptors_) {
        send_trace_window(desc, frames);
    }
    traces_last_sent_time_ = newest;
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

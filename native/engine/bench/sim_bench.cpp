// ---------------------------------------------------------------------------
// sim_bench — measure raw simulation throughput for a slider-crank mechanism.
//
// Three modes:
//   step    — tight loop of SimulationRuntime::step(dt). Since step() is a
//             ~5-line wrapper around ChSystem::DoStepDynamics, this is the
//             Chrono physics ceiling for our slider-crank model.
//   publish — same, plus per-frame getBodyPoses + getChannelValues +
//             protobuf serialization of a SimulationFrame (no socket I/O).
//             Frames are emitted at the same 60 Hz cadence the orchestrator
//             uses (one frame per ~16.67 ms of sim time).
//   all     — runs every mode sequentially.
//
// Use the engine's own log line ("sim_loop: rt_ratio=...") to compare against
// what the orchestrator achieves through the websocket path during a real run.
// ---------------------------------------------------------------------------

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "../tests/test_helpers.h"
#include "protocol/transport.pb.h"

namespace {

constexpr double FRAME_INTERVAL = 1.0 / 60.0;

mech::Mechanism build_slider_crank() {
    constexpr double crank_angle  = 35.0 * PI / 180.0;
    constexpr double crank_length = 0.15;
    constexpr double conrod_length = 0.25;
    constexpr double crank_speed  = PI;

    const double crank_pin_x = crank_length * std::cos(crank_angle);
    const double crank_pin_y = crank_length * std::sin(crank_angle);
    const double slider_x =
        crank_pin_x + std::sqrt(conrod_length * conrod_length - crank_pin_y * crank_pin_y);

    auto q_crank  = make_quat(0, 0, 1, crank_angle);
    auto q_conrod = make_quat(0, 0, 1, std::atan2(-crank_pin_y, slider_x - crank_pin_x));
    auto q_slide  = make_quat(0, 1, 0, PI / 2.0);

    return MechanismBuilder("slider-crank-bench")
        .addFixedBody("ground")
        .addBodyWithOrientation("crank", 1.0,
                                crank_pin_x / 2.0, crank_pin_y / 2.0, 0.0,
                                q_crank.q[0], q_crank.q[1], q_crank.q[2], q_crank.q[3])
        .addBodyWithOrientation("conrod", 1.0,
                                (crank_pin_x + slider_x) / 2.0, crank_pin_y / 2.0, 0.0,
                                q_conrod.q[0], q_conrod.q[1], q_conrod.q[2], q_conrod.q[3])
        .addBody("slider", 1.0, slider_x, 0.0, 0.0)
        .addDatum("datum-crank-ground", "ground", 0.0, 0.0, 0.0)
        .addDatum("datum-crank-base", "crank", -0.075, 0.0, 0.0)
        .addDatum("datum-pin-crank", "crank", 0.075, 0.0, 0.0)
        .addDatum("datum-pin-conrod", "conrod", -0.125, 0.0, 0.0)
        .addDatum("datum-slider-conrod", "conrod", 0.125, 0.0, 0.0)
        .addDatum("datum-slider-pin", "slider", 0.0, 0.0, 0.0)
        .addDatumWithOrientation("datum-slide-ground", "ground",
                                 slider_x, 0.0, 0.0,
                                 q_slide.q[0], q_slide.q[1], q_slide.q[2], q_slide.q[3])
        .addDatumWithOrientation("datum-slide-slider", "slider",
                                 0.0, 0.0, 0.0,
                                 q_slide.q[0], q_slide.q[1], q_slide.q[2], q_slide.q[3])
        .addRevoluteJoint("joint-crank-pivot", "datum-crank-ground", "datum-crank-base")
        .addRevoluteJoint("joint-crank-conrod", "datum-pin-crank", "datum-pin-conrod")
        .addRevoluteJoint("joint-conrod-slider", "datum-slider-conrod", "datum-slider-pin")
        .addPrismaticJoint("joint-slide", "datum-slide-ground", "datum-slide-slider")
        .addRevoluteMotor("actuator-crank", "joint-crank-pivot",
                          mech::ACTUATOR_CONTROL_MODE_SPEED, crank_speed)
        .build();
}

struct Result {
    const char* mode;
    double dt;
    double sim_seconds;
    double wall_seconds;
    uint64_t steps;
    uint64_t frames;
    size_t serialized_bytes;
};

void print_result(const Result& r) {
    const double rt_ratio       = r.sim_seconds / r.wall_seconds;
    const double steps_per_sec  = static_cast<double>(r.steps) / r.wall_seconds;
    const double us_per_step    = (r.wall_seconds * 1.0e6) / static_cast<double>(r.steps);
    const double ms_per_frame   = r.frames > 0
        ? (r.wall_seconds * 1000.0) / static_cast<double>(r.frames)
        : 0.0;

    std::printf("  %-9s  dt=%.4f  sim=%.3fs  wall=%.3fs  steps=%llu",
                r.mode, r.dt, r.sim_seconds, r.wall_seconds,
                static_cast<unsigned long long>(r.steps));
    std::printf("\n             rt_ratio=%.3f  steps/s=%.0f  us/step=%.2f",
                rt_ratio, steps_per_sec, us_per_step);
    if (r.frames > 0) {
        std::printf("  frames=%llu  ms/frame=%.3f",
                    static_cast<unsigned long long>(r.frames), ms_per_frame);
    }
    if (r.serialized_bytes > 0) {
        std::printf("  proto=%zuB/frame", r.serialized_bytes / r.frames);
    }
    std::printf("\n");
}

Result run_step_mode(double dt, double duration_secs) {
    auto mechanism = build_slider_crank();
    eng::SimulationConfig config;
    config.timestep = dt;
    config.gravity[0] = 0.0;
    config.gravity[1] = 0.0;
    config.gravity[2] = 0.0;

    eng::SimulationRuntime runtime;
    auto cr = runtime.compile(mechanism, config);
    if (!cr.success) {
        std::fprintf(stderr, "compile failed: %s\n", cr.error_message.c_str());
        std::exit(1);
    }

    const uint64_t total_steps = static_cast<uint64_t>(duration_secs / dt);

    auto t0 = std::chrono::steady_clock::now();
    for (uint64_t i = 0; i < total_steps; ++i) {
        runtime.step(dt);
    }
    // Touch state once to keep the optimiser honest.
    volatile double sink = runtime.getCurrentTime();
    (void)sink;
    auto t1 = std::chrono::steady_clock::now();

    Result r{};
    r.mode             = "step";
    r.dt               = dt;
    r.sim_seconds      = static_cast<double>(total_steps) * dt;
    r.wall_seconds     = std::chrono::duration<double>(t1 - t0).count();
    r.steps            = total_steps;
    r.frames           = 0;
    r.serialized_bytes = 0;
    return r;
}

Result run_publish_mode(double dt, double duration_secs) {
    auto mechanism = build_slider_crank();
    eng::SimulationConfig config;
    config.timestep = dt;
    config.gravity[0] = 0.0;
    config.gravity[1] = 0.0;
    config.gravity[2] = 0.0;

    eng::SimulationRuntime runtime;
    auto cr = runtime.compile(mechanism, config);
    if (!cr.success) {
        std::fprintf(stderr, "compile failed: %s\n", cr.error_message.c_str());
        std::exit(1);
    }

    const uint64_t total_steps = static_cast<uint64_t>(duration_secs / dt);
    const uint64_t steps_per_frame =
        std::max<uint64_t>(1, static_cast<uint64_t>(FRAME_INTERVAL / dt));

    uint64_t frames           = 0;
    size_t   last_proto_bytes = 0;

    auto t0 = std::chrono::steady_clock::now();
    for (uint64_t i = 0; i < total_steps; ++i) {
        runtime.step(dt);
        if ((i + 1) % steps_per_frame == 0) {
            auto poses          = runtime.getBodyPoses();
            auto channel_values = runtime.getChannelValues();
            const double t      = runtime.getCurrentTime();
            const uint64_t sc   = runtime.getStepCount();

            motionlab::protocol::SimulationFrame frame;
            frame.set_sim_time(t);
            frame.set_step_count(sc);
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
            std::string buf;
            frame.SerializeToString(&buf);
            last_proto_bytes = buf.size();
            // Keep channel_values from being optimised away.
            volatile size_t sink = channel_values.size();
            (void)sink;
            ++frames;
        }
    }
    auto t1 = std::chrono::steady_clock::now();

    Result r{};
    r.mode             = "publish";
    r.dt               = dt;
    r.sim_seconds      = static_cast<double>(total_steps) * dt;
    r.wall_seconds     = std::chrono::duration<double>(t1 - t0).count();
    r.steps            = total_steps;
    r.frames           = frames;
    r.serialized_bytes = last_proto_bytes * frames; // approx; per-frame is constant here
    return r;
}

void print_usage() {
    std::printf(
        "Usage: sim_bench [--mode step|publish|all] [--dt 0.001] [--duration 3.0]\n"
        "\n"
        "Modes:\n"
        "  step     — tight Chrono stepping ceiling (no readback, no encode)\n"
        "  publish  — step + per-60Hz-frame pose readback + protobuf serialize\n"
        "  all      — runs every mode sequentially (default)\n"
        "\n"
        "Reference: orchestrator runs at FRAME_INTERVAL=1/60s. A reported\n"
        "rt_ratio < 1.0 means physics+publish cannot keep up with wall time\n"
        "and the live UI will run slower than real time.\n");
}

} // namespace

int main(int argc, char** argv) {
    std::string mode    = "all";
    double dt           = 0.001;
    double duration     = 3.0;

    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];
        if (std::strcmp(arg, "--mode") == 0 && i + 1 < argc) {
            mode = argv[++i];
        } else if (std::strcmp(arg, "--dt") == 0 && i + 1 < argc) {
            dt = std::atof(argv[++i]);
        } else if (std::strcmp(arg, "--duration") == 0 && i + 1 < argc) {
            duration = std::atof(argv[++i]);
        } else if (std::strcmp(arg, "-h") == 0 || std::strcmp(arg, "--help") == 0) {
            print_usage();
            return 0;
        } else {
            std::fprintf(stderr, "unknown arg: %s\n", arg);
            print_usage();
            return 1;
        }
    }

    if (dt <= 0.0 || duration <= 0.0) {
        std::fprintf(stderr, "dt and duration must be > 0\n");
        return 1;
    }

    std::printf("sim_bench: slider-crank, dt=%.6f, duration=%.3fs\n", dt, duration);

    if (mode == "step" || mode == "all") {
        auto r = run_step_mode(dt, duration);
        print_result(r);
    }
    if (mode == "publish" || mode == "all") {
        auto r = run_publish_mode(dt, duration);
        print_result(r);
    }
    if (mode != "step" && mode != "publish" && mode != "all") {
        std::fprintf(stderr, "unknown mode: %s\n", mode.c_str());
        print_usage();
        return 1;
    }

    return 0;
}

#pragma once

#include "simulation.h"

#include <deque>
#include <shared_mutex>
#include <vector>

namespace motionlab::engine {

struct BufferedFrame {
    double sim_time;
    uint64_t step_count;
    std::vector<BodyPose> body_poses;
    std::vector<JointState> joint_states;
};

class SimulationRingBuffer {
public:
    explicit SimulationRingBuffer(double max_duration = 60.0);

    void push(const BufferedFrame& frame);
    const BufferedFrame* find_nearest(double target_time) const;
    std::vector<const BufferedFrame*> find_window(double center, double half_width) const;
    void clear();
    bool empty() const;
    double oldest_time() const;
    double newest_time() const;
    size_t size() const;

private:
    double max_duration_;
    std::deque<BufferedFrame> frames_;
    mutable std::shared_mutex mutex_;
};

} // namespace motionlab::engine

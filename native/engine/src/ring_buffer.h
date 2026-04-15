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
    std::vector<ChannelValue> channel_values;
};

class SimulationRingBuffer {
public:
    explicit SimulationRingBuffer(double max_duration = 60.0);

    void push(BufferedFrame&& frame);
    const BufferedFrame* find_nearest(double target_time) const;
    std::vector<const BufferedFrame*> find_window(double center, double half_width) const;
    // Returns the first frame with sim_time strictly greater than after_time, or nullptr.
    const BufferedFrame* find_next_after(double after_time) const;
    // Returns all frames with sim_time strictly greater than after_time, in ascending order.
    std::vector<const BufferedFrame*> find_frames_after(double after_time) const;
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

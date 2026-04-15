#include "ring_buffer.h"

#include <algorithm>
#include <cmath>
#include <mutex>

namespace motionlab::engine {

SimulationRingBuffer::SimulationRingBuffer(double max_duration)
    : max_duration_(max_duration) {}

void SimulationRingBuffer::push(BufferedFrame&& frame) {
    std::unique_lock lock(mutex_);
    frames_.push_back(std::move(frame));

    // Evict oldest frames when duration exceeds max
    while (frames_.size() > 1 &&
           (frames_.back().sim_time - frames_.front().sim_time) > max_duration_) {
        frames_.pop_front();
    }
}

const BufferedFrame* SimulationRingBuffer::find_nearest(double target_time) const {
    std::shared_lock lock(mutex_);
    if (frames_.empty()) return nullptr;

    // Binary search for the first frame >= target_time
    auto it = std::lower_bound(
        frames_.begin(), frames_.end(), target_time,
        [](const BufferedFrame& f, double t) { return f.sim_time < t; });

    if (it == frames_.end()) {
        return &frames_.back();
    }
    if (it == frames_.begin()) {
        return &frames_.front();
    }

    // Compare with predecessor to find nearest
    auto prev = std::prev(it);
    if (std::abs(prev->sim_time - target_time) <= std::abs(it->sim_time - target_time)) {
        return &(*prev);
    }
    return &(*it);
}

std::vector<const BufferedFrame*> SimulationRingBuffer::find_window(
    double center, double half_width) const {
    std::shared_lock lock(mutex_);
    std::vector<const BufferedFrame*> result;
    if (frames_.empty()) return result;

    double lo = center - half_width;
    double hi = center + half_width;

    auto begin = std::lower_bound(
        frames_.begin(), frames_.end(), lo,
        [](const BufferedFrame& f, double t) { return f.sim_time < t; });

    for (auto it = begin; it != frames_.end() && it->sim_time <= hi; ++it) {
        result.push_back(&(*it));
    }
    return result;
}

const BufferedFrame* SimulationRingBuffer::find_next_after(double after_time) const {
    std::shared_lock lock(mutex_);
    if (frames_.empty()) return nullptr;

    auto it = std::upper_bound(
        frames_.begin(), frames_.end(), after_time,
        [](double t, const BufferedFrame& f) { return t < f.sim_time; });

    if (it == frames_.end()) return nullptr;
    return &(*it);
}

std::vector<const BufferedFrame*> SimulationRingBuffer::find_frames_after(double after_time) const {
    std::shared_lock lock(mutex_);
    std::vector<const BufferedFrame*> result;
    if (frames_.empty()) return result;

    auto it = std::upper_bound(
        frames_.begin(), frames_.end(), after_time,
        [](double t, const BufferedFrame& f) { return t < f.sim_time; });

    for (; it != frames_.end(); ++it) {
        result.push_back(&(*it));
    }
    return result;
}

void SimulationRingBuffer::clear() {
    std::unique_lock lock(mutex_);
    frames_.clear();
}

bool SimulationRingBuffer::empty() const {
    std::shared_lock lock(mutex_);
    return frames_.empty();
}

double SimulationRingBuffer::oldest_time() const {
    std::shared_lock lock(mutex_);
    return frames_.empty() ? 0.0 : frames_.front().sim_time;
}

double SimulationRingBuffer::newest_time() const {
    std::shared_lock lock(mutex_);
    return frames_.empty() ? 0.0 : frames_.back().sim_time;
}

size_t SimulationRingBuffer::size() const {
    std::shared_lock lock(mutex_);
    return frames_.size();
}

} // namespace motionlab::engine

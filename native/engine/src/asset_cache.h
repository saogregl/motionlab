#pragma once

#include <filesystem>
#include <optional>
#include <string>

namespace motionlab::engine {

class AssetCache {
public:
    explicit AssetCache(const std::filesystem::path& cache_dir);

    // Look up a cached result by key. Returns serialized proto bytes on hit.
    std::optional<std::string> lookup(const std::string& cache_key);

    // Store serialized proto bytes under the given key.
    void store(const std::string& cache_key, const std::string& serialized_result);

    // Compute a content-addressed cache key from file bytes + import parameters.
    std::string compute_cache_key(const std::string& file_path,
                                   double density, double tessellation_quality,
                                   const std::string& unit_system);

    // Remove a single cached entry by key.
    void remove(const std::string& cache_key);

    // Remove all cached entries.
    void clear();

    // Compute SHA-256 hash of a file's content (without import parameters).
    static std::string compute_file_hash(const std::string& file_path);

private:
    std::filesystem::path cache_dir_;

    std::filesystem::path key_to_path(const std::string& cache_key) const;
};

} // namespace motionlab::engine

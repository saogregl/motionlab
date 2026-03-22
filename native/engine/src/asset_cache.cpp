#include "asset_cache.h"

#include <fstream>
#include <iterator>
#include <sstream>
#include <vector>

#include <picosha2.h>

namespace motionlab::engine {

AssetCache::AssetCache(const std::filesystem::path& cache_dir)
    : cache_dir_(cache_dir) {
    std::filesystem::create_directories(cache_dir_);
}

std::filesystem::path AssetCache::key_to_path(const std::string& cache_key) const {
    return cache_dir_ / (cache_key + ".pb");
}

std::optional<std::string> AssetCache::lookup(const std::string& cache_key) {
    auto path = key_to_path(cache_key);
    std::ifstream f(path, std::ios::binary);
    if (!f.is_open()) return std::nullopt;

    std::string data(
        (std::istreambuf_iterator<char>(f)),
        std::istreambuf_iterator<char>());
    return data;
}

void AssetCache::store(const std::string& cache_key, const std::string& serialized_result) {
    auto path = key_to_path(cache_key);
    std::ofstream f(path, std::ios::binary | std::ios::trunc);
    if (f.is_open()) {
        f.write(serialized_result.data(),
                static_cast<std::streamsize>(serialized_result.size()));
    }
}

std::string AssetCache::compute_cache_key(const std::string& file_path,
                                          double density,
                                          double tessellation_quality,
                                          const std::string& unit_system) {
    std::ifstream f(file_path, std::ios::binary);
    if (!f.is_open()) return "";

    picosha2::hash256_one_by_one hasher;
    std::vector<char> buffer(64 * 1024);
    while (f.good()) {
        f.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
        std::streamsize count = f.gcount();
        if (count > 0) {
            hasher.process(reinterpret_cast<const unsigned char*>(buffer.data()),
                           reinterpret_cast<const unsigned char*>(buffer.data() + count));
        }
    }

    std::ostringstream params;
    params << "density=" << density
           << ";quality=" << tessellation_quality
           << ";units=" << unit_system;
    std::string param_str = params.str();
    hasher.process(reinterpret_cast<const unsigned char*>(param_str.data()),
                   reinterpret_cast<const unsigned char*>(param_str.data() + param_str.size()));
    hasher.finish();
    return picosha2::get_hash_hex_string(hasher);
}

void AssetCache::remove(const std::string& cache_key) {
    auto path = key_to_path(cache_key);
    std::filesystem::remove(path);
}

std::string AssetCache::compute_file_hash(const std::string& file_path) {
    std::ifstream f(file_path, std::ios::binary);
    if (!f.is_open()) return "";

    picosha2::hash256_one_by_one hasher;
    std::vector<char> buffer(64 * 1024);
    while (f.good()) {
        f.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
        std::streamsize count = f.gcount();
        if (count > 0) {
            hasher.process(reinterpret_cast<const unsigned char*>(buffer.data()),
                           reinterpret_cast<const unsigned char*>(buffer.data() + count));
        }
    }
    hasher.finish();
    return picosha2::get_hash_hex_string(hasher);
}

void AssetCache::clear() {
    if (std::filesystem::exists(cache_dir_)) {
        std::filesystem::remove_all(cache_dir_);
        std::filesystem::create_directories(cache_dir_);
    }
}

} // namespace motionlab::engine

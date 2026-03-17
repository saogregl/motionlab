#pragma once

#include <chrono>
#include <cstdint>
#include <iomanip>
#include <random>
#include <sstream>
#include <string>

namespace motionlab::engine {

// Header-only UUIDv7 generator.
// Layout: 48-bit ms timestamp | 4-bit version (7) | 12 random | 2-bit variant (10) | 62 random
inline std::string generate_uuidv7() {
    using namespace std::chrono;

    auto now = system_clock::now();
    uint64_t ms = static_cast<uint64_t>(
        duration_cast<milliseconds>(now.time_since_epoch()).count());

    thread_local std::mt19937_64 rng([] {
        std::random_device rd;
        return rd();
    }());

    uint64_t rand_a = rng();
    uint64_t rand_b = rng();

    uint8_t bytes[16];

    // Bytes 0-5: 48-bit timestamp, big-endian
    bytes[0] = static_cast<uint8_t>((ms >> 40) & 0xFF);
    bytes[1] = static_cast<uint8_t>((ms >> 32) & 0xFF);
    bytes[2] = static_cast<uint8_t>((ms >> 24) & 0xFF);
    bytes[3] = static_cast<uint8_t>((ms >> 16) & 0xFF);
    bytes[4] = static_cast<uint8_t>((ms >> 8) & 0xFF);
    bytes[5] = static_cast<uint8_t>(ms & 0xFF);

    // Byte 6: version nibble 0x7 in high 4 bits, 4 random bits in low
    bytes[6] = static_cast<uint8_t>(0x70 | (rand_a & 0x0F));

    // Byte 7: 8 random bits
    bytes[7] = static_cast<uint8_t>((rand_a >> 8) & 0xFF);

    // Byte 8: variant bits 10 in high 2 bits, 6 random bits in low
    bytes[8] = static_cast<uint8_t>(0x80 | ((rand_a >> 16) & 0x3F));

    // Bytes 9-15: 56 random bits
    bytes[9]  = static_cast<uint8_t>((rand_b >> 0) & 0xFF);
    bytes[10] = static_cast<uint8_t>((rand_b >> 8) & 0xFF);
    bytes[11] = static_cast<uint8_t>((rand_b >> 16) & 0xFF);
    bytes[12] = static_cast<uint8_t>((rand_b >> 24) & 0xFF);
    bytes[13] = static_cast<uint8_t>((rand_b >> 32) & 0xFF);
    bytes[14] = static_cast<uint8_t>((rand_b >> 40) & 0xFF);
    bytes[15] = static_cast<uint8_t>((rand_b >> 48) & 0xFF);

    // Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < 16; ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10) ss << '-';
        ss << std::setw(2) << static_cast<int>(bytes[i]);
    }
    return ss.str();
}

} // namespace motionlab::engine

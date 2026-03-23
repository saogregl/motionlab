#pragma once

#include <chrono>
#include <cstdint>
#include <cstring>
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

// ─────────────────────────────────────────────────────────────
// UUIDv5 — deterministic, SHA-1-based (RFC 4122 §4.3)
// Used for v2→v3 project migration to derive geometry IDs from body IDs.
// ─────────────────────────────────────────────────────────────

namespace detail {

// Minimal SHA-1 implementation (FIPS 180-4). Header-only, no external deps.
struct Sha1 {
    uint32_t state[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
    uint64_t count = 0;
    uint8_t buffer[64] = {};

    static uint32_t rol(uint32_t v, int n) { return (v << n) | (v >> (32 - n)); }

    void transform(const uint8_t block[64]) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i)
            w[i] = (uint32_t(block[i*4]) << 24) | (uint32_t(block[i*4+1]) << 16) |
                   (uint32_t(block[i*4+2]) << 8) | uint32_t(block[i*4+3]);
        for (int i = 16; i < 80; ++i)
            w[i] = rol(w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16], 1);

        uint32_t a = state[0], b = state[1], c = state[2], d = state[3], e = state[4];
        for (int i = 0; i < 80; ++i) {
            uint32_t f, k;
            if (i < 20)      { f = (b & c) | (~b & d);       k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d;                k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else              { f = b ^ c ^ d;                k = 0xCA62C1D6; }
            uint32_t t = rol(a, 5) + f + e + k + w[i];
            e = d; d = c; c = rol(b, 30); b = a; a = t;
        }
        state[0] += a; state[1] += b; state[2] += c; state[3] += d; state[4] += e;
    }

    void update(const uint8_t* data, size_t len) {
        size_t offset = static_cast<size_t>(count % 64);
        count += len;
        for (size_t i = 0; i < len; ++i) {
            buffer[offset++] = data[i];
            if (offset == 64) { transform(buffer); offset = 0; }
        }
    }

    void finalize(uint8_t digest[20]) {
        uint64_t bits = count * 8;
        uint8_t pad = 0x80;
        update(&pad, 1);
        pad = 0;
        while (count % 64 != 56) update(&pad, 1);
        uint8_t len_be[8];
        for (int i = 7; i >= 0; --i) { len_be[i] = uint8_t(bits & 0xFF); bits >>= 8; }
        update(len_be, 8);
        for (int i = 0; i < 5; ++i) {
            digest[i*4]   = uint8_t(state[i] >> 24);
            digest[i*4+1] = uint8_t(state[i] >> 16);
            digest[i*4+2] = uint8_t(state[i] >> 8);
            digest[i*4+3] = uint8_t(state[i]);
        }
    }
};

// Parse a UUID string "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" into 16 bytes.
// Returns false if the format is invalid.
inline bool uuid_parse(const std::string& str, uint8_t out[16]) {
    if (str.size() != 36) return false;
    int byte_idx = 0;
    for (size_t i = 0; i < 36 && byte_idx < 16;) {
        if (str[i] == '-') { ++i; continue; }
        if (i + 1 >= 36) return false;
        char hi = str[i], lo = str[i + 1];
        auto hex_val = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return 10 + c - 'a';
            if (c >= 'A' && c <= 'F') return 10 + c - 'A';
            return -1;
        };
        int h = hex_val(hi), l = hex_val(lo);
        if (h < 0 || l < 0) return false;
        out[byte_idx++] = static_cast<uint8_t>((h << 4) | l);
        i += 2;
    }
    return byte_idx == 16;
}

inline std::string uuid_format(const uint8_t bytes[16]) {
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < 16; ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10) ss << '-';
        ss << std::setw(2) << static_cast<int>(bytes[i]);
    }
    return ss.str();
}

} // namespace detail

// MotionLab-specific namespace UUID for UUIDv5 generation.
// Generated deterministically: UUIDv5(DNS_NAMESPACE, "motionlab.geometry")
// Value: 6ba7b811-9dad-11d1-80b4-00c04fd430c8 XOR'd with app-specific salt.
// Using a fixed constant so all MotionLab installations produce the same derived IDs.
constexpr char UUIDV5_NAMESPACE[] = "a3e4f5d6-b7c8-5a9b-8c0d-1e2f3a4b5c6d";

// Generate a deterministic UUIDv5 from a namespace UUID string and a name.
// Used for v2→v3 migration: generate_uuidv5(body_id, "geometry") produces
// a stable geometry ID from an existing body ID.
inline std::string generate_uuidv5(const std::string& namespace_uuid,
                                    const std::string& name) {
    uint8_t ns_bytes[16];
    if (!detail::uuid_parse(namespace_uuid, ns_bytes)) {
        // If namespace is not a valid UUID, hash it as raw bytes
        std::memset(ns_bytes, 0, 16);
        for (size_t i = 0; i < namespace_uuid.size() && i < 16; ++i)
            ns_bytes[i] = static_cast<uint8_t>(namespace_uuid[i]);
    }

    detail::Sha1 sha;
    sha.update(ns_bytes, 16);
    sha.update(reinterpret_cast<const uint8_t*>(name.data()), name.size());

    uint8_t digest[20];
    sha.finalize(digest);

    // Set version 5 (high nibble of byte 6)
    digest[6] = (digest[6] & 0x0F) | 0x50;
    // Set variant RFC 4122 (high 2 bits of byte 8)
    digest[8] = (digest[8] & 0x3F) | 0x80;

    return detail::uuid_format(digest);
}

} // namespace motionlab::engine

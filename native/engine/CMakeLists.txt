cmake_minimum_required(VERSION 3.25)
project(motionlab-engine
  VERSION 0.0.1
  LANGUAGES CXX
  DESCRIPTION "MotionLab native engine"
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ──────────────────────────────────────────────
# Dependencies via vcpkg
# ──────────────────────────────────────────────

# Protobuf — active now for protocol foundation
# find_package(Protobuf CONFIG REQUIRED)

# OCCT — deferred to Epic 3 (CAD Import)
# find_package(OpenCASCADE CONFIG REQUIRED)

# Chrono — deferred to Epic 7 (Simulation)
# find_package(Chrono CONFIG)

# ──────────────────────────────────────────────
# Engine executable
# ──────────────────────────────────────────────
add_executable(motionlab-engine
  src/main.cpp
)

target_include_directories(motionlab-engine PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# target_link_libraries(motionlab-engine PRIVATE
#   protobuf::libprotobuf
# )

# ──────────────────────────────────────────────
# Tests (placeholder)
# ──────────────────────────────────────────────
option(BUILD_TESTS "Build engine tests" ON)
if(BUILD_TESTS)
  enable_testing()
  add_executable(motionlab-engine-tests
    tests/test_main.cpp
  )
  target_include_directories(motionlab-engine-tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
  )
  add_test(NAME engine-tests COMMAND motionlab-engine-tests)
endif()

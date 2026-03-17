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

# WebSocket transport (Epic 1)
find_package(ixwebsocket CONFIG REQUIRED)

# Protobuf — binary protocol (Epic 2)
find_package(Protobuf CONFIG REQUIRED)

# OCCT — CAD import, tessellation, mass properties (Epic 3)
find_package(OpenCASCADE CONFIG REQUIRED)
set(OCCT_LIBS
  TKernel TKMath TKG2d TKG3d TKGeomBase TKBRep
  TKGeomAlgo TKTopAlgo TKShHealing
  TKDESTEP TKDEIGES TKDE TKXSBase
  TKXCAF TKLCAF TKCAF TKCDF
  TKMesh TKPrim
)

# picosha2 — header-only SHA-256
find_path(PICOSHA2_INCLUDE_DIR picosha2.h)

# ──────────────────────────────────────────────
# Chrono — rigid-body dynamics via FetchContent (Epic 7)
#
# Why FetchContent instead of vcpkg:
#   The vcpkg "chronoengine" port depends on TBB, which fails to build
#   under the x64-mingw-dynamic community triplet. FetchContent lets us
#   pull only the core ChronoEngine module with TBB disabled.
#
# Chrono version: 8.0.0 (tag "8.0.0" on GitHub)
# Modules: core only (no Irrlicht, vehicle, postprocess, GPU, etc.)
# ──────────────────────────────────────────────
include(FetchContent)

# Disable all optional Chrono modules — we only need core dynamics
set(ENABLE_MODULE_IRRLICHT OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_VEHICLE OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_POSTPROCESS OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_PARDISO_MKL OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MUMPS OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MULTICORE OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_GPU OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_FSI OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MATLAB OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_CASCADE OFF CACHE BOOL "" FORCE)
set(USE_EIGEN3_INC_FROM_VCPKG OFF CACHE BOOL "" FORCE)
set(ENABLE_TBB OFF CACHE BOOL "" FORCE)
set(BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING_CHRONO OFF CACHE BOOL "" FORCE)
set(BUILD_BENCHMARKING OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  chrono
  GIT_REPOSITORY https://github.com/projectchrono/chrono.git
  GIT_TAG        8.0.0
  GIT_SHALLOW    ON
  GIT_PROGRESS   ON
)
FetchContent_MakeAvailable(chrono)

# ──────────────────────────────────────────────
# Engine core library (shared between exe and tests)
# ──────────────────────────────────────────────
add_library(motionlab-engine-lib STATIC
  src/transport.cpp
  src/cad_import.cpp
  src/asset_cache.cpp
  src/simulation.cpp
  src/generated/protocol/transport.pb.cc
  src/generated/mechanism/mechanism.pb.cc
)

target_include_directories(motionlab-engine-lib PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/src/generated
  ${OpenCASCADE_INCLUDE_DIR}
  ${PICOSHA2_INCLUDE_DIR}
)

target_link_libraries(motionlab-engine-lib PUBLIC
  ixwebsocket::ixwebsocket
  protobuf::libprotobuf
  ${OCCT_LIBS}
  ChronoEngine
)

# Windows system libraries required by mbedtls (via ixwebsocket SSL)
if(WIN32)
  target_link_libraries(motionlab-engine-lib PUBLIC bcrypt)
endif()

# Suppress warnings in MSVC
if(MSVC)
  target_compile_options(motionlab-engine-lib PRIVATE /W4 /wd4267 /wd4244 /wd4996)
endif()

# ──────────────────────────────────────────────
# Engine executable
# ──────────────────────────────────────────────
add_executable(motionlab-engine
  src/main.cpp
)

target_link_libraries(motionlab-engine PRIVATE
  motionlab-engine-lib
)

# ──────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────
option(BUILD_TESTS "Build engine tests" ON)
if(BUILD_TESTS)
  enable_testing()
  add_executable(motionlab-engine-tests
    tests/test_main.cpp
  )
  target_link_libraries(motionlab-engine-tests PRIVATE
    motionlab-engine-lib
  )
  if(MSVC)
    target_compile_options(motionlab-engine-tests PRIVATE /W4 /wd4267 /wd4244 /wd4996)
  endif()
  add_test(NAME engine-tests COMMAND motionlab-engine-tests)

  # CAD import tests (separate exe — isolates OCCT from transport tests)
  add_executable(motionlab-cad-tests tests/test_cad_import.cpp)
  target_link_libraries(motionlab-cad-tests PRIVATE motionlab-engine-lib)
  if(MSVC)
    target_compile_options(motionlab-cad-tests PRIVATE /W4 /wd4267 /wd4244 /wd4996)
  endif()
  add_test(NAME cad-import-tests COMMAND motionlab-cad-tests)

  # Simulation tests (Chrono integration — isolated from transport/CAD)
  add_executable(motionlab-sim-tests tests/test_simulation.cpp)
  target_link_libraries(motionlab-sim-tests PRIVATE motionlab-engine-lib)
  if(MSVC)
    target_compile_options(motionlab-sim-tests PRIVATE /W4 /wd4267 /wd4244 /wd4996)
  endif()
  add_test(NAME simulation-tests COMMAND motionlab-sim-tests)
endif()

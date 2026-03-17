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

# Chrono — deferred to Epic 7 (Simulation)
# find_package(Chrono CONFIG)

# ──────────────────────────────────────────────
# Engine core library (shared between exe and tests)
# ──────────────────────────────────────────────
add_library(motionlab-engine-lib STATIC
  src/transport.cpp
  src/cad_import.cpp
  src/asset_cache.cpp
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
endif()

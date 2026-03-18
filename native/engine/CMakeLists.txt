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
#   The vcpkg "chronoengine" port is stuck at 8.0.0 and depends on TBB,
#   which fails to build under the x64-mingw-dynamic community triplet.
#   FetchContent lets us target 9.0.1 and pull only the core ChronoEngine
#   module with TBB and all optional modules disabled.
#
# Chrono version: 9.0.1 (tag "9.0.1" on GitHub)
# Modules: core only (no Irrlicht, vehicle, postprocess, GPU, etc.)
# ──────────────────────────────────────────────
include(FetchContent)

# Disable all optional Chrono modules — we only need core dynamics
set(ENABLE_MODULE_IRRLICHT OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_VSG OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_VEHICLE OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_POSTPROCESS OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_PARDISO_MKL OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MUMPS OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MULTICORE OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_GPU OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_FSI OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MATLAB OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_CASCADE OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_MODAL OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_SENSOR OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_SYNCHRONO OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_PARSERS OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_FMI OFF CACHE BOOL "" FORCE)
set(ENABLE_MODULE_ROS OFF CACHE BOOL "" FORCE)
set(USE_EIGEN3_INC_FROM_VCPKG ON CACHE BOOL "" FORCE)
set(ENABLE_TBB OFF CACHE BOOL "" FORCE)
set(BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING_CHRONO OFF CACHE BOOL "" FORCE)
set(BUILD_BENCHMARKING OFF CACHE BOOL "" FORCE)
# Build Chrono as static — avoids DLL linker flags bug with Ninja
# (generator expressions in SHARED_LINKER_FLAGS not evaluated for single-config)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  chrono
  GIT_REPOSITORY https://github.com/projectchrono/chrono.git
  GIT_TAG        9.0.1
  GIT_SHALLOW    ON
  GIT_PROGRESS   ON
)

# Chrono's CMakeLists.txt expects its cmake/ modules on CMAKE_MODULE_PATH
# (e.g. GetGitRevisionDescription). FetchContent doesn't set this up
# automatically, so we populate manually and add the path before
# add_subdirectory processes Chrono's build.
FetchContent_GetProperties(chrono)
if(NOT chrono_POPULATED)
  FetchContent_Populate(chrono)

  # Patch FindEigen3.cmake for Eigen 5.x compatibility.
  # Eigen 5 moved version macros from Eigen/src/Core/util/Macros.h to
  # Eigen/Version. Chrono 9.0.1's FindEigen3 only reads Macros.h, so the
  # version parses as ".." and fails. This patch adds a fallback read of
  # Eigen/Version when the macros are not found in Macros.h.
  # See: https://github.com/projectchrono/chrono/issues/619
  file(READ "${chrono_SOURCE_DIR}/cmake/FindEigen3.cmake" _find_eigen3)
  string(REPLACE
    "set(EIGEN3_VERSION \${EIGEN3_WORLD_VERSION}.\${EIGEN3_MAJOR_VERSION}.\${EIGEN3_MINOR_VERSION})"
    "if(NOT EIGEN3_WORLD_VERSION)\n    # Eigen 5.x moved version macros to Eigen/Version\n    if(EXISTS \"\${EIGEN3_INCLUDE_DIR}/Eigen/Version\")\n      file(READ \"\${EIGEN3_INCLUDE_DIR}/Eigen/Version\" _eigen3_version_header)\n      string(REGEX MATCH \"define[ \\\\t]+EIGEN_WORLD_VERSION[ \\\\t]+([0-9]+)\" _eigen3_world_version_match \"\${_eigen3_version_header}\")\n      set(EIGEN3_WORLD_VERSION \"\${CMAKE_MATCH_1}\")\n      string(REGEX MATCH \"define[ \\\\t]+EIGEN_MAJOR_VERSION[ \\\\t]+([0-9]+)\" _eigen3_major_version_match \"\${_eigen3_version_header}\")\n      set(EIGEN3_MAJOR_VERSION \"\${CMAKE_MATCH_1}\")\n      string(REGEX MATCH \"define[ \\\\t]+EIGEN_MINOR_VERSION[ \\\\t]+([0-9]+)\" _eigen3_minor_version_match \"\${_eigen3_version_header}\")\n      set(EIGEN3_MINOR_VERSION \"\${CMAKE_MATCH_1}\")\n    endif()\n  endif()\n  set(EIGEN3_VERSION \${EIGEN3_WORLD_VERSION}.\${EIGEN3_MAJOR_VERSION}.\${EIGEN3_MINOR_VERSION})"
    _find_eigen3 "${_find_eigen3}"
  )
  file(WRITE "${chrono_SOURCE_DIR}/cmake/FindEigen3.cmake" "${_find_eigen3}")

  # Chrono's CPack config references CMAKE_SOURCE_DIR for LICENSE/README
  # which points to our project root, not Chrono's. Provide stubs.
  set(CPACK_RESOURCE_FILE_LICENSE "${chrono_SOURCE_DIR}/LICENSE" CACHE STRING "" FORCE)
  set(CPACK_RESOURCE_FILE_README "${chrono_SOURCE_DIR}/README.md" CACHE STRING "" FORCE)

  list(APPEND CMAKE_MODULE_PATH "${chrono_SOURCE_DIR}/cmake")
  add_subdirectory(${chrono_SOURCE_DIR} ${chrono_BINARY_DIR} EXCLUDE_FROM_ALL)
endif()

# ──────────────────────────────────────────────
# Engine core library (shared between exe and tests)
# ──────────────────────────────────────────────
add_library(motionlab-engine-lib STATIC
  src/transport.cpp
  src/cad_import.cpp
  src/asset_cache.cpp
  src/mechanism_state.cpp
  src/simulation.cpp
  src/generated/protocol/transport.pb.cc
  src/generated/mechanism/mechanism.pb.cc
)

target_include_directories(motionlab-engine-lib PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/src/generated
  ${OpenCASCADE_INCLUDE_DIR}
  ${PICOSHA2_INCLUDE_DIR}
  # Chrono headers — add_subdirectory doesn't propagate these automatically
  ${chrono_SOURCE_DIR}/src
  ${chrono_BINARY_DIR}
  ${EIGEN3_INCLUDE_DIR}
)

target_link_libraries(motionlab-engine-lib PUBLIC
  ixwebsocket::ixwebsocket
  protobuf::libprotobuf
  ${OCCT_LIBS}
  ChronoEngine
)

# Chrono is built as a static lib (BUILD_SHARED_LIBS=OFF) but ChApi still
# expands to __declspec(dllimport) on Windows for consumers. Define
# CH_API_COMPILE so our code matches the static lib's symbol decoration.
target_compile_definitions(motionlab-engine-lib PUBLIC CH_API_COMPILE)

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

  # MechanismState unit tests (no server needed)
  add_executable(motionlab-mechanism-tests tests/test_mechanism_state.cpp)
  target_link_libraries(motionlab-mechanism-tests PRIVATE motionlab-engine-lib)
  if(MSVC)
    target_compile_options(motionlab-mechanism-tests PRIVATE /W4 /wd4267 /wd4244 /wd4996)
  endif()
  add_test(NAME mechanism-state-tests COMMAND motionlab-mechanism-tests)

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

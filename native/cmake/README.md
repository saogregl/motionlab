# Shared CMake Modules

This directory holds shared CMake find modules, helper functions, and toolchain fragments
used across native components.

Currently empty — modules will be added as native subsystems grow:
- `FindOCCT.cmake` — if custom OCCT detection is needed beyond vcpkg
- `FindChrono.cmake` — if custom Chrono detection is needed
- `Codegen.cmake` — protobuf codegen helpers

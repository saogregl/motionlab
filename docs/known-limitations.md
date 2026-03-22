# Known Limitations

Current limitations as of Epic 9 (MVP).

## Persistence
- B-Rep shape data is not serialized in project files — face-level datum creation requires the original CAD file to be available (or relocated via recovery dialog)
- No auto-save functionality
- No undo/redo for any operations

## Simulation
- Single simulation run at a time (no parallel runs)
- No constraint motors, force elements, or external forces
- No export of simulation results to CSV/file
- Divergence detection is basic (NaN check only)

## CAD Import
- Multi-body STEP assembly hierarchy is flattened (no sub-assembly grouping)
- Only STEP and IGES formats supported
- No CAD authoring or modification (import only)

## Desktop
- Single client connection only (one window)
- No auto-update mechanism
- No code signing (may trigger OS security warnings)
- macOS build not tested
- Cross-compilation not supported (build on target platform)

## UI
- No multi-select in the project tree
- No drag-and-drop for file import
- Keyboard shortcuts are not customizable

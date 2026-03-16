# Sensor Architecture

Sensors are first-class authored entities, not serialized Chrono objects.

## Durable Model

- Sensors mount to authored datums, not raw mesh picks.
- A sensor definition is product-facing and backend-agnostic.
- Sensor outputs are explicit channel descriptors.
- Recording, ROS publication, live viewing, and replay are policies over the same authored sensor entity.

## Boundary Rules

- Product model owns sensor intent.
- Backend adapters compile sensor intent into backend runtime objects.
- Frontend consumes normalized product/runtime channels, not backend buffers or backend classes.

## MVP Scope

The following capabilities are required for MVP (Epics 7-8):

- A single sensor type (e.g., joint-state sensor) that produces scalar/vector trace channels
- Sensors mount to datums and persist as authored entities in the project file
- Sensor outputs flow through the same channel model as body-state streams
- Frontend displays sensor traces in the chart surface during playback

The following are part of the long-term design but explicitly deferred past MVP:

- Multiple sensor data families (raster frames, point clouds, blob streams)
- Opt-in recording policies per sensor
- ROS2 publication from sensor outputs
- Complex sensor assemblies (e.g., one logical IMU compiling to multiple backend instances)
- Chunked summaries and explicit frame indexing for large sensor outputs

## Initial Model Direction

- durable product artifacts: `ProductDefinition`, `ModelDefinition`, `ScenarioDefinition`, `SimulationRunManifest`
- sensor artifacts: `SensorAssembly`, `SensorMount`, typed sensor configuration, typed output descriptors
- one logical IMU may compile into multiple backend sensor instances while remaining one authored entity

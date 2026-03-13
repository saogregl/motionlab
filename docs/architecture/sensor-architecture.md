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

## Initial Model Direction

- durable product artifacts: `ProductDefinition`, `ModelDefinition`, `ScenarioDefinition`, `SimulationRunManifest`
- sensor artifacts: `SensorAssembly`, `SensorMount`, typed sensor configuration, typed output descriptors
- one logical IMU may compile into multiple backend sensor instances while remaining one authored entity

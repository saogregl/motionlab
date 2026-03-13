# ADR-0002: Sensors Are First-Class Authored Entities

- Status: Accepted
- Date: 2026-03-13
- Decision makers: MotionLab maintainers

## Context

MotionLab needs a sensor architecture that can survive backend growth without turning product data into backend object dumps.

## Decision

Model sensors as first-class authored entities mounted to datums. Backend adapters compile sensor intent into backend runtime objects. Frontend and storage systems consume normalized product-level channels rather than backend-specific types.

## Consequences

- authored sensor semantics remain stable across backend changes
- one product entity may compile into multiple backend sensor instances
- docs, tests, and contracts must describe sensor behavior in product-facing terms

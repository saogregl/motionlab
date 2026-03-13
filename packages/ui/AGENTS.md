# UI Guide

`@motionlab/ui` owns reusable UI primitives and shared presentation utilities.

## Responsibilities

- composable UI primitives
- shared styling and tokens
- reusable utility helpers with no product-specific behavior

## Rules

- Do not add product domain logic here.
- Do not add protocol, runtime, or backend-specific assumptions here.
- Keep components reusable across app surfaces.
- If a component starts encoding MotionLab-specific behavior, move that behavior to a product-facing package.

## Required Checks

- `pnpm --filter @motionlab/ui typecheck`
- `pnpm --filter @motionlab/ui test`

Update the repo map or architecture docs if this package starts owning more than reusable UI concerns.

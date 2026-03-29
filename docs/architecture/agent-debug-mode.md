# Agent Debug Mode

## Purpose

Agent debug mode is a local-only inspection layer for MotionLab desktop sessions. It exists to make AI-assisted debugging reproducible without changing the engine wire contract or routing simulation data through Electron.

## Launch

- `pnpm debug:agent`

This starts the desktop app with:

- Electron CDP enabled on the configured debug port
- native engine trace logging enabled
- a per-session debug directory under Electron `userData`
- frontend protocol, console, and anomaly recording enabled

## Agent Surfaces

The renderer exposes a read-only `window.motionlabDebug` API for attached agents:

- `isEnabled()`
- `getSessionInfo()`
- `getSnapshot()`
- `exportBundle(reason?)`
- `onDebugEvent(callback)`

The app also writes a session manifest and structured artifact files into the debug session directory so agents can inspect runs after the fact.

## Bundle Contents

Bundle export is local and best-effort. A bundle includes:

- session metadata
- current debug snapshot
- supervisor log
- protocol transcript
- renderer console transcript
- anomaly transcript
- current project file when a saved project path is available
- a captured window screenshot

## Guardrails

- This debug surface is local tooling only. It is not part of the product-facing protocol.
- Electron remains a shell and artifact coordinator, not a simulation data relay.
- Live runtime streaming is captured in bounded rolling buffers to avoid unbounded session growth.

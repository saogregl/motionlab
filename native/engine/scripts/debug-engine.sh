#!/usr/bin/env bash
# Launch the native engine with debug/trace logging for development.
#
# Usage:
#   ./scripts/debug-engine.sh                    # build & run with trace logging
#   ./scripts/debug-engine.sh --asan             # build & run with ASAN + trace logging
#   ./scripts/debug-engine.sh --port 8080        # custom port (default: 9090)
#   ./scripts/debug-engine.sh --log-level debug  # override log level (default: trace)
#   ./scripts/debug-engine.sh --no-build         # skip build step
#
set -euo pipefail

cd "$(dirname "$0")/.."

PRESET="dev-linux"
PORT=9090
LOG_LEVEL=trace
TOKEN="debug"
BUILD=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --asan)       PRESET="dev-linux-asan"; shift ;;
        --port)       PORT="$2"; shift 2 ;;
        --log-level)  LOG_LEVEL="$2"; shift 2 ;;
        --token)      TOKEN="$2"; shift 2 ;;
        --no-build)   BUILD=false; shift ;;
        *)            echo "Unknown option: $1"; exit 1 ;;
    esac
done

if $BUILD; then
    echo "--- Building preset: $PRESET ---"
    cmake --preset "$PRESET"
    cmake --build "build/$PRESET"
fi

EXE="build/$PRESET/motionlab-engine"
if [[ ! -x "$EXE" ]]; then
    echo "Error: $EXE not found. Run without --no-build first."
    exit 1
fi

echo "--- Running engine (port=$PORT, log-level=$LOG_LEVEL, preset=$PRESET) ---"
exec "$EXE" --port "$PORT" --session-token "$TOKEN" --log-level "$LOG_LEVEL"

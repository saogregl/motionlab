#!/usr/bin/env bash
set -euo pipefail

# MotionLab bootstrap script
# Sets up the full development environment from a fresh clone.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════╗"
echo "║     MotionLab Bootstrap              ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Check prerequisites ───────────────────────────────

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "❌ $1 is not installed. $2"
    return 1
  else
    echo "✅ $1 found: $("$1" --version 2>/dev/null | head -1)"
  fi
}

echo "Checking prerequisites..."
echo ""
check_command node "Install Node.js >= 20"
check_command pnpm "Install pnpm: corepack enable && corepack prepare pnpm@latest --activate"
check_command cmake "Install cmake >= 3.25"
check_command g++ "Install a C++ compiler (gcc/g++ or clang)"
check_command git "Install git"

# Ninja is optional but preferred
if command -v ninja &> /dev/null; then
  echo "✅ ninja found: $(ninja --version)"
elif command -v ninja-build &> /dev/null; then
  echo "✅ ninja-build found"
else
  echo "⚠️  ninja not found — CMake will use default generator (slower builds)"
  echo "   Install: sudo apt install ninja-build"
fi

echo ""

# ─── Node.js dependencies ──────────────────────────────

echo "📦 Installing Node.js dependencies..."
cd "$ROOT_DIR"
pnpm install

echo ""

# ─── vcpkg environment check ───────────────────────────

if [ -z "${VCPKG_ROOT:-}" ]; then
  echo "❌ VCPKG_ROOT is not set"
  echo "   Set it to your vcpkg installation, for example:"
  echo "   export VCPKG_ROOT=/opt/vcpkg"
  exit 1
fi

if [ ! -f "$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" ]; then
  echo "❌ VCPKG_ROOT does not point to a valid vcpkg installation: $VCPKG_ROOT"
  echo "   Expected file: $VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
  echo "   Example: export VCPKG_ROOT=/opt/vcpkg"
  exit 1
fi

echo "✅ vcpkg found at: $VCPKG_ROOT"
echo ""

# ─── Native engine configure ───────────────────────────

ENGINE_DIR="$ROOT_DIR/native/engine"

echo "🔨 Configuring native engine..."
cd "$ENGINE_DIR"

cmake --preset dev

echo ""

# ─── Build native engine ───────────────────────────────

echo "🏗️  Building native engine..."
cmake --build build/dev --parallel

echo ""

# ─── TypeScript build ──────────────────────────────────

echo "📝 Building TypeScript packages..."
cd "$ROOT_DIR"
pnpm turbo build

echo ""

# ─── Summary ───────────────────────────────────────────

echo "╔══════════════════════════════════════╗"
echo "║     Bootstrap complete!              ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Commands:"
echo "  pnpm dev:web          — Start web frontend dev server"
echo "  pnpm dev:desktop      — Start Electron desktop app"
echo "  pnpm build            — Build all TypeScript packages"
echo "  pnpm lint             — Lint all packages"
echo "  pnpm typecheck        — Type-check all packages"
echo ""
echo "Native engine:"
echo "  cd native/engine"
echo "  cmake --preset dev          — Configure (debug)"
echo "  cmake --build build/dev     — Build"
echo "  ctest --preset dev          — Run tests"
echo "  ./build/dev/motionlab-engine  — Run engine"
echo ""

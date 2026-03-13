# Scripts

## bootstrap.sh

Full environment setup from a fresh clone:

```bash
bash scripts/bootstrap.sh
```

This will:
1. Check prerequisites (node, pnpm, cmake, g++, git, ninja)
2. Install Node.js dependencies via pnpm
3. Initialize and bootstrap vcpkg submodule
4. Configure the native engine with CMake
5. Build the native engine
6. Build all TypeScript packages

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- CMake >= 3.25
- C++ compiler (g++ or clang)
- Git
- ninja (optional but recommended: `sudo apt install ninja-build`)

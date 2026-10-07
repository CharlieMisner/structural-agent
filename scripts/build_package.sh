#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "======================================================"
echo " 🏗️  Building Statikor (Nuitka C++ Sidecar + Tauri)   "
echo "======================================================"

cd "$ROOT_DIR"

# 1. Determine Rust Host Target Triple
TARGET_TRIPLE=$(rustc -vV | sed -n 's|host: ||p')
echo "🎯 Host Target Triple: ${TARGET_TRIPLE}"

# 2. Determine Python interpreter for sidecar
PYTHON_BIN=""
if [ -f "$ROOT_DIR/sidecar/.venv/bin/python" ]; then
    PYTHON_BIN="$ROOT_DIR/sidecar/.venv/bin/python"
elif [ -f "$ROOT_DIR/server/.venv/bin/python" ]; then
    PYTHON_BIN="$ROOT_DIR/server/.venv/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON_BIN="python3"
else
    echo "❌ Error: Python 3 not found."
    exit 1
fi

echo "🐍 Using Python: $("$PYTHON_BIN" --version) at ${PYTHON_BIN}"

# 3. Ensure Nuitka is installed
if ! "$PYTHON_BIN" -m nuitka --version &> /dev/null; then
    echo "📦 Installing Nuitka & zstandard into Python environment..."
    "$PYTHON_BIN" -m pip install "nuitka>=2.5.0" "zstandard>=0.23.0"
fi

# 4. Compile Sidecar via Nuitka (Python -> C++ Machine Code)
echo "⚡ Compiling Python sidecar to native C++ binary with Nuitka..."
cd "$ROOT_DIR/sidecar"

"$PYTHON_BIN" -m nuitka \
    --standalone \
    --onefile \
    --assume-yes-for-downloads \
    --remove-output \
    --output-dir=dist \
    --output-filename=statikor-sidecar \
    src/sidecar/sidecar.py

# 5. Place binary into Tauri's externalBin directory with target triple
BINARIES_DIR="$ROOT_DIR/client/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

COMPILED_BIN="$ROOT_DIR/sidecar/dist/statikor-sidecar"
if [ -f "${COMPILED_BIN}.exe" ]; then
    COMPILED_BIN="${COMPILED_BIN}.exe"
    TARGET_BIN="${BINARIES_DIR}/statikor-sidecar-${TARGET_TRIPLE}.exe"
    PLAIN_BIN="${BINARIES_DIR}/statikor-sidecar.exe"
else
    TARGET_BIN="${BINARIES_DIR}/statikor-sidecar-${TARGET_TRIPLE}"
    PLAIN_BIN="${BINARIES_DIR}/statikor-sidecar"
fi

echo "📋 Copying compiled sidecar binary to Tauri binaries directory..."
cp -f "$COMPILED_BIN" "$TARGET_BIN"
cp -f "$COMPILED_BIN" "$PLAIN_BIN"
chmod +x "$TARGET_BIN" "$PLAIN_BIN"

echo "✅ Sidecar native binary ready: ${TARGET_BIN}"

# 6. Build Tauri Desktop Bundle
echo "🚀 Building Tauri Desktop Application..."
cd "$ROOT_DIR/client"
npm run tauri build

echo "======================================================"
echo " 🎉 Statikor Production Build Complete!              "
echo " 📦 App Bundle: client/target/release/bundle/macos/Statikor.app"
echo "======================================================"

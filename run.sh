#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "    SerialAudio Engine — Algorithmic Workstation  "
echo "=================================================="

# 1. Python Environment Check
PYTHON_BIN=""
if [ -d "engine-py/.venv" ]; then
    PYTHON_BIN="engine-py/.venv/bin/python"
    PIP_BIN="engine-py/.venv/bin/pip"
elif command -v python3.11 &> /dev/null; then
    echo "[+] Creating virtualenv with python3.11..."
    python3.11 -m venv engine-py/.venv
    PYTHON_BIN="engine-py/.venv/bin/python"
    PIP_BIN="engine-py/.venv/bin/pip"
    echo "[+] Installing engine requirements..."
    $PIP_BIN install -r engine-py/requirements.txt
else
    echo "[+] Using system python3 to create virtualenv..."
    python3 -m venv engine-py/.venv
    PYTHON_BIN="engine-py/.venv/bin/python"
    PIP_BIN="engine-py/.venv/bin/pip"
    echo "[+] Installing engine requirements..."
    $PIP_BIN install -r engine-py/requirements.txt
fi

# 2. UI Dependencies Check
if [ ! -d "src-ui/node_modules" ]; then
    echo "[+] Installing frontend node modules..."
    npm --prefix src-ui install
fi

# 3. Argument Handling
MODE="${1:-dev}"

if [ "$MODE" = "test" ]; then
    echo "[+] Running complete test suite..."
    PYTHONPATH=engine-py $PYTHON_BIN -m pytest engine-py/tests/ -v
    echo "[+] Testing frontend build..."
    npm --prefix src-ui run build
    echo "=================================================="
    echo "    All tests and build verifications PASSED!     "
    echo "=================================================="
    exit 0
fi

if [ "$MODE" = "build" ]; then
    echo "[+] Building frontend bundle..."
    npm --prefix src-ui run build
    echo "[+] Build complete: src-ui/dist"
    exit 0
fi

if [ "$MODE" = "tauri" ]; then
    echo "[+] Launching Python backend daemon..."
    PYTHONPATH=engine-py $PYTHON_BIN engine-py/main.py &
    BACKEND_PID=$!
    trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
    sleep 1

    echo "[+] Launching Tauri desktop shell..."
    cd src-ui && npx @tauri-apps/cli dev
    exit 0
fi

# Default: Dev mode (Starts Python backend + Vite web UI)
echo "[+] Starting Python DSP Service on http://127.0.0.1:8000..."
PYTHONPATH=engine-py $PYTHON_BIN engine-py/main.py &
BACKEND_PID=$!
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

sleep 1.5

echo "[+] Starting React UI Dev Server on http://localhost:5173..."
npm --prefix src-ui run dev

#!/bin/bash
# Appkium Inspector - macOS/Linux 개발 환경 셋업
# 사용: ./setup_dev.sh   (Windows는 build_all.bat 사용)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Appkium Inspector - development environment"
echo "==========================================="

# --- Python ---
PY=""
for cand in python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
    echo "ERROR: python3 not found. Install Python 3.10+ first."
    exit 1
fi
echo "python: $PY ($($PY --version))"

if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    echo "creating .venv ..."
    "$PY" -m venv "$SCRIPT_DIR/.venv"
fi

# shellcheck disable=SC1091
source "$SCRIPT_DIR/.venv/bin/activate"

if ! python -c "import fastapi" >/dev/null 2>&1; then
    echo "installing python packages ..."
    pip install --upgrade pip
    pip install -r "$SCRIPT_DIR/requirements.txt"
fi

# --- Node ---
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found. Install Node.js 18+ first."
    exit 1
fi
echo "node: $(node -v)"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "installing node packages ..."
    npm install
fi

# --- ADB ---
if command -v adb >/dev/null 2>&1; then
    echo "adb: $(adb version | head -1)"
else
    echo "WARN: adb not found on PATH."
    echo "      brew install --cask android-platform-tools"
    echo "      또는 앱 내 Select ADB / 환경 설정 마법사에서 지정"
fi

echo ""
echo "ready. (venv active in this shell)"
echo ""
echo "  npm run dev           backend + renderer + electron"
echo "  npm run dev:py        backend only"
echo "  npm run dev:renderer  renderer only"
echo "  npm run build         production bundle"
echo "  npm run dist:mac      macOS dmg  (docs/MACOS_PORT_GUIDE.md 참조)"
echo ""
echo "venv 해제: deactivate"

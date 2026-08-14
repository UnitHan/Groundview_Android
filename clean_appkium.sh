#!/bin/bash
# Appkium Inspector - macOS/Linux 전체 데이터 삭제
# Windows 대응: clean_groundview.ps1
#
# 주의: 설정, API 키, 캐시, 로그를 영구 삭제한다. 되돌릴 수 없다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================="
echo "Appkium Inspector - complete cleanup"
echo "==================================="
echo ""
echo "삭제 대상:"
echo "  - 앱 설정 및 Gemini API 키"
echo "  - 캐시 / 임시 파일"
echo "  - 로그"
echo "  - PaddleOCR 모델 캐시"
echo "  - 개발용 user-data 폴더"
echo ""
echo "구 제품명(GroundView) 폴더도 함께 삭제한다."
echo ""
read -r -p "정말 진행할까요? (y/N): " confirmation

if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
    echo "취소됨."
    exit 0
fi

remove_if_exists() {
    if [ -e "$1" ]; then
        rm -rf "$1"
        echo "   deleted: $1"
    else
        echo "   not found: $1"
    fi
}

if [[ "$(uname)" == "Darwin" ]]; then
    APP_SUPPORT="$HOME/Library/Application Support"
    CACHES="$HOME/Library/Caches"
    LOGS="$HOME/Library/Logs"
else
    APP_SUPPORT="${XDG_CONFIG_HOME:-$HOME/.config}"
    CACHES="${XDG_CACHE_HOME:-$HOME/.cache}"
    LOGS="$HOME/.local/state"
fi

echo ""
echo "[1/4] application support"
remove_if_exists "$APP_SUPPORT/Appkium Inspector"
remove_if_exists "$APP_SUPPORT/GroundView"

echo ""
echo "[2/4] caches / logs"
remove_if_exists "$CACHES/Appkium Inspector"
remove_if_exists "$CACHES/GroundView"
remove_if_exists "$LOGS/Appkium Inspector"
remove_if_exists "$LOGS/GroundView"

echo ""
echo "[3/4] PaddleOCR cache"
remove_if_exists "$HOME/.paddleocr"

echo ""
echo "[4/4] development user-data"
remove_if_exists "$SCRIPT_DIR/user-data"

echo ""
echo "==================================="
echo "cleanup 완료."
echo "==================================="

# iOS GroundView Setup Instructions

> **기록 안내 (2026-11-09):** 과거 iOS 이식 작업 기록입니다. 현재 공용 데스크톱 앱 실행 방법은 [루트 README](../README.md)를 따르세요. 아래 복사 완료 표시는 제품 기능의 통합 검증 완료를 의미하지 않습니다.

## ✅ 복사 완료된 파일

### 백엔드 (Python)
- ✅ `ios/backend/settings_manager.py` - API Key 암호화 저장
- ✅ `ios/backend/server.py` - FastAPI 서버 (포트 5005)
- ✅ `ios/backend/webview_ocr.py` - Gemini OCR
- ✅ `ios/backend/requirements.txt` - Python 의존성

### 로케이터 로직 (TypeScript)
- ✅ `ios/core/src/locator.ts` - 플랫폼 독립적 로케이터 생성
- ✅ `ios/core/src/types.ts` - 타입 정의
- ✅ `ios/core/src/ports.ts` - 포트 설정

### 문서
- ✅ `ios/README.md` - 빠른 시작 가이드
- ✅ `/docs/iOS_MIGRATION_GUIDE.md` - 전체 이식 가이드

## 🚀 macOS에서 시작하기

### 1. Git으로 가져오기 (추천)
```bash
# Windows에서 Git commit & push
cd /path/to/Groundview
git add ios/
git commit -m "Add iOS cross-platform code"
git push

# macOS에서 Git pull
git pull origin main
```

### 2. 또는 파일 직접 복사
```bash
# Windows에서 iOS 폴더 압축
cd C:\Groundview
tar -czf ios.tar.gz ios/

# macOS로 전송 (예: scp, Dropbox, USB 등)
# macOS에서 압축 해제
tar -xzf ios.tar.gz
```

### 3. Python 환경 설정 (macOS)
```bash
cd ios/backend

# Python 3.10 설치
brew install python@3.10

# 가상환경 생성
python3.10 -m venv .venv

# 가상환경 활성화
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 4. 서버 실행
```bash
# 환경변수 설정 (선택)
export MODEL_PORT=5005

# 서버 실행
python server.py
```

### 5. 테스트
```bash
# Health check
curl http://localhost:5005/healthz

# API Key 설정
curl -X POST http://localhost:5005/api/settings/gemini-key \
  -H "Content-Type: application/json" \
  -d '{"key": "your-gemini-api-key-here"}'

# Gemini LLM 테스트
curl -X POST http://localhost:5005/api/locator/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "node": {
      "text": "로그인",
      "contentDesc": null,
      "resourceId": "login_button",
      "cls": "XCUIElementTypeButton",
      "clickable": true
    }
  }'
```

## 📝 다음 단계

### iOS 앱 개발
1. XCTest 프로젝트 설정
2. HTTP Client 구현 (Alamofire 등)
3. SettingsManager Swift 구현
4. UI 컴포넌트 작성 (SwiftUI)

자세한 내용은 `/docs/iOS_MIGRATION_GUIDE.md` 참고

## 🔗 관련 파일

### Android 원본 (참고용)
- `backend/settings_manager.py` - Windows 버전
- `backend/server.py` - Windows 버전
- `core/src/locator.ts` - Android 로케이터 로직
- `desktop/src/renderer/components/CodeModal.tsx` - UI 참고

### iOS 복사본 (사용)
- `ios/backend/` - macOS 백엔드
- `ios/core/src/` - 크로스 플랫폼 로케이터 로직
- `ios/README.md` - 빠른 시작
- `/docs/iOS_MIGRATION_GUIDE.md` - 전체 가이드

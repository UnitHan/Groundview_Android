# iOS GroundView - Cross-Platform Code

macOS/iOS 버전용 크로스 플랫폼 코드입니다.

## 📁 구조

```
ios/
├── backend/               # Python FastAPI 백엔드 (macOS에서 실행)
│   ├── server.py         # FastAPI 서버 (포트 5005)
│   ├── settings_manager.py  # API Key 암호화 저장
│   ├── webview_ocr.py    # Gemini OCR
│   └── requirements.txt  # Python 의존성
├── core/src/             # TypeScript 로케이터 생성 로직
│   ├── locator.ts        # 플랫폼 독립적 로케이터 생성
│   ├── types.ts          # 타입 정의
│   └── ports.ts          # 포트 설정
└── src/                  # iOS 전용 TypeScript
    └── wdaService.ts     # WebDriverAgent 서비스
```

## 🚀 빠른 시작 (macOS)

### 1. Python 환경 설정

```bash
# Python 3.10 설치 (Homebrew 사용)
brew install python@3.10

# 가상환경 생성
cd ios/backend
python3.10 -m venv .venv

# 가상환경 활성화
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 2. 백엔드 서버 실행

```bash
# 환경변수 설정 (선택)
export MODEL_PORT=5005

# 서버 실행
python server.py
```

서버가 `http://127.0.0.1:5005`에서 실행됩니다.

### 3. API 엔드포인트

#### 🔐 API Key 관리
```bash
# API Key 저장 (암호화)
curl -X POST http://localhost:5005/api/settings/gemini-key \
  -H "Content-Type: application/json" \
  -d '{"key": "your-gemini-api-key-here"}'

# API Key 확인
curl http://localhost:5005/api/settings/gemini-key
```

#### 🤖 Gemini LLM 로케이터 제안
```bash
curl -X POST http://localhost:5005/api/locator/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "node": {
      "text": "로그인",
      "contentDesc": null,
      "resourceId": "login_button",
      "cls": "XCUIElementTypeButton",
      "bounds": "[0,100][375,150]",
      "clickable": true,
      "index": 0
    },
    "screenshot": "/path/to/screenshot.png",
    "bounds": [0, 100, 375, 150]
  }'
```

#### 🔍 Gemini OCR
```bash
curl -X POST http://localhost:5005/gemini_ocr \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/path/to/screenshot.png",
    "language": "ko",
    "detail": "high"
  }'
```

## 🔧 설정

### 환경변수

```bash
# 설정 디렉토리 (기본: ~/Library/Application Support/GroundView)
export GROUNDVIEW_SETTINGS_DIR="/custom/path"

# 백엔드 포트 (기본: 5005)
export MODEL_PORT=5005
```

### 설정 파일 위치

- **macOS**: `~/Library/Application Support/GroundView/settings.json`
- **개발 모드**: `./user-data/settings.json`

## 📝 주요 기능

### 1. API Key 암호화 저장
- PBKDF2-HMAC-SHA256 키 유도 (100,000 iterations)
- Fernet 대칭 암호화
- 머신 ID 기반 암호화 키

### 2. Gemini LLM 로케이터 제안
- 초보자 친화적 프롬프트 (350줄)
- index 사용 금지 (recommended/alternatives에서 제외)
- 동적 ID/텍스트 자동 감지
- tier 기반 점수 평가 (75+ = recommended)

### 3. 자동 로케이터 생성
- Android/iOS 모두 지원
- evaluateScore() 함수로 점수 평가
- index 사용 시 자동 fallback (score 35 이하)

### 4. Gemini OCR
- Vision API 기반 OCR
- 다국어 지원
- 상세 분석 모드

## 🔄 Android → iOS 매핑

| Android | iOS |
|---------|-----|
| `content-desc` | `accessibilityIdentifier` / `accessibilityLabel` |
| `resource-id` | `accessibilityIdentifier` |
| `text` | `label` / `value` |
| `ANDROID_UIAUTOMATOR` | `IOS_PREDICATE` / `IOS_CLASS_CHAIN` |
| `new UiSelector()` | `NSPredicate` |

## 📚 추가 문서

자세한 이식 가이드는 `/docs/iOS_MIGRATION_GUIDE.md`를 참고하세요.

## 🐛 문제 해결

### Port 5005 already in use
```bash
# 프로세스 확인
lsof -i :5005

# 프로세스 종료
kill -9 <PID>
```

### Python 가상환경 문제
```bash
# 가상환경 삭제 후 재생성
rm -rf .venv
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### API Key 복호화 실패
```bash
# 설정 파일 삭제 후 재설정
rm ~/Library/Application\ Support/GroundView/settings.json

# API Key 다시 저장
curl -X POST http://localhost:5005/api/settings/gemini-key \
  -H "Content-Type: application/json" \
  -d '{"key": "your-key"}'
```

## 🔗 관련 링크

- [iOS Migration Guide](../docs/iOS_MIGRATION_GUIDE.md) - 전체 이식 가이드
- [Backend README](backend/README.md) - 백엔드 상세 문서 (예정)
- [Core Locator README](core/README.md) - 로케이터 로직 문서


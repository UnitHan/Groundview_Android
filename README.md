# 🔍 GroundView

> **AI 기반 모바일 테스트 자동화 도우미**  
> Appium 테스트를 위한 스마트 로케이터 생성, 오프라인 분석, Gemini AI 연동

[![Version](https://img.shields.io/badge/version-0.0.5-blue.svg)](https://github.com/UnitHan/Groundview_Android)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](https://github.com/UnitHan/Groundview_Android)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-18.0%2B-green.svg)](https://nodejs.org/)

---

## 📖 개요

**GroundView**는 모바일 테스트 자동화 엔지니어가 안정적인 Appium 로케이터를 AI 도움으로 생성할 수 있도록 지원하는 데스크탑 애플리케이션입니다.

- 🤖 **AI 로케이터 제안** — Gemini AI가 UI 컨텍스트를 분석해 최적 로케이터 추천
- 💾 **오프라인 분석** — 캡처를 ZIP으로 저장해 디바이스 없이 어디서든 분석
- 🎯 **스마트 스코어링** — 로케이터 안정성·유지보수성 평가
- 📝 **즉시 사용 가능한 코드** — WebDriverWait 패턴의 Python/Java 코드 자동 생성
- 🔄 **듀얼 뷰** — Tree/List 뷰 동기화 하이라이팅
- 🧩 **Compose 앱 지원** — GroundView Service APK(접근성 서비스)로 Jetpack Compose 내부 요소 탐지

---

## ✨ 주요 기능

### 🎨 UI 캡처 & 분석
- Android 디바이스에서 **스크린샷 + XML 계층 구조** 캡처 (USB / 무선 ADB 모두 지원)
- **GroundView Service APK** 자동 설치 — Jetpack Compose 앱 내부 요소 접근성 트리 노출
- 클릭 가능한 요소 하이라이팅이 있는 **인터랙티브 오버레이**
- 쉬운 탐색을 위한 **Tree/List 듀얼 뷰**

### 🤖 AI 연동
- 컨텍스트 인식 로케이터 생성을 위한 **Gemini Vision API**
- 스크린샷에서 텍스트/표를 추출하는 **OCR 기능**
- 실행 가능성 검사 및 모범 사례가 포함된 **스마트 코드 생성**

### 📊 로케이터 인텔리전스
- 안정성, 고유성, 유지보수성을 평가하는 **스코어링 시스템**
- **다양한 전략**: AccessibilityID, ResourceID, Text, XPath, UiSelector
- 현대적 문법(AppiumBy, WebDriverWait)의 **Appium 2.x 최적화**

### 💼 워크플로우 향상
- **ZIP 내보내기/가져오기** — 팀원과 캡처 공유
- **오프라인 모드** — 디바이스 없이 캡처 분석
- Appium 1.x 및 2.x 모두를 위한 **즉시 복사 가능한 코드 스니펫**

---

## 🚀 빠른 시작

### 사전 요구사항

- **Python 3.10.11+** ([다운로드](https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe))
  - ⚠️ 설치 시 "Add Python to PATH" 체크
- **Node.js 18.0+** (개발 모드 전용)
- **ADB** (Android 디바이스 연결용)

### 설치

```bash
# 1. 저장소 클론
git clone https://github.com/UnitHan/Groundview_Android.git
cd Groundview_Android

# 2. 의존성 설치
npm install
pip install -r requirements.txt

# 3. 개발 서버 실행
npm run dev
```

### 사용 방법

1. **ADB 선택** — 경로 자동 감지 또는 수동 선택
2. **디바이스 연결** — USB 또는 무선 ADB (USB 디버깅 활성화 필요)
3. **캡처** — 스크린샷 + UI 계층 구조 캡처
   - 최초 실행 시 GroundView Service APK 자동 설치
   - 폰에서 접근성 권한 1회 활성화 (설정 → 접근성 → GroundView Service)
4. **요소 클릭** — 로케이터 확인 및 생성
5. **코드 복사** — 테스트 스크립트에 바로 사용
6. **ZIP 저장** — 오프라인 분석용 저장

---

## 🧩 GroundView Service (Compose 앱 지원)

Jetpack Compose 기반 앱은 기존 `uiautomator dump`로 내부 요소가 노출되지 않습니다.  
**GroundView Service**는 Android 접근성 서비스 APK로, Compose 내부 노드까지 접근성 트리를 HTTP API로 제공합니다.

```
[AccessibilityService]
  ├─ FLAG_INCLUDE_NOT_IMPORTANT_VIEWS (Compose 내부 노드 포함)
  ├─ FLAG_RETRIEVE_INTERACTIVE_WINDOWS (다중 윈도우)
  └─ NanoHTTPD HTTP 서버 (port 9800)
       ├─ GET /status  → {"ready":true}
       └─ GET /source  → uiautomator dump 호환 XML
```

**자동 설치 흐름:**
1. Capture 버튼 클릭 → APK 자동 설치
2. 폰에서 접근성 권한 1회 활성화
3. 이후 자동으로 Compose 요소 포함 캡처

**수동 설치:**
```bash
adb install -r resources/groundview-service.apk
adb forward tcp:9800 tcp:9800
```

---

## 🛠️ 빌드 & 패키징

```bash
# 프론트엔드 빌드
npm run build

# 인스톨러 생성 (Windows: NSIS, macOS: DMG)
npm run dist
```

---

## 🏗️ 아키텍처

```
GroundView/
├── app/                    # Electron 메인 프로세스
│   └── services/
│       ├── adbService.js   # ADB + GroundView Service 연동
│       └── wdaService.js   # iOS WDA 연동
├── desktop/                # React 프론트엔드 (Vite)
├── backend/                # FastAPI Python 백엔드
├── core/                   # 공유 TypeScript 로직 (로케이터 생성)
├── groundview-service/     # Android 접근성 서비스 APK 소스
└── resources/              # 배포용 리소스 (APK 등)
```

**기술 스택:**
- **프론트엔드**: React 18, TypeScript, Vite
- **데스크탑**: Electron 28
- **백엔드**: Python 3.10, FastAPI, Uvicorn
- **AI**: Google Gemini API
- **Android 서비스**: Kotlin, AccessibilityService, NanoHTTPD

---

## 🆚 GroundView vs Appium Inspector

| 기능 | GroundView | Appium Inspector |
|------|-----------|------------------|
| **오프라인 분석** | ✅ ZIP 내보내기/가져오기 | ❌ |
| **AI 로케이터 제안** | ✅ Gemini 연동 | ❌ |
| **AI OCR** | ✅ 텍스트/표 추출 | ❌ |
| **Compose 앱 지원** | ✅ 접근성 서비스 APK | ❌ |
| **로케이터 스코어링** | ✅ 안정성 지표 | 🟡 기본 |
| **코드 자동 생성** | ✅ Python/Java + WebDriverWait | 🟡 복사만 |
| **Appium 2.x 최적화** | ✅ 현대적 문법 | 🟡 레거시 중심 |
| **실시간 인터랙션** | ❌ | ✅ 클릭/탭 테스트 |
| **iOS 지원** | 🟡 개발 중 | ✅ 완전 지원 |

---

## 🎯 로드맵

- [x] Jetpack Compose 앱 접근성 서비스 지원
- [x] 무선 ADB 연결 지원
- [x] Gemini OCR 연동
- [x] ZIP 내보내기/가져오기
- [ ] iOS/WDA 완전 지원
- [ ] 하이브리드 모드 (OCR + XML bounds 매핑)
- [ ] CLI 모드
- [ ] PaddleOCR UI 연동

---

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다 — 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 🙏 감사의 말

- [Appium](https://appium.io/) — 모바일 자동화 프레임워크
- [Google Gemini](https://ai.google.dev/) — AI 기반 분석
- [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd) — Android 경량 HTTP 서버
- [Electron](https://www.electronjs.org/) — 크로스 플랫폼 데스크탑 앱

---

<div align="center">
  <sub>QA 엔지니어를 위해 ❤️로 만들었습니다</sub>
</div>

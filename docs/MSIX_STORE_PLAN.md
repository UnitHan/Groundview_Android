# GroundView — Windows Store (MSIX) 배포 계획서

> **기록 안내 (2026-11-09):** 2026년 4월 작성된 배포 계획의 보존본입니다. 제품명·버전·상태 설명은 당시 기준입니다. 현재 빌드 명령과 지원 범위는 [README](../README.md), 남은 검증은 [STATUS.md](STATUS.md)를 참고하세요.

> **현재 상태**: 파트너 센터 앱 예약 완료 → MSIX 빌드 진행 중  
> **작성일**: 2026-04-16

---

## 0. 파트너 센터 앱 식별 정보 ✅ (확정)

| 항목 | 값 |
|------|----|
| **Package/Identity/Name** | `QABulls.GroundView` |
| **Package/Identity/Publisher** | `CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11` |
| **PublisherDisplayName** | `QA Bulls` |
| **Package Family Name (PFN)** | `QABulls.GroundView_bea0n8knr6144` |
| **Package SID** | `S-1-15-2-850970331-387851088-1004329679-2043013596-4081656034-3942051738-1074145116` |
| **Store ID** | `9PKBB0JF4NHL` |
| **Store 딥 링크** | 앱 라이브 후 활성화 (`ms-windows-store://pdp/?productid=9PKBB0JF4NHL`) |
| **웹 Store URL** | 앱 라이브 후 활성화 |

> ⚠️ Publisher CN 값은 `package.json` `appx.publisher`에 이미 반영됨.

---

## 1. 전제조건 ✅ (완료)

### 1-1. Microsoft Store 개발자 계정
- 파트너 센터 계정 등록 완료 (QA Bulls)
- 앱 이름 "GroundView" 예약 완료

### 1-2. Publisher Identity
- `package.json` appx 설정에 파트너 센터 실제 값 반영 완료
- `identityName`: `QABulls.GroundView`
- `publisher`: `CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11`

### 1-3. 코드 서명 인증서
- **Store 배포 시**: 파트너 센터가 서명하므로 별도 인증서 불필요
- **사이드로드 테스트 시**: 자체 서명 인증서로 테스트 가능  
  ```powershell
  New-SelfSignedCertificate -Type Custom -Subject "CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11" `
    -KeyUsage DigitalSignature -FriendlyName "GroundView Test" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  ```

---

## 2. electron-builder MSIX 설정 ✅ (package.json 반영 완료)

```json
"appx": {
  "identityName": "QABulls.GroundView",
  "publisher": "CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11",
  "publisherDisplayName": "QA Bulls",
  "displayName": "GroundView",
  "applicationId": "GroundView",
  "backgroundColor": "#0b1221",
  "languages": ["ko-KR", "en-US"],
  "showNameOnTiles": true,
  "artifactName": "${productName}-${version}.${ext}"
}
```

> **주의**: `identityName` 과 `publisher` 는 파트너 센터에서 앱 예약 후  
> 실제 값으로 교체해야 심사 통과 가능.

---

## 3. MSIX 빌드 명령

```bash
# Python 번들 + 렌더러 빌드 + MSIX 생성
npm run build && node scripts/bundle-python.js && electron-builder --win appx

# 또는 package.json 스크립트 추가 후:
npm run dist:msix
```

`package.json` 스크립트에 추가:
```json
"dist:msix": "npm run build && node scripts/bundle-python.js && electron-builder --win appx"
```

---

## 4. Store 심사에서 문제 될 수 있는 항목 체크리스트

### ✅ 이미 수정된 항목 (2026-04-16)
| 항목 | 설명 | 상태 |
|------|------|------|
| `webSecurity: false` → `true` | Same-Origin Policy 복원 | ✅ 수정 완료 |
| CORS wildcard + credentials | `allow_origins=["null","localhost:3000"]`로 제한 | ✅ 수정 완료 |
| `ELECTRON_DISABLE_SECURITY_WARNINGS` | 개발 환경에서만 활성화 | ✅ 수정 완료 |
| `devTools: true` → `isDev` | 프로덕션 DevTools 차단 | ✅ 수정 완료 |
| `fs:readText` 경로 무제한 접근 | tmpdir/userData 이외 경로 차단 | ✅ 수정 완료 |
| `shell.openExternal` 무제한 | https://, http:// 외 차단 | ✅ 수정 완료 |
| Gemini API 키 전역 env 주입 | 자식 프로세스 노출 방지 | ✅ 수정 완료 |
| `will-navigate` / 새 창 차단 | 렌더러 탈출 경로 차단 | ✅ 수정 완료 |
| Python 런타임 의존성 | embeddable 번들 내장 | ✅ 수정 완료 |

### ⚠️ MSIX 전환 시 추가로 처리할 항목

#### 필수 (심사 거부 가능성 있음)
| 항목 | 문제 | 해결 방법 |
|------|------|-----------|
| **APK adb install** | Android 기기에 컴포넌트 설치 행위 | 앱 설명란에 "연결된 Android 기기에 접근성 서비스를 설치합니다" 명시 필수 |
| **런타임 코드 실행 (Python)** | Store 정책: 원격 다운로드 코드 실행 금지 → 번들 Python 사용으로 해결됨 | ✅ 번들링으로 해결 |
| **MSIX 가상화 레이어** | 레지스트리/파일 쓰기가 VFS로 리다이렉트됨 → Python venv 경로 깨질 수 있음 | `python-bundle` 을 `process.resourcesPath` 기준으로 읽어 해결됨 |
| **`allowElevation: true` (NSIS)** | MSIX는 기본 권한 모델 사용 (UAC 없음) | MSIX 빌드 시 해당 NSIS 설정 무시됨; ADB 실행은 권한 불필요 |
| **외부 프로세스 spawn (adb, python)** | Capabilities 선언 없이 외부 프로세스 실행 | `runFullTrust` Capability 필요 (아래 참고) |

#### Capabilities 선언 (AppxManifest.xml)
electron-builder appx 설정에서 `additionalElements` 로 추가:
```json
"appx": {
  "additionalElements": [
    "<rescap:Capability Name=\"runFullTrust\"/>"
  ]
}
```
> `runFullTrust` = 데스크톱 앱이 외부 프로세스를 실행할 수 있는 권한.  
> 이 capability 를 선언하면 Store 심사가 수동 검토(Manual Review)로 전환됨.  
> QA/테스트 자동화 도구임을 설명하면 승인 가능.

#### 선택적 (UX 개선)
| 항목 | 권장 사항 |
|------|-----------|
| 암호화 키 파생 (hostname 기반) | Windows DPAPI(`CryptProtectData`)로 교체 시 보안 강화, 필수 아님 |
| 첫 실행 설정 마법사 | Store 앱은 OOBE(Out-of-Box Experience) 간소화 권장 |
| 앱 아이콘 (Store 용) | 300x300, 44x44, 150x150 PNG 필요 (현재 ico만 있음) |
| 지역화 | Store 등록에 한국어 + 영어 스크린샷/설명 필요 |

---

## 5. Store 등록 체크리스트 (실제 제출 전)

### 앱 패키지
- [ ] `appx` 빌드 성공 확인 (`dist/electron/*.appx`)
- [ ] 로컬에서 `.appx` 사이드로드 설치 테스트
- [ ] 설치 후 기능 동작 확인 (ADB 연결, 스크린샷 캡처, AI 로케이터)
- [ ] Python 번들 동작 확인 (시스템 Python 없는 VM에서 테스트)

### 파트너 센터 제출
- [ ] 앱 이름 예약 ("GroundView")
- [ ] 스토어 리스팅 작성 (한/영)
  - 짧은 설명 (100자 이내)
  - 자세한 설명 (앱 기능, ADB/접근성 서비스 행위 명시)
  - 스크린샷 최소 4장
  - 개인정보 처리방침 URL (GitHub Pages 등으로 게시 필요)
- [ ] 연령 등급 선택 (IARC 등급 — 개발자 도구이므로 일반 등급)
- [ ] 가격 설정 (무료 / 유료)
- [ ] `runFullTrust` capability 사용 이유 심사관용 메모 작성

### 심사 기간
- 일반적으로 3~5 영업일
- `runFullTrust` 포함 시 추가 보안 검토로 1~2주 소요 가능

---

## 6. NSIS → MSIX 변환 방식 대신 직접 빌드를 권장하는 이유

| | MSIX Packaging Tool (변환) | electron-builder `appx` (직접) |
|-|---------------------------|-------------------------------|
| 안정성 | NSIS 동작을 캡처하므로 부정확할 수 있음 | electron-builder가 직접 MSIX 구조 생성 |
| 가상화 | 변환 도구가 레지스트리 변경을 자동 캡처 | 명시적 파일 구조로 예측 가능 |
| CI/CD | 수동 작업 필요 | `npm run dist:msix` 자동화 가능 |
| 권장 | ❌ NSIS 복잡도가 높을 때 문제 발생 가능 | ✅ 권장 |

---

## 7. 실행 준비 명령 요약

```bash
# ① MSIX 빌드 (번들 재생성 없이)
npm run dist:msix:norebuild
# 결과: dist/electron/GroundView-0.0.5.appx

# ② 로컬 사이드로드 테스트 (PowerShell 관리자)
Add-AppxPackage -Path "dist\electron\GroundView-0.0.5.appx"

# ③ 파트너 센터 업로드
# dist/electron/GroundView-0.0.5.appx 파일을 파트너 센터 패키지 탭에 업로드
```

---

## 8. 파트너 센터 Store 리스팅 제출 양식

> 아래 내용을 파트너 센터 → 스토어 목록 탭에 입력.  
> 한국어(`ko-KR`)와 영어(`en-US`) 두 가지 작성 권장.

---

### 앱 이름
```
GroundView
```

---

### 간단한 설명 (100자 이내)

**한국어**
```
Android/iOS 앱 UI를 자동 분석하여 테스트 자동화용 로케이터를 AI로 생성해주는 QA 자동화 도구
```

**영어**
```
AI-powered QA automation tool that captures Android/iOS app UI and generates test locators instantly.
```

---

### 자세한 설명

**한국어**
```
GroundView는 모바일 앱 테스트 자동화를 위한 데스크톱 도구입니다.

주요 기능:
• Android/iOS 기기를 PC에 연결하면 앱 화면을 자동으로 캡처합니다
• 화면 내 UI 요소(버튼, 입력창, 텍스트 등)를 계층 구조로 시각화합니다
• Google Gemini AI를 활용해 테스트 자동화에 필요한 로케이터(XPath, 접근성 ID 등)를 즉시 생성합니다
• 생성된 로케이터는 Appium, UIAutomator2 등 주요 테스트 프레임워크와 호환됩니다

사용 방법:
1. Android 기기를 USB로 연결하거나 iOS 기기를 Wi-Fi로 연결합니다
2. Capture 버튼을 눌러 현재 화면과 UI 계층 구조를 캡처합니다
3. 원하는 UI 요소를 선택하면 AI가 최적의 로케이터를 자동 생성합니다
4. 생성된 로케이터를 테스트 코드에 바로 붙여넣기 할 수 있습니다

Android 연결 시 ADB(Android Debug Bridge)를 사용하며, 
접근성 서비스(GroundView Service)를 기기에 설치해 더 정확한 UI 트리를 수집합니다.
기기에 설치되는 서비스는 UI 정보 수집 목적으로만 사용되며, 
개인 데이터를 수집하거나 외부로 전송하지 않습니다.

Gemini AI 기능 사용을 위해 Google AI API 키가 필요합니다 (무료 티어 사용 가능).
```

**영어**
```
GroundView is a desktop tool for mobile app test automation.

Key Features:
• Automatically captures the screen of connected Android/iOS devices
• Visualizes UI elements (buttons, inputs, text, etc.) in a hierarchy tree
• Uses Google Gemini AI to instantly generate test locators (XPath, Accessibility ID, etc.)
• Compatible with Appium, UIAutomator2, and other major test frameworks

How to Use:
1. Connect an Android device via USB or iOS device via Wi-Fi
2. Press the Capture button to capture the current screen and UI hierarchy
3. Select any UI element to have AI generate the optimal locator
4. Copy and paste the generated locator directly into your test code

For Android connectivity, GroundView uses ADB (Android Debug Bridge) and installs 
an accessibility service (GroundView Service) on the device for more accurate UI tree capture.
The service installed on the device is used solely for UI data collection 
and does not collect or transmit any personal data.

A Google AI API key is required for the Gemini AI feature (free tier available).
```

---

### 검색 키워드 (최대 7개)

```
test automation, appium, locator, QA tool, UI testing, Android testing, iOS testing
```

---

### 개인정보 처리방침 URL

> ⚠️ **필수 항목** — 제출 전 아래 중 하나로 게시 필요:
> - GitHub Pages: `https://[username].github.io/groundview/privacy`
> - 또는 GitHub README에 Privacy Policy 섹션 추가 후 링크

**임시 준비 문구 (GitHub README용)**:
```
## Privacy Policy

GroundView does not collect, store, or transmit any personal data to external servers.

- All captured screen data is stored locally on your PC only
- UI hierarchy data from connected devices is processed locally and not sent externally
- Google Gemini API requests are made directly from your device using your own API key
- The accessibility service installed on Android devices collects UI layout information only, which is processed on your PC and not stored on any server

For questions, contact: [your-email]
```

---

### 스크린샷 요구사항

| 형식 | 크기 | 최소 수량 |
|------|------|-----------|
| 데스크톱 | 1366×768 이상 (16:9) | 최소 4장 |

**권장 스크린샷 구성**:
1. 디바이스 연결 화면 (기기 목록)
2. 화면 캡처 결과 (스크린샷 + UI 트리)
3. AI 로케이터 생성 결과
4. 설정 화면 (Gemini API 키 설정)

---

### 연령 등급
- IARC 설문 응답: 개발자 도구 → **모든 연령**

### 가격
- **무료**

### 카테고리
- 기본: **개발자 도구 (Developer tools)**
- 보조: **생산성 (Productivity)**

---

### runFullTrust Capability 심사관 메모 (Notes to certifiers)

```
This application requires the runFullTrust capability for the following reasons:

1. ADB (Android Debug Bridge) process execution:
   The app spawns adb.exe as a child process to communicate with connected Android devices 
   for UI hierarchy capture. This is a standard tool used in Android development.

2. Python backend server:
   A bundled Python runtime (embedded, no installation required) runs a local FastAPI server 
   on port 5005 (localhost only) to handle AI locator generation via Google Gemini API.
   The server only accepts connections from localhost.

3. No network access beyond localhost and Google AI API:
   All external network calls are limited to the Google Gemini AI API using the user's 
   own API key. No telemetry or data collection occurs.

This tool is designed for QA engineers and test automation developers.
```

---

### 저작권 및 상표 정보 (Copyright and Trademark)

**파트너 센터 입력용 — 한국어**
```
© 2024-2026 QA Bulls. All rights reserved.

GroundView는 QA Bulls의 소프트웨어입니다.
본 소프트웨어는 MIT License 하에 배포됩니다.

"GroundView"는 QA Bulls의 상표입니다.
Google Gemini는 Google LLC의 상표입니다.
Android, ADB는 Google LLC의 상표입니다.
```

**파트너 센터 입력용 — 영어**
```
© 2024-2026 QA Bulls. All rights reserved.

GroundView is a software product of QA Bulls, distributed under the MIT License.

"GroundView" is a trademark of QA Bulls.
Google Gemini is a trademark of Google LLC.
Android and ADB are trademarks of Google LLC.
Appium is a trademark of the OpenJS Foundation.
```

---

### 추가 사용 조건 (Additional License Terms)

**파트너 센터 입력용 — 한국어**
```
본 소프트웨어는 MIT License에 따라 제공됩니다.

[사용 제한]
• 본 소프트웨어는 사용자 본인이 소유하거나 권한을 가진 기기에서만 사용하여야 합니다.
• 타인의 기기에 무단으로 접근하거나 UI 데이터를 수집하는 용도로 사용할 수 없습니다.
• ADB 및 접근성 서비스는 오직 테스트 자동화 목적으로만 사용되어야 합니다.

[제3자 소프트웨어]
본 소프트웨어는 Electron, Python, FastAPI, React 등 오픈소스 컴포넌트를 포함합니다.
각 컴포넌트의 라이선스는 앱 설치 경로 내 THIRD-PARTY-NOTICES.md에서 확인할 수 있습니다.

[Gemini AI 사용]
AI 기능 사용 시 Google의 서비스 약관(https://ai.google.dev/terms) 및
개인정보 처리방침이 추가로 적용됩니다.
```

**파트너 센터 입력용 — 영어**
```
This software is provided under the MIT License.

[Usage Restrictions]
• This software may only be used on devices you own or have explicit authorization to access.
• It must not be used to access or collect UI data from devices without authorization.
• ADB and accessibility service features are intended solely for test automation purposes.

[Third-Party Software]
This software includes open-source components including Electron, Python, FastAPI, and React.
License texts are available in THIRD-PARTY-NOTICES.md in the installation directory.

[Gemini AI Usage]
Use of the AI feature is additionally subject to Google's Terms of Service
(https://ai.google.dev/terms) and Privacy Policy.

Contact: unithan@gmail.com
```


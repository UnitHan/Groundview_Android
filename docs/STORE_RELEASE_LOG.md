# GroundView Windows Store 출시 일지

> **기록 안내 (2026-11-09):** 이 문서는 2026년 4월의 심사 대응 기록입니다. 아래 상태와 체크리스트는 당시 기준이며 현재 스토어 승인·게시 여부를 나타내지 않습니다. 최신 소스 상태는 [STATUS.md](STATUS.md)를 참고하세요.

---

## 2026-04-16 작업 보고서

### 배경
1차 심사 제출 후 리젝 통보. 리젝 사유 및 추가 잠재 문제 전반 수정.

---

### 1. 심사 리젝 원인 수정 — 타일 아이콘 (Policy 10.1.1.11)

**리젝 사유**
```
10.1.1.11 On Device Tiles
The available product tile icons include a default image.
Tile icons must uniquely represent product...
```
앱 타일이 React 기본 아이콘으로 표시됨. `icon.ico`가 앱 고유 아이콘이 아니었음.

**원인**
- `icon.ico` 파일이 Vite/React 기본 아이콘
- electron-builder appx 빌드 시 `build/appx/` 디렉토리가 없으면 기본 아이콘 사용

**수정 내용**
- `scripts/generate-app-icons.py` 신규 생성
  - `icon.png` (1024x1024) 기준으로 `icon.ico` 재생성 (16/32/48/64/128/256px)
  - MSIX 필수 타일 5종 생성 → `build/appx/`
    | 파일명 | 크기 | 용도 |
    |--------|------|------|
    | `Square44x44Logo.png` | 44×44 | 시작 메뉴 / 작업 표시줄 |
    | `StoreLogo.png` | 50×50 | Store 로고 |
    | `Square150x150Logo.png` | 150×150 | 중간 타일 |
    | `Wide310x150Logo.png` | 310×150 | 와이드 타일 |
    | `Square310x310Logo.png` | 310×310 | 큰 타일 |
- electron-builder는 `build/appx/` 디렉토리를 자동 탐색 (별도 옵션 불필요)

> ⚠️ `package.json` appx 설정에 `"icon": "build/appx"` 를 추가했으나 electron-builder 24.x 스키마 미지원 옵션으로 빌드 오류 발생 → 즉시 제거. `build/appx/` 자동 탐색으로 대응.

---

### 2. MSIX 설치 경로 호환성 수정

**문제**
MSIX 앱은 `C:\Program Files\WindowsApps\...` 에 설치되며 이 경로는 **읽기 전용**. `process.cwd()` 가 이 경로를 반환하므로 파일 쓰기 시도 시 EPERM 오류 발생.

**수정 내용** — `app/main.js`

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| `PADDLEOCR_HOME` | `process.cwd()/backend/models/paddleocr` | `effectiveUserDataPath/models/paddleocr` |
| Python spawn `cwd` | `process.cwd()` | `path.dirname(scriptPath)` (resources/backend/) |

- PaddleOCR 모델 캐시 → `AppData\Roaming\GroundView\models\paddleocr` (쓰기 가능)
- Python 백엔드 실행 디렉토리 → `server.py` 위치 기준 (`settings_manager.py`, `webview_ocr.py` import 정상 동작 보장)

---

### 3. Store 심사 기준 전체 점검 및 수정

#### 3-1. python-bundle 경로 불일치 🔴

**원인**
`package.json` `extraResources` 설정:
```json
"extraResources": ["resources/**/*", ...]
```
이 패턴으로 패키징하면 실제 복사 경로는:
```
{resourcesPath}/resources/python-bundle/python.exe
```
그런데 main.js 탐지 코드는:
```
{resourcesPath}/python-bundle/python.exe   ← 틀린 경로
```
를 탐색하고 있었음 → python-bundle을 찾지 못해 시스템 Python 탐색으로 fallback됨.

**수정** — `app/main.js`
```js
// 수정 전
path.join(process.resourcesPath, 'python-bundle', 'python.exe')

// 수정 후
path.join(process.resourcesPath, 'resources', 'python-bundle', 'python.exe')
```
`resolvePythonBin()`의 `bundledCandidates` 배열 1순위에도 동일하게 반영.

#### 3-2. 런타임 pip install — Store Policy 10.8.7 위반 🔴

**원인**
번들 Python을 사용하더라도 `ensurePythonDependencies()`가 `pip install`을 시도.
Store 정책상 런타임 코드 다운로드/설치 금지.

**수정** — `app/main.js`
번들 Python 사용 시 pip 단계 완전 스킵:
```js
const isBundledPython = process.env.PYTHON_BIN?.includes('python-bundle');
if (isBundledPython) {
  // 번들에 모든 패키지 포함됨 — pip 스킵
  return { ok: true };
}
```

#### 3-3. PYTHON_BIN 탐지 순서 버그 — os error 3 원인 🔴

**원인**
기존 코드에서 `PYTHON_BIN` 탐지 코드가 `createWindow()` 함수 **안에** 위치:

```
app.whenReady()
  → startPythonServer()   ← PYTHON_BIN 미설정 상태
      → resolvePythonBin() → python-bundle 미탐지 → os error 3
  → createWindow()        ← 여기서 뒤늦게 PYTHON_BIN 설정 (이미 늦음)
```

심사 환경에서 정확히 **"The system cannot find the path specified. (os error 3)"** 으로 재현되는 버그.

**수정** — `app/main.js`
`PYTHON_BIN` 탐지를 앱 최상단(모듈 초기화 직후, line 52)으로 이동:
```js
// app 준비 전, 모든 함수 호출 전에 실행
if (!process.env.PYTHON_BIN) {
  const embedPyWin = path.join(process.resourcesPath || '', 'resources', 'python-bundle', 'python.exe');
  // ... 탐지 후 process.env.PYTHON_BIN 설정
}
```

---

## 2026-04-23 작업 보고서 (2차 리젝 대응)

### 배경
2차 심사 제출(v0.0.6) 후 재리젝. 리젝 사유: **10.3 App Is Testable — The product failed to install through the Store.**  
테스트 디바이스: Microsoft Surface Laptop

---

### 1. 리젝 원인 분석

#### 1-1. python.cat 파일 — MSIX 설치 실패 원인 🔴

**원인**
Python 임베디드 패키지에 포함된 `python.cat`는 **Windows 보안 카탈로그 파일**이다.  
이 파일은 Python 설치의 파일 무결성을 Microsoft가 서명한 것으로, MSIX 패키지 내부에 포함되면
Windows MSIX Deployment Service가 패키지 서명 검증 과정에서 외부 카탈로그 파일과 충돌하여
**설치 자체가 실패**할 수 있다.

**수정 내용**

1. `package.json` extraResources에서 `python.cat` 제외 (FileSet filter 패턴):
   ```json
   { "from": "resources", "to": "resources",
     "filter": ["**/*", "!python-bundle/python.cat", ...] }
   ```

2. `scripts/bundle-python.js` Step 7 추가: 번들 생성 후 `python.cat` 자동 삭제

#### 1-2. backend 테스트 파일 포함 🟡

**원인**
`backend/**/*` extraResources 패턴으로 인해 다음 파일들이 APPX에 포함됨:
- `test_gemini.py` — API 키 처리 코드 포함 → Store 보안 스캔 트리거 가능
- `test_api_key_decrypt.py` — 같은 이유
- `shot.png` — 개발 중 생성된 임시 캡처 파일
- `__pycache__/` — 개발 머신 로컬 바이트코드 캐시

**수정 내용**
`package.json` extraResources에서 테스트 파일 제외:
```json
{ "from": "backend", "to": "backend",
  "filter": ["**/*", "!test_*.py", "!shot.png", "!**/__pycache__/**"] }
```

#### 1-3. pip Scripts 실행 파일 포함 🟡

APPX에 `pip.exe`, `pip3.exe`, `wheel.exe` 등이 포함됨.  
런타임에 pip를 사용하지 않으므로(번들 Python 감지 시 스킵) 불필요.  
`package.json` filter에서 제외:
```json
"!python-bundle/Scripts/pip*.exe",
"!python-bundle/Scripts/wheel.exe"
```

---

### 2. AppxManifest.xml 분석

`MaxVersionTested="10.0.14316.0"` — electron-builder 기본값으로 Windows 10 Insider Preview 빌드(2016년).  
Windows 11 기기에서 이 값이 너무 낮으면 호환성 레이어가 적용되어 앱 동작에 영향 가능.  
→ 현재 electron-builder 24.x에서 직접 설정하는 공식 옵션 없음. 추후 custom manifest 검토.

---

### 3. 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | extraResources → FileSet 형식으로 변경, python.cat·테스트파일·pip exe 제외 |
| `scripts/bundle-python.js` | Step 7 추가: python.cat 자동 삭제 |

---

### 4. 다음 제출 전 필수 체크리스트

- [ ] **로컬 MSIX 테스트** (클린 VM에서 직접 확인 — 이전 제출 시 미수행)
  ```powershell
  # 자체 서명 인증서로 서명 후 사이드로드
  Add-AppxPackage -Path "dist\electron\GroundView-0.0.7.appx"
  ```
  → 설치 성공 여부 및 앱 실행 확인
- [ ] `npm run bundle-python && npm run dist:msix` 로 python.cat 없는 새 APPX 빌드
- [ ] 개인정보처리방침 URL 게시
- [ ] 앱 스크린샷 4장 (디바이스 목록 / 캡처 결과 / AI 로케이터 / 설정)
- [ ] IARC 연령 등급 설문

---

### 5. 남은 작업 (다음 제출 전 필수)

- [ ] 개인정보처리방침 URL 게시 (GitHub Pages 또는 README)
- [ ] 앱 스크린샷 4장 캡처 (디바이스 목록 / 캡처 결과 / AI 로케이터 / 설정 화면)
- [ ] IARC 연령 등급 설문 응답
- [ ] ~~MSIX 사이드로드 테스트~~ → **2026-04-23 대응 섹션 참고**
- [ ] 최종 MSIX 재빌드: `npm run bundle-python && npm run dist:msix`
- [ ] 최종 NSIS 재빌드: `npm run dist:win:norebuild`

---

### 6. 참고 — 현재 파트너 센터 식별 정보

| 항목 | 값 |
|------|-----|
| Store ID | `9PKBB0JF4NHL` |
| Package Identity Name | `QABulls.GroundView` |
| Publisher | `CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11` |
| MSIX 파일 | `dist/electron/GroundView-0.0.6.appx` |


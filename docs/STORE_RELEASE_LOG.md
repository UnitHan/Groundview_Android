# GroundView Windows Store 출시 일지

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

### 4. 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `scripts/generate-app-icons.py` | **신규 생성** — icon.ico + MSIX 타일 PNG 생성 |
| `build/appx/Square44x44Logo.png` | **신규 생성** |
| `build/appx/StoreLogo.png` | **신규 생성** |
| `build/appx/Square150x150Logo.png` | **신규 생성** |
| `build/appx/Wide310x150Logo.png` | **신규 생성** |
| `build/appx/Square310x310Logo.png` | **신규 생성** |
| `icon.ico` | **재생성** — icon.png 기반 다중 해상도 |
| `app/main.js` | PYTHON_BIN 탐지 위치 이동, 경로 수정 4건, pip 스킵 로직 추가 |

---

### 5. 남은 작업 (다음 제출 전 필수)

- [ ] 개인정보처리방침 URL 게시 (GitHub Pages 또는 README)
- [ ] 앱 스크린샷 4장 캡처 (디바이스 목록 / 캡처 결과 / AI 로케이터 / 설정 화면)
- [ ] IARC 연령 등급 설문 응답
- [ ] MSIX 사이드로드 테스트 — Python 미설치 환경(클린 VM)에서 python-bundle 동작 확인
- [ ] 최종 MSIX 재빌드: `npm run dist:msix:norebuild`
- [ ] 최종 NSIS 재빌드: `npm run dist:win:norebuild`

---

### 6. 참고 — 현재 파트너 센터 식별 정보

| 항목 | 값 |
|------|-----|
| Store ID | `9PKBB0JF4NHL` |
| Package Identity Name | `QABulls.GroundView` |
| Publisher | `CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11` |
| MSIX 파일 | `dist/electron/GroundView-0.0.5.appx` |

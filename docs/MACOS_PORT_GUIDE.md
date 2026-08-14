# macOS 포팅 작업 가이드

> 대상: `UnitHan/Groundview_Android` (main = 단일 소스). MacBook에서 진행.
> 기준 커밋: `718e59c` (v0.0.10, Appkium Inspector 리브랜딩 완료)

---

## 0. 원칙

**단일 main. macOS 전용 장기 브랜치 만들지 않는다.**

기존 `UnitHan/Groundview_Android_macOS` 레포는 v0.0.5 시점에서 스쿼시된 별개 히스토리라 현재 main과 공통 조상이 없다. 두 레포를 유지한 결과 macOS 쪽이 2릴리즈 뒤처졌고, diff가 `131 files changed, 2389 insertions(+), 14680 deletions(-)` 까지 벌어졌다. 같은 실수를 반복하지 않으려면:

- macOS 코드는 `process.platform === 'darwin'` 분기로 넣는다
- 작업 브랜치는 `feat/macos-support` 하나, 끝나면 main에 머지하고 삭제
- main 하나로 Windows / macOS 둘 다 빌드되게 만든다

작업 완료 후 `Groundview_Android_macOS` 는 archive 처리하고 README에 이 레포 링크만 남긴다.

---

## 1. 사전 준비 (MacBook)

| 항목 | 확인 명령 | 비고 |
|---|---|---|
| Node.js 18+ | `node -v` | `package.json` engines 요구사항 |
| Python 3.10+ | `python3 --version` | 백엔드 실행용 |
| Android SDK platform-tools | `adb version` | Android Studio 설치 또는 `brew install --cask android-platform-tools` |
| Xcode Command Line Tools | `xcode-select -p` | 네이티브 모듈 빌드에 필요 |
| Apple Developer 계정 | — | dmg 서명·공증 단계에서만 필요 (선택) |

---

## 2. 클론 & 개발 실행

```bash
git clone https://github.com/UnitHan/Groundview_Android.git
cd Groundview_Android
git checkout -b feat/macos-support

npm install                      # 네이티브 모듈 arm64 재빌드
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

npm run dev                      # backend + renderer + electron 동시 기동
```

또는 `./setup_dev.sh` 실행 (동일 작업 자동화).

> `npm run dev:py` 는 `python backend/server.py` 를 호출한다. macOS에서 `python` 이 없고 `python3` 만 있으면 venv를 activate한 상태에서 실행하거나 `package.json` 의 `dev:py` 스크립트를 손봐야 한다. **작업 항목 T7 참조.**

---

## 3. 작업 항목

### T1. ADB 종료 처리 (macOS 분기 없음) — 필수

[app/services/adbService.js:33-41](../app/services/adbService.js#L33-L41)

```js
if (process.platform === 'win32' && ps.pid) {
  spawn('taskkill', ['/pid', String(ps.pid), '/T', '/F'], { windowsHide: true });
}
```

`killProc()` 가 Windows에서만 자식 프로세스 트리를 정리한다. macOS에서는 `ps.kill()` 만 호출되어 자식 `adb` 가 고아로 남을 수 있다.

- 할 일: darwin 분기 추가. `process.kill(-ps.pid, 'SIGKILL')` (spawn 시 `detached: true` 필요) 또는 `spawn('pkill', ['-P', String(ps.pid)])`
- 검증: capture 반복 후 `ps aux | grep adb` 로 잔류 프로세스 확인

### T2. 앱 종료 시 ADB 정리 — 필수

[app/main.js:1995-2005](../app/main.js#L1995-L2005)

`before-quit` 에서 `taskkill /F /IM adb.exe /T` 를 Windows에서만 실행한다. macOS 분기 없음.

- 할 일: `else if (process.platform === 'darwin')` 에 `pkill -f 'adb'` 추가 (단, 사용자가 직접 띄운 adb 서버까지 죽이는 부작용 검토 — `adb kill-server` 만으로 충분한지 먼저 확인)

### T3. Python 런타임 해석 — 필수

[app/main.js:744-746](../app/main.js#L744-L746)

```js
const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
const binNames = process.platform === 'win32' ? ['python.exe', 'python'] : ['python3', 'python'];
const bundledPy = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
```

코드 상 분기는 이미 있으나 **macOS에는 번들 Python이 존재하지 않는다** ([scripts/bundle-python.js](../scripts/bundle-python.js) 가 Windows embeddable zip 전용).

- 선택지 A: macOS는 시스템 `python3` + 최초 실행 시 venv 자동 생성 (권장, 배포 용량 작음)
- 선택지 B: `bundle-python-mac.js` 신규 작성 (python.org macOS universal2 pkg 또는 `python-build-standalone` 사용)
- 결정 후 [app/main.js:811](../app/main.js#L811) 부근 Windows 전용 분기 확인

### T4. ADB 번들링 스크립트 — 필수

[scripts/bundle-adb.js](../scripts/bundle-adb.js)

```js
const ADB_FILES = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'libwinpthread-1.dll'];
```

파일명이 Windows 전용으로 하드코딩. `findSdkPlatformTools()` 도 `adb.exe` 존재 여부로 판정한다.

- 할 일: darwin 분기 추가 — 파일은 `adb` 하나, SDK 기본 경로는 `~/Library/Android/sdk/platform-tools`, 복사 후 `chmod 755`
- 주의: 이 스크립트는 원래 **MSIX DLL 로딩 문제(0xC0000135) 회피용**이다. macOS에는 해당 문제가 없으므로 번들링 자체를 생략하고 시스템 adb를 쓰는 것도 정당한 선택. 그 경우 dmg 용량이 줄고 Apache-2.0 재배포 고지 부담도 없다.
- `resources/adb/` 는 `.gitignore` 에 있으므로 클론 직후 비어 있다 (정상)

### T5. Android SDK 자동 탐지 — 확인

[app/main.js:1801-1811](../app/main.js#L1801-L1811) — Android Studio 경로 탐지는 macOS 분기 이미 있음 (`/Applications/Android Studio.app`).
[app/main.js:1820-1893](../app/main.js#L1820-L1893) — platform-tools 다운로드도 darwin URL + `unzip` + `chmod 755` 처리 이미 있음.

- 할 일: **실제 동작 검증만**. Gatekeeper가 다운로드된 `adb` 를 quarantine 하는지 확인. 막히면 `xattr -d com.apple.quarantine` 처리 추가

### T6. 설정 마이그레이션 경로 — 확인

[app/main.js](../app/main.js) `migrateOldProductNameSettings()` 가 상위 폴더의 `GroundView/settings.json` 을 읽는다.

- macOS 경로: `~/Library/Application Support/GroundView` → `~/Library/Application Support/Appkium Inspector`
- 상위 디렉터리 기준 로직이라 macOS에서도 그대로 동작해야 함. **기존 v0.0.5 macOS 사용자 데이터로 실제 검증 필요**

### T7. npm 스크립트 — 필수

[package.json](../package.json) 현황:

- `dev:py` 가 `python` 호출 → macOS는 `python3` 인 경우가 많음
- `dist:win`, `dist:msix` 만 있고 **`dist:mac` 없음**

추가할 스크립트:

```json
"dist:mac": "npm run build && electron-builder --mac",
"dist:mac:norebuild": "electron-builder --mac"
```

(T3에서 mac용 python 번들을 만들기로 했다면 그 스크립트도 체인에 넣는다)

### T8. electron-builder mac 설정 — 필수

현재 `build.mac` 은 타겟만 있고 나머지가 비어 있다:

```json
"mac": { "target": ["dmg", "zip"] }
```

추가 필요:

```json
"mac": {
  "target": [{ "target": "dmg", "arch": ["arm64", "x64"] },
             { "target": "zip", "arch": ["arm64", "x64"] }],
  "icon": "icon.icns",
  "category": "public.app-category.developer-tools",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

- `icon.icns` 는 기존 macOS 레포에서 가져올 수 있다 (2절 부록 참조). 단 아이콘이 구 GroundView 디자인이면 현 `icon.png` 로 재생성 권장: `iconutil` 또는 `electron-icon-builder`
- `entitlements.mac.plist` 신규 작성 필요. 최소 항목:
  - `com.apple.security.cs.allow-jit` (Electron 필수)
  - `com.apple.security.cs.allow-unsigned-executable-memory`
  - `com.apple.security.cs.disable-library-validation` (번들 Python/adb 실행 시)
  - `com.apple.security.device.usb` (USB 디바이스 접근이 필요한 경우)

### T9. extraResources 필터 — 확인

[package.json](../package.json) `extraResources` 에 `resources/adb` 와 `resources/python-bundle` 이 무조건 포함된다. Windows에서 만든 산출물이 남아 있으면 mac dmg에 Windows 바이너리가 섞여 들어간다.

- 할 일: platform별 필터 분기 또는 mac 빌드 전 해당 디렉터리 정리
- `resources/groundview-service.apk` 는 플랫폼 무관하게 필요 (Android 디바이스에 설치되는 파일)

### T10. 환경 설정 안내 UI — 필수

[desktop/src/renderer/components/EnvSetupModal.tsx](../desktop/src/renderer/components/EnvSetupModal.tsx)

설치 안내 문구가 Windows 전제 (Android Studio 설치 경로, SDK Manager 경로 등).

- 할 일: `window.api` 로 platform 전달받아 macOS 안내 문구 분기
- 관련 i18n 키: [desktop/src/renderer/i18n/ko.ts](../desktop/src/renderer/i18n/ko.ts), [en.ts](../desktop/src/renderer/i18n/en.ts) 의 `guideDesc` 등

### T11. 줄바꿈 (CRLF) — 완료

레포 파일 대부분 CRLF. macOS에서 `.sh` 를 CRLF로 받으면 `bad interpreter` 로 실행 실패한다.
→ `.gitattributes` 를 추가해 `*.sh` / `*.command` 는 LF 고정했다. 클론 시 자동 적용.

---

## 4. 빌드 & 배포

```bash
npm run build
npm run dist:mac
# 산출물: dist/electron/Appkium Inspector-0.0.10-arm64.dmg
```

**서명·공증** (배포 시 필수, 로컬 테스트는 생략 가능):

```bash
export APPLE_ID="..."
export APPLE_APP_SPECIFIC_PASSWORD="..."
export APPLE_TEAM_ID="..."
npm run dist:mac        # electron-builder가 notarize까지 수행
```

서명 없이 배포하면 사용자가 Gatekeeper 경고를 보고 우클릭 → 열기를 해야 한다.

> Windows에서는 dmg 빌드·codesign·notarize 불가. **반드시 맥에서 실행.**

---

## 5. 검증 체크리스트

기능은 Windows와 동일해야 한다. dmg 설치 후 확인:

- [ ] 앱 실행 / 백엔드(포트 5005) 기동
- [ ] `adb devices` 인식, 디바이스 목록 표시
- [ ] Select ADB 파일 다이얼로그 — macOS에서 확장자 없는 `adb` 선택 가능한지 ([app/main.js:1460](../app/main.js#L1460))
- [ ] Capture — uiautomator dump 경로
- [ ] Capture — Appkium Inspector Service(APK) 자동 설치 + 접근성 권한 안내
- [ ] APK 버전 자동 업그레이드 (구버전 설치 상태에서)
- [ ] 팝업/다이얼로그/바텀시트 포함 다중 윈도우 덤프 (v1.3.0 신규)
- [ ] Compose 앱 요소 탐지 + `clickableAncestor` 로케이터 승격
- [ ] 무선 ADB (`IP:port`) 연결
- [ ] 디바이스 정보 모달 + Appium caps 코드 생성/복사
- [ ] OCR (PaddleOCR 모델 다운로드 경로: `~/.paddleocr`)
- [ ] Gemini API 코드 생성
- [ ] 모든 모달 ESC 닫기
- [ ] 설정 저장/복원, 기존 GroundView 설정 마이그레이션
- [ ] 앱 종료 시 백엔드·adb 프로세스 잔류 없음 (`ps aux | grep -E 'adb|server.py'`)
- [ ] `./clean_appkium.sh` 로 전체 데이터 삭제 동작

---

## 6. 머지 & 마무리

```bash
git push -u origin feat/macos-support
# GitHub에서 PR 생성 → main 머지 → 브랜치 삭제
```

머지 후:

1. `release-notes.md` 에 macOS 지원 항목 추가, 버전 bump
2. GitHub Release에 Windows(exe/msix) + macOS(dmg) 산출물 함께 첨부
3. `UnitHan/Groundview_Android_macOS` → Settings → Archive this repository
4. 해당 레포 README를 이 레포 링크 한 줄로 교체

---

## 부록 A. 기존 macOS 레포에서 가져올 것

로컬(Windows)에 리모트를 추가해뒀다. 맥에서도 동일하게 추가 가능:

```bash
git remote add macos https://github.com/UnitHan/Groundview_Android_macOS.git
git fetch macos --depth 1
git show macos/main:README_macOS.md      # 참고용 (v0.0.5 기준, 내용 낡음)
git checkout macos/main -- icon.icns     # 아이콘만 재사용 가치 있음
```

**가져오면 안 되는 것:**

| 대상 | 이유 |
|---|---|
| `android/bridge/` | 구식 Bridge APK 방식. 현 `groundview-service/` 가 대체 |
| `app-debug.apk` | 위 Bridge APK 산출물 |
| `test_adb_timeout.js`, `test_main_functions.js` | v0.0.5 기준 임시 테스트. 현 코드와 불일치 |
| `MACOS_SETUP_COMPLETE.md`, `README_macOS.md` | 구 브랜딩·구 구조 기준 |
| `setup_dev.sh`, `clean_groundview.sh` | 이 레포에 최신 브랜딩 버전을 이미 추가함 |

## 부록 B. 플랫폼 분기 위치 색인

| 파일:라인 | 내용 | macOS 상태 |
|---|---|---|
| [app/main.js:246-248](../app/main.js#L246-L248) | OS 이름 문자열 | 대응됨 |
| [app/main.js:744-746](../app/main.js#L744-L746) | Python 실행 파일 탐색 | 분기 있음 / 번들 없음 (T3) |
| [app/main.js:811](../app/main.js#L811) | Windows 전용 처리 | 확인 필요 |
| [app/main.js:1129-1131](../app/main.js#L1129-L1131) | 경로 대소문자 dedupe | 대응됨 |
| [app/main.js:1184](../app/main.js#L1184), [1207](../app/main.js#L1207) | Windows 전용 처리 | 확인 필요 |
| [app/main.js:1239-1245](../app/main.js#L1239-L1245) | darwin / linux 분기 | 대응됨 |
| [app/main.js:1460](../app/main.js#L1460) | 파일 다이얼로그 확장자 | 대응됨 (검증 필요) |
| [app/main.js:1701-1703](../app/main.js#L1701-L1703) | platform-tools URL | 대응됨 |
| [app/main.js:1801-1811](../app/main.js#L1801-L1811) | Android Studio 탐지 | 대응됨 (T5) |
| [app/main.js:1855-1881](../app/main.js#L1855-L1881) | unzip + chmod | 대응됨 (T5) |
| [app/main.js:1908](../app/main.js#L1908) | Windows 드라이브 문자 경로 | 대응됨 |
| [app/main.js:1968](../app/main.js#L1968) | `window-all-closed` darwin 유지 | 대응됨 |
| [app/main.js:1995-2005](../app/main.js#L1995-L2005) | taskkill | **미대응 (T2)** |
| [app/services/adbService.js:33-41](../app/services/adbService.js#L33-L41) | 프로세스 트리 kill | **미대응 (T1)** |
| [scripts/bundle-adb.js](../scripts/bundle-adb.js) | adb 번들링 | **미대응 (T4)** |
| [scripts/bundle-python.js](../scripts/bundle-python.js) | Python 번들링 | **미대응 (T3)** |
| [package.json](../package.json) `scripts` | `dist:mac` 없음 | **미대응 (T7)** |
| [package.json](../package.json) `build.mac` | 아이콘·서명 설정 없음 | **미대응 (T8)** |
| [EnvSetupModal.tsx](../desktop/src/renderer/components/EnvSetupModal.tsx) | 설치 안내 문구 | **미대응 (T10)** |

## 부록 C. 백엔드 / Android 서비스

- [backend/server.py](../backend/server.py) — 순수 Python(FastAPI + PaddleOCR). 플랫폼 의존 코드 없음. 별도 작업 불필요
- [groundview-service/](../groundview-service/) — Android 앱. Gradle 빌드는 macOS에서도 동일하게 동작 (`./gradlew assembleRelease`). `local.properties` 의 `sdk.dir` 만 mac 경로로 맞추면 됨
- `resources/groundview-service.apk` — 빌드 산출물이 커밋되어 있다. macOS에서 APK를 다시 빌드할 필요는 없다

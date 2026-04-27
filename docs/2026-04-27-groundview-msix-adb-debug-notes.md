# GroundView 2026-04-27 작업 기록

작성일: 2026-04-27  
작업 범위: 개발 환경 복구, MSIX/Store 설치본 ADB 인식 문제 진단, 로깅 추가, 0.0.8/0.0.9 테스트 패키지 빌드 및 서명 스크립트 작성

## 요약

오늘의 핵심 원인은 단말이나 USB 드라이버 문제가 아니라, Windows Store/MSIX 설치본에서 외부 Android SDK의 `adb.exe`를 실행할 때 프로세스가 즉시 종료되는 문제였다.

0.0.8 설치본 로그에서 ADB 경로는 정상 탐지되었지만 `adb.exe` 실행이 `3221225781` 코드로 실패했다. 이 값은 16진수로 `0xC0000135`이며, Windows 네이티브 프로세스의 DLL 로딩 실패 계열 코드다.

일반 PowerShell에서는 같은 ADB가 정상 실행되고 단말도 `SM_G991N`으로 인식되었다. 따라서 문제는 "ADB 경로 탐지 실패"가 아니라 "MSIX 앱 컨텍스트에서 외부 ADB 실행 시 필요한 DLL을 찾지 못하는 문제"로 좁혀졌다.

## 최종 상태

- 앱 버전은 `0.0.7`에서 `0.0.9`로 올렸다.
- `0.0.8`은 MSIX 설치본에서 원인 파악을 위한 ADB 진단 로그를 추가한 테스트 빌드였다.
- `0.0.9`는 진단 로그에 더해 ADB 실행 시 `cwd`와 `PATH`를 보정하는 수정이 포함된 테스트 빌드다.
- 최신 APPX 산출물:

```text
C:\GroundView\Groundview_Android\dist\electron\GroundView-0.0.9.appx
```

- 서명/설치용 배치 파일:

```text
C:\GroundView\Groundview_Android\sign_groundview_008_appx.bat
```

파일명은 0.0.8로 남아 있지만, 내부 로직은 `dist\electron\GroundView-*.appx` 중 최신 파일을 자동 선택하도록 변경했다.

## 개발 환경 복구

### Python 가상환경 경로 수정

기존 `.venv/pyvenv.cfg`가 존재하지 않는 Python 경로를 가리키고 있었다.

변경 전:

```text
home = C:\Program Files\Python310
```

변경 후:

```text
home = C:\Users\dwonh\AppData\Local\Programs\Python\Python310
```

이 수정으로 `.venv\Scripts\python.exe`가 정상 Python 홈을 참조하게 되었다.

### pip 및 backend 의존성 복구

Pylance에서 다음 import를 찾지 못하는 문제가 있었다.

- `fastapi`
- `fastapi.middleware.cors`
- `fastapi.responses`
- `pydantic`
- `httpx`
- `uvicorn`

조치 내용:

- `.venv`의 pip를 `ensurepip`로 복구했다.
- `requirements.txt` 기반으로 backend 의존성을 설치했다.
- `pydantic`, `pydantic-core`, `cffi`, `cryptography` 계열 패키지를 재설치해 import 문제를 해소했다.

주의: 이 과정에서 `.venv/Lib/site-packages` 아래 파일들이 대량 변경되었다. 이는 제품 코드 수정이 아니라 로컬 개발환경 복구 흔적이다.

### VS Code Python 설정 추가

VS Code/Pylance가 프로젝트 가상환경을 보도록 `.vscode/settings.json`을 추가했다.

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": true,
  "python.analysis.extraPaths": [
    "${workspaceFolder}/backend"
  ]
}
```

## npm 개발 서버 이슈

`npm run dev` 실행 중 Python 서버가 포트 `5005`를 열지 못하는 문제가 있었다.

로그:

```text
[server] ERROR: Port 5005 is not available: [WinError 10013]
```

확인 내용:

- `MODEL_PORT=5005`로 Python backend가 실행된다.
- 동시에 Store/MSIX 설치본 또는 이전 backend 프로세스가 `5005`를 잡고 있으면 개발 서버가 바로 종료된다.
- `concurrently --kill-others` 설정 때문에 `dev:py`가 실패하면 renderer/electron도 같이 종료된다.

확인에 사용한 명령:

```powershell
netstat -ano | Select-String ':5005'
Get-Process -Id <PID>
```

## MSIX/Store 설치본 로그 위치

Store/MSIX 설치본은 일반 `%APPDATA%\groundview`가 아니라 패키지 LocalCache 아래로 사용자 데이터가 리다이렉트된다.

실제 로그 위치:

```text
C:\Users\dwonh\AppData\Local\Packages\QABulls.GroundView_bea0n8knr6144\LocalCache\Roaming\groundview\groundview.log
```

서버 시작 로그:

```text
C:\Users\dwonh\AppData\Local\Packages\QABulls.GroundView_bea0n8knr6144\LocalCache\Roaming\groundview\server_startup.log
```

중요한 관찰:

- 앱 내부 `effectiveUserDataPath` 기준으로 settings/log가 저장된다.
- 이전에 `%APPDATA%\groundview\settings.json`을 만들어도 MSIX 설치본에는 적용되지 않을 수 있다.
- MSIX 설치본의 로그를 볼 때는 `LocalAppData\Packages\...LocalCache\Roaming\groundview`를 확인해야 한다.

## 0.0.8 진단 로그 추가

`app/main.js`에 파일 기반 진단 로그를 추가했다.

추가된 주요 helper:

- `writeDiagnosticLog(message)`
- `writeAdbLog(message)`
- `compactLogText(value, max)`
- `compactJson(value, max)`

로그 파일:

```text
groundview.log
```

기록 내용:

- ADB 설정 파일 경로와 존재 여부
- 저장된 `adbPath` 사용 여부
- ADB 자동 탐지 후보 수
- 실제 존재하는 ADB 후보 수
- `adb version` 검증 성공/실패
- `adb:listDevices` 시작/성공/실패
- `adb:capture` 시작/결과/실패
- `adb:health` 결과
- `adb:setPath` 저장 여부
- `adb:autoDetect` 결과
- 환경 진단 결과

### ADB 저장 경로 검증 방식 변경

기존에는 저장된 ADB 경로 확인에 `X_OK`를 사용했다.

```js
fsSync.accessSync(parsed.data.adbPath, fsSync.constants.X_OK);
```

MSIX 환경에서 외부 실행 파일에 대해 `X_OK`가 불안정할 수 있어 `F_OK`로 변경했다.

```js
fsSync.accessSync(parsed.data.adbPath, fsSync.constants.F_OK);
```

의도:

- "파일 존재 여부"만 확인한다.
- 실행 가능 여부는 실제 `adb version` 실행 결과와 진단 로그로 판단한다.

### ADB 자동 탐지 후보 추가

Windows 환경에서 추가로 탐지하도록 후보를 늘렸다.

추가 후보:

```text
%USERPROFILE%\platform-tools\adb.exe
C:\platform-tools\adb.exe
```

기존 후보와 함께 Android Studio/SDK 기본 경로, `process.resourcesPath` 내부 경로도 계속 검사한다.

## 0.0.8 설치본 로그 분석 결과

설치된 0.0.8은 다음 경로에서 실행되었다.

```text
C:\Program Files\WindowsApps\QABulls.GroundView_0.0.8.0_x64__bea0n8knr6144\app\GroundView.exe
```

서버는 번들 Python으로 정상 기동했다.

```text
Python: 3.10.11
Executable: C:\Program Files\WindowsApps\QABulls.GroundView_0.0.8.0_x64__bea0n8knr6144\app\resources\resources\python-bundle\python.exe
```

따라서 backend/server.py 또는 번들 Python 문제는 아니었다.

핵심 ADB 로그:

```text
[adb] preload settings=C:\Users\dwonh\AppData\Roaming\groundview\settings.json exists=false
[adb] verify failed path=C:\Users\dwonh\AppData\Local\Android\Sdk\platform-tools\adb.exe status=3221225781 error= output=
[adb] scan isMsix=true candidates=22 existing=1 verified=0 result=["C:\\Users\\dwonh\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe"]
[adb] preload using auto-detected adbPath=C:\Users\dwonh\AppData\Local\Android\Sdk\platform-tools\adb.exe
[adb] diagnose start-server close code=3221225781 output=
[adb] listDevices error adbPath=C:\Users\dwonh\AppData\Local\Android\Sdk\platform-tools\adb.exe message=command failed with code 3221225781
```

해석:

- ADB 경로는 발견했다.
- `platform-tools` 폴더도 존재했다.
- 하지만 MSIX 앱 안에서 `adb.exe`를 실행하면 `3221225781`로 종료된다.
- `3221225781`은 `0xC0000135`다.
- `0xC0000135`는 보통 DLL 로딩 실패를 의미한다.

실제 ADB 폴더에는 필요한 파일이 있었다.

```text
adb.exe
AdbWinApi.dll
AdbWinUsbApi.dll
libwinpthread-1.dll
```

일반 PowerShell에서 같은 ADB는 정상 동작했다.

```text
Android Debug Bridge version 1.0.41
Version 37.0.0-14910828
Installed as C:\Users\dwonh\AppData\Local\Android\Sdk\platform-tools\adb.exe
```

단말도 정상 인식되었다.

```text
R3CN90NGRZ device product:o1sksx model:SM_G991N device:o1s transport_id:1
```

결론:

- USB 디버깅/드라이버/단말 연결 문제가 아니다.
- ADB 경로 탐지 실패도 아니다.
- MSIX 앱 프로세스가 외부 SDK의 `adb.exe`를 실행할 때 DLL 탐색 경로 문제로 실패하는 상황이다.

## 0.0.9 ADB 실행 보정

`app/services/adbService.js`에 `adbSpawnOptions()`를 추가했다.

목적:

- 절대 경로 ADB를 실행할 때 `cwd`를 `adb.exe`가 있는 폴더로 설정한다.
- `PATH` 맨 앞에 `adb.exe`가 있는 폴더를 붙인다.
- ADB 옆에 있는 `AdbWinApi.dll`, `AdbWinUsbApi.dll`, `libwinpthread-1.dll`을 더 안정적으로 찾게 한다.

핵심 로직:

```js
function adbSpawnOptions() {
  if (!adbBin || adbBin === 'adb' || !path.isAbsolute(adbBin)) {
    return { windowsHide: true };
  }
  const adbDir = path.dirname(adbBin);
  return {
    windowsHide: true,
    cwd: adbDir,
    env: {
      ...process.env,
      PATH: `${adbDir}${path.delimiter}${process.env.PATH || ''}`
    }
  };
}
```

적용 위치:

- `runSpawn()`
- `runAdbToFile()`

`app/main.js`의 ADB 검증 및 환경 진단 쪽 `spawn`/`spawnSync`에도 같은 보정을 적용했다.

적용 위치:

- `scanAdbPaths()`의 `adb version` 검증
- `env:diagnose`의 `adb version`
- `env:diagnose`의 `adb start-server`
- `env:diagnose`의 `adb devices -l`

## 버전 변경

변경 파일:

- `package.json`
- `package-lock.json`

버전 흐름:

```text
0.0.7 -> 0.0.8 -> 0.0.9
```

현재 최종 버전:

```json
"version": "0.0.9"
```

## MSIX 빌드

0.0.8:

- 진단 로그 추가 후 빌드했다.
- Store/MSIX 환경에서 실제 실패 로그를 수집하는 목적이었다.
- 설치 후 ADB 실패 코드 `3221225781`을 확인했다.

0.0.9:

- ADB 실행 환경 보정까지 포함해 빌드했다.
- 산출물:

```text
C:\GroundView\Groundview_Android\dist\electron\GroundView-0.0.9.appx
```

빌드 명령:

```powershell
npm run dist:msix:norebuild
```

참고:

- 샌드박스 환경에서는 `app-builder.exe` 실행이 `EPERM`으로 실패했다.
- 사용자 환경 권한으로 다시 실행하자 정상 빌드되었다.

## MSIX 서명 스크립트

새 파일:

```text
sign_groundview_008_appx.bat
```

주요 기능:

- `dist\electron\GroundView-*.appx` 중 최신 APPX 자동 선택
- Publisher와 일치하는 CurrentUser 코드 서명 인증서 생성 또는 재사용
- `dist\electron\GroundView-TestCert.cer`로 인증서 내보내기
- 관리자 권한일 때 LocalMachine 인증서 저장소에 신뢰 등록
  - `TrustedPeople`
  - `Root`
- `signtool.exe`로 APPX 서명
- 서명 검증
- 선택 시 `Add-AppxPackage -ForceUpdateFromAnyVersion`로 설치

Publisher:

```text
CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11
```

PowerShell에서 배치파일을 실행할 때는 현재 폴더의 스크립트임을 명시해야 한다.

```powershell
.\sign_groundview_008_appx.bat
```

그냥 아래처럼 실행하면 PowerShell 명령 검색 정책 때문에 찾지 못할 수 있다.

```powershell
sign_groundview_008_appx.bat
```

## 서명/설치 중 발생한 오류와 조치

### 오류 0x800B0100

상황:

- APPX가 서명되지 않은 상태로 `Add-AppxPackage` 설치를 시도했다.

해석:

- APPX 서명이 없거나 유효하지 않아 설치 실패.

조치:

- `signtool.exe`로 APPX를 서명하도록 배치파일을 작성했다.

### 오류 0x800B0109

로그:

```text
앱 패키지 또는 번들에서 서명의 루트 인증서는 신뢰할 수 있어야 합니다.
```

해석:

- APPX 서명 자체는 되었지만, 서명에 사용한 테스트 인증서의 루트가 Windows 앱 배포 기준에서 신뢰되지 않았다.

초기 문제:

- CurrentUser 인증서 저장소에만 추가했을 때 `signtool verify`는 통과했지만 `Add-AppxPackage`는 여전히 실패했다.

조치:

- 배치파일을 LocalMachine 저장소에 등록하도록 수정했다.
- 관리자 PowerShell에서 실행해야 한다.
- 등록 대상:
  - `LocalMachine\TrustedPeople`
  - `LocalMachine\Root`

## 검증한 내용

문법 확인:

```powershell
node --check app\main.js
node --check app\services\adbService.js
```

결과:

- 둘 다 통과했다.

ADB 일반 사용자 환경 확인:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" version
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

결과:

- ADB 버전 출력 정상
- 단말 `R3CN90NGRZ` 정상 인식

0.0.9 APPX 빌드:

```powershell
npm run dist:msix:norebuild
```

결과:

- `dist\electron\GroundView-0.0.9.appx` 생성 완료

## 0.0.9 결과 분석 및 0.0.10 대응

### 0.0.9 로그 결과 (2026-04-27)

0.0.9 설치 후 로그 확인 결과, `cwd`/`PATH` 보정에도 불구하고 동일한 실패가 계속됐다.

```text
[adb] verify failed path=C:\Users\dwonh\AppData\Local\Android\Sdk\platform-tools\adb.exe status=3221225781 error= output=
[adb] listDevices error ... message=command failed with code 3221225781
```

### 근본 원인 확정

PE 임포트 테이블 분석으로 `adb.exe` (PE32, 32비트)의 의존 DLL을 확인했다:

```
adb.exe → ADVAPI32.dll, dbghelp.dll, IPHLPAPI.DLL, KERNEL32.dll, ntdll.dll,
           SHELL32.dll, USER32.dll, WS2_32.dll, wlanapi.dll, bcryptprimitives.dll,
           api-ms-win-crt-*.dll (API set), AdbWinApi.dll
AdbWinApi.dll → ole32.dll, KERNEL32.dll, SETUPAPI.dll
```

모든 DLL은 `SysWOW64`(32비트 시스템) 또는 `platform-tools` 폴더에 존재한다.
일반 `node.exe`에서 동일한 `spawnSync` 호출은 정상 작동했다.

**확정된 원인**:  
MSIX(Desktop AppX Container) 컨텍스트에서 자식 프로세스를 생성하면 해당 프로세스도
동일 컨테이너(이벤트 로그 ID 211: "프로세스를 추가했습니다")에 속하게 된다.  
이 컨텍스트에서 `%LocalAppData%\Android\Sdk\platform-tools\AdbWinApi.dll`처럼
**user AppData 경로의 DLL 로딩이 제한**되어 `0xC0000135(STATUS_DLL_NOT_FOUND)`로
프로세스가 시작 직후 종료된다.

`cwd`/`PATH` 보정이 효과 없었던 이유:
- Windows DLL 검색 순서 1위는 "exe의 디렉터리"로 `cwd`와 무관하다.
- `AdbWinApi.dll`은 이미 exe 디렉터리(platform-tools)에 있으므로 경로 탐색 자체는 성공한다.
- 그러나 MSIX 컨테이너 정책에 의해 user AppData 경로의 DLL이 실제 로드 단계에서 차단된다.

### 0.0.10 대응 (번들 ADB)

**해결책**: `adb.exe` + 의존 DLL을 MSIX 패키지 내부(`resources/adb/`)에 번들링한다.  
패키지 설치 디렉터리(`C:\Program Files\WindowsApps\...`)는 MSIX가 신뢰하는 경로이므로
DLL 로딩 제한이 적용되지 않는다.

#### 변경 파일

- `scripts/bundle-adb.js` (신규)
  - Android SDK `platform-tools`에서 adb 바이너리를 `resources/adb/`로 복사
  - `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `%LOCALAPPDATA%\Android\Sdk` 순으로 탐색

- `package.json`
  - `extraResources`에 `resources/adb` 추가
  - `bundle-adb` npm 스크립트 추가
  - `dist:msix`에 `node scripts/bundle-adb.js` 단계 추가

- `app/main.js`
  - `preloadAdbFromSettings()`: MSIX에서 번들 adb 최우선 사용
  - `scanAdbPaths()`: MSIX에서 `resources/adb/adb.exe`를 후보 1순위로 추가

#### 번들 파일 (resources/adb/)

| 파일 | 크기 | 역할 |
|------|------|------|
| `adb.exe` | ~8.3 MB | ADB 클라이언트/서버 바이너리 (PE32) |
| `AdbWinApi.dll` | ~106 KB | ADB Windows API |
| `AdbWinUsbApi.dll` | ~72 KB | ADB Windows USB API |
| `libwinpthread-1.dll` | ~237 KB | MinGW pthread 런타임 |

라이선스: Android Open Source Project (Apache License 2.0)

#### 빌드 방법

```powershell
node scripts/bundle-adb.js   # adb 파일 복사 (최초 1회)
npm run dist:msix:norebuild  # APPX 빌드
.\sign_groundview_008_appx.bat  # 서명 및 설치
```

또는 전체 빌드:

```powershell
npm run dist:msix
```

## 변경 파일 목록


### 제품 코드

- `app/main.js`
  - ADB 진단 로그 추가
  - settings 경로/ADB preload 로그 추가
  - `X_OK` 검증을 `F_OK`로 변경
  - ADB 자동 탐지 후보 추가
  - ADB 검증 실패 로그 추가
  - ADB IPC 핸들러별 로그 추가
  - 환경 진단 로그 추가
  - ADB 실행 시 `cwd`/`PATH` 보정 적용 (0.0.9)
  - MSIX 번들 adb 최우선 사용 추가 (0.0.10)

- `app/services/adbService.js`
  - `adbSpawnOptions()` 추가
  - ADB 실행 시 `cwd`를 `platform-tools`로 지정
  - `PATH` 앞에 `platform-tools` 경로 추가
  - `runSpawn()`, `runAdbToFile()`에 적용

### 빌드 스크립트 (신규)

- `scripts/bundle-adb.js`
  - Android SDK에서 adb 바이너리를 `resources/adb/`로 복사

- `resources/adb/`
  - `adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`, `libwinpthread-1.dll`

### 버전/패키징

- `package.json`
  - 버전 `0.0.9`로 변경

- `package-lock.json`
  - 루트 패키지 버전 `0.0.9`로 변경

- `sign_groundview_008_appx.bat`
  - 테스트 서명 인증서 생성/재사용
  - LocalMachine 신뢰 등록
  - 최신 APPX 자동 선택
  - 서명/검증/설치 자동화

### 개발 환경

- `.venv/pyvenv.cfg`
  - Python home 경로 수정

- `.vscode/settings.json`
  - VS Code Python interpreter 및 Pylance 경로 설정

### 빌드 산출물

- `dist\electron\GroundView-0.0.8.appx`
  - 진단 로그 포함 테스트 빌드

- `dist\electron\GroundView-0.0.9.appx`
  - ADB 실행 환경 보정 포함 테스트 빌드

## 남은 확인 사항

0.0.10 빌드 후 확인할 것:

1. 앱 실행 후 `groundview.log`에서 `preload using bundled adb (MSIX)` 로그 확인.
2. `verify failed` 없이 `adb version`이 정상 출력되는지 확인.
3. `adb:listDevices ok count=1` 또는 단말 정보가 찍히는지 확인.
4. 단말 목록 UI에 `SM_G991N` 또는 `R3CN90NGRZ`가 표시되는지 확인.
5. 캡처 동작 시 `capture result` 로그가 생성되는지 확인.

## 운영 메모

- MSIX 설치본이 실행 중이면 개발 서버의 `MODEL_PORT=5005`와 충돌할 수 있다.
- 개발 중 `npm run dev` 실패 시 먼저 `5005` 포트를 점유한 프로세스를 확인한다.
- 테스트 인증서를 LocalMachine Root에 등록했으므로 테스트 PC에서만 사용해야 한다.
- 테스트 완료 후 인증서를 제거하려면 `certlm.msc`에서 아래 저장소를 확인한다.
  - Trusted Root Certification Authorities
  - Trusted People


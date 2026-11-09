# macOS 개발·빌드·배포 가이드

> 2026-11-09 기준 · Appkium Inspector v0.0.10

Windows와 macOS는 이 저장소의 공용 코드베이스를 사용합니다. 과거 포팅 작업 목록은 Git 이력에 보존돼 있으며, 이 문서는 현재 실행·배포 절차를 설명합니다.

## 개발 실행

Node.js 18 이상과 Python 3.10 이상이 필요합니다. 고정 Python 의존성에는 3.10–3.12 환경을 권장합니다.

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run dev
```

또는 `./setup_dev.sh`로 환경을 준비합니다. `scripts/dev-backend.js`는 `PYTHON_BIN`, 프로젝트 `.venv`/`venv`, PATH의 `python3`/`python` 순으로 실행 파일을 찾습니다. 렌더러는 3000, 백엔드는 5005 포트를 사용합니다.

ADB는 앱의 환경 설정에서 탐지·다운로드하거나 설치된 Android SDK의 `platform-tools/adb`를 선택합니다.

## 구현된 플랫폼 처리

| 영역 | 현재 구현 |
| --- | --- |
| ADB 타임아웃 | POSIX 프로세스 그룹 종료 |
| 앱 종료 | 앱이 사용하는 ADB 경로로 서버 종료 |
| Python | 번들이 없으면 시스템 Python 기반 앱 전용 venv 구성 |
| ZIP | macOS `zip`/`unzip`으로 덤프 저장·불러오기 |
| 개발 런처 | 크로스플랫폼 Python 탐색 |
| 패키징 | arm64·x64 DMG/ZIP, icns, hardened runtime, entitlements |
| 설정 | 기존 GroundView 설정 마이그레이션, macOS ADB 안내 |

`resources/groundview-service.apk`는 Mac에 연결한 Android 기기에 설치하는 공용 리소스입니다. `bundle-python.js`와 `bundle-adb.js`는 Windows 전용 번들 작업이며 macOS에서는 건너뜁니다.

`extraResources`는 `resources/`를 포함합니다. Windows 번들(`resources/python-bundle/`, `resources/adb/`)이 남아 있는 작업 폴더로 macOS 패키지를 만들면 불필요한 파일이 포함될 수 있으므로, 배포에는 해당 산출물이 없는 깨끗한 체크아웃을 사용하세요.

## 검사 및 패키징

```bash
npm run check
npm run dist:mac
```

현재 버전의 결과물:

- `dist/electron/Appkium Inspector-0.0.10-arm64.dmg`
- `dist/electron/Appkium Inspector-0.0.10.dmg` (Intel)
- 같은 디렉터리의 arm64·x64 ZIP

`dist:mac:norebuild`는 기존 렌더러 산출물을 사용하므로 소스를 변경한 뒤에는 `dist:mac`을 사용합니다. macOS 빌드·서명·공증은 Mac에서 수행합니다.

## 서명과 공증

키체인에 배포용 **Developer ID Application** 인증서와 개인키가 필요합니다. 개인 계정 정보는 문서나 `package.json`에 고정하지 않고 환경변수와 키체인 프로필로 관리합니다.

아래 변수에는 실제 배포 계정 값을 넣습니다. 이 예시는 기존 저장소의 배포 절차를 정리한 것이며 이번 문서 정리에서 재실행하지 않았습니다.

```bash
export APPKIUM_SIGNER='Developer ID Application: YOUR NAME (TEAM_ID)'
export APPKIUM_APPLE_ID='your-apple-id@example.com'
export APPKIUM_TEAM_ID='YOUR_TEAM_ID'
export APPKIUM_VERSION="$(node -p 'require("./package.json").version')"

# 인증서 확인 및 서명 빌드
security find-identity -v -p codesigning
CSC_NAME="$APPKIUM_SIGNER" npm run dist:mac

# 최초 1회: 비밀번호는 notarytool의 입력 프롬프트에서 제공
xcrun notarytool store-credentials 'appkium-notary' \
  --apple-id "$APPKIUM_APPLE_ID" --team-id "$APPKIUM_TEAM_ID"

for dmg in "dist/electron/Appkium Inspector-${APPKIUM_VERSION}-arm64.dmg" \
           "dist/electron/Appkium Inspector-${APPKIUM_VERSION}.dmg"; do
  codesign --force --timestamp --sign "$APPKIUM_SIGNER" "$dmg"
  xcrun notarytool submit "$dmg" --keychain-profile 'appkium-notary' --wait
  # 결과가 Accepted인지 확인한 뒤 진행
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  spctl -a -vv -t open --context context:primary-signature "$dmg"
done
```

이 절차는 DMG 대상입니다. ZIP도 공개 배포한다면 해당 앱 번들에 대한 공증·배포 검증을 별도로 완료하세요. 빌드 파일이 존재하는 것만으로 서명이나 공증 완료를 판단하지 않습니다.

## 설치 후 수동 확인

- [ ] 앱 실행과 Python 백엔드 시작
- [ ] ADB 자동 탐지·선택, USB·무선 디바이스 연결
- [ ] APK 자동 설치·업그레이드와 접근성 권한 안내
- [ ] 일반 화면·Compose·팝업·다이얼로그·바텀시트 캡처
- [ ] ZIP 내보내기 및 Load ZIP File
- [ ] 디바이스 정보, capabilities·로케이터 코드 복사
- [ ] Gemini OCR 및 로케이터 제안
- [ ] 설정 저장·복원, 기존 GroundView 설정 마이그레이션
- [ ] 앱 종료 후 백엔드·ADB 잔류 확인

전체 프로젝트 상태는 [STATUS.md](STATUS.md), 데이터 제거 방법은 [UNINSTALL.md](../UNINSTALL.md)를 참고하세요.

# Appkium Inspector 제거 및 데이터 정리

앱을 종료한 뒤 운영체제의 기본 제거 방법을 사용합니다. 설정·API 키·캡처가 필요한 경우 먼저 보관하세요. 사용자 데이터 삭제 후에는 설정을 다시 입력해야 합니다.

## Windows

설정 → 앱 → 설치된 앱에서 **Appkium Inspector**를 제거합니다. 이전 버전은 **GroundView**라는 이름으로 표시될 수 있습니다.

설치 프로그램의 제거 동작과 별개로, 완전 초기화가 필요하면 다음 경로를 확인하고 해당 앱의 데이터만 삭제합니다.

| 경로 | 내용 |
| --- | --- |
| `%APPDATA%\Appkium Inspector` | 현재 제품의 설정·로그·런타임 데이터 |
| `%APPDATA%\GroundView` | 이전 제품명으로 저장된 데이터 |
| `%LOCALAPPDATA%\Appkium Inspector`, `%LOCALAPPDATA%\GroundView` | 해당 경로가 존재하는 경우 캐시 등 |

MSIX로 설치했다면 사용자 데이터가 패키지별 경로로 리디렉션될 수 있습니다. 위 경로만 삭제했다고 완전 제거로 판단하지 말고 Windows의 해당 앱 설정도 확인하세요.

기존 `clean_groundview.bat`·`clean_groundview.ps1`은 구 제품명 경로 중심의 스크립트입니다. 현재 제품의 모든 데이터 제거를 보장하지 않습니다.

## macOS

응용 프로그램 폴더에서 **Appkium Inspector.app**을 휴지통으로 이동합니다. 사용자 데이터 초기화가 필요하면 다음 경로를 확인합니다.

- `~/Library/Application Support/Appkium Inspector`
- `~/Library/Application Support/GroundView` (이전 버전)
- `~/Library/Caches/Appkium Inspector`, `~/Library/Caches/GroundView`
- `~/Library/Logs/Appkium Inspector`, `~/Library/Logs/GroundView`

저장소의 `./clean_appkium.sh`는 확인 입력 후 현재·이전 제품명 데이터, 과거 PaddleOCR 캐시, 개발용 `user-data/`를 삭제합니다. 앱 자체나 사용자가 다른 위치에 저장한 ZIP 파일은 제거하지 않습니다.

## 개발 데이터 및 Android 서비스

개발 실행 데이터는 저장소의 `user-data/`에 있습니다. 소스나 Git 커밋에는 포함하지 않습니다. 직접 내보낸 ZIP은 저장한 위치에서 별도로 관리합니다.

Android 기기에 설치된 **Appkium Inspector Service**는 PC 앱 제거 후에도 남습니다. 필요 없다면 기기의 앱 설정에서 제거하세요. 패키지 ID는 `com.groundview.service`입니다.

# Appkium Inspector Service

Android 접근성 트리를 XML로 제공하는 보조 APK입니다. 현재 소스 버전은 **1.3.0** (`versionCode 4`), 패키지 ID는 `com.groundview.service`입니다.

## 동작

- Compose 앱이 접근성 트리에 노출하는 노드를 포함해 캡처
- 접근 가능한 인터랙티브 윈도우를 합쳐 팝업·다이얼로그·바텀시트 수집
- 서비스 자체 오버레이 제외, 최대 깊이 60·노드 12,000개로 순회 제한
- NanoHTTPD HTTP 서버: `GET /status`, `GET /source` (포트 9800)

접근성 서비스가 모든 Compose 내부 요소를 볼 수 있는 것은 아닙니다. 결과는 대상 앱의 semantics·접근성 노출 상태에 따라 달라집니다.

## 빌드

Android Studio에서 이 디렉터리를 열고 SDK를 설정합니다. 현재 설정은 compile/target SDK 34, min SDK 26입니다. 개인별 `sdk.dir`을 담는 `local.properties`는 Git에 포함하지 않습니다.

```bash
# groundview-service/에서 실행 (Windows: gradlew.bat)
./gradlew assembleDebug
```

산출물: `app/build/outputs/apk/debug/app-debug.apk`

데스크톱 앱은 저장소의 `resources/groundview-service.apk`를 사용합니다. 서비스 변경을 배포하려면 새 APK를 기기에서 검증한 뒤 해당 리소스를 갱신해야 합니다. 이번 문서·저장소 정리에서는 APK를 재빌드하지 않았습니다.

## 설치 및 활성화

Appkium Inspector에서 Capture를 실행하면 APK 설치·업그레이드를 처리합니다. 기기 설정 → 접근성에서 **Appkium Inspector Service**를 한 번 활성화하세요.

수동으로 확인할 경우 저장소 루트에서:

```bash
adb install -r resources/groundview-service.apk
adb forward tcp:9800 tcp:9800
curl http://127.0.0.1:9800/status
curl http://127.0.0.1:9800/source
```

서비스가 준비되지 않으면 데스크톱 앱은 기존 `uiautomator dump` 경로를 사용합니다. 접근성 권한 활성화와 다중 윈도우 캡처는 실제 Android 기기에서 확인해야 합니다.

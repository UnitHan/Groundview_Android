# GroundView Accessibility Service APK

Compose 앱 포함 전체 접근성 트리를 HTTP API로 노출하는 경량 Android 서비스.

## 아키텍처

```
[AccessibilityService]
  ├─ FLAG_INCLUDE_NOT_IMPORTANT_VIEWS (Compose 내부 노드 포함)
  ├─ FLAG_RETRIEVE_INTERACTIVE_WINDOWS (다중 윈도우)
  ├─ FLAG_REPORT_VIEW_IDS (resource-id 포함)
  ├─ 접근성 트리 DFS 순회 → uiautomator dump 호환 XML
  └─ NanoHTTPD HTTP 서버 (port 9800)
       ├─ GET /status  → {"ready":true}
       └─ GET /source  → XML (uiautomator dump 호환)
```

## 빌드

Android Studio에서 `groundview-service/` 폴더를 열고:

```bash
./gradlew assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## 설치 및 활성화

```bash
adb install -r app-debug.apk
```

1. 디바이스에서 GroundView Service 앱 실행
2. "접근성 설정 열기" 버튼 클릭
3. GroundView Service 활성화

## GroundView 연동

```bash
adb forward tcp:9800 tcp:9800
curl http://127.0.0.1:9800/status   # {"ready":true}
curl http://127.0.0.1:9800/source   # XML
```

## uiautomator dump와의 차이

| 항목 | uiautomator dump | GroundView Service |
|------|:---:|:---:|
| Compose 지원 | ❌ ComposeView만 | ✅ 내부 노드 포함 |
| 접근 방식 | UiAutomation (간접) | AccessibilityService (직접) |
| 다중 윈도우 | ❌ | ✅ |
| XML 포맷 | hierarchy/node | 동일 (호환) |
| 속도 | ~2초 | ~0.5초 |

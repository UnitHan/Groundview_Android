## v0.0.5 - Jetpack Compose 지원

### 주요 변경사항

**Jetpack Compose 앱 UI 요소 탐지 지원**
- GroundView Service APK (Android 접근성 서비스) 추가
- Compose 내부 노드 포함 전체 접근성 트리를 HTTP API로 제공 (port 9800)
- Capture 버튼 클릭 시 APK 자동 설치 및 접근성 권한 안내
- 최초 1회 접근성 권한 활성화 후 자동 동작

**무선 ADB 연결 지원**
- IP:port 형태 디바이스에서 포트 포워딩 없이 직접 HTTP 접근

**UI 개선**
- DevicesPage에 GroundView Service 상태 배너 추가
- Select ADB 버튼 연타 방지 처리

**기타**
- uiautomator dump fallback 유지 (GV Service 미활성화 시)
- README 한국어 최신화

### 설치 방법
1. `GroundView-Setup-0.0.5.exe` 실행
2. ADB 경로 설정
3. 디바이스 연결 후 Capture — 최초 실행 시 GroundView Service 접근성 권한 활성화 안내

### 시스템 요구사항
- Windows 10/11 x64
- Python 3.10+ (자동 설치)
- ADB (Android Debug Bridge)

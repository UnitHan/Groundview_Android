## v0.0.10 - Appkium Inspector 리브랜딩 & 팝업/Compose 탐지 정확도 개선

### 주요 변경사항

**macOS 지원 (단일 코드베이스에서 Windows/macOS 동시 빌드)**
- ADB 타임아웃 프로세스 정리: macOS/Linux에서 프로세스 그룹 단위 강제 종료(detached spawn)로 고아 adb 방지
- 앱 종료 시 앱이 실제 사용하는 adb 경로로 `kill-server` 실행 (PATH에 adb가 없어도 정리됨)
- Python 런타임: 번들 파이썬이 없는 macOS/Linux에서 시스템 `python3` 기반 **전용 venv 자동 생성** — 시스템 site-packages 오염/PEP 668 오류 없음
- 덤프 ZIP 가져오기/내보내기를 플랫폼별로 분기 (`unzip`/`zip`), 기존 PowerShell 전용 경로 제거
- `dist:mac` 빌드 스크립트 + `build.mac`(icns 아이콘·hardenedRuntime·entitlements·arm64/x64 dmg/zip) 추가
- `npm run dev` 크로스플랫폼화 (`dev:py` 런처가 venv/`python3` 자동 해석)
- 환경 설정 진단 모달에 macOS용 ADB 설치 안내(Homebrew/SDK 경로) 추가
- Pillow 10.3.0 → 10.4.0 (Python 3.13 wheel 지원, Windows 3.10 번들도 계속 지원)



**제품명 변경: GroundView → Appkium Inspector**
- 앱 표시명, 설치 프로그램(NSIS/MSIX) 표시명, 바로가기 이름 변경
- Android 접근성 서비스 표시명 변경 (`Appkium Inspector Service`)
- 기존 `GroundView` userData 폴더의 설정을 신규 경로로 자동 마이그레이션 — 재설정 불필요
- 한국어/영어 UI 문구 및 약관 텍스트 전면 반영

**팝업·다이얼로그·바텀시트 탐지 (접근성 서비스 v1.3.0)**
- `rootInActiveWindow` 단일 덤프 → 접근 가능한 **전체 인터랙티브 윈도우 병합 덤프**로 전환
- 메인 윈도우 + 플로팅 팝업 + 시스템 UI를 하나의 hierarchy로 합침 (z-order 오름차순 정렬)
- 서비스 자체 오버레이 윈도우는 덤프에서 제외
- Compose 지연 semantics 대응 — 첫 조회 시 통짜 노드로 잡히는 문제를 서비스 측에서 흡수
- 순회 안전 상한 도입 (`MAX_DEPTH=60`, `MAX_NODES=12000`) — 비정상적으로 큰 트리에서의 행/타임아웃 방지
- APK 버전 자동 확인 후 구버전이면 재설치

**클릭 불가 라벨 로케이터 승격**
- 각 노드에 가장 가까운 클릭 가능 상위 요소 스냅샷(`clickableAncestor`) 부착
- Compose처럼 텍스트는 클릭 불가 라벨이고 실제 클릭은 부모 View에 있는 경우, 상위 요소 기준으로 로케이터 생성
- 동적 ID(해시·temp 접미사) 감지해 불안정한 resource-id 회피

**AI 코드 생성 프롬프트 강화**
- 클릭 불가 라벨 → `clickable(true).childSelector(...)` 승격 규칙 추가
- 화면 상태 의존 요소 판별 및 "상태 앵커 게이팅" 코드 생성 규칙 추가
- 상태 의존 요소는 stability를 medium 이하로 평가하도록 지시

**디바이스 정보 모달 (신규)**
- 디바이스 모델/Android 버전/UDID/현재 포그라운드 앱 패키지·액티비티 조회
- Appium capabilities 코드 자동 생성 (Python / Java) 및 클립보드 복사

**기타**
- 모든 모달에 ESC 닫기 지원 (`useEscClose` 훅, capture 단계 등록으로 최상단 모달만 닫힘)
- ADB 준비 대기(`waitForAdbReady`) 및 프로세스 정리 로직 추가 — 연결 직후 명령 실패 완화
- `Appkium_iOS/` 를 `.gitignore` 에 추가 (별도 프로젝트)
- 리포지토리 루트의 셸 리다이렉트 사고로 생성된 빈 파일 제거

### 시스템 요구사항
- Windows 10/11 x64
- Python 3.10+ (자동 설치)
- ADB (Android Debug Bridge)

---

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

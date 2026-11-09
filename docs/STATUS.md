# 프로젝트 상태

> 확인일: 2026-11-09 · 소스 버전: 0.0.10 · 제품명: Appkium Inspector

## 구현 상태

- Android ADB 캡처, 스크린샷·XML 탐색, 로케이터 생성·점수화, Python/Java 코드 생성
- 접근성 서비스 v1.3.0: Compose 접근성 노드, 다중 윈도우 덤프, 클릭 가능한 부모 요소 기준 로케이터
- Gemini OCR·로케이터 제안, ZIP 내보내기·불러오기, 디바이스 정보·capabilities 표시
- Windows/macOS 공용 코드베이스, macOS Python 가상환경·ZIP 처리·ADB 프로세스 정리
- Windows NSIS/APPX 및 macOS arm64/x64 DMG/ZIP 패키징 설정

2026-08-14까지의 기능 변경은 [릴리스 노트](../release-notes.md)에 정리돼 있습니다.

## 저장소 정리

- 사용하지 않는 React 화면 백업 3개, 임시 캡처, 진단 파일, 중복 로고·라이선스 백업, 미사용 Python 설치 파일 제거
- 개발자별 Android SDK 경로인 `groundview-service/local.properties`는 로컬에만 보관
- Vitest 수집 범위를 `core/src`와 `desktop/src`로 한정해 별도 iOS 프로젝트 혼입 방지
- 설정 UI·동의 모달·macOS 안내 번역의 타입 오류 수정
- `npm run typecheck`와 `npm run check` 추가

## 검증 범위

2026-11-09 로컬 실행에서 아래 세 검사 모두 통과했습니다.

| 검사 | 범위 |
| --- | --- |
| `npm run typecheck` | tsconfig에 포함된 TypeScript 소스 |
| `npm test` | 로케이터 2개 + 오버레이 4개 단위 테스트 |
| `npm run build` | Vite 프론트엔드 프로덕션 번들 |

이 검사는 Electron 앱 전체, Python API, Android APK, 설치 프로그램의 통합 검증을 대신하지 않습니다. `backend/test_*.py`는 로컬 설정 또는 외부 API를 사용하는 수동 진단 스크립트입니다.

## 다음 배포 전 확인

- [ ] Windows와 macOS에서 앱·백엔드 시작 및 종료 확인
- [ ] USB·무선 ADB 연결, 캡처, Compose·팝업 요소 탐지
- [ ] ZIP 저장·불러오기, 설정 저장·기존 GroundView 데이터 마이그레이션
- [ ] Gemini OCR·로케이터 요청과 오류 처리
- [ ] 최신 커밋으로 설치 파일 재생성 후 클린 환경에서 설치·실행
- [ ] macOS 서명·공증 및 Windows Store 제출 상태 확인

과거 macOS 산출물이 로컬에 존재하더라도 최신 커밋이 포함됐다는 의미는 아닙니다. Windows Store 기록의 미체크 항목 역시 현재 심사 상태를 확정하는 근거가 아닙니다.

## 별도 과제

iOS/WDA 완전 지원과 실기기 검증, OCR·XML bounds 통합, CLI는 현재 완료로 표시하지 않습니다. `ios/`는 이식용 자료를 포함하며, Git에서 제외된 `Groundview_iOS/` 별도 프로젝트의 상태는 이 문서의 범위 밖입니다.

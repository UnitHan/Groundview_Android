# GroundView — Jetpack Compose 대응 & 하이브리드 모드 분석 보고서

> **기록 안내 (2026-11-09):** 2026년 3월의 설계·분석 자료입니다. 이후 접근성 서비스 v1.3.0에 다중 윈도우 덤프 등이 구현됐습니다. 현재 서비스 동작은 [서비스 README](../groundview-service/README.md)를 참고하세요.

> 작성일: 2026-03-27  
> 분석 대상: `c:\Groundview` 전체 소스  
> 목적: Compose 앱 UI 요소 미탐지 원인 분석 / Android 접근성 기반 덤프 도입 가능성 / 하이브리드 모드 현황 파악 및 요구사항 도출

---

## 목차

1. [현재 아키텍처 요약](#1-현재-아키텍처-요약)
2. [Jetpack Compose 앱에서 요소가 잡히지 않는 원인](#2-jetpack-compose-앱에서-요소가-잡히지-않는-원인)
3. [Android 접근성 기반 UI 덤프 — 현황 및 가능성 분석](#3-android-접근성-기반-ui-덤프--현황-및-가능성-분석)
4. [하이브리드 모드 현황](#4-하이브리드-모드-현황)
5. [해결 방향 및 구체적 요구사항](#5-해결-방향-및-구체적-요구사항)
6. [구현 우선순위 및 로드맵](#6-구현-우선순위-및-로드맵)
7. [리스크 및 제약사항](#7-리스크-및-제약사항)

---

## 1. 현재 아키텍처 요약

### 1.1 데이터 흐름

```
[Electron Renderer (React)]
  ↓ IPC (preload bridge)
[Electron Main — app/main.js]
  ↓
[app/services/adbService.js]   ←── adb 명령 직접 실행
  ├─ adb exec-out screencap -p  → screenshot.png
  ├─ adb shell uiautomator dump --compressed /sdcard/view.xml
  ├─ adb shell uiautomator dump /sdcard/view_raw.xml
  └─ 두 XML 중 바이트 더 큰 것 선택 (pickXml)
  ↓ CaptureResult { screenshotPath, xmlPath, ... }
[desktop/src/renderer/store.tsx]
  ├─ buildTree(xml) → UiNode[] 트리
  └─ generateLocators(samples) → LocatorSuggestion[]

[보조 OCR — HTTP]
  ↓ localhost:5005/gemini_ocr
[backend/server.py → webview_ocr.py]
  └─ Gemini Vision API → HTML 텍스트 반환
```

### 1.2 플랫폼별 기능 현황

| 기능                     | Android          | iOS               |
|--------------------------|:----------------:|:-----------------:|
| 디바이스 목록             | ✅ `adb devices` | macOS 전용        |
| 스크린샷                  | ✅               | macOS 전용        |
| UI 계층 XML 덤프          | ✅ uiautomator   | WDA /source       |
| Jetpack Compose 지원      | ⚠️ 부분 누락     | N/A               |
| Android 접근성 직접 API   | ❌ 미구현         | N/A               |
| 하이브리드 모드 (OCR+XML) | ❌ 미구현         | ❌ 미구현          |
| Gemini OCR               | ✅               | ✅                |
| AI 로케이터 생성          | ✅               | ✅                |

---

## 2. Jetpack Compose 앱에서 요소가 잡히지 않는 원인

### 2.1 근본 원인: uiautomator dump의 구조적 한계

현재 코드(`app/services/adbService.js`)는 UI 계층 획득에 `uiautomator dump`만 사용합니다.

```bash
# 현재 capture() 내부 실행 순서
adb shell uiautomator dump --compressed /sdcard/view.xml   # 1순위
adb shell uiautomator dump /sdcard/view_raw.xml            # 2순위 (병렬)
adb shell uiautomator dump                                 # fallback
```

**문제**: `uiautomator dump`는 Android의 `AccessibilityNodeInfo` 트리를 XML로 직렬화합니다.  
전통적인 View 시스템(`android.widget.*`)은 기본적으로 접근성 트리에 모든 요소를 노출하지만,  
**Jetpack Compose**는 `@Semantics{}` 블록이 **명시적으로 선언된 노드만** 트리에 노출합니다.

### 2.2 Compose 노드가 사라지는 단계별 분석

```
[Compose UI 렌더 엔진]
  │  Semantics 미선언 노드 → AccessibilityNodeInfo 생성 안 됨
  ↓
[uiautomator dump XML]
  │  ComposeView 하나 또는 빈 계층만 출력됨
  ↓
[store.tsx — buildTree → isCandidate()]
  │  cls, rid, desc, text 모두 비어있으면 필터링
  ↓
[Overlay.tsx — shouldIgnoreNode()]
  │  화면 90% 이상 차지 노드 제거 (Compose 루트 컨테이너 탈락)
  ↓
[결과: 트리가 비어있거나 최소 노드만 보임]
```

### 2.3 isCandidate 필터 위치 (store.tsx)

```typescript
// 핵심 필터 — 이 조건을 통과하지 못하면 트리에서 제거됨
const isCandidate = (el: Element): boolean => {
  const cls = el.getAttribute('class') || '';
  const rid = el.getAttribute('resource-id') || '';
  const desc = el.getAttribute('content-desc') || '';
  const text = el.getAttribute('text') || '';
  return !!(cls || rid || desc || text);
};
```

Compose의 시맨틱 미선언 노드는 `class`조차 `androidx.compose.ui.platform.ComposeView`로만  
잡히고, `resource-id`, `content-desc`, `text`는 전부 비어있습니다.

### 2.4 `--compressed` 옵션의 추가 문제

`--compressed` 플래그는 접근성 트리의 중간 계층을 병합(합산)합니다.  
Compose 계층은 이미 최소한의 노드만 노출되므로, 병합 시 더 많은 요소가 사라집니다.  
현재 코드는 `--compressed`를 **1순위**로 시도하므로 Compose 앱에서 가장 불리합니다.

---

## 3. Android 접근성 기반 UI 덤프 — 현황 및 가능성 분석

### 3.1 현재 구현 상태

> **결론: Android 접근성 API를 직접 사용하는 코드는 현재 전혀 없습니다.**

현재 코드에는 다음이 없습니다:
- `AccessibilityService` APK 설치/연동
- `adb shell dumpsys accessibility` 파싱
- `uiautomator2` 서버 직접 통신 (Appium 드라이버 없이)
- `adb shell am` 을 통한 접근성 이벤트 트리거

### 3.2 Android 접근성 기반 덤프 방법 — 기술 스펙 비교

다음은 현재 방식과 대안을 비교한 표입니다.

| 방법 | 인프라 필요 | Compose 지원 | 속성 풍부도 | 구현 난이도 | 보안/제약 |
|------|:-----------:|:------------:|:-----------:|:-----------:|:---------:|
| **현재: uiautomator dump** | ADB만 | ⚠️ 부분 | 중간 | 완료 | 없음 |
| **uiautomator2 HTTP 서버** | APK 설치 필요 | ✅ 좋음 | 높음 | 중간 | 없음 |
| **AccessibilityService APK** | APK + 설정 필요 | ✅ 매우 좋음 | 매우 높음 | 높음 | 설정 허용 필요 |
| **adb shell uiautomator (Java API 직접)** | ADB만 | ✅ 좋음 | 높음 | 낮음 | 없음 |
| **ViewHierarchy / Accessibility Tree via adb** | ADB만 | ⚠️ 중간 | 중간 | 낮음 | 없음 |

### 3.3 가장 현실적인 접근: uiautomator2 HTTP 서버 연동

[Appium uiautomator2 서버](https://github.com/appium/appium-uiautomator2-server)는 디바이스에 APK로 설치되어
HTTP REST API를 제공합니다. Compose의 `@Semantics{}` 정보도 더 잘 노출합니다.

**연동 프로토콜 (ADB port forwarding 방식):**
```bash
# 1. APK 설치 (앱 종속성 없는 standalone)
adb install appium-uiautomator2-server-v*.apk

# 2. 포트 포워딩
adb forward tcp:6790 tcp:6790

# 3. 서버 시작 (한 번만)
adb shell am instrument -w \
  io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner

# 4. REST API 호출
GET  http://localhost:6790/wd/hub/session/{id}/source    → XML
GET  http://localhost:6790/wd/hub/session/{id}/screenshot → base64 PNG
```

이미 `app/services/wdaService.js`가 iOS에서 WDA HTTP API를 같은 방식으로 사용하므로  
**동일한 패턴**을 Android에 적용하면 됩니다.

### 3.4 속성 매핑표 (현재 속성 ↔ uiautomator2 속성)

현재 XML 파싱(`store.tsx`의 `buildTree`)에서 사용하는 속성명과  
uiautomator2 `/source` API 응답이 동일하므로 **코드 변경 최소화**가 가능합니다.

| 현재 XML 속성 | uiautomator2 속성 | Compose 지원 |
|--------------|-------------------|:------------:|
| `class` | `className` | ✅ (ComposeView 하위 계층 노출) |
| `resource-id` | `resourceId` | ✅ (testTag → resource-id 매핑) |
| `content-desc` | `contentDescription` | ✅ (semanticsLabel) |
| `text` | `text` | ✅ (semanticsText) |
| `bounds` | `bounds` | ✅ |
| `clickable` | `clickable` | ✅ |
| `enabled` | `enabled` | ✅ |

> **핵심**: Compose에서 `Modifier.semantics { testTag = "btn_ok" }`를 사용하면  
> uiautomator2는 이를 `resource-id`로 노출합니다. 현재 로케이터 생성 코드(`core/src/locator.ts`)를  
> **수정 없이** 사용할 수 있습니다.

### 3.5 ADB 직접 방식 대안: `adb shell uiautomator` Java 직접 실행

경량 대안으로, APK 없이 ADB를 통해 uiautomator Java 테스트를 직접 실행하여  
더 풍부한 접근성 트리를 얻을 수 있습니다. 단, Compose 지원은 uiautomator2보다 제한적입니다.

---

## 4. 하이브리드 모드 현황

### 4.1 현재 상태: "분리된 두 기능"

현재 UI에는 두 개의 별도 버튼이 존재합니다:
- **Capture** 버튼 → `uiautomator dump` XML + 스크린샷
- **Gemini OCR** 버튼 → 스크린샷을 Gemini Vision에 전송 → HTML 텍스트 반환 (별도 모달)

이 두 결과는 **서로 독립적**이며, 통합된 로케이터 파이프라인이 없습니다.

```
현재:
  [XML dump] ──→ [로케이터 생성] ──→ 코드 출력
  [OCR 결과] ──→ [OcrModal 텍스트 표시] (별도)

필요한 하이브리드:
  [XML dump] ───┐
                ├──→ [보완 로직] ──→ [강화된 로케이터] ──→ 코드 출력
  [OCR 결과] ───┘
```

### 4.2 하이브리드가 필요한 시나리오

| 시나리오 | XML dump 결과 | OCR 결과 | 하이브리드 기대값 |
|----------|:-------------:|:--------:|:----------------:|
| Compose 버튼 (`text=""`, `desc=""`) | bounds만 있음 | "확인" 텍스트 감지 | `content-desc="확인"` 로케이터 생성 |
| WebView 내 텍스트 | WebView 노드만 | 모든 텍스트 목록 | bounds + 텍스트 매핑 로케이터 |
| 동적 텍스트 (i18n) | text 있지만 변함 | 현재 텍스트 | 텍스트 기반 주석 + id 기반 로케이터 |
| 게임 UI (Canvas) | 요소 없음 | 텍스트/좌표 | 좌표 기반 fallback 로케이터 |

### 4.3 하이브리드 미구현 확인 근거

`store.tsx`의 `buildTreeFromXml()` 함수는 XML만 파싱하며, OCR 결과와 병합하는 로직이 없습니다.  
`backend/server.py`의 `/gemini_ocr`와 `/api/locator/gemini` 엔드포인트도 서로 독립적입니다.

---

## 5. 해결 방향 및 구체적 요구사항

### 5.1 단기 해결책: ADB dump 개선 (난이도: 낮음, 즉시 적용 가능)

#### 요구사항 A-1: `--compressed` 순서 변경

**문제**: 현재 `--compressed`를 1순위로 시도 → Compose 노드 더 많이 사라짐  
**해결**: `--compressed` 순서를 2순위로, uncompressed를 1순위로 변경

```javascript
// app/services/adbService.js — capture() 함수 수정
// 현재: dumpCompressed() 먼저 실행
// 변경: dumpUncompressed() 먼저 실행하고 compressed를 보조로
```

**영향 범위**: `app/services/adbService.js` — `capture()` 함수 내 시도 순서  
**기대효과**: Compose 앱에서 접근성 트리 노드 수 증가

#### 요구사항 A-2: `isCandidate()` 기준 완화

**문제**: `class`만 있고 나머지가 비어있으면 필터링됨  
**해결**: bounds가 있고 clickable/enabled인 노드는 class만으로도 후보 포함

```typescript
// desktop/src/renderer/store.tsx — isCandidate 수정
const isCandidate = (el: Element): boolean => {
  const cls = el.getAttribute('class') || '';
  const rid = el.getAttribute('resource-id') || '';
  const desc = el.getAttribute('content-desc') || '';
  const text = el.getAttribute('text') || '';
  const bounds = el.getAttribute('bounds') || '';
  const clickable = el.getAttribute('clickable') === 'true';
  // Compose 대응: bounds 있고 clickable이면 class만으로도 후보
  if (bounds && clickable) return true;
  return !!(cls || rid || desc || text);
};
```

---

### 5.2 중기 해결책: uiautomator2 HTTP 서버 모드 (난이도: 중간)

#### 요구사항 B-1: uiautomator2 서버 설치/시작 기능

`app/services/adbService.js`에 새로운 함수 추가:

```javascript
// 신규 함수
async function startUiautomator2Server(deviceId) { ... }
async function captureViaUiautomator2(deviceId) { ... }
async function checkUiautomator2Health(deviceId) { ... }
```

- uiautomator2 APK 설치 여부 확인 → 없으면 자동 다운로드 및 설치
- ADB port forwarding 설정 (`adb forward tcp:6790 tcp:6790`)
- HTTP GET `/wd/hub/session/:id/source` → XML 획득
- 기존 `capture()` 함수에 fallback 체인으로 연결

#### 요구사항 B-2: 포트 관리 및 충돌 방지

```typescript
// core/src/ports.ts 에 uiautomator2 포트 상수 추가
export const UIAUTOMATOR2_PORT = 6790;
```

#### 요구사항 B-3: CaptureResult 타입 확장

```typescript
// core/src/types.ts
export interface CaptureResult {
  // 기존 필드 유지
  screenshotPath: string;
  xmlPath?: string;
  // 신규 추가
  captureMethod?: 'uiautomator-dump' | 'uiautomator2-server' | 'wda';
  composeDetected?: boolean;   // Compose 앱 감지 여부
}
```

---

### 5.3 하이브리드 모드 구현 요구사항 (난이도: 중간~높음)

#### 요구사항 C-1: OCR 결과 ↔ XML 노드 bounds 매핑

OCR 결과의 텍스트를 XML 트리 노드의 bounds와 공간적으로 매핑하여  
`content-desc`/`text`가 비어있는 노드를 보완합니다.

```typescript
// core/src/locator.ts 또는 신규 파일 core/src/hybridMatcher.ts
export function mergeOcrIntoTree(
  tree: UiNode[],
  ocrBlocks: OcrTextBlock[]  // { text: string, bounds: BoundingBox }[]
): UiNode[] {
  // bounds 교차(IoU) 계산으로 OCR 텍스트를 가장 가까운 노드에 할당
  // desc/text가 비어있는 노드에만 적용
}
```

#### 요구사항 C-2: 하이브리드 캡처 모드 UI

- UI에 "하이브리드 캡처" 버튼(또는 설정 토글) 추가
- 실행 흐름: XML dump → Compose 노드 감지 → OCR 자동 실행 → 결과 병합 → 로케이터 생성

```
[하이브리드 캡처 흐름]
  adbService.capture()  →  XML + screenshot
         ↓
  composeDetected? (ComposeView 노드 비율 > 임계값)
         ↓ YES
  backend /gemini_ocr  →  OcrTextBlock[]
         ↓
  mergeOcrIntoTree()   →  보강된 UiNode[]
         ↓
  generateLocators()   →  LocatorSuggestion[]
```

#### 요구사항 C-3: 백엔드 OCR 응답 형식 변경

현재 `/gemini_ocr`는 HTML 텍스트를 반환합니다. 하이브리드 매핑을 위해 구조화된 JSON이 필요합니다.

```python
# backend/server.py — 신규 엔드포인트 또는 기존 엔드포인트 응답 확장
class OcrTextBlock(BaseModel):
    text: str
    bounds: str | None = None  # "[x1,y1][x2,y2]" 형식
    confidence: float | None = None

class GeminiOcrStructuredResponse(BaseModel):
    blocks: list[OcrTextBlock]
    raw_html: str | None = None
```

---

### 5.4 Compose 감지 로직 요구사항

#### 요구사항 D-1: Compose 앱 자동 감지

XML 파싱 시 `ComposeView` 노드 비율을 분석하여 Compose 앱 여부 자동 감지:

```typescript
// store.tsx — buildTree() 내부 또는 별도 함수
function detectComposeApp(nodes: UiNode[]): boolean {
  const composeNodes = nodes.filter(
    n => n.cls?.includes('ComposeView') || n.cls?.includes('compose')
  );
  // 전체 노드 중 Compose 관련 노드가 일정 비율 이상이면 Compose 앱 판단
  return composeNodes.length > 0 && (nodes.length < 5 || composeNodes.length / nodes.length > 0.3);
}
```

#### 요구사항 D-2: Compose 감지 시 UI 알림

Compose 앱 감지 시 사용자에게 다음 중 하나 안내:
1. "이 앱은 Jetpack Compose로 작성되어 일부 요소가 보이지 않을 수 있습니다"
2. 자동으로 하이브리드 모드 활성화 옵션 제시
3. `Modifier.semantics { testTag = "..." }` 적용 가이드 링크

---

## 6. 구현 우선순위 및 로드맵

### Phase 1 — 즉시 적용 (코드 수정 소규모, 즉각 효과)

| 항목 | 파일 | 예상 효과 |
|------|------|----------|
| A-1: dump 순서 변경 (uncompressed 우선) | `app/services/adbService.js` | Compose 노드 수 즉시 증가 가능 |
| A-2: `isCandidate()` 완화 | `desktop/src/renderer/store.tsx` | bounds+clickable 요소 표시 |
| D-2: Compose 감지 경고 UI | `desktop/src/renderer/` | 사용자 인지 개선 |

### Phase 2 — 단기 (2~3주)

| 항목 | 설명 |
|------|------|
| B-1: uiautomator2 서버 모드 | `adbService.js`에 HTTP 캡처 경로 추가 |
| B-2/B-3: 타입/포트 확장 | `core/src/types.ts`, `core/src/ports.ts` |
| D-1: Compose 자동 감지 | `store.tsx` XML 분석 로직 |

### Phase 3 — 중기 (4~6주)

| 항목 | 설명 |
|------|------|
| C-1: OCR ↔ XML bounds 매핑 | 하이브리드 로케이터 엔진 |
| C-2: 하이브리드 캡처 UI | 버튼 또는 자동 트리거 |
| C-3: 구조화 OCR 응답 | 백엔드 엔드포인트 개선 |

### Phase 4 — 장기 (선택적)

| 항목 | 설명 | 비고 |
|------|------|------|
| AccessibilityService APK | 최고 수준 Compose 지원 | 디바이스 설정 필요 |
| Compose Inspector 연동 | Layout Inspector 프로토콜 활용 | 개발 빌드만 가능 |
| WDA 개선 (Windows) | iOS 지원을 Windows로 확장 | 별도 프로젝트 수준 |

---

## 7. 리스크 및 제약사항

### 7.1 기술적 제약

| 제약 | 내용 | 영향도 |
|------|------|:------:|
| **Compose Semantics 미선언** | 앱 개발자가 `@Semantics`를 달지 않으면 어느 방법으로도 한계가 있음 | 높음 |
| **uiautomator2 APK 설치** | 사용자 단말에 APK 사이드로드 동의 필요, 기업 보안 정책에 걸릴 수 있음 | 중간 |
| **OCR bounds 정확도** | Gemini Vision의 텍스트 위치(bounding box) 정확도가 장치/해상도마다 다름 | 중간 |
| **ADB 타임아웃** | uiautomator2 서버 시작에 최초 15~30초 소요 | 낮음 |
| **루팅 불필요** | 현재 방식 모두 루팅 없이 동작 (유지됨) | — |

### 7.2 Compose 문제의 근본 해결책은 앱 측에 있음

가장 확실한 해결책은 **대상 앱의 Compose 코드에 Semantics를 추가**하는 것입니다:

```kotlin
// 앱 개발자가 적용해야 하는 코드
Button(
  onClick = { ... },
  modifier = Modifier.semantics { 
    contentDescription = "확인 버튼"
    testTag = "btn_confirm"
  }
) { Text("확인") }
```

GroundView에서 할 수 있는 최선은 **Semantics가 없는 상황에서도** OCR + bounds 매핑으로  
최대한 식별 가능한 로케이터를 생성하는 것입니다.

### 7.3 하이브리드 모드의 정확도 한계

| 상황 | 예상 매핑 성공률 |
|------|:--------------:|
| 텍스트가 있는 버튼 (OCR 가능) | ~85% |
| 아이콘만 있는 버튼 | ~40% (bounds fallback만) |
| 겹치는 UI 요소 | ~60% |
| 작은 글씨 (10sp 이하) | ~50% |

---

## 요약

| 항목 | 현재 상태 | 결론 |
|------|----------|------|
| **Compose 앱 요소 탐지** | uiautomator dump의 구조적 한계로 Semantics 미선언 요소 누락 | 개선 필요 |
| **Android 접근성 API 직접 사용** | 미구현 | uiautomator2 HTTP 방식이 현실적 |
| **하이브리드 모드** | OCR과 XML이 완전 분리, 병합 없음 | Phase 3에서 구현 필요 |
| **즉시 적용 가능한 개선** | dump 순서 변경 + isCandidate 완화 | 소규모 수정으로 즉각 효과 |
| **최종 목표** | Compose 앱에서도 자동화 로케이터 생성 | uiautomator2 + 하이브리드 OCR 결합 |

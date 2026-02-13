# iOS GroundView 이식 가이드

> Windows Android 버전에서 macOS iOS 버전으로 핵심 기능 이식

## 📋 목차

1. [개요](#개요)
2. [핵심 기능 목록](#핵심-기능-목록)
3. [아키텍처 변경 사항](#아키텍처-변경-사항)
4. [기능별 상세 가이드](#기능별-상세-가이드)
5. [iOS 특화 고려사항](#ios-특화-고려사항)
6. [체크리스트](#체크리스트)

---

## 개요

### 목적
Windows에서 개발된 Android GroundView의 핵심 기능을 macOS iOS 버전에 이식

### 현재 상태
- **Android 버전**: Windows에서 개발 완료 (Electron + Python + React)
- **iOS 버전**: macOS에서 개발 중 (WDA 기반)

### 주요 변경 사항 요약
1. ✅ **API Key 암호화 저장** - 머신 ID 기반 Fernet 암호화
2. ✅ **Gemini OCR** - 백엔드 API 통합
3. ✅ **Gemini LLM 로케이터 제안** - 초보자 친화적 프롬프트
4. ✅ **자동 로케이터 생성** - 초보자 보호 (index 페널티)
5. ✅ **UI 개선** - tier별 색상, risks 경고

---

## 핵심 기능 목록

### 1. 🔐 API Key 암호화 저장
**위치**: `backend/settings_manager.py` (246 lines)

**개선 내용**:
- 머신 ID 기반 암호화 키 생성 (PBKDF2-HMAC-SHA256)
- 스마트 경로 선택 (환경변수 → 개발모드 감지 → 플랫폼별 기본)
- 복호화 실패 시 상세 로깅

**iOS 이식 포인트**:
```python
# Python → Swift/Objective-C
# 1. 머신 ID 획득: platform.node() + platform.machine()
# iOS: UIDevice.current.identifierForVendor + 시스템 정보

# 2. 암호화: Fernet (symmetric encryption)
# iOS: CryptoKit (AES-GCM) 또는 CommonCrypto

# 3. 경로 선택 로직
# macOS: ~/Library/Application Support/GroundView/
# iOS: FileManager.default.urls(for: .applicationSupportDirectory, ...)
```

### 2. 🔍 Gemini OCR
**위치**: `backend/webview_ocr.py`, `backend/server.py` POST `/gemini_ocr`

**개선 내용**:
- 백엔드 API로 통합
- base64 이미지 전송
- 다국어 OCR 지원

**iOS 이식 포인트**:
```swift
// HTTP POST /gemini_ocr
// Request:
{
  "image_path": "/path/to/screenshot.png",
  "language": "ko",
  "detail": "high"
}

// Response:
{
  "text": "추출된 텍스트",
  "detail": "상세 분석 결과"
}
```

### 3. 🤖 Gemini LLM 로케이터 제안
**위치**: `backend/server.py` POST `/api/locator/gemini` (lines 107-465)

**핵심 개선**:
- ✅ 초보자 친화적 프롬프트 (350줄)
- ❌ index 절대 금지 (recommended/alternatives에서 제외)
- ⚠️ 동적 ID 자동 감지 (`-숫자-xxxx` 패턴)
- 🥇 content-desc 최우선
- 📝 단일 따옴표 강제 (escape 최소화)
- 🔧 Wait 유틸 함수 자동 포함
- 🎯 체크리스트 9개 항목

**iOS 이식 포인트**:
```swift
// HTTP POST /api/locator/gemini
// Request:
{
  "node": {
    "text": "실시간 보이스피싱 탐지",
    "contentDesc": null,
    "resourceId": "-1-4b50",  // iOS는 accessibilityIdentifier
    "cls": "UILabel",
    "bounds": "[0,100][1080,200]",
    "clickable": true,
    "index": 1
  },
  "screenshot": "/path/to/screenshot.png",
  "bounds": [0, 100, 1080, 200]
}

// Response:
{
  "ok": true,
  "suggestion": {
    "recommended": {
      "type": "ACCESSIBILITY_ID",  // iOS에서 가장 안정적
      "value": "실시간 보이스피싱 탐지",
      "reason": "content-desc가 있어 가장 안정적",
      "stability": "high",
      "badge": "✅ 초보자 추천"
    },
    "alternatives": [...],
    "python": "# Swift 코드로 변환 필요",
    "java": "# Swift 코드로 변환 필요",
    "swift": "// 추가 필요",
    "fallback": "...",
    "risks": ["..."],
    "hints": ["..."],
    "devRequest": "content-desc=\"voicephishing_alert\" 추가 권장",
    "note": "..."
  }
}
```

**iOS 로케이터 매핑**:
| Android | iOS 대응 |
|---------|----------|
| `content-desc` | `accessibilityIdentifier` / `accessibilityLabel` |
| `resource-id` | `accessibilityIdentifier` |
| `text` | `label` / `value` |
| `ANDROID_UIAUTOMATOR` | `IOS_PREDICATE` / `IOS_CLASS_CHAIN` |
| `new UiSelector()` | `NSPredicate` |

### 4. 🎯 자동 로케이터 생성 (초보자 보호)
**위치**: `core/src/locator.ts` evaluateScore() (lines 468-540)

**핵심 개선**:
```typescript
// ❌ index 사용 시 무조건 fallback
if (features.usesIndex) {
  score = 35; // 최대 35점
  tier = 'fallback';
  risks.push('⚠️ index 사용: 화면 순서 바뀌면 100% 깨짐');
}

// 🥇 우선순위
// 1. content-desc: 70점 + 보너스
// 2. resource-id (의미있음): 65점
// 2. resource-id (동적): 45점
// 3. text (고유): 55점
// 3. text (일반): 40점

// tier 기준 (엄격)
// 75점 이상: recommended
// 50-74점: alternative
// 50점 미만: fallback
```

**iOS 이식**:
```swift
// iOS 로케이터 평가 함수
func evaluateIOSLocator(_ element: XCUIElement) -> (score: Int, tier: String, risks: [String]) {
    var score = 0
    var risks: [String] = []
    
    // ❌ index 사용 시 페널티
    if usesIndex {
        score = 35
        risks.append("index 사용: 불안정")
        return (score, "fallback", risks)
    }
    
    // 🥇 accessibilityIdentifier 최우선
    if let identifier = element.identifier, !identifier.isEmpty {
        score += 70
        if isDynamicId(identifier) {
            score -= 20
            risks.append("동적 ID 가능")
        }
    }
    
    // 🥈 accessibilityLabel
    if let label = element.label, !label.isEmpty {
        score += 55
    }
    
    // tier 결정
    let tier = score >= 75 ? "recommended" : 
               score >= 50 ? "alternative" : "fallback"
    
    return (score, tier, risks)
}
```

### 5. 🧩 Easy Locators
**위치**: `desktop/src/renderer/utils/locatorHelpers.ts` buildEasyLocator()

**핵심 로직**:
```typescript
// 우선순위
if (safeNode.contentDesc) {
  // 🥇 content-desc 최우선
  stability = 'high';
  badge = '✅ 초보자 추천';
} else if (safeNode.resourceId) {
  // 🥈 동적 ID 감지
  if (/[-_][0-9a-f]{4,}|temp|tmp/i.test(safeNode.resourceId)) {
    stability = 'medium';
    badge = '⚠️ 주의 필요';
    caution = 'ID에 숫자/해시 포함, 빌드마다 변할 수 있음';
  }
} else if (safeNode.text) {
  // 🥉 동적 텍스트 감지
  if (/[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]+건/.test(safeNode.text)) {
    stability = 'medium';
    caution = '텍스트에 날짜/숫자 포함, 값이 변하면 못 찾음';
  }
} else {
  // ❌ class + index (최후)
  stability = 'low';
  badge = '❌ 비추천';
  caution = '화면 순서 바뀌면 100% 깨짐';
}
```

**iOS 이식**:
```swift
func buildEasyIOSLocator(_ element: XCUIElement) -> IOSLocator {
    var stability = "medium"
    var badge = "⚠️ 주의 필요"
    var caution: String? = nil
    var predicate = ""
    
    if let identifier = element.identifier, !identifier.isEmpty {
        // 🥇 accessibilityIdentifier
        predicate = "identifier == '\(identifier)'"
        stability = "high"
        badge = "✅ 초보자 추천"
        
        // 동적 ID 체크
        if isDynamicIdentifier(identifier) {
            stability = "medium"
            badge = "⚠️ 주의 필요"
            caution = "ID에 숫자/해시 포함"
        }
    } else if let label = element.label, !label.isEmpty {
        // 🥈 accessibilityLabel
        predicate = "label == '\(label)'"
        stability = "medium"
        
        // 동적 텍스트 체크
        if isDynamicText(label) {
            caution = "텍스트에 날짜/숫자 포함"
        }
    } else {
        // ❌ index (최후)
        predicate = "type == '\(element.elementType)' AND index == \(element.index)"
        stability = "low"
        badge = "❌ 비추천"
        caution = "화면 순서 바뀌면 100% 깨짐"
    }
    
    return IOSLocator(
        predicate: predicate,
        stability: stability,
        badge: badge,
        caution: caution
    )
}

func isDynamicIdentifier(_ id: String) -> Bool {
    // 패턴: -숫자-해시, temp, tmp
    let patterns = ["[-_][0-9a-f]{4,}", "temp", "tmp"]
    return patterns.contains { id.range(of: $0, options: .regularExpression) != nil }
}

func isDynamicText(_ text: String) -> Bool {
    // 패턴: 날짜, 숫자+단위
    let patterns = ["[0-9]{4}-[0-9]{2}-[0-9]{2}", "[0-9]+건", "[0-9]+개", "\\d+%"]
    return patterns.contains { text.range(of: $0, options: .regularExpression) != nil }
}
```

### 6. 🎨 UI 개선
**위치**: `desktop/src/renderer/components/CodeModal.tsx` (584 lines)

**핵심 개선**:
```tsx
// tier별 라벨
{isRecommended && '✅ 추천'}
{isAlternative && '⚠️ 대안'}
{isFallback && '❌ 최후 수단'}

// tier별 색상
background: isRecommended ? 'rgba(34,197,94,0.2)' :  // 초록
           isAlternative ? 'rgba(251,191,36,0.15)' : // 노랑
           'rgba(239,68,68,0.2)'                      // 빨강

// Risks 경고 박스 (빨간색)
{loc.risks && loc.risks.length > 0 && (
  <div style={{ 
    background: '#7f1d1d20', 
    border: '1px solid #7f1d1d'
  }}>
    <div>⚠️ 주의사항:</div>
    {loc.risks.map(r => <div>• {r}</div>)}
  </div>
)}

// Fallback 강력 경고
{isFallback && (
  <div style={{ border: '1px dashed #ef4444' }}>
    ❌ <strong>초보자 비추천</strong>: 매우 불안정합니다.
  </div>
)}
```

**iOS 이식** (SwiftUI):
```swift
struct LocatorCard: View {
    let locator: IOSLocator
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // tier별 라벨
            HStack {
                Text(locator.tier == "recommended" ? "✅ 추천" :
                     locator.tier == "alternative" ? "⚠️ 대안" : "❌ 최후 수단")
                    .font(.headline)
                Spacer()
                Text("점수 \(locator.score)")
                    .font(.caption)
                    .padding(4)
                    .background(tierColor.opacity(0.2))
                    .cornerRadius(8)
            }
            
            // Risks 경고
            if !locator.risks.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("⚠️ 주의사항:")
                        .font(.caption)
                        .foregroundColor(.red)
                    ForEach(locator.risks, id: \.self) { risk in
                        Text("• \(risk)")
                            .font(.caption2)
                            .foregroundColor(.red)
                    }
                }
                .padding(8)
                .background(Color.red.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.red, lineWidth: 1)
                )
            }
            
            // Fallback 경고
            if locator.tier == "fallback" {
                HStack {
                    Text("❌")
                    Text("초보자 비추천")
                        .fontWeight(.bold)
                    Text(": 매우 불안정합니다.")
                }
                .font(.caption)
                .foregroundColor(.red)
                .padding(8)
                .background(Color.red.opacity(0.2))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                        .foregroundColor(.red)
                )
            }
            
            // 코드
            Text(locator.code)
                .font(.system(.caption, design: .monospaced))
                .padding(8)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(6)
            
            // 복사 버튼
            Button {
                UIPasteboard.general.string = locator.code
            } label: {
                Label(
                    locator.tier == "recommended" ? "✅ 복사" :
                    locator.tier == "alternative" ? "⚠️ 복사" : "❌ 복사",
                    systemImage: "doc.on.doc"
                )
            }
            .buttonStyle(.borderedProminent)
            .tint(tierColor)
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(locator.tier == "fallback" ? Color.red : Color.gray.opacity(0.3))
        )
    }
    
    var tierColor: Color {
        switch locator.tier {
        case "recommended": return .green
        case "alternative": return .yellow
        default: return .red
        }
    }
}
```

---

## 아키텍처 변경 사항

### Before (이전 구조)
```
[Electron Main Process]
  ├─ IPC: locator:gemini (143줄)
  │   ├─ API Key 복호화
  │   └─ Gemini API 직접 호출
  └─ 복잡한 암호화 로직
```

### After (현재 구조)
```
[Electron/iOS App] 
  └─ HTTP → [Python/Swift Backend API]
      ├─ POST /api/locator/gemini
      │   ├─ settings_manager: API Key 복호화
      │   ├─ 초보자 친화적 프롬프트
      │   └─ Gemini API 호출
      ├─ POST /gemini_ocr
      └─ GET/POST /api/settings/gemini-key
```

**iOS 백엔드 선택지**:
1. **Option A**: Python FastAPI 그대로 사용 (macOS에서 실행)
2. **Option B**: Swift Vapor로 재작성 (네이티브)
3. **Option C**: Hybrid (핵심 로직만 Swift, 나머지 Python)

**권장**: Option A (Python FastAPI)
- 이유: 코드 재사용성, Gemini API 호출 로직 동일

---

## 기능별 상세 가이드

### 1. API Key 암호화 저장

#### Android (Python)
```python
# backend/settings_manager.py
def _get_encryption_key(self) -> bytes:
    machine_id = f"{platform.node()}_{platform.machine()}"
    salt = b'groundview_salt_v1'
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(machine_id.encode()))

def save_gemini_api_key(self, api_key: str):
    fernet = Fernet(self._get_encryption_key())
    encrypted = fernet.encrypt(api_key.encode())
    settings['encrypted_gemini_key'] = base64.b64encode(encrypted).decode()
```

#### iOS (Swift)
```swift
import CryptoKit
import Foundation

class SettingsManager {
    private func getEncryptionKey() -> SymmetricKey {
        // 머신 ID 생성
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? ""
        let systemInfo = "\(deviceId)_\(UIDevice.current.model)"
        
        // PBKDF2로 키 유도
        let salt = "groundview_salt_v1".data(using: .utf8)!
        let inputKey = SymmetricKey(data: systemInfo.data(using: .utf8)!)
        
        // SHA256 기반 키 유도 (100,000 iterations)
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: inputKey,
            salt: salt,
            outputByteCount: 32
        )
    }
    
    func saveGeminiAPIKey(_ apiKey: String) throws {
        let key = getEncryptionKey()
        let data = apiKey.data(using: .utf8)!
        
        // AES-GCM 암호화 (Fernet 대신)
        let sealedBox = try AES.GCM.seal(data, using: key)
        let encrypted = sealedBox.combined!
        
        // Base64 인코딩하여 저장
        UserDefaults.standard.set(
            encrypted.base64EncodedString(),
            forKey: "encrypted_gemini_key"
        )
    }
    
    func getGeminiAPIKey() throws -> String? {
        guard let base64 = UserDefaults.standard.string(forKey: "encrypted_gemini_key"),
              let encrypted = Data(base64Encoded: base64) else {
            return nil
        }
        
        let key = getEncryptionKey()
        let sealedBox = try AES.GCM.SealedBox(combined: encrypted)
        let decrypted = try AES.GCM.open(sealedBox, using: key)
        
        return String(data: decrypted, encoding: .utf8)
    }
}
```

### 2. Gemini LLM 프롬프트 (iOS용)

#### 프롬프트 수정 포인트
```python
# backend/server.py 프롬프트에 iOS 섹션 추가

prompt_lines = [
    # ... 기존 프롬프트 ...
    
    '=== iOS 로케이터 (추가) ===',
    '',
    '🍎 iOS Predicate 우선순위:',
    '1️⃣ accessibilityIdentifier (가장 안정적)',
    '   - identifier == "login_button"',
    '2️⃣ accessibilityLabel',
    '   - label == "로그인"',
    '3️⃣ type + label',
    '   - type == "XCUIElementTypeButton" AND label == "로그인"',
    '4️⃣ index (최후)',
    '   - fallback만 사용',
    '',
    '🍎 iOS Class Chain:',
    '   - XCUIElementTypeWindow/XCUIElementTypeButton[@label="로그인"]',
    '',
    '출력 형식 (iOS 추가):',
    '{',
    '  "recommended": { ... },',
    '  "alternatives": [ ... ],',
    '  "python": "...",',
    '  "java": "...",',
    '  "swift": "<Swift XCTest 코드>",  // 추가',
    '  "fallback": "...",',
    '  "risks": [ ... ],',
    '  "hints": [ ... ],',
    '  "devRequest": "...",',
    '  "note": "..."',
    '}',
    '',
    '=== Swift 코드 템플릿 ===',
    '',
    'import XCTest',
    '',
    'func waitForElement(_ predicate: String, timeout: Double = 10) -> XCUIElement? {',
    '    let element = app.descendants(matching: .any)',
    '        .matching(NSPredicate(format: predicate)).firstMatch',
    '    guard element.waitForExistence(timeout: timeout) else { return nil }',
    '    return element',
    '}',
    '',
    'func testExample() {',
    '    // 추천: accessibilityIdentifier',
    '    if let element = waitForElement("identifier == \'login_button\'") {',
    '        element.tap()',
    '    }',
    '}',
]
```

### 3. iOS 로케이터 생성 로직

#### TypeScript → Swift 변환
```swift
// locator.ts 로직을 Swift로 변환

struct IOSLocatorSuggestion {
    let strategy: String
    let value: String
    let codeSwift: String
    let score: Int
    let tier: String  // "recommended", "alternative", "fallback"
    let risks: [String]
    let notes: [String]
}

func generateIOSLocators(_ element: XCUIElement) -> [IOSLocatorSuggestion] {
    var suggestions: [IOSLocatorSuggestion] = []
    
    // 1. accessibilityIdentifier
    if let identifier = element.identifier, !identifier.isEmpty {
        let score = isDynamicId(identifier) ? 45 : 65
        let tier = score >= 75 ? "recommended" : "alternative"
        
        suggestions.append(IOSLocatorSuggestion(
            strategy: "accessibility-id",
            value: identifier,
            codeSwift: """
            let element = app.descendants(matching: .any)
                .matching(identifier: "\(identifier)").firstMatch
            element.tap()
            """,
            score: score,
            tier: tier,
            risks: isDynamicId(identifier) ? ["동적 ID 가능"] : [],
            notes: ["accessibilityIdentifier"]
        ))
    }
    
    // 2. accessibilityLabel
    if let label = element.label, !label.isEmpty {
        let score = isDynamicText(label) ? 40 : 55
        
        suggestions.append(IOSLocatorSuggestion(
            strategy: "predicate-label",
            value: "label == '\(label)'",
            codeSwift: """
            let predicate = NSPredicate(format: "label == '\(label)'")
            let element = app.descendants(matching: .any)
                .matching(predicate).firstMatch
            element.tap()
            """,
            score: score,
            tier: score >= 75 ? "recommended" : "alternative",
            risks: isDynamicText(label) ? ["텍스트 변경 시 깨짐"] : [],
            notes: ["accessibilityLabel"]
        ))
    }
    
    // 3. type + label
    if let label = element.label, !label.isEmpty {
        let typeStr = String(describing: element.elementType)
        
        suggestions.append(IOSLocatorSuggestion(
            strategy: "predicate-type-label",
            value: "type == '\(typeStr)' AND label == '\(label)'",
            codeSwift: """
            let predicate = NSPredicate(format: "type == '\(typeStr)' AND label == '\(label)'")
            let element = app.descendants(matching: .any)
                .matching(predicate).firstMatch
            element.tap()
            """,
            score: 50,
            tier: "alternative",
            risks: [],
            notes: ["type + label combination"]
        ))
    }
    
    // 4. index (최후)
    let indexScore = 35
    suggestions.append(IOSLocatorSuggestion(
        strategy: "index-fallback",
        value: "index == \(element.index)",
        codeSwift: """
        // ❌ 위험: index 사용
        let element = app.descendants(matching: .\(element.elementType))
            .element(boundBy: \(element.index))
        element.tap()
        """,
        score: indexScore,
        tier: "fallback",
        risks: ["⚠️ index 사용: 화면 순서 바뀌면 100% 깨짐"],
        notes: ["최후 수단"]
    ))
    
    return suggestions.sorted { $0.score > $1.score }
}

func isDynamicId(_ id: String) -> Bool {
    let patterns = ["[-_][0-9a-f]{4,}", "temp", "tmp"]
    return patterns.contains { 
        id.range(of: $0, options: .regularExpression) != nil 
    }
}

func isDynamicText(_ text: String) -> Bool {
    let patterns = [
        "[0-9]{4}-[0-9]{2}-[0-9]{2}",
        "[0-9]+건", "[0-9]+개", "\\d+%"
    ]
    return patterns.contains { 
        text.range(of: $0, options: .regularExpression) != nil 
    }
}
```

---

## iOS 특화 고려사항

### 1. WDA (WebDriverAgent) vs Appium
- **Android**: Appium + UiAutomator2
- **iOS**: Appium + WebDriverAgent OR XCTest

### 2. 로케이터 전략
| Android | iOS 대응 |
|---------|----------|
| `AppiumBy.ID` | `identifier:` 또는 `accessibilityIdentifier` |
| `AppiumBy.ACCESSIBILITY_ID` | `accessibilityIdentifier` 또는 `accessibilityLabel` |
| `AppiumBy.ANDROID_UIAUTOMATOR` | `AppiumBy.IOS_PREDICATE` 또는 `AppiumBy.IOS_CLASS_CHAIN` |
| `UiSelector()` | `NSPredicate` |
| `.resourceId()` | `identifier == "..."` |
| `.description()` | `label == "..."` |
| `.text()` | `label == "..." OR value == "..."` |
| `.className()` | `type == "XCUIElementType..."` |
| `.index()` | `element(boundBy: n)` |

### 3. iOS 전용 속성
```swift
// XCUIElement 속성
element.identifier          // accessibilityIdentifier
element.label              // accessibilityLabel
element.value              // accessibilityValue
element.elementType        // XCUIElementType
element.title              // title (UIButton 등)
element.placeholderValue   // placeholder (UITextField)
element.isSelected         // 선택 상태
element.isEnabled          // 활성화 상태
```

### 4. 스크린샷 캡처
```swift
// iOS 스크린샷 API
let screenshot = XCUIScreen.main.screenshot()
let imageData = screenshot.image.pngData()

// 저장
let fileURL = FileManager.default.temporaryDirectory
    .appendingPathComponent("screenshot.png")
try imageData?.write(to: fileURL)
```

### 5. 계층 구조 (Hierarchy)
```swift
// iOS 계층 구조 가져오기
func getElementHierarchy(_ element: XCUIElement, level: Int = 0) -> String {
    let indent = String(repeating: "  ", count: level)
    var result = "\(indent)<\(element.elementType)>\n"
    result += "\(indent)  identifier: \(element.identifier)\n"
    result += "\(indent)  label: \(element.label)\n"
    result += "\(indent)  value: \(element.value ?? "nil")\n"
    
    for child in element.children(matching: .any).allElementsBoundByIndex {
        result += getElementHierarchy(child, level: level + 1)
    }
    
    return result
}

// 사용
let hierarchy = getElementHierarchy(app)
print(hierarchy)
```

---

## 체크리스트

### Phase 1: 백엔드 준비 (macOS)
- [ ] Python 3.10 설치 (`brew install python@3.10`)
- [ ] 가상환경 생성 (`python3.10 -m venv .venv`)
- [ ] 의존성 설치 (`pip install -r requirements.txt`)
- [ ] FastAPI 서버 실행 테스트 (`python backend/server.py`)
- [ ] Gemini API Key 설정
- [ ] `/api/locator/gemini` 엔드포인트 테스트

### Phase 2: iOS 앱 준비
- [ ] XCTest 프로젝트 설정
- [ ] WebDriverAgent 설치 (Appium 사용 시)
- [ ] HTTP Client 라이브러리 추가 (Alamofire 등)
- [ ] SettingsManager Swift 구현
- [ ] 스크린샷 캡처 기능 구현

### Phase 3: 로케이터 생성 로직
- [ ] `generateIOSLocators()` 함수 구현
- [ ] `evaluateIOSLocator()` 함수 구현
- [ ] `isDynamicId()`, `isDynamicText()` 구현
- [ ] Easy Locators 로직 포팅

### Phase 4: UI 구현
- [ ] LocatorCard SwiftUI 컴포넌트
- [ ] tier별 색상 적용
- [ ] Risks 경고 박스
- [ ] Fallback 강력 경고
- [ ] 복사 기능

### Phase 5: 통합 테스트
- [ ] 백엔드 API 연동 테스트
- [ ] Gemini LLM 로케이터 제안 테스트
- [ ] iOS 로케이터 생성 테스트
- [ ] UI 표시 테스트
- [ ] 실제 디바이스 테스트

### Phase 6: 최적화
- [ ] Swift로 일부 로직 네이티브화 (선택)
- [ ] 프롬프트 iOS 전용 최적화
- [ ] 성능 튜닝

---

## 추가 리소스

### 참고 파일 (Windows 코드베이스)
```
backend/
  ├─ settings_manager.py       # API Key 암호화
  ├─ server.py                  # FastAPI 백엔드
  └─ webview_ocr.py             # Gemini OCR

core/src/
  ├─ locator.ts                 # 로케이터 생성 로직
  └─ types.ts                   # 타입 정의

desktop/src/renderer/
  ├─ utils/locatorHelpers.ts   # Easy Locators
  └─ components/CodeModal.tsx  # UI 컴포넌트
```

### iOS 프로젝트 구조 제안
```
GroundView-iOS/
  ├─ App/
  │   ├─ GroundViewApp.swift
  │   └─ ContentView.swift
  ├─ Models/
  │   ├─ LocatorSuggestion.swift
  │   └─ ElementNode.swift
  ├─ Services/
  │   ├─ SettingsManager.swift        # API Key 암호화
  │   ├─ GeminiService.swift          # 백엔드 API 호출
  │   └─ LocatorGenerator.swift       # iOS 로케이터 생성
  ├─ Views/
  │   ├─ LocatorCard.swift            # 로케이터 카드 UI
  │   ├─ DeviceListView.swift
  │   └─ ScreenCaptureView.swift
  ├─ Utils/
  │   ├─ PatternDetector.swift        # 동적 ID/텍스트 감지
  │   └─ ScoreEvaluator.swift         # 점수 평가
  └─ Backend/ (Python)
      └─ (Windows 백엔드 코드 복사)
```

---

## 마무리

이 가이드를 따라 iOS GroundView 앱에 Android 버전의 핵심 기능을 이식할 수 있습니다.

**핵심 원칙**:
1. ✅ 초보자 보호 (index 페널티, 동적 ID 감지)
2. 🥇 우선순위 명확화 (accessibilityIdentifier > label > index)
3. ⚠️ Risks 강조 (빨간색 경고 박스)
4. 🎨 tier별 시각적 구분 (초록/노랑/빨강)

**문의사항**:
iOS 개발 중 궁금한 사항은 이 문서를 참고하거나 Android 코드베이스를 직접 확인하세요.

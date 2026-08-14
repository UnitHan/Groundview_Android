"""
Lightweight Python backend stub for model/OCR services.
Provides a /healthz endpoint; extend with inference routes later.
"""

import sys
import os

# ── Critical path fix ────────────────────────────────────────────────────────
# Python embeddable packages use a ._pth file that FULLY IGNORES the PYTHONPATH
# environment variable (documented CPython behavior on Windows).  The main
# process sets PYTHONPATH to include this backend/ directory, but it is silently
# dropped.  We must add the directory at runtime via sys.path so that the
# sibling modules (settings_manager, webview_ocr) can be imported.
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)
# ─────────────────────────────────────────────────────────────────────────────

# Diagnostic: log sys.path at startup to help diagnose import failures
_startup_path_logged = False
try:
    import pathlib
    _log_dir = os.environ.get("GROUNDVIEW_SETTINGS_DIR", "")
    if _log_dir:
        _log_file = pathlib.Path(_log_dir) / "server_startup.log"
        pathlib.Path(_log_dir).mkdir(parents=True, exist_ok=True)
        with open(_log_file, "w", encoding="utf-8") as _f:
            _f.write(f"Python: {sys.version}\n")
            _f.write(f"Executable: {sys.executable}\n")
            _f.write(f"sys.path:\n")
            for _p in sys.path:
                _f.write(f"  {_p}\n")
        _startup_path_logged = True
except Exception:
    pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import time
import os
from pathlib import Path
from settings_manager import get_settings_manager
from webview_ocr import run_gemini

app = FastAPI(title="GroundView Model Backend")

# Enable CORS for Electron renderer
# Origins: 'null' covers file:// renderer (production), localhost:3000 covers dev server.
# allow_credentials is False; wildcard+credentials combination would be a security vulnerability.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

START_TIME = time.time()
MODEL_PORT = int(os.environ.get("MODEL_PORT", "5005"))


class GeminiKeyRequest(BaseModel):
    apiKey: str
    model: str = "gemini-2.5-flash"


class GeminiOcrRequest(BaseModel):
    screenshot_path: str
    crop_bounds: str | None = None
    prompt: str | None = None


class GeminiLocatorRequest(BaseModel):
    node: dict
    screenshot: str | None = None
    bounds: str | None = None


@app.get("/healthz")
def health_check():
    return {
        "status": "ok",
        "version": "0.1.0",
        "models": {
            "ocr": "gemini-vision-api",
            "backend": "gemini-2.5-flash",
        },
        "uptime_sec": round(time.time() - START_TIME, 2),
    }


@app.get("/readyz")
def ready_check():
    # Extend with model warmup checks; return 503 if not ready.
    return JSONResponse({"status": "ok"})


@app.post("/api/settings/gemini-key")
def set_gemini_key(request: GeminiKeyRequest):
    """Store Gemini API key with encryption."""
    try:
        manager = get_settings_manager()
        manager.set_gemini_api_key(request.apiKey)
        if request.model:
            manager.set_gemini_model(request.model)
        return {"status": "ok", "message": "API key saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/gemini-key")
def get_gemini_key():
    """Check if Gemini API key is configured (returns masked key)."""
    try:
        manager = get_settings_manager()
        api_key = manager.get_gemini_api_key()
        model = manager.get_gemini_model()
        
        if api_key:
            # Return masked key for security
            masked = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***"
            return {
                "status": "ok",
                "configured": True,
                "apiKey": masked,
                "model": model or "gemini-2.5-flash"
            }
        else:
            return {
                "status": "ok",
                "configured": False
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/locator/gemini")
async def gemini_locator(request: GeminiLocatorRequest):
    """Generate Appium locator code using Gemini API."""
    import base64
    import json
    try:
        manager = get_settings_manager()
        api_key = manager.get_gemini_api_key()
        raw_model = manager.get_gemini_model() or "gemini-2.5-flash"
        
        if not api_key:
            return {"ok": False, "error": "GEMINI_API_KEY 가 설정되지 않았습니다."}
        
        # Normalize model name
        model = raw_model.strip()
        if model.startswith('models/'):
            model = model[len('models/'):]
        if model.endswith('-latest'):
            model = model[:-len('-latest')]
        if not model or model.startswith('gemini-1.5'):
            model = 'gemini-2.5-flash'
        model = f'models/{model}'
        
        node = request.node
        if not node:
            return {"ok": False, "error": "노드 정보가 없습니다."}
        
        # Prepare image part if screenshot provided
        image_part = None
        if request.screenshot:
            screenshot_path = Path(request.screenshot)
            if screenshot_path.exists():
                try:
                    with open(screenshot_path, 'rb') as f:
                        b64_data = base64.b64encode(f.read()).decode('utf-8')
                        image_part = {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": b64_data
                            }
                        }
                except Exception:
                    pass
        
        # Build prompt (초보자 친화적 - 전면 개선)
        prompt_lines = [
            '🎯 너의 역할: Appium 테스트 초보자를 위한 로케이터 추천 전문가',
            '',
            '📋 목표: 초보자가 **고민 없이 복붙해서 바로 쓸 수 있는** 코드 제공',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '🚨 절대 원칙 (위반 금지!)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '1️⃣ index 포함 로케이터는 절대 추천/대안에 넣지 말 것',
            '   ❌ 금지: resourceId(...).index(1)',
            '   ❌ 금지: childSelector(index(0))',
            '   ⚠️  fallback 함수에만 넣고 "최후 수단" 명시',
            '',
            '2️⃣ 동적 ID는 "안정적"으로 취급 금지',
            '   ❌ 위험 패턴: -숫자-xxxx (예: -1-4b50)',
            '   ❌ 위험 패턴: temp_, tmp_, random_',
            '   ⚠️  발견 시 medium 이하 + devRequest 필수',
            '',
            '3️⃣ content-desc 있으면 무조건 최우선',
            '   ✅ AccessibilityId가 가장 안정적',
            '   ✅ 복잡한 selector보다 항상 우선',
            '',
            '4️⃣ escape 최소화 (초보자 수정 용이)',
            '   ✅ Python: 바깥 \', 안 " 사용',
            '   ✅ 예시: (AppiumBy.ID, \'com.app:id/btn\')',
            '   ❌ 예시: (AppiumBy.ID, "com.app:id/btn")',
            '',
            '5️⃣ 불필요한 조건 제거',
            '   ❌ 금지: enabled(true)',
            '   ❌ 금지: packageName(...)',
            '   ⚠️  꼭 필요한 최소 조건만 사용',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '🏆 로케이터 우선순위 (반드시 이 순서!)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '🥇 1순위: ACCESSIBILITY_ID (content-desc)',
            '   • 조건: content-desc 속성 존재',
            '   • 장점: 가장 안정적, accessibility 용도로 잘 안 바뀜',
            '   • stability: high',
            '   • badge: ✅ 초보자 추천',
            '   • 예시:',
            '     Python: (AppiumBy.ACCESSIBILITY_ID, \'로그인\')',
            '     Java: AppiumBy.accessibilityId("로그인")',
            '',
            '🥈 2순위: ID (resource-id) - 단, 의미있는 경우만',
            '   • ✅ 좋은 ID: com.example.app:id/button_login',
            '   • ✅ 좋은 ID: login_button',
            '   • ❌ 나쁜 ID: -1-4b50 (동적)',
            '   • ❌ 나쁜 ID: temp_abc123 (임시)',
            '   • 판단: 숫자/해시 많으면 동적 가능성 높음',
            '   • stability: high (의미있음), medium (의심)',
            '   • 예시:',
            '     Python: (AppiumBy.ID, \'com.app:id/login_btn\')',
            '     Java: AppiumBy.id("com.app:id/login_btn")',
            '',
            '🥉 3순위: UIAUTOMATOR text()',
            '   • ✅ 좋은 text: "로그인", "확인" (고정 문구)',
            '   • ⚠️  주의 text: "2024-01-29", "3건" (동적)',
            '   • 리스크: 다국어/문구 변경 시 깨짐',
            '   • stability: medium',
            '   • 예시:',
            '     Python: (AppiumBy.ANDROID_UIAUTOMATOR, \'new UiSelector().text("로그인")\')',
            '     Java: AppiumBy.androidUIAutomator("new UiSelector().text(\\"로그인\\")")',
            '',
            '⚠️ 4순위: UIAUTOMATOR className + text',
            '   • 조건: 동일 text 중복 시에만',
            '   • stability: medium',
            '   • 예시:',
            '     \'new UiSelector().className("android.widget.TextView").text("로그인")\'',
            '',
            '❌ 최후: index (fallback 함수에만)',
            '   • 절대 recommended/alternatives에 넣지 말 것',
            '   • stability: low',
            '   • risks: "화면 요소 순서 바뀌면 100% 깨짐" 필수',
            '',
            '❌ 절대 금지: XPath',
            '   • 성능 문제 + 플레이키',
            '   • 대안 없을 때만 fallback에',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '🧭 상태 의존 요소 & 클릭 타깃 (중요)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            'A) 선택 요소가 "클릭 불가 라벨"이면 (clickable=false, text/desc만 존재):',
            '   • 실제 탭 대상은 보통 클릭 가능한 상위 요소다.',
            '   • node.clickableAncestor 가 주어지면 그 요소로 로케이터를 만들어라',
            '     (상위의 content-desc > resource-id 순 우선).',
            '   • 상위에 고유 식별자가 없으면 자식 텍스트로 클릭 조상을 지정:',
            '     new UiSelector().clickable(true).childSelector(new UiSelector().text("<라벨>"))',
            '   • desc가 있으면 text 대신 description("<desc>") 사용.',
            '',
            'B) 상태 의존 요소 (같은 desc/text가 다른 화면 상태에도 존재할 수 있음):',
            '   • 반드시 **스크린샷**을 보고 이 요소가 "특정 화면 상태에서만 유효한지" 판단하라.',
            '   • 예: 대화 이력/목록이 있을 때만 나타나는 버튼. 빈 화면에는 같은 desc의',
            '     decoy(무의미 요소)가 있어 desc 단독 로케이터가 엉뚱한 걸 잡을 수 있다.',
            '   • 이런 경우 desc/text **단독 로케이터는 위험**. "화면 상태 앵커"로 게이팅한 코드를 제시:',
            '     1) 이 화면 상태임을 증명하는 안정적 앵커 요소를 먼저 확인',
            '        (있으면 진행 / 없으면 스킵하거나 다른 분기)',
            '     2) 그 다음 목표 요소를 탭',
            '   • 앵커는 스크린샷에서 **이 상태에만 보이는** 고유 텍스트/요소로 고른다',
            '     (예: 빈 새 창의 환영 문구, 이력 화면의 대화 본문 등).',
            '   • hints 에 "이 요소는 <상태>에서만 유효 — 앵커 <값> 먼저 확인" 명시.',
            '   • risks 에 "다른 화면 상태에도 같은 desc/text 존재 → 오탐 가능" 명시.',
            '   • 상태 의존이면 stability 는 medium 이하로.',
            '   • 상태 의존이 아니면 이 블록은 무시(불필요한 게이팅 코드 넣지 말 것).',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '📤 출력 형식 (JSON)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '{',
            '  "recommended": {',
            '    "type": "ACCESSIBILITY_ID|ID|UIAUTOMATOR",',
            '    "value": "<단일 따옴표로 감싼 로케이터 문자열>",',
            '    "reason": "<왜 이걸 선택했는지 1줄 (구체적으로)>",',
            '    "stability": "high|medium",',
            '    "badge": "✅ 초보자 추천|⚠️  주의 필요"',
            '  },',
            '  "alternatives": [',
            '    {',
            '      "type": "ID|UIAUTOMATOR",',
            '      "value": "...",',
            '      "reason": "...",',
            '      "stability": "medium|low",',
            '      "badge": "⚠️  주의 필요",',
            '      "caution": "<이 방법의 위험요소 1줄>"',
            '    }',
            '  ],',
            '  "python": "<wait_clickable + run_test() 함수 전체>",',
            '  "java": "<WebDriverWait + runTest() 메서드 전체>",',
            '  "fallback": "<find_element_fallback(driver, candidates) 함수>",',
            '  "risks": [',
            '    "<구체적인 깨질 상황>",',
            '    "<예: 텍스트가 다국어면 언어별로 다름>"',
            '  ],',
            '  "hints": [',
            '    "<초보자 실용 팁>",',
            '    "<예: 로그인 후에만 나타나는 요소>"',
            '  ],',
            '  "devRequest": "<개발팀 요청 (없으면 null)>",',
            '  "note": "<선택 이유 1줄>"',
            '}',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '🔧 코드 템플릿 (정확히 이 형식!)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '=== Python 예시 (무조건 단일 따옴표) ===',
            '',
            'from appium.webdriver.common.appiumby import AppiumBy',
            'from selenium.webdriver.support.ui import WebDriverWait',
            'from selenium.webdriver.support import expected_conditions as EC',
            'from selenium.common.exceptions import TimeoutException',
            '',
            'def wait_clickable(driver, locator, timeout=10):',
            '    """요소가 클릭 가능할 때까지 대기"""',
            '    return WebDriverWait(driver, timeout).until(',
            '        EC.element_to_be_clickable(locator)',
            '    )',
            '',
            'def run_test(driver):',
            '    """추천 로케이터로 요소 찾기"""',
            '    # 추천: content-desc 사용',
            '    locator = (AppiumBy.ACCESSIBILITY_ID, \'실시간 보이스피싱 탐지\')',
            '    element = wait_clickable(driver, locator)',
            '    element.click()',
            '',
            '=== Java 예시 ===',
            '',
            'import io.appium.java_client.AppiumBy;',
            'import org.openqa.selenium.WebElement;',
            'import org.openqa.selenium.support.ui.ExpectedConditions;',
            'import org.openqa.selenium.support.ui.WebDriverWait;',
            'import java.time.Duration;',
            '',
            'public void runTest() {',
            '    // 추천: content-desc 사용',
            '    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));',
            '    WebElement element = wait.until(',
            '        ExpectedConditions.elementToBeClickable(',
            '            AppiumBy.accessibilityId("실시간 보이스피싱 탐지")',
            '        )',
            '    );',
            '    element.click();',
            '}',
            '',
            '=== Fallback 함수 (여러 로케이터 순차 시도) ===',
            '',
            'def find_element_fallback(driver, timeout=10):',
            '    """여러 로케이터를 순차적으로 시도"""',
            '    candidates = [',
            '        # 1순위: AccessibilityId',
            '        (AppiumBy.ACCESSIBILITY_ID, \'실시간 보이스피싱 탐지\'),',
            '        ',
            '        # 2순위: text',
            '        (AppiumBy.ANDROID_UIAUTOMATOR,',
            '         \'new UiSelector().text("실시간 보이스피싱 탐지")\'),',
            '        ',
            '        # 최후: index (위험)',
            '        (AppiumBy.ANDROID_UIAUTOMATOR,',
            '         \'new UiSelector().className("android.widget.TextView").index(1)\'),',
            '    ]',
            '    ',
            '    last_error = None',
            '    for locator in candidates:',
            '        try:',
            '            return wait_clickable(driver, locator, timeout)',
            '        except TimeoutException as e:',
            '            last_error = e',
            '    raise last_error',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '📝 devRequest 작성 규칙',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '아래 조건에 해당하면 devRequest 작성:',
            '',
            '1. content-desc 없음 → "content-desc=\\"요소설명\\" 추가 권장"',
            '2. 무의미 resource-id → "의미있는 ID로 변경 (예: login_btn)"',
            '3. 동적 텍스트만 있음 → "고정 content-desc 추가 권장"',
            '4. 동적 ID 패턴 → "안정적인 resource-id 부여 필요"',
            '',
            '형식: "개발팀 요청: [속성명]=[예시값] 추가 권장"',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '✅ 체크리스트 (출력 전 확인!)',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '[ ] recommended에 index 없는가?',
            '[ ] alternatives에 index 없는가?',
            '[ ] 동적 ID는 medium 이하인가?',
            '[ ] content-desc 있으면 최우선인가?',
            '[ ] Python 코드에 단일 따옴표 사용했는가?',
            '[ ] enabled/packageName 제거했는가?',
            '[ ] wait_clickable 함수 포함했는가?',
            '[ ] fallback 함수 포함했는가?',
            '[ ] devRequest 적절한가?',
            '[ ] 클릭 불가 라벨이면 clickableAncestor/childSelector로 승격했는가?',
            '[ ] 상태 의존 요소면 화면 상태 앵커로 게이팅했는가? (아니면 게이팅 없음)',
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            f'선택된 요소 정보:\n{json.dumps(node, indent=2, ensure_ascii=False)}',
        ]
        
        prompt = '\n'.join(prompt_lines)
        
        # Build request
        parts = [{"text": prompt}]
        if image_part:
            parts.append(image_part)
        
        contents = [{"parts": parts}]
        body = {"contents": contents}
        
        # Call Gemini API
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1/{model}:generateContent?key={api_key}"
        
        # Windows 콘솔 안전 출력
        def safe_print(msg):
            try:
                print(msg)
            except UnicodeEncodeError:
                print(msg.encode('ascii', 'ignore').decode())
        
        safe_print(f"[Gemini] 요청 모델: {model}")
        safe_print(f"[Gemini] 프롬프트 길이: {len(prompt)} chars")
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=body, timeout=60.0)  # 30초 → 60초
            
            safe_print(f"[Gemini] 응답 상태: {resp.status_code}")
            
            if resp.status_code != 200:
                error_text = resp.text[:400]
                safe_print(f"[Gemini] 오류 응답: {error_text}")
                return {"ok": False, "error": f"Gemini 오류 {resp.status_code}: {error_text}"}
            
            data = resp.json()
            candidates = data.get('candidates', [])
            if not candidates:
                safe_print(f"[Gemini] candidates 없음. 전체 응답: {data}")
                return {"ok": False, "error": "Gemini 응답에 candidates가 없습니다."}
            
            first = candidates[0]
            finish_reason = first.get('finishReason', 'UNKNOWN')
            safe_print(f"[Gemini] finishReason: {finish_reason}")
            
            content = first.get('content', {})
            parts = content.get('parts', [])
            
            text_part = next((p for p in parts if 'text' in p), None)
            if not text_part or not text_part.get('text'):
                safe_print(f"[Gemini] 텍스트 없음. first: {first}")
                return {"ok": False, "error": "Gemini 응답에 텍스트가 없습니다."}
            
            # Parse JSON response
            raw_text = text_part['text']
            safe_print(f"[Gemini] 원본 응답 길이: {len(raw_text)} chars")
            safe_print(f"[Gemini] 원본 응답 시작 500자: {raw_text[:500]}")
            
            # Strip markdown fence if present
            import re
            fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw_text, re.IGNORECASE)
            if fence_match:
                raw_text = fence_match.group(1).strip()
            else:
                raw_text = raw_text.strip()
            
            # Extract JSON object
            start = raw_text.find('{')
            end = raw_text.rfind('}')
            if start >= 0 and end > start:
                raw_text = raw_text[start:end+1]
            
            safe_print(f"[Gemini] 파싱 전 JSON 길이: {len(raw_text)} chars")
            
            try:
                suggestion = json.loads(raw_text)
                safe_print(f"[Gemini] JSON 파싱 성공. Keys: {list(suggestion.keys())}")
                return {"ok": True, "suggestion": suggestion}
            except json.JSONDecodeError as e:
                safe_print(f"[Gemini] JSON 파싱 실패: {e}")
                safe_print(f"[Gemini] 파싱 실패한 텍스트 (처음 1000자): {raw_text[:1000]}")
                return {"ok": False, "error": f"Gemini 응답 파싱 실패: {str(e)}"}
            
    except Exception as e:
        safe_print(f"[Gemini] 예외 발생: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}


@app.post("/gemini_ocr")
def gemini_ocr(request: GeminiOcrRequest):
    """Perform OCR using Gemini Vision API."""
    try:
        manager = get_settings_manager()
        api_key = manager.get_gemini_api_key()
        model = manager.get_gemini_model() or "gemini-2.5-flash"
        
        if not api_key:
            raise HTTPException(
                status_code=400, 
                detail="Gemini API key not configured. Please set it in Settings."
            )
        
        # Set API key in environment for webview_ocr to use
        os.environ["GEMINI_API_KEY"] = api_key
        
        screenshot_path = Path(request.screenshot_path)
        if not screenshot_path.exists():
            raise HTTPException(status_code=400, detail=f"Screenshot not found: {screenshot_path}")
        
        default_prompt = (
            "Read every visible Korean/English sentence on the image without omission. "
            "Return a compact HTML snippet (no Markdown, no JSON, no code fences). "
            "Use <p> for paragraphs in reading order. "
            "If a table exists, rebuild it as an HTML <table><tbody>…</tbody></table> with rows/cols preserved; "
            "put cell text inside <td> in the correct row/column order. "
            "Do not include extra commentary."
        )
        
        result = run_gemini(
            image=screenshot_path,
            crop_bounds=request.crop_bounds,
            model=model,
            prompt=request.prompt or default_prompt
        )
        
        return {
            "ok": result.get("ok", False),
            "raw_text": result.get("text", ""),
            "source": result.get("source", str(screenshot_path)),
            "mode": "gemini",
            "model": model
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    import socket

    port = int(os.environ.get("MODEL_PORT", "5005"))

    # Verify the port is available before starting
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", port))
    except OSError as e:
        print(f"[server] ERROR: Port {port} is not available: {e}", flush=True)
        raise SystemExit(1)

    print(f"[server] Starting on 127.0.0.1:{port}", flush=True)
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )

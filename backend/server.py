"""
Lightweight Python backend stub for model/OCR services.
Provides a /healthz endpoint; extend with inference routes later.
"""

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in dev mode
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/healthz")
def health_check():
    return {
        "status": "ok",
        "version": "0.1.0",
        "models": {
            "ocr": "paddleocr-ppocrv4",
            "detector": "yolov8-ui-s",
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
    # Dev-only entrypoint; use uvicorn in production.
    import uvicorn

    port = int(os.environ.get("MODEL_PORT", "5005"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

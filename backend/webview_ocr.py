"""
Gemini Vision API OCR helper for GroundView.
- Input: image path (PNG/JPG), optional crop bounds
- Output: JSON with OCR text extracted via Gemini Vision API

Dependencies: Pillow, requests (or httpx)
Usage:
  python backend/webview_ocr.py --mode gemini --image /path/to/screenshot.png
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

import base64
import requests


def crop_image(image: Path, bounds: str | None) -> tuple[Path, Path | None]:
  if not bounds:
    return image, None
  try:
    from PIL import Image
  except ImportError:
    return image, None
  m = bounds and bounds.strip().replace(" ", "")
  if not m or not m.startswith("[") or "]" not in m:
    return image, None
  try:
    parts = m.replace("][", ",").replace("[", "").replace("]", "").split(",")
    x1, y1, x2, y2 = map(int, parts[:4])
  except Exception:
    return image, None
  if x2 <= x1 or y2 <= y1:
    return image, None
  try:
    img = Image.open(image).convert("RGB")
    w, h = img.size
    x1c, y1c, x2c, y2c = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    if x2c - x1c < 4 or y2c - y1c < 4:
      return image, None
    cropped = img.crop((x1c, y1c, x2c, y2c))
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=image.suffix or ".png")
    cropped.save(tmp.name)
    tmp_path = Path(tmp.name)
    tmp.close()
    return tmp_path, tmp_path
  except Exception:
    return image, None


def encode_image_b64(image: Path) -> str:
  """Encode image file to base64 string."""
  data = Path(image).read_bytes()
  return base64.b64encode(data).decode("utf-8")


def normalize_gemini_model(model: str | None) -> str:
  """
  Normalize model name to the format expected by v1 API.
  - Default: models/gemini-2.5-flash
  - If no prefix, add models/
  """
  m = (model or "").strip()
  if m.startswith("models/"):
    m = m[len("models/") :]
  if m.endswith("-latest"):
    m = m[: -len("-latest")]
  if not m:
    m = "gemini-2.5-flash"
  if m.startswith("gemini-1.5"):
    m = "gemini-2.5-flash"
  return f"models/{m}"


def run_gemini(image: Path, crop_bounds: str | None, model: str, prompt: str) -> Dict[str, Any]:
  api_key = os.environ.get("GEMINI_API_KEY")
  if not api_key:
    raise RuntimeError("GEMINI_API_KEY not set")
  model = normalize_gemini_model(model)
  cropped_image, crop_cleanup = crop_image(image, crop_bounds)
  try:
    b64 = encode_image_b64(cropped_image)
    body = {
      "contents": [
        {
          "parts": [
            {
              "text": prompt
            },
            {
              "inline_data": {
                "mime_type": "image/png",
                "data": b64
              }
            }
          ]
        }
      ]
    }
    urls = [
      f"https://generativelanguage.googleapis.com/v1/{model}:generateContent?key={api_key}",
      f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={api_key}",
    ]
    last_err = None
    data = None
    for url in urls:
      resp = requests.post(url, json=body, timeout=30)
      if resp.status_code != 200:
        last_err = f"Gemini API error {resp.status_code} ({url}): {resp.text[:200]}"
        continue
      try:
        data = resp.json()
        break
      except Exception as e:
        last_err = f"Gemini parse error: {e} ({url})"
        continue
    if data is None:
      raise RuntimeError(last_err or "Gemini API failed")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
      raise RuntimeError("Gemini returned no candidates")
    text_parts = []
    for part in candidates[0].get("content", {}).get("parts", []) or []:
      if "text" in part:
        text_parts.append(part["text"])
    text_out = "\n".join(text_parts).strip()
    return {
      "ok": True,
      "mode": "gemini",
      "source": str(image),
      "text": text_out,
      "raw": data,
    }
  finally:
    if crop_cleanup and Path(crop_cleanup).exists():
      try:
        Path(crop_cleanup).unlink()
      except Exception:
        pass


def main() -> int:
  """Main CLI entry point for Gemini Vision OCR."""
  parser = argparse.ArgumentParser(description="Gemini Vision OCR helper")
  parser.add_argument("--image", required=True, help="Path to screenshot image (PNG/JPG)")
  parser.add_argument("--crop", default=None, help="Crop bounds [x1,y1][x2,y2] to focus OCR area")
  parser.add_argument("--mode", default="gemini", choices=["gemini"], help="OCR mode (default: gemini)")
  parser.add_argument(
    "--gemini-model",
    default="gemini-2.5-flash",
    help="Gemini Vision model (default: gemini-2.5-flash)"
  )
  parser.add_argument(
    "--gemini-prompt",
    default=(
      "Read every visible Korean/English sentence on the image without omission. "
      "Return a compact HTML snippet (no Markdown, no JSON, no code fences). "
      "Use <p> for paragraphs in reading order. "
      "If a table exists, rebuild it as an HTML <table><tbody>…</tbody></table> with rows/cols preserved; "
      "put cell text inside <td> in the correct row/column order. "
      "Do not include extra commentary."
    ),
    help="Custom prompt for Gemini"
  )
  args = parser.parse_args()

  image = Path(args.image).expanduser()
  if not image.exists():
    print(json.dumps({"ok": False, "error": f"Image not found: {image}"}))
    return 1

  try:
    parsed = run_gemini(image, args.crop, args.gemini_model, args.gemini_prompt)
    print(json.dumps(parsed))
    return 0
  except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    return 2


if __name__ == "__main__":
  sys.exit(main())

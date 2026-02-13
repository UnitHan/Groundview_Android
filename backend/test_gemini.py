"""
Simple Gemini API smoke test.
- Loads API key from encrypted storage (user-data/settings.json) or env GEMINI_API_KEY.
- By default sends a lightweight text-only prompt so you can quickly verify 200 OK.
- Optionally pass --image <path> to include an image (base64 inline_data).

Usage examples (PowerShell):
  python backend/test_gemini.py
  python backend/test_gemini.py --image sample.png --prompt "Extract text"
"""

import argparse
import base64
import json
import os
import sys
import requests
from pathlib import Path
from settings_manager import get_settings_manager


def encode_image(path: str) -> dict:
  data = base64.b64encode(open(path, "rb").read()).decode("utf-8")
  return {"mime_type": "image/png", "data": data}


def normalize_model(model: str | None) -> str:
  """
  Normalize model name to a v1-compatible form:
  - default -> gemini-2.5-flash
  - strip models/ prefix before re-applying
  - drop any -latest suffix
  - map legacy gemini-1.5-* names to gemini-2.5-flash
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


def main() -> int:
  parser = argparse.ArgumentParser(description="Gemini API smoke test")
  parser.add_argument("--image", help="Optional image path (PNG/JPG)")
  parser.add_argument("--prompt", default="Return OK if you received this prompt.", help="Text prompt to send")
  parser.add_argument("--model", default=os.environ.get("GEMINI_MODEL"), help="Model name (default env or flash)")
  parser.add_argument("--api-version", default="v1", help="API version: v1 or v1beta (default: v1)")
  args = parser.parse_args()

  # Try to load API key from encrypted storage first, then fall back to environment variable
  manager = get_settings_manager()
  api_key = manager.get_gemini_api_key() or os.environ.get("GEMINI_API_KEY")
  model_arg = args.model or manager.get_gemini_model()

  if not api_key:
    print("GEMINI_API_KEY is not set. Please configure it using Settings menu or set environment variable.", file=sys.stderr)
    return 1

  model = normalize_model(model_arg)
  versions = [args.api_version]
  if "v1beta" not in versions:
    versions.append("v1beta")

  parts = [{"text": args.prompt}]
  if args.image:
    try:
      parts.append({"inline_data": encode_image(args.image)})
    except Exception as e:
      print(f"Failed to read image: {e}", file=sys.stderr)
      return 2

  payload = {"contents": [{"parts": parts}]}

  last_err = None
  for ver in versions:
    url = f"https://generativelanguage.googleapis.com/{ver}/{model}:generateContent?key={api_key}"
    try:
      resp = requests.post(url, json=payload, timeout=20)
    except Exception as e:
      last_err = f"Request error ({ver}): {e}"
      continue
    if resp.status_code != 200:
      last_err = f"HTTP {resp.status_code} ({ver}): {resp.text[:500]}"
      continue
    try:
      data = resp.json()
      print(json.dumps(data, ensure_ascii=False, indent=2))
      return 0
    except Exception as e:
      last_err = f"Failed to parse JSON ({ver}): {e} / body: {resp.text[:200]}"
      continue

  print(last_err or "Unknown error", file=sys.stderr)
  return 4


if __name__ == "__main__":
  sys.exit(main())

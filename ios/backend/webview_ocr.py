"""
Standalone WebView OCR helper using PaddleOCR (PP-OCRv4 by default).
- Input: image path (PNG/JPG). Optional --lang (paddle lang key), --scale (pre-resize factor), --ocr-version (v4|v5).
- Output: JSON with text blocks and bounding boxes (compatible with renderer expectations).

Dependencies: paddleocr + paddlepaddle (CPU). No external binaries required.
Usage:
  python backend/webview_ocr.py --image /path/to/screenshot.png --lang korean
"""

import argparse
import json
import os
import sys
import tempfile
import logging
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import base64
import requests
from html.parser import HTMLParser
import numpy as np

os.environ["FLAGS_minloglevel"] = "3"
os.environ["GLOG_minloglevel"] = "3"
warnings.filterwarnings("ignore")
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("ppstructure").setLevel(logging.ERROR)


_ocr_cache: Dict[Tuple[str, str], Any] = {}


def preprocess_image(image: Path, scale: float) -> tuple[Path, Path | None]:
  if scale <= 1.0:
    return image, None
  try:
    from PIL import Image
  except ImportError:
    return image, None
  try:
    img = Image.open(image).convert("RGB")
    w, h = img.size
    new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
    img = img.resize(new_size, Image.BICUBIC)
    suffix = image.suffix or ".png"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    img.save(tmp.name)
    tmp_path = Path(tmp.name)
    tmp.close()
    return tmp_path, tmp_path
  except Exception:
    return image, None


def otsu_threshold(arr: np.ndarray) -> int:
  hist, _ = np.histogram(arr.flatten(), bins=256, range=(0, 256))
  total = arr.size
  sum_total = np.dot(np.arange(256), hist)
  sum_b, w_b, max_var, threshold = 0.0, 0.0, 0.0, 0
  for t in range(256):
    w_b += hist[t]
    if w_b == 0:
      continue
    w_f = total - w_b
    if w_f == 0:
      break
    sum_b += t * hist[t]
    m_b = sum_b / w_b
    m_f = (sum_total - sum_b) / w_f
    var_between = w_b * w_f * (m_b - m_f) ** 2
    if var_between > max_var:
      max_var = var_between
      threshold = t
  return int(threshold)


def enhance_image(image: Path, contrast: float, sharpness: float, bin_thresh: str | int) -> tuple[Path, Path | None]:
  try:
    from PIL import Image, ImageEnhance
  except ImportError:
    return image, None
  try:
    img = Image.open(image).convert("RGB")
    if contrast and abs(contrast - 1.0) > 1e-2:
      img = ImageEnhance.Contrast(img).enhance(max(0.5, min(contrast, 3.0)))
    if sharpness and abs(sharpness - 1.0) > 1e-2:
      img = ImageEnhance.Sharpness(img).enhance(max(0.5, min(sharpness, 3.0)))
    if bin_thresh:
      gray = img.convert("L")
      if isinstance(bin_thresh, str) and bin_thresh.lower() == "auto":
        arr = np.array(gray)
        t = otsu_threshold(arr)
      else:
        t = int(bin_thresh)
      img = gray.point(lambda p: 255 if p > t else 0)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=image.suffix or ".png")
    img.save(tmp.name)
    tmp_path = Path(tmp.name)
    tmp.close()
    return tmp_path, tmp_path
    # noqa: TRY300
  except Exception:
    return image, None


@dataclass
class CropBox:
  x1: int
  y1: int
  x2: int
  y2: int


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


@dataclass
class CleanupSet:
  paths: list[Path | None]

  def run(self):
    for p in self.paths:
      if p and Path(p).exists():
        try:
          Path(p).unlink()
        except Exception:
          pass


def prepare_image(image: Path, scale: float, contrast: float, sharpness: float, bin_thresh: int) -> tuple[Path, CleanupSet]:
  scaled, cleanup_scaled = preprocess_image(image, scale)
  enhanced, cleanup_enh = enhance_image(scaled, contrast, sharpness, bin_thresh)
  return enhanced, CleanupSet([cleanup_enh, cleanup_scaled])


def rect_from_quad(quad: List[List[float]]) -> tuple[int, int, int, int]:
  xs = [p[0] for p in quad]
  ys = [p[1] for p in quad]
  x1, x2 = min(xs), max(xs)
  y1, y2 = min(ys), max(ys)
  return int(x1), int(y1), int(x2 - x1), int(y2 - y1)


def normalize_lang(lang: str | None) -> str:
  if not lang:
    return "korean"
  norm = lang.lower()
  if norm in ("kor+eng", "eng+kor", "ko+en", "en+ko"):
    return "korean"
  if norm in ("ko", "kor", "korean"):
    return "korean"
  if norm in ("en", "eng", "english"):
    return "en"
  return norm


def load_paddle(lang: str, version: str):
  key = (lang, version)
  if key in _ocr_cache:
    return _ocr_cache[key]
  try:
    from paddleocr import PaddleOCR
  except Exception as e:
    raise RuntimeError(f"PaddleOCR import failed: {e}")
  # PP-OCRv5 weights are not yet exposed separately in paddleocr; map v5 to v4 until available.
  ocr_version = "PP-OCRv4" if version == "v4" else "PP-OCRv4"
  try:
    ocr = PaddleOCR(
      use_angle_cls=True,
      lang=lang,
      show_log=False,
      use_gpu=False,
      ocr_version=ocr_version,
    )
  except Exception as e:
    raise RuntimeError(f"Failed to init PaddleOCR ({lang}, {version}): {e}")
  _ocr_cache[key] = ocr
  return ocr


def run_paddle(
  image: Path,
  lang: str,
  scale: float,
  version: str,
  contrast: float,
  sharpness: float,
  bin_thresh: int,
):
  lang = normalize_lang(lang)
  version = version.lower()
  if version not in ("v4", "v5"):
    version = "v4"
  proc_image, cleanup = prepare_image(image, scale, contrast, sharpness, bin_thresh)
  try:
    ocr = load_paddle(lang, version)
    result = ocr.ocr(str(proc_image), cls=True)
    blocks: List[Dict[str, Any]] = []
    lines_out: List[Dict[str, Any]] = []
    grouped: Dict[int, Dict[str, Any]] = {}
    line_id = 0
    for page in result or []:
      for quad, (text, conf) in page or []:
        if not text:
          continue
        left, top, width, height = rect_from_quad(quad)
        block = {
          "text": text,
          "confidence": float(conf) if conf is not None else -1,
          "left": left,
          "top": top,
          "width": width,
          "height": height,
          "level": 0,
          "block": line_id,
          "par": 0,
          "line": line_id,
        }
        blocks.append(block)
        entry = grouped.get(line_id)
        if not entry:
          grouped[line_id] = {
            "text_parts": [text],
            "confidence_sum": float(conf) if conf is not None else 0.0,
            "count": 1 if conf is not None else 0,
            "left": left,
            "top": top,
            "right": left + width,
            "bottom": top + height,
            "block": line_id,
            "par": 0,
            "line": line_id,
          }
        else:
          entry["text_parts"].append(text)
          entry["left"] = min(entry["left"], left)
          entry["top"] = min(entry["top"], top)
          entry["right"] = max(entry["right"], left + width)
          entry["bottom"] = max(entry["bottom"], top + height)
          if conf is not None:
            entry["confidence_sum"] += float(conf)
            entry["count"] += 1
        line_id += 1

    for _, v in grouped.items():
      avg_conf = (v["confidence_sum"] / v["count"]) if v["count"] else -1
      lines_out.append(
        {
          "text": " ".join(v["text_parts"]),
          "confidence": avg_conf,
          "left": v["left"],
          "top": v["top"],
          "width": v["right"] - v["left"],
          "height": v["bottom"] - v["top"],
          "block": v["block"],
          "par": v["par"],
          "line": v["line"],
        }
      )

    paragraphs: List[Dict[str, Any]] = []
    sorted_lines = sorted(lines_out, key=lambda l: (l["top"], l["left"]))
    current: Dict[str, Any] | None = None
    for ln in sorted_lines:
      if current is None:
        current = {
          "text_parts": [ln["text"]],
          "top": ln["top"],
          "left": ln["left"],
          "right": ln["left"] + ln["width"],
          "bottom": ln["top"] + ln["height"],
          "conf_sum": ln.get("confidence", -1) if ln.get("confidence", -1) >= 0 else 0,
          "conf_count": 1 if ln.get("confidence", -1) >= 0 else 0,
        }
        continue
      gap = ln["top"] - current["bottom"]
      if gap <= ln["height"] * 1.2:
        current["text_parts"].append(ln["text"])
        current["top"] = min(current["top"], ln["top"])
        current["left"] = min(current["left"], ln["left"])
        current["right"] = max(current["right"], ln["left"] + ln["width"])
        current["bottom"] = max(current["bottom"], ln["top"] + ln["height"])
        if ln.get("confidence", -1) >= 0:
          current["conf_sum"] += ln["confidence"]
          current["conf_count"] += 1
      else:
        paragraphs.append(
          {
            "text": "\n".join(current["text_parts"]),
            "left": current["left"],
            "top": current["top"],
            "width": current["right"] - current["left"],
            "height": current["bottom"] - current["top"],
            "confidence": current["conf_sum"] / current["conf_count"] if current["conf_count"] else -1,
          }
        )
        current = {
          "text_parts": [ln["text"]],
          "top": ln["top"],
          "left": ln["left"],
          "right": ln["left"] + ln["width"],
          "bottom": ln["top"] + ln["height"],
          "conf_sum": ln.get("confidence", -1) if ln.get("confidence", -1) >= 0 else 0,
          "conf_count": 1 if ln.get("confidence", -1) >= 0 else 0,
        }
    if current:
      paragraphs.append(
        {
          "text": "\n".join(current["text_parts"]),
          "left": current["left"],
          "top": current["top"],
          "width": current["right"] - current["left"],
          "height": current["bottom"] - current["top"],
          "confidence": current["conf_sum"] / current["conf_count"] if current["conf_count"] else -1,
        }
      )

    return {"blocks": blocks, "lines": lines_out, "paragraphs": paragraphs}
  finally:
    cleanup.run()


def table_lang(lang: str | None) -> str:
  # PP-Structure 테이블은 en/ch만 지원; 한글도 ch로 처리
  return "ch"


def html_to_tsv(html: str) -> str:
  class TableParser(HTMLParser):
    def __init__(self):
      super().__init__()
      self.rows: List[List[str]] = []
      self.current_row: List[str] = []
      self.in_cell = False
      self.buffer: List[str] = []

    def handle_starttag(self, tag, attrs):
      if tag in ("td", "th"):
        self.in_cell = True
        self.buffer = []

    def handle_endtag(self, tag):
      if tag in ("td", "th"):
        text = "".join(self.buffer).strip()
        self.current_row.append(text)
        self.in_cell = False
        self.buffer = []
      if tag == "tr":
        if self.current_row:
          self.rows.append(self.current_row)
        self.current_row = []

    def handle_data(self, data):
      if self.in_cell:
        self.buffer.append(data)

  parser = TableParser()
  try:
    parser.feed(html or "")
    return "\n".join("\t".join(row) for row in parser.rows)
  except Exception:
    return ""


def encode_image_b64(image: Path) -> str:
  data = Path(image).read_bytes()
  return base64.b64encode(data).decode("utf-8")


def run_table(image: Path, lang: str, scale: float, crop_bounds: str | None = None):
  try:
    from paddleocr import PPStructure
  except Exception as e:
    raise RuntimeError(f"PPStructure import failed: {e}")
  cropped_image, crop_cleanup = crop_image(image, crop_bounds)
  proc_image, cleanup = preprocess_image(cropped_image, scale)
  try:
    table_engine = PPStructure(
      lang=table_lang(lang),
      show_log=False,
      layout=True,
      ocr=True,
      table=True,
    )
    result = table_engine(str(proc_image)) or []
    tables = []
    for item in result:
      if item.get("type") != "table":
        continue
      res = item.get("res", {}) or {}
      html = res.get("html", "")
      tables.append(
        {
          "html": html,
          "tsv": html_to_tsv(html),
          "boxes": res.get("boxes", []),
          "bbox": item.get("bbox", []),
        }
      )
    return {"tables": tables}
  finally:
    for p in [crop_cleanup, cleanup]:
      if p and Path(p).exists():
        try:
          Path(p).unlink()
        except Exception:
          pass


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
  parser = argparse.ArgumentParser(description="WebView OCR helper (PaddleOCR)")
  parser.add_argument("--image", required=True, help="Path to screenshot image (PNG/JPG)")
  parser.add_argument("--lang", default="korean", help="PaddleOCR language key (default: korean)")
  parser.add_argument("--ocr-version", default="v4", help="PP-OCR version: v4 or v5 (default: v4)")
  parser.add_argument(
    "--scale", type=float, default=1.8, help="Scale factor before OCR (default: 1.8; higher improves small text)"
  )
  parser.add_argument("--contrast", type=float, default=1.5, help="Contrast gain before OCR (default: 1.5)")
  parser.add_argument("--sharpness", type=float, default=1.5, help="Sharpness gain before OCR (default: 1.5)")
  parser.add_argument(
    "--binarize",
    default="auto",
    help='0=off, 1-255 manual threshold, or "auto" for Otsu (default: auto)'
  )
  parser.add_argument("--crop", default=None, help="Crop bounds [x1,y1][x2,y2] to focus OCR/table")
  parser.add_argument("--mode", default="text", choices=["text", "table", "gemini"], help="OCR mode")
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
    if args.mode == "table":
      parsed = run_table(image, args.lang, args.scale, args.crop)
      tables = parsed.get("tables", [])
      print(
        json.dumps(
          {
            "ok": True,
            "mode": "table",
            "source": str(image),
            "count": len(tables),
            "tables": tables,
          }
        )
      )
      return 0

    if args.mode == "gemini":
      parsed = run_gemini(image, args.crop, args.gemini_model, args.gemini_prompt)
      print(json.dumps(parsed))
      return 0

    binarize = args.binarize
    try:
      # allow numeric strings
      if isinstance(binarize, str) and binarize.lower() != "auto":
        binarize = int(binarize)
    except Exception:
      binarize = "auto"

    parsed = run_paddle(
      image, args.lang, args.scale, args.ocr_version, args.contrast, args.sharpness, binarize
    )
    blocks = parsed.get("blocks", [])
    lines_out = parsed.get("lines", [])
    paragraphs = parsed.get("paragraphs", [])
    print(
      json.dumps(
        {
          "ok": True,
          "mode": "text",
          "source": str(image),
          "count": len(blocks),
          "blocks": blocks,
          "lines": lines_out,
          "lines_count": len(lines_out),
          "paragraphs": paragraphs,
          "paragraphs_count": len(paragraphs),
        }
      )
    )
    return 0
  except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    return 2


if __name__ == "__main__":
  sys.exit(main())

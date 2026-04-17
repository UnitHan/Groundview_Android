"""
icon.png → icon.ico + build/appx/*.png (MSIX 타일 아이콘) 생성 스크립트

MSIX 타일 필수 크기:
  Square44x44Logo.png   - 시작 메뉴 / 작업 표시줄
  StoreLogo.png         - Store 로고
  Square150x150Logo.png - 중간 타일
  Wide310x150Logo.png   - 와이드 타일
  Square310x310Logo.png - 큰 타일
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'icon.png')
OUT_APPX = os.path.join(ROOT, 'build', 'appx')
OUT_ICO  = os.path.join(ROOT, 'icon.ico')

try:
    from PIL import Image
except ImportError:
    print("Pillow 설치 필요: pip install Pillow")
    sys.exit(1)

os.makedirs(OUT_APPX, exist_ok=True)

src = Image.open(SRC).convert('RGBA')
print(f"[icons] 원본: {src.size[0]}x{src.size[1]} {src.mode}")

# 배경색 — 앱 다크 테마 (#0b1221)
BG = (11, 18, 33, 255)


def make_tile(icon: Image.Image, w: int, h: int, padding: float = 0.15) -> Image.Image:
    """아이콘을 패딩을 고려해 중앙 배치한 타일 이미지 생성"""
    canvas = Image.new('RGBA', (w, h), BG)
    icon_w = int(w * (1 - padding * 2))
    icon_h = int(h * (1 - padding * 2))
    # 아이콘 비율 유지
    ratio = min(icon_w / icon.width, icon_h / icon.height)
    nw, nh = int(icon.width * ratio), int(icon.height * ratio)
    resized = icon.resize((nw, nh), Image.LANCZOS)
    x = (w - nw) // 2
    y = (h - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def save_png(img: Image.Image, path: str):
    img.save(path, format='PNG')
    kb = os.path.getsize(path) // 1024
    name = os.path.relpath(path, ROOT).replace('\\', '/')
    print(f"[icons] ✅ {name:<50}  {img.size[0]}x{img.size[1]}  {kb} KB")


# ── icon.ico (NSIS 인스톨러 + 데스크톱 아이콘 + MSIX 타일) ──────────────
# Pillow ICO: append_images is for animations only.
# Use sizes= parameter so Pillow auto-resizes from the source image.
ico_sizes = [16, 32, 48, 64, 128, 256]
src.save(
    OUT_ICO,
    format='ICO',
    sizes=[(s, s) for s in ico_sizes]
)
kb = os.path.getsize(OUT_ICO) // 1024
print(f"[icons] ✅ {'icon.ico':<50}  ({', '.join(str(s) for s in ico_sizes)})  {kb} KB")

# ── MSIX 타일 PNG ────────────────────────────────────────────────────────
TILES = [
    ('Square44x44Logo.png',   44,  44),
    ('StoreLogo.png',         50,  50),
    ('Square150x150Logo.png', 150, 150),
    ('Wide310x150Logo.png',   310, 150),
    ('Square310x310Logo.png', 310, 310),
]

for filename, w, h in TILES:
    img = make_tile(src, w, h)
    save_png(img, os.path.join(OUT_APPX, filename))

print(f"\n[icons] 완료 — build/appx/ 에 {len(TILES)}개 PNG + icon.ico 생성됨")
print("[icons] 다음 단계: npm run dist:msix:norebuild")

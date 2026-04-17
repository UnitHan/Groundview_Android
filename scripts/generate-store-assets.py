"""
Microsoft Store 제출용 이미지 에셋 생성 스크립트
원본: icon.png (1024x1024 RGBA)
출력: resources/store-assets/
"""

import os
import sys
from PIL import Image, ImageDraw

SRC = os.path.join(os.path.dirname(__file__), '..', 'icon.png')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'resources', 'store-assets')

# 배경색 (앱 테마 색상)
BG_COLOR = (11, 18, 33, 255)       # #0b1221 (앱 다크 배경)
BG_COLOR_SOLID = (11, 18, 33)

os.makedirs(OUT_DIR, exist_ok=True)

src = Image.open(SRC).convert('RGBA')
print(f"[store-assets] 원본 이미지: {src.size} {src.mode}")


def make_square(icon: Image.Image, canvas_size: int, icon_ratio: float = 0.75) -> Image.Image:
    """정사각형 캔버스에 아이콘을 중앙 배치"""
    canvas = Image.new('RGBA', (canvas_size, canvas_size), BG_COLOR)
    icon_size = int(canvas_size * icon_ratio)
    resized = icon.resize((icon_size, icon_size), Image.LANCZOS)
    offset = (canvas_size - icon_size) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def make_poster(icon: Image.Image, w: int, h: int, icon_ratio: float = 0.72) -> Image.Image:
    """9:16 포스터 아트: 아이콘을 세로 중앙 약간 위에 배치, 하단에 앱 이름"""
    canvas = Image.new('RGBA', (w, h), BG_COLOR)

    icon_size = int(w * icon_ratio)
    resized = icon.resize((icon_size, icon_size), Image.LANCZOS)

    # 수평 중앙, 수직은 전체 높이의 35% 지점 (중앙보다 약간 위)
    x = (w - icon_size) // 2
    y = int(h * 0.12)

    canvas.paste(resized, (x, y), resized)

    # 하단에 앱 이름 텍스트 추가 (PIL 기본 폰트)
    try:
        from PIL import ImageFont
        font_size = max(int(w * 0.07), 24)
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", font_size)
            font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", max(int(font_size * 0.55), 14))
        except Exception:
            font = ImageFont.load_default()
            font_sub = font

        draw = ImageDraw.Draw(canvas)

        # 앱 이름
        text = "GroundView"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        tx = (w - tw) // 2
        ty = y + icon_size + int(h * 0.04)
        draw.text((tx, ty), text, fill=(255, 255, 255, 230), font=font)

        # 부제
        sub = "Mobile UI Test Automation"
        bbox2 = draw.textbbox((0, 0), sub, font=font_sub)
        sw = bbox2[2] - bbox2[0]
        sx = (w - sw) // 2
        sy = ty + int(font_size * 1.3)
        draw.text((sx, sy), sub, fill=(100, 160, 220, 180), font=font_sub)
    except Exception as e:
        print(f"  [warn] 텍스트 렌더링 실패: {e}")

    return canvas


# ── 생성할 에셋 정의 ──────────────────────────────────────
assets = [
    # (파일명, 함수, 인자)

    # 9:16 포스터 아트 (Xbox / Windows 기본 로고)
    ('poster_720x1080.png',   'poster',  (720, 1080)),
    ('poster_1440x2160.png',  'poster',  (1440, 2160)),

    # 1:1 박스 아트
    ('box_1080x1080.png',     'square',  (1080,)),
    ('box_2160x2160.png',     'square',  (2160,)),

    # 1:1 앱 타일 아이콘 (Store 표시용)
    ('tile_300x300.png',      'square',  (300,)),
    ('tile_150x150.png',      'square',  (150,)),
    ('tile_71x71.png',        'square',  (71,)),
]

for filename, kind, args in assets:
    if kind == 'square':
        img = make_square(src, args[0])
    elif kind == 'poster':
        img = make_poster(src, args[0], args[1])
    else:
        continue

    # RGBA → RGB (PNG는 RGBA 유지)
    out_path = os.path.join(OUT_DIR, filename)
    img.save(out_path, 'PNG', optimize=True)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"[store-assets] ✅ {filename:30s}  {img.size[0]:5d}x{img.size[1]:<5d}  {size_kb:5d} KB")

print(f"\n[store-assets] 모든 에셋 생성 완료 → {os.path.abspath(OUT_DIR)}")

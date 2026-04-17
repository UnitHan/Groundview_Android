"""
Regenerate all build/appx/ tile images from icon.png (project root).

Source: <root>/icon.png  (app icon — white artwork is transparent cutout)

Design note: icon.png uses alpha=0 for the white artwork (phone, magnifier).
DO NOT alpha_composite — that turns transparent areas back into blue, erasing
the artwork. Instead just resize and preserve the original alpha channel.
The APPX manifest's backgroundColor fills transparent regions at render time.

Sizes required for Windows MSIX/APPX:
  Square44x44Logo.png       44x44
  Square150x150Logo.png    150x150
  Square310x310Logo.png    310x310
  StoreLogo.png             50x50
  Wide310x150Logo.png      310x150  (icon centred on solid bg canvas)

Usage:
  python build/gen_appx_icons.py
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow not installed. Run: pip install pillow")
    sys.exit(1)

ROOT     = Path(__file__).parent.parent
SRC      = ROOT / "icon.png"
APPX_DIR = ROOT / "build" / "appx"

TARGETS = [
    ("Square44x44Logo.png",   (44,  44)),
    ("Square150x150Logo.png", (150, 150)),
    ("Square310x310Logo.png", (310, 310)),
    ("StoreLogo.png",         (50,  50)),
    ("Wide310x150Logo.png",   (310, 150)),
]


def extract_artwork(img: Image.Image) -> Image.Image:
    """icon.png structure: blue rounded-rect (opaque) with transparent cutouts
    for the white artwork (phone, magnifier).  Invert the alpha channel so the
    blue background becomes transparent and the artwork becomes opaque.
    Artwork is rendered in sky blue (#4AADDF).
    """
    rgba = img.convert("RGBA")
    r, g, b, a = rgba.split()
    inv_a = a.point(lambda x: 255 - x)   # bg (opaque) → transparent; artwork → opaque
    sky_r = Image.new("L", rgba.size, 74)
    sky_g = Image.new("L", rgba.size, 173)
    sky_b = Image.new("L", rgba.size, 223)
    return Image.merge("RGBA", (sky_r, sky_g, sky_b, inv_a))


def make_square(artwork: Image.Image, size: tuple) -> Image.Image:
    """Resize artwork to exact square — transparent background, white artwork."""
    return artwork.resize(size, Image.LANCZOS)


def make_wide(artwork: Image.Image, size: tuple) -> Image.Image:
    """Centre artwork on a fully transparent 310x150 canvas."""
    target_w, target_h = size   # 310, 150
    icon_size = target_h        # 150x150

    icon = artwork.resize((icon_size, icon_size), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    offset_x = (target_w - icon_size) // 2
    canvas.paste(icon, (offset_x, 0), mask=icon.split()[3])
    return canvas


def main():
    if not SRC.exists():
        print(f"[ERROR] Source icon not found: {SRC}")
        sys.exit(1)

    print(f"[info] Source  : {SRC}")
    APPX_DIR.mkdir(parents=True, exist_ok=True)

    src_img = Image.open(SRC)
    artwork = extract_artwork(src_img)
    print(f"[info] Artwork extracted (transparent bg, white artwork)")

    for filename, size in TARGETS:
        out_path = APPX_DIR / filename
        if filename == "Wide310x150Logo.png":
            result = make_wide(artwork, size)
        else:
            result = make_square(artwork, size)

        result.save(out_path, "PNG")
        print(f"[ok]   {filename:30s}  {size[0]}x{size[1]}")

    print()
    print("[done] All appx icons regenerated.")
    print(f"       Output: {APPX_DIR}")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()

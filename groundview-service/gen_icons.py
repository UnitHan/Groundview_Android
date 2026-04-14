from PIL import Image
import os

src = 'icon.png'
img = Image.open(src).convert('RGBA')

sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

base = 'groundview-service/app/src/main/res'
for folder, size in sizes.items():
    out_dir = f'{base}/{folder}'
    os.makedirs(out_dir, exist_ok=True)
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(f'{out_dir}/ic_launcher.png')
    resized.save(f'{out_dir}/ic_launcher_round.png')
    print(f'{folder}: {size}x{size} OK')
print('Done')

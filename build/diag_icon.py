from PIL import Image
img = Image.open(r'C:\Groundview\icon.png')
print('Mode:', img.mode)
print('Size:', img.size)
w, h = img.size
pts = {
    'top-center (phone earpiece)': (w//2, int(h*0.15)),
    'center (magnifier)':          (w//2, h//2),
    'left-edge (bg)':              (int(w*0.08), h//2),
    'corner':                      (5, 5),
}
for label, (x, y) in pts.items():
    print(f'  {label:30s}: {img.getpixel((x, y))}')

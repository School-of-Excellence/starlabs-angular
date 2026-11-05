# Trim uniform empty space at the bottom of web shots; downsize phone shots. Output → site/img/
import glob, os, sys
from PIL import Image, ImageChops
S = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(S, 'site', 'img'); os.makedirs(OUT, exist_ok=True)
def trim_bottom(im, pad=40):
    g = im.convert('L'); w, h = g.size
    bg = g.getpixel((w // 2, h - 2))
    px = g.load(); y = h - 1
    while y > h * 0.25:
        row = [px[x, y] for x in range(0, w, 6)]
        if max(abs(v - bg) for v in row) > 12: break
        y -= 1
    return im.crop((0, 0, w, min(h, y + pad)))
for f in sorted(glob.glob(os.path.join(S, 'shots/web/*.jpg'))):
    n = os.path.basename(f)
    if n.startswith('zz-'): continue
    im = Image.open(f).convert('RGB')
    if im.size == (2880, 1800): im = trim_bottom(im)
    if im.width > 2200: im = im.resize((2200, round(im.height * 2200 / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, n), quality=82, optimize=True, progressive=True)
for f in sorted(glob.glob(os.path.join(S, 'shots/mobile/*.png'))):
    im = Image.open(f).convert('RGB')
    im = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, 'm-' + os.path.basename(f)[:-4] + '.jpg'), quality=84, optimize=True, progressive=True)
tot = sum(os.path.getsize(p) for p in glob.glob(OUT + '/*'))
print(len(os.listdir(OUT)), 'images', round(tot / 1e6, 1), 'MB')

"""v64y an SF2 scope reticle (common_sight: mic_ScopeView* = a black-on-white Crosshair_Diffuse multiplied over the view + a red
_dot added) -> the <svg class="ret <name>"> for src/00_head.html's #scope: the texture's dark texels as merged rectangles, at the
lens mask's scale (tex_scope_Circle_Alpha: 200 of 256 half-texels = the tube's 71vh), only inside the lens.
  python tools/sf2_reticle_svg.py <name> <diffuse.png> [<dot.png>]"""
import sys
from PIL import Image
name, diff = sys.argv[1], sys.argv[2]; dot = sys.argv[3] if len(sys.argv) > 3 else None
im = Image.open(diff).convert('L'); w = im.size[0]; c = w / 2; k = 71 / (200 * w / 512); R = 200 * w / 512
rects = {}  # (x0, x1) run -> list of [y0, y1]
for y in range(w):
    x = 0
    while x < w:
        if im.getpixel((x, y)) < 128:
            x0 = x
            while x < w and im.getpixel((x, y)) < 128: x += 1
            if ((x0 + x) / 2 - c) ** 2 + (y + 0.5 - c) ** 2 <= R * R:
                L = rects.setdefault((x0, x), [])
                if L and L[-1][1] == y: L[-1][1] = y + 1
                else: L.append([y, y + 1])
        else: x += 1
f = lambda v: round(v, 2)
parts = [f'<rect x="{f((x0 - c) * k)}" y="{f((y0 - c) * k)}" width="{f((x1 - x0) * k)}" height="{f((y1 - y0) * k)}"/>' for (x0, x1), L in rects.items() for y0, y1 in L]
dots = ''
if dot:
    d = Image.open(dot).convert('RGB'); pts = [(x, y) for x in range(w) for y in range(w) if d.getpixel((x, y))[0] > 128]
    if pts:
        cx = sum(p[0] for p in pts) / len(pts) + 0.5 - c; cy = sum(p[1] for p in pts) / len(pts) + 0.5 - c; r = max(0.35, (len(pts) / 3.14) ** 0.5 * k)
        dots = f'<circle cx="{f(cx * k)}" cy="{f(cy * k)}" r="{f(r)}" fill="#ff1a0a"/>'
print(f'<svg class="ret {name}" viewBox="-50 -50 100 100"><g fill="#111" fill-opacity=".9">' + ''.join(parts) + '</g>' + dots + '</svg>')
print(len(parts), 'rects', file=sys.stderr)

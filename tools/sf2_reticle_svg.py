"""v64y an SF2 scope reticle (common_sight: mic_ScopeView* = a black-on-white Crosshair_Diffuse multiplied over the view + a red
_dot added) -> the <svg class="ret <name>"> for src/00_head.html's #scope: the texture's dark texels as merged rectangles, at the
lens mask's scale (tex_scope_Circle_Alpha: 200 of 256 half-texels = the tube's 71vh), only inside the lens.
  python tools/sf2_reticle_svg.py <name> <diffuse.png> [<dot.png>]"""
import sys
from PIL import Image
name, diff = sys.argv[1], sys.argv[2]; dot = sys.argv[3] if len(sys.argv) > 3 else None
im = Image.open(diff).convert('L'); w = im.size[0]; c = w / 2; k = 71 / (200 * w / 512); R = 200 * w / 512
def runs(dark):  # the texels where dark(x, y), as rectangles merged down the rows: {(x0, x1): [[y0, y1], …]}
    rects = {}
    for y in range(w):
        x = 0
        while x < w:
            if dark(x, y):
                x0 = x
                while x < w and dark(x, y): x += 1
                if ((x0 + x) / 2 - c) ** 2 + (y + 0.5 - c) ** 2 <= R * R:
                    L = rects.setdefault((x0, x), [])
                    if L and L[-1][1] == y: L[-1][1] = y + 1
                    else: L.append([y, y + 1])
            else: x += 1
    return rects
rects = runs(lambda x, y: im.getpixel((x, y)) < 128)
f = lambda v: round(v, 2)
parts = [f'<rect x="{f((x0 - c) * k)}" y="{f((y0 - c) * k)}" width="{f((x1 - x0) * k)}" height="{f((y1 - y0) * k)}"/>' for (x0, x1), L in rects.items() for y0, y1 in L]
dots = ''
if dot:  # (v64y the _dot sheet is the lit part of the reticle — one red texel pair for mic_ScopeView, red line work for _01)
    d = Image.open(dot).convert('RGB'); red = runs(lambda x, y: d.getpixel((x, y))[0] > 128)
    dots = '<g fill="#ff1a0a">' + ''.join(f'<rect x="{f((x0 - c) * k)}" y="{f((y0 - c) * k)}" width="{f(max(x1 - x0, 1.5) * k)}" height="{f(max(y1 - y0, 1.5) * k)}"/>' for (x0, x1), L in red.items() for y0, y1 in L if x1 - x0 <= 6 or y1 - y0 <= 6) + '</g>'  # (lines only: _01's sheet also holds a 37 × 13 texel block at the centre, a glow the material masks)
print(f'<svg class="ret {name}" viewBox="-50 -50 100 100"><g fill="#111" fill-opacity=".9">' + ''.join(parts) + '</g>' + dots + '</svg>')
print(len(parts), 'rects', file=sys.stderr)

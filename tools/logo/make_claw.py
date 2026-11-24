"""Claw-scratch logo (user 11-24): four torn slashes, transparent background (no fill behind them).
   Shown on the sheet inside an app-icon frame whose inside is Chrome's dark-mode bookmark bar grey, so it reads as it will in the browser.
   python tools/logo/make_claw.py  ->  assets/logo/claw/claw_XX.svg + sheet.html"""
import math, os, random

OUT = 'assets/logo/claw'
os.makedirs(OUT, exist_ok=True)
CHROME_DARK = '#35363a'  # Chrome dark mode: toolbar / bookmark bar


def slash(x0, y0, x1, y1, bend, width, rnd):
    """one torn slash: a curved spine, thick in the middle, needle-thin at both ends, its edges ragged."""
    N = 60; L = []; R = []
    dx, dy = x1 - x0, y1 - y0; ln = math.hypot(dx, dy); nx, ny = -dy / ln, dx / ln
    for k in range(N + 1):
        t = k / N
        cx = x0 + dx * t + nx * bend * math.sin(math.pi * t); cy = y0 + dy * t + ny * bend * math.sin(math.pi * t)
        w = width * (math.sin(math.pi * t) ** 0.75) * (0.55 + 0.45 * t)  # heavier toward the far end, as a claw drags
        jag = lambda: (1 + rnd.uniform(-0.35, 0.35)) if 0.06 < t < 0.94 else 1
        L.append((cx + nx * w * jag(), cy + ny * w * jag())); R.append((cx - nx * w * jag(), cy - ny * w * jag()))
    pts = L + R[::-1]
    return 'M' + ' L'.join('%.1f %.1f' % p for p in pts) + ' Z'


def claws(seed=7, width=34, spread=1.0):
    """four slashes up to the right, spaced across the frame (perpendicular to their run), the outer two shorter."""
    rnd = random.Random(seed); d = []; a = math.radians(-40); ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
    for off, s, along in [(-165, 0.78, -20), (-55, 1.0, 0), (55, 0.97, 10), (165, 0.74, 30)]:
        cx, cy = 500 + px * off * spread + ux * along, 500 + py * off * spread + uy * along; half = 400 * s
        d.append(slash(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half, -55 * s, width * (0.8 + 0.2 * s), rnd))
    return d


def svg(i, fill, seed=7, width=34, glow=None):
    g = ''
    if not isinstance(fill, str):
        kind, *cols = fill
        stops = ''.join('<stop offset="%.2f" stop-color="%s"/>' % (k / (len(cols) - 1), c) for k, c in enumerate(cols))
        g = ('<linearGradient id="c%d" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' if kind == 'vert' else
             '<linearGradient id="c%d" x1="0" y1="1" x2="1" y2="0">%s</linearGradient>') % (i, stops)
        fill = 'url(#c%d)' % i
    f = ''
    if glow:
        f = '<filter id="f%d" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="14" result="b"/><feFlood flood-color="%s"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>' % (i, glow)
    paths = ''.join('<path d="%s"/>' % p for p in claws(seed, width))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">'
            '<defs>%s%s</defs><g fill="%s"%s>%s</g></svg>\n') % (g, f, fill, ' filter="url(#f%d)"' % i if glow else '', paths)


V = [  # code, name, fill, note, extras
    ('CL01', '金屬灰', ('vert', '#e9e9ea', '#9a9aa0', '#d4d4d8'), '亮銀 #e9e9ea → #9a9aa0 → #d4d4d8', {}),
    ('CL02', '純白', '#f5f5f5', '單色 #f5f5f5', {}),
    ('CL03', '血紅', ('vert', '#ff3b3b', '#a3000f'), '#ff3b3b → #a3000f', {}),
    ('CL04', '爪痕紅光', '#ff2a2a', '#ff2a2a ＋紅色光暈', {'glow': '#ff0000'}),
    ('CL05', '黃銅', ('diag', '#7a5310', '#f6d37a', '#c99327'), '#7a5310 → #f6d37a → #c99327', {}),
    ('CL06', '霓虹青', '#3ff2e6', '#3ff2e6 ＋青色光暈', {'glow': '#00e5ff'}),
    ('CL07', '烈焰', ('vert', '#ffd200', '#ff6a00', '#d61f1f'), '#ffd200 → #ff6a00 → #d61f1f', {}),
    ('CL08', '毒綠', ('vert', '#b6ff3b', '#1fa83a'), '#b6ff3b → #1fa83a', {}),
    ('CL09', '紫電', ('diag', '#7b2ff7', '#f107a3'), '#7b2ff7 → #f107a3', {}),
    ('CL10', '冰藍', ('vert', '#e3f6ff', '#4facfe'), '#e3f6ff → #4facfe', {}),
    ('CL11', '細爪金屬灰', ('vert', '#e9e9ea', '#9a9aa0', '#d4d4d8'), '較細的爪痕', {'width': 24, 'seed': 3}),
    ('CL12', '粗爪血紅', ('vert', '#ff3b3b', '#a3000f'), '較粗的爪痕', {'width': 46, 'seed': 11}),
]
cards = []
for k, (code, name, fill, note, ex) in enumerate(V, 1):
    fn = 'claw_%02d.svg' % k
    open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(svg(k, fill, **ex))
    cards.append('<div class="card"><div class="big"><img src="%s"></div><hr><div class="row"><span class="code">%s</span>'
                 '<div class="txt"><b>%s</b><small>透明底，%s</small></div><div class="s48"><img src="%s"></div><div class="s16"><img src="%s"></div></div></div>'
                 % (fn, code, name, note, fn, fn))
open(os.path.join(OUT, 'sheet.html'), 'w', encoding='utf-8').write(
    '<!doctype html><meta charset="utf-8"><title>Claw logo</title><style>'
    'body{margin:0;background:#fff;font-family:"Microsoft JhengHei",system-ui;color:#222}'
    'main{display:grid;grid-template-columns:repeat(4,400px);gap:20px;padding:24px}'
    '.card{border:1px solid #e6e6e6;border-radius:18px;padding:22px 22px 18px}'
    '.big{width:180px;height:180px;margin:6px auto 22px;border:4px solid #d9d9d9;border-radius:42px;background:' + CHROME_DARK + ';display:flex;align-items:center;justify-content:center}'
    '.big img{width:160px;height:160px}hr{border:0;border-top:1px solid #ececec;margin:0 0 14px}'
    '.row{display:flex;align-items:center;gap:12px}.code{background:#c8c8c8;padding:2px 4px;font:16px monospace}'
    '.txt{flex:1;display:flex;flex-direction:column;gap:4px}.txt b{font-size:19px}.txt small{font-size:13px;color:#777;line-height:1.4}'
    '.s48{width:48px;height:48px;border:2px solid #d9d9d9;border-radius:12px;background:' + CHROME_DARK + ';display:flex;align-items:center;justify-content:center}.s48 img{width:40px}'
    '.s16{width:22px;height:22px;background:' + CHROME_DARK + ';display:flex;align-items:center;justify-content:center}.s16 img{width:16px}'
    '</style><main>' + ''.join(cards) + '</main>')
print('ok', len(V))

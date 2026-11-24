"""20 revolver-cylinder logo concepts (user 11-24): white background, solid or gradient fills.
   python tools/logo/make_logos.py  ->  assets/logo/concepts/logo_XX.svg + sheet.html"""
import math, os

OUT = 'assets/logo/concepts'
os.makedirs(OUT, exist_ok=True)


def pol(r, a):
    return 500 + r * math.cos(a), 500 + r * math.sin(a)


def fill_def(i, f):
    if isinstance(f, str):
        return '', f
    kind, *cols = f
    stops = ''.join('<stop offset="%.2f" stop-color="%s"/>' % (k / (len(cols) - 1), c) for k, c in enumerate(cols))
    if kind == 'lin':
        g = '<linearGradient id="g%d" x1="0" y1="0" x2="1" y2="1">%s</linearGradient>' % (i, stops)
    elif kind == 'vert':
        g = '<linearGradient id="g%d" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % (i, stops)
    else:
        g = '<radialGradient id="g%d" cx="0.38" cy="0.32" r="0.8">%s</radialGradient>' % (i, stops)
    return g, 'url(#g%d)' % i


def circ(x, y, r, col):
    return '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (x, y, r, col)


def logo(i, n=6, outline='flute', R=330, hole=0.2, notch=0.21, rot=-90, center='ring', fill='#0d3b40',
         primer=False, ring=False, flute_in=False):
    """n chambers; outline: flute (round notches between chambers) / cog (wide shallow notches) / round / poly."""
    g, F = fill_def(i, fill)
    a0 = math.radians(rot)
    step = 2 * math.pi / n
    m = []  # mask: white = solid, black = cut away
    if outline == 'poly':
        pts = ' '.join('%.1f,%.1f' % pol(R, a0 + step * (k + 0.5)) for k in range(n))
        m.append('<polygon points="%s" fill="#fff"/>' % pts)
    else:
        m.append(circ(500, 500, R, '#fff'))
    if outline in ('flute', 'cog'):
        nr = R * notch
        for k in range(n):
            if outline == 'flute':
                x, y = pol(R * 1.05, a0 + step * (k + 0.5)); m.append(circ(x, y, nr, '#000'))
            else:
                x, y = pol(R + nr * 0.55, a0 + step * (k + 0.5)); m.append(circ(x, y, nr * 1.3, '#000'))
    if flute_in:  # long flutes cut into the face between the chambers
        for k in range(n):
            a = a0 + step * (k + 0.5)
            x1, y1 = pol(R * 0.6, a); x2, y2 = pol(R * 0.84, a)
            m.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#000" stroke-width="%.1f" stroke-linecap="round"/>' % (x1, y1, x2, y2, R * 0.07))
    hr = R * hole
    cr = R * (0.55 if n <= 6 else 0.6)
    for k in range(n):
        x, y = pol(cr, a0 + step * k)
        m.append(circ(x, y, hr, '#000'))
        if primer:  # a cartridge base in each chamber with its primer
            m.append(circ(x, y, hr * 0.72, '#fff')); m.append(circ(x, y, hr * 0.28, '#000'))
    c = R * 0.14
    if center == 'ring':
        m += [circ(500, 500, c * 1.15, '#000'), circ(500, 500, c * 0.95, '#fff'), circ(500, 500, c * 0.8, '#000')]
    elif center == 'hole':
        m.append(circ(500, 500, c, '#000'))
    elif center == 'star':
        pts = ' '.join('%.1f,%.1f' % pol(c * (1.3 if k % 2 == 0 else 0.52), math.radians(-90) + k * math.pi / 5) for k in range(10))
        m.append('<polygon points="%s" fill="#000"/>' % pts)
    elif center == 'hex':
        pts = ' '.join('%.1f,%.1f' % pol(c * 1.05, k * math.pi / 3) for k in range(6))
        m.append('<polygon points="%s" fill="#000"/>' % pts)
    elif center == 'cross':
        m.append(circ(500, 500, c * 1.2, '#000'))
        m.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#fff"/>' % (500 - c * 0.18, 500 - c * 0.85, c * 0.36, c * 1.7))
        m.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#fff"/>' % (500 - c * 0.85, 500 - c * 0.18, c * 1.7, c * 0.36))
    extra = ''
    if ring:
        extra = '<circle cx="500" cy="500" r="%.1f" fill="none" stroke="%s" stroke-width="%.1f"/>' % (R * 1.17, F, R * 0.05)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n'
            '<defs>%s<mask id="m%d" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">'
            '<rect width="1000" height="1000" fill="#000"/>%s</mask></defs>\n'
            '<rect width="1000" height="1000" fill="#ffffff"/>\n'
            '<g mask="url(#m%d)"><rect width="1000" height="1000" fill="%s"/></g>%s\n</svg>\n') % (g, i, ''.join(m), i, F, extra)


V = [  # 20 concepts: shape x colour
    dict(n=6, outline='flute', fill='#0d3b40', center='ring'),                                            # 01 classic, deep teal
    dict(n=6, outline='flute', fill=('lin', '#ff6a3d', '#d61f45'), center='ring'),                       # 02 sunset gradient
    dict(n=6, outline='cog', fill='#1b1f24', center='hole', notch=0.24),                                   # 03 gunmetal, wide notches
    dict(n=6, outline='flute', fill=('rad', '#f6d37a', '#c99327', '#7a5310'), center='ring', primer=True), # 04 brass, loaded
    dict(n=5, outline='flute', fill='#c8102e', center='star', notch=0.24),                                 # 05 five-shot, red star
    dict(n=8, outline='flute', fill=('lin', '#2a7bff', '#14c8c8'), center='ring', hole=0.16, notch=0.15), # 06 eight-shot, ocean
    dict(n=6, outline='round', fill='#111111', center='cross', flute_in=True),                            # 07 black, inset flutes, crosshair
    dict(n=6, outline='flute', fill=('vert', '#8e9aa6', '#2f3a44'), center='hex'),                        # 08 steel
    dict(n=6, outline='poly', fill='#ff8a00', center='ring', R=350),                                      # 09 hexagon, orange
    dict(n=7, outline='flute', fill=('lin', '#7b2ff7', '#f107a3'), center='hole', hole=0.18, notch=0.18), # 10 seven-shot, neon
    dict(n=6, outline='flute', fill='#2e5e2b', center='ring', ring=True, R=300),                          # 11 olive, outer ring
    dict(n=6, outline='cog', fill=('rad', '#ff4d4d', '#8b0000'), center='star', notch=0.26),              # 12 crimson glow
    dict(n=6, outline='flute', fill='#0a2a66', center='ring', primer=True),                               # 13 navy, loaded
    dict(n=6, outline='flute', fill=('lin', '#00c853', '#00695c'), center='cross', rot=-60),              # 14 emerald, turned
    dict(n=8, outline='poly', fill='#3d3d3d', center='hex', R=350, hole=0.17),                             # 15 octagon, graphite
    dict(n=6, outline='round', fill=('lin', '#ffd200', '#f7971e'), center='ring', flute_in=True),         # 16 gold, inset flutes
    dict(n=5, outline='cog', fill=('vert', '#4facfe', '#00184d'), center='hole', notch=0.26),             # 17 five-shot, night sky
    dict(n=6, outline='flute', fill='#d7263d', center='hole', ring=True, R=300, hole=0.23),                # 18 bold red, ring
    dict(n=6, outline='flute', fill=('rad', '#b0bec5', '#455a64', '#1c262b'), center='ring', primer=True), # 19 polished steel, loaded
    dict(n=6, outline='flute', fill=('lin', '#0d3b40', '#1fb5a8'), center='star', notch=0.22),            # 20 teal gradient, star
]

names = []
for k, v in enumerate(V, 1):
    fn = 'logo_%02d.svg' % k
    open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(logo(k, **v))
    names.append(fn)
cells = ''.join('<figure><img src="%s"><figcaption>%02d</figcaption></figure>' % (fn, k) for k, fn in enumerate(names, 1))
open(os.path.join(OUT, 'sheet.html'), 'w', encoding='utf-8').write(
    '<!doctype html><meta charset="utf-8"><title>Logo concepts</title>'
    '<style>body{margin:0;background:#fff;font:600 18px system-ui;color:#444}'
    'main{display:grid;grid-template-columns:repeat(5,240px);gap:16px;padding:24px}'
    'figure{margin:0;border:1px solid #e3e3e3;border-radius:10px;padding:8px;text-align:center}'
    'img{width:220px;height:220px}figcaption{margin-top:4px}</style><main>' + cells + '</main>')
print('ok', len(names))

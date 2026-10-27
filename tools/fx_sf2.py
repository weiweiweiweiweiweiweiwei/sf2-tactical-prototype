"""SF2's own muzzle-flash textures (user 10-27: the original flash) -> assets/fx_sf2.js (window.SF2_FX = {name: data URL}).
  python tools/fx_sf2.py
Input: UModel exports of SF2_Env_fx (tools/out/mf/SF2_Env_fx/Texture2D): the materials the rifle flash systems
P_WP_MF_AR_03_NoZoom / _Zoom in SF2_Weapon_fx.upk use (src/09c_sf2rig.js SF2Flash has their particle settings)."""
import base64, io
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]; SRC = ROOT / 'tools/out/mf/SF2_Env_fx/Texture2D'
# name: (texture, size, keep alpha) — the additive ones are colour on black
TEX = {'front': ('T_Muzzle_front_01', 256, False), 'star': ('T_Muzzle_02', 256, False), 'lens': ('T_Lens_03', 128, False),
       'explo': ('T_Multi_Explo_seq_01', 256, False), 'smoke': ('T_thick_smoke_01', 128, True)}
out = {}
for k, (f, s, a) in TEX.items():
    im = Image.open(SRC / f'{f}.png').convert('RGBA' if a else 'RGB').resize((s, s), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=88); out[k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
js = '/* Special Force 2 original muzzle-flash textures from the user\'s own install — tools/fx_sf2.py */\nwindow.SF2_FX = {\n' + \
     ',\n'.join(f'  {k}: "{v}"' for k, v in out.items()) + '\n};\n'
(ROOT / 'assets/fx_sf2.js').write_text(js, encoding='utf-8'); print('assets/fx_sf2.js', len(js) >> 10, 'KB')

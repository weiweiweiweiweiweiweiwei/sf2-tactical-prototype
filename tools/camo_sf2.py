"""SF2's own weapon camos (user 10-28: 魔術迴路 = CircuitFX) -> assets/camo_sf2.js (window.SF2_CAMO = {camo: {texture: data URL}}).
  python tools/camo_sf2.py
Input: UModel `-export -png weapon_shader_base_sc` (-> tools/out/sf2/camo/weapon_camo01/Texture2D). CircuitFX is the item
SFCItem_Func_WeaponCamo_CircuitFX (CamoType ECAMOT_MATERIAL, ActionCamoKillTime 1.5) on the material circuit_FX_m: FX_circuit_Base
(the teal band), _Shine (the circuit lines), _Kill (the yellow lightning a kill lights up). The cooked material keeps only its
parameters (camo_value 2, SpecularPower 0.4 …); the panners' speeds were cooked away — src/09_models.js SF2Camo sets them by eye."""
import base64, io
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]; SRC = ROOT / 'tools/out/sf2/camo/weapon_camo01/Texture2D'
CAMO = {'circuit': {'base': ('FX_circuit_Base', 256), 'shine': ('FX_circuit_Shine', 512), 'kill': ('FX_circuit_Kill', 512)}}
out = {}
for c, tex in CAMO.items():
    out[c] = {}
    for k, (f, s) in tex.items():
        im = Image.open(SRC / f'{f}.png').convert('RGB').resize((s, s), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, 'WEBP', quality=88); out[c][k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
js = '/* Special Force 2 original weapon camos from the user\'s own install — tools/camo_sf2.py */\nwindow.SF2_CAMO = {\n' + \
     ',\n'.join(f'  {c}: {{ ' + ', '.join(f'{k}: "{v}"' for k, v in t.items()) + ' }' for c, t in out.items()) + '\n};\n'
(ROOT / 'assets/camo_sf2.js').write_text(js, encoding='utf-8'); print('assets/camo_sf2.js', len(js) >> 10, 'KB')

"""v67d Apex extended magazines (user 11-07): each gun's base mag and its mag mods' sizes from Apex's own weapon settings
(RSX --exporttypes wepn -> tools/out/apex/wepn/weapon/mp_weapon_<internal>.txt) -> tools/out/apex/guns/mags.json
{ gun: { base, kind (light/heavy/energy/sniper), l: [l1, l2, l3], reloadK: [k1, k2, k3] } }."""
import re, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; W = ROOT / 'tools/out/apex/wepn/weapon'
INTERNAL = {'havoc': 'energy_ar', 'hemlok': 'hemlok', 'nemesis': 'nemesis', 'r301': 'rspn101', 'flatline': 'vinson', 'alternator': 'alternator_smg',
  'car': 'car', 'prowler': 'pdw', 'r99': 'r97', 'volt': 'volt_smg', 'devotion': 'esaw', 'lstar': 'lstar', 'spitfire': 'lmg', 'rampage': 'dragon_lmg',
  'repeater': '3030', 'bocek': 'bow', 'g7': 'g2', 'tripletake': 'doubletake', 'chargerifle': 'defender', 'kraber': 'sniper', 'longbow': 'dmr',
  'sentinel': 'sentinel', 'eva8': 'shotgun', 'mastiff': 'mastiff', 'mozambique': 'shotgun_pistol', 'peacekeeper': 'energy_shotgun', 'p2020': 'semipistol',
  're45': 'autopistol', 'wingman': 'wingman'}
def val(base, v):
  if v.startswith('++'): return base + float(v[2:])
  if v.startswith('*'): return base * float(v[1:])
  return float(v)
out = {}
for g, n in INTERNAL.items():
  s = (W / f'mp_weapon_{n}.txt').read_text(errors='replace')
  b = re.search(r'^\t"ammo_clip_size" "([^"]+)"', s, re.M); base = int(float(b.group(1))) if b else 0
  rl = re.search(r'^\t"reload_time" "([^"]+)"', s, re.M)
  lv = {}
  for m in re.finditer(r'\n\t\t"([a-z_]+)_mag_l([123])"\n\t\t\{(.*?)\n\t\t\}', s, re.S):
    kind, l, body = m.group(1), int(m.group(2)), m.group(3)
    c = re.search(r'"ammo_clip_size" "([^"]+)"', body); r = re.search(r'"reload_time" "([^"]+)"', body)
    if c: lv[l] = (kind, int(round(val(base, c.group(1)))), round(val(1, r.group(1)), 3) if r and r.group(1).startswith('*') else 1)
  if len(lv) == 3 and base:
    out[g] = dict(base=base, kind=lv[1][0], l=[lv[i][1] for i in (1, 2, 3)], reloadK=[lv[i][2] for i in (1, 2, 3)])
  print(g.ljust(12), base, out.get(g, '-'))
json.dump(out, open(ROOT / 'tools/out/apex/guns/mags.json', 'w'), indent=1)

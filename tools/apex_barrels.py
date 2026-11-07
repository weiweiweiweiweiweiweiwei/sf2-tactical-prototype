"""v67e Apex barrel stabilizers (user 11-07): which guns take one, the part it shows (the bodygroup barrel_stabilizer_l1 sets, by its
bodygroupN_name) and its recoil scales per level, from Apex's weapon settings (tools/out/apex/wepn/weapon/*.txt, see tools/apex_mags.py)
-> tools/out/apex/guns/barrels.json { gun: { part, k: [[pitch_base, pitch_random, yaw_base, yaw_random] x3], acc: [...] } }."""
import re, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); from apex_mags import INTERNAL, W, ROOT  # noqa: E402 (prints the mags table too)
out = {}
for g, n in INTERNAL.items():
  s = (W / f'mp_weapon_{n}.txt').read_text(errors='replace')
  lv = {}
  for m in re.finditer(r'\n\t\t"barrel_stabilizer_l([123])"\n\t\t\{(.*?)\n\t\t\}', s, re.S):
    kv = dict(re.findall(r'"([a-z_0-9]+)" "([^"]+)"', m.group(2)))
    f = lambda k: float(kv.get(k, '*1').lstrip('*'))
    bg = next((k for k in kv if re.fullmatch(r'bodygroup\d+_set', k) and kv[k] == '1'), None)
    lv[int(m.group(1))] = (bg, [f('viewkick_pitch_base'), f('viewkick_pitch_random'), f('viewkick_yaw_base'), f('viewkick_yaw_random')])
  if len(lv) == 3:  # (the Alternator's shows no part: muzzle flash only)
    nm = lv[1][0] and re.search(r'"' + lv[1][0].replace('_set', '_name') + r'" "([^"]+)"', s)
    out[g] = dict(part=nm.group(1) if nm else None, k=[lv[i][1] for i in (1, 2, 3)])
print('BARRELS', json.dumps(out))
json.dump(out, open(ROOT / 'tools/out/apex/guns/barrels.json', 'w'), indent=1)

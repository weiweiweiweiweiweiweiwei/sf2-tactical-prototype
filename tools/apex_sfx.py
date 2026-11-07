"""v66x the Apex guns' own sounds (user 11-05) from the user's install -> assets/sfx_apex.js (window.SF2_SFX_APEX, merged into the
sound pack like SF2's: banks sf2_apex_<gun>_fire / _magout / _magin / _charge / _draw, played by the gun's def.sf2 = 'apex_<gun>').
Sources: the Miles banks (audio/ship/general.mbnk + *.mstr), listed in tools/out/apex/r301/audio_list.csv. Per gun:
  fire   = its 1p one-shot (`weapon_<name>_secondshot_1p` for automatics — a mid-spray shot, else firstshot / singleshot / fire_1p),
  magout / magin / charge = its 1p reload takes (`wpn_<name>_reload_…`, the tactical reload before the empty one), draw = equip / raise.
RSX exports them (`--exporttypes asrc`) as WAV (float, some 5.1) -> stereo (5.1 folded: L + .707 C + .707 Ls), trimmed (fire ≤ 1.2 s,
others ≤ 1.0 s, 40 ms fade), Ogg Vorbis q0.35 (soundfile).
  python tools/apex_sfx.py            (all)   python tools/apex_sfx.py --skip-export   (re-encode what is on disk)
"""
import csv, re, sys, json, base64, subprocess, io
from pathlib import Path
import numpy as np, soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
APEX = 'C:/Program Files (x86)/Steam/steamapps/common/Apex Legends/audio/ship'
RSX = ROOT / 'tools/out/apex/rsx-2.4.0/rsx_nogui.exe'; OUT = ROOT / 'tools/out/apex/guns/audio'
# gun -> (fire regex(es) in priority order, reload name stem, draw regex)
# gun -> (fire: named sources in priority order — most guns' core takes are unnamed (hashed) in the bank, so the named one-shot /
# first-shot takes; None = none named: the gun keeps its borrowed SF2 voice), reload name stem, draw source stem, fire length (s)
G = {
  'havoc': (None, 'wpn_havocar_1p_reload', 'wpn_havocar_1p_firstdraw_foley_raise_fr01', 1.2),
  'hemlok': (['wpn_hemlok_1p_wpnfire_env_1shotburst_2ch'], 'wpn_hemlok_reload', None, 0.6),
  'nemesis': (['wpn_nemesis_firstshot_2ch'], 'wpn_nemesis_reload', 'wpn_nemesis_drawfirst_2ch', 0.5),
  'r301': (['wpn_r101_1p_wpnfire_firstshot_core_6ch', 'wpn_r101_1p_wpnfire_single_core2_2ch'], 'wpn_r101_reload', 'wpn_r101_firstdraw_fr19_2ch', 0.6),
  'flatline': (['wpn_vinson_1p_wpnfire_single_core_6ch'], 'wpn_vinson_reload', None, 0.6),
  'alternator': (['wpn_alternator_1p_wpnfire_firstshot_mech_2ch'], 'wep_alternator_reload', None, 0.5),
  'car': (None, 'wpn_car_reload', 'wpn_car_firstdraw_fr1_2ch', 0.5),
  'prowler': (['wpn_prowlerpdw_1p_wpnfire_firstshot_close_2ch'], 'wpn_prowlerpdw_1p_reload', None, 0.5),
  'r99': (['wpn_r97_1p_wpnfire_firstshot_core_6ch'], 'wpn_r97_reload', None, 0.5),
  'volt': (['wpn_volt_1p_fire_loop_close_2ch'], 'wpn_volt_br_reload', 'wpn_volt_reload_mech_br_firstdraw_foley_fr01_2ch', 0.11),
  'devotion': (None, 'wpn_devotion_reload', 'wpn_devotion_firstdraw_energy_fr11_2ch', 0.5),
  'lstar': (['wpn_lstar_1p_wpnfire_oneshot_corelrplusswtnr_2ch', 'wpn_lstar_1p_wpnfire_firstshot_2ch'], 'wpn_lstar_lensburnoutreload', 'wpn_lstar_raise_2ch', 0.6),
  'spitfire': (['wpn_lmg_1p_wpnfire_firstshot_core_6ch'], 'wpn_lmg_reload', 'wpn_lmg_firstdraw_2ch', 0.6),
  'rampage': (['wpn_rampage_first_shot_2ch'], 'wpn_rampage_reload', None, 0.8),
  'repeater': (None, 'weapon_3030_reload', 'weapon_3030_reload_lever_in_firstdraw_ass_2ch', 1.0),
  'bocek': (['wpn_bow_1p_fire_kasnap_2ch'], 'apex_weapon_bow_draw', 'apex_weapon_bow_draw_complete_v4_2ch', 0.8),
  'g7': (['wpn_g2a4_1p_wpnfire_shot_6ch'], 'wpn_g2a4_reload', None, 1.0),
  'tripletake': (['wpn_doubletake_1p_wpnfire_harshmetal_2ch'], 'wpn_doubletake_reload', 'wpn_doubletake_firstpullout_reload_accuatebolt_fr18_2ch', 1.0),
  'chargerifle': (['wpn_chargerifle_1p_fire_beam_2ch'], 'wpn_chargerifle_reload', 'wpn_chargerifle_fristdraw_2ch', 1.2),
  'kraber': (['wpn_krabersniper_1p_wpnfire_midshot_2ch'], 'wpn_krabersniper_1p_reload', None, 1.4),
  'longbow': (['wpn_dmr_1p_wpnfire_crack_2ch'], 'wpn_dmr_reload', None, 1.0),
  'sentinel': (['weapons_deadeye_sentinel_shot_v1_2ch'], 'wpn_sentinel_foley_reload', 'wpn_sentinel_foley_draw_2ch', 1.2),
  'eva8': (['wpn_shotgun_1p_wpnfire_reduced_6ch'], 'wpn_shotgun_reload', None, 0.8),
  'mastiff': (['wpn_mastiff_1p_wpnfire_fire_2ch'], 'wpn_mastiff_reload', 'mastiff_drawfirst_v1_2ch', 1.0),
  'mozambique': (None, 'wpn_shotgunpistol_reload', None, 0.6),
  'peacekeeper': (['wpn_peacekeeper_1p_wpnfire_powerchord_2ch'], 'wpn_peacekeeper_reload_1p', None, 1.0),
  'p2020': (['wpn_2011pistol_1p_wpnfire_shot_6ch'], 'wpn_p2011_reload', 'wpn_pistol_draw_lr', 0.6),
  're45': (['wpn_re45fusion_wpnfire_firstshot_1p_2ch'], 'wpn_re45_reload', None, 0.5),
  'wingman': (['wpn_wingman_1p_wpnfire_shot_6ch'], 'wpn_wingman_reload', None, 0.9),
}
# v67i the attachment workshop's sounds (user 11-07: Apex's own pick-up / attach / select sounds): bank sf2_apex_ui_<k> <- named sources
UI = {'attach': ['player_pickup_loot_attachment_2ch_v1_0%d' % i for i in range(1, 8)], 'select': ['UI_Menu_LoadOut_Attachment_Select_2ch_v1_01'],
      'optic': ['Arenas_UI_Store_Optic_Select_v1_2ch_01'], 'opticopen': ['Arenas_UI_Store_Optic_Select_Open_v1_2ch_01']}
ROLE = {  # reload takes by what they are (the first match in the gun's list wins)
  'magout': r'magpull|magout|removemag|pullmag|clipout|mageject|ejectmag|pulldrum|drumremove|canistereject|eject|pt1|start|lever_out|batteryeject|magout',
  'magin': r'maginsert|magin|insertmag|clipin|insertdrum|druminsert|canisterinsert|loadshell|insert|pt3|magslot|lever_in|batteryplace',
  'charge': r'boltback|boltforward|boltfront|chargeback|chargeforward|chargehandle|rechamber|pumpin|barrelclose|slapclosed|lockenergy|leverclose|lever|end_fr|pt5|close',
}
names = [r[3].strip() for r in csv.reader(open(ROOT / 'tools/out/apex/r301/audio_list.csv', encoding='utf-8', errors='replace')) if r and r[0] == 'asrc']
low = {n.lower(): n for n in names}
def variants(stem, k=3):
  s = stem.lower(); hit = [low[n] for n in sorted(low) if n == s or re.fullmatch(re.escape(s) + r'(_\d+ch)?(_v\d+)?(_\d+)?[a-z]?', n)]
  return hit[:k]
pick, filt = {}, []
for g, (fires, rel, draw, _) in G.items():
  P = {}
  for f in fires or []:
    v = variants(f)
    if v: P['fire'] = v; break
  rels = sorted([n for n in names if n.lower().startswith(rel.lower()) and 'empty' not in n.lower() and '3p' not in n.lower()], key=str.lower)
  for role, rx in ROLE.items():
    m = [n for n in rels if re.search(rx, n, re.I) and not any(n in P.get(r, []) for r in P)]
    if m: P[role] = m[:1]
  d = variants(draw, 1) if draw else []
  if d: P['draw'] = d
  pick[g] = P; filt += [n for v in P.values() for n in v]
  print(g.ljust(12), {k: v[0] + (f' +{len(v) - 1}' if len(v) > 1 else '') for k, v in P.items()})
for k, ns in UI.items():
  hit = [low[n.lower()] for n in ns if n.lower() in low]; pick['ui_' + k] = {'ui': hit}; filt += hit
  print(('ui_' + k).ljust(12), hit[:2], len(hit))
json.dump(pick, open(ROOT / 'tools/out/apex/guns/sfx_pick.json', 'w'), indent=1)
if '--list' in sys.argv: sys.exit(0)

OUT.mkdir(parents=True, exist_ok=True)
if '--skip-export' not in sys.argv:
  files = [f'{APEX}/general.mbnk']
  r = subprocess.run([str(RSX), '-nogui', '-export', '--exportdir', str(OUT), '--exporttypes', 'asrc', '--exportfilter', ','.join(sorted(set(filt))), *files],
                     cwd=RSX.parent, capture_output=True, text=True, errors='replace')
  print('RSX', r.returncode, r.stdout[-300:])
wavs = {p.stem.lower(): p for p in OUT.rglob('*.wav')}
def enc(name, maxs):
  p = wavs.get(name.lower())
  if not p: return None
  a, rate = sf.read(str(p), dtype='float32', always_2d=True)
  if a.shape[1] == 1: a = np.repeat(a, 2, 1)
  elif a.shape[1] > 2:  # FL FR FC LFE BL BR
    c = a[:, 2] * 0.707; L = a[:, 0] + c + (a[:, 4] * 0.707 if a.shape[1] > 4 else 0); R = a[:, 1] + c + (a[:, 5] * 0.707 if a.shape[1] > 5 else 0); a = np.stack([L, R], 1)
  n = min(len(a), int(maxs * rate)); a = a[:n].copy(); fade = min(n, int(0.04 * rate)); a[n - fade:] *= np.linspace(1, 0, fade)[:, None]
  pk = np.abs(a).max() or 1; a = a / pk * 0.95 if pk > 0.95 else a
  b = io.BytesIO(); sf.write(b, a, rate, format='OGG', subtype='VORBIS', compression_level=0.65); return base64.b64encode(b.getvalue()).decode()
pack, miss = {}, []
for g, P in pick.items():
  for role, ns in P.items():
    out = [x for x in (enc(n, 1.6 if role == 'ui' else G[g][3] if role == 'fire' else 1.0) for n in ns) if x]
    if out: pack[f'sf2_apex_{g}' if role == 'ui' else f'sf2_apex_{g}_{role}'] = out
    else: miss.append(f'{g}:{role}')
js = '/* Apex Legends original gun sounds from the user\'s own install — tools/apex_sfx.py */\nwindow.SF2_SFX_APEX = ' + json.dumps(pack) + ';\n'
(ROOT / 'assets/sfx_apex.js').write_text(js, encoding='utf-8')
print('PACK', len(pack), 'banks', round(len(js) / 1048576, 2), 'MB', 'missing', miss)

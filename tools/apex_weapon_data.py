"""Apex weapon data → docs/research/apex/weapons-full.json (+ the TTK table in README.md).
Two layers per gun, every value tagged with where it came from:
  's14'    the game's own weapon scripts, Season 14 (2022-08, docs/research/apex/gamefiles-s14/, from
           github.com/metafysika/ApexWeaponData; viewkick patterns from its 13.1 folder — 14.0 has none):
           every field (spread, recoil pattern, ballistics, timing, attachment mods) but old balance
  's30.1'  docs/research/apex/weapons-2026-10-27.json (apex.source.gs, S30.1 build 11630615): damage, RPM,
           magazines, reloads, muzzle velocity, ADS time, burst / rechamber / charge — current balance
  'official' an EA patch-note override listed in that file (wins over s30.1)
'current' = official > s30.1 > s14. Units: metres, seconds, degrees (Source hammer unit = 1 inch = 0.0254 m).
  python tools/apex_weapon_data.py
"""
import json, math, os, re

SRC = 'docs/research/apex/gamefiles-s14'
S30 = 'docs/research/apex/weapons-2026-10-27.json'
OUT = 'docs/research/apex/weapons-full.json'
HU = 0.0254
SHIELDS = [0, 50, 75, 100, 125]  # none / white / blue / purple / red (Evo); gold = purple's 100 (the project's APEX.shields)

FILES = {  # S30.1 name → game script (Nemesis came in S16: no S14 file)
    'HAVOC Rifle': 'energy_ar', 'Hemlok Burst AR': 'hemlok', 'Nemesis Burst AR': None, 'R-301 Carbine': 'rspn101',
    'VK-47 Flatline': 'vinson', 'Alternator SMG': 'alternator_smg', 'C.A.R. SMG': 'car', 'Prowler Burst PDW': 'pdw',
    'R-99 SMG': 'r97', 'Volt SMG': 'volt_smg', 'Devotion LMG': 'esaw', 'L-STAR EMG': 'lstar', 'M600 Spitfire': 'lmg',
    'Rampage LMG': 'dragon_lmg', '30-30 Repeater': '3030', 'Bocek Compound Bow': 'bow', 'G7 Scout': 'g2',
    'Triple Take': 'doubletake', 'Charge Rifle': 'defender', 'Kraber .50-Cal Sniper': 'sniper', 'Longbow DMR': 'dmr',
    'Sentinel': 'sentinel', 'EVA-8 Auto': 'shotgun', 'Mastiff Shotgun': 'mastiff', 'Mozambique Shotgun': 'shotgun_pistol',
    'Peacekeeper': 'energy_shotgun', 'P2020': 'semipistol', 'RE-45 Auto': 'autopistol', 'Wingman': 'wingman',
}

# --- Valve KeyValues (the Respawn weapon .txt format): "key" "value", blocks in braces, // comments, #base includes
TOK = re.compile(r'//[^\n]*|"([^"]*)"|([{}])|([^\s{}"]+)')


def kv_parse(text):
    toks = [(m.group(1), m.group(2), m.group(3)) for m in TOK.finditer(text) if not m.group(0).startswith('//')]
    i = 0

    def block():
        nonlocal i
        d = {}
        while i < len(toks):
            q, br, w = toks[i]
            if br == '}': i += 1; return d
            key = q if q is not None else w; i += 1
            if i < len(toks) and toks[i][1] == '{': i += 1; d[key] = block(); continue
            q, br, w = toks[i]; i += 1
            d[key] = q if q is not None else w
            if i < len(toks) and toks[i][2] and toks[i][2].startswith('['): i += 1  # platform conditional, e.g. [$GAMECONSOLE]
        return d
    return block()


def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict): merge(a[k], v)
        else: a[k] = v
    return a


def load(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    out = {}
    for b in re.findall(r'#base\s+"([^"]+)"', txt):
        bp = os.path.join(os.path.dirname(path), b)
        if os.path.exists(bp): merge(out, load(bp))
    return merge(out, kv_parse(re.sub(r'#base\s+"[^"]+"', '', txt)).get('WeaponData', {}))


def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def r(v, n=4): return None if v is None else round(v, n)


def patterns(path):  # viewkick / blast patterns: "name" { "bullet_N" "x y ..." }
    d = kv_parse(open(path, encoding='utf-8', errors='replace').read())
    d = next(iter(d.values())) if len(d) == 1 and isinstance(next(iter(d.values())), dict) and all(isinstance(v, dict) for v in next(iter(d.values())).values()) else d
    out = {}
    for name, p in d.items():
        if not isinstance(p, dict): continue
        rows = sorted(((int(k[7:]), [float(x) for x in v.split()]) for k, v in p.items() if k.startswith('bullet_')), key=lambda t: t[0])
        out[name] = {'loop_offset': num(p.get('loop_offset')), 'start_max': num(p.get('start_max')), 'bullets': [v for _, v in rows]}
    return out


GAMEPLAY = re.compile(r'^(damage_|critical|headshot|allow_headshots|projectile_(launch_speed|gravity|drag|lifetime|speed_reduction)|fire_rate|burst_|'
                      r'rechamber|charge_(time|levels|level_base|curve|cooldown|attack_min|overheat)|sustained_(discharge_duration|discharge_pulse|laser_damage)|'
                      r'ammo_(clip_size|per_shot|stockpile_max|pool_type)|projectiles_per_shot|blast_pattern|reload|deploy|holster_time|raise_time|lower_time|'
                      r'zoom_(time|fov)|spread_|viewkick_|viewdrift_|ads_move_speed|fire_mode|is_semi_auto|cooldown_(time|type)|explosion)')
KEEP_MOD = re.compile(r'^(damage_|fire_rate|burst_|rechamber|charge_|ammo_|projectile|reload|deploy|holster|raise|lower|zoom_time|spread_|viewkick_|viewdrift_|'
                      r'ads_move|headshot|critical|blast_pattern|projectiles_per_shot|bolt_hitsize)')


def s14_block(name, vk, blast):
    d = load(f'{SRC}/mp_weapon_{name}.txt')
    mods = d.pop('Mods', {})
    raw = {k: v for k, v in d.items() if not isinstance(v, dict) and GAMEPLAY.match(k) and 'titanarmor' not in k and 'npc' not in k and 'sound' not in k and 'effect' not in k}
    f = lambda k: num(d.get(k))
    rate = f('fire_rate')
    out = {
        'script': f'mp_weapon_{name}',
        'damage': {
            'near': f('damage_near_value'), 'far': f('damage_far_value'), 'very_far': f('damage_very_far_value'),
            'near_m': r(f('damage_near_distance') and f('damage_near_distance') * HU, 1), 'far_m': r(f('damage_far_distance') and f('damage_far_distance') * HU, 1),
            'very_far_m': r(f('damage_very_far_distance') and f('damage_very_far_distance') * HU, 1),
            'head_scale': f('damage_headshot_scale'), 'leg_scale': f('damage_leg_scale'), 'shield_scale': f('damage_shield_scale'),
            'headshot_max_m': r(f('headshot_distance') and f('headshot_distance') * HU, 1), 'allow_headshots': d.get('allow_headshots') == '1',
            'pellets': f('projectiles_per_shot') or 1, 'ammo_per_shot': f('ammo_per_shot') or 1,
        },
        'fire': {'mode': d.get('fire_mode'), 'semi_auto': d.get('is_semi_auto') == '1', 'rate_hz': rate, 'rpm': r(rate and rate * 60, 1),
                 'rate_max_hz': f('fire_rate_max'), 'rate_speedup_s': f('fire_rate_max_time_speedup'),
                 'burst_count': f('burst_fire_count'), 'burst_delay_s': f('burst_fire_delay'), 'rechamber_s': f('rechamber_time'),
                 'charge_s': f('charge_time') if (f('charge_time') or 0) < 1e6 else None, 'charge_levels': f('charge_levels'),
                 'sustained_s': f('sustained_discharge_duration'), 'sustained_pulse_s': f('sustained_discharge_pulse_frequency'),
                 'sustained_damage_scale': f('sustained_laser_damage_scale')},
        'ballistics': {'speed_mps': r(f('projectile_launch_speed') and f('projectile_launch_speed') * HU, 1), 'gravity_scale': f('projectile_gravity_scale'),
                       'drag': f('projectile_drag_coefficient'), 'lifetime_s': f('projectile_lifetime'), 'speed_reduction': f('projectile_speed_reduction_factor')},
        'magazine': {'base': f('ammo_clip_size'), **{f'l{i}': num(mods.get(f'{m}_mag_l{i}', {}).get('ammo_clip_size'))
                                                    for i in range(1, 5) for m in ('bullets', 'highcal', 'energy', 'sniper') if f'{m}_mag_l{i}' in mods},
                     'pool': d.get('ammo_pool_type'), 'stockpile_max': f('ammo_stockpile_max')},
        'timing': {k: f(k) for k in ('reload_time', 'reload_time_late1', 'reload_time_late2', 'reloadempty_time', 'reloadempty_time_late1', 'reloadempty_time_late2',
                                     'deploy_time', 'deployfirst_time', 'holster_time', 'raise_time', 'lower_time', 'zoom_time_in', 'zoom_time_out') if f(k) is not None},
        'move': {'ads_move_speed_scale': f('ads_move_speed_scale'), 'zoom_fov': f('zoom_fov')},
        'spread': {k: f(k) for k in sorted(d) if k.startswith('spread_') and f(k) is not None},
        'recoil': {k: f(k) for k in sorted(d) if (k.startswith('viewkick_') or k.startswith('viewdrift_')) and f(k) is not None},
        'mods': {m: {k: v for k, v in body.items() if KEEP_MOD.match(k) and 'sound' not in k and 'effect' not in k}
                 for m, body in mods.items() if isinstance(body, dict)},
        'raw': raw,
    }
    out['mods'] = {k: v for k, v in out['mods'].items() if v}
    pat = d.get('viewkick_pattern')
    out['recoil']['pattern_name'] = pat
    out['recoil']['pattern'] = vk.get(pat)  # bullet_N: pitch-ish / yaw-ish kick per shot (x y and two extra columns, as in the file)
    bp = d.get('blast_pattern')
    if bp: out['damage']['blast_pattern'] = {'name': bp, 'scale': f('blast_pattern_default_scale'), 'points': blast.get(bp, {}).get('bullets')}
    return out


def s30_block(w):
    rows = w['damage_rows_source_values']
    def cols(s): return [c.strip() for c in s.split('|')]
    first = cols(rows[0])
    body, head, leg = (num(x.replace(',', '')) for x in first[1:4])
    pel = w.get('projectiles_per_shot') or 1
    sec = lambda s: num(str(s).replace('s', '').strip()) if s else None
    o = {'body': body, 'head': head, 'leg': leg, 'pellets': pel,
         'range_rows': [{'range': c[0], 'body': num(c[1]), 'head': num(c[2]), 'leg': num(c[3])} for c in map(cols, rows)],
         'rpm': num(str(w['configuration_rpm']).replace(',', '')), 'burst_count': w.get('rounds_per_burst'), 'burst_delay_s': sec(w.get('burst_delay')),
         'rechamber_s': sec(w.get('rechamber_time')), 'charge_s': sec(w.get('charge_time')),
         'magazine': {k: num(v) for k, v in w['magazine'].items()}, 'reload_tactical_s': sec(w['reload']['tactical']), 'reload_empty_s': sec(w['reload']['empty']),
         'speed_mps': num(str(w.get('muzzle_velocity') or '').replace('m/s', '')), 'ads_s': sec(w.get('ads_time')),
         'ammo_and_modes': w.get('source_ammo_and_modes'), 'attachments': [a['name'] for a in w.get('attachments', [])], 'source': w['source']}
    return o


def current(s14, s30, off):
    c, src = {}, {}
    def put(k, v, s):
        if v is not None and k not in c: c[k] = v; src[k] = s
    if off: put('body', off.get('body_damage'), 'official'); put('mag_l3', off.get('epic_magazine'), 'official')
    for k, sk in (('body', 'body'), ('head', 'head'), ('leg', 'leg'), ('pellets', 'pellets'), ('rpm', 'rpm'), ('burst_count', 'burst_count'),
                  ('burst_delay_s', 'burst_delay_s'), ('rechamber_s', 'rechamber_s'), ('charge_s', 'charge_s'), ('reload_tactical_s', 'reload_tactical_s'),
                  ('reload_empty_s', 'reload_empty_s'), ('speed_mps', 'speed_mps'), ('ads_s', 'ads_s')):
        put(k, s30.get(sk), 's30.1')
    m = s30['magazine']
    for i, t in enumerate(('base', 'common', 'rare', 'epic', 'legendary')): put('mag' if i == 0 else f'mag_l{i}', m.get(t), 's30.1')
    b = s30.get('body')  # head / leg scales from S30's own body (an official body override keeps S30's scales); S14's scales are older
    if b and s30.get('head'): put('head_scale', r(s30['head'] / b, 3), 'derived')
    if b and s30.get('leg'): put('leg_scale', r(s30['leg'] / b, 3), 'derived')
    if src.get('body') == 'official':
        for k in ('head', 'leg'):
            if c.get(f'{k}_scale'): c[k] = r(c['body'] * c[f'{k}_scale'], 2); src[k] = 'derived'
    if s14:
        dm, fi, ti = s14['damage'], s14['fire'], s14['timing']
        put('body', dm['near'], 's14'); put('pellets', dm['pellets'], 's14'); put('rpm', fi['rpm'], 's14')
        put('head_scale', dm['head_scale'], 's14'); put('leg_scale', dm['leg_scale'], 's14'); put('headshot_max_m', dm['headshot_max_m'], 's14')
        put('burst_count', fi['burst_count'], 's14'); put('burst_delay_s', fi['burst_delay_s'], 's14'); put('rechamber_s', fi['rechamber_s'], 's14')
        put('charge_s', fi['charge_s'], 's14'); put('rate_max_hz', fi['rate_max_hz'], 's14'); put('rate_speedup_s', fi['rate_speedup_s'], 's14')
        put('reload_tactical_s', ti.get('reload_time'), 's14'); put('reload_empty_s', ti.get('reloadempty_time'), 's14')
        put('speed_mps', s14['ballistics']['speed_mps'], 's14'); put('gravity_scale', s14['ballistics']['gravity_scale'], 's14')
        put('drag', s14['ballistics']['drag'], 's14'); put('ads_s', ti.get('zoom_time_in'), 's14')
        for k in ('deploy_time', 'deployfirst_time', 'holster_time', 'raise_time', 'lower_time'): put(k.replace('_time', '_s'), ti.get(k), 's14')
        put('ads_move_speed_scale', s14['move']['ads_move_speed_scale'], 's14')
        for k in ('spread_stand_hip', 'spread_stand_hip_run', 'spread_stand_hip_sprint', 'spread_crouch_hip', 'spread_air_hip', 'spread_stand_ads', 'spread_air_ads'):
            put(k, s14['spread'].get(k), 's14')
        for i in range(1, 5): put(f'mag_l{i}', s14['magazine'].get(f'l{i}'), 's14')
        put('mag', s14['magazine']['base'], 's14')
    if c.get('head') is None and c.get('body') and c.get('head_scale'): c['head'] = r(c['body'] * c['head_scale'], 2); src['head'] = 'derived'
    if c.get('head_scale') is None and c.get('head') and c.get('body'): c['head_scale'] = r(c['head'] / c['body'], 3); src['head_scale'] = 'derived'
    return c, src


def shot_times(c, n):
    """Seconds from the first shot to the n-th, on 'current' values (no charge-up, no reload)."""
    rpm = c.get('rpm') or 60
    dt = 60 / rpm
    if c.get('rechamber_s'): dt += c['rechamber_s']  # bolt / pump: the rechamber runs after the shot's own cycle (assumption, see README / DECISIONS)
    t, times = 0.0, []
    bc, bd = c.get('burst_count'), c.get('burst_delay_s')
    rmax, up = c.get('rate_max_hz'), c.get('rate_speedup_s')
    for i in range(n):
        times.append(t)
        if bc and bd and (i + 1) % int(bc) == 0: t += bd
        elif rmax and up:  # Devotion: fire rate ramps linearly from rpm/60 to rate_max over 'up' seconds
            r0 = rpm / 60; rate = r0 + (rmax - r0) * min(1, t / up); t += 1 / rate
        else: t += dt
    return times[-1] if times else 0


def ttk(c):
    per = (c.get('body') or 0) * (c.get('pellets') or 1)
    if not per: return None
    out = {}
    for s in SHIELDS:
        n = math.ceil((100 + s) / per)  # damage carries from the shield into health (Apex since S? — the project's APEX model)
        out[str(s)] = {'shots': n, 'ttk_s': r(shot_times(c, n), 3)}
    return out


def main():
    s30 = json.load(open(S30, encoding='utf-8'))
    vk = patterns(f'{SRC}/viewkick_patterns_s13.1.txt'); blast = patterns(f'{SRC}/blast_patterns.txt')
    guns, gaps = [], []
    for w in s30['weapons']:
        name = w['name']; f = FILES[name]
        s14 = s14_block(f, vk, blast) if f else None
        b30 = s30_block(w)
        cur, src = current(s14, b30, w.get('official_override'))
        miss = [k for k in ('head_scale', 'leg_scale', 'headshot_max_m', 'speed_mps', 'gravity_scale', 'deploy_s', 'holster_s', 'raise_s', 'ads_s',
                            'spread_stand_hip', 'ads_move_speed_scale') if cur.get(k) is None]
        if s14 and not (s14['recoil'].get('pattern') or {}).get('bullets'): miss.append('recoil_pattern')
        if not s14: miss.append('recoil_pattern')
        if miss: gaps.append({'weapon': name, 'missing': miss})
        guns.append({'name': name, 'category': w['category'], 'current': cur, 'current_src': src, 'ttk': ttk(cur),
                     'official_override': w.get('official_override'), 's30_1': b30, 's14': s14})
    out = {
        'generated_by': 'tools/apex_weapon_data.py',
        'sources': {'s14': 'game weapon scripts, Season 14 (github.com/metafysika/ApexWeaponData @ ' + open(f'{SRC}/SOURCE_COMMIT').read().strip()[:12] + '), copied to ' + SRC,
                    's30.1': S30 + ' (apex.source.gs, S30.1 build 11630615)', 'official': 'EA patch notes, per gun in official_override'},
        'units': 'metres, seconds, degrees; spread = cone half-angle degrees as in the scripts; recoil pattern = the scripts\' per-shot kick rows',
        'shield_levels': SHIELDS, 'gaps': gaps, 'weapons': guns,
    }
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{OUT}: {len(guns)} guns, {len(gaps)} with gaps')
    readme = 'docs/research/apex/README.md'  # the TTK table between the markers is regenerated
    rows = ['| 武器 | 每發躯幹 | RPM | ' + ' | '.join(f'{s} 盾' for s in SHIELDS) + ' |', '|---|---:|---:|' + '---:|' * len(SHIELDS)]
    for g in guns:
        c, t = g['current'], g['ttk'] or {}
        per = f"{c['body']:g}×{c['pellets']:g}" if (c.get('pellets') or 1) > 1 else f"{c['body']:g}"
        rows.append(f"| {g['name']} | {per} | {c.get('rpm'):g} | " + ' | '.join(f"{v['shots']} 發 {v['ttk_s']:.2f} s" for v in t.values()) + ' |')
    txt = open(readme, encoding='utf-8').read()
    a, b = '<!-- ttk:begin -->', '<!-- ttk:end -->'
    txt = txt[:txt.index(a) + len(a)] + '\n' + '\n'.join(rows) + '\n' + txt[txt.index(b):]
    open(readme, 'w', encoding='utf-8').write(txt)
    for g in guns:
        t = g['ttk'] or {}
        print(f"{g['name']:24s} body {g['current'].get('body')}x{g['current'].get('pellets')} rpm {g['current'].get('rpm')} "
              + ' '.join(f"{s}:{v['shots']}/{v['ttk_s']}" for s, v in t.items()))


if __name__ == '__main__':
    main()

"""v64r SF2's weapon weights (user 10-28: weight sets the walking speed, as in SF2) -> the SF2_WEIGHT block in src/01_core.js.
  PYTHONPATH=tools python tools/sf2_weight_table.py
SFGameContent class defaults WeaponEquipWeight / WeaponUnequipWeight (no unequip weight: 0 — pistols, knives, grenades). SF2
(SFInventoryManager.CalculateInventoryWeight): the load is the weapon in hand's equip weight + the other slot's unequip weight
(in hand a primary: + the secondary's; anything else: + the primary's); SFPawn.SetGroundSpeedByWeight turns it into the speed —
src/12_player.js sf2Speed. Guns SF2 has no class for take the nearest one (marked ~)."""
import re, sf2_props as S

MAP = {  # our id: SF2 class (~ = no class of its own in SF2, the nearest kind)
    'm4a1': 'M4A1', 'g36c': 'G36C', 'g36c_gold': 'G36C', 'g36c_sf2': 'G36C', 'g36c_eo': 'G36C', 'g36c_circuit': 'G36C', 'mp5': '~MP7A1',
    'mp5k': 'MP5K', 'p90': 'P90', 'remington870': 'M870', 'm249': 'MinimiSPW', 'cheytac_m200': 'CheyTac', 'p226': 'P226',
    'deagle': 'DESERTEAGLE', 'ak47': '~AK103', 'ak103': 'AK103', 'scarl': 'SCARL', 'scarl_eo': 'SCARL', 'famas': 'FAMAS', 'aug': 'AUGA3',
    'ump45': 'UMP45', 'vector': 'KrissV', 'mp7': 'MP7A1', 'rpk': 'RPK74', 'negev': '~Ultimax', 'pkm': '~FNMAG', 'mg42': '~MG4',
    'benelli_m4': 'BNLLI', 'm1014': '~BNLLI', 'saiga12': 'SAIGA12', 'ksg': 'KeltecKSG', 'awp': 'AWP', 'barrett': 'Barret',
    'kar98k': 'Kar98k', 'svd': 'DragunovSVD', 'glock18': 'GLOCK17', 'usp': '~P226', 'm1911': 'Colt1911', 'm16a3': 'M16A3', 'k2': 'K2',
    'xm8': 'XM8', 'galil': 'GALIL', 'sg551': 'SIG551', 'hk417': 'HK417', 'scarh': 'SCARH', 'hk417_rs': 'HK417_mod2A', 'qbz97': 'QBZ97',
    'pp2000': 'PP2000', 'vz61': 'Scorpion', 'm40a1': 'M40A1', 'k14': 'K14', 'sr25': 'SR25', 'psg1': 'PSG1', 'mg4': 'MG4', 'k3': 'K3',
    'aa12': 'AA12', 'm92fs': 'M92FS', 'cz75': 'CZ75BD', 'jericho': 'JERICHO941', 'sw60': 'RevolverSW60', 'm14ebr': 'M14EBR',
    'type89': 'Type89', 'l86a1': 'L86A1', 'hk23e': 'HK23E', 'frf2': 'FRF2', 'cz700': 'CZ700', 'trg': 'TRG', 'infinity': 'INFINITY',
    'knife': 'BowieKnife', 'he': 'M67FRAG', 'flash': 'M84FLASHBANG', 'smoke': 'M18SMOKE',
}
p = S.Pkg(S.PKG_DIR + 'SFGameContent.upk'); W = {}
for e in p.exports:
    if e['name'].startswith('Default__SFCWeapon'):
        d = {k: v for k, _, t, v in p.props(e) if k in ('WeaponEquipWeight', 'WeaponUnequipWeight')}
        if d: W[e['name'][18:]] = [round(float(d.get('WeaponEquipWeight', 0)), 3), round(float(d.get('WeaponUnequipWeight', 0)), 3)]
rows = []
for gid, c in MAP.items():
    w = W[c.lstrip('~')]; rows.append(f"{gid}: [{w[0]}, {w[1]}]" + ('' if c[0] != '~' else ''))
approx = ', '.join(f"{g} ≈ {c[1:]}" for g, c in MAP.items() if c[0] == '~')
js = ("/* v64r SF2's weapon weights [equip, unequip] (SFGameContent; tools/sf2_weight_table.py) — the load in hand sets the walking speed\n"
      f"   (src/12_player.js sf2Speed). No SF2 class of their own: {approx}. */\nconst SF2_WEIGHT = {{\n  " +
      ',\n  '.join(', '.join(rows[i:i + 6]) for i in range(0, len(rows), 6)) + ",\n};\n")
f = 'src/01_core.js'; s = open(f, encoding='utf-8', newline='').read(); nl = '\r\n' if '\r\n' in s else '\n'  # (keep the file's line ends)
a, b = '// <sf2-weights>' + nl, '// </sf2-weights>' + nl; js = js.replace('\n', nl)
if a not in s: s = s.replace('// <sf2-weapons>' + nl, a + b + '// <sf2-weapons>' + nl, 1)
i, j = s.index(a) + len(a), s.index(b); open(f, 'w', encoding='utf-8', newline='').write(s[:i] + js + s[j:]); print(f, len(rows), 'weights')

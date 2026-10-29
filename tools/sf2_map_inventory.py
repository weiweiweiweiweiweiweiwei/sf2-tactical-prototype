"""v65m SF2's maps (user 10-29: every map but the special modes) -> docs/research/sf2/map-inventory.md + tools/out/sf2_map_inventory.json
A map = a package with its own Lighting_<map>.tfc in CookedPCConsole. Special (left out): observer / escape / blackout / rocket-jump
copies, event re-skins (Halloween, XMAS, summer, pirate …: the base map is kept), zombie / PVE / shooter / defence / hide-and-seek /
hexa / seizure maps, the tutorial and the training halls.   python tools/sf2_map_inventory.py"""
import os, re, json
D = 'D:/SpecialForce2/SFGame/CookedPCConsole'
SPECIAL = re.compile(r'_(ob|esc|bla|sei|seizure)$|RocketJump|Halloween|XMAS|summer|Pirate|HideSeek|_MH$|_Ranger$|^(DeathHospital|DeathStreet|MonsterHouse|hospital|Biolab|Drone|Shooter_level\d|MDefence|Tutorial|Firingrange|Checkmate|Castle|Glass_Hexa|Hexagamble|Hexaleague|Space_RocketJump|skywalker|SeaCave|13_CASI)$', re.I)
rows = []
for f in sorted(os.listdir(D), key=str.lower):
    if not (f.startswith('Lighting_') and f.endswith('.tfc')): continue
    n = f[len('Lighting_'):-4]; up = os.path.join(D, n + '.upk')
    if not os.path.exists(up): continue
    sp = bool(SPECIAL.search(n)); subs = sorted(g[:-4] for g in os.listdir(D) if g.lower().startswith(n.lower() + '_') and g.endswith('.upk') and not SPECIAL.search(g[:-4]) and not g.lower().endswith('_sound.upk'))
    rows.append({'map': n, 'mb': round(os.path.getsize(up) / 1048576, 1), 'special': sp, 'subs': subs})
json.dump(rows, open('tools/out/sf2_map_inventory.json', 'w'), indent=1)
keep = [r for r in rows if not r['special']]
md = ['# SF2 地圖清單（tools/sf2_map_inventory.py 產生）', '', f'有自己光照檔 `Lighting_<圖>.tfc` 的包＝一張圖。共 {len(rows)} 個，常規對戰圖 {len(keep)} 張（特殊模式：觀戰／逃脫／停電／跳躍／節日造型／殭屍／PVE／射擊／防守／捉迷藏／六角／教學／靶場 不做）。', '',
      '| 地圖 | 包大小 | 子關卡（同名開頭的包） |', '|---|---|---|'] + [f"| {r['map']} | {r['mb']} MB | {'、'.join(r['subs'])} |" for r in keep] + ['', '不做：' + '、'.join(r['map'] for r in rows if r['special'])]
open('docs/research/sf2/map-inventory.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(len(rows), 'maps,', len(keep), 'kept')

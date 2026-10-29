"""v65l SF2's guns and their variants (user 10-29: every SF2 gun, no camos) -> docs/research/sf2/gun-inventory.md + tools/out/sf2_gun_inventory.json
Base guns: SFCWeapon<X> classes (no '_' suffix) whose class chain reaches the AR / SMG / Sniper / MG / Shotgun / Pistol bases.
Variants: SFCItem_<X>_<tokens> (SFGameContent item names, tools/out/sf2_item_names.json) whose every token is an attachment
(EOTech, OpenDot, Reflex, ACOG, AimPoint, Silencer, MK2-5 …). The loop builds: standard, one variant per optic, Silencer, and the
top MK tier ('Max'); laser / extended-mag combos are left out (auto-choice A, docs/loop/SF2_ALL.md).
  python tools/sf2_gun_inventory.py"""
import json, re, collections, os
w = json.load(open('docs/research/sf2/client-data/weapons.json', encoding='utf-8'))
items = {i[len('SFCItem_'):] for i in json.load(open('tools/out/sf2_item_names.json'))}
CAT = {'SFCWeaponARBase': '突擊步槍', 'SFCWeaponSMGBase': '衝鋒槍', 'SFCWeaponSniperBase': '狙擊槍', 'SFCWeaponMGBase': '機槍', 'SFCWeaponShotgunBase': '霰彈槍', 'SFCWeaponPistolBase': '手槍'}
SPECIAL = re.compile(r'Zombie|Snowball|Highroller|Naga|Selant|Drone|Turret|Sentinel|Cannonade|Rocket|PDA|Empty|Falling|^Cat|Dolphin|Elephant|Pug|ShibaInu|Rhino|Sharon|Rose$|Lollipop|^Pot$|Sauce|Frypan|Lightning|Impact|Nanos|Atropen|Baseball|Bow$|Flamer|SlingShot|SlowBomb|TearGas|Shuriken|Kunai|Dagger|Katana|FoldingFan|CrowBar|Minicar|BabyStunner|Semtex|Crossbow|M2$|ST10', re.I)
OPT = {'eotech': 'EOTech', 'opendot': 'OpenDot', 'reflex': 'Reflex', 'acog': 'ACOG', 'aimpoint': 'AimPoint', 'scope': 'Scope'}
ATT = set(OPT) | {'silencer', 'grip', 'laserpointer', 'laserdot', 'magup', 'mk2', 'mk3', 'mk4', 'mk5', 'sopmod', 'sopmod1', 'sopmod2', 'sopmod3', 'gl'}
# ours: weapon ids in the game with an SF2 rig (tools/guns/<id>_sf2_rig.glb) and the SF2 class each stands for (sf2_weapon_table GUNS)
have = {f.split('_sf2_')[0] for f in os.listdir('tools/guns') if '_sf2_' in f}
gt = open('tools/sf2_weapon_table.py', encoding='utf-8').read()
cls2id = {m.group(2).lower(): m.group(1) for m in re.finditer(r"^\s*'(\w+)': \('(\w+)'", gt, re.M)}
rows = []
for k, v in w.items():
    x = k[len('SFCWeapon'):]
    if '_' in x or SPECIAL.search(x) or not isinstance(v.get('chain'), list): continue
    cat = next((CAT[c] for c in v['chain'][1:] if c in CAT), None)
    if not cat or x.endswith('Base'): continue
    vs = set()
    for i in items:
        if i.lower().startswith(x.lower() + '_'):
            toks = i[len(x) + 1:].lower().split('_')
            if all(t in ATT for t in toks): vs.add('_'.join(toks))
    build = ['標準'] + sorted({OPT[t] for v2 in vs for t in v2.split('_') if t in OPT and v2 == t}) + (['Silencer'] if 'silencer' in vs else []) \
        + ([max((t for v2 in vs for t in v2.split('_') if re.fullmatch(r'mk\d', t)), key=lambda t: int(t[2:])).upper()] if any(re.fullmatch(r'mk\d', t) for v2 in vs for t in v2.split('_')) else [])
    gid = cls2id.get(x.lower()) or (x.lower() if x.lower() in have else None)
    rows.append({'class': x, 'cat': cat, 'id': gid, 'have': bool(gid and gid in have) or x.lower() in have, 'build': build, 'all': sorted(vs)})
rows.sort(key=lambda r: (list(CAT.values()).index(r['cat']), r['class'].lower()))
json.dump(rows, open('tools/out/sf2_gun_inventory.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
md = ['# SF2 槍枝清單（tools/sf2_gun_inventory.py 產生）', '', '底槍來自 `SFCWeapon<X>` 類別（繼承到步槍／衝鋒槍／狙擊／機槍／霰彈／手槍的基底），型態來自 `SFCItem_<X>_<配件…>`（塗裝、活動款不算）。「要做」= 標準＋每種瞄具＋消音＋最高 MK（Max）。',
      '', f'共 {len(rows)} 把；遊戲裡已有 SF2 原版的 {sum(r["have"] for r in rows)} 把。', '', '| 類別 | SF2 類別 | 遊戲 id | 已有 | 要做的型態 |', '|---|---|---|---|---|']
md += [f"| {r['cat']} | {r['class']} | {r['id'] or ''} | {'✅' if r['have'] else '⬜'} | {'、'.join(r['build'])} |" for r in rows]
open('docs/research/sf2/gun-inventory.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(len(rows), 'guns,', sum(r['have'] for r in rows), 'have,', sum(len(r['build']) for r in rows), 'builds')

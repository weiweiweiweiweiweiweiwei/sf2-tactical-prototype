"""v65q One new SF2 gun end to end (the loop's G3 recipe, docs/loop/SF2_ALL.md), so each gun is one command:
  python tools/sf2_add_gun.py <id> <SF2 class> <pkg> [--sound Sound_X] [--name 'Display'] [--cat assault|smg|sniper|mg|shotgun|pistol]
1. tools/sf2_export.sh (+ <pkg>_texture, + <pkg>_sight when they exist)   2. finds the mesh stem, texture prefix, animset and the
iron sight (<…>_sight_up on the Sight socket)   3. adds the gun to tools/sf2_rig_build.mjs and builds it   4. the stat / weight tables,
a WEAPON_DATABASE entry from the category's template (damage per CLAUDE.md §4.2), the bot pool, the sounds   5. packs and builds.
It prints what it chose; looking at `GUNID=<id> ONLY=hip,ads node tools/out/_rigshot.mjs` is left to the caller."""
import sys, os, re, glob, subprocess, argparse
a = argparse.ArgumentParser(); a.add_argument('id'); a.add_argument('cls'); a.add_argument('pkg'); a.add_argument('--sound'); a.add_argument('--name'); a.add_argument('--cat')
A = a.parse_args(); gid, cls, pkg = A.id, A.cls, A.pkg
D = 'D:/SpecialForce2/SFGame/CookedPCConsole/'; ex = lambda n: os.path.exists(D + n + '.upk')
SH = __import__('shutil').which('sh') or 'C:/Program Files/Git/usr/bin/sh.exe'
def run(*c):
    for k in range(4):  # (a file just written can stay locked a moment on Windows: retry)
        r = subprocess.run([SH if c[0] == 'sh' else c[0], *c[1:]], capture_output=True, text=True, encoding='utf-8', errors='replace')
        if not r.returncode: return r.stdout
        __import__('time').sleep(3)
    sys.exit(f'FAILED {c[:3]}: {(r.stderr or r.stdout)[-600:]}')
snd = A.sound or next((s for s in (f'Sound_{cls}', f'Sound_{cls.upper()}', f'Sound_{pkg.split("_", 1)[1]}') if ex(s)), None)
tex = [t for t in (f'{pkg}_texture',) if ex(t)]
run('sh', 'tools/sf2_export.sh', gid, pkg, snd or 'Sound_common', *tex)
if ex(pkg + '_sight'): run(os.path.abspath('tools/out/umodel_win32/umodel_64.exe'), '-game=sf2', '-path=' + D[:-1], '-export', '-gltf', '-png', f'-out=tools/out/sf2/{gid}', pkg + '_sight')
root = f'tools/out/sf2/{gid}'
bodies = [p for p in glob.glob(f'{root}/{pkg}/SkeletalMesh3/*_body.gltf') if not re.search(r'_3rd|arthur|haunted|pirate|crescent|gacha|parasite|harpoon|anubis|rat|pixel|murderer|fallen', p, re.I)]
if not bodies: sys.exit(f'no body mesh in {pkg}')
stem = os.path.basename(bodies[0])[:-len('_body.gltf')]
pngs = [os.path.basename(p) for p in glob.glob(f'{root}/**/*_body_d.png', recursive=True)]
texp = next((p[:-len('_body_d.png')] for p in pngs if not re.search(r'3rd|arthur|haunted|pirate|crescent|gacha|parasite|harpoon|anubis|rat|pixel|murderer|fallen|gold|silver|camo', p, re.I)), stem.split('_', 1)[-1])
psas = [os.path.basename(p)[:-4] for p in glob.glob(f'{root}_anim/{pkg}/AnimSet/*.psa') if 'female' not in p.lower()]
anim = psas[0] if psas else None
sights = sorted([p for p in glob.glob(f'{root}/**/*_sight_up.gltf', recursive=True) if not re.search(r'3rd', p)], key=lambda p: (os.path.basename(p).lower() not in (f'{stem}_sight_up.gltf'.lower(), f'{pkg}_sight_up.gltf'.lower()), len(p)))
sight = sights[0].replace('\\', '/').split(f'tools/out/sf2/')[1] if sights else None
sighttex = None
if sight:
    sp = [os.path.basename(p)[:-6] for p in glob.glob(f'{root}/**/Texture2D/*sight*_d.png', recursive=True) if not re.search(r'arthur|haunted|pirate|blackpearl|siege|supreme|3rd', p, re.I)]
    sighttex = sp[0] if sp else None
parts = [n for n in ('body', 'barrel', 'stock', 'magazine') if os.path.exists(f'{root}/{pkg}/SkeletalMesh3/{stem}_{n}.gltf')]
opt = [f"pkg: '{pkg}'"] + ([f"stem: '{stem}'"] if stem != pkg else []) + ([f"tex: '{texp}'"] if texp != gid else []) + ([f"anim: '{anim}'"] if anim and anim != f'1st_anim_{gid}' else []) \
    + ([f"partNames: {parts}"] if parts != ['body', 'barrel', 'stock', 'magazine'] else []) + (['hoodedPost: true', f"socketSights: sight('{sight}', '{sighttex}')"] if sight and sighttex else [])
line = f"  {gid}: gun('{gid}', {{ {', '.join(opt)} }}), // v65q tools/sf2_add_gun.py\n"
b = open('tools/sf2_rig_build.mjs', encoding='utf-8').read()
b = re.sub(r'\n  ' + gid + r': gun\(.*\n', '\n', b); b = b.replace('const GUNS = {\n', 'const GUNS = {\n' + line, 1); open('tools/sf2_rig_build.mjs', 'w', encoding='utf-8').write(b)
print('BUILDER', line.strip())
out = run('node', 'tools/sf2_rig_build.mjs', gid); print([l for l in out.splitlines() if 'SF2RIG' in l or 'NOTEX' in l][:3])
# stats: weapons table (reload sound times: the class-wide guess), weights
w = open('tools/sf2_weapon_table.py', encoding='utf-8').read()
if f"    '{gid}': (" not in w: w = w.replace('GUNS = {  #', f"GUNS = {{  #", 1).replace('GUNS = {', f"GUNS = {{\n    '{gid}': ('{cls}', '{gid}', '{gid}', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun", 1); open('tools/sf2_weapon_table.py', 'w', encoding='utf-8').write(w)
wt = open('tools/sf2_weight_table.py', encoding='utf-8').read()
if f"'{gid}': '{cls}'" not in wt: wt = wt.replace("'trg': 'TRG',", f"'trg': 'TRG', '{gid}': '{cls}',", 1); open('tools/sf2_weight_table.py', 'w', encoding='utf-8').write(wt)
env = dict(os.environ, PYTHONPATH='tools')
subprocess.run(['python', 'tools/sf2_weapon_table.py'], check=True, env=env, capture_output=True); subprocess.run(['python', 'tools/sf2_weight_table.py'], check=True, env=env, capture_output=True)
# the game's definition from the category template (CLAUDE.md §4.2 damage), bot pool
chain = __import__('json').load(open('docs/research/sf2/client-data/weapons.json', encoding='utf-8')).get('SFCWeapon' + cls, {}).get('chain', [])
cat = A.cat or next((c for k, c in (('ARBase', 'assault'), ('SMGBase', 'smg'), ('SniperBase', 'sniper'), ('MGBase', 'mg'), ('ShotgunBase', 'shotgun'), ('PistolBase', 'pistol')) if any(k in x for x in chain)), 'assault')
T = {'assault': "type: 'assault', slot: 'primary', damageNear: 28, damageFar: 21, falloffStart: 25, falloffEnd: 60, fireRate: 0.1, recoilPitch: 0.011, recoilYaw: 0.008, recoilRecovery: 10,\n    hipSpread: 0.072, adsSpread: 0.0019, adsFov: 52, adsType: '3d_sight', mobility: 0.94, maxAmmo: 30, reloadTime: 2.3, modelUrl: null, adsSpeed: 12,\n    sound: 'scar', penetration: 1, tp: { len: 0.88, body: 'dark', mag: 'box' }",
     'smg': "type: 'smg', slot: 'primary', damageNear: 24, damageFar: 16, falloffStart: 15, falloffEnd: 40, fireRate: 0.075, recoilPitch: 0.009, recoilYaw: 0.008, recoilRecovery: 11,\n    hipSpread: 0.06, adsSpread: 0.003, adsFov: 55, adsType: '3d_sight', mobility: 1.0, maxAmmo: 30, reloadTime: 2.1, modelUrl: null, adsSpeed: 14,\n    sound: 'mp5', penetration: 1, tp: { len: 0.6, body: 'dark', mag: 'box' }",
     'mg': "type: 'lmg', slot: 'primary', damageNear: 30, damageFar: 23, falloffStart: 30, falloffEnd: 70, fireRate: 0.085, recoilPitch: 0.012, recoilYaw: 0.01, recoilRecovery: 8,\n    hipSpread: 0.09, adsSpread: 0.004, adsFov: 50, adsType: '3d_sight', mobility: 0.82, maxAmmo: 100, reloadTime: 4.5, modelUrl: null, adsSpeed: 10,\n    sound: 'm249', penetration: 2, tp: { len: 1.0, body: 'dark', mag: 'box' }",
     'shotgun': "type: 'shotgun', slot: 'primary', damageNear: 16, damageFar: 6, falloffStart: 8, falloffEnd: 25, fireRate: 0.85, recoilPitch: 0.05, recoilYaw: 0.01, recoilRecovery: 7, pellets: 9,\n    hipSpread: 0.07, adsSpread: 0.05, adsFov: 60, adsType: '3d_sight', mobility: 0.9, maxAmmo: 8, reloadTime: 3.0, modelUrl: null, adsSpeed: 12,\n    sound: 'm870', penetration: 1, tp: { len: 0.95, body: 'dark', mag: 'none' }",
     'sniper': "type: 'sniper', slot: 'primary', damageNear: 110, damageFar: 96, falloffStart: 60, falloffEnd: 200, fireRate: 1.2, recoilPitch: 0.065, recoilYaw: 0.01, recoilRecovery: 6,\n    hipSpread: 0.14, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.82, maxAmmo: 5, reloadTime: 3.0, modelUrl: null, zoomFovs: [20, 9], zoomHFovs: [55, 20],\n    sound: 'm40', penetration: 2, range: 420, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.15, body: 'dark', mag: 'box', scope: true }",
     'pistol': "type: 'pistol', slot: 'secondary', damageNear: 30, damageFar: 22, falloffStart: 12, falloffEnd: 35, fireRate: 0.16, recoilPitch: 0.02, recoilYaw: 0.008, recoilRecovery: 10,\n    hipSpread: 0.04, adsSpread: 0.004, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 12, reloadTime: 1.8, modelUrl: null, adsSpeed: 15,\n    sound: 'p226', penetration: 1, tp: { len: 0.2, body: 'dark', mag: 'box', pistol: true }"}[cat]
c = open('src/01_core.js', encoding='utf-8').read(); name = A.name or cls
if f"\n  {gid}: {{\n" not in c:
    c = c.replace("\n  famas: {\n", f"\n  {gid}: {{ // v65q SF2's own {cls} (tools/sf2_add_gun.py)\n    name: '{name}', {T},\n    desc: 'SF2 原版 {name}。',\n  }},\n  famas: {{\n", 1)
    pool = {'assault': 'general', 'smg': 'general', 'mg': 'general', 'shotgun': 'general', 'sniper': 'sniper', 'pistol': None}[cat]
    if pool: c = c.replace(f"  {pool}: [", f"  {pool}: ['{gid}', ", 1)
    open('src/01_core.js', 'w', encoding='utf-8').write(c)
subprocess.run(['python', 'tools/sf2_weapon_table.py'], check=True, env=env, capture_output=True); subprocess.run(['python', 'tools/sf2_weight_table.py'], check=True, env=env, capture_output=True)
# sounds (the gun loop's list + this one), pack, build
g = open('docs/loop/GUNS.md', encoding='utf-8').read(); i = g.index('\n聲音清單（') + 1; j = g.index('`', g.index('\n', i) + 1); k = g.index('`', j + 1); ids = g[j + 1:k].split()
for extra in ('acr',):  # (v65p's ACR went into the wrong line)
    if extra not in [x.split('@')[0].split('=')[0] for x in ids]: ids.append(extra)
if snd and gid not in [x.split('@')[0] for x in ids]:
    ids.append(gid + ('@' + snd[len('Sound_'):] if snd[len('Sound_'):].lower() != gid else '')); g = g[:j + 1] + ' '.join(ids) + g[k:]; __import__('pathlib').Path(os.path.abspath('docs/loop/GUNS.md')).write_text(g, encoding='utf-8')
if snd: run('node', 'tools/sfx_sf2.mjs', *ids)
run('node', 'tools/guns/pack.mjs'); print(run('sh', 'src/build.sh').strip().splitlines()[-1])
print('ADDED', gid, cls, cat, 'sound', snd, 'sight', sight)

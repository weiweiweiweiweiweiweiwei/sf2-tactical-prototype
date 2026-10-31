"""v66d An SF2 map's ambient particle effects (Emitter / SFEmitterNoSync that start on their own: dust, smoke, small fires, bugs,
blowing paper) → tools/out/sf2/maps/<map>_fx.json: where each sits, and each ParticleSystem's sprite emitters as the game needs them.
  python tools/sf2_fx.py <map>
UE3 cooks every distribution into its RawDistribution: Op (absent: one value, 2: random between a min and a max), LookupTableChunkSize
values per entry, LookupTable = [range min, range max, entries…] with the entries evenly spread over the time the module reads
(the particle's life 0…1, or the emitter's time). A random vector's entry is min x y z then max x y z. Units are UE's: cm, turns."""
import sys, struct, json, re
sys.path.insert(0, 'tools')
from sf2_props import Pkg
name = sys.argv[1]; p = Pkg(f'tools/out/sf2/{name}_dec.upk'); B = p.b
byname = {}
for i, e in enumerate(p.exports): byname.setdefault(e['name'], i + 1)
def props(i): return {n: v for n, k, t, v in p.props(p.exports[i - 1])}
def vec(v, d=(0.0, 0.0, 0.0)):
    if isinstance(v, (list, tuple)) and len(v) == 3: return [float(x) for x in v]
    if isinstance(v, dict): return [float(v.get(k, d[j])) for j, k in enumerate('XYZ')] if any(k in v for k in 'XYZ') else list(d)
    if isinstance(v, str) and v.startswith('('): return [float(x) for x in v.strip('()').split(',')]
    return list(d)
def actor_matrix(pr):  # (as tools/sf2_map_dump.py: UE3 FRotationMatrix rows × scale, the location; row-vector, cm)
    import math
    r = pr.get('Rotation'); r = [int(x) for x in str(r).strip('()').split(',')] if r else [0, 0, 0]
    P, Y, R = (x * math.pi / 32768 for x in r)
    sp, cp_, sy, cy, sr, cr = math.sin(P), math.cos(P), math.sin(Y), math.cos(Y), math.sin(R), math.cos(R)
    s = float(pr.get('DrawScale', 1.0)); s3 = vec(pr.get('DrawScale3D'), (1.0, 1.0, 1.0))
    rows = [[cp_ * cy, cp_ * sy, sp], [sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, -sr * cp_], [-(cr * sp * cy + sr * sy), cy * sr - cr * sp * sy, cr * cp_]]
    rows = [[v * s * s3[k] for v in row] for k, row in enumerate(rows)]
    return [*rows[0], 0, *rows[1], 0, *rows[2], 0, *vec(pr.get('Location')), 1]
def dist(d):  # a cooked RawDistribution → {op, ch, v} (None when the module left it uncooked)
    if not isinstance(d, dict) or not isinstance(d.get('LookupTable'), dict): return None
    f = d['LookupTable'].get('f') or []
    if len(f) < 3: return None
    ch = int(d.get('LookupTableChunkSize', 1)); return {'op': int(d.get('Op', 1)), 'ch': ch, 'v': [round(x, 4) for x in f[2:]]}
MODS = {  # module class → the distributions / flags the game reads
    'ParticleModuleSpawn': ['Rate', 'RateScale', 'BurstList'], 'ParticleModuleLifetime': ['Lifetime'], 'ParticleModuleSize': ['StartSize'],
    'ParticleModuleSizeMultiplyLife': ['LifeMultiplier', 'MultiplyX', 'MultiplyY'], 'ParticleModuleSizeScale': ['SizeScale'],
    'ParticleModuleVelocity': ['StartVelocity', 'StartVelocityRadial', 'bInWorldSpace'], 'ParticleModuleVelocityOverLifetime': ['VelOverLife', 'Absolute'],
    'ParticleModuleAcceleration': ['Acceleration', 'bAlwaysInWorldSpace'], 'ParticleModuleColor': ['StartColor', 'StartAlpha'],
    'ParticleModuleColorOverLife': ['ColorOverLife', 'AlphaOverLife'], 'ParticleModuleColorScaleOverLife': ['ColorScaleOverLife', 'AlphaScaleOverLife'],
    'ParticleModuleRotation': ['StartRotation'], 'ParticleModuleRotationRate': ['StartRotationRate'], 'ParticleModuleLocation': ['StartLocation'],
    'ParticleModuleLocationPrimitiveCylinder': ['StartRadius', 'StartHeight', 'StartLocation', 'Velocity', 'SurfaceOnly', 'bRadialVelocity'],
    'ParticleModuleLocationPrimitiveSphere': ['StartRadius', 'StartLocation', 'Velocity', 'SurfaceOnly'], 'ParticleModuleSubUV': ['SubImageIndex'],
    'ParticleModuleSizeMultiplyVelocity': [], 'ParticleModuleTypeDataMesh': ['Mesh'],
}
mats = {}; pkgs = {}; texpkg = {}  # (texpkg: a sheet imported from another package → that package)
def par_in(n): return n not in (None, 'None') and (n in byname or any(m['name'] == n for m in p.imports))
def import_pkg(mn):  # a material imported from another package (SF2_Env_fx …): that package, decompressed on first use
    for m in p.imports:
        if m['name'] != mn: continue
        o = m['outer']; top = mn
        while o: mm = p.imports[-o - 1] if o < 0 else p.exports[o - 1]; top = mm['name']; o = mm['outer']
        if top not in pkgs:
            import os, subprocess, sf2_props
            dec = f'tools/out/sf2/{top}_dec.upk'
            if not os.path.exists(dec): subprocess.run([sys.executable, 'tools/sf2_unlzo.py', top], capture_output=True)
            q = Pkg(dec if os.path.exists(dec) else sf2_props.PKG_DIR + top + '.upk')  # (an uncompressed package is read as installed)
            pkgs[top] = (q, {x['name']: k + 1 for k, x in enumerate(q.exports)})
        return top, pkgs[top]
    return None, None
def material(mn):  # a sprite material → its sheet and blend: MIC parameters first, else the Texture2D refs in the compiled tail
    global p, byname, B
    if mn in mats: return
    if mn not in byname:
        top, pk = import_pkg(mn)
        if not pk or mn not in pk[1]: return
        keep = (p, byname, B); p, byname = pk; B = p.b
        try: material(mn); mats[mn]['pkg'] = top
        finally: p, byname, B = keep
        return
    i = byname[mn]; e = p.exports[i - 1]; pr = props(i); blend = pr.get('BlendMode'); tex = None; par = pr.get('Parent')
    for tp in pr.get('TextureParameterValues') or []:
        if isinstance(tp, dict) and tp.get('ParameterValue') not in (None, 'None') and not re.search(r'(_n|normal)$', str(tp['ParameterValue']), re.I): tex = tp['ParameterValue']; break
    while blend is None and par not in (None, 'None') and par in byname:
        pp = props(byname[par]); blend = pp.get('BlendMode'); par = pp.get('Parent')
    if not tex:
        p.props(e); refs = []
        for q in range(p.o, e['off'] + e['size'] - 3):
            v = struct.unpack_from('<i', B, q)[0]
            if 0 < v <= len(p.exports) and p.clsname(p.exports[v - 1]) == 'Texture2D' and p.exports[v - 1]['name'] not in refs: refs.append(p.exports[v - 1]['name'])
            elif -len(p.imports) <= v < 0 and p.imports[-v - 1]['cls'] == 'Texture2D' and p.imports[-v - 1]['name'] not in refs:  # (a sheet from another package)
                refs.append(p.imports[-v - 1]['name']); top = p.imports[-v - 1]; o2 = top['outer']
                while o2: top = p.imports[-o2 - 1] if o2 < 0 else p.exports[o2 - 1]; o2 = top['outer']
                texpkg[refs[-1]] = top['name']
        # (the compiled shader's sheets; New_subBlood_02 / T_TORCH_08 sit in every FX material as placeholders: the sheet whose name
        # shares a word with the material wins — M_Dust_03 → T_Dust_03, M_thin_smoke_01_01 → T_thin_smoke_03)
        cand = [r for r in refs if not re.search(r'(_n|normal|_mask|subBlood|TORCH)', r, re.I)]
        words = set(w for w in re.split(r'[_\d]+', mn.lower()) if len(w) > 2 and w not in ('mat', 'inst'))
        num = re.findall(r'\d+', mn)[:1]
        cand.sort(key=lambda r: -(len(words & set(w for w in re.split(r'[_\d]+', r.lower()) if len(w) > 2)) + 0.5 * (re.findall(r'\d+', r)[:1] == num)))
        tex = cand[0] if cand else None
    if not tex and par_in(pr.get('Parent')):  # (a MaterialInstanceConstant with no sheet of its own: its parent's)
        material(pr['Parent']); tex = mats.get(pr['Parent'], {}).get('tex')
    mats[mn] = {'tex': tex, 'texpkg': texpkg.get(tex), 'blend': 'Distortion' if pr.get('bUsesDistortion') and 'EmissiveColor' not in pr and 'DiffuseColor' not in pr else str(blend or 'BLEND_Translucent').replace('BLEND_', '')}
systems = {}
def under(nm, root):  # (v66d module names repeat in every system — ParticleModuleRequired_4 …: the one whose outers reach this system)
    for k, x in enumerate(p.exports):
        if x['name'] != nm: continue
        o = x['outer']
        while o > 0 and o != root: o = p.exports[o - 1]['outer']
        if o == root: return k + 1
    return byname.get(nm)
def system(sn):
    if sn in systems or sn not in byname: return
    out = []; root = byname[sn]
    for ei in (props(byname[sn]).get('Emitters') or {}).get('i', []):
        if ei <= 0: continue
        ep = props(ei); lods = (ep.get('LODLevels') or {}).get('i', [])
        if not lods: continue
        lp = props(lods[0]); ri = under(lp['RequiredModule'], root) if lp.get('RequiredModule') else None; req = props(ri) if ri else {}
        em = {'name': ep.get('EmitterName'), 'mat': req.get('Material'), 'local': bool(req.get('bUseLocalSpace', False)),
              'subH': int(req.get('SubImages_Horizontal', 1)), 'subV': int(req.get('SubImages_Vertical', 1)), 'align': str(req.get('ScreenAlignment', 'PSA_Square')),
              'dur': float(req.get('EmitterDuration', 1.0)), 'loops': int(req.get('EmitterLoops', 0)), 'delay': float(req.get('EmitterDelay', 0.0)),
              'interp': str(req.get('InterpolationMethod', 'PSUVIM_None')), 'mods': {}}
        mods = ([under(lp['SpawnModule'], root)] if lp.get('SpawnModule') else []) + [m for m in (lp.get('Modules') or {}).get('i', []) if m > 0]
        for mi in mods:
            if not mi: continue
            c = p.clsname(p.exports[mi - 1]); mp = props(mi)
            if mp.get('bEnabled') is False or c not in MODS: continue
            d = {}
            for k in MODS[c]:
                v = mp.get(k)
                if v is None: continue
                d[k] = dist(v) if isinstance(v, dict) and 'Distribution' in v else (v if isinstance(v, (bool, int, float, str)) else str(v)[:80])
            em['mods'][c[len('ParticleModule'):]] = d
        if 'TypeDataMesh' in em['mods']: em['mesh'] = em['mods']['TypeDataMesh'].get('Mesh')
        if em['mat']: material(em['mat'])
        out.append(em)
    systems[sn] = out
placed = []
for e in p.exports:
    if p.clsname(e) != 'ParticleSystemComponent' or e['outer'] <= 0 or p.clsname(p.exports[e['outer'] - 1]) not in ('Emitter', 'SFEmitterNoSync'): continue
    pr = {n: v for n, k, t, v in p.props(e)}; a = e.get('arch')
    while pr.get('Template') in (None, 'None') and a and a > 0:  # (a placed archetype keeps its Template and bAutoActivate on the archetype)
        ap = {n: v for n, k, t, v in p.props(p.exports[a - 1])}; pr = {**ap, **pr}; pr['Template'] = ap.get('Template', pr.get('Template')); a = p.exports[a - 1].get('arch')
    t = pr.get('Template')
    if t in (None, 'None') or pr.get('bAutoActivate') is False: continue  # (off until a Kismet event: car fires, aircon sparks, explosions)
    if re.match(r'Lensflare', t, re.I): continue  # (the sun's lens flare: a screen effect, not drawn here)
    system(t); placed.append({'t': t, 'm': [round(x, 4) for x in actor_matrix({n: v for n, k, tt, v in p.props(p.exports[e['outer'] - 1])})]})
json.dump({'placed': placed, 'systems': systems, 'mats': mats}, open(f'tools/out/sf2/maps/{name}_fx.json', 'w'), indent=None)
print(name, len(placed), 'emitters,', len(systems), 'systems:', ', '.join(f"{k}({len(v)})" for k, v in systems.items()))
print('materials', {k: v for k, v in mats.items()})
# each sheet out of its package as PNG (UModel, as tools/sf2_export.sh) → tools/out/sf2/fx/<map>/…/<sheet>.png
import subprocess, glob, os
U = 'tools/out/umodel_win32'; out = f'../sf2/fx/{name}'
for mn, m in mats.items():
    if not m.get('tex') or m['blend'] == 'Distortion': continue
    pk = m.get('texpkg') or m.get('pkg') or name
    if glob.glob(f'tools/out/sf2/fx/{name}/**/{m["tex"]}.png', recursive=True): continue
    subprocess.run([os.path.abspath(U + '/umodel_64.exe'), '-game=sf2', '-path=D:/SpecialForce2/SFGame/CookedPCConsole', '-export', '-png', f'-out={out}', pk, m['tex']], cwd=U, capture_output=True)
miss = [m['tex'] for m in mats.values() if m.get('tex') and m['blend'] != 'Distortion' and not glob.glob(f'tools/out/sf2/fx/{name}/**/{m["tex"]}.png', recursive=True)]
print('sheets exported; missing', miss)

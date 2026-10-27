"""Every SF2 weapon's client-side defaults with inheritance resolved (child over parent class; struct fields too, since a
cooked struct only stores the fields that differ from its parent class's value) → docs/research/sf2/client-data/weapons.json.
  python tools/sf2_unlzo.py SFGame        (once: SFGame.upk is LZO-compressed)
  python tools/sf2_weapon_dump.py
Only gameplay fields are kept (damage, range, rate, ammo, reload, recoil, spread, zoom, sway / bob, body-part scales).
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from sf2_props import Pkg, PKG_DIR

KEEP = re.compile(r'^(Recoil|Spread|FireInterval|InstantHitDamage|WeaponRange|Ammo|ReloadTimes|EquipTime|PutDownTime|Zoom|fZoom|vLocZoom|'
                  r'DmgScaleBodyParts|APRatioBodyParts|fPenetration|MaxPenetration|ThicknessForPenetrate|PunchAngle|AccuracyDivisor|AccuracyOffset|'
                  r'MaxInaccuracy|SpreadAccuracy|TestRecoil|fBob|BobDamping|JumpDamping|vLag|fLagSpeed|fWeaponSteady|vWeaponSteady|RoundBurst|BurstInterval|'
                  r'StoppingPower|AccelRatePct|HeadPointDist|CriticalHeadShotMul|fStartSprintTime|fEndSprintTime|WeaponEquipWeight|PelletSpread|SGSpread)')


def main():
    pc = Pkg(PKG_DIR + 'SFGameContent.upk'); pg = Pkg('tools/out/sf2/SFGame_dec.upk')
    classes, defaults = {}, {}
    for p in (pg, pc):
        for e in p.exports:
            c = p.clsname(e)
            if c == 'Class': classes[e['name']] = p.objname(e['sup'])
            elif e['name'].startswith('Default__') and e['name'][9:] in classes or e['name'].startswith('Default__SF'):
                props = {}
                for n, i, t, v in p.props(e):
                    if KEEP.match(n): props[n if i == 0 else f'{n}[{i}]'] = v
                defaults[e['name'][9:]] = props

    def resolved(c, seen=()):
        if c in seen or c not in classes and c not in defaults: return {}
        out = resolved(classes.get(c, 'None'), seen + (c,)) if classes.get(c, 'None') != 'None' else {}
        out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in out.items()}
        for k, v in defaults.get(c, {}).items():
            out[k] = {**out[k], **v} if isinstance(v, dict) and isinstance(out.get(k), dict) else v
        return out

    def chain(c):
        r = []
        while c and c != 'None' and c not in r: r.append(c); c = classes.get(c, 'None')
        return r
    import math
    def slim(v):  # 4-byte arrays come as both readings: keep the float one unless it is not a sane float (then the ints)
        if isinstance(v, dict) and 'f' in v and 'i' in v:
            return v['f'] if all(math.isfinite(x) and (x == 0 or 1e-6 < abs(x) < 1e7) for x in v['f']) else v['i']
        return v
    weapons = {c: {k: slim(v) for k, v in dict(chain=chain(c), **resolved(c)).items()} for c in sorted(classes) if c.startswith('SFCWeapon') and 'SFWeapon' in chain(c)}
    os.makedirs('docs/research/sf2/client-data', exist_ok=True)
    out = 'docs/research/sf2/client-data/weapons.json'
    json.dump(weapons, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    print('SF2WEAPONS', len(weapons), out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()

"""v67m SF2's sound design data (user 11-10: kill / hit volume, background, badge, radio sounds): every SoundCue, SoundNode,
SoundClass / SoundMode and SFSoundGroup of the given packages with its properties, and which node feeds which → one text file.
  python -I tools/sf2_sound_dump.py Sound_common SoundUX … > docs/research/sf2/sound-dump.txt
Packages are LZO-compressed: tools/sf2_unlzo.py <name> first (→ tools/out/sf2/<name>_dec.upk).
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sf2_props import Pkg, PKG_DIR
SKIP = {'SoundNodeWave'}  # (a wave's own data: its name and duration are enough)
for n in sys.argv[1:]:
    f = f'tools/out/sf2/{n}_dec.upk'
    p = Pkg(f if os.path.exists(f) else PKG_DIR + n + '.upk')
    print(f'\n######## {n}')
    for e in p.exports:
        cn = p.clsname(e)
        if cn in ('Package', 'ObjectRedirector'): continue
        try: props = list(p.props(e))
        except Exception as x: props = [('ERR', 0, '', str(x))]
        if cn == 'SoundNodeWave':
            d = [v for nm, i, t, v in props if nm == 'Duration']; print(f'  wave {e["name"]}  {d[0]:.2f}s' if d else f'  wave {e["name"]}'); continue
        print(f'== {cn} {p.objname(e["outer"]) + "." if e["outer"] else ""}{e["name"]}')
        for nm, i, t, v in props:
            if nm in ('EditorData', 'NodeEditInfos'): continue
            if nm == 'ChildNodes' and isinstance(v, dict): v = [p.objname(x) for x in v.get('i', [])]
            s = str(v); print(f'    {nm}{"[" + str(i) + "]" if i else ""} = {s[:300]}')

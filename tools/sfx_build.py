"""v33 sound pack builder: CC0 recordings → assets/sfx.js (base64 Ogg Opus, loaded by a <script> tag so it works from
file:// too). Run with the scratchpad venv (numpy, soundfile, imageio-ffmpeg):
    python tools/sfx_build.py <sources dir>
<sources dir> holds the extracted downloads:
    firearms/Prepared SFX Library/...   The Free Firearm Sound Library (CC0, opengameart.org/content/the-free-firearm-sound-library)
    kenney/impact, kenney/rpg           Kenney Impact Sounds + RPG Audio (CC0, kenney.nl)
    amb/                                CC0 ambiences from OpenGameArt (see CREDITS in the output header)
Every source is CC0: no attribution needed; the header lists them anyway.
"""
import base64, io, json, os, subprocess, sys
import numpy as np
import soundfile as sf
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx.js')
SR = 48000
FA = os.path.join(SRC, 'firearms', 'Prepared SFX Library')

def load(path, sr=SR, mono=True):
    """any format → float32 numpy at sr (mono: mean of channels)"""
    cmd = [FF, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(sr), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).copy()
    return a if mono else a.reshape(-1, 2)

def opus(a, kbps, channels=1):
    """float32 → Ogg Opus bytes"""
    buf = io.BytesIO(); sf.write(buf, a, SR, format='WAV', subtype='FLOAT'); buf.seek(0)
    cmd = [FF, '-v', 'error', '-f', 'wav', '-i', '-', '-c:a', 'libopus', '-b:a', f'{kbps}k', '-ac', str(channels), '-application', 'audio', '-frame_duration', '10', '-f', 'ogg', '-']
    return subprocess.run(cmd, input=buf.read(), capture_output=True, check=True).stdout

def envelope(a, ms=1.0):
    k = max(1, int(SR * ms / 1000)); e = np.abs(a)
    return np.convolve(e, np.ones(k) / k, mode='same')

def onsets(a, rel=0.28, gap=0.22):
    """gunshot starts: the envelope crosses rel × peak, then nothing for `gap` s"""
    e = envelope(a, 0.5); thr = e.max() * rel; out = []; i = 0; n = len(e)
    while i < n:
        if e[i] > thr:
            j = i
            while j > 0 and e[j - 1] > thr * 0.12 and i - j < int(SR * 0.004): j -= 1
            out.append(j); i += int(SR * gap)
        else: i += 1
    return out

def cut(a, start, length, nxt=None, fade=0.35):
    s = max(0, start - int(SR * 0.002)); end = s + int(SR * length)
    if nxt is not None: end = min(end, nxt - int(SR * 0.01))
    seg = a[s:end].copy()
    n = len(seg); f = int(n * fade)
    if f > 8: seg[-f:] *= np.linspace(1, 0, f) ** 2
    seg[:48] *= np.linspace(0, 1, 48)  # 1 ms fade-in: no click
    pk = np.abs(seg).max(); return seg * (0.9 / pk) if pk > 0 else seg

def shots(fname, n, length, rel=0.28):
    """up to n single shots from one library file (the loudest-but-not-clipped ones)"""
    a = load(os.path.join(FA, fname))
    on = onsets(a, rel)
    segs = []
    for k, st in enumerate(on):
        nxt = on[k + 1] if k + 1 < len(on) else None
        if nxt is not None and (nxt - st) < SR * length * 0.45: continue  # part of a burst: the tail would be cut too early
        segs.append(cut(a, st, length, nxt))
    segs.sort(key=lambda s: -np.sqrt(np.mean(s[: SR // 10] ** 2)))
    return segs[:n] if segs else []

# gun profile (src/02_audio.js GUN_PROFILES key) → library files (near / mid distance), length, playback rate.
# Rate shifts the timbre toward the in-game calibre (0.8 = bigger / deeper, 1.1 = smaller / snappier).
GUNS = {
    'm4':      ('AR-15/D_32P.wav', 'AR-15/D_24P.wav', 1.1, 1.0),
    'scar':    ('AR-15/D_32P.wav', 'AR-15/D_24P.wav', 1.1, 0.95),
    'ak':      ('AK-47/C_28P.wav', 'AK-47/C_31P.wav', 1.1, 1.0),
    'mp5':     ('Carl Gustav M45/G_31P.wav', 'Carl Gustav M45/G_20P.wav', 0.85, 1.04),
    'ump':     ('Carl Gustav M45/G_31P.wav', 'Carl Gustav M45/G_20P.wav', 0.85, 0.93),
    'vector':  ('Carl Gustav M45/G_31P.wav', 'Carl Gustav M45/G_20P.wav', 0.85, 0.97),
    'mp7':     ('Carl Gustav M45/G_31P.wav', 'Carl Gustav M45/G_20P.wav', 0.8, 1.12),
    'p90':     ('PPSh/P_30P.wav', 'Carl Gustav M45/G_20P.wav', 0.8, 1.1),  # (PPSh's mid-distance file is a burst)
    'm249':    ('AR-15/D_32P.wav', 'AR-15/D_24P.wav', 1.1, 0.9),
    'pkm':     ('AK-47/C_28P.wav', 'AK-47/C_31P.wav', 1.2, 0.86),
    'mg42':    ('Mosin Nagant/M_21P.wav', 'Mosin Nagant/M_26P.wav', 1.1, 1.06),
    'm870':    ('Nova/O_21P.wav', 'Nova/O_17P.wav', 1.6, 1.0),
    'saiga':   ('CD/H_21P.wav', 'CD/H_16P.wav', 1.5, 1.04),
    'm200':    ('Tikka/W_29P.wav', 'Tikka/W_24P.wav', 2.0, 0.84),
    'awp':     ('1917/B_24P.wav', '1917/B_16P.wav', 2.0, 0.92),
    'barrett': ('Mosin Nagant/M_21P.wav', 'Mosin Nagant/M_26P.wav', 2.2, 0.74),
    'kar98':   ('Arisaka/E_25P.wav', 'Arisaka/E_18P.wav', 1.9, 1.0),
    'svd':     ('Mosin Nagant/M_21P.wav', 'Mosin Nagant/M_26P.wav', 1.8, 1.0),
    'p226':    ('Walther PPQ/X_39P.wav', 'Walther PPQ/X_31P.wav', 0.9, 1.0),
    'm1911':   ('1911/A_42P.wav', '1911/A_34P.wav', 1.0, 1.0),
    'deagle':  ('1911/A_42P.wav', '1911/A_34P.wav', 1.2, 0.8),
}

K_IMP = os.path.join(SRC, 'kenney', 'impact', 'Audio')
K_RPG = os.path.join(SRC, 'kenney', 'rpg', 'Audio')
def kenney(folder, prefix, count, gain=1.0, trim=0.6):
    """Kenney names vary (cloth1, clothBelt, clothBelt2, footstep00, footstep_grass_000): prefix + optional _ + digits"""
    import re
    names = sorted(f for f in os.listdir(folder) if re.fullmatch(re.escape(prefix) + r'_?\d*\.ogg', f))[:count]
    out = []
    for name in names:
        a = load(os.path.join(folder, name)); e = envelope(a, 2); idx = np.nonzero(e > e.max() * 0.02)[0]
        if len(idx): a = a[max(0, idx[0] - 48): min(len(a), idx[-1] + int(SR * 0.05))]
        a = a[: int(SR * trim)].copy(); f = min(len(a) // 4, int(SR * 0.04))
        if f > 0: a[-f:] *= np.linspace(1, 0, f)
        pk = np.abs(a).max(); out.append(a * (0.9 * gain / pk) if pk else a)
    if not out: print('  (no files for', prefix, ')')
    return out

def loop(path, seconds, start=0.0, stereo=True, xf=2.0):
    """a seamless loop: take start..start+seconds+xf and cross-fade the extra tail into the head"""
    a = load(path, mono=not stereo)
    s0 = int(SR * start); n = int(SR * seconds); x = int(SR * xf)
    if len(a) < s0 + n + x: s0 = max(0, len(a) - n - x)
    seg = a[s0: s0 + n + x].copy()
    head, tail = seg[:x], seg[n:n + x]
    w = np.linspace(0, 1, x) if seg.ndim == 1 else np.linspace(0, 1, x)[:, None]
    seg = seg[:n]; seg[:x] = head * w + tail * (1 - w)
    rms = np.sqrt(np.mean(seg ** 2)); return seg * (0.18 / rms) if rms > 0 else seg  # all loops at the same loudness; the game sets levels

def wet(paths, length):
    """v37 wet flesh hits: cut from the onset (10 % of the peak envelope) so the squelch lands on the hit frame"""
    out = []
    for f in paths:
        a = load(f); e = envelope(a, 2); on = int(np.argmax(e > e.max() * 0.1))
        out.append(cut(a, on, length, fade=0.5))
    return out

def main():
    pack, sizes = {}, {}
    def put(name, arrs, kbps, ch=1):
        pack[name] = [base64.b64encode(opus(a, kbps, ch)).decode() for a in arrs]
        sizes[name] = sum(len(x) * 3 // 4 for x in pack[name])
    for key, (near, far, length, rate) in GUNS.items():
        # v34: near shots are procedural again (user preferred them) — only the far-perspective recording ships
        put('gunfar_' + key, shots(far, 2, length * 1.3, rel=0.35), 56)
    # footsteps (Kenney Impact Sounds) + dirt/gravel (RPG Audio) + metal / ladder (light plate / metal impacts)
    for surf, (folder, prefix) in {'concrete': (K_IMP, 'footstep_concrete'), 'grass': (K_IMP, 'footstep_grass'), 'snow': (K_IMP, 'footstep_snow'),
                                   'wood': (K_IMP, 'footstep_wood'), 'carpet': (K_IMP, 'footstep_carpet'), 'sand': (K_RPG, 'footstep'),
                                   'metal': (K_IMP, 'impactPlate_light'), 'ladder': (K_IMP, 'impactMetal_light')}.items():
        put('step_' + surf, kenney(folder, prefix, 10 if prefix == 'footstep' else 5, trim=0.35), 48)
    # movement foley: cloth rustle, belt / strap, leather handle (gear rattle)
    put('cloth', kenney(K_RPG, 'cloth', 4, trim=0.5), 48)
    put('gear', kenney(K_RPG, 'clothBelt', 2, trim=0.5) + kenney(K_RPG, 'beltHandle', 2, trim=0.5) + kenney(K_RPG, 'handleSmallLeather', 2, trim=0.5), 48)
    put('metalclick', kenney(K_RPG, 'metalClick', 1, trim=0.3) + kenney(K_RPG, 'metalLatch', 1, trim=0.4), 48)
    put('knifedraw', kenney(K_RPG, 'drawKnife', 3, trim=0.6), 48)
    put('creak', kenney(K_RPG, 'creak', 3, trim=1.2), 40)
    put('hitmetal', kenney(K_IMP, 'impactMetal_light', 5, trim=0.3), 48)
    put('hitwood', kenney(K_IMP, 'impactPlank_medium', 5, trim=0.3), 48)
    put('hitglass', kenney(K_IMP, 'impactGlass_light', 5, trim=0.5), 48)
    put('hitsoft', kenney(K_IMP, 'impactSoft_medium', 5, trim=0.3), 48)
    put('punch', kenney(K_IMP, 'impactPunch_medium', 5, trim=0.3), 48)
    # v37 juicy body hits: 'Squish Sounds Effects' (CC0) + Independent.nu 'wet squish, slurp impacts' (CC0)
    WET = os.path.join(SRC, 'dl', 'wet')
    put('hit_wet', wet([os.path.join(WET, f + '.mp3') for f in ['squish_01_0', 'squish_02', 'squish_03', 'squish_04', 'squish_05', 'squish_06', 'squishsplat_impact']], 0.28), 56)
    put('hit_splat', wet([os.path.join(WET, 'x', 'impsplat', 'impactsplat0%d.mp3.flac' % i) for i in (1, 3, 6, 7)], 0.45), 56)
    # ambience loops (stereo) + one-shots
    A = os.path.join(SRC, 'amb')
    # v34: 'amb_birds' (morning bed with a rooster) dropped
    put('amb_park', [loop(os.path.join(A, 'park_ambience_birds.wav'), 40, 60)], 48, 2)
    put('amb_river', [loop(os.path.join(A, 'park_ambience_river.wav'), 30, 90)], 48, 2)
    put('amb_wind', [loop(os.path.join(A, 'park_ambience_wind.wav'), 40, 30)], 48, 2)
    put('amb_gust', [loop(os.path.join(A, 'wind_woosh_loop.ogg'), 5.5, 0, xf=0.4)], 48, 2)
    put('amb_traffic', [loop(os.path.join(A, 'gatve_Varniu_2.ogg'), 40, 8, stereo=False)], 40, 1)
    put('amb_crickets', [loop(os.path.join(A, 'crickets-oneloop.mp3'), 20, 1)], 48, 2)
    waves = [load(os.path.join(A, f), mono=False) for f in ('wave_01_cc0-18363__jasinski__alkaibeach.flac', 'wave_02_cc0-18363__jasinski__alkaibeach.flac')]
    put('amb_wave', [w / np.abs(w).max() * 0.8 for w in waves], 48, 2)
    gulls = [load(os.path.join(A, f), mono=True) for f in ('Seagull_Ambient_1.wav', 'Seagull_Ambient_3.wav')]
    put('amb_gull', [g / np.abs(g).max() * 0.8 for g in gulls], 40)
    pack['_rate'] = {k: v[3] for k, v in GUNS.items()}  # playback rate per gun profile (calibre timbre)
    total = sum(sizes.values())
    header = ('/* v33 sound pack — generated by tools/sfx_build.py. Ogg Opus clips, base64. All sources CC0 (public domain):\n'
              '   · The Free Firearm Sound Library — Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (opengameart.org)\n'
              '   · Kenney Impact Sounds + RPG Audio (kenney.nl)\n'
              '   · OpenGameArt ambiences: AMB Morning Sounds, Park ambiences, wind whoosh loop, Beach Ocean Waves (jasinski),\n'
              '     High traffic road sounds, Crickets Ambient Noise, Solo Seagull Sound Effects */\n')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(header + 'window.SF2_SFX = ' + json.dumps(pack, separators=(',', ':')) + ';\n')
    for k, v in sorted(sizes.items()): print(f'{k:16s} {len(pack[k])} clips {v / 1024:7.1f} KB')
    print(f'TOTAL {total / 1024 / 1024:.2f} MB audio · file {os.path.getsize(OUT) / 1024 / 1024:.2f} MB')

if __name__ == '__main__':
    main()

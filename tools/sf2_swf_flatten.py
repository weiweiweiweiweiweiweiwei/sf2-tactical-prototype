"""SF2's Scaleform movies -> plain SWFs a Flash player (Ruffle) renders: each DefineSubImage (1008: a rect of a packed atlas) becomes a
DefineBitsLossless2 cut from the atlas PNG (tools/out/sf2/ui/tex/SFUI_Lobby/Texture2D/<movie>_I<n>.png, the names in DefineExternalImage2,
1009); 1009 / 1000 dropped. Out: tools/out/sf2/ui/flat/<movie>.swf
  python tools/sf2_swf_flatten.py [movie …]   (default: all)"""
import sys, struct, zlib
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent)); from sf2_swf import tags, header
ROOT = Path(__file__).resolve().parents[1]; SWF = ROOT / 'tools/out/sf2/ui/swf'; TEX = ROOT / 'tools/out/sf2/ui/tex/SFUI_Lobby/Texture2D'; OUT = ROOT / 'tools/out/sf2/ui/flat'
OUT.mkdir(parents=True, exist_ok=True)
def tag(code, body): return struct.pack('<HI', (code << 6) | 0x3f, len(body)) + body
def lossless(cid, im):
  a = np.asarray(im.convert('RGBA'), dtype=np.uint16); al = a[..., 3:4]
  rgb = (a[..., :3] * al // 255).astype(np.uint8)  # premultiplied
  argb = np.concatenate([a[..., 3:4].astype(np.uint8), rgb], 2)
  return tag(36, struct.pack('<HBHH', cid, 5, im.width, im.height) + zlib.compress(argb.tobytes(), 6))
def flatten(name):
  d = (SWF / f'{name}.swf').read_bytes(); atl = {}; out = bytearray(d[:header(d)]); miss = 0
  for code, o, h, ln in tags(d):
    b = d[o + h:o + h + ln]
    if code == 1009:
      iid, fmt, _, w, hh = struct.unpack_from('<HHHHH', b, 0); k = 10; k += 1 + b[k]; fn = b[k + 1:k + 1 + b[k]].decode('latin1')
      p = TEX / (fn.rsplit('.', 1)[0] + '.png')
      if p.exists(): im = Image.open(p).convert('RGBA'); atl[iid] = im.resize((w, hh)) if im.size != (w, hh) else im
      else: miss += 1
      continue
    if code == 1008:
      cid, iid, x1, y1, x2, y2 = struct.unpack_from('<HHHHHH', b, 0)
      if iid in atl: out += lossless(cid, atl[iid].crop((x1, y1, x2, y2)))
      continue
    if code == 1000: continue
    out += d[o:o + h + ln]
  struct.pack_into('<I', out, 4, len(out))
  (OUT / f'{name}.swf').write_bytes(bytes(out)); return miss
names = sys.argv[1:] or sorted(p.stem for p in SWF.glob('*.swf'))
for n in names:
  m = flatten(n)
  if m: print('missing atlas', n, m)
print('FLAT', len(names))

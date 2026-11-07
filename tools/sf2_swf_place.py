"""View one exported symbol of an SF2 lobby movie: the flattened movie (tools/sf2_swf_flatten.py) with its root timeline's own placements
and frame script removed and the symbol placed instead (several: a grid). -> tools/out/sf2/ui/flat/_v_<movie>.swf
  python tools/sf2_swf_place.py <movie> <symbol>[@x,y[,scale]] …"""
import sys, struct
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); from sf2_swf import tags, header, exports
ROOT = Path(__file__).resolve().parents[1]; FL = ROOT / 'tools/out/sf2/ui/flat'
def tag(code, body): return struct.pack('<HI', (code << 6) | 0x3f, len(body)) + body
def bits(vals, n):
  s = ''.join(format(v & ((1 << n) - 1), f'0{n}b') for v in vals); s += '0' * (-len(s) % 8); return bytes(int(s[i:i + 8], 2) for i in range(0, len(s), 8))
def matrix(x, y, sc):
  out = ''
  if sc != 1: v = int(sc * 65536); out += '1' + format(5 + 0, '05b'); nb = 24; out = '1' + format(nb, '05b') + format(v, f'0{nb}b') * 2
  else: out = '0'
  out += '0'; nb = 20; out += format(nb, '05b') + format(int(x * 20) & ((1 << nb) - 1), f'0{nb}b') + format(int(y * 20) & ((1 << nb) - 1), f'0{nb}b')
  out += '0' * (-len(out) % 8); return bytes(int(out[i:i + 8], 2) for i in range(0, len(out), 8))
def place(movie, items, out=None, strip=False):
  d = (FL / f'{movie}.swf').read_bytes(); ex = exports(d); res = bytearray(d[:header(d)]); placed = False; depth = 1
  for code, o, h, ln in tags(d):
    if code in (26, 70, 4, 5, 28, 12) or (strip and code == 59): continue  # the root's own placements and frame script (strip: the class scripts too)
    if code == 1 and not placed:
      for nm, x, y, sc in items:
        cid = int(nm[1:]) if nm.startswith('#') else ex.get(nm)
        if cid is None: print('no symbol', nm); continue
        res += tag(26, struct.pack('<BHH', 0x06, depth, cid) + matrix(x, y, sc)); depth += 1
      placed = True
    res += d[o:o + h + ln]
  struct.pack_into('<I', res, 4, len(res)); p = FL / f'{out or "_v_" + movie}.swf'; p.write_bytes(bytes(res)); return p
if __name__ == '__main__':
  items = []
  for a in sys.argv[2:]:
    nm, _, pos = a.partition('@'); v = [float(t) for t in pos.split(',')] if pos else [0, 0]
    items.append((nm, v[0], v[1], v[2] if len(v) > 2 else 1))
  print(place(sys.argv[1], items))

"""Minimal SWF tag reader / rewriter for SF2's Scaleform movies (tools/out/sf2/ui/swf/*.swf, tools/sf2_ui_extract.py)."""
import struct, sys
from collections import Counter
def header(d):
  nbits = d[8] >> 3; rb = 5 + 4 * nbits; hdr = 8 + (rb + 7) // 8 + 4
  return hdr
def tags(d):
  o = header(d)
  while o < len(d):
    tc = struct.unpack_from('<H', d, o)[0]; code, ln = tc >> 6, tc & 0x3f; h = 2
    if ln == 0x3f: ln = struct.unpack_from('<I', d, o + 2)[0]; h = 6
    yield code, o, h, ln
    o += h + ln
    if code == 0: break
if __name__ == '__main__':
  d = open(sys.argv[1], 'rb').read(); c = Counter()
  for code, o, h, ln in tags(d):
    c[code] += 1
    if code in (1009, 1008, 1001) and c[code] <= 4: print(code, ln, d[o + h:o + h + min(ln, 60)])
  print(dict(c))
def exports(d):
  out = {}
  for code, o, h, ln in tags(d):
    if code == 56:
      b = d[o + h:o + h + ln]; n = struct.unpack_from('<H', b, 0)[0]; k = 2
      for _ in range(n):
        cid = struct.unpack_from('<H', b, k)[0]; e = b.index(b'\0', k + 2); out[b[k + 2:e].decode('latin1')] = cid; k = e + 1
  return out

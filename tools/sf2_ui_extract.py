"""SF2's lobby UI (user 11-07: restore SF2's own lobby / room look): the Scaleform movies (SwfMovie RawData: GFX = an SWF with Scaleform's
header, CFX = its zlib-compressed form) and the textures they use, out of SFUI_Lobby.upk -> tools/out/sf2/ui/swf/<name>.gfx and .swf
(header rewritten FWS / CWS so plain SWF tools read it)."""
import sys, struct, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); from sf2_props import Pkg
ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'tools/out/sf2/ui/swf'; OUT.mkdir(parents=True, exist_ok=True)
P = Pkg(sys.argv[1] if len(sys.argv) > 1 else 'D:/SpecialForce2/SFGame/CookedPCConsole/SFUI_Lobby.upk')
n = 0
for i, e in enumerate(P.exports):
  if P.clsname(e) != 'SwfMovie': continue
  blob = P.b[e['off']:e['off'] + e['size']]
  k = min([x for x in (blob.find(b'GFX'), blob.find(b'CFX')) if x >= 0], default=-1)
  if k < 0: continue
  ln = struct.unpack_from('<I', blob, k + 4)[0]
  sig = blob[k:k + 3]; data = blob[k:]
  name = P.objname(i + 1)
  if sig == b'CFX': body = zlib.decompress(data[8:]); swf = b'FWS' + data[3:4] + struct.pack('<I', 8 + len(body)) + body
  else: swf = b'FWS' + data[3:ln]
  (OUT / f'{name}.swf').write_bytes(swf); n += 1
print('SWF', n, OUT)

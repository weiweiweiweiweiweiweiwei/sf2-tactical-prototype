"""Parse Apex v52 static placements; validate against the complete exported lump."""
import json
import math
import struct
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tools/out/apex'
path = WORK / 'map-data/wrap/maps/mp_rr_canyonlands_staging_mu1.bsp.0023.client.bsp_lump'
data = path.read_bytes()
count, ident, flags, version, offset, size = struct.unpack_from('<I4sHHII', data)
assert count == 1 and ident == b'prps' and version == 52
assert size == len(data) - 20
names_count = struct.unpack_from('<I', data, 20)[0]
names = [data[24+i*128:24+(i+1)*128].split(b'\0')[0].decode() for i in range(names_count)]
cursor = 24 + names_count * 128
props_count, unknown1, unknown2 = struct.unpack_from('<3I', data, cursor)
cursor += 12
props = []
for i in range(props_count):
    values = struct.unpack_from('<7fH2B2H4f4b4B2H', data, cursor)
    assert all(math.isfinite(v) for v in values[:7])
    assert 0 <= values[7] < names_count
    assert 0 < values[6] < 1000
    props.append({'index': i, 'model': names[values[7]], 'origin': list(values[:3]),
                  'angles_pitch_yaw_roll': list(values[3:6]), 'scale': values[6],
                  'skin': values[10]})
    cursor += 64
unknown_count = struct.unpack_from('<I', data, cursor)[0]
cursor += 4
assert cursor + unknown_count * 64 == len(data), 'Unexpected trailing data'
result = {'version': version, 'model_count': names_count, 'prop_count': props_count,
          'tail_count': unknown_count, 'tail_bytes': len(data)-cursor,
          'tail_record_size': (len(data)-cursor)/unknown_count if unknown_count else 0,
          'model_frequency': dict(Counter(p['model'] for p in props)), 'props': props}
(WORK / 'preview/static_props.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ('props','model_frequency')}))
print(json.dumps([p for p in props if 'vert_course' in p['model']][:3]))

"""Top-down picture of the full-range collision: highest box top per 2 m cell (grey = height), village box in red.
python tools/_apexheight.py → tools/out/apex/heightmap.png"""
import struct, json
from PIL import Image, ImageDraw
d = open('assets/maps/apex-full/collision.bin', 'rb').read()
n = struct.unpack_from('<I', d, 8)[0]; head = json.loads(d[12:12 + n]); start = (12 + n + 3) & ~3
B = head['bounds']; S = 2; W = int((B['maxX'] - B['minX']) / S) + 1; H = int((B['maxZ'] - B['minZ']) / S) + 1
top = [[-1e9] * W for _ in range(H)]
q = struct.iter_unpack('<6h', d[start:start + head['count'] * 12])
for x0, y0, z0, x1, y1, z1 in q:
    x0 /= head['xz']; x1 /= head['xz']; z0 /= head['xz']; z1 /= head['xz']; y1 /= head['y']
    for i in range(int((x0 - B['minX']) / S), int((x1 - B['minX'] - 1e-3) / S) + 1):
        for j in range(int((z0 - B['minZ']) / S), int((z1 - B['minZ'] - 1e-3) / S) + 1):
            if 0 <= i < W and 0 <= j < H and y1 > top[j][i]: top[j][i] = y1
im = Image.new('RGB', (W, H), (20, 30, 60))
for j in range(H):
    for i in range(W):
        t = top[j][i]
        if t > -1e8:
            v = max(0, min(255, int((t + 60) * 1.2))); im.putpixel((i, j), (v, v, v))
dr = ImageDraw.Draw(im)
c = lambda x, z: ((x - B['minX']) / S, (z - B['minZ']) / S)
dr.rectangle([c(-40, -40), c(40, 40)], outline=(255, 40, 40))
for x in range(-900, 201, 100): dr.line([c(x, B['minZ']), c(x, B['minZ'] + 8)], fill=(255, 200, 0))
for z in range(-700, 201, 100): dr.line([c(B['minX'], z), c(B['minX'] + 8, z)], fill=(255, 200, 0))
im.save('tools/out/apex/heightmap.png'); print(W, H)

"""Re-encode the Apex exports' opaque PNG textures as JPEG (alpha-using ones stay PNG).

Run after the Blender exports (tools/blender/apex_full.py, the test-region GLB):
    python tools/compress-apex-textures.py
- assets/maps/apex-full/textures/*.png -> .jpg, scene.gltf image URIs updated; the replaced PNGs move to
  tools/out/apex/textures-png/ (local only) so a rerun or a rollback has them.
- assets/maps/apex-test/region.glb: embedded PNG images re-encoded in place; the previous file is kept as
  tools/out/apex/preview/region-png.glb.
- skulltown: tools/out/apex/skulltown/export (tools/blender/skulltown_export.py) textures and both lightmaps, in place
  (the export is rebuilt from the .blend; lightmaps at quality 92, 4:2:0 is fine for smooth light).
Idempotent: already-converted textures are skipped.
    python tools/compress-apex-textures.py [skulltown]
"""
import io, json, os, shutil, struct
from PIL import Image

QUALITY = 90
OUT = 'tools/out/apex'


def to_jpeg(data):
    """JPEG bytes for an opaque image, None when the alpha channel is used (or JPEG would not be smaller)."""
    im = Image.open(io.BytesIO(data))
    if im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        if im.getchannel('A').getextrema()[0] < 255:
            return None
    buf = io.BytesIO()
    im.convert('RGB').save(buf, 'JPEG', quality=QUALITY, subsampling=0, optimize=True)  # 4:4:4 keeps normal maps clean
    return buf.getvalue() if buf.tell() < len(data) else None


def full_range():
    root = 'assets/maps/apex-full/'
    gltf = json.load(open(root + 'scene.gltf', encoding='utf-8'))
    keep = os.path.join(OUT, 'textures-png')
    os.makedirs(keep, exist_ok=True)
    before = after = changed = 0
    for img in gltf.get('images', []):
        uri = img.get('uri', '')
        if not uri.lower().endswith('.png'):
            continue
        src = root + uri
        data = open(src, 'rb').read()
        before += len(data)
        jpg = to_jpeg(data)
        if jpg is None:
            after += len(data)
            continue
        new_uri = uri[:-4] + '.jpg'
        open(root + new_uri, 'wb').write(jpg)
        shutil.move(src, os.path.join(keep, os.path.basename(uri)))
        img['uri'] = new_uri
        if 'mimeType' in img:
            img['mimeType'] = 'image/jpeg'
        after += len(jpg)
        changed += 1
    json.dump(gltf, open(root + 'scene.gltf', 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'apex-full: {changed} textures -> JPEG, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


def read_glb(path):
    d = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', d, 0)
    assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
    chunks, o = [], 12
    while o < length:
        n, kind = struct.unpack_from('<II', d, o)
        chunks.append((kind, d[o + 8:o + 8 + n]))
        o += 8 + n
    j = json.loads(chunks[0][1])
    return j, (chunks[1][1] if len(chunks) > 1 else b'')


def write_glb(path, j, bin_data):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_data += b'\0' * (-len(bin_data) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_data))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_data), 0x004E4942) + bin_data
    open(path, 'wb').write(out)


def test_region():
    path = 'assets/maps/apex-test/region.glb'
    j, binary = read_glb(path)
    views = j['bufferViews']
    replaced = {}
    for img in j.get('images', []):
        if img.get('mimeType') != 'image/png' or 'bufferView' not in img:
            continue
        v = views[img['bufferView']]
        o = v.get('byteOffset', 0)
        jpg = to_jpeg(binary[o:o + v['byteLength']])
        if jpg is not None:
            replaced[img['bufferView']] = jpg
            img['mimeType'] = 'image/jpeg'
    if not replaced:
        print('apex-test: nothing to convert')
        return
    shutil.copyfile(path, os.path.join(OUT, 'preview', 'region-png.glb'))
    # rebuild the binary chunk: every view keeps its data (or the JPEG), 4-byte aligned, offsets rewritten
    out = bytearray()
    for i, v in enumerate(views):
        assert v.get('buffer', 0) == 0, 'single-buffer GLB expected'
        o = v.get('byteOffset', 0)
        data = replaced.get(i, binary[o:o + v['byteLength']])
        out += b'\0' * (-len(out) % 4)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out += data
    j['buffers'][0]['byteLength'] = len(out)
    before = os.path.getsize(path)
    write_glb(path, j, bytes(out))
    print(f'apex-test: {len(replaced)} images -> JPEG, {before / 1e6:.1f} MB -> {os.path.getsize(path) / 1e6:.1f} MB')


def skulltown():
    root = os.path.join(OUT, 'skulltown', 'export') + '/'
    gltf = json.load(open(root + 'scene.gltf', encoding='utf-8'))
    before = after = changed = 0
    for img in gltf.get('images', []):
        uri = img.get('uri', '')
        if not uri.lower().endswith('.png'):
            continue
        data = open(root + uri, 'rb').read()
        before += len(data)
        jpg = to_jpeg(data)
        if jpg is None:
            after += len(data)
            continue
        new_uri = uri[:-4] + '.jpg'
        open(root + new_uri, 'wb').write(jpg)
        os.remove(root + uri)
        img['uri'] = new_uri
        img['mimeType'] = 'image/jpeg'
        after += len(jpg)
        changed += 1
    json.dump(gltf, open(root + 'scene.gltf', 'w', encoding='utf-8'), separators=(',', ':'))
    for lm in ('lm_inner', 'lm_outer'):
        Image.open(root + lm + '.png').convert('RGB').save(root + lm + '.jpg', 'JPEG', quality=92, optimize=True)
    print(f'skulltown: {changed} textures -> JPEG, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['skulltown']:
        skulltown()
    else:
        full_range()
        test_region()

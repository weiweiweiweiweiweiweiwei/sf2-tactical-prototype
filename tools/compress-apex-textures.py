"""Re-encode the Apex map exports' textures to WebP (and their lightmaps to JPEG).

Run after the Blender exports:
    python tools/compress-apex-textures.py skulltown|range
- skulltown | range: tools/out/apex/<map>/export (tools/blender/skulltown_export.py) textures -> WebP and both lightmaps
  -> JPEG, in place (the export is rebuilt from the .blend; lightmaps at quality 92, 4:2:0 is fine for smooth light).
Idempotent: already-converted textures are skipped.
"""
import io, json, os
from PIL import Image

QUALITY = 90
OUT = 'tools/out/apex'


def to_webp(data):
    """WebP bytes (lossy, alpha kept when used), None when it would not be smaller."""
    im = Image.open(io.BytesIO(data))
    alpha = im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if alpha else 'RGB')
    if alpha and im.getchannel('A').getextrema()[0] == 255:
        im = im.convert('RGB')
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=88, method=6)
    return buf.getvalue() if buf.tell() < len(data) else None


def tri_map(name):
    """v60e: every texture -> WebP (JPEG ones too: about a third smaller at the same look; the browser decodes it natively)."""
    root = os.path.join(OUT, name, 'export') + '/'
    gltf = json.load(open(root + 'scene.gltf', encoding='utf-8'))
    before = after = changed = 0
    for img in gltf.get('images', []):
        uri = img.get('uri', '')
        if not uri.lower().endswith(('.png', '.jpg')):
            continue
        data = open(root + uri, 'rb').read()
        before += len(data)
        webp = to_webp(data)
        if webp is None:
            after += len(data)
            continue
        new_uri = uri.rsplit('.', 1)[0] + '.webp'
        open(root + new_uri, 'wb').write(webp)
        os.remove(root + uri)
        img['uri'] = new_uri
        img['mimeType'] = 'image/webp'
        after += len(webp)
        changed += 1
    json.dump(gltf, open(root + 'scene.gltf', 'w', encoding='utf-8'), separators=(',', ':'))
    for lm in ('lm_inner', 'lm_outer'):
        if os.path.exists(root + lm + '.png'):
            Image.open(root + lm + '.png').convert('RGB').save(root + lm + '.jpg', 'JPEG', quality=92, optimize=True)
    print(f'{name}: {changed} textures -> WebP, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    import sys
    if sys.argv[1:2] in (['skulltown'], ['range']):
        tri_map(sys.argv[1])
    else:
        print('usage: python tools/compress-apex-textures.py skulltown|range')

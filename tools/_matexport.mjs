// v46 export the game's own materials for a Blender-built map, so the .blend looks like the game: every placeholder name
// in the GLB ('sky:<x>' / 'ry:<x>', kept in mesh.userData.srcMat) → colour, roughness, metalness, opacity and its texture
// images (PNG). Output: maps/<id>/view/tex/*.png + maps/<id>/view/mats.json (read by tools/blender/glb_to_blend.py).
// node tools/_matexport.mjs skycity ryokan
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['skycity', 'ryokan'];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const id of ids) {
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
  const mats = await p.evaluate(async (id) => {
    const S = SF2.Settings.data, idx = SF2.MAPS.findIndex((m) => m.id === id); S.quality = 'high';
    Object.assign(S.lobby, { map: idx, rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
    const out = {}, png = (t) => {
      const im = t && t.image; if (!im || !im.width) return null;
      try { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png'); } catch (e) { return null; }
    };
    app.match.scene.traverse((o) => {
      const n = o.isMesh && o.userData.srcMat; if (!n || out[n]) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m) return;
      out[n] = { color: m.color ? '#' + m.color.getHexString() : '#cccccc', roughness: m.roughness ?? 0.8, metalness: m.metalness ?? 0, opacity: m.transparent ? m.opacity : 1,
        emissive: m.emissive ? '#' + m.emissive.getHexString() : '#000000', emissiveIntensity: m.emissiveIntensity ?? 1,
        map: png(m.map), normal: png(m.normalMap), rough: png(m.roughnessMap), repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : [1, 1], offset: m.map ? [m.map.offset.x, m.map.offset.y] : [0, 0] };
    });
    return out;
  }, id);
  const dir = path.join(ROOT, 'maps', id, 'view'), tex = path.join(dir, 'tex'); fs.mkdirSync(tex, { recursive: true });
  const json = {};
  for (const [name, m] of Object.entries(mats)) {
    const safe = name.replace(/[^a-z0-9_]+/gi, '_'), e = Object.assign({}, m);
    for (const k of ['map', 'normal', 'rough']) { if (m[k]) { const f = `${safe}_${k}.png`; fs.writeFileSync(path.join(tex, f), Buffer.from(m[k].split(',')[1], 'base64')); e[k] = 'tex/' + f; } else e[k] = null; }
    json[name] = e;
  }
  fs.writeFileSync(path.join(dir, 'mats.json'), JSON.stringify(json, null, 1));
  console.log(id, Object.keys(json).length, 'materials,', Object.values(json).filter((m) => m.map).length, 'with a texture');
  await p.close();
}
await b.close(); srv.close();

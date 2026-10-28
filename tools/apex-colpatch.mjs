// v63i Apex triangle maps: walkable surfaces you can SEE but not stand on (user 10-28: a ramp in the firing range "is not
// solid", hills with no collision under them). Loads the map in the game, takes every up-facing render triangle
// (ny > 0.7, area > 0.04 m², opaque material, inside the play bounds) and checks it against the collision soup at its
// centre and 3 inner points: no collision floor within 0.35 m at 3 of the 4 → the triangle goes into a patch.
// Output: assets/maps/<dir>/colpatch.js — window.APEX_COLPATCH[mapId] = base64 Float32 triangles (9 floats each),
// added to the collision at preload (apexTriMap).   node tools/apex-colpatch.mjs apex_full
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), MAP = process.argv[2] || 'apex_full';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(0);
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?nocolpatch`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (MAP) => {
  const def = SF2.MAPS.find((m) => m.id === MAP); await def.preload();
  const T = def._tri, soup = T.soup, V = SF2.THREE.Vector3, B = def.bounds, out = [], stats = { tris: 0, up: 0, missing: 0, meshes: 0 };
  const a = new V(), bb = new V(), c = new V(), u = new V(), w = new V(), n = new V();
  const floorNear = (x, y, z) => soup.groundAt(x, y + 0.35, z, 0.01, 0.7) !== null;
  T.gltf.scene.updateMatrixWorld(true);
  T.gltf.scene.traverse((o) => {
    if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.transparent || m.alphaTest > 0 || /foliage|grass|leaf|leaves|water|decal|glass/i.test(m.name || ''))) return;
    stats.meshes++;
    const g = o.geometry, P = g.attributes.position, I = g.index, M = o.matrixWorld, nt = I ? I.count / 3 : P.count / 3;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: I ? I.count : P.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mt = mats[gr.materialIndex] || mats[0]; if (!mt || mt.transparent || mt.alphaTest > 0 || /foliage|grass|leaf|leaves|water|decal|glass/i.test(mt.name || '')) continue;
      for (let k = gr.start; k < gr.start + gr.count; k += 3) {
        stats.tris++;
        const i0 = I ? I.getX(k) : k, i1 = I ? I.getX(k + 1) : k + 1, i2 = I ? I.getX(k + 2) : k + 2;
        a.fromBufferAttribute(P, i0).applyMatrix4(M); bb.fromBufferAttribute(P, i1).applyMatrix4(M); c.fromBufferAttribute(P, i2).applyMatrix4(M);
        u.subVectors(bb, a); w.subVectors(c, a); n.crossVectors(u, w); const area = n.length() / 2; if (area < 0.04) continue; n.normalize();
        if (n.y < 0.7) continue; // (up-facing only: an underside is a ceiling)
        const cx = (a.x + bb.x + c.x) / 3, cy = (a.y + bb.y + c.y) / 3, cz = (a.z + bb.z + c.z) / 3;
        if (cx < B.minX || cx > B.maxX || cz < B.minZ || cz > B.maxZ) continue;
        stats.up++;
        let miss = floorNear(cx, cy, cz) ? 0 : 1;
        for (const q of [a, bb, c]) { const x = cx + (q.x - cx) * 0.7, y = cy + (q.y - cy) * 0.7, z = cz + (q.z - cz) * 0.7; if (!floorNear(x, y, z)) miss++; }
        // a collision floor just above it (≤ 3 m) covers it: a buried render face, not a hole you fall through
        if (miss >= 3) { const g2 = soup.groundAt(cx, cy + 3, cz, 0.01, 3.3); if (g2 !== null && g2 > cy) continue; const d = g2 === null ? 'none' : (cy - g2).toFixed(0); (stats.gap || (stats.gap = {}))[d] = (stats.gap[d] || 0) + 1; stats.missing++; out.push(a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z); }
      }
    }
  });
  const f = new Float32Array(out), u8 = new Uint8Array(f.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { stats, b64: btoa(s), dir: def.packDir };
}, MAP);
const file = path.join(r.dir, 'colpatch.js');
fs.writeFileSync(file, `/* ${MAP}: walkable render triangles with no collision under them — tools/apex-colpatch.mjs */\n(window.APEX_COLPATCH || (window.APEX_COLPATCH = {}))[${JSON.stringify(MAP)}] = '${r.b64}';\n`);
console.log(JSON.stringify(r.stats), file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
await b.close(); srv.close();

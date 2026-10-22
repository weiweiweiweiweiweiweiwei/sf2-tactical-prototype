// v52 Satellite Base: the Blender dressing must not change gameplay — build the map with and without the GLB in the same
// build and compare colliders, radar footprints, spawn zones, nav nodes and the spawn line-of-sight check.
// node tools/_satcollide.mjs [file=index.html]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, FILE = process.argv[2] || 'index.html';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const snap = async (withGlb) => {
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/${FILE}`); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async (withGlb) => {
    const S = SF2.Settings.data; S.quality = 'low'; const mi = SF2.MAPS.findIndex((m) => m.id === 'satellite'), def = SF2.MAPS[mi];
    if (!withGlb) def._glb = null; // preload() leaves a set value alone → fallback visuals
    Object.assign(S.lobby, { map: mi, rule: 'tdm', allies: 1, enemies: 1 });
    await app.startMatch();
    const m = app.match, c = m.collision, f = (v) => +v.toFixed(3);
    const boxes = c.boxes.map((x) => [x.min.x, x.min.y, x.min.z, x.max.x, x.max.y, x.max.z].map(f).join(',')).sort();
    const radar = m.builder.radar.map((x) => [x.x0, x.z0, x.x1, x.z1, x.kind, x.top].map((v) => (typeof v === 'number' ? f(v) : v)).join(',')).sort();
    const nav = (m.nav.groundNodes || m.nav.nodes || []).length, glbOn = !!def._glb;
    let lights = 0; m.scene.traverse((o) => { if (o.isPointLight && o.userData.mapLight) lights++; });
    const sp = Object.fromEntries(Object.entries(m.spawns).map(([k, v]) => [k, (v.pts || []).map((q) => f(q.x) + ',' + f(q.z)).sort().join(' ')])); // spawn points come shuffled
    return { glbOn, boxes, radar, nav, lights, spawns: JSON.stringify(sp) };
  }, withGlb);
  await p.close(); return { ...r, errs };
};
const A = await snap(true), B = await snap(false);
const diff = (a, b) => ({ onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });
const db = diff(A.boxes, B.boxes), dr = diff(A.radar, B.radar);
console.log('with GLB:', A.glbOn, 'boxes', A.boxes.length, 'radar', A.radar.length, 'nav', A.nav, 'lights', A.lights);
console.log('fallback:', B.glbOn, 'boxes', B.boxes.length, 'radar', B.radar.length, 'nav', B.nav, 'lights', B.lights);
console.log('collider diff', JSON.stringify(db), 'radar diff', JSON.stringify(dr), 'spawns same', A.spawns === B.spawns);
const ok = A.glbOn && !B.glbOn && !db.onlyA.length && !db.onlyB.length && !dr.onlyA.length && !dr.onlyB.length && A.nav === B.nav && A.spawns === B.spawns;
if (A.errs.length || B.errs.length) console.log('ERRORS', A.errs.slice(0, 3), B.errs.slice(0, 3));
console.log(ok ? 'GAMEPLAY UNCHANGED' : 'DIFFERENCES FOUND'); await b.close(); srv.close();

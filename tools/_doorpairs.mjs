// Apex doors (v60): pairs open together, every leaf ends up inside (the roofed side), screenshot of a double door shut / open.
// node tools/_doorpairs.mjs [apex_full|apex_skulltown]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), ID = process.argv[2] || 'apex_full', T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; p.setDefaultTimeout(0);
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (id) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === id), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'playing';
  const m = app.match, D = m.builder.mechs.find((x) => x.doors), V = SF2.THREE.Vector3, up = new V(0, 1, 0);
  for (const d of D.doors) D._open(d, 1);
  for (let i = 0; i < 60; i++) D.tick(1 / 30);
  const roofed = (x, y, z) => !!m.collision.raycast(new V(x, y, z), up, 25);
  const res = D.doors.map((d) => { // where the open leaf's middle is now, and is it under a roof
    const mid = new V(0, 1.3, -0.76).applyMatrix4(d.pivot.matrixWorld);
    return { k: +d.k.toFixed(2), pair: !!d.partner, inside: roofed(mid.x, d.base + 1.4, mid.z) };
  });
  for (const d of D.doors) { D._open(d, 0); } for (let i = 0; i < 60; i++) D.tick(1 / 30);
  const pd = D.doors.find((d) => d.partner), c = pd ? pd.center.clone().add(pd.partner.center).multiplyScalar(0.5) : null;
  let shot = null;
  if (pd) { const pl = m.player, out = roofed(c.x + pd.nx * 3, pd.base + 1.4, c.z + pd.nz * 3) ? -1 : 1, x = c.x + pd.nx * 4 * out, z = c.z + pd.nz * 4 * out;
    pl.motor.teleport(new V(x, pd.base + 0.05, z)); pl.yaw = Math.atan2(-(c.x - x), -(c.z - z)); pl.pitch = 0; shot = [x, z];
    for (const o of m.combatants) if (o !== pl) o.motor.teleport(new V(x + 500, -400, z)); }
  return { doors: D.doors.length, pairs: res.filter((x) => x.pair).length, allOpen: res.every((x) => x.k === 1), inside: res.filter((x) => x.inside).length, notInside: res.map((x, i) => (x.inside ? -1 : i)).filter((i) => i >= 0), shot };
}, ID);
console.log(ID, r, errs.slice(0, 3));
if (r.shot) {
  await p.waitForTimeout(1200); await p.screenshot({ path: `tools/out/doors_${ID}_shut.jpg`, quality: 85 });
  await p.evaluate(() => { const D = app.match.builder.mechs.find((x) => x.doors); D.interact(app.match.player) || D._open(D.doors.find((d) => d.partner), 1); });
  await p.waitForTimeout(1500); await p.screenshot({ path: `tools/out/doors_${ID}_open.jpg`, quality: 85 });
}
await b.close(); srv.close();

// v44 Sakura Inn: walk a fresh motor along a straight line and report where it stops → console
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data, map = SF2.MAPS.findIndex((d) => d.id === 'ryokan'); S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); const m = app.match, Motor = m.player.motor.constructor, CFG = SF2.CFG, V = SF2.THREE.Vector3;
  const U = (u) => (u - 112) * 0.4, Z = (v) => (v - 166) * 0.3, out = {};
  const walk = (name, u, v, y, dx, dz, sec) => { const mo = new Motor(m.collision, { radius: CFG.player.radius, height: CFG.player.height, crouchHeight: CFG.player.crouchHeight });
    mo.teleport(new V(U(u), y, Z(v))); for (let i = 0; i < sec * 120; i++) mo.step(1 / 120, dx, dz, 5.9);
    out[name] = [+mo.pos.x.toFixed(2), +mo.pos.y.toFixed(2), +mo.pos.z.toFixed(2), 'u' + ((mo.pos.x / 0.4) + 112).toFixed(1)]; };
  walk('B→bridge→A', 140, 217.5, 3.5, 1, 0, 6); walk('A→bridge→B', 185, 217.5, 3.5, -1, 0, 6); walk('street N→S', 160, 165, 0.1, 0, 1, 14); walk('stairs top→eave', 136, 251.5, 3.5, -1, 0, 2); walk('stair mid jump', 131, 255, 2.2, 0, -1, 0.05);
  return out;
});
console.log(r); await b.close(); srv.close();

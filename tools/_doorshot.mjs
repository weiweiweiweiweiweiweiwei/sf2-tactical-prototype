// Screenshot of a full-range Apex door swinging open (v59 hinged doors) → tools/out/door_open.png
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }), page = await b.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(await page.evaluate(async () => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'playing';
  const m = app.match, D = m.builder.mechs[0], d = D.doors[18], p = m.player, V = SF2.THREE.Vector3; m.phase = 'live';
  for (const c of m.bots) { c.alive = false; c.model.root.visible = false; }
  const pos = d.center.clone().addScaledVector(new V(d.nx, 0, d.nz), 3.2); pos.y = d.base + 0.03; p.motor.teleport(pos);
  p.yaw = Math.atan2(-(d.center.x - pos.x), -(d.center.z - pos.z)); p.pitch = -0.05;
  D._open(d, 1, p.motor.pos); D.doors[19] && D._open(D.doors[19], 1, p.motor.pos);
  return 'door 18 dir ' + d.dir;
}));
await page.waitForTimeout(1500); await page.screenshot({ path: 'tools/out/door_open.png' }); await b.close(); srv.close();

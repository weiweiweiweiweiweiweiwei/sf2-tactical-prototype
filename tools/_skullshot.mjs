// Skull Town look probe: load the map, then screenshots from a few spots (player camera, no HUD) -> tools/out/skull_<n>.jpg
// node tools/_skullshot.mjs [x,y,z,yawDeg,pitchDeg ...]   (env PRE: a JS snippet run after the load, e.g. to hide things)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { console.log('404', q.url); s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
await p.evaluate(async () => { Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_skulltown'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'playing'; });
if (process.env.PRE) await p.evaluate(process.env.PRE);
const spots = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.split(',').map(Number)) : [[0, 3, 40, 180, 0], [-40, 2, -20, 60, 5], [30, 25, 60, 200, -20], [0, 120, 160, 180, -35]];
let i = 0;
for (const [x, y, z, yaw, pitch] of spots) {
  await p.evaluate(([x, y, z, yaw, pitch]) => {
    const m = app.match, pl = m.player; pl.motor.teleport(new SF2.THREE.Vector3(x, y, z)); pl.yaw = yaw * Math.PI / 180; pl.pitch = pitch * Math.PI / 180;
    for (const c of m.combatants) if (c !== pl) c.motor.teleport(new SF2.THREE.Vector3(x + 1e3, -500, z)); // out of the shot
    document.querySelectorAll('#hud, .hud').forEach((e) => (e.style.display = 'none'));
  }, [x, y, z, yaw, pitch]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `tools/out/skull_${i++}.jpg`, quality: 85 });
}
console.log('shots', i, errs.slice(0, 3));
await b.close(); srv.close();

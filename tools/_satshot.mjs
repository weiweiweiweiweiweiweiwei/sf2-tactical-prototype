// v52 fixed-camera shots of Satellite Base for before/after comparisons → tools/out/sat_<view>_<tag>.jpg
// node tools/_satshot.mjs <tag> [file=index.html]   (bots frozen out of sight, HUD kept, viewmodel hidden)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, TAG = process.argv[2] || 'cur', FILE = process.argv[3] || 'index.html';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
// [name, eye x, eye y, eye z, look-at x, y, z]: the control room (B) from its doors and a corner
const VIEWS = [['west', -8.2, 1.64, 3.4, 6, 1.0, -1.5], ['north', 0, 1.64, 8.4, 0, 0.9, -6], ['corner', 5.5, 1.64, 5.0, -4, 1.2, -3], ['ceiling', -6, 1.2, -6, 3, 3.0, 3]];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/${FILE}`); await p.waitForFunction(() => window.app && window.SF2);
const fps = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'high'; const mi = SF2.MAPS.findIndex((m) => m.id === 'satellite');
  Object.assign(S.lobby, { map: mi, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match; for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; bt.motor.teleport(new SF2.THREE.Vector3(-38, 0, 0)); }
  await new Promise((r) => setTimeout(r, 6000)); return Math.round(app.fps || 0);
});
for (const [name, x, y, z, tx, ty, tz] of VIEWS) {
  await p.evaluate(([x, y, z, tx, ty, tz]) => {
    const P = app.match.player, V = SF2.THREE.Vector3; P.motor.teleport(new V(x, 0, z)); P.eyeH = y; P.spawnProtect = 99;
    const dx = tx - x, dy = ty - y, dz = tz - z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.resetRecoil();
    app.match.weapons.current.vm.group.visible = false;
  }, [x, y, z, tx, ty, tz]);
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `tools/out/sat_${name}_${TAG}.jpg`, type: 'jpeg', quality: 86 });
}
console.log('sat shots', TAG, VIEWS.map((v) => v[0]).join(','), errs.slice(0, 4)); await b.close(); srv.close();

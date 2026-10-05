// v44 Sakura Inn camera tour: fixed cameras (no player physics), HUD + viewmodel hidden → tools/out/ryokan_<tag>_<name>.jpg
// node tools/_ryokanshot.mjs <tag> [name,name,...]   (map index = the 'ryokan' entry)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, [TAG = 'a', ONLY] = process.argv.slice(2);
// [name, x, y, z, yaw (0 = north / −z, +π/2 = west), pitch]
const SHOTS = [
  ['gate', -6, 1.65, 44, 0.05, 0.02], ['crossing', -27, 1.65, 26, -0.35, 0.03], ['west', -36, 1.65, 6, -0.12, 0.08],
  ['hall', -12, 1.65, -5, -1.2, 0.0], ['bell', 18, 1.65, -2, 0.55, 0.05], ['onsen', 26, 1.65, -2, -0.45, 0.02],
  ['eaststreet', 28, 1.65, -40, Math.PI - 0.05, 0.0], ['yard', 0, 1.65, -42, -1.45, 0.03], ['bridge', 23.5, 1.65, 35, 0.0, 0.12],
  ['obj2f', -14, 5.05, -20, -0.6, -0.05], ['objroom', -2.6, 5.15, -23.2, 0.88, -0.2], ['objroom2', -13.4, 5.1, -32.2, -2.35, -0.22],
  ['castleview', -36, 1.65, -2, -0.05, 0.12], ['bridgeup', 16.4, 5.05, 15.4, -1.45, 0.02], ['bdoor', 10.8, 5.05, 15.4, -1.5708, -0.05], ['beave', 9.6, 4.6, 29.6, 1.95, -0.25], ['aerial', -30, 42, 62, -0.42, -0.62], ['aerial2', 34, 38, -58, Math.PI - 0.5, -0.6],
];
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const info = await p.evaluate(async () => {
  const S = SF2.Settings.data, map = SF2.MAPS ? SF2.MAPS.findIndex((d) => d.id === 'ryokan') : 15;
  S.quality = 'high'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match;
  for (const x of m.bots) { x.ai.update = () => {}; x.motor.pos.set(0, -50, 0); }
  m.weapons.scene.visible = false; if (app.hud.el && app.hud.el.root) app.hud.el.root.style.display = 'none';
  window.__cam = null; const cam = m.camera, up = m.player.updateCamera.bind(m.player);
  m.player.updateCamera = (a) => { up(a); if (window.__cam) { const [x, y, z, yaw, pitch] = window.__cam; cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0); } };
  return { map, glb: !!m.def._glb, tris: app.renderer.info.render.triangles, calls: app.renderer.info.render.calls };
});
for (const [name, ...cam] of SHOTS) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  await p.evaluate((c) => { window.__cam = c; }, cam); await p.waitForTimeout(900);
  const st = await p.evaluate(() => ({ tris: app.renderer.info.render.triangles, calls: app.renderer.info.render.calls }));
  await p.screenshot({ path: `tools/out/ryokan_${TAG}_${name}.jpg`, type: 'jpeg', quality: 86 }); console.log(name, st);
}
console.log(info, errs.slice(0, 5)); await b.close(); srv.close();

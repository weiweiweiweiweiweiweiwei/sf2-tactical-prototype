// v61 candidate views for one map (the user picks the thumbnail / loading picture) → tools/out/views/<id>_<n>.jpg
// node tools/_mapviews.mjs <id> '[[px,py,pz, tx,ty,tz, fov?], ...]'     (built from tools/_mapthumbs.mjs)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, ONLY = [process.argv[2]], VIEWS = JSON.parse(process.argv[3]); fs.mkdirSync('tools/out/views', { recursive: true });
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const ids = await p.evaluate(() => SF2.MAPS.map((m) => m.id));
for (const [i, id] of ids.entries()) {
  if (ONLY && !ONLY.includes(id)) continue;
  await p.evaluate(async (i) => {
    const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map: i, rule: 'tdm', allies: 1, enemies: 1 });
    if (app.match) { try { app.match.dispose && app.match.dispose(); } catch (e) { /* */ } }
    await app.startMatch();
    const m = app.match, v = m.def.thumb || m.def.shot;
    for (const bt of m.bots) { bt.alive = false; if (bt.model) bt.model.root.visible = false; }
    if (m.playerModel) m.playerModel.root.visible = false;
    app.state = 'shot'; app.hud.show(false); document.getElementById('loader').classList.remove('on', 'shot');
    const hold = () => { app.shotT = 0; const c = m.camera, w = window.__v || [...v.pos, ...v.target, v.fov]; c.position.set(w[0], w[1], w[2]); c.lookAt(w[3], w[4], w[5]); c.fov = w[6] || 62; c.updateProjectionMatrix(); if (app.state === 'shot') requestAnimationFrame(hold); };
    // the shot state moves the camera every frame — pin it to the thumb view instead
    const orig = m.def.shot; m.def.shot = { pos: v.pos, target: v.target }; hold();
    window.__restoreShot = () => { m.def.shot = orig; };
    await new Promise((r) => setTimeout(r, 2200));
  }, i);
  for (const [n, v] of VIEWS.entries()) {
    await p.evaluate((v) => { const m = app.match; m.def.shot.pos = v.slice(0, 3); m.def.shot.target = v.slice(3, 6); window.__v = v; }, v);
    await p.evaluate(() => { const c = app.match.camera, v = window.__v; c.position.set(v[0], v[1], v[2]); c.lookAt(v[3], v[4], v[5]); c.fov = v[6] || 62; c.updateProjectionMatrix(); });
    await new Promise((r) => setTimeout(r, 1500));
    const cv = await p.$('canvas'); await cv.screenshot({ path: `tools/out/views/${id}_${n + 1}.jpg`, type: 'jpeg', quality: 84 }); console.log(id, n + 1);
  }
  await p.evaluate(() => { window.__restoreShot(); app.state = 'lobby'; });
}
console.log(errs.slice(0, 5)); await b.close(); srv.close();

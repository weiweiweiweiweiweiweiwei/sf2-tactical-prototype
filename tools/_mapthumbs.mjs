// v46 room map thumbnails: render each map's real scene from its `thumb` view (fallback `shot`) → assets/maps/thumbs/<id>.jpg
// node tools/_mapthumbs.mjs [ids,comma,separated]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, ONLY = process.argv[2] ? process.argv[2].split(',') : null;
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
    const hold = () => { app.shotT = 0; const c = m.camera; c.position.set(...v.pos); c.lookAt(...v.target); c.fov = v.fov || 62; c.updateProjectionMatrix(); if (app.state === 'shot') requestAnimationFrame(hold); };
    // the shot state moves the camera every frame — pin it to the thumb view instead
    const orig = m.def.shot; m.def.shot = { pos: v.pos, target: v.target }; hold();
    window.__restoreShot = () => { m.def.shot = orig; };
    await new Promise((r) => setTimeout(r, 2200));
  }, i);
  const cv = await p.$('canvas'); await cv.screenshot({ path: `assets/maps/thumbs/${id}.jpg`, type: 'jpeg', quality: 80 });
  console.log(id, fs.statSync(`assets/maps/thumbs/${id}.jpg`).size >> 10, 'KB');
  await p.evaluate(() => { window.__restoreShot(); app.state = 'lobby'; });
}
console.log(errs.slice(0, 5)); await b.close(); srv.close();

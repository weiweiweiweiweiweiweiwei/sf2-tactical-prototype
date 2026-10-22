// v49 reload pose check for a gun model: screenshots at reload phases 0 / 0.45 (magazine out) / 0.86 (charging handle back)
// → tools/out/gun_<id>_reload_<phase>.jpg. Confirms the mag / charge nodes and their pivots move as parts of the model.
// node tools/_gunreload.mjs m4a1[,g36c] [map] [phases=0,0.45,0.86]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, IDS = (process.argv[2] || 'm4a1').split(','), MAP = +(process.argv[3] || 0), PHASES = (process.argv[4] || '0,0.45,0.86').split(',').map(Number);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  for (const bt of app.match.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  await new Promise((r) => setTimeout(r, 8000));
}, MAP);
for (const id of IDS) {
  // build the gun, empty part of the mag, start a reload, then freeze it at each phase (reloadT is set directly, render keeps going)
  await p.evaluate(async (id) => { const ws = app.match.weapons; ws.rebuild([SF2.WEAPON_DEFS[id]]); await new Promise((r) => setTimeout(r, 700)); const w = ws.current; w.ammo = 5; w.tryReload(); }, id);
  for (const ph of PHASES) {
    await p.evaluate((ph) => { const w = app.match.weapons.current; w.reloading = true; w.reloadT = ph * w.reloadTime; w._reload = () => {}; }, ph);
    await new Promise((r) => setTimeout(r, 250));
    await p.screenshot({ path: `tools/out/gun_${id}_reload_${ph}.jpg`, type: 'jpeg', quality: 84 });
  }
  // automatic guns: hold the trigger and catch the kick mid-burst (~0.25 s in)
  const auto = await p.evaluate(async (id) => { const ws = app.match.weapons; ws.rebuild([SF2.WEAPON_DEFS[id]]); await new Promise((r) => setTimeout(r, 700)); if (!ws.current.def.auto) return false; app.input.buttons[0] = true; app.input.onButton(0, true); return true; }, id);
  if (auto) { await new Promise((r) => setTimeout(r, 250)); await p.screenshot({ path: `tools/out/gun_${id}_fire.jpg`, type: 'jpeg', quality: 84 }); await p.evaluate(() => { app.input.buttons[0] = false; app.input.onButton(0, false); }); }
  // bolt-action guns: fire once and catch the bolt lifted + pulled back (~0.55 s into the cycle)
  const bolt = await p.evaluate(async (id) => { const ws = app.match.weapons; ws.rebuild([SF2.WEAPON_DEFS[id]]); await new Promise((r) => setTimeout(r, 700)); const w = ws.current; if (!w.def.bolt) return false; ws._fire(); return true; }, id);
  if (bolt) { await new Promise((r) => setTimeout(r, 540)); await p.screenshot({ path: `tools/out/gun_${id}_bolt.jpg`, type: 'jpeg', quality: 84 }); }
}
console.log('reload shots', IDS, errs.slice(0, 5)); await b.close(); srv.close();

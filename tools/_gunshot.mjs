// v45 hip + ADS screenshots for chosen guns → tools/out/gun_<id>_hip.jpg / _ads.jpg     node tools/_gunshot.mjs g36c,g36c_gold [map]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, IDS = (process.argv[2] || 'g36c').split(','), MAP = +(process.argv[3] || 0);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const info = await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  for (const bt of app.match.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  await new Promise((r) => setTimeout(r, 9500)); return { glb: Object.keys(window.GUN_GLB || {}) };
}, MAP);
for (const id of IDS) {
  for (const ads of [false, true]) {
    await p.evaluate(async ([id, ads]) => { const ws = app.match.weapons, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ws.rebuild([SF2.WEAPON_DEFS[id]]); await sleep(600); if (ads) { ws.setAds(true, true, 1); await sleep(900); } }, [id, ads]);
    await p.screenshot({ path: `tools/out/gun_${id}_${ads ? 'ads' : 'hip'}.jpg`, type: 'jpeg', quality: 86 });
    await p.evaluate(() => app.match.weapons.setAds(false, true));
  }
}
console.log(info, errs.slice(0, 5)); await b.close(); srv.close();

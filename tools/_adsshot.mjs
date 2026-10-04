// v34: one aimed-down-sights screenshot per gun (same spot on map 0) → tools/out/ads/<id>.jpg + tools/out/ads_grid_<n>.png
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const ids = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  for (const bt of app.match.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  await new Promise((r) => setTimeout(r, 6000)); return Object.values(SF2.WEAPON_DEFS).filter((d) => d.slot === 'primary' || d.slot === 'secondary').map((d) => d.id);
});
fs.mkdirSync('tools/out/ads', { recursive: true });
const out = [];
for (const id of ids) {
  await p.evaluate(async (id) => {
    const m = app.match, ws = m.weapons, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ws.rebuild([SF2.WEAPON_DEFS[id]]); await sleep(500); ws.setAds(true, true, 1); await sleep(900);
  }, id);
  const f = `tools/out/ads/${id}.jpg`; await p.screenshot({ path: f, type: 'jpeg', quality: 80 }); out.push(id);
  await p.evaluate(() => app.match.weapons.setAds(false, true));
}
const B = (id) => 'data:image/jpeg;base64,' + fs.readFileSync(`tools/out/ads/${id}.jpg`).toString('base64');
for (let i = 0; i < out.length; i += 9) {
  const page = out.slice(i, i + 9), html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(3,1fr)">${page.map((id) => `<div style="position:relative"><img src="${B(id)}" style="width:100%;display:block"><b style="position:absolute;left:6px;top:4px;color:#ff0;font:bold 18px sans-serif;text-shadow:0 0 3px #000">${id}</b></div>`).join('')}</body>`;
  const p2 = await b.newPage({ viewport: { width: 1440, height: 810 } }); await p2.setContent(html); await p2.waitForTimeout(300); await p2.screenshot({ path: `tools/out/ads_grid_${i / 9 + 1}.png` }); await p2.close();
}
console.log(out.length, 'guns', JSON.stringify(out), errs.slice(0, 5)); await b.close(); srv.close();

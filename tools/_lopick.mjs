// v45 F1–F3 loadout picker screenshot → tools/out/lopick.jpg
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; await new Promise((r) => setTimeout(r, 9500));
  app.match.queueLoadout(1); await new Promise((r) => setTimeout(r, 400));
  return { slots: app.match.weapons.weapons.map((w) => w.def.id + ':' + (w.count ?? '')), sets: S.loadouts.length };
});
await p.screenshot({ path: 'tools/out/lopick.jpg', type: 'jpeg', quality: 85 });
await new Promise((r) => setTimeout(r, 2600)); const gone = await p.evaluate(() => getComputedStyle(document.getElementById('loPick')).opacity);
console.log(r, 'opacity after 3s', gone, errs.slice(0, 3)); await b.close(); srv.close();

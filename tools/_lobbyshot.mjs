// v45 room screen at common window sizes → tools/out/lobby_<w>x<h>.jpg   node tools/_lobbyshot.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1280, 720], [1920, 1080], [1366, 768]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async () => { app.createRoom(); await new Promise((r) => setTimeout(r, 2500)); const s = document.getElementById('lbStart').getBoundingClientRect(); return { bottom: Math.round(s.bottom), right: Math.round(s.right), vw: innerWidth, vh: innerHeight }; });
  await p.screenshot({ path: `tools/out/lobby_${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
  if (w === 1920) { await p.evaluate(async () => { document.querySelector('#ddMap>button').click(); await new Promise((r) => setTimeout(r, 1500)); }); await p.screenshot({ path: 'tools/out/lobby_maps.jpg', type: 'jpeg', quality: 85 }); }
  console.log(w, h, r, errs.slice(0, 3)); await p.close();
}
await b.close(); srv.close();

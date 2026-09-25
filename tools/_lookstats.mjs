// v24: per-map image stats (ref/dev.js measure: shot + eye views, high preset) → tools/out/lookstats_<tag>.json
// usage: node tools/_lookstats.mjs <tag> [file=index.html]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [tag = 'now', file = 'index.html', quality = 'high', only = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const out = {};
for (let i = 0; i < 7; i++) {
  if (only !== '' && !only.split(',').map(Number).includes(i)) continue;
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/${file}`); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async ({ i, quality }) => { await import('/ref/dev.js?' + Date.now()); const L = SF2.Settings.data; L.look = {}; const id = await window.loadMap(i, quality); const r = await window.measure(); const img = (i === 0 || i === 2) ? window.grab('shot').toDataURL('image/jpeg', 0.9) : null; return { id, ...r, img, filter: app.renderer.domElement.style.filter }; }, { i, quality });
  if (r.img) fs.writeFileSync(`tools/out/look_${tag}_${r.id}.jpg`, Buffer.from(r.img.split(',')[1], 'base64'));
  delete r.img; out[r.id] = r; console.log(r.id, quality, r.filter || '', 'shot', JSON.stringify({ meanY: r.shot.meanY, chroma: r.shot.chroma }), 'eye', JSON.stringify({ meanY: r.eye.meanY, chroma: r.eye.chroma }));
  await p.close();
}
fs.writeFileSync(`tools/out/lookstats_${tag}.json`, JSON.stringify(out, null, 1));
await b.close(); srv.close();

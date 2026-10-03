import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage({ viewport: { width: 1440, height: 860 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/${process.argv[2] || 'index.html'}`); await p.waitForFunction(() => window.app);
console.log(await p.evaluate(() => [...document.querySelectorAll('.lb-side > *')].map((e) => (e.querySelector('h3') ? e.querySelector('h3').textContent : e.id || e.className) + ' ' + Math.round(e.getBoundingClientRect().height)).join(' | '))); console.log(await p.evaluate(() => ['.lbz', '.lb-main', '.lb-left', '.lb-teams', '#lbOnline', '.lb-foot', '.lb-side', '.vs'].map((s) => { const e = document.querySelector(s); if (!e) return s + ' missing'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return `${s}: y ${Math.round(r.top)}–${Math.round(r.bottom)} h ${Math.round(r.height)} · ${cs.display} ${cs.gridTemplateRows || ''}`; }).join('\n')));
await b.close(); srv.close();

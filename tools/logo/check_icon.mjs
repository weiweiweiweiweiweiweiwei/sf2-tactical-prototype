import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const srv = http.createServer((q, s) => { const p = path.join(process.cwd(), decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage(); const st = {};
p.on('response', (r) => { if (/favicon/.test(r.url())) st[r.url().replace(base, '')] = r.status(); });
await p.goto(base + 'index.html'); const links = await p.evaluate(() => [...document.querySelectorAll('link[rel*=icon]')].map((l) => l.getAttribute('href')));
for (const h of links) st[h] = st[h] || (await p.evaluate(async (u) => (await fetch(u)).status, h));
console.log(JSON.stringify(st)); await b.close(); srv.close();

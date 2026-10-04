// Screenshots the armory (倉庫) page (+ page 2 / set B) after the background thumbnail renders finish: node tools/armory_shot.mjs [waitMs]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app);
await p.evaluate(() => window.app.openWarehouse()); await p.waitForTimeout(1500);
const pages = await p.evaluate(() => [...document.querySelectorAll('#whPager button[data-p]')].map((b) => b.dataset.p));
for (const pg of pages) { await p.evaluate((pg) => document.querySelector(`#whPager button[data-p="${pg}"]`)?.click(), pg); await p.waitForTimeout(700); await p.screenshot({ path: `tools/out/armory_p${pg}.png` }); }
console.log('pages', pages, errs.filter((e) => !/404/.test(e))); await b.close(); srv.close();

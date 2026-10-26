// Skull Town debug: evaluates a snippet after the map loads.  node tools/_skulldbg.mjs "<js expression>"
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
await p.evaluate(async () => { Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_skulltown'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'playing'; });
await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(process.argv[2]), null, 1));
console.log(errs.slice(0, 5));
await b.close(); srv.close();

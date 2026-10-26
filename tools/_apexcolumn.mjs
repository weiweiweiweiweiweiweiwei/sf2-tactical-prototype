// Collision boxes under / over points of the full Apex range (y ranges), e.g. a blocked doorway.  node tools/_apexcolumn.mjs x,z x,z …
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), PTS = process.argv.slice(2).map((s) => s.split(',').map(Number)), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(await page.evaluate(async (PTS) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const w = app.match.collision, tmp = [], out = [];
  for (const [x, z] of PTS) {
    w.query(x - 0.35, z - 0.35, x + 0.35, z + 0.35, tmp);
    out.push(`(${x},${z}): ` + tmp.filter((b) => b.max.x > x - 0.35 && b.min.x < x + 0.35 && b.max.z > z - 0.35 && b.min.z < z + 0.35 && b.max.y > -10 && b.min.y < 12)
      .map((b) => `[x${b.min.x}..${b.max.x} z${b.min.z}..${b.max.z} y${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}]`).join(' '));
  }
  return out.join('\n');
}, PTS));
await b.close(); srv.close();

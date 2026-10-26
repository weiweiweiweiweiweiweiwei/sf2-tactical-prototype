// ASCII top view (0.2 m cells, 5×5 m) of the collision around full-range Apex doors at chest height: # solid, D door leaf, P hinge, C leaf centre.
// node tools/_apexdoormap.mjs 13,18,19
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), IDS = (process.argv[2] || '13').split(',').map(Number), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(await page.evaluate(async (IDS) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const m = app.match, w = m.collision, D = m.builder.mechs[0], lines = [];
  for (const i of IDS) {
    const d = D.doors[i], c = d.center, y = d.base + 1.2;
    lines.push(`door ${i} hinge (${d.pivot.position.x.toFixed(2)},${d.pivot.position.z.toFixed(2)}) yaw ${d.pivot.rotation.y.toFixed(2)} base ${d.base.toFixed(2)}  +x → right, +z ↓`);
    for (let gz = -12; gz <= 12; gz++) {
      let row = '';
      for (let gx = -12; gx <= 12; gx++) {
        const x = c.x + gx * 0.2, z = c.z + gz * 0.2;
        const pv = Math.hypot(x - d.pivot.position.x, z - d.pivot.position.z) < 0.12, cc = Math.hypot(x - c.x, z - c.z) < 0.1;
        const inDoor = x >= d.col.min.x && x <= d.col.max.x && z >= d.col.min.z && z <= d.col.max.z;
        w.setSolid(d.col, false); const solid = !w.fits(x, y, z, 0.05, 0.1); w.setSolid(d.col, true);
        row += pv ? 'P' : cc ? 'C' : solid ? '#' : inDoor ? 'D' : '.';
      }
      lines.push(row);
    }
  }
  return lines.join('\n');
}, IDS));
await b.close(); srv.close();

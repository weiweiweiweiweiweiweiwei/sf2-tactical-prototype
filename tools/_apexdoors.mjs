// Full-range Apex doors: with every door open, can a player-sized capsule pass straight through each doorway (−1.6 m … +1.6 m
// across the door plane, every 0.1 m)? Prints the blocked ones and where.   node tools/_apexdoors.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(JSON.stringify(await page.evaluate(async () => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const m = app.match, w = m.collision, D = m.builder.mechs[0], out = [];
  for (const d of D.doors) w.setSolid(d.col, false);
  for (const [i, d] of D.doors.entries()) {
    const yaw = d.pivot.rotation.y, c = d.center, nx = Math.cos(yaw), nz = -Math.sin(yaw); // door plane normal (leaf thickness axis)
    let y = d.base, bad = null;
    for (let t = -1.6; t <= 1.6001; t += 0.1) {
      const x = c.x + nx * t, z = c.z + nz * t, g = w.groundBelow(x, y + 0.5, z, 0.12, 1.2, 0.02);
      if (g) y = g.y;
      if (!w.fits(x, y + 0.46, z, 0.34, 1.34)) { bad = { t: +t.toFixed(1), x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) }; break; }
    }
    out.push({ i, at: [d.center.x, d.base, d.center.z].map((v) => +v.toFixed(1)), yaw: +yaw.toFixed(2), pass: !bad, bad });
  }
  return { blocked: out.filter((o) => !o.pass).length, of: out.length, list: out };
}), null, 1));
await b.close(); srv.close();

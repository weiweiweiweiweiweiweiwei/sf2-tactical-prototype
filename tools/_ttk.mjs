// Body hits to kill and time to kill (all hits, chest, 15 m) per gun: SF2 (100 HP) vs Apex (100 HP + white 50 / purple 100 shield),
// with each gun's Apex counterpart (v62u). node tools/_ttk.mjs [--json out.json]
import { launchBrowser, routeCdn } from './pw.mjs'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await launchBrowser(), page = await b.newPage();
await routeCdn(page, ROOT);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2, null, { timeout: 90000 });
const rows = await page.evaluate(() => {
  const rows = [], W = SF2.WEAPON_DEFS;
  for (const d of Object.values(W)) {
    if (d.damageNear === undefined || !['assault', 'smg', 'lmg', 'pistol', 'sniper', 'shotgun'].includes(d.type)) continue;
    const per = (apex, part = 'chest') => SF2.calcDamage(d, part, 15, 1, apex) * (d.pellets || 1), n = (hp, apex) => Math.ceil(hp / per(apex));
    const t = (k) => +((k - 1) * d.interval).toFixed(2);
    rows.push({ id: d.id, gun: d.name, type: d.type, apexGun: d.apex ? d.apex.name : '-', rpm: Math.round(60 / d.interval), 'apex body': +per(true).toFixed(1), 'apex head': +per(true, 'head').toFixed(1),
      sf2: n(100, false), 'apex white': n(150, true), 'apex purple': n(200, true), 'ttk sf2 s': t(n(100, false)), 'ttk purple s': t(n(200, true)), mag: d.mag });
  }
  return rows.sort((a, c) => a.type.localeCompare(c.type));
});
const i = process.argv.indexOf('--json'); if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(rows, null, 1));
console.table(rows.map(({ id, ...r }) => r));
await b.close(); srv.close();

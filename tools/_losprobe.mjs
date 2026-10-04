// can the nav graph route from a spawn to every objective? node tools/_navprobe.mjs <map>
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, MAP = +(process.argv[2] || 0);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
console.log(JSON.stringify(await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const m = app.match, V = SF2.THREE.Vector3, pick = (pts) => pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 16)) === 0).slice(0, 16), A = pick(m.spawns.alpha.pts), B = pick(m.spawns.bravo.pts), out = [];
  for (const p of A) for (const q of B) { const a = new V(p.x, p.y + 1.6, p.z), b = new V(q.x, q.y + 1.6, q.z); if (m.collision.segmentClear(a, b)) out.push([+p.x.toFixed(1), +p.z.toFixed(1), +q.x.toFixed(1), +q.z.toFixed(1)]); }
  return out;
}, MAP))); await b.close(); srv.close();

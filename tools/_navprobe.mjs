// can the nav graph route from a spawn to every objective? node tools/_navprobe.mjs <map>
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, MAP = +(process.argv[2] || 0);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
console.log(await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'dom', allies: 1, enemies: 1 }); await app.startMatch();
  const m = app.match, N = m.nav, V = SF2.THREE.Vector3, sp = m.player.motor.pos.clone();
  return m.def.objectives.dom.map(([x, y, z]) => { const path = N.findPath(sp, new V(x, y, z)); return { to: [x, y, z], ok: !!(path && path.length), len: path ? path.length : 0, endY: path && path.length ? +path[path.length - 1].y.toFixed(2) : null }; });
}, MAP)); await b.close(); srv.close();

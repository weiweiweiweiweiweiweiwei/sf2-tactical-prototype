// Walk probe (v60 triangle maps): the baked nav's two-way walk links (kind 0) walked by the real motor, no jumping — a link
// it cannot finish in 3 s means a seam, threshold or step that stops feet (the player had to jump there).
// node tools/_walkprobe.mjs [map=apex_full] [n=600]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), MAP = process.argv[2] || 'apex_full', N = +(process.argv[3] || 600), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage(); p.setDefaultTimeout(0);
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
console.log(JSON.stringify(await p.evaluate(async ({ MAP, N }) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === MAP), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const g = app.match, col = g.collision, Motor = g.player.motor.constructor, V = SF2.THREE.Vector3, B = g.def._tri.nav;
  for (const d of g.builder.mechs.find((m) => m.doors).doors) col.setSolid(d.col, false);
  const links = []; for (let i = 0; i < B.kind.length; i++) if (B.kind[i] === 0) links.push(i);
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const fails = []; let ok = 0;
  for (let k = 0; k < N; k++) {
    const e = links[Math.floor(rnd() * links.length)], [a, c] = rnd() < 0.5 ? [B.from[e], B.to[e]] : [B.to[e], B.from[e]];
    const A = [B.pos[a * 3], B.pos[a * 3 + 1], B.pos[a * 3 + 2]], C = [B.pos[c * 3], B.pos[c * 3 + 1], B.pos[c * 3 + 2]];
    const m = new Motor(col, { stepHeight: 0.8 }); m.teleport(new V(A[0], A[1] + 0.03, A[2])); let done = false;
    for (let i = 0; i < 360 && !done; i++) {
      const dx = C[0] - m.pos.x, dz = C[2] - m.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35 && Math.abs(m.pos.y - C[1]) < 0.6) done = true; else m.step(1 / 120, dx / d, dz / d, 4.9);
    }
    if (done) ok++; else fails.push([A.map((v) => +v.toFixed(1)), C.map((v) => +v.toFixed(1)), m.pos.toArray().map((v) => +v.toFixed(2))]);
  }
  return { map: MAP, links: links.length, walked: N, ok, failed: fails.length, rate: +(fails.length / N * 100).toFixed(1) + '%', eg: fails.slice(0, 8) };
}, { MAP, N })));
await b.close(); srv.close();

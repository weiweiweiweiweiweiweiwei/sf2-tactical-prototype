// v44 nav sanity: path lengths spawn ↔ spawn / objective / dom points, unreachable checks → console
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data, map = SF2.MAPS.findIndex((d) => d.id === 'ryokan'); S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); const m = app.match, N = m.nav, V = SF2.THREE.Vector3, Z = m.builder.zones;
  const c = (z) => new V((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2), P = m.def._plan;
  const pts = { alpha: c(Z.alpha), bravo: c(Z.bravo), obj: new V(P.objective[0], 3.4, P.objective[1]), A: new V(P.dom[0][0], 0, P.dom[0][1]), B: new V(P.dom[1][0], 0, P.dom[1][1]), C: new V(P.dom[2][0], 0, P.dom[2][1]) };
  const len = (path) => { let d = 0; for (let i = 1; i < path.length; i++) d += path[i].distanceTo(path[i - 1]); return Math.round(d); };
  const out = { nodes: N.nodes.length, valid: N.valid.length, upper: N.upperNodes.length };
  for (const [a, bb] of [['alpha', 'bravo'], ['alpha', 'obj'], ['bravo', 'obj'], ['alpha', 'A'], ['alpha', 'B'], ['alpha', 'C'], ['bravo', 'A'], ['bravo', 'B'], ['bravo', 'C']]) { const path = N.findPath(pts[a], pts[bb]); out[a + '→' + bb] = path.length ? len(path) + 'm/' + path.length : 'NONE'; }
  const nb = N.nearest(pts.bravo, false), no = N.nearest(pts.obj, false); out.bravoNode = nb && [nb.ok, +nb.p.x.toFixed(1), +nb.p.z.toFixed(1)]; out.objNode = no && [no.ok, +no.p.y.toFixed(2)];
  return out;
});
console.log(r); await b.close(); srv.close();

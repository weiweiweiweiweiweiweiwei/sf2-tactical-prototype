// v46 Sky City debug: world positions of the moving GLB parts (+ their mesh centres), and a few views     node tools/_skydbg.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = SF2.Settings.data, idx = SF2.MAPS.findIndex((m) => m.id === 'skycity');
  Object.assign(S.lobby, { map: idx, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match, mc = m.builder.mechs[0], TH = SF2.THREE, out = {};
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  const desc = (o) => { o.updateMatrixWorld(true); const w = new TH.Vector3().setFromMatrixPosition(o.matrixWorld), bb = new TH.Box3().setFromObject(o, true), c = bb.getCenter(new TH.Vector3()); return `node ${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}  mesh ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}  rot ${o.rotation.x.toFixed(2)},${o.rotation.y.toFixed(2)},${o.rotation.z.toFixed(2)}`; };
  for (const g of mc.gears) out['gear' + mc.gears.indexOf(g)] = desc(g.o);
  const G = m.def._glb.scene; out.kids = mc.gears.map((g) => g.o.name + ':' + g.o.children.map((c) => c.name + '[' + c.type + ' ' + c.position.toArray().map((v) => v.toFixed(1)) + ']').join(','));
  const named = []; m.scene.traverse((o) => { if (/GEAR|BRIDGE|TRAM_/.test(o.name)) { o.updateMatrixWorld(true); const w = new TH.Vector3().setFromMatrixPosition(o.matrixWorld); named.push(o.name + ' ' + o.type + ' @' + w.toArray().map((v) => v.toFixed(1)) + ' parent=' + (o.parent && o.parent.name)); } }); out.named = named;
  for (const [i, o] of mc.floorGears.entries()) out['floor' + i] = desc(o);
  return out;
});
console.log(r); await b.close(); srv.close();

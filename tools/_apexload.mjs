// Apex load probe: time startMatch (fetch + parse + build, minus the 1.7 s loader shot) and the JS heap after it.
// node tools/_apexload.mjs [apex_full|apex_skulltown] [--prof] [--play seconds: then profile live play with bots instead]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), ID = process.argv[2] || 'apex_full';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const PLAY = process.argv.includes('--play') ? +process.argv[process.argv.indexOf('--play') + 1] : 0;
const PROF = process.argv.includes('--prof') || PLAY > 0, cdp = PROF ? await p.context().newCDPSession(p) : null;
if (PROF && !PLAY) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
const r = await p.evaluate(async (id) => {
  const S = SF2.Settings.data; Object.assign(S.lobby, { map: SF2.MAPS.findIndex((m) => m.id === id), rule: 'tdm', allies: 1, enemies: 1 });
  const mb = () => Math.round(performance.memory.usedJSHeapSize / 1048576), def = SF2.MAPS[S.lobby.map], heap0 = mb();
  let t = performance.now(); if (def.preload) await def.preload(); const preloadMs = Math.round(performance.now() - t), heapPreload = mb();
  t = performance.now(); await app.startMatch();
  return { preloadMs, buildMs: Math.round(performance.now() - t - 1700), heap0, heapPreload, heapMB: mb(), programs: app.renderer.info.programs.length, materials: new Set((() => { const s = []; app.match.scene.traverse((o) => { if (o.material) s.push(o.material); }); return s; })()).size };
}, ID);
console.log(ID, r, errs.slice(0, 3));
if (PLAY) {
  await p.evaluate(() => { const S = SF2.Settings.data.lobby; S.allies = 5; S.enemies = 5; });
  await p.evaluate(async () => { app._teardownMatch(); await app.startMatch(); app.state = 'playing'; });
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  await p.waitForTimeout(PLAY * 1000);
  console.log('play', await p.evaluate(() => { const m = app.match; return { tick: m.prof && m.prof.snapshot().tick, kills: m.combatants.reduce((a, c) => a + c.kills, 0), made: m.collision.packed && m.collision.packed.made.size }; }));
}
if (PROF) { // --prof: self time per function over preload + build
  const { profile } = await cdp.send('Profiler.stop'), self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n])), dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame, k = `${f.functionName || '(anon)'} :${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
  console.table([...self].sort((a, c) => c[1] - a[1]).slice(0, 18).map(([fn, ms]) => ({ fn, ms: Math.round(ms) })));
}
await b.close(); srv.close();

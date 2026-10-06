// v46 Sky City: the turning leaf is solid; bots ride the trams while the bridge is up.   node tools/_skytest2.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = SF2.Settings.data, V = SF2.THREE.Vector3;
  Object.assign(S.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'skycity'), rule: 'tdm', allies: 4, enemies: 4 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match, mc = m.builder.mechs[0], P = m.player, out = {};
  await sleep(9000);
  // 1) lower the bridge, then raise it and run at the leaf from the roof: the player must be stopped, not fall
  mc.press(mc.controls[0], P); await sleep(4300);
  P.motor.teleport(new V(-9.2, 0.2, -3)); P.spawnProtect = 99; mc.press(mc.controls[0], P); await sleep(1500);
  const f = { x: 1 }; const t0 = performance.now(); let minY = 9;
  while (performance.now() - t0 < 2500) { P.motor.vel.x = 4; minY = Math.min(minY, P.motor.pos.y); await sleep(16); }
  out.leaf = { x: +P.motor.pos.x.toFixed(2), y: +P.motor.pos.y.toFixed(2), minY: +minY.toFixed(2), alive: P.alive, k: +mc.bridge.k.toFixed(2) };
  // 2) bots: bridge is up now; watch them for 70 s
  P.motor.teleport(new V(-24, 0.2, 0)); const seen = new Set(); let rides = 0, crossings = 0; const side0 = new Map(m.bots.map((bt) => [bt, Math.sign(bt.motor.pos.x)]));
  const log = []; for (let i = 0; i < 140; i++) { await sleep(500); for (const bt of m.bots) { if (bt.ai.state === 'RIDE') { seen.add(bt.name); const ph = bt.ai.ride.phase; const last = log.filter((l) => l[0] === bt.name).pop(); if (!last || last[1] !== ph) log.push([bt.name, ph, +bt.motor.pos.x.toFixed(1), +bt.motor.pos.z.toFixed(1), i / 2]); } else { const last = log.filter((l) => l[0] === bt.name).pop(); if (last && last[1] !== 'off') log.push([bt.name, 'off:' + bt.ai.state, +bt.motor.pos.x.toFixed(1), +bt.motor.pos.z.toFixed(1), i / 2, bt.alive]); } if (bt.alive && Math.sign(bt.motor.pos.x) !== side0.get(bt) && Math.abs(bt.motor.pos.x) > 8) { crossings++; side0.set(bt, Math.sign(bt.motor.pos.x)); } } }
  out.riders = [...seen]; out.log = log.slice(0, 40); out.crossings = crossings; out.tramP = mc.trams.map((t) => +t.p.toFixed(2)); out.deaths = m.bots.reduce((a, bt) => a + (bt.deaths || 0), 0);
  return out;
});
console.log(JSON.stringify(r), errs.slice(0, 4)); await b.close(); srv.close();

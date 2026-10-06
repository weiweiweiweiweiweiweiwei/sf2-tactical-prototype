// v46 Sky City mechanics test: bridge toggle, tram ride (the rider moves with the car), fall death, nav    node tools/_skytest.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const shot = async (n) => p.screenshot({ path: `tools/out/sky_${n}.jpg`, type: 'jpeg', quality: 85 });
const r = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = SF2.Settings.data, idx = SF2.MAPS.findIndex((m) => m.id === 'skycity');
  Object.assign(S.lobby, { map: idx, rule: 'tdm', allies: 2, enemies: 2 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match, mc = m.builder.mechs[0], P = m.player, out = { idx, nav: m.nav.valid.length, navOk: m.nav.nodes.filter((n) => n.ok).length };
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  await sleep(9000); // freeze
  // bridge: stand at the west GO box, press E
  P.motor.teleport(new SF2.THREE.Vector3(-13.3, 0.1, -1.5)); P.spawnProtect = 0; await sleep(300);
  out.promptBridge = mc.prompt(P); m.onInteract(); await sleep(4600); out.bridgeK = mc.bridge.k; out.navBridgeOk = mc.navBridge.filter((n) => n.ok).length;
  // walk onto the bridge middle → stands on it
  P.motor.teleport(new SF2.THREE.Vector3(-4, 0.2, 0.45)); await sleep(500); out.onBridgeY = +P.motor.pos.y.toFixed(2);
  // tram: the north car is parked at Alpha; step in, press E inside
  const t = mc.trams[0], kc = mc.controls.find((k) => k.inCar && k.t === t), q = mc.ctrlPos(kc); P.motor.teleport(new SF2.THREE.Vector3(q.x + (q.x < t.x ? 0.9 : -0.9), 0.2, q.z)); await sleep(400);
  out.promptCar = mc.prompt(P); out.x0 = +P.motor.pos.x.toFixed(2); m.onInteract(); await sleep(5600);
  out.midX = +P.motor.pos.x.toFixed(2); out.midY = +P.motor.pos.y.toFixed(2); out.tramX = +t.x.toFixed(2);
  return out;
});
await shot('ride');
const r2 = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), m = app.match, mc = m.builder.mechs[0], P = m.player, t = mc.trams[0];
  await sleep(7000); const o = { endX: +P.motor.pos.x.toFixed(2), tramEnd: +t.x.toFixed(2), alive1: P.alive };
  // fall: walk off the north edge
  P.motor.teleport(new SF2.THREE.Vector3(-18, 0.2, 0)); P.motor.pos.z = -13.6; P.motor.grounded = false; await sleep(2600); o.aliveAfterFall = P.alive; o.y = +P.motor.pos.y.toFixed(1);
  return o;
});
await p.evaluate(async () => { const m = app.match; m.player.alive || (m.player.respawnT = 0); await new Promise((r) => setTimeout(r, 4500)); const P = m.player; P.yaw = -Math.PI / 2 + 0.25; P.pitch = -0.08; });
await shot('view');
await p.evaluate(async () => { const mc = app.match.builder.mechs[0], t = mc.trams[1]; if (t.p > 0.5) mc.press(mc.controls.find((k) => k.t === t && k.station === -1), app.match.player); await new Promise((r) => setTimeout(r, 9500)); });
const views = [['tower', -24, -8, -2.36, 0.15], ['clock', -12, -10, Math.PI, 0.3], ['go', -14.6, -1.4, -Math.PI / 2, -0.35], ['bridge', -17, 0.4, -Math.PI / 2, -0.02], ['tram', -14, -9, 0, -0.03],
  ['hutdoor', -15.1, -10.5, Math.PI, 0], ['hutin', -15.1, -5.6, Math.PI, 0], ['winchside', -11.6, 11.2, 0, -0.1], ['strawcar', -21.575, 5.5, Math.PI, -0.05], ['chasm', -12.4, -0.3, -Math.PI / 2, 0.02], ['chasm2', 3, 0.45, Math.PI / 2, 0.1], ['east', 24, 6, Math.PI / 2, -0.06], ['hutwin', 15.4, -4.9, Math.PI / 2, 0], ['ncarB', 18.2, -3.5, 0, -0.02]];
for (const [n, x, z, yaw, pitch] of views) {
  await p.evaluate(async ([x, z, yaw, pitch]) => { const P = app.match.player; if (!P.alive) { P.respawnT = 0; await new Promise((r) => setTimeout(r, 4000)); } P.motor.teleport(new SF2.THREE.Vector3(x, 0.2, z)); P.yaw = yaw; P.pitch = pitch; P.spawnProtect = 9; await new Promise((r) => setTimeout(r, 900)); }, [x, z, yaw, pitch]);
  await shot(n);
}
console.log(r, r2, errs.slice(0, 6)); await b.close(); srv.close();

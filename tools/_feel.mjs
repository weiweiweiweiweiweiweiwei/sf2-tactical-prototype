// v25 regression probe: drives the real input path (InputManager callbacks) with a scripted sequence while stepping the match
// at a fixed 1/60 s, and logs every shot / throw / reload / position sample. Run it on two builds and compare.
// usage: node tools/_feel.mjs [file=index.html] [json-out]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [file = 'index.html', out = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
p.on('pageerror', (e) => errs.push('uncaught: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/${file}`); await p.waitForFunction(() => window.app && window.SF2);
const res = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'low'; S.adsMode = 'toggle'; S.hipMode = 'precise';
  S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' }; S.loadouts[1] = { name: 'B', primary: 'cheytac_m200', secondary: 'deagle' };
  Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 1, enemies: 1, loadout: 0 });
  await app.startMatch();
  app.loop = () => {}; // stop the rAF loop: this probe steps the match itself
  const M = app.match, inp = app.input, P = M.player, log = [];
  for (const bt of M.bots) { bt.alive = false; bt.respawnT = 1e9; bt.model.root.visible = false; }
  app.state = 'playing'; inp.locked = true; M.phase = 'live'; M.freezeT = 0; P.spawnProtect = 0;
  const fb = M.fireBullet.bind(M); M.fireBullet = (sh, o, d, def, opts) => { if (sh === P && !(opts && opts.pellet > 0)) log.push({ t: +M.time.toFixed(4), ev: 'shot', w: def.id, d: [+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)] }); return fb(sh, o, d, def, opts); };
  const tg = M.throwGrenade.bind(M); M.throwGrenade = (o, def, pos, vel) => { log.push({ t: +M.time.toFixed(4), ev: 'throw', w: def.id, v: +vel.length().toFixed(2) }); return tg(o, def, pos, vel); };
  const step = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { M.tick(1 / 60, { x: 0, y: 0 }); if (app.post) {} inp.endFrame(); } };
  const keyDown = (c) => { inp.keys.add(c); inp.onKey(c); }, keyUp = (c) => { inp.keys.delete(c); if (inp.onKeyUp) inp.onKeyUp(c); };
  const btn = (i, down) => { inp.buttons[i] = down; inp.onButton(i, down); };
  const tap = (c) => { keyDown(c); step(1 / 60); keyUp(c); };
  const W = () => M.weapons.current;
  const mark = (ev, extra = {}) => log.push({ t: +M.time.toFixed(4), ev, w: W().def.id, ammo: W().ammo, res: W().reserveAmmo, pos: [+P.motor.pos.x.toFixed(3), +P.motor.pos.y.toFixed(3), +P.motor.pos.z.toFixed(3)], ...extra });
  P.yaw = 0; P.pitch = 0; step(0.3); mark('start');
  // A: auto fire 1.5 s
  btn(0, true); step(1.5); btn(0, false); step(0.3); mark('autoDone');
  // C: reload
  tap('KeyR'); mark('reloadStart'); let rt = 0; while (W().reloading && rt < 6) { step(1 / 60); rt += 1 / 60; } mark('reloadDone', { reloadSec: +rt.toFixed(3) });
  // B: pistol spam-clicks every 50 ms for 1 s
  tap('Digit2'); step(0.4); for (let i = 0; i < 20; i++) { btn(0, true); step(1 / 60); btn(0, false); step(2 / 60); } step(0.3); mark('pistolDone');
  // D: movement
  tap('Digit1'); step(0.4); const x0 = P.motor.pos.clone(); keyDown('KeyW'); step(1); keyUp('KeyW'); step(0.4); mark('walk', { dist: +P.motor.pos.distanceTo(x0).toFixed(3) });
  P.yaw = Math.PI; step(0.1); const x1 = P.motor.pos.clone(); keyDown('ShiftLeft'); keyDown('KeyW'); step(1); keyUp('KeyW'); keyUp('ShiftLeft'); step(0.4); mark('sprint', { dist: +P.motor.pos.distanceTo(x1).toFixed(3) });
  let ymax = P.motor.pos.y; const y0 = ymax; tap('Space'); for (let i = 0; i < 60; i++) { step(1 / 60); ymax = Math.max(ymax, P.motor.pos.y); } mark('jump', { height: +(ymax - y0).toFixed(3) });
  // E: sniper — loadout B now, ADS, settle, fire
  M.queueLoadout(1); P.respawn(P.motor.pos.clone(), 0); step(0.5); mark('sniperDrawn');
  btn(2, true); btn(2, false); step(0.6); mark('scoped', { scopedIn: M.weapons.scopedIn, ads: M.weapons.ads });
  btn(0, true); step(1 / 60); btn(0, false); step(1.5); mark('sniperAfter', { scopedIn: M.weapons.scopedIn });
  // F: knife slash + stab
  tap('Digit3'); step(0.4); btn(0, true); step(1 / 60); btn(0, false); step(0.5); btn(2, true); step(1 / 60); btn(2, false); step(0.8); mark('knifeDone', { cd: +W().cooldown.toFixed(3) });
  // G: grenade — hold 0.6 s, release
  tap('Digit4'); step(0.4); btn(0, true); step(0.6); btn(0, false); step(1.2); mark('nadeDone', { count: W().count });
  return { log, gpu: app.gpuName };
});
const shots = res.log.filter((e) => e.ev === 'shot'), marks = res.log.filter((e) => e.ev !== 'shot');
const byW = {}; for (const s of shots) (byW[s.w] = byW[s.w] || []).push(s.t);
console.log('shots per weapon:', JSON.stringify(Object.fromEntries(Object.entries(byW).map(([k, v]) => [k, v.length]))));
for (const [k, v] of Object.entries(byW)) console.log(' ', k, 'intervals ms:', v.slice(1).map((t, i) => Math.round((t - v[i]) * 1000)).join(' '));
for (const m of marks) console.log(JSON.stringify(m));
if (errs.length) console.log('ERRORS', errs.slice(0, 6));
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await b.close(); srv.close();

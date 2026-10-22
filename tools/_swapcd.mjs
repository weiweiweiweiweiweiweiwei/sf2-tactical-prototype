// Weapon-swap state probe: does switching weapons reset fire cooldowns, break trigger handling, or lose/create ammo?
// Drives the real input path (InputManager callbacks → CmdBuilder → Arsenal.tick) one fixed step (1/120 s) at a time and
// counts real shots at Match.fireBullet. With `net`, a second tab joins over the loopback transport and the host's replay
// of the friend's commands is compared shot by shot with the friend's own prediction.
// usage: node tools/_swapcd.mjs [file=index.html] [net]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const args = process.argv.slice(2), NET = args.includes('net'), file = args.find((a) => a !== 'net') || 'index.html';
const base = `http://127.0.0.1:${srv.address().port}/${file}`;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), errs = [];
const watch = (pg, k) => { pg.on('pageerror', (e) => errs.push(`${k} uncaught: ${e.message}`)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${k}: ${m.text()}`); }); };
let failed = 0;
const report = (name, expect, actual, pass, where) => { if (!pass) failed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expect}\n      actual:   ${actual}\n      code:     ${where}`); };

// ------------------------------------------------------------------ single-player, fixed-step tests
const P1 = await ctx.newPage(); watch(P1, 'solo');
await P1.goto(base); await P1.waitForFunction(() => window.app && window.SF2);
const R = await P1.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'low'; S.adsMode = 'toggle'; S.hipMode = 'precise';
  S.loadouts[0] = { name: 'A', primary: 'cheytac_m200', secondary: 'deagle' };
  S.loadouts[1] = { name: 'B', primary: 'remington870', secondary: 'p226' };
  S.loadouts[2] = { name: 'C', primary: 'm4a1', secondary: 'p226' };
  Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 1, enemies: 1, loadout: 0 });
  await app.startMatch();
  app.loop = () => {}; // this probe steps the match itself
  const M = app.match, inp = app.input, P = M.player, A = M.weapons, out = {};
  for (const bt of M.bots) { bt.alive = false; bt.respawnT = 1e9; bt.model.root.visible = false; }
  app.state = 'playing'; inp.locked = true; M.phase = 'live'; M.freezeT = 0; P.spawnProtect = 0;
  const shots = [];
  // per shot: spread cone radius (Weapon._cone), spray-pattern index (Weapon.shots after fire) and camera recoil (Player.recoilPitch)
  let WP = Object.getPrototypeOf(A.current); while (!Object.prototype.hasOwnProperty.call(WP, '_cone')) WP = Object.getPrototypeOf(WP);
  let cone = null; const c0 = WP._cone, f0 = WP.fire;
  WP._cone = function (ray, s, out, R) { if (this.owner === P) cone = { s, rp: P.recoilPitch }; return c0.call(this, ray, s, out, R); };
  WP.fire = function (ws) { const ok = f0.call(this, ws); if (ok && this.owner === P && shots.length) shots[shots.length - 1].kick = this.shots; return ok; };
  const fb = M.fireBullet.bind(M);
  M.fireBullet = (sh, o, d, def, opts) => { if (sh === P && !(opts && opts.pellet > 0)) shots.push({ clk: +A.clock.toFixed(5), w: def.id, s: cone ? +cone.s.toFixed(5) : null, rp: cone ? +cone.rp.toFixed(5) : null }); return fb(sh, o, d, def, opts); };
  const H = 1 / 120 + 1e-9;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { M.tick(H, { x: 0, y: 0 }); inp.endFrame(); } };
  const keyDown = (c) => { inp.keys.add(c); inp.onKey(c); }, keyUp = (c) => { inp.keys.delete(c); if (inp.onKeyUp) inp.onKeyUp(c); };
  const btn = (down) => { inp.buttons[0] = down; inp.onButton(0, down); };
  const tap = (c) => { keyDown(c); step(1); keyUp(c); };
  const click = () => { btn(true); step(1); btn(false); };
  const W = () => A.current;
  const kit = (k) => { M.queueLoadout(k); P.respawn(P.motor.pos.clone(), 0); P.spawnProtect = 0; step(60); shots.length = 0; };
  // fire once, then click every 2 ticks until a second shot lands (or `limit` s); optional swap-out-and-back right after shot 1
  // (a gap tick between the two Q taps: latched edges in back-to-back commands read as one held press, see the report)
  const swapBack = () => { tap('KeyQ'); step(1); tap('KeyQ'); step(1); };
  const secondShot = (swap, limit) => {
    const id = W().def.id, interval = W().def.interval;
    click(); const t0 = shots.length ? shots[0].clk : null;
    if (swap) swapBack();
    const same = () => shots.filter((s) => s.w === id), end = A.clock + limit;
    while (same().length < 2 && A.clock < end) { click(); step(1); }
    const s = same();
    return { w: id, first: t0, gapMs: s.length >= 2 ? Math.round((s[1].clk - s[0].clk) * 1000) : null, backOn: W().def.id, interval };
  };

  // T1 bolt-action sniper
  kit(0); out.t1base = secondShot(false, 2.5);
  kit(0); out.t1swap = secondShot(true, 2.5);
  // T2 pump shotgun
  kit(1); out.t2base = secondShot(false, 2.0);
  kit(1); out.t2swap = secondShot(true, 2.0);
  // T2b semi-auto pistol (Desert Eagle is the secondary of kit 0)
  kit(0); tap('Digit2'); step(60); shots.length = 0; out.t2bbase = secondShot(false, 1.0);
  kit(0); tap('Digit2'); step(60); shots.length = 0; out.t2bswap = secondShot(true, 1.0);
  // T3 rate: 1 s of fire-then-QQ cycles on the M4 vs 1 s of held auto fire
  kit(2); btn(true); step(120); btn(false); out.t3hold = shots.length;
  kit(2); { const end = A.clock + 1; while (A.clock < end) { click(); swapBack(); } } out.t3swap = shots.filter((s) => s.w === 'm4a1').length;
  // T3d double Q in back-to-back ticks (8 ms apart): how many swaps register
  kit(2); { const i0 = A.index; tap('KeyQ'); tap('KeyQ'); out.t3d = { startIndex: i0, endIndex: A.index }; }
  // T3a hold the trigger on the auto M4, switch to the semi P226 while still holding
  kit(2); btn(true); step(30); const n0 = shots.length; tap('Digit2'); step(60); out.t3a = { m4Before: n0, pistolWhileHeld: shots.filter((s) => s.w === 'p226').length }; btn(false); step(5);
  click(); out.t3a.pistolAfterRepress = shots.filter((s) => s.w === 'p226').length;
  // T3b hold the trigger on the semi P226, switch to the auto M4 while still holding
  kit(2); tap('Digit2'); step(60); shots.length = 0; btn(true); step(1); tap('Digit1'); step(30); btn(false);
  out.t3b = { p226: shots.filter((s) => s.w === 'p226').length, m4WhileHeld: shots.filter((s) => s.w === 'm4a1').length };
  // T3c switch and press in the same tick
  kit(2); { keyDown('Digit2'); btn(true); const c0 = A.clock; step(1); keyUp('Digit2'); btn(false); out.t3c = { shots: shots.map((s) => s.w), sameTick: shots.length ? Math.abs(shots[0].clk - (c0 + 1 / 120)) < 1e-4 : false }; }
  // T4 interrupted magazine reload: ammo + reserve must be conserved, the mag not refilled
  kit(2); for (let i = 0; i < 10; i++) { click(); step(12); }
  { const w = W(), tot0 = w.ammo + w.reserveAmmo, a0 = w.ammo, r0 = w.reserveAmmo; tap('KeyR'); step(Math.round(w.reloadTime * 120 * 0.5)); const mid = w.reloading;
    swapBack(); const after = { ammo: w.ammo, res: w.reserveAmmo, reloading: w.reloading };
    tap('KeyR'); step(Math.round(w.reloadTime * 120) + 5);
    out.t4 = { a0, r0, midReloading: mid, afterSwap: after, afterFull: { ammo: w.ammo, res: w.reserveAmmo }, conserved: w.ammo + w.reserveAmmo === tot0 }; }
  // T4b interrupted shell-by-shell reload (870): shells already loaded stay, nothing appears from nowhere
  kit(1); for (let i = 0; i < 4; i++) { click(); step(130); }
  { const w = W(), tot0 = w.ammo + w.reserveAmmo, a0 = w.ammo; tap('KeyR'); step(Math.round((w.def.shellReload * 0.6 + w.def.shellReload * 1.5) * 120));
    const mid = { ammo: w.ammo, res: w.reserveAmmo }; swapBack(); out.t4b = { a0, mid, afterSwap: { ammo: w.ammo, res: w.reserveAmmo, reloading: w.reloading }, conserved: w.ammo + w.reserveAmmo === tot0 }; }
  // R recoil / spray state across a swap (M4): R1 the 9th shot of a held spray; R2 spray 8, Q-Q, fire; R3 spray 8, wait 1 s,
  // fire; R4 spray 8, Q, wait 1 s holstered, Q, fire
  const spray8 = () => { btn(true); while (shots.length < 8) step(1); btn(false); };
  const pick = (s) => (s ? { s: s.s, kick: s.kick, rp: s.rp } : null);
  kit(2); btn(true); while (shots.length < 9) step(1); btn(false); out.r1 = { s8: pick(shots[7]), s9: pick(shots[8]) };
  kit(2); spray8(); swapBack(); while (shots.length < 9) { click(); step(1); } out.r2 = pick(shots[8]);
  kit(2); spray8(); step(120); click(); out.r3 = pick(shots[8]);
  kit(2); spray8(); tap('KeyQ'); step(120); tap('KeyQ'); step(1); click(); out.r4 = pick(shots[8]);
  return out;
});

const g = (o) => JSON.stringify(o);
report('T1 bolt sniper: second shot without swapping', `gap ≥ ${R.t1base.interval * 1000} ms`, g(R.t1base), R.t1base.gapMs >= R.t1base.interval * 1000 - 9, '10_weapons.js:100 (cooldown = interval)');
report('T1 bolt sniper: fire → Q → Q → fire', `gap ≥ ${R.t1swap.interval * 1000} ms (swap must not skip the bolt)`, g(R.t1swap), R.t1swap.gapMs === null || R.t1swap.gapMs >= R.t1swap.interval * 1000 - 9, '10_weapons.js:23 equip() → cooldown = 0; 11_weaponsystem.js:58 switchTo');
report('T2 pump shotgun: second shot without swapping', `gap ≥ ${R.t2base.interval * 1000} ms`, g(R.t2base), R.t2base.gapMs >= R.t2base.interval * 1000 - 9, '10_weapons.js:100');
report('T2 pump shotgun: fire → Q → Q → fire', `gap ≥ ${R.t2swap.interval * 1000} ms`, g(R.t2swap), R.t2swap.gapMs === null || R.t2swap.gapMs >= R.t2swap.interval * 1000 - 9, '10_weapons.js:23; 10_weapons.js:218 Shotgun.equip');
report('T2b semi pistol: fire → Q → Q → fire', `gap ≥ ${R.t2bswap.interval * 1000} ms`, g(R.t2bswap) + ' base ' + g(R.t2bbase), R.t2bswap.gapMs === null || R.t2bswap.gapMs >= R.t2bswap.interval * 1000 - 9, '10_weapons.js:23');
report('T3 M4 shots in 1 s: fire-Q-Q cycles vs holding', `swap cycles ≤ held fire (${R.t3hold}) + 1`, `held ${R.t3hold}, swap-cycling ${R.t3swap}`, R.t3swap <= R.t3hold + 1, '10_weapons.js:23; 11_weaponsystem.js:128-140');
report('T3a hold trigger on auto M4, switch to semi P226', 'P226 fires 0 while held, 1 after a new press', g(R.t3a), R.t3a.pistolWhileHeld === 0 && R.t3a.pistolAfterRepress === 1, '11_weaponsystem.js:140 (semi needs a press edge)');
report('T3b hold trigger on semi P226, switch to auto M4', 'P226 1 shot; M4 keeps firing while held (held trigger drives auto guns)', g(R.t3b), R.t3b.p226 === 1 && R.t3b.m4WhileHeld > 0, '11_weaponsystem.js:138, 148-150');
report('T3d two Q taps in back-to-back ticks (informational)', 'documents current behaviour only', g(R.t3d) + (R.t3d.startIndex === R.t3d.endIndex ? ' → both swaps registered' : ' → second tap merged into the first (latched edge seen as held)'), true, '12b_cmd.js:38 latched bits; 11_weaponsystem.js:125 pressed = btn & ~prevBtn');
report('T3c switch + press in the same tick', 'one P226 shot, in that same tick (instant swap kept)', g(R.t3c), R.t3c.shots.length === 1 && R.t3c.shots[0] === 'p226' && R.t3c.sameTick, '11_weaponsystem.js:128 then 140');
report('T4 swap during a magazine reload', 'reload cancelled, ammo/reserve unchanged; a later full reload conserves the total', g(R.t4), R.t4.midReloading && !R.t4.afterSwap.reloading && R.t4.afterSwap.ammo === R.t4.a0 && R.t4.afterSwap.res === R.t4.r0 && R.t4.conserved, '10_weapons.js:28 holster(); 10_weapons.js:166-171');
report('T4b swap during a shell reload', 'loaded shells kept, total conserved', g(R.t4b), R.t4b.afterSwap.ammo === R.t4b.mid.ammo && R.t4b.conserved && !R.t4b.afterSwap.reloading, '10_weapons.js:242-249');

{
  const r9 = R.r1.s9;
  report('R1 baseline: 9th shot of a held M4 spray', 'spread > 0, spray index 9, camera kicked up', g(R.r1), r9.s > 0 && r9.kick === 9 && r9.rp > 0, '10_weapons.js:44-52 spread, 66-72 recoilKick; 12_player.js:184 addRecoil');
  report('R2 spray 8 → Q → Q → fire', `close to R1's 9th shot: spread ≥ 80% (${(r9.s * 0.8).toFixed(4)}), spray index continues (9), camera offset ≥ 50% (${(r9.rp * 0.5).toFixed(4)})`, g(R.r2),
    R.r2 && R.r2.s >= r9.s * 0.8 && R.r2.kick === 9 && R.r2.rp >= r9.rp * 0.5, '10_weapons.js:23 equip() resets cur/bloom/shots; 11_weaponsystem.js:64 resetRecoil()');
  report('R3 spray 8 → wait 1 s → fire (no swap)', 'fully recovered: spread 0, spray index 1, camera offset < 5% of R1', g(R.r3), R.r3 && R.r3.s === 0 && R.r3.kick === 1 && Math.abs(R.r3.rp) < r9.rp * 0.05, '10_weapons.js:143-145 recovery; 12_player.js:191 recoil decay');
  report('R4 spray 8 → Q → wait 1 s → Q → fire', 'same as R3 (recovery continues while holstered, nothing kept forever)', g(R.r4), R.r4 && R.r4.s === 0 && R.r4.kick === 1 && Math.abs(R.r4.rp) < r9.rp * 0.05, 'holstered recovery');
}

// ------------------------------------------------------------------ K real keyboard: Q, release, Q again (Playwright key events)
{
  const K = await ctx.newPage(); watch(K, 'keys');
  await K.goto(base); await K.waitForFunction(() => window.app && window.SF2);
  await K.evaluate(async () => {
    const S = SF2.Settings.data; S.quality = 'low'; S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' };
    Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 1, enemies: 1, loadout: 0 });
    await app.startMatch();
    const M = app.match, A = M.weapons, inp = app.input;
    for (const bt of M.bots) { bt.alive = false; bt.respawnT = 1e9; }
    app.state = 'playing'; inp.locked = true; M.phase = 'live'; M.freezeT = 0;
    // count each layer: DOM key events reaching InputManager, commands carrying the QUICK bit, Arsenal swaps
    window.__k = { dom: 0, cmd: 0, swaps: 0 };
    const ok = inp.onKey; inp.onKey = (code, e) => { if (code === 'KeyQ') window.__k.dom++; return ok(code, e); };
    const ob = app.cmds.build.bind(app.cmds); app.cmds.build = (...a) => { const c = ob(...a); if (c.btn & 512) window.__k.cmd++; return c; };
    const os = A.switchTo.bind(A); A.switchTo = (i) => { const before = A.index; os(i); if (A.index !== before) window.__k.swaps++; };
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // (a) real time, the game's own rAF loop: tap Q (held 30 ms), release, tap again after `gap` ms
  const rt = [];
  for (const gap of [10, 25, 50, 100]) {
    await K.evaluate(() => { window.__k = { dom: 0, cmd: 0, swaps: 0 }; });
    await K.keyboard.down('KeyQ'); await wait(30); await K.keyboard.up('KeyQ'); await wait(gap);
    await K.keyboard.down('KeyQ'); await wait(30); await K.keyboard.up('KeyQ'); await wait(150);
    rt.push({ gap, ...(await K.evaluate(() => window.__k)), fps: await K.evaluate(() => Math.round(app.fps || 0)) });
  }
  report('K1 real keyboard, real-time loop: two Q taps', 'every layer sees 2 (DOM events, QUICK commands, swaps)', g(rt), rt.every((r) => r.dom === 2 && r.cmd === 2 && r.swaps === 2), '08_nav_input.js:208-214 keydown; 12b_cmd.js:24,38 latch; 11_weaponsystem.js:125,129');
  // (b) frozen loop, one fixed step at a time between real key events: second tap 0 / 1 / 2 / 3 ticks after the first
  await K.evaluate(() => { app.loop = () => {}; });
  const tk = [];
  for (const gapTicks of [0, 1, 2, 3]) {
    await K.evaluate(() => { window.__k = { dom: 0, cmd: 0, swaps: 0 }; });
    const step = (n) => K.evaluate((n) => { for (let i = 0; i < n; i++) { app.match.tick(1 / 120 + 1e-9, { x: 0, y: 0 }); app.input.endFrame(); } }, n);
    await K.keyboard.press('KeyQ'); if (gapTicks) await step(gapTicks); await K.keyboard.press('KeyQ'); await step(4);
    tk.push({ gapTicks, gapMs: +(gapTicks * 1000 / 120).toFixed(1), ...(await K.evaluate(() => window.__k)) });
  }
  report('K2 real keyboard, stepped: second Q 0-3 fixed ticks after the first (informational)', 'documents where taps merge', g(tk), true, '12b_cmd.js:38; 11_weaponsystem.js:125');
  await K.close();
}

// ------------------------------------------------------------------ T5 host replay vs the friend's prediction
if (NET) {
  const net = '&lag=40&jitter=10&loss=0';
  const HP = await ctx.newPage(), CP = await ctx.newPage(); watch(HP, 'host'); watch(CP, 'client');
  const setup = (nick) => { const S = SF2.Settings.data; S.nick = nick; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 1, enemies: 1, loadout: 0 }); S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'deagle' }; SF2.Settings.save(); }; // saved: the friend's tab (same profile) loads the same kit
  await HP.goto(`${base}?host=sw1${net}`); await HP.waitForFunction(() => window.app && window.SF2); await HP.evaluate(setup, 'Host');
  await HP.evaluate(async () => { await app.startMatch(); app.state = 'playing'; app.input.locked = true; app.match.player.spawnProtect = 0; for (const bt of app.match.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; } });
  await CP.goto(`${base}?join=sw1&name=Tester&team=bravo${net}`);
  await CP.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
  await CP.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
  await new Promise((r) => setTimeout(r, 1500));
  // log every shot by the friend: on his tab with the command sequence that fired it, on the host with the replayed sequence
  await CP.evaluate(() => { const m = app.match, p = m.player; window.__s = []; const fb = m.fireBullet.bind(m); m.fireBullet = (sh, o, d, def, opts) => { if (sh === p && !(opts && opts.pellet > 0)) window.__s.push({ seq: app.cmds.seq, w: def.id, d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) }); return fb(sh, o, d, def, opts); }; });
  await HP.evaluate(() => { const m = app.match; window.__s = []; const fb = m.fireBullet.bind(m); m.fireBullet = (sh, o, d, def, opts) => { if (sh.isNet && !(opts && opts.pellet > 0)) window.__s.push({ seq: sh.curSeq, w: def.id, d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) }); return fb(sh, o, d, def, opts); }; });
  // the friend (real time, rAF-driven), three rounds of: M4 spray 0.4 s → Q → Q → click spam 0.4 s (spread / recoil carried
  // over the swap), then Q to the Deagle → click → Q → Q → click spam 0.5 s (semi-auto cooldown over the swap) → Q back
  await CP.evaluate(async () => {
    const inp = app.input, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const hold = async (ms) => { inp.buttons[0] = true; inp.onButton(0, true); await wait(ms); inp.buttons[0] = false; inp.onButton(0, false); await wait(15); };
    const click = () => hold(25);
    const q = async () => { inp.onKey('KeyQ'); await wait(30); };
    const spam = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) await click(); };
    for (let k = 0; k < 3; k++) { await hold(400); await q(); await q(); await spam(400); await wait(700); await q(); await click(); await q(); await q(); await spam(500); await q(); await wait(400); }
  });
  await new Promise((r) => setTimeout(r, 1200));
  const cs = await CP.evaluate(() => window.__s), hs = await HP.evaluate(() => window.__s);
  const key = (s) => `${s.seq}:${s.w}`, hk = new Set(hs.map(key)), ck = new Set(cs.map(key));
  const onlyC = cs.filter((s) => !hk.has(key(s))), onlyH = hs.filter((s) => !ck.has(key(s)));
  const dirMismatch = cs.filter((s) => { const h = hs.find((x) => key(x) === key(s)); return h && h.d.some((v, i) => Math.abs(v - s.d[i]) > 0.002); });
  const gaps = (l) => l.filter((s) => s.w === 'deagle').map((s) => s.seq).map((q, i, a) => (i ? q - a[i - 1] : null)).filter((x) => x !== null);
  report('T5 host replay vs friend prediction (M4 spray-swap + Deagle fire-Q-Q spam)', 'same shots (command seq + weapon) and directions (spread + recoil included) on both sides; Deagle gaps ≥ 35 cmds (0.3 s)',
    `friend ${cs.length} shots ${g(Object.fromEntries([...new Set(cs.map((s) => s.w))].map((w) => [w, cs.filter((s) => s.w === w).length])))}, host ${hs.length}; only-friend ${g(onlyC.map(key))}; only-host ${g(onlyH.map(key))}; direction mismatches ${dirMismatch.length}; friend Deagle gaps (cmds) ${g(gaps(cs))}; host ${g(gaps(hs))}`,
    cs.length > 0 && onlyC.length === 0 && onlyH.length === 0 && dirMismatch.length === 0 && gaps(cs).every((x) => x >= 35), '13b_netplayers.js:59 arsenal.tick(h, cmd); 11_weaponsystem.js:124');
  // ghosts: the host tab and the friend tab should show the same gun on the friend / his ghost after the last swap
  const hw = await HP.evaluate(() => app.match.humans[0].arsenal.current.def.id), cw = await CP.evaluate(() => app.match.weapons.current.def.id);
  report('T5b current weapon after the swaps', 'friend tab and host agree', `friend ${cw}, host ${hw}`, hw === cw, '18_net.js:96 netEntity w; 13b_netplayers.js:116');
}
if (errs.length) console.log('ERRORS', errs.slice(0, 8));
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
await b.close(); srv.close();

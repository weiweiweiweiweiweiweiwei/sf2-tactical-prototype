// v30: grenades + dropped guns online (loopback, 60 ms ± 10, 2 % loss).
// node tools/_gear.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, net = '&lag=60&jitter=10&loss=0.02', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, what, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${extra ? '  · ' + extra : ''}`); if (!c) fails++; };
const wait = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage(), errs = [];
for (const [p, k] of [[H, 'H'], [C, 'C']]) p.on('pageerror', (e) => errs.push(k + ' ' + e.message));
await H.goto(`${base}?host=gear${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 2, enemies: 2, loadout: 0 }); S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' }; await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
await C.goto(`${base}?join=gear&name=Friend&team=bravo${net}`);
await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.input.locked = true; const S = SF2.Settings.data; S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' }; window.__fx = { he: 0, smoke: 0 }; const e = app.match.effects, ex = e.explosion.bind(e), sm = e.spawnSmoke.bind(e); e.explosion = (p) => { window.__fx.he++; return ex(p); }; e.spawnSmoke = (p, d) => { window.__fx.smoke++; return sm(p, d); }; });
await H.evaluate(() => { const m = app.match; m.phase = 'live'; m.freezeT = 0; for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishX = bt.ai.wishZ = bt.ai.wishSpeed = 0; } });
await sleep(1200);

// 1. the host throws an HE grenade: the friend sees it fly, then explode where it landed on the host
await H.evaluate(() => { const m = app.match, p = m.player, V = SF2.THREE.Vector3; m.throwGrenade(p, SF2.WEAPON_DEFS.he, p.eyePos(new V()), new V(0, 4, -6)); });
ok(await wait(C, () => app.match.grenades.some((g) => g.remote)), "friend sees the host's grenade in the air");
ok(await wait(C, () => window.__fx.he === 1 && !app.match.grenades.some((g) => g.remote), null, 8000), 'friend sees it explode (once)');

// 2. the friend throws a smoke (his weapon slot) → the host's simulation throws it too; the friend's own copy goes off locally only
await C.evaluate(async () => { const m = app.match, ws = m.weapons, i = ws.weapons.findIndex((w) => w.def.id === 'smoke'); app.cmds.switchTo(i); await new Promise((r) => setTimeout(r, 900)); app.input.buttons[0] = true; app.input.onButton(0, true); await new Promise((r) => setTimeout(r, 450)); app.input.buttons[0] = false; app.input.onButton(0, false); });
ok(await wait(H, () => app.match.grenades.some((g) => g.def.id === 'smoke' && g.owner.isNet), null, 5000), "host simulates the friend's smoke");
ok(await wait(H, () => app.match.effects.smokes.length === 1, null, 8000), 'smoke cloud on the host');
ok(await wait(C, () => window.__fx.smoke === 1, null, 8000), 'smoke cloud on the friend (his own, just once)');

// 3. a bot dies → its gun drops on both screens (same id)
const drop = await H.evaluate(() => { const m = app.match, n = m.humans[0], bot = m.bots.find((x) => x.team === 'alpha'); bot.motor.teleport(n.motor.pos.clone().add(new SF2.THREE.Vector3(1.2, 0, 0))); bot.spawnProtect = 0; bot.setWeapon && bot.setWeapon('ak47'); m.applyDamage(bot, 999, 'chest', n, SF2.WEAPON_DEFS.m4a1, new SF2.THREE.Vector3(1, 0, 0), bot.motor.pos.clone()); const d = m.drops[m.drops.length - 1]; return d ? { id: d.id, gun: d.def.id } : null; });
ok(!!drop && (await wait(C, (id) => app.match.drops.some((d) => d.id === id), drop && drop.id)), 'the bot\'s gun drops on the friend\'s screen too', JSON.stringify(drop));
await sleep(3800); // settled: the host's pose updates (first 3 s) have arrived
const at = { h: await H.evaluate((id) => { const b = app.match.drops.find((x) => x.id === id).body; return [b.position.x, b.position.z]; }, drop.id), c: await C.evaluate((id) => { const b = app.match.drops.find((x) => x.id === id).body; return [b.position.x, b.position.z]; }, drop.id) };
const gap = Math.hypot(at.h[0] - at.c[0], at.h[1] - at.c[1]); ok(gap < 0.15, 'the gun lies at the same spot on both screens', gap.toFixed(3) + ' m apart');
await H.evaluate((id) => { const m = app.match, d = m.drops.find((x) => x.id === id), n = m.humans[0]; if (d) n.motor.teleport(m.nav.snap(new SF2.THREE.Vector3(d.body.position.x + 0.8, d.body.position.y, d.body.position.z))); }, drop && drop.id);
await sleep(1200); // reconciliation brings the friend there

// 4. the friend presses E next to it → the host swaps his primary, both screens agree, his old gun falls down
const prompt = await C.evaluate(() => app.match.pickTarget ? app.match.pickTarget.def.id : null);
if (process.env.DEBUG) console.log('debug', JSON.stringify({ c: await C.evaluate((id) => { const m = app.match, d = m.drops.find((x) => x.id === id); return { me: m.player.motor.pos.toArray().map((v) => +v.toFixed(2)), drop: d ? [d.body.position.x, d.body.position.y, d.body.position.z].map((v) => +v.toFixed(2)) : null, slot: d && m.weapons.slotIndex(d.def.slot), alive: m.player.alive, canMove: m.canMove(), phase: m.phase }; }, drop && drop.id),
  h: await H.evaluate((id) => { const m = app.match, d = m.drops.find((x) => x.id === id); return { np: m.humans[0].motor.pos.toArray().map((v) => +v.toFixed(2)), drop: d ? [d.body.position.x, d.body.position.y, d.body.position.z].map((v) => +v.toFixed(2)) : null }; }, drop && drop.id) }));
await C.evaluate(() => { const m = app.match, d = m.pickTarget; if (d) { const p = m.player; p.yaw = Math.atan2(-(d.body.position.x - p.motor.pos.x), -(d.body.position.z - p.motor.pos.z)); } app.input.onKey('KeyE'); });
ok(await wait(H, (gun) => app.match.humans[0].arsenal.weapons.some((w) => w.def.id === gun), drop && drop.gun), 'host: the friend now carries the bot\'s gun', `prompt on the friend: ${prompt}`);
ok(await wait(C, (gun) => app.match.weapons.weapons.some((w) => w.def.id === gun), drop && drop.gun), "friend's own weapons updated");
ok(await wait(C, (id) => !app.match.drops.some((d) => d.id === id), drop && drop.id), 'the picked gun is gone from the friend\'s ground');
ok(await wait(C, () => app.match.drops.some((d) => d.def.id === 'm4a1')), 'his old M4A1 lies on the ground (seen by him)');

if (errs.length) console.log('ERRORS', errs.slice(0, 8));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); srv.close();

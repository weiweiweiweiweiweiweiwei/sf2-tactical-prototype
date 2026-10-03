// v25 two-tab network test: one page hosts, one joins over the loopback transport (BroadcastChannel) with simulated
// latency / jitter / loss, then the test drives both and checks movement agreement, hit registration and death / respawn.
// usage: node tools/_nettest.mjs [lag=40] [jitter=10] [loss=0.02]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [lag = '40', jitter = '10', loss = '0.02'] = process.argv.slice(2), base = `http://127.0.0.1:${srv.address().port}/index.html`, net = `&lag=${lag}&jitter=${jitter}&loss=${loss}`;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), errs = { host: [], client: [] };
const H = await ctx.newPage(), C = await ctx.newPage();
for (const [pg, k] of [[H, 'host'], [C, 'client']]) { pg.on('pageerror', (e) => errs[k].push('uncaught: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs[k].push(m.text()); }); }
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. host starts a 3v3 warehouse TDM in a tab opened with ?host=
await H.goto(`${base}?host=t1${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3, loadout: 0 });
  S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' };
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; app.match.player.spawnProtect = 0;
});
log('host match running:', await H.evaluate(() => ({ combatants: app.match.combatants.length, net: app.match.net && app.match.net.role })));

// 2. client joins from a second tab
await C.goto(`${base}?join=t1&name=Tester&team=bravo${net}`);
await C.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 }).catch(() => {});
await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
await sleep(1500);
const joined = { host: await H.evaluate(() => ({ humans: app.match.humans.map((h) => ({ id: h.netId, team: h.team, name: h.name })), combatants: app.match.combatants.length, bots: app.match.bots.length })),
  client: await C.evaluate(() => ({ state: app.state, you: app.match && app.match.player.netId, team: app.match && app.match.player.team, ghosts: app.match ? [...app.match.net.ghosts.values()].map((g) => g.name) : [] })) };
log('joined:', JSON.stringify(joined));

// screenshots: two open spots 6 m apart with a clear view (searched on the host); the friend is moved there by the host
// (his client snaps to it through reconciliation), then each looks at the other
const spots = await H.evaluate(() => { const m = app.match, V = SF2.THREE.Vector3, C = m.collision;
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  for (const q of m.nav.groundNodes || []) { const a = q.p; for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, b = new V(a.x - Math.sin(ang) * 6, a.y, a.z - Math.cos(ang) * 6);
    if (Math.abs(b.y - a.y) < 0.1 && C.fits(a.x, a.y + 0.05, a.z, 0.5, 1.8) && C.fits(b.x, b.y + 0.05, b.z, 0.5, 1.8) && C.segmentClear(new V(a.x, a.y + 1.5, a.z), new V(b.x, b.y + 1.5, b.z)) && C.segmentClear(new V(a.x, a.y + 0.5, a.z), new V(b.x, b.y + 0.5, b.z))) {
      const n = m.humans[0], p = m.player; n.motor.teleport(a.clone()); p.motor.teleport(b.clone()); p.yaw = Math.atan2(-(a.x - b.x), -(a.z - b.z)); p.pitch = -0.05; return { a: a.toArray(), b: b.toArray() }; } } }
  return null; });
await sleep(1500);
await C.evaluate(() => { const m = app.match, g = [...m.net.ghosts.values()].find((x) => x.name === '房主'), p = m.player, e = p.eyePos(new SF2.THREE.Vector3()), c = g.chestPos(new SF2.THREE.Vector3()); p.yaw = Math.atan2(-(c.x - e.x), -(c.z - e.z)); p.pitch = -0.05; });
await sleep(600); await C.screenshot({ path: 'tools/out/net_client.png' }); await H.screenshot({ path: 'tools/out/net_host.png' });
log('screenshot spots', JSON.stringify(spots));
// 3. movement agreement: client holds W for 1.2 s, then compare the client's predicted position with the host's soldier
const before = await C.evaluate(() => { const p = app.match.player.motor.pos; return [p.x, p.z]; });
await C.evaluate(() => { app.input.keys.add('KeyW'); });
await sleep(1200);
await C.evaluate(() => { app.input.keys.delete('KeyW'); });
await sleep(800);
const cPos = await C.evaluate(() => { const p = app.match.player.motor.pos; return [p.x, p.y, p.z]; });
const hPos = await H.evaluate(() => { const n = app.match.humans[0]; return n ? [n.motor.pos.x, n.motor.pos.y, n.motor.pos.z] : null; });
const moved = Math.hypot(cPos[0] - before[0], cPos[2] - before[1]), drift = hPos ? Math.hypot(cPos[0] - hPos[0], cPos[1] - hPos[1], cPos[2] - hPos[2]) : -1;
log(`movement: client moved ${moved.toFixed(2)} m · client vs host position after stop: ${drift.toFixed(3)} m`);

// 4. client shoots a host bot: host parks an enemy bot (alpha) 9 m in front of the friend's soldier, AI off
const target = await H.evaluate(() => {
  const m = app.match, n = m.humans[0], bot = m.bots.find((b) => b.team !== n.team && b.alive) || m.bots.find((b) => b.team !== n.team);
  if (!bot.alive) { const sp = m.pickSpawn(bot.team); bot.respawn(sp, 0); }
  bot.ai.update = () => {}; bot.ai.wishX = bot.ai.wishZ = bot.ai.wishSpeed = 0; bot.spawnProtect = 0; bot.hp = 100;
  const p = n.motor.pos, V = SF2.THREE.Vector3, eye = n.eyePos(new V());
  // a clear spot: 8 directions × 9..4 m, line of sight to chest height and standing room
  let best = null;
  for (let d = 9; d >= 4 && !best; d--) for (let k = 0; k < 8 && !best; k++) { const a = k * Math.PI / 4, q = new V(p.x - Math.sin(a) * d, p.y, p.z - Math.cos(a) * d); if (m.collision.fits(q.x, q.y + 0.05, q.z, 0.4, 1.8) && m.collision.segmentClear(eye, new V(q.x, q.y + 1.25, q.z))) best = { q, d }; }
  if (!best) return null;
  bot.motor.teleport(best.q); bot.yaw = 0;
  return { id: bot.netId, name: bot.name, d: best.d };
});
log('target', JSON.stringify(target), 'phase host/client', await H.evaluate(() => app.match.phase), await C.evaluate(() => app.match.phase), 'ghost ids', await C.evaluate(() => [...app.match.net.ghosts.keys()].join(',')));
await sleep(700);
const aim = await C.evaluate((id) => {
  const m = app.match, g = m.net.ghosts.get(id), p = m.player, e = p.eyePos(new SF2.THREE.Vector3()), c = g.chestPos(new SF2.THREE.Vector3());
  const dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  m.stats.hits = 0; window.__pred = []; const fb = m.fireBullet.bind(m);
  m.fireBullet = (sh, o, d, def, opts) => { const r = fb(sh, o, d, def, opts); if (sh === p) { const t = m.collision.raycastAll(o, d, 150)[0], gb = g; gb.updateHitboxes(); let hit = null; for (const hb of gb.hitboxes) { const x = SF2.THREE ? null : null; } window.__pred.push({ d: [d.x, d.y, d.z].map((v) => +v.toFixed(4)), end: +r.dist.toFixed(2) }); } return r; };
  return { ghostAlive: g.alive, dist: +Math.hypot(dx, dz).toFixed(2) };
}, target.id);
await H.evaluate(() => { const m = app.match; window.__fb = []; const fb = m.fireBullet.bind(m); m.fireBullet = (sh, o, d, def, opts) => { const r = fb(sh, o, d, def, opts); if (sh.isNet) window.__fb.push({ o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)), dist: +r.dist.toFixed(2) }); return r; }; });
const spy = () => { window.__cone = []; const W = SF2.WEAPON_DEFS && window.app; const proto = Object.getPrototypeOf(Object.getPrototypeOf(app.match.weapons.current)); const orig = proto._cone; proto._cone = function (ray, sp, out, R) { const r = orig.call(this, ray, sp, out, R); if (!this.owner.isBot) window.__cone.push({ who: this.local ? 'L' : 'R', n: this.shotN, s: +sp.toFixed(5), cur: +this.cur.toFixed(5), p: +Math.asin(ray.d.y).toFixed(4), clk: +(this.owner.arsenal || app.match.weapons).clock.toFixed(4), seq: this.local ? app.cmds.seq : this.owner.curSeq, ap: +(this.local ? this.owner.recoilPitch + this.owner.punch : this.owner.aimDP).toFixed(4), rp: this.local ? +this.owner.recoilPitch.toFixed(4) : undefined, pu: this.local ? +this.owner.punch.toFixed(4) : undefined }); return r; }; };
await C.evaluate(spy); await H.evaluate(spy);
await C.evaluate(() => { app.input.buttons[0] = true; app.input.onButton(0, true); });
await sleep(900);
log('direction match (client predicted vs host)', JSON.stringify(await C.evaluate(() => window.__pred.slice(0, 8).map((x) => x.d.join(',')))), JSON.stringify(await H.evaluate(() => window.__fb.slice(0, 8).map((x) => x.d.map((v) => +v.toFixed(3)).join(',')))));
log('cone client', JSON.stringify(await C.evaluate(() => window.__cone.slice(0, 5))));
log('cone host  ', JSON.stringify(await H.evaluate(() => window.__cone.filter((x) => x.who === 'R').slice(0, 5))));
log('host-side shots by the friend', await H.evaluate((id) => { const m = app.match, n = m.humans[0], bt = m.combatants.find((x) => x.netId === id); bt.updateHitboxes(); const hb = bt.hitboxes[1]; return JSON.stringify({ n: window.__fb.length, first: window.__fb.slice(0, 3), npYaw: +n.yaw.toFixed(3), npPitch: +n.pitch.toFixed(3), npAmmo: n.arsenal.current.ammo, eye: n.eyePos(new SF2.THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), chest: [hb.min.x, hb.min.y, hb.min.z, hb.max.x, hb.max.y, hb.max.z].map((v) => +v.toFixed(2)) }); }, target.id));
log('client aim', await C.evaluate(() => { const p = app.match.player; return JSON.stringify({ yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), eye: p.eyePos(new SF2.THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) }); }));
await C.evaluate(() => { app.input.buttons[0] = false; app.input.onButton(0, false); });
await sleep(600);
const shot = { host: await H.evaluate((id) => { const c = app.match.combatants.find((x) => x.netId === id); return { hp: c.hp, alive: c.alive, deaths: c.deaths }; }, target.id),
  client: await C.evaluate((id) => { const m = app.match; if (!m || !m.net) return { state: app.state, match: !!m, phase: m && m.phase }; const g = m.net.ghosts.get(id); return { hits: m.stats.hits, ghostAlive: g ? g.alive : 'gone', ghosts: m.net.ghosts.size, myKills: m.player.kills, ammo: m.weapons.current.ammo, state: app.state, phase: m.phase }; }, target.id) };
log('client → host bot', JSON.stringify(target), JSON.stringify(aim), JSON.stringify(shot));

// 5. host player shoots the friend until he dies; the client should take damage, die and respawn
const hostShoot = await H.evaluate(async () => {
  const m = app.match, n = m.humans[0], p = m.player;
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; } n.spawnProtect = 0;
  const D = new SF2.THREE.Vector3(); p.motor.teleport(D.set(n.motor.pos.x + 6, n.motor.pos.y, n.motor.pos.z)); // 6 m to his side
  for (let i = 0; i < 40 && n.alive; i++) {
    const e = p.eyePos(new SF2.THREE.Vector3()), c = n.chestPos(new SF2.THREE.Vector3()), dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); p.resetRecoil();
    app.input.buttons[0] = true; app.input.onButton(0, true); await new Promise((r) => setTimeout(r, 120)); app.input.buttons[0] = false; app.input.onButton(0, false); await new Promise((r) => setTimeout(r, 120));
  }
  return { friendAlive: n.alive, friendDeaths: n.deaths, hostKills: p.kills };
});
await sleep(900);
const cDead = await C.evaluate(() => ({ alive: app.match.player.alive, hp: app.match.player.hp, deaths: app.match.player.deaths, feed: document.getElementById('killfeed') ? document.getElementById('killfeed').textContent.slice(0, 80) : '' }));
log('host → friend', JSON.stringify(hostShoot), 'client sees', JSON.stringify(cDead));
await sleep(5500); // respawn delay
const cBack = await C.evaluate(() => ({ alive: app.match.player.alive, hp: app.match.player.hp, life: app.match.player.life }));
const hBack = await H.evaluate(() => ({ alive: app.match.humans[0].alive, life: app.match.humans[0].life }));
log('respawn: client', JSON.stringify(cBack), 'host', JSON.stringify(hBack));

const stats = { client: await C.evaluate(() => ({ corr: app.match.net.corr, tr: app.match.net.t.stats })), host: await H.evaluate(() => ({ tr: app.match.net.t.stats, pending: app.match.humans[0] && app.match.humans[0].pending.size, stalls: app.match.humans[0] && app.match.humans[0].stalls })) };
log('net stats', JSON.stringify(stats));
for (const k of ['host', 'client']) if (errs[k].length) log(k.toUpperCase(), 'ERRORS', errs[k].slice(0, 8));
await b.close(); srv.close();

// v29: every mode online (loopback, 60 ms ± 10). For each mode the host runs the match with a friend in it:
//   rounds — the host wipes Bravo → the friend sees the round banner, the score, then respawns in round 2
//   dom    — the friend holds E in zone A for 6 s → the host gives the zone to his team, his screen shows it
//   relic  — the friend (attacker) picks up the relic with E, carries it, dies → it drops; his screen follows each step
// node tools/_modes.mjs [rounds|dom|relic …]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, net = '&lag=60&jitter=10&loss=0.02', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['rounds', 'dom', 'relic'];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, what, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${extra ? '  · ' + extra : ''}`); if (!c) fails++; };
const wait = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

for (const mode of modes) {
  const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage(), errs = [];
  for (const p of [H, C]) p.on('pageerror', (e) => errs.push(e.message));
  const room = 'md' + mode, team = mode === 'relic' ? 'alpha' : 'bravo', map = mode === 'relic' ? 5 : 0;
  await H.goto(`${base}?host=${room}${net}`); await H.waitForFunction(() => window.app && window.SF2);
  await H.evaluate(async ([rule, map]) => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule, mode: 'general', allies: 3, enemies: 3 }); await app.startMatch(); app.state = 'playing'; app.input.locked = true; }, [mode, map]);
  await C.goto(`${base}?join=${room}&name=Friend&team=${team}${net}`);
  ok(await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000), `${mode}: friend joined (${team})`);
  await C.evaluate(() => { app.input.locked = true; window.__banners = []; const rb = app.hud.roundBanner.bind(app.hud); app.hud.roundBanner = (i) => { if (i) window.__banners.push(i.title + ' · ' + i.sub); return rb(i); }; window.__ann = []; const an = app.hud.announce.bind(app.hud); app.hud.announce = (a, s) => { window.__ann.push(a); return an(a, s); }; });
  await H.evaluate(() => { const m = app.match; for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishX = bt.ai.wishZ = bt.ai.wishSpeed = 0; } });
  await wait(H, () => app.match.phase === 'live', null, 15000); await sleep(600);

  if (mode === 'rounds') {
    await H.evaluate(() => { const m = app.match, V = SF2.THREE.Vector3; for (const c of [...m.combatants]) if (c.team === 'bravo' && c.alive) { c.spawnProtect = 0; m.applyDamage(c, 999, 'head', m.player, SF2.WEAPON_DEFS.m4a1, new V(0, 0, 1), c.motor.pos.clone()); } });
    ok(await wait(C, () => !app.match.player.alive), 'rounds: friend died in the wipe');
    ok(await wait(C, () => window.__banners.length > 0), 'rounds: friend sees the round banner', JSON.stringify(await C.evaluate(() => window.__banners)));
    ok(await wait(C, () => app.match.roundWins.alpha === 1), 'rounds: score 1 : 0 on the friend');
    ok(await wait(C, () => app.match.player.alive && app.match.round === 2, null, 15000), 'rounds: round 2 — friend respawned', JSON.stringify(await C.evaluate(() => ({ round: app.match.round, alive: app.match.player.alive, phase: app.match.phase }))));
  }
  if (mode === 'dom') {
    const zone = await H.evaluate(() => { const m = app.match, z = m.rules.zones[0], n = m.humans[0]; n.motor.teleport(new SF2.THREE.Vector3(z.pos.x, m.nav.snap(z.pos).y, z.pos.z)); return z.id; });
    await sleep(900); // reconciliation snaps the friend there
    await C.evaluate(() => app.input.keys.add('KeyE'));
    const sawProgress = await wait(C, () => { const st = app.match.rules.hudState(); return st && st.cap && st.cap.k > 0.3; }, null, 8000);
    ok(sawProgress, `dom: friend sees his capture progress on ${zone}`);
    ok(await wait(H, () => app.match.rules.zones[0].owner === 'bravo', null, 10000), 'dom: host gave the zone to bravo');
    ok(await wait(C, () => app.match.rules.zones[0].owner === 'bravo'), 'dom: friend sees zone owned by his team', JSON.stringify(await C.evaluate(() => window.__ann)));
    await C.evaluate(() => app.input.keys.delete('KeyE'));
  }
  if (mode === 'relic') {
    await H.evaluate(() => { const m = app.match, r = m.rules, n = m.humans[0]; n.motor.teleport(m.nav.snap(r.home.clone().setY(r.home.y - 0.55))); });
    await sleep(900);
    await C.evaluate(() => app.input.keys.add('KeyE')); await sleep(500); await C.evaluate(() => app.input.keys.delete('KeyE'));
    ok(await wait(H, () => app.match.rules.state === 'carried' && app.match.rules.carrier === app.match.humans[0]), 'relic: host — the friend carries the relic');
    ok(await wait(C, () => app.match.rules.state === 'carried' && app.match.rules.carrier === app.match.player), 'relic: friend sees himself carrying it', JSON.stringify(await C.evaluate(() => window.__ann)));
    await H.evaluate(() => { const m = app.match, n = m.humans[0]; n.spawnProtect = 0; m.applyDamage(n, 999, 'head', m.bots.find((x) => x.team === 'bravo'), SF2.WEAPON_DEFS.m4a1, new SF2.THREE.Vector3(0, 0, 1), n.motor.pos.clone()); });
    ok(await wait(C, () => app.match.rules.state === 'dropped' && !app.match.player.alive), 'relic: friend died → relic dropped on his screen');
  }
  if (errs.length) console.log(mode, 'ERRORS', errs.slice(0, 6));
  await ctx.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); srv.close();

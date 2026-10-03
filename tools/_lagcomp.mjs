// v29 lag compensation: under simulated latency the friend aims exactly at what his screen shows (a host bot running
// back and forth) and fires single shots; the host counts how many land — with rewind (normal) and without (__noRewind).
// node tools/_lagcomp.mjs [lag=100] [jitter=10]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [lag = '100', jitter = '10'] = process.argv.slice(2), base = `http://127.0.0.1:${srv.address().port}/index.html`, net = `&lag=${lag}&jitter=${jitter}&loss=0`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage(), errs = [];
for (const p of [H, C]) p.on('pageerror', (e) => errs.push(e.message));
await H.goto(`${base}?host=lc${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'low'; S.hipMode = 'precise'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 2, enemies: 2, loadout: 0 }); S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' }; await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
await C.goto(`${base}?join=lc&name=Tester&team=bravo${net}`);
await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.input.locked = true; SF2.Settings.data.hipMode = 'precise'; });
await sleep(1500);
// host: freeze AI, park the friend, and run one alpha bot sideways 15 m in front of him (sine, peak ≈ 4.5 m/s)
const setup = await H.evaluate(() => {
  const m = app.match, n = m.humans[0], V = SF2.THREE.Vector3, C = m.collision;
  m.phase = 'live'; m.freezeT = 0;
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishX = bt.ai.wishZ = bt.ai.wishSpeed = 0; }
  for (const q of m.nav.groundNodes || []) {
    const a = q.p; for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4, fx = -Math.sin(ang), fz = -Math.cos(ang), c = new V(a.x + fx * 15, a.y, a.z + fz * 15);
      let ok = Math.abs(C.groundBelow(c.x, a.y + 0.5, c.z, 0.3, 1.5)?.y - a.y) < 0.05 && C.fits(a.x, a.y + 0.05, a.z, 0.5, 1.8);
      for (let s = -3.5; ok && s <= 3.5; s += 0.5) { const q2 = new V(c.x - fz * s, a.y, c.z + fx * s); ok = C.fits(q2.x, a.y + 0.05, q2.z, 0.45, 1.8) && C.segmentClear(new V(a.x, a.y + 1.5, a.z), new V(q2.x, a.y + 1.2, q2.z)) && Math.abs((C.groundBelow(q2.x, a.y + 0.5, q2.z, 0.3, 1.5)?.y ?? -99) - a.y) < 0.05; }
      if (!ok) continue;
      const bot = m.bots.find((x) => x.team === 'alpha');
      n.motor.teleport(a.clone()); bot.motor.teleport(c.clone()); bot.spawnProtect = 0; bot.hp = 1e6;
      window.__run = { c: c.toArray(), side: [-fz, fx], t0: performance.now(), id: bot.netId };
      window.__hits = 0; const ad = m.applyDamage.bind(m); m.applyDamage = (v, ...r) => { if (v === bot && r[2] && r[2].isNet) window.__hits++; const res = ad(v, ...r); v.hp = 1e6; return res; };
      clearInterval(window.__mover); window.__mover = setInterval(() => { const R = window.__run, t = (performance.now() - R.t0) / 1000, s = Math.sin(t * 1.5) * (window.__amp ?? 3); bot.motor.pos.set(R.c[0] + R.side[0] * s, R.c[1], R.c[2] + R.side[1] * s); bot.yaw = 0; }, 8);
      return { at: a.toArray().map((v) => +v.toFixed(1)), bot: bot.netId };
    }
  }
  return null;
});
console.log('setup', JSON.stringify(setup));
if (!setup) { console.log('no open spot found'); await b.close(); srv.close(); process.exit(1); }
await sleep(1200);
// client: aim at the ghost every frame (what this screen shows), tap-fire every 300 ms
const run = async (label, noRewind, amp = 3) => {
  await H.evaluate(([v, a]) => { window.__noRewind = v; window.__amp = a; window.__hits = 0; app.match.net.rewound = 0; }, [noRewind, amp]); await sleep(400);
  const shots = await C.evaluate(async (id) => {
    const m = app.match, p = m.player, g = m.net.ghosts.get(id), V = SF2.THREE.Vector3; let n = 0;
    const aim = () => { const e = p.eyePos(new V()), c = g.chestPos(new V()), dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); p.resetRecoil && p.resetRecoil(); };
    const iv = setInterval(aim, 4);
    for (let i = 0; i < 24; i++) { aim(); app.input.buttons[0] = true; app.input.onButton(0, true); await new Promise((r) => setTimeout(r, 40)); app.input.buttons[0] = false; app.input.onButton(0, false); n++; await new Promise((r) => setTimeout(r, 260)); if (m.weapons.current.ammo < 3) { app.input.onKey('KeyR'); await new Promise((r) => setTimeout(r, 2600)); } }
    clearInterval(iv); return n;
  }, setup.bot);
  await sleep(600);
  const r = await H.evaluate(() => ({ hits: window.__hits, rewound: app.match.net.rewound }));
  console.log(`${label}: ${r.hits}/${shots} shots hit the running bot · soldiers rewound ${r.rewound}`);
  return r.hits / shots;
};
const still = await run('standing still (baseline: spread only)', false, 0);
const on = await run('lag compensation ON ', false), off = await run('lag compensation OFF', true);
console.log(`running target: ${Math.round(on * 100)}% with vs ${Math.round(off * 100)}% without · standing target ${Math.round(still * 100)}% (lag ${lag} ms ± ${jitter})`);
if (errs.length) console.log('ERRORS', errs.slice(0, 6));
await b.close(); srv.close();

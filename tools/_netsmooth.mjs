// v67k steady-state smoothness of an online match (two tabs, loopback transport with simulated lag / jitter / loss):
// 12 s of the friend running around while the bots fight, sampled every frame on both sides.
//   node tools/_netsmooth.mjs [lag=40] [jitter=10] [loss=0.02]
// host: the friend's command buffer (pending), ticks with no command (stalls), the delay from a command being made to being simulated;
// client: prediction corrections (count / size), frames a ghost had no newer snapshot to move toward (holds), ghost speed jumps,
// snapshot arrival gaps, how unevenly remote shots are heard (gaps between a ghost's shots vs its gun's interval)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [lag = '40', jitter = '10', loss = '0.02'] = process.argv.slice(2), base = `http://127.0.0.1:${srv.address().port}/index.html`, net = `&lag=${lag}&jitter=${jitter}&loss=${loss}`;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage(), errs = [];
for (const pg of [H, C]) pg.on('pageerror', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await H.goto(`${base}?host=s1${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(() => { const S = SF2.Settings.data; S.nick = 'HostWei'; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3, loadout: 0 }); });
await H.evaluate(async () => { await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
await C.goto(`${base}?join=s1&name=Tester&team=bravo${net}`);
await C.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
await sleep(2500);
// nobody dies during the run (deaths reset everything); the bots keep fighting
const immortal = () => { const m = app.match; window.__imm = setInterval(() => { for (const c of m.combatants) if (c.alive && !c.isBot) { c.spawnProtect = 5; c.hp = 100; } }, 500); };
await H.evaluate(immortal);
if (process.env.BOTS === 'off') await H.evaluate(() => { const m = app.match; for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; bt.motor.teleport(new SF2.THREE.Vector3(500, -200, 500)); bt.fixedUpdate = () => {}; } });
if (process.env.MOVE === 'straight') await C.evaluate(() => { window.__straight = true; });
await H.evaluate(() => {
  const m = app.match, np = m.humans[0], S = window.__S = { pend: [], stalls0: np.stalls || 0, ticks: 0, delay: [], frames: 0, t0: performance.now() };
  const os = np.step.bind(np); np.step = (h) => { S.ticks++; S.pend.push(np.pending.size); const a = np.ackSeq; os(h); if (np.ackSeq !== a && window.__cmdT) { /* (clocks are the same machine's) */ } };
  S.long = []; let lt = performance.now(); const tick = () => { const t = performance.now(); if (t - lt > 80) S.long.push([Math.round(t - S.t0), Math.round(t - lt)]); lt = t; S.frames++; S.raf = requestAnimationFrame(tick); }; tick();
});
await C.evaluate(() => {
  const m = app.match, N = m.net, S = window.__S = { corr0: { ...N.corr }, errs: [], holds: 0, gframes: 0, jumps: 0, gaps: [], shotGaps: {}, frames: 0, lastSnap: 0, t0: performance.now() };
  const os = N._snap.bind(N); N._snap = (s) => { const t = performance.now(); if (S.lastSnap) S.gaps.push(t - S.lastSnap); S.lastSnap = t; os(s); };
  const osf = N._self.bind(N); N._self = (s, e) => { const h = N.hist[s.ack & 255]; if (h && h.seq === s.ack && e.alive && m.player.alive) { const er = Math.hypot(e.x - h.x, e.y - h.y, e.z - h.z); if (er >= 0.03 && er < 5) S.errs.push(er); } osf(s, e); };
  const ots = m.thirdPersonShot.bind(m); m.thirdPersonShot = (c, def, a, b2, n) => { const t = performance.now(), G = S.shotGaps[c.netId] || (S.shotGaps[c.netId] = { last: 0, iv: def.interval * 1000, g: [] }); if (G.last && t - G.last < 400) G.g.push(t - G.last); G.last = t; G.iv = def.interval * 1000; return ots(c, def, a, b2, n); };
  const sp = new Map();
  S.long = []; let lt = performance.now(); const tick = () => { const t = performance.now(); if (t - lt > 80) S.long.push([Math.round(t - S.t0), Math.round(t - lt)]); lt = t; S.frames++; const rt = N.hostClock - 0.1;
    for (const g of N.ghosts.values()) { if (!g.alive || !g.buf.length) continue; S.gframes++; if (rt > g.buf[g.buf.length - 1].t + 1e-4) S.holds++;
      const last = sp.get(g.netId), p = g.motor.pos; if (last) { const d = Math.hypot(p.x - last.x, p.z - last.z); if (last.d > 0.02 && d < last.d * 0.3 || (d > 0.02 && last.d < d * 0.3 && last.d > 0)) S.jumps++; sp.set(g.netId, { x: p.x, z: p.z, d }); } else sp.set(g.netId, { x: p.x, z: p.z, d: 0 }); }
    S.raf = requestAnimationFrame(tick); }; tick();
});
// the friend runs: forward, strafing left / right, turning — 12 s
const T0 = Date.now();
await C.evaluate(() => { const k = app.input.keys, p = app.match.player; k.add('KeyW'); let i = 0; window.__mv = setInterval(() => { i++; if (window.__straight) { if (i % 3 === 0) p.yaw += Math.PI; return; } p.yaw += 0.5; k.delete('KeyA'); k.delete('KeyD'); k.add(i % 2 ? 'KeyA' : 'KeyD'); }, 700); });
await sleep(12000);
await C.evaluate(() => { clearInterval(window.__mv); app.input.keys.clear(); });
const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
const h = await H.evaluate(() => { const S = window.__S, np = app.match.humans[0]; return { long: S.long, deaths: np.deaths, life: np.life, ticks: S.ticks, stalls: (np.stalls || 0) - S.stalls0, pend: S.pend, fps: S.frames / ((performance.now() - S.t0) / 1000) }; });
const c = await C.evaluate(() => { const S = window.__S, N = app.match.net; return { long: S.long, corrN: N.corr.n - S.corr0.n, snaps: N.corr.snaps - S.corr0.snaps, errs: S.errs, holds: S.holds, gframes: S.gframes, jumps: S.jumps, gaps: S.gaps, shotGaps: S.shotGaps, fps: S.frames / ((performance.now() - S.t0) / 1000), rtt: N.rtt }; });
const pendAvg = h.pend.reduce((a, x) => a + x, 0) / Math.max(1, h.pend.length);
const shots = Object.values(c.shotGaps).filter((G) => G.g.length >= 5).map((G) => ({ iv: +G.iv.toFixed(0), n: G.g.length, p10: q(G.g, 0.1), p50: q(G.g, 0.5), p90: q(G.g, 0.9), zero: G.g.filter((x) => x < 2).length }));
console.log('NETSMOOTH', JSON.stringify({ lag: +lag, jitter: +jitter, loss: +loss,
  host: { long: h.long, life: h.life, fps: +h.fps.toFixed(1), ticks: h.ticks, stallPct: +(100 * h.stalls / h.ticks).toFixed(1), pendAvg: +pendAvg.toFixed(2), pendP90: q(h.pend, 0.9), pendMax: Math.max(...h.pend), bufferMs: +(pendAvg * 16.7).toFixed(0) },
  client: { long: c.long, fps: +c.fps.toFixed(1), rtt: +(+c.rtt).toFixed(0), corrPct: +(100 * c.corrN / Math.max(1, c.snaps)).toFixed(1), errP50: q(c.errs, 0.5), errP90: q(c.errs, 0.9), errMax: q(c.errs, 1), holdPct: +(100 * c.holds / Math.max(1, c.gframes)).toFixed(2), jumps: c.jumps, snapGapP50: q(c.gaps, 0.5), snapGapP90: q(c.gaps, 0.9), snapGapMax: q(c.gaps, 1), remoteShots: shots },
}), errs.slice(0, 3));
await b.close(); srv.close();

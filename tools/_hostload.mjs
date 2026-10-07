// v46 host-load experiment — does the host's computer set everyone's frame rate? The host and one friend run in two
// SEPARATE browser processes (like two computers) linked the way the online game links them: Supabase signalling +
// WebRTC data channels. The host plays a TDM with bots; the friend walks in circles. Then Chrome's CPU throttling slows the
// HOST's page (and, as a control, the FRIEND's page), and both sides report: frame rate, game-clock speed, snapshots per
// second, upload, prediction corrections, the friend's command backlog on the host and per-frame CPU cost.
// (Two tabs of ONE browser are not used: a tab that is not in front gets throttled frames, which skews the numbers.)
// node tools/_hostload.mjs [runs=2] [bots=4]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const RUNS = +(process.argv[2] || 2), BOTS = +(process.argv[3] || 4), base = `http://127.0.0.1:${srv.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
const bH = await chromium.launch({ channel: 'chrome', args: ARGS }), bC = await chromium.launch({ channel: 'chrome', args: ARGS });
const ctxH = await bH.newContext({ viewport: { width: 960, height: 540 } }), ctxC = await bC.newContext({ viewport: { width: 960, height: 540 } });
const H = await ctxH.newPage(), C = await ctxC.newPage(), errs = [];
for (const p of [H, C]) p.on('pageerror', (e) => errs.push(e.message));
const setup = (bots) => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: bots, enemies: bots, loadout: 0 }); S.loadouts[0] = { name: 'A', primary: 'm4a1', secondary: 'p226' }; };
await H.goto(`${base}?x=1`); await H.waitForFunction(() => window.app && window.SF2 && app.dir); await H.evaluate(setup, BOTS);
await H.evaluate(() => app.createRoom()); await H.waitForFunction(() => app.room && app.room.online, null, { timeout: 30000 });
const code = await H.evaluate(() => app.room.code);
await C.goto(`${base}?x=2`); await C.waitForFunction(() => window.app && window.SF2 && app.dir); await C.evaluate(setup, BOTS);
await C.evaluate((c) => app.joinRoom(c), code); await C.waitForFunction(() => app.room && app.room.entered, null, { timeout: 30000 });
await C.evaluate(() => app.room.setTeam('bravo')); await sleep(800);
await H.evaluate(async () => { await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
const via = await H.evaluate(() => { const t = app.match.net.t.t || app.match.net.t; return t.peers ? [...t.peers.values()].map((p) => p.via) : null; });
console.log('room', code, 'connection', JSON.stringify(via));
await sleep(1500);
// nobody dies during the measurement (respawn teleports would count as corrections); the bots keep fighting and moving
await H.evaluate(() => { const m = app.match; m.phase = 'live'; m.freezeT = 0; setInterval(() => { m.player.spawnProtect = 99; for (const h of m.humans) h.spawnProtect = 99; }, 100); });
// the friend walks in circles the whole time (his own prediction + the host's replay of his commands)
await C.evaluate(() => { const m = app.match, n = m.net; window.__snapN = 0; window.__gaps = []; let last = 0; const o = n._snap.bind(n); n._snap = (s) => { const t = performance.now(); if (last) window.__gaps.push(t - last); last = t; window.__snapN++; o(s); };
  setInterval(() => { m.player.yaw += 0.02; m.player.spawnProtect = 99; }, 16); app.input.keys.add('KeyW'); });
for (const p of [H, C]) await p.evaluate(() => { window.__raf = 0; const f = () => { window.__raf++; requestAnimationFrame(f); }; requestAnimationFrame(f); });

const sample = (side) => (side === 'host'
  ? H.evaluate(() => { const m = app.match, n = m.net, h = m.humans[0]; return { t: performance.now(), raf: window.__raf, gt: m.time, snaps: n.tick, bytes: n.t.stats.bytesOut, prof: m.prof.snapshot(), stalls: h ? h.stalls || 0 : 0, pending: h ? h.pending.size : 0, bots: m.bots.length }; })
  : C.evaluate(() => { const m = app.match, n = m.net; const g = window.__gaps.splice(0); return { t: performance.now(), raf: window.__raf, snaps: window.__snapN, hc: n.hostClock, corr: n.corr.n, corrMax: n.corr.max, bytes: n.t.stats.bytesOut, gapMax: g.length ? Math.max(...g) : 0, prof: m.prof.snapshot() }; }));
const hcdp = await ctxH.newCDPSession(H), ccdp = await ctxC.newCDPSession(C);
const measure = async (label, hostRate, cliRate) => {
  await hcdp.send('Emulation.setCPUThrottlingRate', { rate: hostRate }); await ccdp.send('Emulation.setCPUThrottlingRate', { rate: cliRate });
  await sleep(2500); await C.evaluate(() => { app.match.net.corr.max = 0; });
  const h0 = await sample('host'), c0 = await sample('client'); await sleep(6000); const h1 = await sample('host'), c1 = await sample('client');
  const hs = (h1.t - h0.t) / 1000, cs = (c1.t - c0.t) / 1000, r = (x) => +x.toFixed(1);
  const row = { scenario: label,
    'host FPS': r((h1.raf - h0.raf) / hs), 'friend FPS': r((c1.raf - c0.raf) / cs),
    'host game clock ×': +((h1.gt - h0.gt) / hs).toFixed(2), 'snapshots sent/s': r((h1.snaps - h0.snaps) / hs), 'snapshots got/s': r((c1.snaps - c0.snaps) / cs), 'worst snapshot gap ms': Math.round(c1.gapMax),
    'friend clock ×': +((c1.hc - c0.hc) / cs).toFixed(2), 'corrections/s': r((c1.corr - c0.corr) / cs), 'max correction m': +c1.corrMax.toFixed(2),
    'host up KB/s': r((h1.bytes - h0.bytes) / hs / 1024), 'friend up KB/s': r((c1.bytes - c0.bytes) / cs / 1024),
    'host sim+ai ms': +((h1.prof.sim?.avg || 0) + (h1.prof.ai?.avg || 0)).toFixed(2), 'friend sim+ai ms': +((c1.prof.sim?.avg || 0) + (c1.prof.ai?.avg || 0)).toFixed(2),
    'host render ms': h1.prof.render?.avg, 'friend render ms': c1.prof.render?.avg, 'cmd backlog': h1.pending, stalls: h1.stalls - h0.stalls };
  return row;
};
const rows = [];
for (let run = 1; run <= RUNS; run++) {
  for (const [label, hr, cr] of [['normal', 1, 1], ['host CPU ÷2', 2, 1], ['host CPU ÷4', 4, 1], ['host CPU ÷8', 8, 1], ['normal again', 1, 1], ['friend CPU ÷8', 1, 8], ['normal again', 1, 1]]) {
    const row = await measure(`#${run} ${label}`, hr, cr); rows.push(row); console.log(JSON.stringify(row));
  }
}
console.table(rows.map((r) => ({ scenario: r.scenario, 'host FPS': r['host FPS'], 'friend FPS': r['friend FPS'], 'host clock×': r['host game clock ×'], 'snap got/s': r['snapshots got/s'], 'gap ms': r['worst snapshot gap ms'], 'corr/s': r['corrections/s'], backlog: r['cmd backlog'], 'host up KB/s': r['host up KB/s'], 'host cpu ms': r['host sim+ai ms'], 'friend cpu ms': r['friend sim+ai ms'] })));
const extra = await H.evaluate(() => ({ combatants: app.match.combatants.length, bots: app.match.bots.length, humans: app.match.humans.length }));
console.log('match', JSON.stringify(extra), 'errors', errs.slice(0, 5));
await bH.close(); await bC.close(); srv.close();

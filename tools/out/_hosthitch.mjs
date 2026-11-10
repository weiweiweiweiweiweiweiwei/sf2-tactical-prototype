// scratch v67k: what is the host doing in its longest frames of the first 14 s of a bot fight? (CPU profile of the host tab)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx0 = await b.newContext({ viewport: { width: 1280, height: 720 } }), H = await ctx0.newPage();
const NET = !!process.env.NET, base = `http://127.0.0.1:${srv.address().port}/index.html`;
await H.goto(NET ? `${base}?host=h1&lag=40&jitter=10&loss=0.02` : base); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate((q) => { const S = SF2.Settings.data; S.quality = q; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3, loadout: 0 }); }, process.env.Q || 'high');
const cdp = await H.context().newCDPSession(H); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await H.evaluate(async () => { await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match; setInterval(() => { m.player.spawnProtect = 5; m.player.hp = 100; }, 300);
  const F = window.__F = []; let last = performance.now(); const tick = () => { const t = performance.now(); F.push([t, t - last]); last = t; requestAnimationFrame(tick); }; tick(); });
let C = null; if (NET) { C = await H.context().newPage(); await C.goto(`${base}?join=h1&name=Tester&team=bravo&lag=40&jitter=10&loss=0.02`); await C.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 }); await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; const m = app.match; app.input.keys.add('KeyW'); window.__k = 0; const ok = m.remoteKill.bind(m); m.remoteKill = (...a) => { window.__k++; return ok(...a); }; }); await new Promise((r) => setTimeout(r, 1500)); await H.evaluate(() => { const m = app.match; setInterval(() => { for (const c of m.humans) { c.spawnProtect = 5; c.hp = 100; } }, 300); }); }
await H.evaluate(() => { const m = app.match; window.__ev = []; const t0 = performance.now(); for (const k of ['onKill', 'onBoom', 'onNade', 'onDrop']) { if (!m.net || !m.net[k]) continue; const o = m.net[k].bind(m.net); m.net[k] = (...a) => { window.__ev.push([k, Math.round(performance.now())]); return o(...a); }; } });
const WATCH = () => { const R = app.renderer, P = window.__P = [], seen = new Set(R.info.programs.map((p) => p.cacheKey)); window.__P0 = seen.size;
  const tick = () => { for (const p of R.info.programs) if (!seen.has(p.cacheKey)) { seen.add(p.cacheKey); const k = p.cacheKey, g = (re) => (re.exec(k) || [])[0];
      const users = []; app.match.scene.traverse((o) => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) { const pr = R.properties.get(m); if (pr && pr.currentProgram === p) users.push((o.name || o.type) + '/' + (m.name || m.type) + (o.isInstancedMesh ? '[inst]' : o.isSkinnedMesh ? '[skin]' : '')); } });
      let best = null; for (const q of R.info.programs) { if (q === p || q.name !== p.name || !seen.has(q.cacheKey)) continue; const a = q.cacheKey.split(','), b2 = k.split(','); if (a.length !== b2.length) continue; const df = []; for (let i = 0; i < a.length; i++) if (a[i] !== b2[i]) df.push(i + ':' + a[i].slice(0, 40) + '→' + b2[i].slice(0, 40)); if (!best || df.length < best.length) best = df; }
      P.push([Math.round(performance.now()), k.split(',')[0].slice(0, 24), k.length, users.slice(0, 3).join(' ; ') + '  DIFF ' + (best ? best.slice(0, 6).join(' | ') : 'none comparable'), users.length]); } requestAnimationFrame(tick); }; tick(); };
await H.evaluate(WATCH); if (C) await C.evaluate(WATCH);
if (C) await C.evaluate(() => { const L = window.__LF = []; let lt = performance.now(); const t = () => { const n = performance.now(); if (n - lt > 80) L.push([Math.round(n), Math.round(n - lt)]); lt = n; requestAnimationFrame(t); }; t(); });
await cdp.send('Profiler.start'); const t0 = await H.evaluate(() => performance.now());
const stage = async (ms, fn) => { await new Promise((r) => setTimeout(r, ms)); await H.evaluate(fn); await H.evaluate(() => { window.__ev.push(['STAGE', Math.round(performance.now())]); }); };
// one thing at a time, 2 s apart, all in front of the host's camera: a third-person shot, a frag, a flash, a smoke, a helmet knocked off, a kill (body + dropped gun)
const front = `const m = app.match, V = SF2.THREE.Vector3, p = m.player, e = p.eyePos(new V()), d = p.lookDir ? p.lookDir(new V()) : new V(0, 0, -1), at = e.clone().addScaledVector(d, 6); const bot = m.bots.find((b) => b.alive && b.team !== p.team) || m.bots[0];`;
await stage(2000, new Function(front + `bot.motor.teleport(at.clone().setY(p.motor.pos.y)); bot.ai.update = () => {}; m.thirdPersonShot(bot, bot.def, bot.muzzlePos, e, 1);`));
await stage(2000, new Function(front + `m.throwGrenade(p, SF2.WEAPON_DEFS.he, at, new V(0, 0, 0)); `));
await stage(3500, new Function(front + `m.throwGrenade(p, SF2.WEAPON_DEFS.flash, at, new V(0, 0, 0)); `));
await stage(3000, new Function(front + `m.throwGrenade(p, SF2.WEAPON_DEFS.smoke, at, new V(0, 0, 0)); `));
await stage(3500, new Function(front + `bot.spawnProtect = 0; m.applyDamage(bot, 30, 'head', p, SF2.WEAPON_DEFS.m4a1, d.clone(), bot.motor.pos.clone().setY(bot.motor.pos.y + 1.6));`));
await stage(2000, new Function(front + `bot.spawnProtect = 0; m.applyDamage(bot, 999, 'chest', p, SF2.WEAPON_DEFS.m4a1, d.clone(), bot.motor.pos.clone().setY(bot.motor.pos.y + 1.2));`));
await new Promise((r) => setTimeout(r, 3000));
const { profile } = await cdp.send('Profiler.stop');
const F = await H.evaluate(() => window.__F.filter((f) => f[0] > 0)); const ev = await H.evaluate(() => window.__ev || []); const P = await H.evaluate(() => [window.__P0, window.__P]); console.log('programs at start', P[0], 'new during the match:'); for (const x of P[1]) console.log(`  @${((x[0] - t0) / 1000).toFixed(2)} s ${x[1]} users ${x[4]}: ${x[3]}`);
if (C) { const tc = await C.evaluate(() => performance.now()), th = await H.evaluate(() => performance.now()), off = th - tc; const PC = await C.evaluate(() => [window.__P0, window.__P, window.__LF]); console.log('CLIENT programs at start', PC[0], 'new:'); for (const x of PC[1]) console.log(`  @${((x[0] + off - t0) / 1000).toFixed(2)} s ${x[1]} users ${x[4]}: ${x[3]}`); console.log('CLIENT long frames:', PC[2].map((f) => `${f[1]} ms @${((f[0] + off - t0) / 1000).toFixed(2)}`).join(', ')); }
console.log('events', ev.map(([k, t]) => `${k}@${((t - t0) / 1000).toFixed(2)}`).join(' '));
const long = F.filter((f) => f[1] > 50 && f[0] > t0 + 1500).sort((a, b2) => b2[1] - a[1]).slice(0, 8);
console.log('frames', F.length, 'long (>50 ms):', long.map((f) => `${f[1].toFixed(0)} ms @${((f[0] - t0) / 1000).toFixed(2)} s`).join(', '));
// samples inside each long frame, by function (self time) and by top-level caller chain
const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
let ts = profile.startTime; const times = profile.timeDeltas.map((d) => (ts += d)); // µs, same clock base as startTime
const dur = (profile.endTime - profile.startTime) / 1000;
for (const [end, len] of long) {
  const e = profile.startTime + (end - t0) * 1000, s = e - len * 1000, self = new Map(), chain = new Map();
  for (let i = 0; i < profile.samples.length; i++) { if (times[i] < s || times[i] > e) continue; const dt = (profile.timeDeltas[i + 1] || 500) / 1000; const n = byId.get(profile.samples[i]);
    const nm = (x) => `${x.callFrame.functionName || '(anon)'}:${x.callFrame.lineNumber}`; self.set(nm(n), (self.get(nm(n)) || 0) + dt);
    const st = []; for (let k = n.id; k; k = parent.get(k)) st.push(byId.get(k).callFrame.functionName || '(anon)'); const key = st.reverse().filter((x) => x !== '(root)' && x !== '(anon)').slice(0, 7).join(' > '); chain.set(key, (chain.get(key) || 0) + dt); }
  const top = (m, k) => [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, k).map(([n, t]) => `${t.toFixed(0)}ms ${n}`);
  console.log(`\n== ${len.toFixed(0)} ms frame @${((end - t0) / 1000).toFixed(2)} s\n self: ${top(self, 6).join(' | ')}\n chain:\n  ${top(chain, 4).join('\n  ')}`);
}
await b.close(); srv.close();

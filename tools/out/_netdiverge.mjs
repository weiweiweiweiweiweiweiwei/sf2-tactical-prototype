// scratch v67k: where does the friend's prediction leave the host's simulation? per command: state after it on both sides
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, net = `&lag=40&jitter=10&loss=0.02`;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await H.goto(`${base}?host=d1${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(() => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3, loadout: 0 }); });
await H.evaluate(async () => { await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
await C.goto(`${base}?join=d1&name=Tester&team=bravo${net}`);
await C.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
await sleep(2500);
await H.evaluate(() => { const m = app.match; for (const bt of m.bots) { bt.ai.update = () => {}; bt.motor.teleport(new SF2.THREE.Vector3(500, -200, 500)); bt.fixedUpdate = () => {}; } setInterval(() => { for (const c of m.combatants) if (!c.isBot) { c.spawnProtect = 5; c.hp = 100; } }, 300);
  const np = m.humans[0], L = window.__L = new Map(), of = np.fixedUpdate.bind(np);
  np.fixedUpdate = (h, cmd) => { const mo = np.motor, pre = [mo.pos.x, mo.pos.z, mo.vel.x, mo.vel.z]; of(h, cmd); L.set(cmd.seq, { pre, p: [mo.pos.x, mo.pos.y, mo.pos.z], v: [mo.vel.x, mo.vel.z], yaw: np.yaw, f: cmd.f, r: cmd.r, g: mo.grounded, cr: mo.crouching, spr: np.sprinting, w: np.arsenal.current.def.id, ads: !!np.arsenal.ads, rel: !!np.arsenal.current.reloading, alive: np.alive, can: m.canMove() }); }; });
await C.evaluate(() => { const m = app.match, p = m.player, L = window.__L = new Map(), of = p.fixedUpdate.bind(p);
  p.fixedUpdate = (h, cmd) => { const mo = p.motor, pre = [mo.pos.x, mo.pos.z, mo.vel.x, mo.vel.z]; of(h, cmd); L.set(cmd.seq, { pre, p: [mo.pos.x, mo.pos.y, mo.pos.z], v: [mo.vel.x, mo.vel.z], yaw: p.yaw, f: cmd.f, r: cmd.r, g: mo.grounded, cr: mo.crouching, spr: p.sprinting, w: m.weapons.current.def.id, ads: !!m.weapons.ads, rel: !!m.weapons.current.reloading, alive: p.alive, can: m.canMove() }); };
  const k = app.input.keys; k.add('KeyW'); let i = 0; window.__mv = setInterval(() => { i++; p.yaw += 0.5; k.delete('KeyA'); k.delete('KeyD'); k.add(i % 2 ? 'KeyA' : 'KeyD'); }, 700); });
await sleep(6000);
await C.evaluate(() => { clearInterval(window.__mv); app.input.keys.clear(); }); await sleep(500);
const hl = await H.evaluate(() => [...window.__L.entries()]), cl = new Map(await C.evaluate(() => [...window.__L.entries()]));
let shown = 0, bad = 0, n = 0, wasOk = true;
const f3 = (a) => a.map((x) => +x.toFixed(3));
for (const [seq, h] of hl) { const c = cl.get(seq); if (!c) continue; n++;
  // the step itself: same pre-state → same move? compare the DELTA of this step (so an earlier, already corrected error does not count again)
  const dh = [h.p[0] - h.pre[0], h.p[2] - h.pre[1]], dc = [c.p[0] - c.pre[0], c.p[2] - c.pre[1]], dd = Math.hypot(dh[0] - dc[0], dh[1] - dc[1]);
  const ok = dd < 0.002; if (!ok) bad++;
  if (!ok && wasOk && shown < 6) { shown++; console.log('seq', seq, 'stepDiff', dd.toFixed(4), '\n  host ', JSON.stringify({ d: f3(dh), v: f3(h.v), pv: f3(h.pre.slice(2)), yaw: +h.yaw.toFixed(3), f: h.f, r: h.r, g: h.g, cr: h.cr, spr: h.spr, w: h.w, ads: h.ads, rel: h.rel, can: h.can }), '\n  client', JSON.stringify({ d: f3(dc), v: f3(c.v), pv: f3(c.pre.slice(2)), yaw: +c.yaw.toFixed(3), f: c.f, r: c.r, g: c.g, cr: c.cr, spr: c.spr, w: c.w, ads: c.ads, rel: c.rel, can: c.can })); }
  wasOk = ok; }
console.log('DIVERGE steps compared', n, 'differing', bad);
await b.close(); srv.close();

// scratch v67p: zombie survival over the loopback link — the friend is on Blue, sees the infected, goes down, is revived by
// the host's player, buys through the host
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }), H = await ctx.newPage(), C = await ctx.newPage(), errs = [];
for (const pg of [H, C]) pg.on('pageerror', (e) => errs.push(e.message));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, net = '&lag=40&jitter=10&loss=0.02', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await H.goto(`${base}?host=z1${net}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'zombie', mode: 'general', allies: 1, enemies: 3, loadout: 0 }); await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match; m.freezeT = 0.1; });
await C.goto(`${base}?join=z1&name=Tester&team=bravo${net}`);
await C.waitForFunction(() => window.app && app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 60000 });
await C.evaluate(() => { app.state = 'playing'; app.input.locked = true; });
await H.evaluate(() => { const m = app.match; m.rules.breakLeft = 0.5; window.__g = setInterval(() => { m.player.hp = 100; for (const np of m.humans) if (!window.__letdown) { np.hp = 100; } }, 50); });
await sleep(5000);
const R = {};
R.c1 = await C.evaluate(() => { const m = app.match, g = [...m.net.ghosts.values()]; return { team: m.player.team, zGhosts: g.filter((x) => x.zombie).length, zAlive: g.filter((x) => x.zombie && x.alive).length, hud: m.rules.hudState().text, cash: m.rules.cash }; });
// the friend goes down (host side), the host's player walks over and holds E
R.down = await H.evaluate(async () => { const m = app.match, np = m.humans[0]; window.__letdown = 1; np.spawnProtect = 0; np.hp = 1; m.applyDamage(np, 50, 'chest', m.rules.pool[0], SF2.WEAPON_DEFS.knife, new SF2.THREE.Vector3(0, 0, 1), null, { melee: true });
  for (const z of m.rules.pool) if (z.alive) { z.ai.update = () => {}; z.motor.teleport(new SF2.THREE.Vector3(500, -200, 500)); }
  const d0 = np.downed; await new Promise((r) => setTimeout(r, 700)); return { hostDowned: d0, phase: m.phase }; });
await sleep(500);
R.clientDown = await C.evaluate(() => ({ downed: app.match.player.downed, hud: app.match.rules.hudState().text }));
R.revive = await H.evaluate(async () => { const m = app.match, np = m.humans[0], p = m.player; p.motor.teleport(np.motor.pos.clone().add(new SF2.THREE.Vector3(0.8, 0.1, 0))); app.input.keys.add('KeyE');
  await new Promise((r) => setTimeout(r, 3800)); app.input.keys.delete('KeyE'); return { downed: np.downed, hp: np.hp, hostCash: m.rules.cash }; });
await sleep(600);
R.buy = await C.evaluate(async () => { const m = app.match, z = m.rules, c0 = z.cash; z.onKey('KeyB'); z.onKey('Digit1'); await new Promise((r) => setTimeout(r, 1500)); z.onKey('Digit3'); await new Promise((r) => setTimeout(r, 1500)); return { cash0: c0, cash: z.cash, gun: m.weapons.weapons[0].def.id, downed: m.player.downed }; });
R.hostNp = await H.evaluate(() => { const np = app.match.humans[0]; return { gun: np.arsenal.weapons[0].def.id, cash: np.cash }; });
console.log('ZNET', JSON.stringify(R), errs.slice(0, 4)); await b.close(); srv.close();

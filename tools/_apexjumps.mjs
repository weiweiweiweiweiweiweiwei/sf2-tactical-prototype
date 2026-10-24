// Baked jump links on the full Apex range: put a bot at the lower node of random one-way jump links (kind 3), give it the
// upper node as its path, and see whether it gets up there within 4 s (game frozen otherwise: no enemies, no rules).
// node tools/_apexjumps.mjs [count=40]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), COUNT = +(process.argv[2] || 40), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(JSON.stringify(await page.evaluate(async (COUNT) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing';
  const m = app.match, nav = m.def._full.nav, bot = m.bots[0], others = m.combatants.filter((c) => c !== bot);
  for (const c of others) { c.alive = false; c.motor.pos.set(0, -500, 0); }
  m.phase = 'live'; m.canMove = () => true;
  const jumps = []; for (let i = 0; i < nav.kind.length; i++) if (nav.kind[i] === 3) jumps.push(i);
  let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, P = (k) => new SF2.THREE.Vector3(nav.pos[k * 3], nav.pos[k * 3 + 1], nav.pos[k * 3 + 2]);
  const res = { tried: 0, ok: 0, fell: 0, fails: [] }, ai = bot.ai;
  for (let n = 0; n < COUNT; n++) {
    const e = jumps[Math.floor(rnd() * jumps.length)], lo = P(nav.from[e]), hi = P(nav.to[e]);
    bot.respawn(lo.clone(), 0); bot.spawnProtect = 99; ai.state = 'INVESTIGATE'; ai.goalKind = 'lost'; ai.path = [hi]; ai.pathIdx = 0; ai.goal = hi.clone(); ai.departT = 0; ai.lookT = 0;
    ai.setPath = () => {}; // keep the single link as the whole route
    let up = false;
    for (let t = 0; t < 40; t++) { await new Promise((r) => setTimeout(r, 100)); if (bot.motor.grounded && Math.abs(bot.motor.pos.y - hi.y) < 0.35 && Math.hypot(bot.motor.pos.x - hi.x, bot.motor.pos.z - hi.z) < 1.6) { up = true; break; } if (bot.motor.pos.y < lo.y - 5) break; }
    if (bot.motor.pos.y < lo.y - 5) res.fell++;
    delete ai.setPath; res.tried++; if (up) res.ok++; else if (res.fails.length < 8) res.fails.push({ dy: +(hi.y - lo.y).toFixed(2), d: +Math.hypot(hi.x - lo.x, hi.z - lo.z).toFixed(2), at: bot.motor.pos.toArray().map((v) => +v.toFixed(1)), lo: lo.toArray().map((v) => +v.toFixed(1)), hi: hi.toArray().map((v) => +v.toFixed(1)), state: ai.state });
  }
  return res;
}, COUNT)));
await b.close(); srv.close();

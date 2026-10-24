// Trace one baked jump link: column tops along it and the bot's motion while it tries.  node tools/_apexjumptrace.mjs x z [hx hz] (lower [upper] node)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), [X, Z, HX, HZ] = process.argv.slice(2).map(Number), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(); page.setDefaultTimeout(0);
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
console.log(await page.evaluate(async ([X, Z, HX, HZ]) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'apex_full'), rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing';
  const m = app.match, nav = m.def._full.nav, bot = m.bots[0], col = m.collision, V = SF2.THREE.Vector3, out = [];
  for (const c of m.combatants) if (c !== bot) { c.alive = false; c.motor.pos.set(0, -500, 0); }
  m.phase = 'live'; m.canMove = () => true;
  let e = -1; for (let i = 0; i < nav.kind.length; i++) if (nav.kind[i] === 3) { const k = nav.from[i] * 3; const h = nav.to[i] * 3; if (Math.abs(nav.pos[k] - X) < 0.1 && Math.abs(nav.pos[k + 2] - Z) < 0.1 && (HX === undefined || (Math.abs(nav.pos[h] - HX) < 0.1 && Math.abs(nav.pos[h + 2] - HZ) < 0.1))) { e = i; break; } }
  const P = (k) => new V(nav.pos[k * 3], nav.pos[k * 3 + 1], nav.pos[k * 3 + 2]), lo = P(nav.from[e]), hi = P(nav.to[e]);
  out.push('lo ' + lo.toArray().map((v) => v.toFixed(2)) + ' hi ' + hi.toArray().map((v) => v.toFixed(2)));
  const tmp = [];
  for (let t = 0; t <= 1.0001; t += 0.1) { const x = lo.x + (hi.x - lo.x) * t, z = lo.z + (hi.z - lo.z) * t; col.query(x - .01, z - .01, x + .01, z + .01, tmp);
    out.push(`t${t.toFixed(1)} (${x.toFixed(1)},${z.toFixed(1)}) ` + tmp.filter((bx) => bx.min.x <= x && bx.max.x >= x && bx.min.z <= z && bx.max.z >= z && bx.max.y > lo.y - 2 && bx.min.y < hi.y + 3).map((bx) => `[${bx.min.y.toFixed(2)}..${bx.max.y.toFixed(2)} x${bx.min.x}-${bx.max.x} z${bx.min.z}-${bx.max.z}]`).join(' ')); }
  bot.respawn(lo.clone(), 0); bot.spawnProtect = 99; const ai = bot.ai; ai.state = 'INVESTIGATE'; ai.goalKind = 'lost'; ai.path = [hi]; ai.pathIdx = 0; ai.goal = hi.clone(); ai.departT = 0; ai.setPath = () => {};
  ai._stuckCheck = () => {};
  for (let t = 0; t < 30; t++) { await new Promise((r) => setTimeout(r, 100)); const mm = bot.motor; out.push(`${(t / 10).toFixed(1)}s pos ${mm.pos.toArray().map((v) => v.toFixed(2))} g${+mm.grounded} vy ${mm.vel.y.toFixed(1)} air${+bot.airJumpUsed} ${ai.state}`); }
  return out.join('\n');
}, [X, Z, HX, HZ]));
await b.close(); srv.close();

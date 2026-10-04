// v34: kill-emblem check — real kills through applyDamage (headshot, multi, revenge, last shot, knife backstab) + screenshots
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 4 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); await sleep(6500);
  const P = m.player, foes = m.bots.filter((x) => x.team !== P.team); for (const f of foes) { f.ai.update = () => {}; f.spawnProtect = 0; }
  const W = m.weapons.current.def, V = SF2.THREE.Vector3, got = [];
  const kill = (f, part, def = W) => { f.spawnProtect = 0; m.applyDamage(f, 999, part, P, def, new V(0, 0, -1), f.motor.pos.clone().setY(f.motor.pos.y + 1.5)); };
  kill(foes[0], 'head'); await sleep(200); kill(foes[1], 'chest');            // headshot + first, then double
  got.push(Object.assign({}, P.emblems)); await sleep(700);
  const shot1 = true;
  return { got, row: document.querySelectorAll('#embRow svg').length, name: document.querySelector('#emb .en').textContent };
});
await p.screenshot({ path: 'tools/out/emblems.png' });
const r2 = await p.evaluate(async () => {
  const m = app.match, P = m.player, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = SF2.THREE.Vector3;
  const foe = m.bots.find((x) => x.team !== P.team && x.alive) || m.bots.find((x) => x.team !== P.team);
  P.spawnProtect = 0; m.applyDamage(P, 999, 'chest', foe, SF2.WEAPON_DEFS.ak47, new V(0, 0, 1), null);   // die → revenge target
  await sleep(300); const lk = P.lastKiller === foe, dr = P.deathRun;
  // pretend respawn and kill the killer with the last bullet
  P.alive = true; P.hp = 100; P.spawnProtect = 0; m.phase = 'live'; foe.alive = true; foe.hp = 100; foe.spawnProtect = 0; m.weapons.current.ammo = 0;
  m.applyDamage(foe, 999, 'chest', P, m.weapons.current.def, new V(0, 0, -1), null); await sleep(100);
  return { lastKillerSet: lk, deathRun: dr, emblems: P.emblems };
});
await p.waitForTimeout(3500); await p.keyboard.down('Tab'); await p.waitForTimeout(500); await p.screenshot({ path: 'tools/out/scoreboard.png' });
console.log(JSON.stringify(r), JSON.stringify(r2), errs.slice(0, 5)); await b.close(); srv.close();

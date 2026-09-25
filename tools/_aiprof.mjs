import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const map = +(process.argv[2] || 0);
const res = await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 12, enemies: 12 });
  await app.startMatch(); app.state = 'paused'; const m = app.match; m.player.spawnProtect = 1e9;
  const stats = {}, wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { const t0 = performance.now(); const r = f.apply(this, a); const dt = performance.now() - t0; const s = stats[label] || (stats[label] = { n: 0, tot: 0, max: 0 }); s.n++; s.tot += dt; if (dt > s.max) s.max = dt; return r; }; };
  const ai = m.bots[0].ai, AIP = Object.getPrototypeOf(ai);
  for (const k of Object.getOwnPropertyNames(AIP)) { const d = Object.getOwnPropertyDescriptor(AIP, k); if (d && typeof d.value === 'function' && k !== 'constructor') wrap(AIP, k, 'ai.' + k); }
  wrap(Object.getPrototypeOf(m.nav), 'findPath', 'nav.findPath');
  const CW = Object.getPrototypeOf(m.collision); for (const k of ['segmentClear', 'raycast', 'raycastAll', 'groundBelow', 'fits']) wrap(CW, k, 'col.' + k);
  const BP = Object.getPrototypeOf(m.bots[0]); for (const k of ['fixedUpdate', 'update']) wrap(BP, k, 'bot.' + k);
  const MP = Object.getPrototypeOf(m); for (const k of ['onKill', 'dropWeapon', 'applyDamage', 'fireBullet', 'pickSpawn', 'updateSpotting', '_record']) wrap(MP, k, 'match.' + k);
  wrap(Object.getPrototypeOf(m.physics), 'spawnCorpse', 'phys.spawnCorpse'); wrap(Object.getPrototypeOf(m.physics), 'step', 'phys.step'); wrap(Object.getPrototypeOf(m.effects), 'update', 'fx.update'); for (const k of ['updateGrenades', 'updateDrops', 'runTimers']) wrap(MP, k, 'match.' + k); wrap(Object.getPrototypeOf(m.rules), 'tick', 'rules.tick'); wrap(Object.getPrototypeOf(m.weapons), 'update', 'weapons.update'); wrap(Object.getPrototypeOf(m.bots[0]), 'die', 'bot.die'); wrap(Object.getPrototypeOf(m.bots[0]), 'respawn', 'bot.respawn');
  const HP = Object.getPrototypeOf(app.hud); for (const k of ['killfeed', 'update', 'drawRadar']) wrap(HP, k, 'hud.' + k); wrap(Object.getPrototypeOf(app.models), 'tp', 'models.tp');
  const frames = [], gcs = []; let heap = performance.memory.usedJSHeapSize, alloc = 0;
  for (let i = 0; i < 60 * 60; i++) { m.score.alpha = m.score.bravo = 0; m.timeLeft = 900; const t0 = performance.now(); m.tick(1 / 60, { x: 0, y: 0 }); const dt = performance.now() - t0; frames.push(dt);
    const h = performance.memory.usedJSHeapSize; if (h < heap - 200000) gcs.push({ i, freedMB: +((heap - h) / 1e6).toFixed(1), ms: +dt.toFixed(1) }); else alloc += Math.max(0, h - heap); heap = h; }
  window.__gc = { count: gcs.length, allocMBperSec: +(alloc / 1e6 / 60).toFixed(2), worst: gcs.sort((a, b) => b.ms - a.ms).slice(0, 5) };
  window.__slow = frames.map((ms, i) => ({ i, ms: +ms.toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, 6);
  frames.sort((a, b) => a - b);
  const top = Object.entries(stats).map(([k, s]) => ({ k, n: s.n, totMs: +s.tot.toFixed(0), perFrame: +(s.tot / 3600).toFixed(3), avgUs: +(s.tot / s.n * 1000).toFixed(1), maxMs: +s.max.toFixed(2) })).sort((a, b) => b.maxMs - a.maxMs).slice(0, 14);
  const spikes = []; // which prof section held the worst frames
  return { slow: window.__slow, gc: window.__gc, prof: m.prof.snapshot(), tick: { p50: +frames[1800].toFixed(2), p99: +frames[3564].toFixed(2), max: +frames[3599].toFixed(2) }, kills: m.combatants.reduce((a, c) => a + c.kills, 0), top };
}, map);
console.log(JSON.stringify(res.tick), 'kills', res.kills); console.log('GC', JSON.stringify(res.gc)); console.log('slowest frames', JSON.stringify(res.slow)); console.table(res.top);
await b.close(); srv.close();

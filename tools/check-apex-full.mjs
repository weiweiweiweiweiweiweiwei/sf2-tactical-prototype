// v60 triangle Apex maps (Skull Town, the firing range): loads, doors (Apex's leaf; a double door opens as one, every leaf swings
// into the building, never closes on someone, closes again), bodies dropped on nav nodes stand on the floor, nobody freezes on a
// short random walk, leaving the play bounds kills.   node tools/check-apex-full.mjs [apex_full|apex_skulltown]
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const root = process.cwd(), MAP = process.argv[2] || 'apex_full', out = path.join(root, 'tools/out');
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = []; page.setDefaultTimeout(0);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.app && window.SF2, null, { timeout: 60000 });
  const report = await page.evaluate(async (MAP) => {
    Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === MAP), rule: 'tdm', allies: 1, enemies: 1 });
    await app.startMatch(); app.state = 'playing'; app.match.phase = 'live';
    const g = app.match, V = SF2.THREE.Vector3, w = g.collision, up = new V(0, 1, 0), fail = [], ok = (c, s) => { if (!c) fail.push(s); };
    const doors = g.builder.mechs.find((m) => m.doors), human = g.player, keep = g.combatants; g.combatants = [human];
    ok(w.tris && w.tris.n > 1e5, 'triangle collision loaded');
    ok(g.nav && (g.nav.nodes || g.nav.valid || []).length > 1000, 'baked navigation');
    const D = doors.doors, res = { doors: D.length, pairs: D.filter((d) => d.partner).length, inside: 0, tested: 0 };
    for (const d of D) { doors._open(d, 1); } for (let i = 0; i < 90; i++) doors.tick(1 / 30);
    for (const d of D) {
      ok(d.k === 1 && !d.col.blocksMove, 'every door opens');
      if (d.partner) ok(d.partner.k === 1, 'a double door opens as one');
      const mid = new V(0, 1.3, -0.76).applyMatrix4(d.pivot.matrixWorld);
      if (w.raycast(new V(mid.x, d.base + 1.4, mid.z), up, 25)) res.inside++;
    }
    ok(res.inside >= D.length * 0.9, `leaves swing inside (${res.inside}/${D.length})`);
    for (const d of D.slice(0, 6)) { // anti-crush, then close
      doors._open(d, 1); for (let i = 0; i < 90; i++) doors.tick(1 / 30); // (its other half may have closed with the last one)
      human.motor.pos.copy(d.center); human.motor.pos.y = d.base + 0.03; doors._open(d, 0); doors.tick(1 / 30); ok(d.target === 1, 'a door never closes on someone');
      human.motor.pos.set(d.center.x + d.nx * 6, d.base, d.center.z + d.nz * 6); doors._open(d, 0); for (let i = 0; i < 90; i++) doors.tick(1 / 30);
      ok(d.k === 0 && d.col.blocksMove, 'a door closes again'); res.tested++;
    }
    g.combatants = keep;
    const Motor = human.motor.constructor, nodes = (g.nav.nodes || g.nav.valid || []).map((n) => n.p || n);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; let floor = 0, frozen = 0;
    for (let k = 0; k < 150; k++) {
      const q = nodes[Math.floor(rnd() * nodes.length)], m = new Motor(w, { stepHeight: 0.8 }); m.teleport(new V(q.x, q.y + 1, q.z));
      for (let i = 0; i < 120; i++) m.step(1 / 120, 0, 0, 0);
      if (m.grounded && Math.abs(m.pos.y - q.y) < 0.4) floor++;
      let a = rnd() * 6.28, last = m.pos.clone(), still = 0;
      for (let i = 0; i < 480; i++) { if (i % 80 === 0) a = rnd() * 6.28; if (i % 120 === 60) m.requestJump(); m.step(1 / 120, Math.sin(a), Math.cos(a), 4.9);
        if (i % 24 === 0) { still = m.pos.distanceTo(last) < 0.15 ? still + 24 : 0; last.copy(m.pos); } }
      if (still >= 240) frozen++;
    }
    ok(floor >= 140, `bodies dropped on nav nodes land on them (${floor}/150)`); ok(frozen <= 2, `random walks freeze (${frozen}/150)`);
    Object.assign(res, { floor, frozen, triangles: w.tris.n, nav: nodes.length });
    human.spawnProtect = 0; human.motor.pos.set(g.def.bounds.maxX + 6, 10, 0);
    return { res, fail };
  }, MAP);
  await page.waitForTimeout(1000);
  report.boundsDeath = await page.evaluate(() => !app.match.player.alive); if (!report.boundsDeath) report.fail.push('leaving the bounds kills');
  if (errors.length) report.fail.push(...errors);
  console.log(MAP, JSON.stringify(report.res), report.fail.length ? 'FAIL ' + report.fail.join(' | ') : 'APEX_MAP_OK');
  process.exitCode = report.fail.length ? 1 : 0;
} finally { await browser.close(); await new Promise((r) => server.close(r)); }

// Stuck probe (v60 triangle maps): motors dropped on N random nav nodes wander for 6 s (random headings, jumps); a body that
// wants to move but stays within 0.15 m for 2 s is stuck. Reports how many, where, and whether it sat inside a triangle.
// node tools/_stuckprobe.mjs [map=apex_skulltown] [n=400]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), MAP = process.argv[2] || 'apex_skulltown', N = +(process.argv[3] || 400), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage(); p.setDefaultTimeout(0);
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
console.log(JSON.stringify(await p.evaluate(async ({ MAP, N }) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === MAP), rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch();
  const g = app.match, col = g.collision, Motor = g.player.motor.constructor, V = SF2.THREE.Vector3, nodes = g.nav.nodes || g.nav.valid || [];
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = nodes.length ? nodes.map((n) => n.p || n) : [];
  const stuck = []; let wedgedEver = 0; const why = {}, TS = col.tris;
  const culprit = (mo) => { let out = null; const x = mo.pos.x, y = mo.pos.y, z = mo.pos.z, r = mo.radius; TS.each(x - r, z - r, x + r, z + r, (t) => { const o = t * 6, lo = TS.cls[t] === 0 ? y + 0.51 : y + 0.01; if (TS.bb[o + 1] > y + mo.height || TS.bb[o + 4] < lo) return false; if (SF2.triBox(TS.v, t * 9, TS.nrm, t * 3, x, (lo + y + mo.height) / 2, z, r, (y + mo.height - lo) / 2, r)) { out = ['floor', 'wall', 'ceil'][TS.cls[t]] + ':' + TS.matOf(t) + ':' + (TS.bb[o + 4] - y).toFixed(2) + ':' + (TS.bb[o + 1] - y).toFixed(2); return true; } return false; }); return out; };
  for (let k = 0; k < N; k++) {
    const q = pts[Math.floor(rnd() * pts.length)], mo = new Motor(col, { stepHeight: 0.8 }); mo.teleport(new V(q.x, q.y + 0.05, q.z));
    let a = rnd() * 6.28, last = mo.pos.clone(), still = 0, wedged = false, bad = false;
    if (col.tris && col.tris.blocks(mo.pos.x, mo.pos.y, mo.pos.z, mo.radius, mo.height)) { why.atStart = (why.atStart || 0) + 1; wedged = true; } // (dropped into one: not the motor's doing)
    for (let i = 0; i < 720; i++) {
      if (i % 90 === 0) a = rnd() * 6.28;
      if (i % 150 === 75) mo.requestJump();
      mo.step(1 / 120, Math.sin(a), Math.cos(a), 4.9);
      if (!wedged && col.tris && col.tris.blocks(mo.pos.x, mo.pos.y, mo.pos.z, mo.radius, mo.height)) { wedged = true; const c = culprit(mo) || '?'; const k = c.split(':').slice(0, 2).join(':') + (mo.grounded ? ' grounded' : ' air'); why[k] = (why[k] || 0) + 1; if (Object.keys(why).length < 40 && !why['eg ' + k]) why['eg ' + k] = c; }
      if (i % 24 === 0) { if (mo.pos.distanceTo(last) < 0.15) still += 24; else still = 0; last.copy(mo.pos); if (still >= 240) { bad = true; break; } }
    }
    if (wedged) wedgedEver++;
    if (bad) stuck.push([+mo.pos.x.toFixed(1), +mo.pos.y.toFixed(1), +mo.pos.z.toFixed(1), wedged, mo.grounded, col.fits(mo.pos.x, mo.pos.y + 0.02, mo.pos.z, mo.radius, mo.height), culprit(mo), +q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1)]);
  }
  return { map: MAP, nodes: pts.length, runs: N, stuck: stuck.length, wedgedEver, why, at: stuck.slice(0, 15) };
}, { MAP, N })));
await b.close(); srv.close();

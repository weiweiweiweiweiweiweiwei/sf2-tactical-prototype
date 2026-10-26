// Triangle collision probe (v60 TriSoup): a synthetic world of triangles — floor, a 30° and a 55° slope, a wall, a 5 cm plank,
// a 0.6 m step, a low ceiling — walked by the real CharacterMotor (0.8 m step, as on the Apex maps). Exits 1 on a failure.
// node tools/_trimesh.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }), page = await b.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
await page.evaluate(async () => { Object.assign(SF2.Settings.data.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); });
const out = await page.evaluate(() => {
  const m = app.match, World = m.collision.constructor, Motor = m.player.motor.constructor, V = SF2.THREE.Vector3, R = [];
  const ok = (name, c, info = '') => R.push(`${c ? 'PASS' : 'FAIL'} ${name} ${info}`);
  // quads → triangles; each quad is 4 corners (counter-clockwise from above for floors)
  const P = [], I = [];
  const quad = (a, b, c, d) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const box = (x0, y0, z0, x1, y1, z1) => { // closed box of triangles (top, 4 sides, bottom)
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // bottom (faces down)
  };
  quad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50]); // floor
  // lane A (x −2..2), walking −z: 30° slope from z=−5 up 10 m of run → height 5.77
  const t30 = Math.tan(Math.PI / 6); quad([-2, 0, -5], [2, 0, -5], [2, 10 * t30, -15], [-2, 10 * t30, -15]); box(-2, 0, -25, 2, 10 * t30, -15);
  // lane B (x 6..10): 55° slope
  const t55 = Math.tan(55 * Math.PI / 180); quad([6, 0, -5], [10, 0, -5], [10, 4 * t55, -9], [6, 4 * t55, -9]);
  // lane C (x 14..18): 5 cm plank at z −5..−5.3, then a 0.6 m step from z −8, then a wall at z −14
  box(14, 0, -5.3, 18, 0.05, -5); box(14, 0, -40, 18, 0.6, -8); box(13, 0, -14.4, 19, 4, -14);
  // lane D (x 22..26): a 2.2 m ceiling
  box(22, 2.2, -10, 26, 2.4, -2);
  const w = new World(); w.addTris(new Float32Array(P), new Uint32Array(I));
  const run = (x, steps, jumpAt = -1, z0 = 0) => {
    const mo = new Motor(w, { stepHeight: 0.8 }); mo.teleport(new V(x, 0.02, z0)); let maxDrop = 0, prevY = mo.pos.y, airborne = 0, maxY = 0;
    for (let i = 0; i < steps; i++) { if (i === jumpAt) mo.requestJump(); mo.step(1 / 120, 0, -1, 5.9); maxDrop = Math.max(maxDrop, prevY - mo.pos.y); prevY = mo.pos.y; if (!mo.grounded) airborne++; maxY = Math.max(maxY, mo.pos.y); }
    return { mo, maxDrop, airborne, maxY };
  };
  let r = run(0, 420); ok('30° slope walked up without a jump', r.mo.pos.y > 5.5 && r.mo.pos.z < -15, `y ${r.mo.pos.y.toFixed(2)} z ${r.mo.pos.z.toFixed(1)}`);
  ok('…as a slope (never airborne, no step jolts)', r.airborne < 3 && r.maxDrop < 0.05, `airborne steps ${r.airborne}`);
  r = run(8, 360); ok('55° slope blocks', r.mo.pos.y < 1 && r.mo.pos.z > -6.5, `y ${r.mo.pos.y.toFixed(2)} z ${r.mo.pos.z.toFixed(2)}`);
  r = run(16, 600); ok('5 cm plank and 0.6 m step walked over, wall stops', Math.abs(r.mo.pos.y - 0.6) < 0.02 && r.mo.pos.z > -14.1 && r.mo.pos.z < -13.4, `y ${r.mo.pos.y.toFixed(2)} z ${r.mo.pos.z.toFixed(2)}`);
  r = run(24, 240, 30, -4); ok('a jump under a 2.2 m ceiling stops at it', r.maxY < 2.2 - 1.8 + 0.05, `max feet y ${r.maxY.toFixed(2)}`);
  const h = w.raycast(new V(16, 1.5, -10), new V(0, 0, -1), 50); ok('a shot hits the wall at 4 m', h && Math.abs(h.t - 4) < 0.01 && h.normal.z > 0.9, h ? `t ${h.t.toFixed(3)}` : 'no hit');
  const gb = w.groundBelow(0, 3, -10, 0.12, 2); ok('groundBelow on the slope (highest point under the footprint)', gb && gb.y >= 5 * t30 - 0.01 && gb.y < 5 * t30 + 0.12 * t30 + 0.01, JSON.stringify(gb) + ' tris ' + w.tris.groundAt(0, 3, -10, 0.12, 2));
  ok('fits in the open, not inside the wall', w.fits(16, 0.6, -12, 0.34, 1.8) && !w.fits(16, 0.6, -14.2, 0.34, 1.8));
  return R;
});
console.log(out.join('\n')); if (errs.length) console.log(errs);
await b.close(); srv.close();
const failed = out.some((l) => l.startsWith('FAIL')) || errs.length; console.log(failed ? 'TRIMESH_FAIL' : 'TRIMESH_OK'); process.exit(failed ? 1 : 0);

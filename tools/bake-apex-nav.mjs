// Full-range Apex navigation, baked offline with the game's own collision code (headless Chrome over http): runtime
// sampling of the ~1 km map would take minutes and unpack every collision cell.
//   node tools/bake-apex-nav.mjs [apex_full | apex_skulltown]  → assets/maps/<dir>/nav.bin + nav.json (packed by tools/pack-apex-js.mjs)
// v60 triangle maps (Skull Town): candidates are the floor triangles under each grid point, the cover test casts a ray up.
// 1. candidates: every 2.5 m, each box top a capsule can stand on (NavGraph.walkable), plus the village's 0.5 m points.
// 2. walk links (≤ 3.6 m, diagonals too): sampled every 0.3 m like the motor — rises ≤ the Apex step height (0.8 m, v59), drops ≤ 0.85 m,
//    capsule fits — so hills of stepped 1 m columns connect (the runtime rule, |dy| ≤ 0.5 per 2.5 m link, caps them at 11°).
// 3. air links (one-way): drop up to 3 m; jump up 0.5–1.9 m (a double jump reaches ~2.4 m) where a shaft over the lower
//    node and the path across at the upper height are clear — then each one is played out with the game's own motor and the
//    bots' jump rule (src/13_bots.js _follow), and kept only if it lands.
// 4. kept: the nodes that can both reach and be reached from the village (no one-way traps).
// 5. spawns: Alpha west / Bravo east, 150–240 m apart, no line of sight; forward groups; Domination points and the relic
//    along the line between them; aiBounds = the reachable area (bots' lanes and push direction).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MAP = process.argv[2] || 'apex_full', ROOT = process.cwd();
const OPT = { apex_full: { out: 'assets/maps/apex-range/', dist: [150, 240] }, apex_skulltown: { out: 'assets/maps/apex-skulltown/', dist: [110, 190] } }[MAP], OUT = OPT.out;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--js-flags=--max-old-space-size=6144'] });
const page = await b.newPage(); page.on('console', (m) => { if (/^\[bake\]/.test(m.text())) console.log(m.text()); });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
page.setDefaultTimeout(0);
const r = await page.evaluate(async ({ MAP, DIST }) => {
  const log = (...a) => console.log('[bake]', ...a), t0 = performance.now();
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === MAP), rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch();
  for (const d of app.match.builder.mechs[0].doors) app.match.collision.setSolid(d.col, false); // v59: doorways are walkable (bots open doors)
  const g = app.match, col = g.collision, nav = g.nav, B = g.def.bounds, GRID = 2.5, STEP = g.player.motor.stepHeight, tmp = [], CFG_JUMP = 7.0; // CFG.player.jumpVel

  // 1. candidates
  const nodes = [], hash = new Map(), HC = 3, hk = (x, z) => (Math.floor(x / HC) + 1000) * 4000 + Math.floor(z / HC) + 1000;
  const near = (x, z, r, fn) => { for (let ix = Math.floor((x - r) / HC); ix <= Math.floor((x + r) / HC); ix++) for (let iz = Math.floor((z - r) / HC); iz <= Math.floor((z + r) / HC); iz++) { const l = hash.get((ix + 1000) * 4000 + iz + 1000); if (l) for (const i of l) fn(i); } };
  const add = (x, y, z) => {
    let dup = false; near(x, z, 1, (i) => { const n = nodes[i]; if (Math.hypot(n[0] - x, n[2] - z) < 1 && Math.abs(n[1] - y) < 0.3) dup = true; });
    if (dup) return; const k = hk(x, z); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(nodes.length); nodes.push([x, y, z]);
  };
  if (g.def._full) for (const p of g.def._full.data.nav) { const y = nav.walkable(p[0], p[1], p[2]); if (y !== null) add(p[0], y, p[2]); }
  const TS = col.tris, V3 = SF2.THREE.Vector3, UP = new V3(0, 1, 0);
  for (let x = B.minX + 1; x <= B.maxX - 1; x += GRID) {
    for (let z = B.minZ + 1; z <= B.maxZ - 1; z += GRID) {
      col.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, tmp);
      const tops = [];
      for (const bx of tmp) if (bx.blocksMove && bx.max.y > -150 && bx.min.x <= x && bx.max.x >= x && bx.min.z <= z && bx.max.z >= z) tops.push(bx.max.y);
      if (TS) TS.each(x, z, x, z, (t) => { if (TS.cls[t] !== 0) return false; const h = SF2.triHeight(TS.v, t * 9, x, z); if (h !== null) tops.push(h); return false; });
      tops.sort((a, c) => a - c); let last = -1e9;
      for (const t of tops) { if (t - last < 0.3) continue; last = t; const y = nav.walkable(x, t, z); if (y !== null) add(x, y, z); }
    }
    if (Math.round(x) % 100 === 0) await new Promise((r) => setTimeout(r));
  }
  log('candidates', nodes.length, Math.round((performance.now() - t0) / 1000) + 's');

  // 2 + 3. links
  // a step of `st` at most between samples; tried with 0.45 m first (keeps to the floor past low clutter), then the full step
  const walkSt = (a, c, st) => {
    const dx = c[0] - a[0], dz = c[2] - a[2], n = Math.ceil(Math.hypot(dx, dz) / 0.3); let y = a[1];
    for (let i = 1; i <= n; i++) {
      const x = a[0] + dx * i / n, z = a[2] + dz * i / n, gr = col.groundBelow(x, y + st, z, 0.12, st + 0.15, 0.02);
      if (!gr || gr.steep || !col.fits(x, gr.y + st + 0.01, z, 0.36, 1.86 - st)) return false; // above step height, up to the 1.8 m head
      y = gr.y;
    }
    return Math.abs(y - c[1]) < 0.3;
  };
  const walk = (a, c) => walkSt(a, c, 0.45) || walkSt(a, c, STEP);
  const air = (lo, hi) => { // a shaft over the lower node up to the upper height, then across at the upper height
    if (!col.fits(lo[0], lo[1] + 0.05, lo[2], 0.36, hi[1] - lo[1] + 1.95)) return false; // the 1.8 m player (radius 0.34) over the arc
    const dx = hi[0] - lo[0], dz = hi[2] - lo[2], n = Math.ceil(Math.hypot(dx, dz) / 0.3);
    for (let i = 1; i <= n; i++) if (!col.fits(lo[0] + dx * i / n, hi[1] + 0.08, lo[2] + dz * i / n, 0.36, 1.85)) return false;
    return true;
  };
  const out = nodes.map(() => []), edges = []; let walks = 0, drops = 0, jumps = 0;
  const link = (a, c, cost, kind) => { out[a].push(c); if (!(kind & 1)) out[c].push(a); edges.push(a, c, kind, cost); };
  for (let a = 0; a < nodes.length; a++) {
    const A = nodes[a];
    near(A[0], A[2], 3.6, (c) => {
      if (c <= a) return;
      const C = nodes[c], d = Math.hypot(A[0] - C[0], A[2] - C[2]), dy = C[1] - A[1];
      if (d > 3.6 || d < 0.3) return;
      let ac = false, ca = false;
      if (Math.abs(dy) <= STEP * Math.ceil(d) + 0.1) {
        ac = walk(A, C); ca = walk(C, A);
        if (ac && ca) { link(a, c, d, 0); walks++; return; }
        if (ac) { link(a, c, d, 1); walks++; } if (ca) { link(c, a, d, 1); walks++; }
      }
      // a direction that cannot be walked may still be a drop (down) or a jump (up)
      if (d > 2.8 || Math.abs(dy) <= 0.5 || Math.abs(dy) > 3) return;
      const [lo, hi, l, h] = dy > 0 ? [A, C, a, c] : [C, A, c, a], downOk = dy > 0 ? ca : ac, upOk = dy > 0 ? ac : ca;
      if (!air(lo, hi)) return;
      if (!downOk) { link(h, l, d + 1 + Math.abs(dy) * 0.3, 1); drops++; }
      if (!upOk && Math.abs(dy) <= 1.9) { link(l, h, d + 4, 3); jumps++; }
    });
    if (a % 20000 === 0) { log('linked', a, '/', nodes.length); await new Promise((r) => setTimeout(r)); }
  }
  log('links', { walks, drops, jumps }, Math.round((performance.now() - t0) / 1000) + 's');
  // play out every air link: run at the upper / lower node like a bot (4.9 m/s), jump where the ground just ahead rises past a
  // step, double jump near the top of the arc while below the target; it must stand within 1.2 m of the target in 2.5 s
  const Motor = g.player.motor.constructor, P = CFG_JUMP, sim = new Motor(col, { stepHeight: STEP });
  const plays = (a, c, jump) => {
    const A = nodes[a], C = nodes[c]; sim.teleport(new SF2.THREE.Vector3(A[0], A[1] + 0.02, A[2])); sim.vel.set(0, 0, 0);
    let ledge = false, air = false;
    for (let s = 0; s < 300; s++) {
      const dx = C[0] - sim.pos.x, dz = C[2] - sim.pos.z, d = Math.hypot(dx, dz), wx = d > 0.05 ? dx / d : 0, wz = d > 0.05 ? dz / d : 0;
      if (sim.grounded) {
        if (Math.abs(sim.pos.y - C[1]) < 0.35 && d < 1.2 && s > 5) return true;
        ledge = false; air = false;
        if (jump && C[1] - sim.pos.y > 0.3) { const ah = col.groundBelow(sim.pos.x + wx * 0.75, sim.pos.y + 2.6, sim.pos.z + wz * 0.75, 0.2, 2.6); if (ah && ah.y > sim.pos.y + STEP - 0.03) { sim.requestJump(); ledge = true; } }
      } else if (ledge && !air && sim.vel.y < 1.2 && sim.pos.y < C[1] + 0.15) { sim.vel.y = P; air = true; }
      sim.step(1 / 120, wx, wz, d > 0.05 ? 4.9 : 0);
      if (sim.pos.y < Math.min(A[1], C[1]) - 4) return false;
    }
    return false;
  };
  let dropped = 0;
  for (let i = 0; i < edges.length; i += 4) {
    const k = edges[i + 2]; if (!(k & 1) || (k === 1 && Math.abs(nodes[edges[i]][1] - nodes[edges[i + 1]][1]) <= 0.5)) continue; // walk links stay
    if (!plays(edges[i], edges[i + 1], k === 3)) { edges[i + 2] = -1; dropped++; }
    if (i % 40000 === 0) await new Promise((r) => setTimeout(r));
  }
  for (const l of out) l.length = 0;
  for (let i = 0; i < edges.length; i += 4) { const k = edges[i + 2]; if (k < 0) continue; out[edges[i]].push(edges[i + 1]); if (!(k & 1)) out[edges[i + 1]].push(edges[i]); }
  log('air links played out:', dropped, 'of', drops + jumps, 'fail', Math.round((performance.now() - t0) / 1000) + 's');

  // 4. strongly connected with the village
  const inc = nodes.map(() => []); out.forEach((l, a) => { for (const c of l) inc[c].push(a); });
  // largest strongly connected component (Kosaraju, iterative): every kept node can reach every other one and back
  const N = nodes.length, order = [], seen = new Uint8Array(N), comp = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (seen[i]) continue; const st = [[i, 0]]; seen[i] = 1;
    while (st.length) { const top = st[st.length - 1], l = out[top[0]]; if (top[1] < l.length) { const j = l[top[1]++]; if (!seen[j]) { seen[j] = 1; st.push([j, 0]); } } else { order.push(top[0]); st.pop(); } }
  }
  const size = [];
  for (let k = N - 1; k >= 0; k--) {
    const i = order[k]; if (comp[i] >= 0) continue; const c = size.length, st = [i]; comp[i] = c; let n = 0;
    while (st.length) { const j = st.pop(); n++; for (const q of inc[j]) if (comp[q] < 0) { comp[q] = c; st.push(q); } }
    size.push(n);
  }
  const big = size.reduce((bi, v, i) => (v > size[bi] ? i : bi), 0), keep = new Int32Array(N).fill(-1), kept = [];
  log('components', size.length, 'largest', size[big], 'next', size.slice().sort((a, c) => c - a).slice(1, 6).join(','));
  nodes.forEach((n, i) => { if (comp[i] === big) { keep[i] = kept.length; kept.push(n); } });
  const E = [];
  for (let i = 0; i < edges.length; i += 4) { const a = keep[edges[i]], c = keep[edges[i + 1]]; if (a >= 0 && c >= 0 && edges[i + 2] >= 0) E.push(a, c, edges[i + 2], edges[i + 3]); }
  log('kept', kept.length, 'of', nodes.length, 'edges', E.length / 4);

  // 5. spawns, objectives, AI area
  const kh = new Map(); kept.forEach((n, i) => { const k = hk(n[0], n[2]); let l = kh.get(k); if (!l) kh.set(k, l = []); l.push(i); });
  const knear = (p, r, fn) => { for (let ix = Math.floor((p[0] - r) / HC); ix <= Math.floor((p[0] + r) / HC); ix++) for (let iz = Math.floor((p[2] - r) / HC); iz <= Math.floor((p[2] + r) / HC); iz++) { const l = kh.get((ix + 1000) * 4000 + iz + 1000); if (l) for (const i of l) fn(i); } };
  const deg = new Uint8Array(kept.length); for (let i = 0; i < E.length; i += 4) if (E[i + 2] === 0) { deg[E[i]]++; deg[E[i + 1]]++; }
  const roomy = (i) => { let c = 0; knear(kept[i], 8, (j) => { const q = kept[j]; if (deg[j] >= 4 && Math.hypot(q[0] - kept[i][0], q[2] - kept[i][2]) < 8 && Math.abs(q[1] - kept[i][1]) < 1.5) c++; }); return c; };
  const V = SF2.THREE.Vector3, eye = (p) => new V(p[0], p[1] + 1.6, p[2]);
  const covered = (p) => col.query(p[0] - 0.1, p[2] - 0.1, p[0] + 0.1, p[2] + 0.1, tmp).some((bx) => bx.min.y > p[1] + 2 && bx.min.y < p[1] + 12) || (TS && !!TS.raycast(new V3(p[0], p[1] + 2, p[2]), UP, 10));
  const open = []; for (let i = 0; i < kept.length; i++) if (deg[i] >= 6 && !covered(kept[i])) open.push(i);
  let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cen = kept.reduce((a, n) => [a[0] + n[0] / kept.length, 0, a[2] + n[2] / kept.length], [0, 0, 0]);
  let best = null, bs = -Infinity;
  for (let k = 0; k < 60000; k++) {
    const a = kept[open[Math.floor(rnd() * open.length)]], c = kept[open[Math.floor(rnd() * open.length)]];
    if (a[0] >= c[0]) continue;
    const d = Math.hypot(c[0] - a[0], c[2] - a[2]); if (d < DIST[0] || d > DIST[1] || c[0] - a[0] < 0.6 * d) continue;
    const mid = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2], sc = -Math.hypot(mid[0] - cen[0], mid[2] - cen[2]) - Math.abs(a[1] - c[1]) * 0.5 + rnd() * 10;
    if (sc <= bs || col.segmentClear(eye(a), eye(c))) continue;
    const ra = roomy(kept.indexOf(a)), rc = roomy(kept.indexOf(c)); if (ra < 14 || rc < 14) continue;
    best = [a, c]; bs = sc;
  }
  if (!best) throw new Error('no spawn pair');
  const snap = (p, r = 25) => { let bi = -1, bd = Infinity; for (const i of open) { const q = kept[i], d = Math.hypot(q[0] - p[0], q[2] - p[2]); if (d < r && d < bd && roomy(i) >= 10) { bd = d; bi = i; } } return bi >= 0 ? kept[bi] : null; };
  const group = (c, foe, n) => { // up to n spots ≥ 1.6 m apart around c, none in sight of the enemy anchor
    const pts = [c];
    knear(c, 14, (j) => { const q = kept[j]; if (pts.length >= n || deg[j] < 4 || Math.hypot(q[0] - c[0], q[2] - c[2]) > 14 || Math.abs(q[1] - c[1]) > 3) return;
      if (pts.some((p) => Math.hypot(p[0] - q[0], p[2] - q[2]) < 1.6) || col.segmentClear(eye(q), eye(foe))) return; pts.push(q); });
    return pts;
  };
  const [A, C] = best, yawTo = (p, q) => Math.atan2(-(q[0] - p[0]), -(q[2] - p[2]));
  const lerp3 = (t, off = 0) => { const dx = C[0] - A[0], dz = C[2] - A[2], l = Math.hypot(dx, dz); return [A[0] + dx * t - dz / l * off, 0, A[2] + dz * t + dx / l * off]; };
  const fwd = (t, foe) => [-38, 38].map((o) => snap(lerp3(t, o))).filter(Boolean).map((p) => ({ pts: group(p, foe, 6), yaw: yawTo(p, foe) }));
  const meta = {
    spawns: { alpha: { pts: group(A, C, 10), yaw: yawTo(A, C) }, bravo: { pts: group(C, A, 10), yaw: yawTo(C, A) } },
    forward: { alpha: fwd(0.3, C), bravo: fwd(0.7, A) },
    objectives: { dom: [0.25, 0.5, 0.75].map((t) => snap(lerp3(t))), relic: snap(lerp3(0.5)), domRadius: 5 },
    aiBounds: kept.reduce((bb, n) => ({ minX: Math.min(bb.minX, n[0]), maxX: Math.max(bb.maxX, n[0]), minZ: Math.min(bb.minZ, n[2]), maxZ: Math.max(bb.maxZ, n[2]) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }),
    counts: { nodes: kept.length, edges: E.length / 4, walks, drops, jumps, candidates: nodes.length, seconds: Math.round((performance.now() - t0) / 1000) },
  };
  log('spawns', JSON.stringify(A), JSON.stringify(C), 'dist', Math.round(Math.hypot(C[0] - A[0], C[2] - A[2])));
  return { pos: kept.flat(), edges: E, meta };
}, { MAP, DIST: OPT.dist });
await b.close(); srv.close();
// nav.bin: u32 node count, u32 edge count, Float32 x y z per node, then per edge Int32 from, to, kind (0 both ways, 1 one way,
// 3 one-way jump) and Float32 cost
const n = r.pos.length / 3, m = r.edges.length / 4, buf = Buffer.alloc(8 + n * 12 + m * 16);
buf.writeUInt32LE(n, 0); buf.writeUInt32LE(m, 4);
r.pos.forEach((v, i) => buf.writeFloatLE(v, 8 + i * 4));
for (let i = 0; i < m; i++) { const o = 8 + n * 12 + i * 16; buf.writeInt32LE(r.edges[i * 4], o); buf.writeInt32LE(r.edges[i * 4 + 1], o + 4); buf.writeInt32LE(r.edges[i * 4 + 2], o + 8); buf.writeFloatLE(r.edges[i * 4 + 3], o + 12); }
fs.writeFileSync(OUT + 'nav.bin', buf); fs.writeFileSync(OUT + 'nav.json', JSON.stringify(r.meta));
console.log(r.meta.counts, (buf.length / 1e6).toFixed(1) + ' MB');

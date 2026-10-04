/* =====================================================================
   MAPS — six point-symmetric arenas (fair for both teams).
   `objectives` = Domination A/B/C [x, y, z] + Relic spawn (snapped to
   the nav mesh at load); the Relic extraction zone is the Alpha spawn.
   All Domination points sit on the x = 0 centre line, so each one is
   exactly the same distance from the Alpha and the Bravo spawn.
   Alpha (blue) spawns west (x<0) facing +x, Bravo (red) east.
   Mirror helper M(s): x→s·x, z→s·z.
   ===================================================================== */
const HDRI_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/';

/* ---------------------------------------------------------------------
   v5 RIDGE OUTPOST heightfield: point-symmetric (h(x,z) = h(-x,-z)).
   Rolling valleys, a north-south mountain ridge with one pass (fort B)
   and two gaps (A / C), spawn basins behind horseshoe ridges, hills,
   crags, a quarry pit, flattened building pads and grade-limited dirt
   roads. Returns sample(x, z) → { h, rock, dirt }.
   ------------------------------------------------------------------- */
function makeRidgeTerrain() {
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  const fbm = (x, z, o) => { let s = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { s += a * vn(x * f + k * 17.3, z * f - k * 9.1); n += a; f *= 2.03; a *= 0.5; } return s / n; };
  const ridged = (x, z) => { let s = 0, a = 0.55, f = 1; for (let k = 0; k < 3; k++) { s += a * (1 - Math.abs(vn(x * f, z * f) * 2 - 1)); f *= 2.1; a *= 0.5; } return s; };
  const S = (fn) => (x, z) => 0.5 * (fn(x, z) + fn(-x, -z)); // point-symmetric version of any field
  const gauss = (dx, dz, r) => Math.exp(-(dx * dx + dz * dz) / (r * r));
  // piecewise smooth profile through [t, v] control points
  const prof = (pts) => (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i], k = sm(a, b, t); return va + (vb - va) * k; }
    return pts[pts.length - 1][1];
  };
  const ridgeH = prof([[0, 13.5], [14, 17], [34, 31], [50, 21], [70, 6.5], [90, 17], [112, 34], [150, 36]]);
  const ridgeW = prof([[0, 34], [20, 20], [34, 14], [52, 18], [70, 30], [95, 20], [130, 24]]);
  const baseN = S((x, z) => fbm(x / 70, z / 70, 3) * 9 + fbm(x / 21, z / 21, 3) * 3.2);
  const roughN = S((x, z) => ridged(x / 11, z / 11));
  const detailN = S((x, z) => fbm(x / 6.5, z / 6.5, 2));

  // ---------- alpha-half features (every one is mirrored through the centre) ----------
  const SA = [-116, 0];
  const hills = [ // [x, z, radius, height, rock]
    [-76, 58, 17, 12.5, 0.2], [-92, -62, 19, 13, 0.1], [-44, 100, 24, 17, 0.3], [-66, -22, 11, 5.5, 0], [-30, -30, 12, 4.5, 0],
    [-64, -50, 20, 11, 0.3], [-100, 95, 22, 16, 0.4], [-20, 118, 16, 12, 0.5], [-122, 56, 16, 14, 0.3], [-122, -52, 18, 15, 0.3],
  ];
  const crags = [[-40, -96, 13, 7.5], [-86, 34, 7, 4.5], [-24, 52, 8, 5.5], [-106, -30, 7, 5]]; // rocky outcrops (ridged)
  const pads = [ // flattened building / objective plateaus: [cx, cz, halfX, halfZ, y, blend]
    [SA[0], SA[1], 13, 13, 5, 9],       // spawn basin floor
    [-58, 40, 16, 11, 7.2, 8],          // mountain village
    [-66, -48, 10, 7, 3.4, 3.2, 1],     // quarry pit (cut into the hill; soft: its ramp road overrides it)
    [0, 0, 14, 14, 16.6, 9],            // pass fort (B)
    [0, 72, 11, 10, 8.0, 8],            // north gap outpost (A) — mirror is C
    [-76, 58, 5.5, 5.5, 16.2, 5],       // hilltop watchtower
  ];
  const roads = [ // alpha-half polylines [x, z]
    { w: 3.6, pts: [[-104, 0], [-98, 12], [-90, 24], [-78, 32], [-66, 36], [-50, 34], [-38, 26], [-28, 16], [-22, 8], [-14, 3], [0, 0]] },
    { w: 3.4, pts: [[-104, 0], [-98, -12], [-92, -26], [-86, -40], [-76, -58], [-62, -62], [-48, -64], [-34, -68], [-18, -71], [0, -72]] },
    { w: 3.0, pts: [[-58, 44], [-54, 56], [-44, 64], [-30, 69], [-14, 72], [0, 72]] },
    { w: 2.8, g: 0.34, pts: [[-72, 36], [-80, 40], [-83, 47], [-77, 52], [-76, 58]] },  // switchbacks up to the watchtower
    { w: 3.0, g: 0.34, pts: [[-48, -64], [-52, -57], [-58, -52], [-66, -49]] },  // ramp down into the quarry
    { w: 3.0, pts: [[-116, 0], [-104, 0]] },
  ];

  const ring = (x, z) => { // horseshoe ridge around the spawn basin, two mouths toward the roads
    const dx = x - SA[0], dz = z - SA[1], d = Math.hypot(dx, dz);
    if (d > 48) return 0;
    const a = Math.atan2(dz, dx), gap = (c) => { let q = Math.abs(a - c); if (q > Math.PI) q = 2 * Math.PI - q; return Math.exp(-(q * q) / 0.028); };
    const open = clamp01(gap(0.62) + gap(-0.62));
    const q = (d - 25) / 6.8, g = Math.exp(-q * q);
    return 14 * g * (1 - open) + 2.4 * g;
  };
  const F = (x, z) => { // additive alpha features
    let h = ring(x, z), rock = 0;
    for (const [hx, hz, r, hh, rk] of hills) { const g = gauss(x - hx, z - hz, r); if (g > 0.003) { h += hh * g; rock = Math.max(rock, rk * g); } }
    for (const [cx, cz, r, hh] of crags) { const g = gauss(x - cx, z - cz, r); if (g > 0.01) { h += hh * g * (0.45 + ridged(x / 3.2, z / 3.2)); rock = Math.max(rock, sm(0.25, 0.55, g)); } }
    return [h, rock];
  };

  // raw height (before pads / roads)
  const raw = (x, z) => {
    const az = Math.abs(z), R = ridgeH(az), W = ridgeW(az), rg = Math.exp(-(x / W) * (x / W));
    let h = baseN(x, z) + R * rg * (0.82 + 0.34 * roughN(x, z));
    const [fa, ra] = F(x, z), [fb, rb] = F(-x, -z); h += fa + fb;
    const e = Math.pow(Math.abs(x) ** 6 + Math.abs(z) ** 6, 1 / 6), p = Math.max(0, e - 127);
    // perimeter range: a steep wall right behind the playable edge, then a capped ragged skyline (≈50–80 m)
    h += Math.pow(Math.min(p, 14), 1.42) * 0.95 + 26 * sm(10, 40, p) + (ridged(x / 31, z / 31) - 0.45) * 21 * sm(6, 30, p) + Math.min(p, 20) * roughN(x * 0.42, z * 0.42) * 0.55;
    const rock = Math.max(ra, rb, sm(8, 16, p), rg * sm(22, 30, R) * 0.9);
    return [h + (detailN(x, z) - 0.5) * 0.8, rock];
  };
  const allPads = pads.concat(pads.map(([x, z, hx, hz, y, b, soft]) => [-x, -z, hx, hz, y, b, soft]));
  const sdBox = (x, z, cx, cz, hx, hz) => { const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0); };
  const padded = (x, z) => {
    let [h, rock] = raw(x, z), dirt = 0;
    for (const [cx, cz, hx, hz, y, b] of allPads) {
      const d = sdBox(x, z, cx, cz, hx, hz); if (d > b) continue;
      const k = 1 - sm(0, b, d); h += (y - h) * k; rock *= 1 - k; dirt = Math.max(dirt, (1 - sm(-2, 1.5, d)) * 0.55);
    }
    return [h, rock, dirt];
  };
  // roads: resample every 2 m, height = smoothed + grade-limited terrain profile
  const allRoads = roads.concat(roads.map((r) => ({ w: r.w, g: r.g, pts: r.pts.map(([x, z]) => [-x, -z]) })));
  const segs = [];
  for (const r of allRoads) {
    const P = [];
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    P.push(r.pts[r.pts.length - 1]);
    // Catmull-Rom-ish smoothing of the xz path (keeps ends)
    for (let it = 0; it < 3; it++) for (let i = 1; i < P.length - 1; i++) { P[i][0] = (P[i - 1][0] + P[i][0] * 2 + P[i + 1][0]) / 4; P[i][1] = (P[i - 1][1] + P[i][1] * 2 + P[i + 1][1]) / 4; }
    let Y = P.map(([x, z]) => padded(x, z)[0]);
    for (let it = 0; it < 4; it++) Y = Y.map((y, i) => (i === 0 || i === Y.length - 1 ? y : (Y[i - 1] + y * 2 + Y[i + 1]) / 4));
    const G = r.g || 0.2;
    for (let i = 1; i < Y.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); Y[i] = Math.min(Math.max(Y[i], Y[i - 1] - G * d), Y[i - 1] + G * d); }
    for (let i = Y.length - 2; i >= 0; i--) { const d = Math.hypot(P[i][0] - P[i + 1][0], P[i][1] - P[i + 1][1]); Y[i] = Math.min(Math.max(Y[i], Y[i + 1] - G * d), Y[i + 1] + G * d); }
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], m = r.w + 5;
      segs.push({ ax, az, bx, bz, ya: Y[i], yb: Y[i + 1], w: r.w, x0: Math.min(ax, bx) - m, x1: Math.max(ax, bx) + m, z0: Math.min(az, bz) - m, z1: Math.max(az, bz) + m });
    }
  }
  const sample = (x, z) => {
    let [h, rock, dirt] = padded(x, z);
    let best = Infinity, by = 0, bw = 0;
    for (const s of segs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = clamp01(((x - s.ax) * dx + (z - s.az) * dz) / L2);
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
      if (d < best) { best = d; by = s.ya + (s.yb - s.ya) * t; bw = s.w; }
    }
    if (best < Infinity) {
      const k = 1 - sm(bw * 0.5, bw * 0.5 + 4.5, best);
      h += (by - h) * k; rock *= 1 - k;
      dirt = Math.max(dirt, 1 - sm(bw * 0.38, bw * 0.62, best));
    }
    for (const [cx, cz, hx, hz, y, b, soft] of allPads) { // pads are authoritative (roads merge into them)
      if (soft) continue;
      const d = sdBox(x, z, cx, cz, hx, hz); if (d > b) continue;
      const k = 1 - sm(0, b * 0.8, d); h += (y - h) * k;
    }
    return { h, rock, dirt };
  };
  return { sample, pads: allPads, roads: allRoads, spawn: SA };
}

// Hill-shaded relief image of a terrain (lobby previews and the radar), cached per size.
function terrainShade(T, B, px = 256) {
  T._shade = T._shade || {};
  if (T._shade[px]) return T._shade[px];
  const c = document.createElement('canvas'); c.width = c.height = px;
  const ctx = c.getContext('2d'), img = ctx.createImageData(px, px), d = img.data, sx = (B.maxX - B.minX) / px, sz = (B.maxZ - B.minZ) / px;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = B.minX + (i + 0.5) * sx, z = B.minZ + (j + 0.5) * sz, h = T.heightAt(x, z), g = T.gradAt(x, z), nl = Math.hypot(g.x, 1, g.z);
    const lam = clamp((0.5 * g.x + 0.78 + 0.42 * g.z) / nl, 0, 1), rk = T._w(T.wRock, x, z), dt = T._w(T.wDirt, x, z);
    let r = 64 + h * 0.9, gg = 86 + h * 0.7, bb = 50 + h * 0.4;
    r += (120 - r) * rk; gg += (116 - gg) * rk; bb += (108 - bb) * rk; r += (150 - r) * dt; gg += (122 - gg) * dt; bb += (82 - bb) * dt;
    const k = 0.35 + 0.8 * lam, ct = ((h % 5) + 5) % 5 < 0.25 ? 0.82 : 1, o = (i + j * px) * 4;
    d[o] = Math.min(255, r * k * ct); d[o + 1] = Math.min(255, gg * k * ct); d[o + 2] = Math.min(255, bb * k * ct); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); T._shade[px] = c;
  return c;
}

// `look`: SF2 / UE3-style levels (see LOOK_DEFAULT in 15_postfx.js), matched to SF2 screenshots in v17 and carried over in v24:
// SF2 interiors sit at mean luma ≈ 0.16–0.18 with chroma ≈ 0.01–0.02, its sunny exteriors at luma ≈ 0.45, chroma ≈ 0.035.
const MAPS = [
  {
    id: 'warehouse', name: '廢棄倉庫', en: 'WAREHOUSE', desc: '室內 · 貨櫃巷道與二樓鐵網走廊 · 60×40', slogan: 'CLOSE QUARTERS · 室內近戰與中距離交火',
    look: { exposure: 0.66, desat: 0.53, contrast: 1.16, pivot: 0.3, midtones: 1.05 }, // low-key interior: pools of light, near-neutral shadows
    bounds: { minX: -30, maxX: 30, minZ: -20, maxZ: 20 }, indoor: true, navLevels: [0, 4.2],
    hdri: 'empty_warehouse_01', hdriBackground: false, background: 0x15181b, envIntensity: 0.3,
    sun: { pos: [-16, 42, 10], color: 0xfff0d2, intensity: 3.6 }, hemi: [0xb9c4d0, 0x3b352d, 0.12], exposure: 1.0,
    fog: { color: 0x1a1d20, near: 35, far: 110 }, acoustics: 'warehouse', ambience: 'warehouse',
    shot: { pos: [-24, 7.5, 16], target: [4, 1.5, -2] },
    objectives: { dom: [[0, 0, 15], [0, 0, 0], [0, 0, -15]], relic: [0, 0, 0], domRadius: 3.6 },
    build(b) {
      const CY = 4.2, sunDir = new THREE.Vector3(16, -42, -10).normalize();
      b.box(-31, -1, -21, 31, 0, 21, 'polished', { cast: false, radar: false });
      b.box(-31, 0, -21, -30, 15, 21, 'siding', { radar: 'wall' }); b.box(30, 0, -21, 31, 15, 21, 'siding', { radar: 'wall' });
      b.box(-30, 0, -21, 30, 15, -20, 'siding', { radar: 'wall' }); b.box(-30, 0, 20, 30, 15, 21, 'siding', { radar: 'wall' });
      for (const [z0, z1] of [[-21, -12.5], [-9.5, -1.5], [1.5, 9.5], [12.5, 21]]) b.box(-31, 15, z0, 31, 15.4, z1, 'roof', { physics: false, radar: false });
      if (!b.dry) {
        const sky = b.lib.basic('skylight', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.82, 0.9, 1).multiplyScalar(1.0) })); // v17: 2.2 clipped to pure white strips
        for (const [z0, z1] of [[-12.5, -9.5], [-1.5, 1.5], [9.5, 12.5]]) { const g = new THREE.PlaneGeometry(62, z1 - z0); g.rotateX(Math.PI / 2); g.translate(0, 15.35, (z0 + z1) / 2); b._batch(sky, g, false); }
      }
      for (let x = -27; x <= 27; x += 6) b.deco(x - 0.15, 13.6, -20, x + 0.15, 14.2, 20, 'darkSteel');
      for (const z of [-11, 0, 11]) b.deco(-30, 14.2, z - 0.1, 30, 14.5, z + 0.1, 'darkSteel');
      for (const x of [-24, -12, 0, 12, 24]) for (const z of [-19.8, 19.8]) b.box(x - 0.3, 0, z - 0.2, x + 0.3, 15, z + 0.2, 'steel', { radar: false });
      for (const z of [-14, -7, 7, 14]) for (const x of [-29.8, 29.8]) b.box(x - 0.2, 0, z - 0.3, x + 0.2, 15, z + 0.3, 'steel', { radar: false });
      for (const zs of [-1, 1]) { // catwalks
        const zi = zs * 17.5, zo = zs * 20;
        b.slab(-30, Math.min(zi, zo), 30, Math.max(zi, zo), CY, 0.2, 'plate');
        b.deco(-30, CY - 0.012, zi - 0.08, 30, CY + 0.012, zi + 0.08, 'yellowSteel', { cast: false });
        for (let x = -27; x <= 27; x += 6) b.box(x - 0.1, 0, zi + zs * 0.3 - 0.1, x + 0.1, CY - 0.2, zi + zs * 0.3 + 0.1, 'steel', { radar: false });
        b.deco(-30, CY - 0.5, zi - 0.08, 30, CY - 0.2, zi + 0.08, 'darkSteel');
        b.railingWithGaps(zi, -30, 30, [[-24, -21.5], [21.5, 24], [-1.25, 1.25], [-18 * zs - 0.6, -18 * zs + 0.6]], true, CY);
        b.box(-18 * zs - 0.6, 0, Math.min(zi, zi + zs * 0.2), -18 * zs + 0.6, CY - 0.2, Math.max(zi, zi + zs * 0.2), 'plate', { radar: false }); // ladder backing panel
        b.ladder(-18 * zs, zi, 0, CY, zs > 0 ? '-z' : '+z', { mat: 'yellowSteel' });
      }
      b.slab(-1.25, -17.5, 1.25, 17.5, CY, 0.2, 'plate');
      b.railingWithGaps(-1.25, -17.5, 17.5, [[-17.5, -15.5]], false, CY); b.railingWithGaps(1.25, -17.5, 17.5, [[15.5, 17.5]], false, CY);
      for (const z of [-11, -4.5, 4.5, 11]) b.box(-0.25, 0, z - 0.25, 0.25, CY - 0.2, z + 0.25, 'steel', { radar: 'crate' });
      b.ramp({ minX: -24, maxX: -21.5, minZ: -17.5, maxZ: -9.5, axis: 'z', dir: -1, y0: 0, y1: CY });
      b.ramp({ minX: -24, maxX: -21.5, minZ: 9.5, maxZ: 17.5, axis: 'z', dir: 1, y0: 0, y1: CY });
      b.ramp({ minX: 21.5, maxX: 24, minZ: 9.5, maxZ: 17.5, axis: 'z', dir: 1, y0: 0, y1: CY });
      b.ramp({ minX: 21.5, maxX: 24, minZ: -17.5, maxZ: -9.5, axis: 'z', dir: -1, y0: 0, y1: CY });
      b.stairs({ axis: 'x', from: -8.4, dir: 1, a0: -17.44, a1: -15.5, steps: 14, rise: 0.3, run: 0.4 });
      b.box(-2.8, 0, -17.44, -1.25, CY, -15.5, 'plate', { radar: 'ramp' });
      b.stairs({ axis: 'x', from: 8.4, dir: -1, a0: 15.5, a1: 17.44, steps: 14, rise: 0.3, run: 0.4 });
      b.box(1.25, 0, 15.5, 2.8, CY, 17.44, 'plate', { radar: 'ramp' });
      const C = [[-18, -5.5, 'z', 1, 1], [-18, 5.5, 'z', 2, 0], [-10, -6, 'x', 1, 2], [-10, 6, 'x', 1, 3], [-12, -12.5, 'x', 2, 4], [-12, 12.5, 'x', 1, 1], [-5, -9, 'z', 1, 0], [-5, 9.5, 'z', 1, 2]];
      b.sym((s) => { for (const [x, z, a, st, c] of C) b.container(x * s, z * s, a, st, s > 0 ? c : c + 4); });
      const K = [[-20.0, -7.6, 1.3], [-13.65, -6, 1.3], [-13.65, 6, 1.3], [-15.65, 12.5, 1.3], [-5, -5.35, 1.3], [-23.4, -3.2, 1.3], [-23.4, 3.2, 1.3], [-22.25, -3.2, 0.9],
        [-8.6, 0, 1.2], [-14.6, 0.9, 0.9], [-27.6, -15.6, 1.2], [-26.3, -15.9, 0.9], [-27.6, 15.6, 1.2], [-9.5, -15.2, 1.1], [-15.5, 16.2, 1.2]];
      b.sym((s) => {
        for (const [x, z, sz] of K) b.crate(x * s, z * s, sz);
        // v18 spawn screen: 2.5 m crate wall across the centre aisle (no spawn-to-spawn sightline; exits on both flanks)
        for (const z of [-1.89, -0.63, 0.63, 1.89]) { b.crate(-23.4 * s, z * s, 1.26); b.crate(-23.4 * s, z * s, 1.2, 1.26); }
        b.crate(-23.4 * s, 3.2 * s, 1.2, 1.3); b.crate(-23.4 * s, -3.2 * s, 1.2, 1.3);
        b.crate(-27.6 * s, -15.6 * s, 0.8, 1.2);
        for (const [x, z, r] of [[-27.9, -9.6, 1], [-27.2, -10.3, 0], [-28.2, -10.5, 1], [-10.6, 18.6, 0], [-11.3, 19.1, 1]]) b.barrel(x * s, z * s, r);
        b.pallet(-26 * s, 10.5 * s, 0, 1.0); b.pallet(-26 * s, 12 * s);
        b.floorDecal(-16 * s, -1.5 * s, 5, 3, 0.4, 'puddle'); b.floorDecal(-3 * s, 14 * s, 4, 2.4, 1.2, 'puddle'); b.floorDecal(-20 * s, 9 * s, 6, 6, 0.2, 'grime'); b.floorDecal(-8 * s, -13 * s, 7, 5, 2.2, 'grime');
      });
      b.paintRect(-29.5, -6.5, -24.2, 6.5); b.paintRect(24.2, -6.5, 29.5, 6.5);
      for (let x = -21; x <= 21; x += 3) if (Math.abs(x) > 1.5) b.paint(x - 0.7, -0.07, x + 0.7, 0.07);
      for (const zs of [-1, 1]) b.paint(-20, zs * 15.2 - 0.07, 20, zs * 15.2 + 0.07);
      b.letter('A', -27, 0, Math.PI / 2); b.letter('B', 27, 0, -Math.PI / 2);
      b.sign('ALPHA', '#6fb6ff', -29.98, 8, 0, Math.PI / 2); b.sign('BRAVO', '#ff6a5f', 29.98, 8, 0, -Math.PI / 2);
      for (const x of [-20, -10, 0, 10, 20]) for (const z of [-6, 6]) b.lamp(x, z, 11, { top: 13.6, light: (x === -10 || x === 10) || (x === 0 && z === 6), intensity: 110, distance: 32, pool: 5.5 });
      for (let x = -27; x <= 27; x += 12) for (const [z0, z1] of [[-12.5, -9.5], [-1.5, 1.5], [9.5, 12.5]]) b.shaft(x - 2.6, z0, x + 2.6, z1, 15, sunDir, 0.045);
      b.dustMotes(-28, -18, 28, 18, 0.5, 9, 900, 0.3);
      b.spawnZone('alpha', -29.4, -6, -24.6, 6, -Math.PI / 2); b.spawnZone('bravo', 24.6, -6, 29.4, 6, Math.PI / 2);
    },
  },
  {
    id: 'desert', name: '沙漠小鎮', en: 'DESERT TOWN', desc: '戶外 · 烈日廣場、屋頂狙擊點 · 80×56', slogan: 'HIGH NOON · 屋頂、巷弄與中央噴泉廣場',
    look: { desat: 0.44, contrast: 1.14, pivot: 0.4, highlights: 1.06 },
    bounds: { minX: -40, maxX: 40, minZ: -28, maxZ: 28 }, indoor: false, navLevels: [0, 3.8],
    hdri: 'qwantani_noon_puresky', hdriBackground: true, envIntensity: 0.48, sky: { turbidity: 6, rayleigh: 1.2, elevation: 55, azimuth: 150 },
    sun: { pos: [30, 60, -20], color: 0xfff1d6, intensity: 3.0, auto: true }, hemi: [0xdce8ff, 0x8a6c48, 0.55], exposure: 0.9,
    fog: { color: 0xd8cfbd, near: 60, far: 190 }, acoustics: 'outdoor', ambience: 'desert',
    shot: { pos: [-12, 11, 24], target: [2, 1, -2] },
    objectives: { dom: [[0, 0, 19], [0, 0, 0], [0, 0, -19]], relic: [0, 0, 6.5], domRadius: 4 },
    build(b) {
      b.box(-45, -1, -33, 45, 0, 33, 'sand', { cast: false, radar: false });
      b.plane(-10, -10, 10, 10, 0.003, 'pavers'); b.plane(-40, -4, -10, 4, 0.003, 'pavers'); b.plane(10, -4, 40, 4, 0.003, 'pavers');
      for (const [x0, z0, x1, z1] of [[-41, -29, 41, -28], [-41, 28, 41, 29], [-41, -28, -40, 28], [40, -28, 41, 28]]) b.box(x0, 0, z0, x1, 8, z1, 'plaster', { radar: 'wall' });
      b.cyl(0, 0, 2.6, 0, 0.8, 'concreteWall', { seg: 28 }); b.cyl(0, 0, 0.45, 0.8, 3.4, 'plasterWhite', { collide: false });
      if (!b.dry) { const wm = b.lib.basic('fountainWater', () => new THREE.MeshPhysicalMaterial({ color: 0x2c5560, roughness: 0.14, metalness: 0, transparent: true, opacity: 0.85 })); const wg = new THREE.CircleGeometry(2.35, 28); wg.rotateX(-Math.PI / 2); wg.translate(0, 0.72, 0); b._batch(wm, wg, false); }
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s;
        b.box(X(-31), 0, Z(5), X(-21), 6.5, Z(14), 'plaster', { radar: 'building' });
        b.box(X(-31), 6.5, Z(5), X(-21), 7.3, Z(5.3), 'plaster', { radar: false });
        b.room(Math.min(X(-18), X(-11)), Math.min(Z(6), Z(12)), Math.max(X(-18), X(-11)), Math.max(Z(6), Z(12)), {
          h: 4, t: 0.3, mat: s > 0 ? 'plasterRed' : 'plaster', roof: 'roof',
          open: s > 0 ? { s: [{ a: -15.6, b: -13.6 }], e: [{ a: 8, b: 10 }], w: [{ a: 8.4, b: 9.8, y0: 1.2, y1: 2.2 }] } : { n: [{ a: 13.6, b: 15.6 }], w: [{ a: -10, b: -8 }], e: [{ a: -9.8, b: -8.4, y0: 1.2, y1: 2.2 }] },
        });
        b.crate(X(-16.8), Z(10.8), 1.1); b.box(X(-13.8), 0, Z(10.6), X(-11.8), 1.0, Z(11.5), 'wood', { material: 'wood', radar: 'crate' });
        // rooftop building with external stairs
        b.box(X(-30), 0, Z(-16), X(-20), 3.8, Z(-6), 'plaster', { radar: 'building' });
        b.stairs({ axis: 'z', from: Z(-6.6), dir: -s, a0: Math.min(X(-19.9), X(-18.5)), a1: Math.max(X(-19.9), X(-18.5)), steps: 13, rise: 3.8 / 13, run: 0.45, mat: 'plaster', nosing: 'wood' });
        b.box(X(-20), 0, Z(-16), X(-18.5), 3.8, Z(-12.45), 'plaster', { radar: 'building' });
        for (const [x0, z0, x1, z1] of [[-30, -16, -18.5, -15.75], [-30, -6.25, -20, -6], [-30, -16, -29.75, -6], [-18.75, -16, -18.5, -12.45]]) b.box(X(x0), 3.8, Z(z0), X(x1), 4.8, Z(z1), 'plaster', { radar: false });
        b.box(X(-20.25), 3.8, Z(-9.2), X(-20), 4.8, Z(-6), 'plaster', { radar: false });
        b.box(X(-31), 0, Z(18), X(-24), 7, Z(27), 'plaster', { radar: 'building' });
        b.box(X(-12), 0, Z(-26), X(-5), 5, Z(-20.5), 'plasterWhite', { radar: 'building' });
        for (const [x, z, c] of [[-18, 21, 'canvasRed'], [-11, 24, 'canvasBlue'], [-6, 18.5, 'canvasRed']]) {
          for (const [dx, dz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) b.box(X(x + dx) - 0.05, 0, Z(z + dz) - 0.05, X(x + dx) + 0.05, 2.5, Z(z + dz) + 0.05, 'wood', { radar: false });
          b.deco(X(x - 1.5), 2.5, Z(z - 1.1), X(x + 1.5), 2.56, Z(z + 1.1), c);
          b.box(X(x - 1.1), 0, Z(z - 0.5), X(x + 1.1), 0.95, Z(z + 0.5), 'wood', { material: 'wood', radar: 'crate', penetrable: true });
        }
        b.box(X(-9), 0, Z(-8.3), X(-5), 1.2, Z(-7.7), 'plaster', { radar: 'sandbag' }); b.box(X(-8.3), 0, Z(-8), X(-7.7), 1.2, Z(-4.6), 'plaster', { radar: 'sandbag' });
        b.box(X(-9), 0, Z(7.7), X(-5), 1.2, Z(8.3), 'plaster', { radar: 'sandbag' });
        b.tree(X(-9.5), Z(5.2)); b.tree(X(-13.5), Z(-4.8)); b.tree(X(-35), Z(14)); b.tree(X(-36), Z(-20));
        b.car(X(-23), Z(1.8), 0.2); b.car(X(-3.5), Z(-14), Math.PI / 2);
        // v18 spawn screens: two staggered adobe walls across the main street — an S-bend you can walk through but not see through
        b.box(X(-30.3), 0, Z(-6), X(-29.7), 2.6, Z(0.5), 'plaster', { radar: 'wall' }); b.deco(X(-30.4), 2.6, Z(-6), X(-29.6), 2.72, Z(0.6), 'plasterWhite');
        b.box(X(-26.3), 0, Z(-0.8), X(-25.7), 2.6, Z(5), 'plaster', { radar: 'wall' }); b.deco(X(-26.4), 2.6, Z(-0.9), X(-25.6), 2.72, Z(5), 'plasterWhite');
        b.wallX(Z(-17.5), Math.min(X(-19), X(-6)), Math.max(X(-19), X(-6)), 0, 4.2, 0.8, 'plaster',
          (s > 0 ? [[-17, -14.8], [-12.6, -10.4], [-8.2, -6]] : [[6, 8.2], [10.4, 12.6], [14.8, 17]]).map(([a, bb]) => ({ a, b: bb, y1: 3 })), { radar: 'wall' });
        for (const [x, z, sz] of [[-26, -3, 1.2], [-26, -1.8, 0.9], [-17, -2.6, 1.1], [-33, 9, 1.2], [-22, 23, 1.2], [-3, 23, 1.1], [-16, -23, 1.2], [-28, -24, 1.2]]) b.crate(X(x), Z(z), sz);
        for (const [x, z, r] of [[-18.5, 15.5, 1], [-19.2, 16.1, 0], [-7, -25, 1]]) b.barrel(X(x), Z(z), r);
      });
      b.spawnZone('alpha', -38.6, -6, -33, 6, -Math.PI / 2); b.spawnZone('bravo', 33, -6, 38.6, 6, Math.PI / 2);
    },
  },
  {
    id: 'harbor', name: '港口碼頭', en: 'HARBOR DOCKS', desc: '戶外黃昏 · 貨櫃迷宮、龍門吊、貨櫃塔 · 84×48', slogan: 'SUNSET PORT · 貨櫃掩體與高處狙擊塔',
    look: { exposure: 0.92, desat: 0.29, contrast: 1.1, pivot: 0.38 },
    bounds: { minX: -42, maxX: 42, minZ: -24, maxZ: 24 }, indoor: false, navLevels: [0, 5.2],
    hdri: 'industrial_sunset_02_puresky', hdriBackground: true, envIntensity: 0.55, bgIntensity: 0.8, sky: { turbidity: 9, rayleigh: 2.5, elevation: 7, azimuth: 250 },
    sun: { pos: [-60, 18, 30], color: 0xffc38a, intensity: 3.2, auto: true }, hemi: [0x9fb4d8, 0x4a3a2c, 0.55], exposure: 1.0,
    fog: { color: 0xc9a58a, near: 55, far: 180 }, acoustics: 'outdoor', ambience: 'harbor',
    shot: { pos: [-30, 12, -18], target: [0, 2, 6] },
    objectives: { dom: [[0, 0, 15], [0, 0, 5], [0, 0, -15]], relic: [0, 0, 5], domRadius: 4 },
    build(b) {
      b.box(-47, -1.5, -29, 47, 0, 24, 'asphalt', { cast: false, radar: false });
      b.box(-47, -1.5, 24, 47, 0, 24.6, 'concreteWall', { radar: false });
      b.box(-42, 0, 23.6, 42, 1.1, 24.1, null, { blocksShot: false, radar: 'fence' });
      if (!b.dry) {
        for (let x = -40; x <= 40; x += 4) b.cyl(x, 24.2, 0.22, 0, 0.7, 'darkSteel', { collide: false, seg: 12 });
        b.deco(-42, 0.55, 24.15, 42, 0.62, 24.25, 'yellowSteel', { cast: false });
        const wn = b.tf.pbr('waterN', (A, H, R, S) => { A.fillStyle = '#fff'; A.fillRect(0, 0, S, S); b.tf.N(H, S, 6, 5, 777, 'source-over', 1); }, { normal: 3, size: 512 }).normalMap;
        wn.repeat.set(24, 12);
        const wm = new THREE.MeshPhysicalMaterial({ color: 0x1b3440, roughness: 0.16, metalness: 0, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.2 });
        const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), wm); water.rotation.x = -Math.PI / 2; water.position.set(0, -1.3, 94); water.receiveShadow = true; b.scene.add(water);
        b.animated.push((dt) => { wn.offset.x += dt * 0.004; wn.offset.y += dt * 0.009; });
        b.box(-46, -1.4, 34, 18, 9, 48, 'rust', { collide: false, radar: false }); b.box(-40, 9, 38, -18, 17, 46, 'whiteSteel', { collide: false, radar: false });
        b.box(-8, 9, 36, 16, 10.5, 46, 'rust', { collide: false, radar: false });
      }
      b.box(-42, 0, -25, 42, 11, -24, 'brick', { radar: 'wall' });
      b.box(-43, 0, -24, -42, 8, 24, 'siding', { radar: 'wall' }); b.box(42, 0, -24, 43, 8, 24, 'siding', { radar: 'wall' });
      for (const [x, z] of [[-5, 6], [5, 6], [-5, 20], [5, 20]]) b.box(x - 0.55, 0, z - 0.55, x + 0.55, 16, z + 0.55, 'yellowSteel', { radar: 'crate' });
      b.deco(-5.6, 16, 5.4, 5.6, 17.4, 6.6, 'yellowSteel'); b.deco(-5.6, 16, 19.4, 5.6, 17.4, 20.6, 'yellowSteel');
      b.deco(-5.6, 17.4, 4, -4.4, 18.6, 22, 'yellowSteel'); b.deco(4.4, 17.4, 4, 5.6, 18.6, 22, 'yellowSteel'); b.deco(-2.5, 14.5, 11, 2.5, 17.4, 14.5, 'whiteSteel');
      b.box(-7, 6, -10, 7, 6.3, 0, 'roof', { radar: false, physics: false });
      for (const [x, z] of [[-7, -10], [7, -10], [-7, 0], [7, 0], [0, -10], [0, 0]]) b.box(x - 0.2, 0, z - 0.2, x + 0.2, 6, z + 0.2, 'steel', { radar: 'crate' });
      b.box(-7, 0, -10.2, -1.5, 3, -9.9, 'siding', { radar: 'wall' }); b.box(1.5, 0, -10.2, 7, 3, -9.9, 'siding', { radar: 'wall' });
      b.box(-7.2, 0, -8.5, -6.9, 1.3, -1.5, 'siding', { radar: 'sandbag' }); b.box(6.9, 0, -8.5, 7.2, 1.3, -1.5, 'siding', { radar: 'sandbag' });
      b.box(-2.2, 0, -6.2, 0.2, 1.8, -4.8, 'yellowSteel', { material: 'metal', radar: 'crate' }); b.box(-2.2, 1.8, -6.2, -0.6, 2.6, -4.8, 'darkSteel', { material: 'metal', radar: false });
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s;
        const C = [[-26, 10, 'x', 2, 0], [-26, -12, 'x', 1, 1], [-18, 3, 'z', 1, 2], [-18, 16, 'z', 3, 3], [-12, -6, 'x', 2, 4], [-12, 13, 'x', 1, 5], [-5, -18, 'x', 1, 6], [-20, -19, 'x', 1, 7], [-33, 16, 'z', 2, 1], [-34, -16, 'z', 1, 2]];
        for (const [x, z, a, st, c] of C) b.container(X(x), Z(z), a, st, s > 0 ? c : c + 3);
        b.container(X(-30), Z(-4), 'z', 2, s > 0 ? 5 : 1);
        b.stairs({ axis: 'x', from: X(-22.83), dir: -s, a0: Math.min(Z(-5.2), Z(-3.8)), a1: Math.max(Z(-5.2), Z(-3.8)), steps: 17, rise: 0.3, run: 0.35, mat: 'plate' });
        b.railing(Math.min(X(-31.22), X(-28.78)), Z(-7), Math.max(X(-31.22), X(-28.78)), Z(-7), 5.2, 'yellowSteel');
        b.railing(Math.min(X(-31.22), X(-28.78)), Z(-1), Math.max(X(-31.22), X(-28.78)), Z(-1), 5.2, 'yellowSteel');
        for (const [x, z, sz] of [[-22, -9, 1.2], [-22, -10.3, 0.9], [-9, 2, 1.2], [-9, 3.3, 0.9], [-29, 3, 1.1], [-15, -14, 1.2], [-3, 12, 1.1], [-37, -3, 1.0], [-37, 4, 1.0]]) b.crate(X(x), Z(z), sz);
        for (const [x, z, r] of [[-14.5, 20, 1], [-15.2, 20.6, 0], [-24, 21, 0], [-10, -21, 1]]) b.barrel(X(x), Z(z), r);
        for (const [x, z] of [[-21, 21], [-8, -12], [-30, -21]]) b.pallet(X(x), Z(z), 0, 1.0);
        b.lamp(X(-20), Z(0.5), 7, { top: 7.6, light: true, color: 0xffb46b, intensity: 70, distance: 26 });
        b.box(X(-20) - 0.1, 0, Z(0.5) - 0.1, X(-20) + 0.1, 7.6, Z(0.5) + 0.1, 'darkSteel', { radar: false });
        for (let x = -36; x <= -8; x += 4) b.paint(X(x) - 1, Z(-22) - 0.07, X(x) + 1, Z(-22) + 0.07, 0xe8e8e8);
        b.floorDecal(X(-14), Z(8), 5, 3, 0.3, 'puddle'); b.floorDecal(X(-24), Z(-2), 6, 5, 1.1, 'grime');
      });
      b.lamp(0, -14, 7, { top: 7.6, light: true, color: 0xffb46b, intensity: 70, distance: 26 }); b.box(-0.1, 0, -14.1, 0.1, 7.6, -13.9, 'darkSteel', { radar: false });
      b.paintRect(-40.6, -8, -34.4, 8, 0.14, 0xe8e8e8); b.paintRect(34.4, -8, 40.6, 8, 0.14, 0xe8e8e8);
      b.letter('A', -37.5, 0, Math.PI / 2); b.letter('B', 37.5, 0, -Math.PI / 2);
      b.spawnZone('alpha', -40.6, -7.5, -34.8, 7.5, -Math.PI / 2); b.spawnZone('bravo', 34.8, -7.5, 40.6, 7.5, Math.PI / 2);
    },
  },
  {
    id: 'office', name: '辦公大樓', en: 'OFFICE TOWER', desc: '室內 · 挑高中庭、玻璃會議室、雙層陽台 · 56×40', slogan: 'CORPORATE · 隔間、走廊與中庭陽台的近距離交戰',
    look: { exposure: 0.66, desat: 0.22, contrast: 1.12, pivot: 0.32, midtones: 1.03 },
    bounds: { minX: -28, maxX: 28, minZ: -20, maxZ: 20 }, indoor: true, navLevels: [0, 3.6],
    hdri: 'modern_buildings_2', hdriBackground: true, envIntensity: 0.3, sky: { turbidity: 4, rayleigh: 1, elevation: 35, azimuth: 120 }, bloom: 1.2,
    sun: { pos: [35, 40, 25], color: 0xfff3e0, intensity: 2.4, auto: true }, hemi: [0xe8eef8, 0x5a5044, 0.25], exposure: 0.78,
    fog: { color: 0x9aa4ad, near: 40, far: 160 }, acoustics: 'office', ambience: 'office',
    shot: { pos: [-7.2, 5.2, -7.2], target: [5, 1.2, 4] },
    objectives: { dom: [[0, 0, 12.8], [0, 0, 0], [0, 0, -12.8]], relic: [0, 0, 0], domRadius: 3.4 },
    build(b) {
      b.box(-29, -1, -21, 29, 0, 21, 'carpet', { cast: false, radar: false });
      b.plane(-28, -8, -19, 8, 0.002, 'tileFloor'); b.plane(19, -8, 28, 8, 0.002, 'tileFloor'); b.plane(-8, -8, 8, 8, 0.002, 'tileFloor');
      const win = (from, to, step) => { const o = []; for (let a = from; a + 2.6 <= to; a += step) o.push({ a: a + 0.4, b: a + step - 0.4, y0: 0.9, y1: 3.1, glass: true }); return o; };
      b.wallX(-20, -28, 28, 0, 3.9, 0.35, 'officeWall', win(-28, 28, 4), { radar: 'wall' });
      b.wallX(20, -28, 28, 0, 3.9, 0.35, 'officeWall', win(-28, 28, 4), { radar: 'wall' });
      b.wallZ(-28, -20, 20, 0, 3.9, 0.35, 'officeWall', [...win(-20, -8, 4), { a: -2.2, b: 2.2, y0: 0, y1: 2.9, glass: true }, ...win(8, 20, 4)], { radar: 'wall' });
      b.wallZ(28, -20, 20, 0, 3.9, 0.35, 'officeWall', [...win(-20, -8, 4), { a: -2.2, b: 2.2, y0: 0, y1: 2.9, glass: true }, ...win(8, 20, 4)], { radar: 'wall' });
      b.box(-28, 3.6, -20, -8, 3.9, 20, 'ceiling', { radar: false }); b.box(8, 3.6, -20, 28, 3.9, 20, 'ceiling', { radar: false });
      b.box(-8, 3.6, 8, 8, 3.9, 20, 'ceiling', { radar: false }); b.box(-8, 3.6, -20, 8, 3.9, -8, 'ceiling', { radar: false });
      b.box(-8, 3.6, 7.75, 8, 7.6, 8, 'officeWall', { radar: false }); b.box(-8, 3.6, -8, 8, 7.6, -7.75, 'officeWall', { radar: false });
      b.box(-8, 3.9, -7.75, -7.75, 7.6, 7.75, 'officeWall', { radar: false }); b.box(7.75, 3.9, -7.75, 8, 7.6, 7.75, 'officeWall', { radar: false });
      for (const [x0, z0, x1, z1] of [[-8, -8, 8, -4], [-8, 4, 8, 8], [-8, -4, -4, 4], [4, -4, 8, 4]]) b.box(x0, 7.6, z0, x1, 7.9, z1, 'ceiling', { radar: false, physics: false });
      if (!b.dry) { const sk = b.lib.basic('skyGlass', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(0.9), transparent: true, opacity: 0.3, depthWrite: false })); const g = new THREE.PlaneGeometry(8, 8); g.rotateX(Math.PI / 2); g.translate(0, 7.75, 0); const m = new THREE.Mesh(g, sk); m.userData.noAO = true; b.scene.add(m); }
      b.slab(-7.75, 5, 7.75, 7.75, 3.6, 0.25, 'tileFloor'); b.slab(-7.75, -7.75, 7.75, -5, 3.6, 0.25, 'tileFloor');
      b.railingWithGaps(5, -7.75, 7.75, [[6.5, 7.75]], true, 3.6, 'whiteSteel'); b.railingWithGaps(-5, -7.75, 7.75, [[-7.75, -6.5]], true, 3.6, 'whiteSteel');
      b.stairs({ axis: 'z', from: 1.5, dir: -1, a0: -7.75, a1: -6.5, steps: 12, rise: 0.3, run: 0.54, mat: 'tileFloor', nosing: 'whiteSteel' });
      b.stairs({ axis: 'z', from: -1.5, dir: 1, a0: 6.5, a1: 7.75, steps: 12, rise: 0.3, run: 0.54, mat: 'tileFloor', nosing: 'whiteSteel' });
      for (const [x, z] of [[-4, 5], [4, 5], [-4, -5], [4, -5]]) b.box(x - 0.3, 0, z - 0.3, x + 0.3, 3.35, z + 0.3, 'officeWall', { radar: 'crate' });
      b.shaft(-4, -4, 4, 4, 7.6, new THREE.Vector3(-0.35, -0.9, -0.25).normalize(), 0.06);
      const W = (s, z, x0, x1, ops, mat = 'officeWall') => b.wallX(z * s, Math.min(x0 * s, x1 * s), Math.max(x0 * s, x1 * s), 0, 3.6, 0.2, mat, ops.map((o) => Object.assign({}, o, s > 0 ? {} : { a: -o.b, b: -o.a })), { radar: 'wall' });
      const Wz = (s, x, z0, z1, ops, mat = 'officeWall') => b.wallZ(x * s, Math.min(z0 * s, z1 * s), Math.max(z0 * s, z1 * s), 0, 3.6, 0.2, mat, ops.map((o) => Object.assign({}, o, s > 0 ? {} : { a: -o.b, b: -o.a })), { radar: 'wall' });
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s;
        Wz(s, -19, -8, 8, [{ a: -2.5, b: 2.5, y1: 2.8 }]);
        // north row (both halves); the point mirror produces the south row
        W(s, 8, -28, -19, [{ a: -24.6, b: -23 }, { a: -27.6, b: -24.6, y0: 0.9, y1: 3.1, glass: true }, { a: -23, b: -19.4, y0: 0.9, y1: 3.1, glass: true }]);
        W(s, 8, -19, -8, [{ a: -17.4, b: -15.8 }, { a: -11.6, b: -10 }]);
        W(s, 8, -8, 0, [{ a: -5, b: -3.4 }]);
        W(s, 8, 8, 19, [{ a: 10, b: 11.6 }, { a: 15.8, b: 17.4 }]);
        W(s, 8, 19, 28, [{ a: 22.4, b: 24 }]);
        for (const x of [-19, -13.5, -8, 8, 13.5, 19]) Wz(s, x, 8.1, 19.8, []);
        Wz(s, 0, 8.1, 19.8, [{ a: 12, b: 13.6 }]);
        b.box(X(-23), 0, Z(-3), X(-21.6), 1.1, Z(3), 'desk', { radar: 'crate' }); b.deco(X(-23.2), 1.1, Z(-3.1), X(-21.5), 1.16, Z(3.1), 'whiteSteel');
        b.box(X(-22.5), 1.16, Z(-3.1), X(-22.1), 2.4, Z(3.1), 'officeWall', { radar: false }); // v18 reception screen on the desk: blocks the spawn-to-spawn sightline, keeps the 2.5 m walkway to the door
        for (const z of [-6, 5.5]) b.box(X(-27.2), 0, Z(z), X(-26.2), 0.8, Z(z + 2.4), 'partition', { material: 'carpet', radar: 'crate', penetrable: true });
        b.box(X(-26), 0, Z(12.5), X(-21), 0.76, Z(15.5), 'desk', { material: 'wood', radar: 'crate', penetrable: true });
        for (const [cx, cz] of [[-17, 3], [-17, -6], [-12.5, 3], [-12.5, -6]]) {
          b.box(X(cx), 0, Z(cz + 1.45), X(cx + 3.6), 1.25, Z(cz + 1.55), 'partition', { material: 'carpet', penetrable: true, radar: 'fence' });
          b.box(X(cx), 0, Z(cz), X(cx + 0.06), 1.25, Z(cz + 3), 'partition', { material: 'carpet', penetrable: true, radar: 'fence' });
          b.box(X(cx), 0, Z(cz + 0.1), X(cx + 3.4), 0.74, Z(cz + 0.8), 'desk', { material: 'wood', penetrable: true, radar: 'crate' });
          b.box(X(cx), 0, Z(cz + 2.2), X(cx + 3.4), 0.74, Z(cz + 2.9), 'desk', { material: 'wood', penetrable: true, radar: 'crate' });
        }
        b.box(X(-18.6), 0, Z(17.5), X(-14), 0.76, Z(19.2), 'desk', { material: 'wood', radar: 'crate' }); b.box(X(-13), 0, Z(9), X(-8.6), 0.76, Z(10.5), 'desk', { material: 'wood', radar: 'crate' });
        b.box(X(9), 0, Z(17.5), X(13), 0.76, Z(19.2), 'desk', { material: 'wood', radar: 'crate' }); b.box(X(14.2), 0, Z(9), X(18.4), 0.76, Z(10.4), 'desk', { material: 'wood', radar: 'crate' });
        for (const [x, z, sz] of [[21, 18, 1.2], [22.3, 18, 1.0], [26.5, 11, 1.2], [26.5, 12.3, 0.9], [24, 15, 1.1]]) b.crate(X(x), Z(z), sz);
        b.box(X(-18.6), 0, Z(8.4), X(-17.8), 1.9, Z(11), 'darkSteel', { material: 'metal', radar: 'crate' });
        for (let x = -7.4; x <= -1.4; x += 1.5) b.box(X(x), 0, Z(15), X(x + 0.8), 2.1, Z(18.8), 'darkSteel', { material: 'metal', radar: 'crate' });
        b.box(X(1), 0, Z(18), X(7.6), 0.95, Z(19.6), 'desk', { material: 'wood', radar: 'crate' }); b.box(X(3), 0, Z(11), X(6), 0.95, Z(13), 'desk', { material: 'wood', radar: 'crate' });
        for (const [x, z] of [[-26.8, -7.2], [-19.8, -7.2], [-8.8, 7.2]]) { b.cyl(X(x), Z(z), 0.3, 0, 0.6, 'darkSteel', { seg: 12, radar: 'crate' }); if (!b.dry) { const c = new THREE.ConeGeometry(0.55, 1.4, 10); c.translate(X(x), 1.25, Z(z)); b.geo(c, 'foliage'); } }
        b.light(X(-23.5), 3.3, Z(0), 0xfff4e6, 45, 18); b.light(X(-13.5), 3.3, Z(0), 0xfff4e6, 40, 16);
        b.sign(s > 0 ? 'ALPHA' : 'BRAVO', s > 0 ? '#6fb6ff' : '#ff6a5f', X(-27.8), 3.0, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 0.8);
      });
      for (let x = -26; x <= 26; x += 4) for (let z = -18; z <= 18; z += 4) if (Math.abs(x) > 9 || Math.abs(z) > 9) b.panel(x, z, 3.6, 1.2, 0.6);
      b.light(0, 6.5, 0, 0xfff8ee, 40, 24); b.light(0, 3.2, 13, 0xfff4e6, 22, 14); b.light(0, 3.2, -13, 0xfff4e6, 22, 14);
      b.spawnZone('alpha', -27.3, -6.8, -24, 6.8, -Math.PI / 2); b.spawnZone('bravo', 24, -6.8, 27.3, 6.8, Math.PI / 2);
    },
  },
  {
    id: 'snow', name: '雪地基地', en: 'SNOW BASE', desc: '戶外 · 長視距狙擊、地堡與瞭望塔 · 100×64', slogan: 'FROSTBITE · 長距離狙擊與地堡攻防',
    look: { exposure: 0.76, desat: 0.14, contrast: 1.18, pivot: 0.5, shadows: 0.03 },
    bounds: { minX: -50, maxX: 50, minZ: -32, maxZ: 32 }, indoor: false, navLevels: [0, 3.5, 4.0],
    hdri: 'snow_field_puresky', hdriBackground: true, envIntensity: 0.5, sky: { turbidity: 10, rayleigh: 0.6, elevation: 20, azimuth: 200 },
    sun: { pos: [40, 35, -30], color: 0xe8f0ff, intensity: 2.2, auto: true }, hemi: [0xdfe8f5, 0xa0a8b4, 0.5], exposure: 0.82,
    fog: { color: 0xdbe3ec, near: 45, far: 170 }, acoustics: 'canyon', ambience: 'snow',
    shot: { pos: [-40, 7, 3], target: [0, 1.5, 0] },
    objectives: { dom: [[0, 0, 14], [0, 0, 3], [0, 0, -14]], relic: [0, 0, 3], domRadius: 4.5 },
    build(b) {
      b.box(-80, -1, -60, 80, 0, 60, 'snow', { cast: false, radar: false });
      for (const [x0, z0, x1, z1] of [[-51, -33, 51, -32], [-51, 32, 51, 33], [-51, -32, -50, 32], [50, -32, 51, 32]]) b.box(x0, 0, z0, x1, 4, z1, 'concreteWall', { radar: 'wall' });
      if (!b.dry) for (const [x, z, r] of [[-70, -20, 26], [-75, 25, 30], [70, 18, 28], [72, -26, 26], [0, 62, 34], [10, -64, 36], [-40, 60, 26], [45, -58, 24]]) { const g = new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.45, 1); g.translate(x, -1, z); b.geo(g, 'snow', false); }
      b.room(-6, -4.5, 6, 4.5, { h: 3.2, t: 0.6, mat: 'concreteWall', roof: 'concreteWall', roofT: 0.3,
        open: { n: [{ a: -1, b: 1 }], s: [{ a: -1, b: 1 }], w: [{ a: -4, b: -2, y0: 1.3, y1: 1.75 }, { a: 2, b: 4, y0: 1.3, y1: 1.75 }], e: [{ a: -4, b: -2, y0: 1.3, y1: 1.75 }, { a: 2, b: 4, y0: 1.3, y1: 1.75 }] } });
      b.box(-2, 0, -1, 2, 0.8, 1, 'wood', { material: 'wood', radar: 'crate' });
      b.ramp({ minX: -15, maxX: -6, minZ: -1.5, maxZ: 1.5, axis: 'x', dir: 1, y0: 0, y1: 3.5 }, 'concreteWall');
      b.ramp({ minX: 6, maxX: 15, minZ: -1.5, maxZ: 1.5, axis: 'x', dir: -1, y0: 0, y1: 3.5 }, 'concreteWall');
      b.box(-6, 3.5, -4.5, 6, 4.2, -4.1, 'sandbag', { radar: false, tile: 1 }); b.box(-6, 3.5, 4.1, 6, 4.2, 4.5, 'sandbag', { radar: false, tile: 1 });
      if (!b.dry) { const d = new THREE.SphereGeometry(4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2); d.translate(0, 2, 26.5); b.geo(d, 'whiteSteel'); }
      b.box(-4.2, 0, 22.3, 4.2, 2, 30.7, 'concreteWall', { radar: 'building' }); b.box(-3, 2, 23.5, 3, 4.5, 29.5, null, { radar: false });
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s;
        b.sandbags(X(-20), Z(11.6), X(-14), Z(12.4)); b.sandbags(X(-11), Z(11.6), X(-4), Z(12.4)); b.sandbags(X(-26), Z(-3.4), X(-25.2), Z(3.4));
        b.sandbags(X(-36), Z(-10), X(-30), Z(-9.2)); b.sandbags(X(-36), Z(9.2), X(-30), Z(10));
        b.room(Math.min(X(-32), X(-22)), Math.min(Z(14), Z(21)), Math.max(X(-32), X(-22)), Math.max(Z(14), Z(21)), { h: 3.2, t: 0.25, mat: 'sidingTan', roof: 'roof', eave: 0.3,
          open: s > 0 ? { s: [{ a: -28.8, b: -27.2 }], e: [{ a: 16.6, b: 18.2, y0: 1.1, y1: 2.1 }] } : { n: [{ a: 27.2, b: 28.8 }], w: [{ a: -18.2, b: -16.6, y0: 1.1, y1: 2.1 }] } });
        b.box(X(-31.5), 0, Z(19.4), X(-27), 0.55, Z(20.6), 'wood', { material: 'wood', radar: 'crate' });
        b.box(X(-34), 0, Z(-22), X(-26), 3.4, Z(-15), 'sidingTan', { radar: 'building' }); b.deco(X(-34.3), 3.4, Z(-22.3), X(-25.7), 3.6, Z(-14.7), 'roof');
        for (const [x, z] of [[-37.5, 14.5], [-34.5, 14.5], [-37.5, 17.5], [-34.5, 17.5]]) b.box(X(x) - 0.12, 0, Z(z) - 0.12, X(x) + 0.12, 3.8, Z(z) + 0.12, 'darkSteel', { radar: false });
        b.slab(X(-37.6), Z(14.4), X(-34.4), Z(17.6), 4.0, 0.2, 'wood', { radar: 'catwalk', material: 'wood' });
        b.stairs({ axis: 'z', from: Z(10.5), dir: s, a0: Math.min(X(-37.4), X(-36.2)), a1: Math.max(X(-37.4), X(-36.2)), steps: 13, rise: 4 / 13, run: 0.3, mat: 'wood', nosing: 'darkSteel' });
        for (const [x0, z0, x1, z1] of [[-37.6, 17.5, -34.4, 17.6], [-37.6, 14.4, -37.5, 17.6], [-34.5, 14.4, -34.4, 17.6], [-36.1, 14.4, -34.4, 14.5]]) b.box(X(x0), 4.0, Z(z0), X(x1), 5.0, Z(z1), 'wood', { material: 'wood', radar: false, penetrable: true });
        b.deco(X(-37.8), 6.4, Z(14.2), X(-34.2), 6.6, Z(17.8), 'roof');
        b.cyl(X(-15), Z(21), 2, 0, 5, 'whiteSteel', { seg: 24 }); b.cyl(X(-9.5), Z(23), 1.6, 0, 4, 'whiteSteel', { seg: 24 });
        b.car(X(-20), Z(-6), 0.3, 'darkSteel'); b.car(X(-40), Z(-18), Math.PI / 2 + 0.2, 'darkSteel');
        // v18 spawn screens: staggered concrete T-walls in front of the spawn (walkable, no spawn-to-spawn sightline across the field)
        b.box(X(-40.5), 0, Z(-8), X(-39.7), 2.4, Z(-0.5), 'concreteWall', { radar: 'wall' }); b.box(X(-37.3), 0, Z(-1.5), X(-36.5), 2.4, Z(8), 'concreteWall', { radar: 'wall' });
        for (const [x, z, sz] of [[-22, -12, 1.2], [-22, -13.3, 0.9], [-12, -18, 1.2], [-28, 6, 1.1], [-5, -12, 1.1], [-44, 14, 1.1], [-44, -12, 1.1]]) b.crate(X(x), Z(z), sz);
        for (const [x, z, r] of [[-17, -24, 3.2], [-30, 26, 3.6], [-8, 16, 2.4], [-40, 3.5, 2.2]]) {
          b.box(X(x) - r * 0.55, 0, Z(z) - r * 0.55, X(x) + r * 0.55, r * 0.9, Z(z) + r * 0.55, null, { material: 'concrete', radar: 'solid' });
          if (!b.dry) { const g = new THREE.DodecahedronGeometry(r * 0.75, 1); g.scale(1, 0.62, 1); g.translate(X(x), r * 0.36, Z(z)); b.geo(g, 'concreteWall'); }
        }
        for (const [x, z] of [[-46, 26], [-40, 29], [-30, -29], [-20, 29], [-46, -26]]) b.tree(X(x), Z(z), 'pine', 7);
        b.light(X(-30), 3, Z(17.5), 0xffd8a8, 25, 12);
      });
      b.paintRect(-48.4, -8, -42.2, 8, 0.14, 0x3a4450); b.paintRect(42.2, -8, 48.4, 8, 0.14, 0x3a4450);
      b.snowfall(-50, -32, 50, 32, 2600);
      b.spawnZone('alpha', -48.4, -7.5, -42.6, 7.5, -Math.PI / 2); b.spawnZone('bravo', 42.6, -7.5, 48.4, 7.5, Math.PI / 2);
    },
  },  {
    id: 'ruins', name: '遺跡山丘', en: 'RUINS HILL', desc: '戶外巨型地圖 · 中央兩層山丘與遺跡塔、坡道與梯子 · 200×120', slogan: 'KING OF THE HILL · 攻上山丘遺跡，奪下制高點',
    look: { desat: 0.45, contrast: 1.14, pivot: 0.4, highlights: [1.061, 1.046, 1.061] },
    bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 60 }, indoor: false, navLevels: [0, 2.4, 3.6, 5.4, 10.2], radarRange: 38,
    hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.5, sky: { turbidity: 4, rayleigh: 1.3, elevation: 42, azimuth: 215 },
    sun: { pos: [-40, 62, 28], color: 0xfff0d8, intensity: 3.0, auto: true }, hemi: [0xd8e4f5, 0x66683f, 0.5], exposure: 0.86,
    fog: { color: 0xc6d0d8, near: 70, far: 300 }, acoustics: 'canyon', ambience: 'hill', shadowFollow: 64,
    shot: { pos: [-64, 17, 34], target: [0, 5, 0] },
    objectives: { dom: [[0, 0, 42], [0, 5.4, 0], [0, 0, -42]], relic: [0, 6.0, 0], domRadius: 4.5 },
    build(b) {
      const T1 = 2.4, T2 = 5.4, TW = 10.2;
      // terrain + perimeter cliffs
      b.box(-140, -1, -100, 140, 0, 100, 'grass', { cast: false, radar: false });
      for (const [x0, z0, x1, z1] of [[-106, -66, 106, -60], [-106, 60, 106, 66], [-106, -60, -100, 60], [100, -60, 106, 60]]) b.box(x0, 0, z0, x1, 14, z1, 'rock', { radar: 'wall' });
      if (!b.dry) for (const [x, z, r] of [[-140, -30, 40], [-150, 40, 46], [140, 30, 42], [150, -40, 44], [0, 110, 52], [-60, 108, 40], [60, -110, 50], [0, -112, 44], [80, 104, 38], [-80, -104, 40]]) {
        const g = new THREE.SphereGeometry(r, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.42, 1); g.translate(x, -1, z); b.geo(g, 'grass', false);
      }
      // HILL — two rock terraces (grass cap on T1, paved temple floor on T2)
      const block = (x0, z0, x1, z1, y0, y1, cap) => { b.box(x0, y0, z0, x1, y1 - 0.12, z1, 'rock', { radar: 'building' }); b.box(x0, y1 - 0.12, z0, x1, y1, z1, cap, { radar: false, tile: cap === 'grass' ? 4.5 : 3 }); };
      block(-26, -16, 26, 16, 0, T1, 'grass'); block(-22, -20, 22, -16, 0, T1, 'grass'); block(-22, 16, 22, 20, 0, T1, 'grass');
      block(-15, -8, 15, 8, T1, T2, 'ruinStone'); block(-12, -11, 12, -8, T1, T2, 'ruinStone'); block(-12, 8, 12, 11, T1, T2, 'ruinStone');
      // ramps ground→T1 and T1→T2
      b.ramp({ minX: -36, maxX: -26, minZ: -4, maxZ: 4, axis: 'x', dir: 1, y0: 0, y1: T1 }, 'dirt');
      b.ramp({ minX: 26, maxX: 36, minZ: -4, maxZ: 4, axis: 'x', dir: -1, y0: 0, y1: T1 }, 'dirt');
      b.ramp({ minX: 4, maxX: 10, minZ: 20, maxZ: 30, axis: 'z', dir: -1, y0: 0, y1: T1 }, 'dirt');
      b.ramp({ minX: -10, maxX: -4, minZ: -30, maxZ: -20, axis: 'z', dir: 1, y0: 0, y1: T1 }, 'dirt');
      b.ramp({ minX: -23, maxX: -15, minZ: 2.5, maxZ: 6.5, axis: 'x', dir: 1, y0: T1, y1: T2 }, 'ruinStone');
      b.ramp({ minX: 15, maxX: 23, minZ: -6.5, maxZ: -2.5, axis: 'x', dir: -1, y0: T1, y1: T2 }, 'ruinStone');
      b.ramp({ minX: -9, maxX: -5, minZ: 11, maxZ: 18, axis: 'z', dir: -1, y0: T1, y1: T2 }, 'ruinStone');
      b.ramp({ minX: 5, maxX: 9, minZ: -18, maxZ: -11, axis: 'z', dir: 1, y0: T1, y1: T2 }, 'ruinStone');
      // central ruined tower (B / relic) — 4 doorways, windows, roof sniper nest reached by ladders
      b.room(-3, -3, 3, 3, { y0: T2, h: 4.5, t: 0.5, mat: 'ruinStone', roof: 'ruinStone', roofT: 0.3,
        open: { n: [{ a: -0.8, b: 0.8 }, { a: 1.6, b: 2.3, y0: T2 + 1.3, y1: T2 + 2.0 }], s: [{ a: -0.8, b: 0.8 }, { a: -2.3, b: -1.6, y0: T2 + 1.3, y1: T2 + 2.0 }],
          e: [{ a: -0.8, b: 0.8 }], w: [{ a: -0.8, b: 0.8 }] } });
      // roof parapet with gaps above both ladders (west z 1.3–2.3, east z -2.3–-1.3)
      for (const [x0, z0, x1, z1] of [[-3, -3, 3, -2.7], [-3, 2.7, 3, 3], [-3, -2.7, -2.7, 1.3], [-3, 2.3, -2.7, 2.7], [2.7, -1.3, 3, 2.7], [2.7, -2.7, 3, -2.3]]) b.box(x0, TW, z0, x1, TW + 0.9, z1, 'ruinStone', { radar: false });
      b.ladder(-3, 1.8, T2, TW, '-x', { mat: 'wood', rail: 0.9 }); b.ladder(3, -1.8, T2, TW, '+x', { mat: 'wood', rail: 0.9 });
      b.box(-0.45, T2, -0.45, 0.45, T2 + 0.6, 0.45, 'ruinDark', { radar: 'crate', tile: 1 }); // relic pedestal
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s;
        const BX = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        const F = (f) => (s > 0 ? f : { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[f]);
        const ROOM = (x0, z0, x1, z1, o) => b.room(Math.min(X(x0), X(x1)), Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), Math.max(Z(z0), Z(z1)), o);
        // openings are written for s = +1; mirror them for the other half ({a,b} along the wall axis)
        const OP = (list, alongX) => list.map((o) => Object.assign({}, o, { a: Math.min((alongX ? X : Z)(o.a), (alongX ? X : Z)(o.b)), b: Math.max((alongX ? X : Z)(o.a), (alongX ? X : Z)(o.b)) }));
        const OPEN = (o) => (s > 0 ? o : { n: OP(o.s || [], true), s: OP(o.n || [], true), e: OP(o.w || [], false), w: OP(o.e || [], false) });
        // ---- hill ladders ----
        b.ladder(X(-26), Z(11), 0, T1, F('-x'), { mat: 'wood' });
        b.ladder(X(-15), Z(20), 0, T1, F('+z'), { mat: 'wood' });
        b.ladder(X(-15), Z(-5), T1, T2, F('-x'), { mat: 'wood' });
        // ---- temple ruins on T2 ----
        for (const [x, z, h, br] of [[-11, -5.5, 4.2, 0], [-11, 5.5, 2.4, 1], [-3, 9.5, 4.2, 0], [3.2, 9.5, 2.9, 1], [-13.4, 0, 1.8, 1]]) b.column(X(x), Z(z), 0.42, h, { y0: T2, broken: !!br });
        b.ruinWall(X(-8), Z(-6.5), X(-8), Z(-2.5), 2.3, 0.6, { y0: T2 }); b.ruinWall(X(-8), Z(3.2), X(-8), Z(6.5), 1.6, 0.6, { y0: T2 });
        b.ruinWall(X(-4.5), Z(-6.8), X(1.5), Z(-6.8), 1.3, 0.6, { y0: T2 });
        b.fallenColumn(X(-10.5), Z(-9.4), 3.2, 0.4, 'x', T2); b.fallenColumn(X(-18.5), Z(-12), 3.2, 0.4, 'z', T1);
        // ---- T1 edge cover ----
        b.ruinWall(X(-24.2), Z(-14), X(-24.2), Z(-7), 1.25, 0.7, { y0: T1 }); b.ruinWall(X(-21.5), Z(18.3), X(-17.5), Z(18.3), 1.2, 0.7, { y0: T1 });
        b.ruinWall(X(12), Z(18.3), X(20), Z(18.3), 1.3, 0.7, { y0: T1 });
        for (const [x, z, r] of [[-20, -13, 1.1], [-19, 10.5, 0.9], [18, 13.5, 1.0]]) b.boulder(X(x), Z(z), r, { y0: T1 });
        b.broadleaf(X(-21), Z(13), 5.2, T1);
        // boulders dressing the terrace faces (kept clear of ramps and ladders)
        for (const [x, z, r] of [[-26.5, -10, 1.7], [-26.3, 6.5, 1.4], [-22.5, 20.6, 1.6], [-3, 20.8, 1.5], [15, 20.7, 1.3], [-27.4, -15, 1.9]]) b.boulder(X(x), Z(z), r);
        // ---- BASES (walled compound: no line of sight to the field) ----
        const baseOps = [{ a: -14, b: -10.5, y1: 4.2 }, { a: -1.75, b: 1.75, y1: 3.6 }, { a: 10.5, b: 14, y1: 4.2 }];
        b.wallZ(X(-77.5), -18, 18, 0, 7, 1, 'concreteWall', baseOps, { radar: 'wall' });
        BX(-100, 0, 17.5, -77, 7, 18.5, 'concreteWall', { radar: 'wall' }); BX(-100, 0, -18.5, -77, 7, -17.5, 'concreteWall', { radar: 'wall' });
        BX(-74.6, 0, -4.6, -73.6, 4.2, 4.6, 'concreteWall', { radar: 'wall' }); // blast wall in front of the main door
        for (const zz of [-18, 18]) for (const xx of [-99, -88, -77.5]) BX(xx - 0.6, 7, zz - 0.6, xx + 0.6, 8.2, zz + 0.6, 'concreteWall', { radar: false });
        b.container(X(-94), Z(-14.2), 'x', 1, s > 0 ? 1 : 5); b.container(X(-94), Z(14.2), 'x', 2, s > 0 ? 3 : 6);
        b.container(X(-81), Z(-7.5), 'z', 1, s > 0 ? 2 : 4);
        b.sandbags(X(-80.5), Z(-12.8), X(-79.7), Z(-9)); b.sandbags(X(-80.5), Z(9), X(-79.7), Z(12.8)); b.sandbags(X(-72.4), Z(6.5), X(-70), Z(7.3));
        for (const [x, z, sz] of [[-86, 14.4, 1.2], [-84.8, 14.6, 0.9], [-97.5, -9.8, 1.2], [-97.5, -8.5, 1.1], [-82.5, 5.5, 1.1], [-71, -11, 1.2], [-71.2, -12.3, 0.9]]) b.crate(X(x), Z(z), sz);
        b.car(X(-90), Z(-11.2), Math.PI / 2, 'darkSteel');
        BX(-99.4, 0, -4, -96.8, 2.6, 4, 'sidingTan', { radar: 'building' }); BX(-99.6, 2.6, -4.3, -96.6, 2.8, 4.3, 'roof', { radar: false });
        b.paintRect(Math.min(X(-92), X(-84)), -4, Math.max(X(-92), X(-84)), 4, 0.18, s > 0 ? 0x3a78d8 : 0xc8453a);
        // ---- field between base and hill ----
        // Domination A courtyard (-54, 0): broken wall ring with four entries
        b.ruinWall(X(-62), Z(-8), X(-57), Z(-8), 1.9); b.ruinWall(X(-51), Z(-8), X(-46), Z(-8), 1.6);
        b.ruinWall(X(-62), Z(8), X(-57), Z(8), 1.6); b.ruinWall(X(-51), Z(8), X(-46), Z(8), 1.9);
        b.ruinWall(X(-62), Z(-8), X(-62), Z(-3), 1.7); b.ruinWall(X(-62), Z(3), X(-62), Z(8), 1.5);
        b.ruinWall(X(-46), Z(-8), X(-46), Z(-3), 1.5); b.ruinWall(X(-46), Z(3), X(-46), Z(8), 1.8);
        b.fallenColumn(X(-58), Z(5.2), 3, 0.42, 'x'); b.column(X(-50.5), Z(-5.2), 0.42, 2.6, { broken: true });
        b.boulder(X(-68), Z(-2), 1.5); b.boulder(X(-40), Z(10), 1.7); b.boulder(X(-39), Z(-12), 1.3);
        b.sandbags(X(-66.5), Z(10.5), X(-64), Z(11.3)); b.sandbags(X(-42), Z(-3.5), X(-41.2), Z(-0.6));
        b.car(X(-70), Z(-14), 0.4, 'rust'); b.crate(X(-66), Z(-5), 1.2); b.crate(X(-44), Z(12.5), 1.1);
        b.broadleaf(X(-70), Z(4.5), 5.5); b.broadleaf(X(-37), Z(16), 5); b.broadleaf(X(-49), Z(15), 4.6);
        // ---- FLANK SHRINE (Domination A at (0, 42); its point mirror (0, -42) is C) ----
        b.box(X(-2.6), 0, Math.min(Z(39.4), Z(44.6)), X(2.6), 0.3, Math.max(Z(39.4), Z(44.6)), 'ruinDark', { radar: false, tile: 1.5 }); // low plinth (step-able)
        for (const [a, c] of [[-9, -2.2], [2.2, 9]]) { b.ruinWall(X(a), Z(49), X(c), Z(49), 2.1); b.ruinWall(X(a), Z(35), X(c), Z(35), 1.6); }
        for (const [a, c] of [[35, 39.6], [44.4, 49]]) { b.ruinWall(X(-9), Z(a), X(-9), Z(c), 1.8); b.ruinWall(X(9), Z(a), X(9), Z(c), 1.5); }
        b.column(X(-6.2), Z(38), 0.42, 3.6); b.column(X(6.2), Z(46), 0.42, 2.3, { broken: true }); b.column(X(6.2), Z(38), 0.42, 1.6, { broken: true });
        b.fallenColumn(X(-5), Z(46.3), 3.2, 0.42, 'x');
        for (const [x, z, r] of [[-15, 41, 1.8], [14, 44, 1.6], [3, 29.5, 1.2], [-4, 55, 2.2], [17, 36, 1.4]]) b.boulder(X(x), Z(z), r);
        b.broadleaf(X(-13), Z(50), 5.6); b.sandbags(X(-2.5), Z(31.2), X(1.5), Z(32));
        // lane dividers (broken walls with gaps)
        for (const [a, c] of [[-74, -67], [-61, -50], [-45, -37], [-33, -29]]) { b.ruinWall(X(a), Z(21.5), X(c), Z(21.5), 2.5, 0.7); b.ruinWall(X(a + 2), Z(-21.5), X(c + 1), Z(-21.5), 2.5, 0.7); }
        // ---- north-west village ----
        ROOM(-72, 27, -62, 35, { h: 3.3, t: 0.3, mat: 'plaster', roof: 'ruinStone', roofT: 0.3,
          open: OPEN({ s: [{ a: -68, b: -66 }], n: [{ a: -70.5, b: -68.5, y0: 1.2, y1: 2.1 }], e: [{ a: 29, b: 33, y0: 1.1, y1: 2.1 }], w: [] }) });
        b.ladder(X(-72), Z(32.5), 0, 3.6, F('-x'), { mat: 'wood' });
        ROOM(-54, 40, -44, 48, { h: 2.8, t: 0.4, mat: 'ruinStone',
          open: OPEN({ s: [{ a: -50, b: -48 }], n: [{ a: -52, b: -50 }], e: [{ a: 43, b: 45 }], w: [{ a: 42.5, b: 45, y0: 1.2, y1: 2.0 }] }) });
        ROOM(-40, 27, -32, 33, { h: 3.0, t: 0.3, mat: 'plasterRed', roof: 'roof', eave: 0.3,
          open: OPEN({ w: [{ a: 29, b: 31 }], e: [{ a: 28.2, b: 30, y0: 1.1, y1: 2.0 }], n: [{ a: -37.5, b: -35.5 }], s: [] }) });
        b.cyl(X(-58), Z(52), 1.1, 0, 0.95, 'ruinStone', { seg: 16 });
        for (const [x, z] of [[-80, 44], [-62, 56], [-30, 50], [-24, 40], [-58, 38]]) b.broadleaf(X(x), Z(z), 5.4);
        for (const [x, z] of [[-90, 30], [-88, 50], [-20, 54]]) b.tree(X(x), Z(z), 'pine', 8);
        b.ruinWall(X(-84), Z(24), X(-76), Z(24), 1.2, 0.5); b.sandbags(X(-58), Z(30), X(-55), Z(30.8));
        b.crate(X(-45), Z(34), 1.2); b.crate(X(-46.2), Z(34.2), 0.9); b.car(X(-26), Z(30), 0.2, 'rust');
        // ---- south-west excavation site: wooden watchtower (ladder on its plank wall) ----
        const TX = -48, TZ = -44;
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) BX(TX + dx - 0.12, 0, TZ + dz - 0.12, TX + dx + 0.12, 3.4, TZ + dz + 0.12, 'wood', { radar: false, material: 'wood' });
        BX(TX - 2.1, 3.4, TZ - 2.1, TX + 2.1, 3.6, TZ + 2.1, 'wood', { radar: 'catwalk', material: 'wood' });
        BX(TX - 2, 0, TZ + 1.9, TX + 2, 3.4, TZ + 2.1, 'wood', { radar: 'wall', material: 'wood', penetrable: true });
        b.ladder(X(TX), Z(TZ + 2.1), 0, 3.6, F('+z'), { mat: 'wood' });
        BX(TX - 2.1, 3.6, TZ - 2.1, TX + 2.1, 4.6, TZ - 1.95, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX - 2.1, 3.6, TZ - 1.95, TX - 1.95, 4.6, TZ + 2.1, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX + 1.95, 3.6, TZ - 1.95, TX + 2.1, 4.6, TZ + 2.1, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX - 2.1, 5.8, TZ - 2.3, TX + 2.1, 5.95, TZ + 2.3, 'roof', { radar: false, physics: false });
        for (const [x0, z0, x1, z1] of [[-66, -40, -58, -39.5], [-66, -48, -58, -47.5], [-66, -48, -65.5, -39.5], [-58.5, -48, -58, -44]]) BX(x0, 0, z0, x1, 0.35, z1, 'ruinDark', { radar: false }); // excavated foundations
        for (const [x, z, r] of [[-72, -36, 2.4], [-76, -46, 3.2], [-60, -54, 2.6], [-38, -34, 2.2], [-34, -50, 3.0], [-84, -30, 2], [-52, -30, 1.6], [-28, -40, 2.4], [-88, -54, 3.4], [-44, -56, 2.4]]) b.boulder(X(x), Z(z), r);
        b.fallenColumn(X(-62), Z(-43.5), 3.6, 0.45, 'z'); b.column(X(-40), Z(-44), 0.45, 3.2, { broken: true }); b.column(X(-36), Z(-44), 0.45, 4.2);
        BX(-56, 0, -36, -52, 2.2, -33, 'canvasBlue', { radar: 'building', material: 'sandbag' }); BX(-80, 0, -52, -76, 2.2, -49, 'canvasRed', { radar: 'building', material: 'sandbag' });
        for (const [x, z, sz] of [[-54, -38, 1.1], [-53, -39.4, 0.9], [-70, -30, 1.2], [-31, -30, 1.1], [-66, -52, 1.2]]) b.crate(X(x), Z(z), sz);
        b.sandbags(X(-44), Z(-38), X(-41), Z(-37.2)); b.sandbags(X(-30), Z(-46), X(-29.2), Z(-42));
        for (const [x, z] of [[-86, -40], [-24, -52], [-66, -58]]) b.tree(X(x), Z(z), 'pine', 7.5);
        // perimeter dressing
        for (let x = -92; x <= 92; x += 23) b.boulder(X(x), Z(-58.6), 2.6 + (Math.abs(x) % 3));
        for (const z of [-40, -26, 26, 40]) b.boulder(X(-98.4), Z(z), 2.8);
      });
      // paths
      b.plane(-77, -3, -36, 3, 0.004, 'dirt'); b.plane(36, -3, 77, 3, 0.004, 'dirt');
      b.plane(-70, 36, -28, 40, 0.004, 'dirt'); b.plane(28, -40, 70, -36, 0.004, 'dirt');
      b.plane(-66, -30, -30, -26, 0.004, 'dirt'); b.plane(30, 26, 66, 30, 0.004, 'dirt');
      b.plane(-28, 40, -9, 44, 0.004, 'dirt'); b.plane(9, 40, 28, 44, 0.004, 'dirt'); b.plane(-28, -44, -9, -40, 0.004, 'dirt'); b.plane(9, -44, 28, -40, 0.004, 'dirt');
      b.letter('A', -88, 0, Math.PI / 2, 4.2, '#9cc8ff'); b.letter('B', 88, 0, -Math.PI / 2, 4.2, '#ff9c94');
      b.sign('ALPHA BASE', '#6fb6ff', -76.97, 5.4, 6, Math.PI / 2, 6, 1.4); b.sign('BRAVO BASE', '#ff6a5f', 76.97, 5.4, -6, -Math.PI / 2, 6, 1.4);
      b.spawnZone('alpha', -96, -9, -84, 9, -Math.PI / 2); b.spawnZone('bravo', 84, -9, 96, 9, Math.PI / 2);
    },
  },
  {
    id: 'ridge', name: '山嶺前哨', en: 'RIDGE OUTPOST', desc: '超大山地地圖 · 山路、陡坡、岩石區、三層樓建築（樓梯＋梯子登頂）· 280×280', slogan: 'HOLD THE PASS · 翻越山嶺，拿下山口要塞',
    look: { desat: 0.34, contrast: 1.15, pivot: 0.38, highlights: 1.1 },
    bounds: { minX: -140, maxX: 140, minZ: -140, maxZ: 140 }, indoor: false, navLevels: [], navStep: 2.5, viewMult: 1.4, radarRange: 50,
    hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.5, sky: { turbidity: 5, rayleigh: 1.4, elevation: 38, azimuth: 225 },
    sun: { pos: [-50, 70, 30], color: 0xfff0d8, intensity: 3.1, auto: true }, hemi: [0xd8e4f5, 0x5f6a3c, 0.52], exposure: 0.86,
    fog: { color: 0xc4ced8, near: 90, far: 470 }, acoustics: 'canyon', ambience: 'hill', shadowFollow: 72,
    shot: { pos: [-128, 46, 64], target: [-40, 10, 20] },
    objectives: { dom: [[0, 8, 72], [0, 16.6, 0], [0, 8, -72]], relic: [0, 17.2, 0], domRadius: 6 },
    build(b) {
      const TR = b.def._terrain ? null : makeRidgeTerrain();
      b.terrain({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, step: 2, sample: (x, z) => TR.sample(x, z) });
      b.grass();
      // invisible perimeter (the mountains are already too steep to climb; this is the hard stop)
      for (const [x0, z0, x1, z1] of [[-142, -142, 142, -140], [-142, 140, 142, 142], [-142, -140, -140, 140], [140, -140, 142, 140]]) b.box(x0, -20, z0, x1, 90, z1, null, { blocksShot: false, radar: false });
      // ---------- PASS FORT (B): centre piece, built once ----------
      const FY = 16.6;
      b.box(-0.5, FY, -0.5, 0.5, FY + 0.55, 0.5, 'ruinDark', { radar: 'crate', tile: 1 }); // relic pedestal
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s, G = (x, z) => b.gy(X(x), Z(z));
        const BX = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        const F = (f) => (s > 0 ? f : { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[f]);
        const MS = { n: 's', s: 'n', e: 'w', w: 'e' };
        const BLD = (o) => {
          const doors = {}; for (const k in o.doors || {}) doors[s > 0 ? k : MS[k]] = o.doors[k].map((c) => c * s);
          return b.building(Object.assign({}, o, { x0: Math.min(X(o.x0), X(o.x1)), x1: Math.max(X(o.x0), X(o.x1)), z0: Math.min(Z(o.z0), Z(o.z1)), z1: Math.max(Z(o.z0), Z(o.z1)), doors,
            ladder: o.ladder && { side: s > 0 ? o.ladder.side : MS[o.ladder.side], at: o.ladder.at * s } }));
        };
        const ROOM = (x0, z0, x1, z1, o) => {
          const op = o.open || {}, m = (list, alongX) => (list || []).map((q) => Object.assign({}, q, { a: Math.min((alongX ? X : Z)(q.a), (alongX ? X : Z)(q.b)), b: Math.max((alongX ? X : Z)(q.a), (alongX ? X : Z)(q.b)) }));
          b.room(Math.min(X(x0), X(x1)), Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), Math.max(Z(z0), Z(z1)), Object.assign({}, o, { open: s > 0 ? { n: m(op.n, true), s: m(op.s, true), e: m(op.e, false), w: m(op.w, false) } : { n: m(op.s, true), s: m(op.n, true), e: m(op.w, false), w: m(op.e, false) } }));
        };
        const footMin = (x, z, r) => b.gyMin(Math.min(X(x - r), X(x + r)), Math.min(Z(z - r), Z(z + r)), Math.max(X(x - r), X(x + r)), Math.max(Z(z - r), Z(z + r)));
        const ROCK = (x, z, r, sy = 0.7) => b.boulder(X(x), Z(z), r, { y0: footMin(x, z, r * 0.6) - r * 0.18, sy });
        const PINE = (x, z, h = 8) => b.tree(X(x), Z(z), 'pine', h, G(x, z) - 0.25);
        const OAK = (x, z, h = 5.4) => b.broadleaf(X(x), Z(z), h, G(x, z) - 0.2);
        const BAGS = (x0, z0, x1, z1, h = 1.05) => b.sandbags(X(x0), Z(z0), X(x1), Z(z1), h + 0.12, b.gyMin(Math.min(X(x0), X(x1)), Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), Math.max(Z(z0), Z(z1))) - 0.12);
        const CRATE = (x, z, sz) => b.crate(X(x), Z(z), sz, footMin(x, z, sz / 2) - 0.03);
        const CAR = (x, z, rot, m) => b.car(X(x), Z(z), rot, m, footMin(x, z, 2) - 0.05);
        const WP = (x, z, y) => b.waypoint(X(x), Z(z), y);
        const tint = s > 0 ? 'canvasBlue' : 'canvasRed';

        // ---- pass fort walls (west wall full, west halves of north/south walls; the mirror completes it) ----
        const WT = FY + 3.4;
        BX(-12.8, FY, -12.8, -12, WT, 0.5, 'concreteWall', { radar: 'wall' }); BX(-12.8, FY, 5.5, -12, WT, 12.8, 'concreteWall', { radar: 'wall' });
        BX(-12.8, FY + 2.4, 0.5, -12, WT, 5.5, 'concreteWall', { radar: false }); // gate lintel
        BX(-12, FY, 12, -6, WT, 12.8, 'concreteWall', { radar: 'wall' }); BX(-4.5, FY, 12, 0, WT, 12.8, 'concreteWall', { radar: 'wall' }); BX(-6, FY + 2.3, 12, -4.5, WT, 12.8, 'concreteWall', { radar: false });
        BX(-12, FY, -12.8, 0, WT, -12, 'concreteWall', { radar: 'wall' });
        for (const [x, z] of [[-12.4, -12.4], [-12.4, 0.2], [-12.4, 5.8], [-12.4, 12.4], [-6, 12.4], [-4.5, 12.4]]) BX(x - 0.55, WT, z - 0.55, x + 0.55, WT + 0.6, z + 0.55, 'concreteWall', { radar: false });
        // NW corner tower (+ its mirror SE): 4.4 m block with parapet and ladder on the courtyard side
        const TT = FY + 4.4;
        BX(-13, FY, 9.6, -9.6, TT, 13, 'concreteWall', { radar: 'building' });
        BX(-13, TT, 12.7, -9.6, TT + 1, 13, 'concreteWall', { radar: false }); BX(-13, TT, 9.6, -12.7, TT + 1, 12.7, 'concreteWall', { radar: false });
        BX(-12.7, TT, 9.6, -12.0, TT + 1, 9.9, 'concreteWall', { radar: false }); BX(-10.4, TT, 9.6, -9.6, TT + 1, 9.9, 'concreteWall', { radar: false }); BX(-9.9, TT, 9.9, -9.6, TT + 1, 12.7, 'concreteWall', { radar: false });
        b.ladder(X(-11.2), Z(9.6), FY, TT, F('-z'), { mat: 'darkSteel' });
        b.navRegion(Math.min(X(-12.5), X(-10.1)), Math.min(Z(10.2), Z(12.4)), Math.max(X(-12.5), X(-10.1)), Math.max(Z(10.2), Z(12.4)), TT, 1.1);
        // barracks: two storeys + roof (stairs inside, ladder on the north wall)
        BLD({ x0: -9.2, z0: 3, x1: -1.4, z1: 9.8, y0: FY + 0.15, floors: 2, mat: 'concreteWall', doors: { s: [-5.8], e: [6.4] }, ladder: { side: 'w', at: 6.4 } });
        BAGS(-6.5, -3.2, -3.5, -2.4); BAGS(-9.5, -8.5, -8.7, -5.5); CRATE(-3, -8.5, 1.2); CRATE(-4.3, -8.7, 0.9); CRATE(-10.6, -1.6, 1.1);
        b.container(X(-7.5), Z(-9.6), 'x', 1, s > 0 ? 2 : 5, FY);
        WP(-6, -6, FY); WP(-10, 1.5, FY); WP(-15.5, 3, G(-15.5, 3));

        // ---- spawn basin: supply tents, vehicles, sandbag cover at the two mouths ----
        BX(-129, 5, -11, -125, 7.3, -5.5, tint, { radar: 'building', material: 'sandbag' }); BX(-129, 5, 5.5, -125, 7.3, 11, tint, { radar: 'building', material: 'sandbag' });
        CAR(-120, -9.5, 0.15, 'darkSteel'); CAR(-121, 10, -0.2, 'darkSteel');
        CRATE(-126.5, -2.5, 1.2); CRATE(-126.4, -1.2, 0.9); CRATE(-126.5, 2.4, 1.2);
        BAGS(-106.5, -8.2, -104.5, -7.4); BAGS(-106.5, 7.4, -104.5, 8.2); BAGS(-101.5, -3.5, -100.7, 3.5, 1.2);
        b.paintRect(Math.min(X(-124), X(-110)), -7, Math.max(X(-124), X(-110)), 7, 0.18, s > 0 ? 0x3a78d8 : 0xc8453a, 5.004);
        WP(-98, 13); WP(-98, -13);

        // ---- mountain village (pad y 7.2): 3-storey block, 2-storey house, shed, well ----
        const VY = 7.2;
        BLD({ x0: -71, z0: 41, x1: -61, z1: 49.5, y0: VY + 0.15, floors: 3, mat: 'plaster', doors: { s: [-66], w: [45] }, ladder: { side: 'e', at: 47 } });
        BLD({ x0: -55, z0: 41.5, x1: -46, z1: 49, y0: VY + 0.15, floors: 2, mat: 'plasterRed', doors: { s: [-50.5], e: [45.2] }, ladder: { side: 'w', at: 43.4 } });
        ROOM(-72, 30.5, -65, 35.8, { y0: VY, h: 2.8, t: 0.25, mat: 'plasterWhite', roof: 'roof', eave: 0.3, open: { n: [{ a: -69.5, b: -67.5 }], e: [{ a: 32, b: 34.5, y0: VY + 1.0, y1: VY + 2.0 }], s: [], w: [] } });
        b.cyl(X(-52), Z(34), 1.1, VY, VY + 0.95, 'ruinStone', { seg: 16 });
        CAR(-46, 33, 0.3, 'rust'); CRATE(-60, 38.5, 1.1); CRATE(-61.2, 38.7, 0.9); CRATE(-45, 39.5, 1.2);
        BAGS(-57, 31, -54, 31.8); BAGS(-43.5, 45, -42.7, 48);
        OAK(-75, 38); OAK(-47, 52.5, 5.8); OAK(-66, 53); PINE(-79, 47, 8.5); PINE(-39, 44, 7.5);
        WP(-58, 36); WP(-44, 34); WP(-66, 38.5);

        // ---- hilltop watchtower (pad y 16.2) ----
        const TX = -76, TZ = 58.5, TY = 16.2;
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) BX(TX + dx - 0.13, TY, TZ + dz - 0.13, TX + dx + 0.13, TY + 4.4, TZ + dz + 0.13, 'wood', { radar: false, material: 'wood' });
        BX(TX - 2.15, TY + 4.4, TZ - 2.15, TX + 2.15, TY + 4.6, TZ + 2.15, 'wood', { radar: 'catwalk', material: 'wood' });
        BX(TX - 2, TY, TZ - 2.15, TX + 2, TY + 4.4, TZ - 1.95, 'wood', { radar: 'wall', material: 'wood', penetrable: true });
        b.ladder(X(TX), Z(TZ - 2.15), TY, TY + 4.6, F('-z'), { mat: 'wood' });
        BX(TX - 2.15, TY + 4.6, TZ + 1.95, TX + 2.15, TY + 5.6, TZ + 2.15, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX - 2.15, TY + 4.6, TZ - 1.95, TX - 1.95, TY + 5.6, TZ + 1.95, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX + 1.95, TY + 4.6, TZ - 1.95, TX + 2.15, TY + 5.6, TZ + 1.95, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX - 2.15, TY + 4.6, TZ - 2.15, TX - 0.7, TY + 5.6, TZ - 1.95, 'wood', { radar: false, material: 'wood', penetrable: true }); BX(TX + 0.7, TY + 4.6, TZ - 2.15, TX + 2.15, TY + 5.6, TZ - 1.95, 'wood', { radar: false, material: 'wood', penetrable: true });
        BX(TX - 2.3, TY + 6.9, TZ - 2.4, TX + 2.3, TY + 7.05, TZ + 2.4, 'roof', { radar: false, physics: false });
        b.navRegion(Math.min(X(TX - 1.4), X(TX + 1.4)), Math.min(Z(TZ - 1.4), Z(TZ + 1.4)), Math.max(X(TX - 1.4), X(TX + 1.4)), Math.max(Z(TZ - 1.4), Z(TZ + 1.4)), TY + 4.6, 1.2);
        BAGS(-80.5, 54.5, -80, 57.5); BAGS(-72, 61.5, -71.5, 64);
        WP(-76, 54, TY); WP(-74, 44);

        // ---- quarry pit (floor y 3.4): cut-stone blocks, scaffold, crusher shed ----
        const QY = 3.4;
        for (const [x0, z0, x1, z1, h] of [[-74, -45.5, -72.2, -43.6, 1.6], [-70.5, -54.2, -68.5, -52.6, 1.2], [-62, -45, -60, -42.5, 2.0], [-59.4, -44.8, -58.4, -43.4, 1.1], [-75.6, -52.8, -74, -50.6, 2.2]]) BX(x0, QY - 0.1, z0, x1, QY + h, z1, 'ruinStone', { radar: 'solid' });
        ROOM(-76, -55, -70, -53, { y0: QY, h: 2.6, t: 0.2, mat: 'sidingTan', roof: 'roof', eave: 0.2, open: { n: [{ a: -74.5, b: -72.5 }], e: [], s: [], w: [] } });
        const SX = -72, SZ = -49;
        for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) BX(SX + dx - 0.1, QY, SZ + dz - 0.1, SX + dx + 0.1, QY + 3.4, SZ + dz + 0.1, 'yellowSteel', { radar: false, material: 'metal' });
        BX(SX - 1.5, QY + 3.4, SZ - 1.5, SX + 1.5, QY + 3.58, SZ + 1.5, 'plate', { radar: 'catwalk', material: 'metal' });
        BX(SX - 1.4, QY, SZ + 1.3, SX + 1.4, QY + 3.4, SZ + 1.5, 'plate', { radar: 'wall', material: 'metal' });
        b.ladder(X(SX), Z(SZ + 1.5), QY, QY + 3.58, F('+z'), { mat: 'yellowSteel' });
        b.railing(Math.min(X(SX - 1.5), X(SX + 1.5)), Z(SZ - 1.5), Math.max(X(SX - 1.5), X(SX + 1.5)), Z(SZ - 1.5), QY + 3.58, 'yellowSteel');
        b.navRegion(Math.min(X(SX - 1), X(SX + 1)), Math.min(Z(SZ - 1), Z(SZ + 1)), Math.max(X(SX - 1), X(SX + 1)), Math.max(Z(SZ - 1), Z(SZ + 1)), QY + 3.58, 1);
        CAR(-66, -43, 0, 'yellowSteel'); CRATE(-58.5, -46.8, 1.1);
        for (const [x, z, r] of [[-78.5, -41, 2.4], [-54, -40, 2.1], [-79, -56, 2.6], [-70, -38.5, 1.8], [-52.5, -47, 1.6]]) ROCK(x, z, r);
        WP(-66, -48, QY); WP(-54, -60);

        // ---- south road: wrecks and a sandbag checkpoint ----
        CAR(-89, -33, 1.1, 'rust'); BAGS(-83, -45, -80, -44.2); BAGS(-42, -60.4, -39, -59.6); CRATE(-43.6, -59.2, 1.1);
        WP(-90, -30); WP(-72, -60); WP(-40, -66); WP(-22, -70);
        // ---- north road ----
        CAR(-86, 27.5, 0.7, 'darkSteel'); BAGS(-34, 22.5, -31.5, 21.7); BAGS(-26, 11.5, -25.2, 14.5); CRATE(-36, 19.5, 1.2);
        WP(-84, 30); WP(-40, 28); WP(-24, 12);

        // ---- gap outpost (A at z = +72; the mirror is C): guard house, barriers, container ----
        const AY = 8.0;
        BLD({ x0: -10.2, z0: 74.6, x1: -2.4, z1: 80.6, y0: AY + 0.15, floors: 2, mat: 'brick', doors: { s: [-6.3], e: [77.6] }, ladder: { side: 'w', at: 77.6 } });
        for (const [x0, z0, x1, z1] of [[-4.5, 64.6, -1.5, 65.2], [2, 67, 2.6, 70], [4.5, 76, 7.5, 76.6], [-9, 67.5, -8.4, 70.5]]) BX(x0, AY, z0, x1, AY + 1.1, z1, 'concrete', { radar: 'sandbag', tile: 1.5 });
        b.container(X(6.5), Z(80.5), 'x', 1, s > 0 ? 3 : 6, AY);
        BAGS(-1.2, 69, 1.2, 69.8); CRATE(8.5, 66, 1.2); CRATE(9.6, 66.4, 0.9);
        WP(0, 72, AY); WP(-8, 66, AY); WP(8, 78, AY);

        // ---- rocky high ground, boulder fields, forests ----
        for (const [x, z, r] of [[-40, -96, 3.2], [-35, -90, 2.2], [-46, -101, 2.6], [-31, -99, 1.8], [-44, -89, 1.9], [-86, 34, 1.9], [-24, 52, 2.2], [-20, 56, 1.5], [-106, -30, 2.0], [-109, -26, 1.4],
          [-12, 30, 2.6], [-8, 40, 3.0], [-14, 45, 2.0], [-10, -38, 2.4], [-6, -30, 1.8], [-100, 58, 2.6], [-60, 92, 2.8], [-26, 108, 2.4], [-96, -84, 2.6], [-118, -34, 2.4], [-118, 34, 2.4], [-66, -18, 1.8], [-30, -28, 1.6]]) ROCK(x, z, r);
        for (const [x, z, h] of [[-100, 44, 8], [-104, 50, 9], [-94, 52, 7.5], [-110, 66, 8.5], [-88, 70, 8], [-52, 104, 9], [-40, 110, 8], [-34, 94, 7.5], [-62, 80, 8], [-72, 86, 8.5],
          [-100, -54, 8], [-96, -66, 9], [-88, -72, 8], [-108, -70, 8.5], [-78, -80, 7.5], [-60, -86, 8], [-52, -110, 8.5], [-20, -104, 7.5], [-30, 80, 7], [-18, 94, 8], [-110, 22, 7.5], [-112, -18, 7.5]]) PINE(x, z, h);
        for (const [x, z] of [[-70, 12], [-58, -10], [-44, 8], [-80, -12], [-34, -44], [-50, -30], [-28, 30], [-90, 8]]) OAK(x, z, 5.2);
        WP(-70, 0); WP(-50, -12); WP(-40, 8); WP(-80, -22); WP(-56, 70); WP(-36, 84); WP(-86, 60); WP(-96, -48); WP(-66, -80); WP(-40, -84); WP(-30, -40); WP(-20, 28); WP(-108, 46);
      });
      b.spawnZone('alpha', -124, -7, -110, 7, -Math.PI / 2); b.spawnZone('bravo', 110, -7, 124, 7, Math.PI / 2);
      b.forwardSpawn('alpha', -66, 32, -50, 38, -Math.PI / 2); b.forwardSpawn('alpha', -72, -46, -60, -43, -Math.PI / 2); // village square, quarry floor
      b.forwardSpawn('bravo', 50, -38, 66, -32, Math.PI / 2); b.forwardSpawn('bravo', 60, 43, 72, 46, Math.PI / 2);
    },
  },
  {
    // v35 SATELLITE BASE (after SF2 'Satellite'): an underground relay station — no open arena. Rooms and bent corridors
    // carved out of solid rock on a 1 m grid, point-symmetric. Each team has three routes: north (machine room → security
    // A), middle (zig-zag corridor → octagonal control room B) and south (generator room → security C).
    id: 'satellite', name: '衛星基地', en: 'SATELLITE BASE', desc: '室內 · 彎曲走廊、機房、八角控制室、雙保全室 · 84×52', slogan: 'RELAY STATION · 走廊轉角與房間攻防',
    look: { exposure: 0.9, desat: 0.25, contrast: 1.08, pivot: 0.3, midtones: 1.1 },
    bounds: { minX: -42, maxX: 42, minZ: -26, maxZ: 26 }, indoor: true, navLevels: [0],
    hdri: 'empty_warehouse_01', hdriBackground: false, background: 0x101317, envIntensity: 0.25,
    sun: { pos: [-16, 42, 10], color: 0xeef4ff, intensity: 0.4 }, hemi: [0xc9d2dc, 0x4a4e54, 0.9], exposure: 1.3,
    fog: { color: 0x14181c, near: 30, far: 100 }, acoustics: 'office', ambience: 'warehouse',
    shot: { pos: [-6, 2.6, -6], target: [6, 1.2, 6] },
    objectives: { dom: [[0, 0, 20.5], [0, 0, 0], [0, 0, -20.5]], relic: [0, 0, 0], domRadius: 3.2 },
    build(b) {
      const L = (x, y, z, c, i, d) => b.light(x, y, z, c, i * 1.8, d * 1.4); // v37: brighter rooms — soldiers must read against concrete
      const H = 3.6, B = { x0: -42, z0: -26, x1: 42, z1: 26 }, W = B.x1 - B.x0, D = B.z1 - B.z0;
      // ---- carve the walkable space (alpha half; every rect is also carved point-mirrored) ----
      const open = new Uint8Array(W * D), carve = (x0, z0, x1, z1) => {
        for (const s of [1, -1]) {
          const ax = Math.min(x0 * s, x1 * s), bx = Math.max(x0 * s, x1 * s), az = Math.min(z0 * s, z1 * s), bz = Math.max(z0 * s, z1 * s);
          for (let x = ax; x < bx; x++) for (let z = az; z < bz; z++) open[(z - B.z0) * W + (x - B.x0)] = 1;
        }
      };
      carve(-41, -7, -31, 7);                                                     // spawn bay
      carve(-31, 3, -24, 6); carve(-27, 3, -24, 16); carve(-27, 13, -20, 16);     // north route → machine room
      carve(-20, 12, -8, 24);                                                     // machine room
      carve(-8, 18, -5, 21);                                                      // machine room → security A
      carve(-5, 16, 5, 25);                                                       // security room (A; mirror = C)
      carve(-1, 9, 1, 16);                                                        // security → control (narrow)
      carve(-31, -2, -17, 2); carve(-17, -2, -13, 5); carve(-13, 2, -8, 5);       // middle zig-zag → control room
      carve(-9, -9, 9, 9);                                                        // control room (B), octagon below
      carve(-10, 8, -7, 12); carve(-10, -12, -7, -8);                             // side doors control ↔ machine / generator
      carve(-31, -6, -24, -3); carve(-27, -16, -24, -3); carve(-27, -16, -20, -13); // south route → generator room
      carve(-20, -24, -8, -12);                                                   // generator room
      carve(-8, -21, -5, -18);                                                    // generator room → security C
      for (let x = -9; x < 9; x++) for (let z = -9; z < 9; z++) if (Math.abs(x + 0.5) + Math.abs(z + 0.5) > 13) open[(z - B.z0) * W + (x - B.x0)] = 0; // octagon corners
      // ---- floor, ceiling, then the rock: greedy rectangles over the solid cells ----
      b.box(B.x0 - 1, -1, B.z0 - 1, B.x1 + 1, 0, B.z1 + 1, 'concrete', { cast: false, radar: false });
      b.box(B.x0 - 1, H, B.z0 - 1, B.x1 + 1, H + 0.3, B.z1 + 1, 'ceiling', { radar: false });
      const used = new Uint8Array(W * D), solid = (x, z) => !open[z * W + x] && !used[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        if (!solid(x, z)) continue;
        let x1 = x; while (x1 + 1 < W && solid(x1 + 1, z)) x1++;
        let z1 = z; while (z1 + 1 < D) { let ok = true; for (let k = x; k <= x1; k++) if (!solid(k, z1 + 1)) { ok = false; break; } if (!ok) break; z1++; }
        for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) used[zz * W + k] = 1;
        b.box(B.x0 + x, 0, B.z0 + z, B.x0 + x1 + 1, H, B.z0 + z1 + 1, 'concreteWall', { radar: 'wall' });
      }
      // ---- dressing (mirrored) ----
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s, bx = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        // spawn bay: crates by the three exits, a parked cart
        for (const [x, z, sz] of [[-33, 5.2, 1.1], [-33, -5.2, 1.1], [-38.5, 5.5, 1.2], [-38.5, -5.5, 1.2]]) b.crate(X(x), Z(z), sz);
        bx(-36.5, 0, -1.4, -35, 1.1, 1.4, 'yellowSteel', { material: 'metal', radar: 'crate' });
        // machine room: two rows of server racks (cover, not wall-bangable) + a desk
        for (const z of [15, 20.5]) for (const x of [-18.5, -15.5]) bx(x, 0, z, x + 2.2, 2.1, z + 0.8, 'darkSteel', { material: 'metal', radar: 'crate' });
        bx(-11.5, 0, 14, -9.5, 0.8, 16.5, 'desk', { material: 'wood', radar: 'crate', penetrable: true });
        // generator room: two big generators + barrels
        for (const x of [-16.5, -11.5]) bx(x, 0, -20.5, x + 2.6, 1.6, -15.5, 'darkSteel', { material: 'metal', radar: 'crate' });
        b.barrel(X(-19), Z(-23), true); b.barrel(X(-18), Z(-23.2), false);
        // security rooms: L-shaped counter + lockers
        bx(-3.5, 0, 22.2, 1, 1.05, 23, 'desk', { material: 'wood', radar: 'crate', penetrable: true }); bx(-3.5, 0, 19.5, -2.7, 1.05, 22.2, 'desk', { material: 'wood', radar: 'crate', penetrable: true });
        for (let x = 1.6; x < 4.8; x += 0.8) bx(x, 0, 24.3, x + 0.7, 2.1, 25, 'whiteSteel', { material: 'metal', radar: 'crate' });
        // corridor cover
        b.crate(X(-25.5), Z(10), 1.0); b.crate(X(-22), Z(0), 1.0); b.crate(X(-15), Z(3.6), 0.9); b.crate(X(-25.5), Z(-10.5), 1.0);
        // control room: consoles in a ring around the dish pedestal
        bx(-6.5, 0, -1.2, -5.7, 1.1, 1.2, 'darkSteel', { material: 'metal', radar: 'crate' }); bx(-1.2, 0, 5.7, 1.2, 1.1, 6.5, 'darkSteel', { material: 'metal', radar: 'crate' });
        // lights
        L(X(-36), 3.2, 0, 0xdfe8ff, 30, 14); L(X(-14), 3.2, Z(18), 0xcfe0ff, 26, 13); L(X(-14), 3.2, Z(-18), 0xffe2c0, 26, 13);
        L(0, 3.2, Z(20.5), 0xfff0dc, 24, 12); L(X(-25.5), 3.2, Z(9), 0xdfe8ff, 14, 9); L(X(-20), 3.2, 0, 0xdfe8ff, 14, 9); L(X(-25.5), 3.2, Z(-9), 0xdfe8ff, 14, 9);
        b.sign(s > 0 ? 'ALPHA' : 'BRAVO', s > 0 ? '#6fb6ff' : '#ff6a5f', X(-40.8), 2.6, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 0.8);
        b.paint(Math.min(X(-41), X(-40.6)), -7, Math.max(X(-41), X(-40.6)), 7, s > 0 ? 0x3a7fd0 : 0xd0453a);
      });
      b.cyl(0, 0, 1.3, 0, 0.9, 'whiteSteel', { seg: 20, radar: 'crate' }); // dish pedestal (B)
      for (let x = -40; x <= 40; x += 4) for (let z = -24; z <= 24; z += 4) { const i = (z - B.z0) * W + (x - B.x0); if (open[i]) b.panel(x, z, H, 1.1, 0.5); }
      L(0, 3.3, 0, 0xcfe6ff, 40, 16);
      b.spawnZone('alpha', -40.4, -6, -35.5, 6, -Math.PI / 2); b.spawnZone('bravo', 35.5, -6, 40.4, 6, Math.PI / 2);
    },
  },
  {
    // v35 FARMHOUSE (after SF2 'Farmhouse'): a Polish farm. Irregular field edged by hedges and tree lines (no rectangle),
    // a two-storey farmhouse and a hay barn with a ladder to its roof (sniper nest) per side, a burnt-out rocket truck in the
    // middle, hay bales and wooden fences that bullets go through. Point-symmetric.
    id: 'farmhouse', name: '農莊', en: 'FARMHOUSE', desc: '戶外 · 不規則田野、農舍、乾草倉狙擊點、中央火箭車殘骸 · 92×64', slogan: 'HARVEST · 木牆與乾草可穿射，開闊地形',
    look: { desat: 0.36, contrast: 1.1, pivot: 0.4, highlights: 1.04 },
    bounds: { minX: -46, maxX: 46, minZ: -32, maxZ: 32 }, indoor: false, navLevels: [0, 3.2, 4.4, 6.4],
    hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.8, sky: { turbidity: 5, rayleigh: 1.4, elevation: 40, azimuth: 210 },
    sun: { pos: [-30, 55, 25], color: 0xfff0dc, intensity: 2.8, auto: true }, hemi: [0xdbe6f5, 0x7a7658, 1.0], exposure: 0.9,
    fog: { color: 0xc9d3d8, near: 60, far: 200 }, acoustics: 'outdoor', ambience: 'hill',
    shot: { pos: [-14, 9, 20], target: [2, 1, -2] },
    objectives: { dom: [[0, 0, 16], [0, 0, 0], [0, 0, -16]], relic: [0, 0, 7], domRadius: 4 },
    build(b) {
      const B = { x0: -46, z0: -32, x1: 46, z1: 32 }, W = B.x1 - B.x0, D = B.z1 - B.z0;
      b.box(B.x0 - 6, -1, B.z0 - 6, B.x1 + 6, 0, B.z1 + 6, 'grass', { cast: false, radar: false });
      // ---- irregular field (alpha half + point mirror), edged by a hedge ring ----
      const open = new Uint8Array(W * D), set = (x0, z0, x1, z1, v) => {
        for (const s of [1, -1]) {
          const ax = Math.min(x0 * s, x1 * s), bx = Math.max(x0 * s, x1 * s), az = Math.min(z0 * s, z1 * s), bz = Math.max(z0 * s, z1 * s);
          for (let x = ax; x < bx; x++) for (let z = az; z < bz; z++) open[(z - B.z0) * W + (x - B.x0)] = v;
        }
      };
      set(-45, -10, -34, 10, 1);   // spawn meadow
      set(-34, -22, 34, 22, 1);    // main field
      set(-31, 22, -6, 31, 1);     // farmhouse yard (north-west lobe; mirror south-east)
      set(-24, -28, -6, -22, 1);   // orchard (south-west lobe; mirror north-east)
      set(-34, 14, -27, 22, 0);    // cut corners
      set(-34, -22, -30, -16, 0);
      set(-38, -14, -34, -10, 1); set(-38, 10, -34, 14, 1); // meadow shoulders
      const ring = new Uint8Array(W * D), isOpen = (x, z) => x >= 0 && z >= 0 && x < W && z < D && open[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (!open[z * W + x] && (isOpen(x - 1, z) || isOpen(x + 1, z) || isOpen(x, z - 1) || isOpen(x, z + 1) || isOpen(x - 1, z - 1) || isOpen(x + 1, z + 1) || isOpen(x - 1, z + 1) || isOpen(x + 1, z - 1))) ring[z * W + x] = 1;
      const used = new Uint8Array(W * D), hedge = (x, z) => ring[z * W + x] && !used[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        if (!hedge(x, z)) continue;
        let x1 = x; while (x1 + 1 < W && hedge(x1 + 1, z)) x1++;
        let z1 = z; while (z1 + 1 < D) { let ok = true; for (let k = x; k <= x1; k++) if (!hedge(k, z1 + 1)) { ok = false; break; } if (!ok) break; z1++; }
        for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) used[zz * W + k] = 1;
        b.box(B.x0 + x, 0, B.z0 + z, B.x0 + x1 + 1, 3.4, B.z0 + z1 + 1, 'hedge', { radar: 'wall' });
      }
      for (let z = 0; z < D; z += 5) for (let x = 0; x < W; x += 5) if (ring[z * W + x] && ((x * 7 + z * 3) % 11) < 6) b.broadleaf(B.x0 + x + 0.5, B.z0 + z + 0.5, 6 + ((x + z) % 4)); // tree line behind the hedge
      // dirt tracks
      b.plane(-45, -2, 45, 2, 0.003, 'dirt'); b.plane(-2, -22, 2, 22, 0.003, 'dirt');
      // ---- centre: burnt-out multiple rocket launcher truck (cover for both teams) ----
      b.box(-1.4, 0.45, -4.2, 1.4, 1.5, 4.2, 'rust', { material: 'metal', radar: 'crate' });          // chassis + bed
      b.box(-1.25, 1.5, 1.6, 1.25, 3.0, 4.0, 'rust', { material: 'metal', radar: 'crate' });          // cab
      b.box(-1.2, 1.5, -3.8, 1.2, 2.6, 0.9, 'darkSteel', { material: 'metal', radar: false });        // launcher rack
      if (!b.dry) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const c = new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8); c.rotateX(Math.PI / 2 - 0.18); c.translate(-0.75 + i * 0.5, 2.0 + j * 0.34, -1.5); b.geo(c, 'darkSteel'); }
      for (const z of [-3, 3]) for (const x of [-1.45, 1.45]) b.cyl(x, z, 0.55, 0, 1.1, 'darkSteel', { seg: 12, radar: false });
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s, bx = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        // farmhouse: two floors, door to the yard and to the field
        b.building({ x0: Math.min(X(-24), X(-15)), z0: Math.min(Z(23), Z(29)), x1: Math.max(X(-24), X(-15)), z1: Math.max(Z(23), Z(29)), y0: 0, floors: 2, fh: 3.2, mat: 'sidingTan', slab: 'wood',
          doors: s > 0 ? { s: [X(-19.5)], e: [Z(26)] } : { n: [X(-19.5)], w: [Z(26)] } });
        // hay barn: one tall storey, ladder on the field side → roof sniper nest
        b.building({ x0: Math.min(X(-31), X(-24)), z0: Math.min(Z(-21), Z(-14)), x1: Math.max(X(-31), X(-24)), z1: Math.max(Z(-21), Z(-14)), y0: 0, floors: 1, fh: 4.4, mat: 'wood', slab: 'wood',
          doors: s > 0 ? { n: [X(-27.5)] } : { s: [X(-27.5)] }, ladder: { side: s > 0 ? 'e' : 'w', at: Z(-17.5) }, ladderMat: 'wood' });
        // water tower by the farmhouse
        for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) bx(-10 + dx - 0.15, 0, 27 + dz - 0.15, -10 + dx + 0.15, 5, 27 + dz + 0.15, 'wood', { radar: false });
        b.cyl(X(-10), Z(27), 1.9, 5, 7.6, 'wood', { seg: 16, radar: 'crate' });
        // spawn screen: a wooden fence line with gaps, so the meadow cannot see across the field
        bx(-33.2, 0, -7, -32.8, 2.2, -1.6, 'wood', { penetrable: true, radar: 'fence' }); bx(-33.2, 0, 1.6, -32.8, 2.2, 7, 'wood', { penetrable: true, radar: 'fence' });
        bx(-30, 0, -2.6, -27.6, 2.6, 2.6, 'sand', { penetrable: true, radar: 'crate' }); // hay stack in front of the gap (taller than eye height)
        // hay bales (shoot-through cover) across the field
        for (const [x, z, w, d, h] of [[-21, -6, 2.4, 1.2, 1.2], [-17, 8, 1.2, 2.4, 1.2], [-12, -12, 2.4, 1.2, 2.4], [-9, 4, 1.2, 1.2, 1.2], [-24, 15, 2.4, 1.2, 1.2], [-6, -18, 2.4, 1.2, 1.2], [-14, 18, 1.2, 1.2, 1.2]])
          bx(x, 0, z, x + w, h, z + d, 'sand', { penetrable: true, radar: 'crate' });
        // tractor and a cart
        b.car(X(-19), Z(-2.5), s > 0 ? Math.PI / 2 : -Math.PI / 2, 'barrelRed');
        bx(-8, 0, 11, -5, 1.0, 12.6, 'wood', { penetrable: true, radar: 'crate' });
        // wooden pasture fence pieces (shoot-through, waist high → vault over)
        for (const [x0, z0, x1, z1] of [[-26, -10, -26, -4], [-26, 4, -26, 10], [-12, 13, -4, 13], [-12, -14, -4, -14]]) bx(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 1.1, z1 + 0.06, 'wood', { penetrable: true, radar: 'fence' });
        b.sign(s > 0 ? 'ALPHA' : 'BRAVO', s > 0 ? '#6fb6ff' : '#ff6a5f', X(-44.4), 2.4, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 0.8);
        for (const [x, z] of [[-18, -25], [-12, -25], [-21, -26.5], [-9, -26.5]]) b.broadleaf(X(x), Z(z), 5);
      });
      b.spawnZone('alpha', -44, -7, -38, 7, -Math.PI / 2); b.spawnZone('bravo', 38, -7, 44, 7, Math.PI / 2);
    },
  },
  {
    // v39 DAM (after SF2 'Dam'): a rocky gorge cut in two by an 8 m concrete dam. Two galleries run through the dam (A north,
    // C south), long stairs climb to the crest walkway (B, the high ground with parapets). Irregular cliff-lined gorge, point-symmetric.
    id: 'dam', name: '水壩', en: 'DAM', desc: '戶外 · 峽谷、8 m 高壩頂、壩體隧道、控制室 · 92×60', slogan: 'SPILLWAY · 搶下壩頂制高點，或從隧道突破',
    look: { desat: 0.38, contrast: 1.1, pivot: 0.4, highlights: 1.04 },
    bounds: { minX: -46, maxX: 46, minZ: -30, maxZ: 30 }, indoor: false, navLevels: [0, 3.2, 8],
    hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.8, sky: { turbidity: 6, rayleigh: 1.4, elevation: 45, azimuth: 160 },
    sun: { pos: [20, 60, -30], color: 0xfff1dc, intensity: 2.8, auto: true }, hemi: [0xdbe6f5, 0x77705c, 1.0], exposure: 0.9,
    fog: { color: 0xc6cfd6, near: 60, far: 200 }, acoustics: 'outdoor', ambience: 'hill',
    shot: { pos: [-20, 12, 22], target: [0, 4, 0] },
    objectives: { dom: [[0, 0, 15], [0, 8, 0], [0, 0, -15]], relic: [0, 8, 0], domRadius: 3.6 },
    build(b) {
      const B = { x0: -46, z0: -30, x1: 46, z1: 30 }, W = B.x1 - B.x0, D = B.z1 - B.z0, CREST = 8;
      b.box(B.x0 - 6, -1, B.z0 - 6, B.x1 + 6, 0, B.z1 + 6, 'dirt', { cast: false, radar: false });
      // ---- gorge outline (alpha half + point mirror), edged by a cliff ring ----
      const open = new Uint8Array(W * D), set = (x0, z0, x1, z1, v) => {
        for (const s of [1, -1]) {
          const ax = Math.min(x0 * s, x1 * s), bx = Math.max(x0 * s, x1 * s), az = Math.min(z0 * s, z1 * s), bz = Math.max(z0 * s, z1 * s);
          for (let x = ax; x < bx; x++) for (let z = az; z < bz; z++) open[(z - B.z0) * W + (x - B.x0)] = v;
        }
      };
      set(-45, -9, -36, 9, 1);    // spawn hollow
      set(-36, -22, 0, 22, 1);    // west gorge floor (mirror = east)
      set(-30, 22, -8, 29, 1);    // north-west bay (control house)
      set(-22, -27, -6, -22, 1);  // south-west bay (pipes)
      set(-36, 16, -31, 22, 0); set(-36, -22, -32, -15, 0); set(-12, 22, -8, 29, 0); // bite the corners
      set(-40, -13, -36, -9, 1); set(-40, 9, -36, 13, 1);
      const ring = new Uint8Array(W * D), isOpen = (x, z) => x >= 0 && z >= 0 && x < W && z < D && open[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (!open[z * W + x]) for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) if (isOpen(x + dx, z + dz)) { ring[z * W + x] = 1; break; }
      const used = new Uint8Array(W * D), cliff = (x, z) => ring[z * W + x] && !used[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        if (!cliff(x, z)) continue;
        let x1 = x; while (x1 + 1 < W && cliff(x1 + 1, z)) x1++;
        let z1 = z; while (z1 + 1 < D) { let ok = true; for (let k = x; k <= x1; k++) if (!cliff(k, z1 + 1)) { ok = false; break; } if (!ok) break; z1++; }
        for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) used[zz * W + k] = 1;
        b.box(B.x0 + x, 0, B.z0 + z, B.x0 + x1 + 1, 9 + ((x * 3 + z) % 4), B.z0 + z1 + 1, 'rock', { radar: 'wall' });
      }
      for (let z = 0; z < D; z += 4) for (let x = 0; x < W; x += 4) if (ring[z * W + x] && ((x * 5 + z * 7) % 9) < 4) b.boulder(B.x0 + x + 0.5, B.z0 + z + 0.5, 2.2 + ((x + z) % 3));
      // ---- the dam: solid concrete with two 3 m galleries, crest walkway at 8 m with parapets ----
      const T0 = 12, T1 = 18; // gallery z span (north; mirrored south)
      b.box(-4, 0, -T0, 4, CREST, T0, 'concreteWall', { radar: 'building' });
      b.box(-4, 0, T1, 4, CREST, 30, 'concreteWall', { radar: 'building' }); b.box(-4, 0, -30, 4, CREST, -T1, 'concreteWall', { radar: 'building' });
      for (const s of [1, -1]) b.box(-4, 3.2, Math.min(s * T0, s * T1), 4, CREST, Math.max(s * T0, s * T1), 'concreteWall', { radar: false });
      for (const s of [1, -1]) { b.light(0, 2.8, s * 15, 0xffe2b8, 18, 9); b.box(-4, 0, s > 0 ? T0 : -T1, 4, 0.02, s > 0 ? T1 : -T0, 'concrete', { radar: false, cast: false }); }
      b.plane(-4, -30, 4, 30, CREST + 0.003, 'concrete');
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s, bx = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        // crest parapets on the west face (mirror = east), gap where the stairs arrive
        bx(-4, CREST, -30, -3.7, CREST + 1.05, -14.4, 'concreteWall', { radar: false }); bx(-4, CREST, -11.4, -3.7, CREST + 1.05, 30, 'concreteWall', { radar: false });
        // long stair up the west face: from z = -2 (ground) south to z = -14 (crest)
        b.stairs({ axis: 'z', from: Z(-0.5), dir: -s, a0: Math.min(X(-5.8), X(-4)), a1: Math.max(X(-5.8), X(-4)), steps: 27, rise: CREST / 27, run: 0.42, mat: 'concrete', nosing: 'yellowSteel' });
        bx(-5.8, CREST - 0.3, -14.4, -4, CREST, -11.8, 'concrete', { radar: 'catwalk' }); // top landing → step east onto the crest
        bx(-6, CREST, -14.4, -5.8, CREST + 1.0, -11.8, 'yellowSteel', { radar: false }); bx(-6, CREST, -14.6, -4, CREST + 1.0, -14.4, 'yellowSteel', { radar: false });
        // gallery mouths: blast doors pushed open + sandbags
        b.sandbags(Math.min(X(-9), X(-7)), Math.min(Z(13), Z(17)), Math.max(X(-9), X(-7)), Math.max(Z(13), Z(17)), 1.05);
        // control house (two floors, roof reachable by its stairs) in the north-west bay
        b.building({ x0: Math.min(X(-27), X(-18)), z0: Math.min(Z(22.5), Z(28.5)), x1: Math.max(X(-27), X(-18)), z1: Math.max(Z(22.5), Z(28.5)), y0: 0, floors: 2, fh: 3.2, mat: 'concreteWall', slab: 'concrete',
          doors: s > 0 ? { s: [X(-22.5)] } : { n: [X(-22.5)] } });
        // penstock pipes in the south-west bay (cover, run east-west)
        for (const z of [-24.5, -21]) { if (!b.dry) { const c = new THREE.CylinderGeometry(0.9, 0.9, 14, 18); c.rotateZ(Math.PI / 2); c.translate(X(-14), 0.9, Z(z)); b.geo(c, 'darkSteel'); } bx(-21, 0, z - 0.9, -7, 1.8, z + 0.9, null, { radar: 'crate', material: 'metal' }); }
        // gorge cover: boulders, crates, a transformer box, a fallen spillway slab
        for (const [x, z, r] of [[-28, -6, 2.0], [-20, 8, 1.6], [-14, -12, 1.8], [-24, 16, 1.4], [-10, 4, 1.3]]) b.boulder(X(x), Z(z), r);
        for (const [x, z, sz] of [[-17, -2, 1.1], [-17.2, -0.8, 0.9], [-31, 4, 1.1], [-12, 18, 1.0]]) b.crate(X(x), Z(z), sz);
        bx(-24, 0, -1.5, -21.5, 2.2, 1.5, 'darkSteel', { material: 'metal', radar: 'crate' });
        bx(-34, 0, -7.5, -33.4, 2.4, -2.5, 'concreteWall', { radar: 'wall' }); bx(-34, 0, 2.5, -33.4, 2.4, 7.5, 'concreteWall', { radar: 'wall' }); // spawn blast walls
        bx(-30.5, 0, -1.6, -29.9, 2.6, 1.6, 'concreteWall', { radar: 'wall' });
        b.lamp(X(-6.5), Z(-1), 6.5);
        b.sign(s > 0 ? 'ALPHA' : 'BRAVO', s > 0 ? '#6fb6ff' : '#ff6a5f', X(-44.6), 2.6, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 0.8);
      });
      b.sign('DAM 07', '#e8e2d0', -4.02, 5.6, 0, -Math.PI / 2, 5, 1.2); b.sign('DAM 07', '#e8e2d0', 4.02, 5.6, 0, Math.PI / 2, 5, 1.2);
      b.spawnZone('alpha', -44, -7, -38, 7, -Math.PI / 2); b.spawnZone('bravo', 38, -7, 44, 7, Math.PI / 2);
    },
  },
  {
    // v42 HANGAR (after SF2 'Hangar'): a steel-walled hangar (bullets do not go through) with a transport plane raised on its gear
    // in the middle — you can walk under it. North and south of the hangar run two outdoor alleys for snipers / flankers, overlooked by
    // catwalk windows inside. Irregular apron outline, point-symmetric.
    id: 'hangar', name: '機庫', en: 'HANGAR', desc: '室內外 · 鋼板機庫、架高運輸機、兩側小路、二樓窗口 · 96×60', slogan: 'AIRFIELD · 機腹下穿越，小路繞後',
    look: { desat: 0.36, contrast: 1.1, pivot: 0.38, highlights: 1.04 },
    bounds: { minX: -48, maxX: 48, minZ: -30, maxZ: 30 }, indoor: false, navLevels: [0, 4],
    hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.8, sky: { turbidity: 5, rayleigh: 1.3, elevation: 38, azimuth: 120 },
    sun: { pos: [-25, 50, 30], color: 0xfff0dc, intensity: 2.8, auto: true }, hemi: [0xdbe6f5, 0x6f6c60, 1.0], exposure: 0.9,
    fog: { color: 0xc6cfd6, near: 70, far: 210 }, acoustics: 'warehouse', ambience: 'harbor',
    shot: { pos: [-17, 3, -8], target: [4, 2.4, 2] },
    objectives: { dom: [[0, 0, 20], [0, 0, 0], [0, 0, -20]], relic: [0, 0, 0], domRadius: 3.6 },
    build(b) {
      const B = { x0: -48, z0: -30, x1: 48, z1: 30 }, W = B.x1 - B.x0, D = B.z1 - B.z0, HX = 20, HZ = 12, HH = 10;
      b.box(B.x0 - 6, -1, B.z0 - 6, B.x1 + 6, 0, B.z1 + 6, 'asphalt', { cast: false, radar: false });
      // ---- apron outline with a perimeter wall ring (alpha half + point mirror) ----
      const open = new Uint8Array(W * D), set = (x0, z0, x1, z1, v) => {
        for (const s of [1, -1]) {
          const ax = Math.min(x0 * s, x1 * s), bx = Math.max(x0 * s, x1 * s), az = Math.min(z0 * s, z1 * s), bz = Math.max(z0 * s, z1 * s);
          for (let x = ax; x < bx; x++) for (let z = az; z < bz; z++) open[(z - B.z0) * W + (x - B.x0)] = v;
        }
      };
      set(-47, -10, -32, 10, 1);   // spawn yard
      set(-32, -27, 0, 27, 1);     // apron + alleys (mirror = east)
      set(-32, 20, -26, 27, 0); set(-32, -27, -27, -19, 0); set(-10, 25, 0, 27, 0); // bite corners
      set(-36, 10, -32, 15, 1); set(-36, -15, -32, -10, 1);
      const ring = new Uint8Array(W * D), isOpen = (x, z) => x >= 0 && z >= 0 && x < W && z < D && open[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (!open[z * W + x]) for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) if (isOpen(x + dx, z + dz)) { ring[z * W + x] = 1; break; }
      const used = new Uint8Array(W * D), wall = (x, z) => ring[z * W + x] && !used[z * W + x];
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        if (!wall(x, z)) continue;
        let x1 = x; while (x1 + 1 < W && wall(x1 + 1, z)) x1++;
        let z1 = z; while (z1 + 1 < D) { let ok = true; for (let k = x; k <= x1; k++) if (!wall(k, z1 + 1)) { ok = false; break; } if (!ok) break; z1++; }
        for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) used[zz * W + k] = 1;
        b.box(B.x0 + x, 0, B.z0 + z, B.x0 + x1 + 1, 5, B.z0 + z1 + 1, 'concreteWall', { radar: 'wall' });
      }
      // ---- hangar shell: steel walls, big end doors (half open), side doors, catwalk windows ----
      b.plane(-HX, -HZ, HX, HZ, 0.003, 'polished');
      const win = (lo, hi) => { const o = []; for (let a = lo; a + 2 <= hi; a += 5) o.push({ a, b: a + 2, y0: 5, y1: 6.3 }); return o; };
      for (const s of [1, -1]) {
        b.wallX(s * HZ, -HX, HX, 0, HH, 0.4, 'siding', [{ a: -13.5, b: -11.5 }, { a: 11.5, b: 13.5 }, ...win(-15, 10).map((o) => (s > 0 ? o : Object.assign({}, o, { a: -o.b, b: -o.a })))], { radar: 'wall' });
        b.wallZ(s * HX, -HZ, HZ, 0, HH, 0.4, 'siding', [{ a: -6, b: 6, y1: 6 }], { radar: 'wall' });
      }
      b.box(-HX - 0.3, HH, -HZ - 0.3, HX + 0.3, HH + 0.4, HZ + 0.3, 'roof', { radar: false });
      for (let x = -16; x <= 16; x += 8) for (const z of [-6, 6]) b.panel(x, z, HH - 0.3, 2.4, 0.8);
      for (let x = -18; x <= 18; x += 6) b.box(x - 0.15, HH - 0.8, -HZ, x + 0.15, HH - 0.5, HZ, 'darkSteel', { radar: false, physics: false }); // roof trusses
      // ---- transport plane on its gear (walk under the fuselage and wings) ----
      if (!b.dry) {
        const f = new THREE.CylinderGeometry(1.9, 1.9, 22, 20); f.rotateZ(Math.PI / 2); f.translate(0, 3.5, 0); b.geo(f, 'whiteSteel');
        for (const sx of [-1, 1]) { const c = new THREE.SphereGeometry(1.9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2); c.rotateZ(sx * -Math.PI / 2); c.translate(sx * 11, 3.5, 0); b.geo(c, 'whiteSteel'); }
      }
      b.box(-11, 1.7, -1.6, 11, 5.3, 1.6, null, { radar: 'crate', material: 'metal' }); // fuselage collider (bottom at 1.7 m: walk under, crouch to be safe)
      b.box(-3, 4.2, -9, 3, 4.6, 9, 'whiteSteel', { radar: false }); // wings
      b.box(9, 4.6, -0.2, 11.5, 8.2, 0.2, 'whiteSteel', { radar: false }); // tail fin
      for (const [x, z] of [[-6, -1.4], [-6, 1.4], [6, -1.4], [6, 1.4], [0, -4], [0, 4]]) b.cyl(x, z, 0.32, 0, 1.7, 'darkSteel', { seg: 10, radar: 'crate' }); // gear legs
      b.sym((s) => {
        const X = (x) => x * s, Z = (z) => z * s, bx = (x0, y0, z0, x1, y1, z1, m, o) => b.box(Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), m, o);
        // big-door blocker: tool cabinets across the doorway centre (breaks the spawn-to-spawn line)
        bx(-17.5, 0, -1.6, -16.6, 2.6, 1.6, 'darkSteel', { material: 'metal', radar: 'crate' });
        for (const [x, z, sz] of [[-15, 6.5, 1.2], [-15, 8, 1.0], [-13, -7, 1.2], [-8, 9.5, 1.1], [-4, -9, 1.0]]) b.crate(X(x), Z(z), sz);
        bx(-15, 0, -3, -13.2, 1.1, -1.2, 'yellowSteel', { material: 'metal', radar: 'crate' }); // tug
        // north catwalk at 4 m along the inside of the wall, stairs from the west end; windows look into the alley
        bx(-16, 3.75, 9.4, 8, 4, HZ - 0.2, 'plate', { radar: 'catwalk' });
        b.railing(Math.min(X(-15.6), X(8)), Z(9.4), Math.max(X(-15.6), X(8)), Z(9.4), 4, 'yellowSteel');
        b.stairs({ axis: 'x', from: X(-19.6), dir: s, a0: Math.min(Z(10), Z(11.6)), a1: Math.max(Z(10), Z(11.6)), steps: 13, rise: 4 / 13, run: 0.3, mat: 'plate', nosing: 'yellowSteel' });
        // alleys: containers, pallets, a fuel bowser — long sightlines broken into lanes
        b.container(X(-22), Z(19), 'x', 1, 0x3b6a8c); b.container(X(-8), Z(22), 'x', 1, 0x8c3b30); b.container(X(-14), Z(16.5), 'z', 2, 0x5a6b3a);
        for (const [x, z] of [[-27, 15], [-3, 16], [-18, 24]]) b.pallet(X(x), Z(z), 0, 1);
        b.barrel(X(-25), Z(-14), true); b.barrel(X(-24.2), Z(-14.6), false);
        bx(-31, 0, -3, -30.3, 2.4, 3, 'concreteWall', { radar: 'wall' }); // spawn screen
        bx(-37, 0, -8, -36.3, 2.2, -4, 'concreteWall', { radar: 'wall' }); bx(-37, 0, 4, -36.3, 2.2, 8, 'concreteWall', { radar: 'wall' });
        b.lamp(X(-26), Z(11), 7); b.lamp(X(-26), Z(-11), 7);
        b.sign(s > 0 ? 'ALPHA' : 'BRAVO', s > 0 ? '#6fb6ff' : '#ff6a5f', X(-46.6), 2.6, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 0.8);
        b.sign(s > 0 ? 'HANGAR 2' : 'HANGAR 2', '#e8e2d0', X(-HX - 0.22), 7.6, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 6, 1.4);
        b.light(X(-10), 8.5, Z(-6), 0xfff2de, 28, 20);
      });
      b.paint(-HX + 1, -0.15, HX - 1, 0.15, 0xd9b01c);
      b.spawnZone('alpha', -46, -8, -40, 8, -Math.PI / 2); b.spawnZone('bravo', 40, -8, 46, 8, Math.PI / 2);
    },
  },
];

// Radar/thumbnail rendering from the builder's footprint list.
function drawMapPreview(canvas, def, dryData, opts = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, B = def.bounds;
  const sx = W / (B.maxX - B.minX + 4), sz = H / (B.maxZ - B.minZ + 4), s = Math.min(sx, sz);
  const ox = W / 2 - ((B.minX + B.maxX) / 2) * s, oz = H / 2 - ((B.minZ + B.maxZ) / 2) * s;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  const tint = { warehouse: ['#1d2622', '#0e1311'], desert: ['#3c3222', '#1d170f'], harbor: ['#2a2230', '#141018'], office: ['#1f2530', '#10141a'], snow: ['#2c3440', '#161b22'], ruins: ['#27301f', '#11160d'], ridge: ['#26301f', '#10150c'] }[def.id] || ['#1b221e', '#0b0f0d'];
  bg.addColorStop(0, tint[0]); bg.addColorStop(1, tint[1]); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(ox, oz); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
  if (dryData.T) ctx.drawImage(terrainShade(dryData.T, B, 256), B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
  const col = { wall: 'rgba(210,225,215,.55)', solid: 'rgba(200,210,205,.45)', building: 'rgba(225,215,190,.6)', container: 'rgba(190,210,195,.5)', container2: 'rgba(235,245,238,.72)',
    crate: 'rgba(210,170,110,.55)', catwalk: 'rgba(110,170,255,.28)', ramp: 'rgba(255,205,80,.45)', sandbag: 'rgba(200,185,140,.55)', fence: 'rgba(170,180,190,.35)', glass: 'rgba(140,210,240,.45)', ladder: 'rgba(255,150,40,.9)' };
  for (const r of dryData.radar) { const c = col[r.kind]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
  const zA = dryData.zones.alpha, zB = dryData.zones.bravo;
  if (zA) { ctx.fillStyle = 'rgba(99,179,255,.35)'; ctx.fillRect(zA.x0, zA.z0, zA.x1 - zA.x0, zA.z1 - zA.z0); }
  if (zB) { ctx.fillStyle = 'rgba(255,93,82,.35)'; ctx.fillRect(zB.x0, zB.z0, zB.x1 - zB.x0, zB.z1 - zB.z0); }
  ctx.strokeStyle = 'rgba(160,255,190,.5)'; ctx.lineWidth = 0.35; ctx.strokeRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
  ctx.restore();
  if (opts.labels !== false) {
    ctx.font = `bold ${Math.round(H * 0.09)}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (zA) { ctx.fillStyle = '#63b3ff'; ctx.fillText('A', ox + ((zA.x0 + zA.x1) / 2) * s, oz + ((zA.z0 + zA.z1) / 2) * s); }
    if (zB) { ctx.fillStyle = '#ff5d52'; ctx.fillText('B', ox + ((zB.x0 + zB.x1) / 2) * s, oz + ((zB.z0 + zB.z1) / 2) * s); }
  }
}


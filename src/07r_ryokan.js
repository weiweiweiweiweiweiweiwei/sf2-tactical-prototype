
/* =====================================================================
   v44 SAKURA INN (櫻花客棧 · SF2 "Ryokan", seizure map, 2012) — traced from the in-game Tab map of a 2016 KR clan
   match (the 4:3 upload is squashed horizontally; the square objective icon gives ×4/3) and checked against the
   player-drawn floor plan (2F = green, jumpable eaves = blue) and TW / KR / TR gameplay videos.
   Spec units are Tab-map pixels (u → east, v → south): x = (u − 112) · 0.4 m, z = (v − 166) · 0.3 m.
   ryokanPlan() turns the walkable masks into walls / rails / slabs / stairs / eaves / roofs. It is pure data (no
   THREE), so tools/ryokan/export_plan.mjs feeds the very same plan to Blender (tools/blender/ryokan_build.py) —
   the GLB visuals and the game colliders cannot drift apart.
   ===================================================================== */
const RYOKAN_SPEC = {
  F2: 3.4, TOP2: 6.3, TOP1: 3.6, EAVE: 2.25, BOUND: 4.2, BLOCK: 14,
  walk1: [
    [100, 11, 186, 38], [124, 38, 128, 41], [128, 38, 190, 59], [186, 15, 190, 38],           // 守方家 defender yard
    [172, 59, 193, 107], [193, 62, 196, 100],                                                   // 東側 east street
    [172, 107, 212, 124], [124, 124, 208, 150], [124, 150, 188, 159],                           // 野外溫泉 + 鐘樓 plaza
    [128, 82, 172, 96], [128, 96, 140, 124], [116, 110, 129, 124],                              // back alley → central stairs
    [92, 121, 124, 151], [64, 133, 92, 151], [64, 151, 74, 176], [85, 151, 152, 179],          // 中央大廳 hall + approaches
    [8, 99, 43, 127], [8, 127, 24, 145], [8, 145, 43, 153], [10, 153, 43, 173], [17, 173, 43, 175], // 西側 west wing
    [20, 78, 37, 99], [37, 87, 40, 99],                                                         // west house room (左側入口)
    [17, 175, 101, 195], [11, 190, 39, 210], [39, 175, 101, 260],                               // 中央路口 crossing
    [150, 159, 168, 198], [152, 198, 170, 232], [152, 232, 168, 262], [101, 262, 168, 281], [101, 250, 123, 262], // 天橋下 street
    [64, 260, 126, 322],                                                                        // 逃脫點 / 攻方家
  ],
  // buildings: footprint rects (earlier entries win overlaps); storeys; open2 = some 2F rooms are playable
  buildings: [
    { id: 'honkan', name: '本館', rects: [[55, 38, 124, 41], [55, 41, 128, 110], [55, 110, 116, 121]], storeys: 2, open2: true, roof: 'irimoya', style: 'inn' },
    { id: 'kura', name: '土藏', rects: [[20, 38, 55, 78], [37, 78, 55, 87]], storeys: 2, roof: 'kirizuma', style: 'kura' },
    { id: 'nishiya', name: '西屋', rects: [[20, 78, 37, 99]], storeys: 1, roof: 'kirizuma', style: 'house', walk: true },
    { id: 'higashi1', name: '東一棟', rects: [[128, 59, 172, 82]], storeys: 2, roof: 'irimoya', style: 'shop' },
    { id: 'higashi2', name: '東二棟', rects: [[140, 96, 172, 124]], storeys: 2, roof: 'kirizuma', style: 'shop' },
    { id: 'abld', name: 'A棟', rects: [[168, 159, 212, 190], [170, 190, 212, 226], [203, 150, 212, 159]], storeys: 2, open2: true, roof: 'irimoya', style: 'inn' },
    { id: 'sebld', name: '東南棟', rects: [[170, 226, 212, 232], [168, 232, 212, 281]], storeys: 2, roof: 'kirizuma', style: 'kura' },
    { id: 'bbld', name: 'B棟', rects: [[101, 179, 151, 250], [137, 250, 152, 262]], storeys: 2, open2: true, roof: 'irimoya', style: 'inn' },
    { id: 's1', name: '西南長屋', rects: [[43, 99, 64, 175], [24, 127, 43, 145], [64, 121, 92, 133]], storeys: 1, roof: 'kirizuma', style: 'shop' },
    { id: 'lshop', name: '茶屋', rects: [[74, 146, 85, 175], [85, 146, 92, 151]], storeys: 1, roof: 'kirizuma', style: 'shop' },
    { id: 'crossing', name: '中央路口', rects: [[60, 195, 83, 238]], storeys: 1, roof: 'irimoya', style: 'shop' },
  ],
  // stairs ground → 2F: up = the direction of ascent
  stairs: [
    { id: 'defender', r: [131, 41, 145, 51], up: '-u' },  // 守方家 → 本館 2F
    { id: 'left', r: [40, 87, 55, 99], up: '+u' },        // 左側入口 → 本館 2F
    { id: 'centre', r: [100, 110, 116, 121], up: '-u' },  // 中央大廳 → 本館 2F
    { id: 'east', r: [188, 150, 203, 159], up: '+u' },    // 鐘樓 plaza → A棟 2F
    { id: 'south', r: [123, 250, 137, 262], up: '+u' },   // 攻方 side → B棟 2F
  ],
  walk2: [
    [55, 38, 124, 41], [55, 41, 128, 110], [55, 110, 100, 121], [128, 41, 131, 51],            // 本館 2F + defender landing
    [168, 159, 212, 190], [170, 190, 212, 226], [203, 150, 212, 159],                           // A棟 2F + east landing
    [126, 203, 151, 231], [137, 231, 151, 250], [137, 250, 152, 262],                           // B棟 2F
    [151, 212, 170, 223],                                                                       // 天橋 covered bridge
  ],
  open2: [[128, 41, 131, 51], [203, 150, 212, 159], [151, 212, 170, 223]],                   // open-air 2F: railings, no windows
  // 2F partitions (shoji / fusuma / plaster): a → b along u or v, door gaps along the same axis
  part2: [
    { a: [62, 41], b: [62, 92], doors: [[48, 53], [78, 83]] },
    { a: [62, 92], b: [128, 92], doors: [[66, 70], [84, 89], [98, 103], [119, 124]] },
    { a: [76, 56], b: [108, 56], doors: [[89, 95]], mat: 'kabe' },                                // objective room: ochre clay walls
    { a: [76, 56], b: [76, 92], doors: [[70, 76]], mat: 'kabe' },
    { a: [108, 56], b: [108, 92], doors: [[63, 68]], mat: 'kabe' },
    { a: [116, 41], b: [116, 92], doors: [[44, 50], [70, 76]] },
    { a: [55, 100], b: [100, 100], doors: [[60, 64], [78, 82], [93, 99]] },
    { a: [80, 100], b: [80, 121], doors: [[107, 112]] },
    { a: [128, 41], b: [128, 51], doors: [[43, 49]] },                                          // defender landing door
    { a: [176, 159], b: [176, 226], doors: [[165, 170], [184, 189], [199, 204], [213, 222]] },   // A棟 west corridor
    { a: [176, 192], b: [212, 192], doors: [[190, 195]] },
    { a: [194, 159], b: [194, 192], doors: [[173, 178]] },
    { a: [194, 159], b: [212, 159], doors: [[204, 210]] },                                      // east landing door
    { a: [170, 212], b: [170, 223], doors: [[213.5, 221.5]] },                                  // bridge ↔ A棟
    { a: [151, 212], b: [151, 223], doors: [[213.5, 221.5]] },                                  // bridge ↔ B棟
    { a: [137, 231], b: [151, 231], doors: [[141, 147]] },
  ],
  // 2F floor finish (visuals only): tatami rooms; everything else keeps the polished corridor boards
  floors2: [
    [76, 56, 108, 92, 'tatami'], [62, 41, 116, 56, 'tatami'], [62, 56, 76, 92, 'tatami'], [108, 56, 116, 92, 'tatami'], [55, 100, 80, 121, 'tatami'],
    [176, 159, 194, 192, 'tatami'], [194, 159, 212, 192, 'tatami'], [176, 192, 212, 226, 'tatami'], [126, 203, 151, 231, 'tatami'],
  ],
  // free-standing ground-floor walls (inside walkable space): hall walls, the west house front, low fences
  walls1: [
    { a: [124, 123], b: [124, 151], h: 3.6, win: true },                                        // 中央大廳 east
    { a: [92, 151], b: [124, 151], h: 3.6, win: true },                                         // 中央大廳 south
    { a: [92, 121], b: [116, 121], h: 3.6 },                                                    // 中央大廳 north (under the stairs)
    { a: [20, 99], b: [43, 99], h: 3.6, doors: [[23, 30]] },                                    // 西屋 front with its door
    { a: [78, 258], b: [101, 258], h: 1.0, kind: 'fence' },                                     // low garden fence by the 攻方 stairs
  ],
  canopies: [{ id: 'hall', name: '中央大廳', r: [92, 121, 124, 151], h: 3.6, roof: 'irimoya' }, { id: 'leftstair', r: [37, 87, 55, 99], h: 6.0, roof: 'kirizuma' }],
  // jumpable 1F eaves (blue on the player plan): walkable lean-to roofs at EAVE height
  eaves: [
    { id: 'e1n', r: [138, 55, 172, 59] }, { id: 'e1e', r: [172, 55, 175, 83] },                  // 東一棟 north + east
    { id: 'e2e', r: [172, 91, 175, 121] },                                                      // 東二棟 east
    { id: 'e3w', r: [165, 159, 168, 190] },                                                     // A棟 west (over 天橋下)
  ],
  // props: [kind, u, v, (size / extra)]
  props: [
    ['belfry', 150.5, 150.5],                                   // 鐘樓 (base 146–155 × 145–156)
    ['well', 110, 132], ['rock', 48, 169, 1.5], ['lantern', 111.5, 155.5], ['basin', 107, 267, 1.3],
    ['tank', 177, 118], ['barrels', 176.1, 66], ['crates', 146, 52.8], ['crates', 163, 186],         // eave climbing aids
    ['cart', 66.5, 289], ['crates', 120, 302],                                                  // 逃脫點 cover (Tab boxes)
    ['torii', 95, 314], ['gate', 95, 322],                                                      // 正門 village gate (escape point)
    ['onsen', 202, 126], ['rock', 211, 118, 1.6], ['rock', 210, 135, 1.25], ['rock', 193.5, 115.5, 1.1],          // big onsen boulders ['sakura', 190, 113], ['sakura', 206, 141],
    ['sakura', 14, 104], ['sakura', 14, 160], ['sakura', 33, 200], ['sakura', 104, 20], ['sakura', 176, 22],
    ['sakura', 92, 286], ['sakura', 47, 248], ['sakura', 186, 98], ['pine', 160, 27], ['pine', 30, 182],
    ['streetlamp', 176, 75], ['streetlamp', 190, 128], ['streetlamp', 66, 200], ['streetlamp', 98, 240], ['streetlamp', 155, 240],
    ['vending', 131, 92], ['table', 92, 74],                                                   // the scroll's low table (relic rests on it)
  ],
  spawns: { alpha: [70, 292, 120, 318], bravo: [108, 14, 180, 34] },
  objective: [92, 74],
  dom: [[190, 135], [108, 140], [50, 225]],
};

function ryokanPlan(S = RYOKAN_SPEC) {
  const NU = 224, NV = 332, ix = (i, j) => j * NU + i;
  const U = (u) => +((u - 112) * 0.4).toFixed(3), V = (v) => +((v - 166) * 0.3).toFixed(3), KU = 0.4, KV = 0.3;
  const W1 = new Uint8Array(NU * NV), W2 = new Uint8Array(NU * NV), O2 = new Uint8Array(NU * NV);
  const OWN = new Int16Array(NU * NV).fill(-1), STR = new Int16Array(NU * NV).fill(-1);
  const fill = (A, r, val, onlyEmpty) => { for (let j = Math.max(0, r[1]); j < Math.min(NV, r[3]); j++) for (let i = Math.max(0, r[0]); i < Math.min(NU, r[2]); i++) { const c = ix(i, j); if (!onlyEmpty || A[c] < 0) A[c] = val; } };
  S.walk1.forEach((r) => fill(W1, r, 1));
  S.buildings.forEach((b, k) => b.rects.forEach((r) => fill(OWN, r, k, true)));
  S.stairs.forEach((s, k) => { fill(W1, s.r, 1); fill(STR, s.r, k); });
  S.walk2.forEach((r) => fill(W2, r, 1)); S.open2.forEach((r) => fill(O2, r, 1));
  for (let c = 0; c < W2.length; c++) if (STR[c] >= 0) W2[c] = 0;
  const at = (A, i, j, d = 0) => (i < 0 || j < 0 || i >= NU || j >= NV ? d : A[ix(i, j)]);
  const own = (i, j) => at(OWN, i, j, -1), str = (i, j) => at(STR, i, j, -1);
  const topOf = (k) => (S.buildings[k].storeys === 2 ? S.TOP2 : S.TOP1);
  // stair top edge: the cell just beyond the top end (inside the stair's lateral span)
  const isTop = (k, ci, cj) => { const s = S.stairs[k], [u0, v0, u1, v1] = s.r;
    if (s.up === '+u') return ci === u1 && cj >= v0 && cj < v1; if (s.up === '-u') return ci === u0 - 1 && cj >= v0 && cj < v1;
    if (s.up === '+v') return cj === v1 && ci >= u0 && ci < u1; return cj === v0 - 1 && ci >= u0 && ci < u1; };
  // unit edges → merged segments. rule(ci,cj,ni,nj) → null | { key, inN (wall body on the neighbour side), ...props }
  const extract = (walk, rule) => {
    const runs = new Map();
    const push = (o, line, s, side, r) => { const k = o + '|' + line + '|' + side + '|' + r.key; let L = runs.get(k); if (!L) runs.set(k, L = { o, line, side, r, cells: [] }); L.cells.push(s); };
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      if (!walk[ix(i, j)]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (at(walk, ni, nj)) continue;
        const r = rule(i, j, ni, nj); if (!r) continue;
        if (di) push('v', di > 0 ? i + 1 : i, j, di * (r.inN ? 1 : -1), r); else push('h', dj > 0 ? j + 1 : j, i, dj * (r.inN ? 1 : -1), r);
      }
    }
    const segs = [];
    for (const L of runs.values()) {
      L.cells.sort((a, b) => a - b); let s0 = L.cells[0], p = s0;
      const emit = (a, b) => segs.push(Object.assign({ o: L.o, line: L.line, a, b, side: L.side }, L.r));
      for (let q = 1; q < L.cells.length; q++) { if (L.cells[q] !== p + 1) { emit(s0, p + 1); s0 = L.cells[q]; } p = L.cells[q]; }
      emit(s0, p + 1);
    }
    return segs;
  };
  const T = 0.26, TP = 0.12, TR = 0.08; // wall, partition, rail thickness (m)
  // segment (spec units) → metric box. side > 0: body on the +u/+v side of the line.
  const segBox = (s, th, y0, y1) => {
    if (s.o === 'h') { const z = V(s.line), z0 = s.side > 0 ? z : z - th, z1 = s.side > 0 ? z + th : z; return { x0: U(s.a), x1: U(s.b), z0, z1, y0, y1 }; }
    const x = U(s.line), x0 = s.side > 0 ? x : x - th, x1 = s.side > 0 ? x + th : x; return { x0, x1, z0: V(s.a), z1: V(s.b), y0, y1 };
  };
  const walls = [], rails = [];
  // ---- ground floor: walkable ↔ building / outside ----
  for (const s of extract(W1, (ci, cj, ni, nj) => {
    const k = own(ni, nj);
    if (k >= 0) { const h = at(W2, ni, nj) ? S.F2 : topOf(k); return { key: 'b' + k + ':' + h, inN: true, kind: 'bld', bld: k, y0: 0, y1: h }; }
    return { key: 'out', inN: true, kind: 'bound', y0: 0, y1: S.BOUND };
  })) walls.push(Object.assign(segBox(s, T, s.y0, s.y1), { kind: s.kind, bld: s.bld ?? -1, level: 1, o: s.o, face: s.side > 0 ? (s.o === 'h' ? 'n' : 'w') : (s.o === 'h' ? 's' : 'e') }));
  // ---- first floor: walk2 ↔ stairwell / closed rooms / air ----
  for (const s of extract(W2, (ci, cj, ni, nj) => {
    const sk = str(ni, nj), kc = own(ci, cj), kn = own(ni, nj), open = at(O2, ci, cj);
    if (sk >= 0) { if (isTop(sk, ci, cj)) return null; // the landing at the top of the flight stays open
      return kn >= 0 ? { key: 'rail', inN: false, kind: 'rail' } : { key: 'w2s', inN: false, kind: 'ext', win: false, bld: kc }; } // stairwell rail / outside flight: wall
    if (kn >= 0 && kn === kc) return { key: 'in' + kn, inN: true, kind: 'ext', win: false, bld: kn };
    if (kn >= 0) return { key: 'nb' + kc, inN: false, kind: 'ext', win: false, bld: kc };
    if (!at(W1, ni, nj)) return { key: 'o' + kc, inN: false, kind: 'ext', win: false, bld: kc, outside: true };
    return open ? { key: 'rail', inN: false, kind: 'rail' } : { key: 'x' + kc, inN: false, kind: 'ext', win: true, bld: kc };
  })) {
    if (s.kind === 'rail') { rails.push(Object.assign(segBox(s, TR, S.F2, S.F2 + 1.0), { level: 2, o: s.o })); continue; }
    const b = segBox(s, T, S.F2, S.TOP2), len = s.o === 'h' ? (s.b - s.a) * KU : (s.b - s.a) * KV;
    const wins = []; if (s.win && len > 2.4) { const n = Math.max(1, Math.floor((len - 1.2) / 3.0)), pitch = (len - 1.2) / n; for (let q = 0; q < n; q++) { const c = 0.6 + pitch * (q + 0.5); wins.push([c - 0.75, c + 0.75]); } }
    walls.push(Object.assign(b, { kind: 'ext2', bld: s.bld ?? -1, level: 2, o: s.o, wins, sill: 0.85, head: 2.1, face: s.side > 0 ? (s.o === 'h' ? 'n' : 'w') : (s.o === 'h' ? 's' : 'e') }));
  }
  // ---- partitions & free walls (spec segments with door gaps) ----
  const segWalls = (list, y0Base, th, kind, defH) => { const out = [];
    for (const p of list) {
      const alongU = p.a[1] === p.b[1], lo = alongU ? Math.min(p.a[0], p.b[0]) : Math.min(p.a[1], p.b[1]), hi = alongU ? Math.max(p.a[0], p.b[0]) : Math.max(p.a[1], p.b[1]);
      const line = alongU ? p.a[1] : p.a[0], h = p.h ?? defH, doors = (p.doors || []).slice().sort((a, b) => a[0] - b[0]);
      const box = (a, b, y0, y1) => (alongU ? { x0: U(a), x1: U(b), z0: V(line) - th / 2, z1: V(line) + th / 2, y0, y1 } : { x0: U(line) - th / 2, x1: U(line) + th / 2, z0: V(a), z1: V(b), y0, y1 });
      let cur = lo; const seg = { kind: p.kind || kind, o: alongU ? 'h' : 'v', parts: [], doors: [], win: !!p.win, mat: p.mat };
      for (const [d0, d1] of doors) { if (d0 > cur) seg.parts.push(box(cur, d0, y0Base, y0Base + h)); if (h > 2.4) seg.parts.push(Object.assign(box(d0, d1, y0Base + 2.1, y0Base + h), { lintel: true })); seg.doors.push(box(d0, d1, y0Base, y0Base + 2.1)); cur = d1; }
      if (hi > cur) seg.parts.push(box(cur, hi, y0Base, y0Base + h));
      out.push(seg);
    }
    return out; };
  const parts2 = segWalls(S.part2, S.F2, TP, 'part', S.TOP2 - S.F2), walls1 = segWalls(S.walls1, 0, 0.22, 'wall1', 3.6);
  // ---- rect merging (greedy) for slabs, nav, radar ----
  const merge = (pred) => { const used = new Uint8Array(NU * NV), out = [];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const c = ix(i, j); if (used[c] || !pred(i, j)) continue;
      let w = 1; while (i + w < NU && !used[ix(i + w, j)] && pred(i + w, j)) w++;
      let h = 1; grow: for (; j + h < NV; h++) { for (let q = 0; q < w; q++) if (used[ix(i + q, j + h)] || !pred(i + q, j + h)) break grow; }
      for (let y = 0; y < h; y++) for (let q = 0; q < w; q++) used[ix(i + q, j + y)] = 1;
      out.push([i, j, i + w, j + h]);
    }
    return out; };
  const M = (r) => ({ x0: U(r[0]), z0: V(r[1]), x1: U(r[2]), z1: V(r[3]) });
  const slabs = merge((i, j) => at(W2, i, j)).map(M);
  const ground = merge((i, j) => at(W1, i, j) && str(i, j) < 0).map(M);
  const outside = merge((i, j) => !at(W1, i, j) && own(i, j) < 0).map(M);
  const stairs = S.stairs.map((s) => { const [u0, v0, u1, v1] = s.r, alongU = s.up[1] === 'u', dir = s.up[0] === '+' ? 1 : -1;
    const len = alongU ? (u1 - u0) * KU : (v1 - v0) * KV, steps = Math.round(S.F2 / 0.2), rise = S.F2 / steps, run = len / steps;
    return { id: s.id, axis: alongU ? 'x' : 'z', dir, from: alongU ? (dir > 0 ? U(u0) : U(u1)) : (dir > 0 ? V(v0) : V(v1)), a0: alongU ? V(v0) : U(u0), a1: alongU ? V(v1) : U(u1), steps, rise, run, rect: M(s.r) }; });
  const buildings = S.buildings.map((b, k) => ({ id: b.id, name: b.name, storeys: b.storeys, open2: !!b.open2, roof: b.roof, style: b.style, walk: !!b.walk, top: topOf(k), rects: b.rects.map(M), cells: merge((i, j) => own(i, j) === k).map(M) }));
  const P = (u, v) => [U(u), V(v)];
  return {
    S, U, V, P, ground, slabs, outside, walls, rails, parts2, walls1, stairs, buildings,
    eaves: S.eaves.map((e) => Object.assign({ id: e.id, y: S.EAVE }, M(e.r))), floors2: (S.floors2 || []).map(([u0, v0, u1, v1, type]) => Object.assign({ type }, M([u0, v0, u1, v1]))),
    canopies: S.canopies.map((c) => Object.assign({ id: c.id, name: c.name, h: c.h, roof: c.roof }, M(c.r))),
    props: S.props.map(([kind, u, v, a]) => ({ kind, x: U(u), z: V(v), a })),
    spawns: { alpha: M(S.spawns.alpha), bravo: M(S.spawns.bravo) }, objective: P(...S.objective), dom: S.dom.map((d) => P(...d)),
    bounds: { minX: U(6), maxX: U(217), minZ: V(8), maxZ: V(325) },
  };
}

/* -------------------- game side: colliders, radar, nav, fallback visuals -------------------- */
function buildRyokan(b) {
  const PL = b.def._plan || (b.def._plan = ryokanPlan()), S = PL.S, glb = !b.dry && b.def._glb;
  const vis = (m) => (glb ? null : m);
  b.box(PL.bounds.minX - 6, -1, PL.bounds.minZ - 6, PL.bounds.maxX + 6, 0, PL.bounds.maxZ + 6, vis('stonePave'), { cast: false, radar: false, surface: 'concrete' });
  // radar: the Tab map look — outside and building masses dark, the streets light
  for (const r of PL.outside) b.radar.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, kind: 'solid', top: S.BOUND });
  for (const B of PL.buildings) for (const r of B.cells) b.radar.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, kind: 'building', top: B.top });
  // ground floor walls + boundary (outside walls carry an invisible blocker up to BLOCK so nothing leaves the map)
  for (const w of PL.walls) {
    if (w.kind === 'bound') {
      b.box(w.x0, 0, w.z0, w.x1, w.y1, w.z1, vis('plasterWhite'), { material: 'concrete', radar: false });
      b.box(w.x0, w.y1, w.z0, w.x1, S.BLOCK, w.z1, null, { blocksShot: false, radar: false, physics: false });
      continue;
    }
    if (w.level === 1) { b.box(w.x0, w.y0, w.z0, w.x1, w.y1, w.z1, vis(w.y1 > S.F2 + 0.1 ? 'plasterWhite' : 'darkWood'), { material: 'wood', penetrable: true, radar: false }); continue; }
    // 2F exterior wall with window openings along its length
    const alongX = w.o === 'h', lo = alongX ? w.x0 : w.z0, hi = alongX ? w.x1 : w.z1;
    const seg = (a, c, y0, y1) => (alongX ? b.box(a, y0, w.z0, c, y1, w.z1, vis('plasterWhite'), { material: 'wood', penetrable: true, radar: false }) : b.box(w.x0, y0, a, w.x1, y1, c, vis('plasterWhite'), { material: 'wood', penetrable: true, radar: false }));
    let cur = lo;
    for (const [p, q] of w.wins || []) { const a = lo + p, c = lo + q; if (a > cur) seg(cur, a, w.y0, w.y1); seg(a, c, w.y0, w.y0 + w.sill); seg(a, c, w.y0 + w.head, w.y1); cur = c; }
    if (hi > cur) seg(cur, hi, w.y0, w.y1);
  }
  for (const r of PL.rails) b.box(r.x0, r.y0, r.z0, r.x1, r.y1, r.z1, vis('darkWood'), { material: 'wood', penetrable: true, blocksShot: false, radar: false });
  for (const seg of PL.parts2.concat(PL.walls1)) for (const p of seg.parts) b.box(p.x0, p.y0, p.z0, p.x1, p.y1, p.z1, vis(seg.kind === 'part' ? 'shoji' : seg.kind === 'fence' ? 'darkWood' : 'plasterWhite'), { material: 'wood', penetrable: true, radar: seg.kind === 'wall1' ? 'wall' : false });
  // 2F floors (+ ceilings under every roof lid so the rooms are closed when the GLB is missing)
  for (const s of PL.slabs) b.box(s.x0, S.F2 - 0.24, s.z0, s.x1, S.F2, s.z1, vis('floorWood'), { material: 'wood', penetrable: true, radar: false });
  for (const st of PL.stairs) b.stairs({ axis: st.axis, from: st.from, dir: st.dir, a0: st.a0, a1: st.a1, steps: st.steps, rise: st.rise, run: st.run, mat: vis('darkWood'), nosing: vis('darkWood'), lead: 0.9, leadTop: 0.9 });
  for (const B of PL.buildings) for (const r of B.rects) b.box(r.x0 - 0.05, B.top, r.z0 - 0.05, r.x1 + 0.05, B.top + 0.25, r.z1 + 0.05, vis('ceilingWood'), { material: 'wood', penetrable: true, radar: false });
  for (const c of PL.canopies) b.box(c.x0, c.h, c.z0, c.x1, c.h + 0.25, c.z1, vis('ceilingWood'), { material: 'wood', penetrable: true, radar: false });
  for (const e of PL.eaves) b.box(e.x0, e.y - 0.22, e.z0, e.x1, e.y, e.z1, vis('kawara'), { material: 'wood', penetrable: true, radar: false });
  if (!glb && !b.dry) ryokanFallbackRoofs(b, PL);
  ryokanProps(b, PL, glb); ryokanAtmosphere(b, PL);
  if (!b.dry) { // warm lantern light in the objective hall (one of the 3 per-pixel lights) + soft light pools on the tatami
    const [ox, oz] = PL.objective, F2 = RYOKAN_SPEC.F2;
    b.light(ox, F2 + 1.5, oz, 0xffc27a, 26, 13); b.lightPool(ox, oz, 5.5, F2 + 0.02, 0.07, 0xffc890);
  }
  const sp = PL.spawns; b.spawnZone('alpha', sp.alpha.x0, sp.alpha.z0, sp.alpha.x1, sp.alpha.z1, 0); b.spawnZone('bravo', sp.bravo.x0, sp.bravo.z0, sp.bravo.x1, sp.bravo.z1, Math.PI);
  for (const r of PL.ground) if ((r.x1 - r.x0) * (r.z1 - r.z0) > 30) b.waypoint((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0);
  if (glb) { // Blender visuals: swap the placeholder 'ry:<name>' materials for the game's procedural PBR presets
    const sc = glb.scene;
    sc.traverse((o) => {
      if (!o.isMesh) return;
      const nm = (o.material && o.material.name) || '', key = 'ry_' + nm.replace(/^ry:/, '');
      const sp = ryokanSpecialMat(b, nm.replace(/^ry:/, ''));
      if (sp) { o.material = sp; if (sp.transparent) { o.renderOrder = 2; o.userData.noAO = true; } } else if (MAT_PRESETS[key]) o.material = b.lib.get(key);
      o.castShadow = !/nocast|petal|water|glass|tileEnds/i.test(o.name); o.receiveShadow = !/far_nocast/.test(o.name); o.matrixAutoUpdate = false; o.updateMatrix();
    });
    sc.updateMatrixWorld(true); b.scene.add(sc);
  }
}

// gameplay props: collision + (fallback) visuals. With the GLB they only add colliders — the GLB has the models.
function ryokanProps(b, PL, glb) {
  const vis = (m) => (glb ? null : m), solid = !glb && !b.dry;
  const post = (x, z, r, y0, y1, mat, o = {}) => (solid ? b.cyl(x, z, r, y0, y1, mat, Object.assign({ seg: 14 }, o)) : b.box(x - r * 0.88, y0, z - r * 0.88, x + r * 0.88, y1, z + r * 0.88, null, { material: o.material || 'wood', penetrable: o.penetrable, radar: o.radar || 'solid' }));
  const rock = (x, z, r, sy) => (solid ? b.boulder(x, z, r, { sy }) : b.box(x - r * 0.62, 0, z - r * 0.62, x + r * 0.62, r * sy * 1.25, z + r * 0.62, null, { material: 'concrete', radar: 'solid' }));
  for (const p of PL.props) {
    const { x, z } = p;
    switch (p.kind) {
      case 'belfry': { // 鐘樓: stone plinth, four posts, roof — shoot-through only between the posts
        b.box(x - 1.8, 0, z - 1.65, x + 1.8, 0.9, z + 1.65, vis('stoneBlock'), { radar: 'solid', material: 'concrete' });
        for (const [dx, dz] of [[-1.35, -1.2], [1.35, -1.2], [-1.35, 1.2], [1.35, 1.2]]) b.box(x + dx - 0.14, 0.9, z + dz - 0.14, x + dx + 0.14, 4.6, z + dz + 0.14, vis('darkWood'), { material: 'wood', radar: false });
        b.box(x - 2.4, 4.6, z - 2.2, x + 2.4, 5.0, z + 2.2, vis('kawara'), { material: 'wood', radar: false });
        if (solid) { b.cyl(x, z, 0.55, 2.9, 4.3, 'bronze', { seg: 16, collide: false }); ryokanRoof(b, x - 2.6, z - 2.4, x + 2.6, z + 2.4, 5.0, 1.6, 'kawara', 0.3); }
        break;
      }
      case 'well': post(x, z, 0.85, 0, 0.95, 'stoneBlock', { seg: 18, radar: 'crate', material: 'concrete' }); break;
      case 'rock': rock(x, z, p.a || 1.4, 0.75); break;
      case 'basin': rock(x, z, p.a || 1.2, 0.6); break;
      case 'lantern': b.box(x - 0.45, 0, z - 0.45, x + 0.45, 2.0, z + 0.45, vis('stoneBlock'), { radar: 'crate', material: 'concrete' }); break;
      case 'tank': b.box(x - 1.1, 0, z - 1.1, x + 1.1, 1.3, z + 1.1, vis('darkWood'), { radar: 'crate', material: 'wood', penetrable: true }); break;
      case 'barrels': for (const [dx, dz] of [[0, 0], [1.0, 0.4]]) post(x + dx, z + dz, 0.48, 0, 1.25, 'darkWood', { radar: 'crate', material: 'wood', penetrable: true }); break;
      case 'crates': b.box(x - 0.65, 0, z - 0.65, x + 0.65, 1.3, z + 0.65, vis('wood'), { radar: 'crate', material: 'wood', penetrable: true }); b.box(x + 0.55, 0, z + 0.15, x + 1.45, 0.9, z + 1.05, vis('wood'), { radar: 'crate', material: 'wood', penetrable: true }); break;
      case 'cart': b.box(x - 1.0, 0, z - 2.4, x + 1.0, 1.25, z + 2.4, vis('darkWood'), { radar: 'crate', material: 'wood', penetrable: true }); break;
      case 'torii': for (const dx of [-2.6, 2.6]) post(x + dx, z, 0.3, 0, 5.2, 'toriiRed', { seg: 16, radar: 'solid', material: 'wood' });
        if (solid) { b.deco(x - 3.9, 5.0, z - 0.35, x + 3.9, 5.5, z + 0.35, 'kawara'); b.deco(x - 3.3, 4.2, z - 0.2, x + 3.3, 4.5, z + 0.2, 'toriiRed'); }
        break;
      case 'gate': b.box(x - 6, 0, z - 0.5, x + 6, 4.5, z + 0.3, vis('darkWood'), { material: 'concrete', radar: false }); break;
      case 'onsen': { // rock-rimmed hot spring (knee-deep): rim stones block bullets, the water is walkable
        const rx = 2.7, rz = 3.6;
        for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; if (a === 9) continue; rock(x + Math.cos(t) * rx, z + Math.sin(t) * rz, 0.65 + ((a * 37) % 5) * 0.08, 0.7); }
        if (solid) { const wm = b.lib.basic('onsenWater', () => new THREE.MeshPhysicalMaterial({ color: 0x6f9a95, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82 }));
          const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2); g.scale(rx * 0.95, 1, rz * 0.95); g.translate(x, 0.32, z); const m = new THREE.Mesh(g, wm); m.userData.noAO = true; b.scene.add(m); }
        break;
      }
      case 'sakura': b.box(x - 0.3, 0, z - 0.3, x + 0.3, 3.4, z + 0.3, null, { material: 'wood', radar: 'crate' }); if (solid) ryokanSakura(b, x, z); break;
      case 'pine': b.box(x - 0.25, 0, z - 0.25, x + 0.25, 3.0, z + 0.25, null, { material: 'wood', radar: 'crate' }); if (solid) b.tree(x, z, 'pine', 6.5, 0); break;
      case 'streetlamp': b.box(x - 0.12, 0, z - 0.12, x + 0.12, 3.6, z + 0.12, vis('darkSteel'), { material: 'metal', radar: false }); break;
      case 'vending': b.box(x - 0.5, 0, z - 0.45, x + 0.5, 1.85, z + 0.45, vis('vending'), { radar: 'crate', material: 'metal' }); break;
      case 'table': b.box(x - 1.0, RYOKAN_SPEC.F2, z - 0.55, x + 1.0, RYOKAN_SPEC.F2 + 0.36, z + 0.55, vis('darkWood'), { material: 'wood', penetrable: true, radar: false }); break;
    }
  }
}

// Atmosphere: sakura petals drifting around the camera (thicker under the trees) and steam over the onsen.
function ryokanAtmosphere(b, PL) {
  if (b.dry || activeQuality() === 'low') return;
  const trees = PL.props.filter((p) => p.kind === 'sakura'), N = activeQuality() === 'medium' ? 380 : 700, R = 22;
  const geo = new THREE.PlaneGeometry(0.055, 0.04); geo.translate(0, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf7c9d4, emissive: 0xf2a9bb, emissiveIntensity: 0.18, roughness: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.noAO = true; b.scene.add(mesh);
  const P = new Float32Array(N * 3), V = new Float32Array(N * 4), Q = new THREE.Quaternion(), E = new THREE.Euler(), M4 = new THREE.Matrix4(), S1 = new THREE.Vector3(1, 1, 1), T = new THREE.Vector3();
  const spawn = (i, cam, top) => {
    let x, z, y;
    if (trees.length && Math.random() < 0.6) { const t = trees[(Math.random() * trees.length) | 0]; x = t.x + (Math.random() - 0.5) * 7; z = t.z + (Math.random() - 0.5) * 7; y = top ? 3.5 + Math.random() * 3.5 : Math.random() * 7; }
    else { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * R; x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; y = top ? 6 + Math.random() * 4 : Math.random() * 10; }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; V[i * 4] = 0.45 + Math.random() * 0.55; V[i * 4 + 1] = Math.random() * 6.28; V[i * 4 + 2] = 1.5 + Math.random() * 2.5; V[i * 4 + 3] = Math.random() * 6.28;
  };
  let init = false;
  b.animated.push((dt, t) => {
    const cam = b.game.camera.position;
    if (!init) { for (let i = 0; i < N; i++) spawn(i, cam, false); init = true; }
    for (let i = 0; i < N; i++) {
      const k = i * 3, s = V[i * 4], ph = V[i * 4 + 1], fl = V[i * 4 + 2];
      P[k + 1] -= s * dt; P[k] += (Math.sin(t * 0.9 + ph) * 0.35 + 0.25) * dt; P[k + 2] += Math.cos(t * 0.7 + ph * 1.3) * 0.3 * dt; // gentle wind toward +x
      const dx = P[k] - cam.x, dz = P[k + 2] - cam.z;
      if (P[k + 1] < 0.02 || dx * dx + dz * dz > R * R * 1.4) spawn(i, cam, true);
      E.set(t * fl + ph, t * fl * 0.7 + V[i * 4 + 3], Math.sin(t * 2 + ph)); Q.setFromEuler(E); T.set(P[k], P[k + 1], P[k + 2]);
      mesh.setMatrixAt(i, M4.compose(T, Q, S1));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  // onsen steam: soft sprites rising and fading over the water
  const onsen = PL.props.find((p) => p.kind === 'onsen');
  if (onsen) {
    const tex = b.tf.smoke(), sprites = [];
    for (let i = 0; i < 14; i++) {
      const sm = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }); const s = new THREE.Sprite(sm);
      s.userData = { t: Math.random() * 6, x: onsen.x + (Math.random() - 0.5) * 4, z: onsen.z + (Math.random() - 0.5) * 6, noAO: true }; b.scene.add(s); sprites.push(s);
    }
    b.animated.push((dt) => {
      for (const s of sprites) {
        const u = s.userData; u.t += dt; const life = 6, f = (u.t % life) / life;
        if (u.t % life < dt) { u.x = onsen.x + (Math.random() - 0.5) * 4; u.z = onsen.z + (Math.random() - 0.5) * 6; }
        s.position.set(u.x + f * 0.8, 0.45 + f * 2.6, u.z); const sc = 1.2 + f * 2.6; s.scale.set(sc, sc, 1); s.material.opacity = 0.16 * Math.sin(f * Math.PI);
      }
    });
  }
}

// GLB materials that are not plain PBR presets: alpha blossom cards, water, glowing paper, printed cloth, the vending front
function ryokanSpecialMat(b, name) {
  const tf = b.tf, lib = b.lib;
  switch (name) {
    case 'sakura': return lib.basic('ry:sakura', () => {
      const map = tf.simple('rySakuraCards', 512, (ctx, S) => { // 2 × 2 atlas of blossom clusters on transparency
        ctx.clearRect(0, 0, S, S); const rnd = mulberry32(4402);
        for (let q = 0; q < 4; q++) {
          const ox = (q % 2) * S / 2, oy = Math.floor(q / 2) * S / 2, c = S / 4;
          for (let i = 0; i < 150; i++) {
            const a = rnd() * 6.283, d = Math.sqrt(rnd()) * c * 0.86, x = ox + c + Math.cos(a) * d, y = oy + c + Math.sin(a) * d, r = S * (0.011 + rnd() * 0.012);
            const pk = rnd(), col = pk < 0.18 ? '#fbeef2' : pk < 0.7 ? '#f6c9d4' : '#eaa6b8';
            for (let p = 0; p < 5; p++) { const pa = p * 1.2566 + rnd(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + Math.cos(pa) * r * 0.8, y + Math.sin(pa) * r * 0.8, r * 0.75, r * 0.5, pa, 0, 7); ctx.fill(); }
            ctx.fillStyle = rnd() < 0.5 ? '#c4506a' : '#e7b44a'; ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, 7); ctx.fill();
          }
          for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * c * 0.8; ctx.strokeStyle = 'rgba(70,45,40,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox + c + Math.cos(a) * d, oy + c + Math.sin(a) * d); ctx.lineTo(ox + c + Math.cos(a) * d * 0.6, oy + c + Math.sin(a) * d * 0.6); ctx.stroke(); }
        }
      }, true, true); // repeat: the GLB V is negated (glTF flip) — clamping would sample the transparent edge
      const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, roughness: 0.85, metalness: 0, emissive: 0xf2b8c6, emissiveIntensity: 0.12, side: THREE.FrontSide });
      return m;
    });
    case 'nobori': return lib.basic('ry:nobori', () => { // red banner with a vertical line of white kanji
      const map = tf.simple('ryNobori', 256, (ctx, S) => {
        ctx.fillStyle = '#b8261c'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, S * 0.08, S);
        ctx.font = `bold ${S * 0.2}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ['櫻', '花', '祭', '湯'].forEach((t, i) => ctx.fillText(t, S * 0.55, S * (0.13 + i * 0.24)));
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide });
    });
    case 'tileEnds': return lib.basic('ry:tileEnds', () => { // round eave-tile ends (one disc per 0.28 m of the strip)
      const map = tf.simple('ryTileEnds', 128, (ctx, S) => {
        ctx.clearRect(0, 0, S, S); const g = ctx.createRadialGradient(S * 0.45, S * 0.42, S * 0.05, S / 2, S / 2, S * 0.46);
        g.addColorStop(0, '#6a6a6a'); g.addColorStop(0.75, '#3c3b3a'); g.addColorStop(1, '#232222'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.46, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,20,.8)'; ctx.lineWidth = S * 0.04; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.3, 0, 7); ctx.stroke();
        for (let k = 0; k < 3; k++) { const a = k * 2.094; ctx.fillStyle = 'rgba(25,25,25,.7)'; ctx.beginPath(); ctx.arc(S / 2 + Math.cos(a) * S * 0.12, S / 2 + Math.sin(a) * S * 0.12, S * 0.07, 0, 7); ctx.fill(); }
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
    });
    case 'water': return lib.basic('ry:water', () => new THREE.MeshPhysicalMaterial({ color: 0x5f8f8a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.8, envMapIntensity: 1.4, depthWrite: false }));
    case 'paper': case 'paperRed': return lib.basic('ry:' + name, () => {
      const red = name === 'paperRed', map = tf.simple('ryLantern' + (red ? 'R' : 'W'), 256, (ctx, S) => {
        ctx.fillStyle = red ? '#c8352a' : '#f2e7cf'; ctx.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += S / 12) { ctx.fillStyle = 'rgba(60,30,10,.25)'; ctx.fillRect(0, y, S, 2); }
        ctx.fillStyle = red ? '#1d1410' : '#9d2a20'; ctx.font = `bold ${S * 0.42}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const x of [S * 0.25, S * 0.75]) ctx.fillText(red ? '祭' : '湯', x, S / 2);
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.9, emissive: red ? 0xff5a3a : 0xffd9a0, emissiveMap: map, emissiveIntensity: 0.35 });
    });
    case 'noren': return lib.basic('ry:noren', () => {
      const map = tf.simple('ryNoren', 512, (ctx, S) => {
        ctx.fillStyle = '#1f2d47'; ctx.fillRect(0, 0, S, S); const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(255,255,255,.05)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#f1ece0'; ctx.font = `bold ${S * 0.36}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ['ゆ', 'や', 'ど', '♨'].forEach((t, i) => ctx.fillText(t, S * (0.125 + i * 0.25), S * 0.5));
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide });
    });
    case 'blueprint': return lib.basic('ry:blueprint', () => { // the Tor-M2 drawings on the table
      const map = tf.simple('ryBlueprint', 512, (ctx, S) => {
        ctx.fillStyle = '#1d3b6e'; ctx.fillRect(0, 0, S, S); ctx.strokeStyle = 'rgba(200,220,255,.18)'; ctx.lineWidth = 1;
        for (let i = 0; i <= S; i += S / 24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke(); }
        ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 3; ctx.strokeRect(S * 0.12, S * 0.5, S * 0.76, S * 0.16);                   // hull
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(S * (0.2 + k * 0.12), S * 0.7, S * 0.045, 0, 7); ctx.stroke(); }  // road wheels
        ctx.strokeRect(S * 0.3, S * 0.3, S * 0.4, S * 0.2); ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.3); ctx.lineTo(S * 0.5, S * 0.14); ctx.stroke(); // turret + mast
        ctx.strokeRect(S * 0.36, S * 0.08, S * 0.28, S * 0.06);                                                                     // radar
        ctx.font = `bold ${S * 0.06}px monospace`; ctx.fillStyle = '#e8f0ff'; ctx.fillText('9K331 TOR-M2', S * 0.12, S * 0.86); ctx.font = `${S * 0.03}px monospace`; ctx.fillText('СЕКРЕТНО · 1:25', S * 0.12, S * 0.92);
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.85, emissive: 0x3060a0, emissiveIntensity: 0.15 });
    });
    case 'papers': return lib.basic('ry:papers', () => {
      const map = tf.simple('ryPapers', 128, (ctx, S) => { ctx.fillStyle = '#efeadc'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = 'rgba(30,30,40,.55)'; for (let y = 14; y < S - 10; y += 9) ctx.fillRect(10, y, S * (0.4 + Math.random() * 0.45), 2); }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide });
    });
    case 'kakejiku': return lib.basic('ry:kakejiku', () => {
      const map = tf.simple('ryKakejiku', 256, (ctx, S) => {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#e8dfc8'; ctx.fillRect(S * 0.12, S * 0.14, S * 0.76, S * 0.72);
        ctx.fillStyle = 'rgba(40,40,40,.6)'; ctx.beginPath(); ctx.moveTo(S * 0.12, S * 0.7); for (let x = 0.12; x <= 0.88; x += 0.04) ctx.lineTo(S * x, S * (0.55 + 0.1 * Math.sin(x * 11))); ctx.lineTo(S * 0.88, S * 0.86); ctx.lineTo(S * 0.12, S * 0.86); ctx.fill();
        ctx.fillStyle = '#b8352a'; ctx.fillRect(S * 0.7, S * 0.2, S * 0.08, S * 0.08); ctx.fillStyle = '#222'; ctx.font = `${S * 0.12}px serif`; ctx.fillText('櫻', S * 0.4, S * 0.35);
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
    });
    case 'lampPaper': return lib.basic('ry:lampPaper', () => new THREE.MeshStandardMaterial({ color: 0xf6e7c6, roughness: 0.9, emissive: 0xffc77a, emissiveIntensity: 0.9 }));
    case 'sign': return lib.basic('ry:sign', () => { // red plaques on the inn facades (one kanji per board)
      const map = tf.simple('rySigns', 256, (ctx, S) => {
        const words = ['湯', '宿', '櫻', '茶', '酒', '福', '旅', '館']; ctx.fillStyle = '#b3291f'; ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#f4ead2'; ctx.font = `bold ${S * 0.18}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillText(words[i * 2 + j], S * (0.125 + i * 0.25), S * (0.25 + j * 0.5));
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissive: 0x401008, emissiveIntensity: 0.2 });
    });
    case 'vend': return lib.basic('ry:vend', () => {
      const map = tf.simple('ryVend', 256, (ctx, S) => {
        ctx.fillStyle = '#e8ecef'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#1c2a3a'; ctx.fillRect(S * 0.08, S * 0.06, S * 0.84, S * 0.5);
        const cols = ['#d2332a', '#2a6fd2', '#2fae4a', '#e8b21c', '#f1f1f1', '#8a4bd2'];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = S * (0.12 + c * 0.135), y = S * (0.1 + r * 0.155); ctx.fillStyle = cols[(r * 2 + c) % cols.length]; ctx.fillRect(x, y, S * 0.09, S * 0.12); ctx.fillStyle = '#ff4030'; ctx.fillRect(x + S * 0.02, y + S * 0.13, S * 0.05, S * 0.012); }
        ctx.fillStyle = '#20252a'; ctx.fillRect(S * 0.15, S * 0.82, S * 0.7, S * 0.1);
      }, true, true);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.4, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.25 });
    });
  }
  return null;
}

// fallback roof: a hipped / gabled prism with eaves (until the Blender GLB replaces it)
function ryokanRoof(b, x0, z0, x1, z1, y, h, mat, eave = 0.9) {
  x0 -= eave; z0 -= eave; x1 += eave; z1 += eave;
  const alongX = x1 - x0 >= z1 - z0, half = (alongX ? z1 - z0 : x1 - x0) / 2, inset = Math.min(half, (alongX ? x1 - x0 : z1 - z0) / 2) * 0.55;
  const r0 = alongX ? [x0 + inset, (z0 + z1) / 2] : [(x0 + x1) / 2, z0 + inset], r1 = alongX ? [x1 - inset, (z0 + z1) / 2] : [(x0 + x1) / 2, z1 - inset];
  const P = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [r0[0], y + h, r0[1]], [r1[0], y + h, r1[1]]];
  const F = alongX ? [[0, 4, 5], [0, 5, 1], [2, 5, 4], [2, 4, 3], [3, 4, 0], [1, 5, 2]] : [[1, 5, 4], [1, 4, 0], [3, 4, 5], [3, 5, 2], [0, 4, 3], [2, 5, 1]];
  const pos = []; for (const f of F) for (const k of f) pos.push(...P[k]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 2.2 + pos[i + 2] / 2.2 * 0.3, pos[i + 1] / 1.2 + pos[i + 2] / 2.2 * 0.7); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); b.geo(g, mat);
}
function ryokanFallbackRoofs(b, PL) {
  for (const B of PL.buildings) for (const r of B.rects) if ((r.x1 - r.x0) > 1.5 && (r.z1 - r.z0) > 1.5) ryokanRoof(b, r.x0, r.z0, r.x1, r.z1, B.top + 0.25, Math.min(3.2, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.32), 'kawara');
  for (const c of PL.canopies) ryokanRoof(b, c.x0, c.z0, c.x1, c.z1, c.h + 0.25, Math.min(2.6, Math.min(c.x1 - c.x0, c.z1 - c.z0) * 0.3), 'kawara', 0.6);
  for (const e of PL.eaves) b.deco(e.x0, e.y - 0.22, e.z0, e.x1, e.y - 0.02, e.z1, 'kawara');
}
function ryokanSakura(b, x, z) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.32, 3.6, 9); trunk.translate(x, 1.8, z); b.geo(trunk, 'bark');
  const rnd = mulberry32(Math.round(x * 91 + z * 57));
  for (let i = 0; i < 11; i++) { const a = rnd() * 6.28, d = i ? 1.2 + rnd() * 1.6 : 0, r = i ? 1.0 + rnd() * 0.8 : 1.7;
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position; for (let k = 0; k < p.count; k++) { const s = 0.82 + rnd() * 0.3; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.72, p.getZ(k) * s); }
    g.translate(x + Math.cos(a) * d, 4.2 + rnd() * 1.4, z + Math.sin(a) * d); g.computeVertexNormals(); b.geo(g, 'sakuraBloom'); }
}

const RYOKAN_HAS_GLB = true; // flipped by tools/ryokan/pack_glb.mjs once assets/maps/ryokan.js exists
const RYOKAN_PLAN_BOUNDS = (() => { const P = ryokanPlan(); return P.bounds; })();
MAPS.push({
  // v44 SAKURA INN — SF2 'Ryokan' (료칸, 2012): a Hokkaido hot-spring inn village that is really a safehouse holding the
  // Tor-M2 blueprints (the scroll on the 2F tatami table). Seizure map: attackers come in through the village gate
  // (正門 = escape point) and must carry the scroll back; nearly every wall shoots through. All modes play on it.
  id: 'ryokan', name: '櫻花客棧', en: 'SAKURA INN', desc: '日式溫泉旅館街 · 2F 目標物、天橋、鐘樓、可跳上的屋簷、幾乎全部牆壁可穿射 · 83×95', slogan: 'SAKURA CRISIS · 搶下 2F 卷軸，從正門撤離',
  look: { desat: 0.18, contrast: 1.06, pivot: 0.42, highlights: 1.04 },
  bounds: { minX: Math.floor(RYOKAN_PLAN_BOUNDS.minX), maxX: Math.ceil(RYOKAN_PLAN_BOUNDS.maxX), minZ: Math.floor(RYOKAN_PLAN_BOUNDS.minZ), maxZ: Math.ceil(RYOKAN_PLAN_BOUNDS.maxZ) },
  indoor: false, navLevels: [0, RYOKAN_SPEC.F2], navStep: 2, viewMult: 1.0, radarRange: 30,
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.62, sky: { turbidity: 5, rayleigh: 1.5, elevation: 34, azimuth: 230 },
  sun: { pos: [-35, 50, 30], color: 0xfff1e0, intensity: 2.7, auto: true }, hemi: [0xe6ecf7, 0x8a8078, 0.95], exposure: 0.92,
  fog: { color: 0xc9d2dc, near: 70, far: 330 }, acoustics: 'outdoor', ambience: 'hill', shadowFollow: 0,
  shot: { pos: [-22, 15, 34], target: [4, 2, -6] },
  get objectives() { const P = this._plan || (this._plan = ryokanPlan()); return { dom: P.dom.map(([x, z]) => [x, 0, z]), relic: [P.objective[0], RYOKAN_SPEC.F2, P.objective[1]], domRadius: 4.5 }; },
  // the Blender visuals ship as a JS file (window.RYOKAN_GLB = base64 GLB) so file:// play works like assets/sfx.js
  async preload() {
    if (this._glb !== undefined) return;
    this._glb = null;
    try {
      if (!RYOKAN_HAS_GLB) return;
      if (!window.RYOKAN_GLB) await new Promise((res) => { const s = document.createElement('script'); s.src = 'assets/maps/ryokan.js'; s.async = true; s.onload = res; s.onerror = res; document.head.appendChild(s); });
      if (window.RYOKAN_GLB) {
        const bin = Uint8Array.from(atob(window.RYOKAN_GLB), (c) => c.charCodeAt(0)).buffer, L = new GLTFLoader(), D = new DRACOLoader();
        D.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'); L.setDRACOLoader(D);
        this._glb = await L.parseAsync(bin, ''); D.dispose();
      }
    } catch (e) { console.warn('Ryokan GLB unavailable, using fallback visuals', e && e.message); this._glb = null; }
  },
  build(b) { buildRyokan(b); },
});

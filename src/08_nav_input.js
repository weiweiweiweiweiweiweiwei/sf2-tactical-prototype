/* =====================================================================
   NAV GRAPH — multi-level walkable grid (auto-sampled at every nav
   level), door nodes, stair/ramp chains, largest-component pruning,
   binary-heap A* and string-pulling.
   ===================================================================== */
class NavGraph {
  constructor(col, builder, def) {
    this.col = col; this.nodes = []; this.hash = new Map(); this.cellSize = 3;
    this.bounds = def.bounds;
    this.build(builder, def);
  }

  walkable(x, y, z, tol = 0.25) {
    const B = this.bounds;
    if (x < B.minX + 0.5 || x > B.maxX - 0.5 || z < B.minZ + 0.5 || z > B.maxZ - 0.5) return null;
    const g = this.col.groundBelow(x, y + 0.4, z, 0.12, 0.8, 0.02);
    if (!g || Math.abs(g.y - y) > tol || g.steep) return null;
    if (!this.col.fits(x, g.y + 0.2, z, 0.38, 1.5)) return null; // +0.2: curbs / plinth steps (≤ 0.2 m) are walkable, the motor steps 0.45
    for (const rp of this.col.ramps) {
      if (x + 0.4 <= rp.minX || x - 0.4 >= rp.maxX || z + 0.4 <= rp.minZ || z - 0.4 >= rp.maxZ) continue;
      if (this.col.rampMaxUnder(rp, x, z, 0.4) > g.y + 0.5) return null;
    }
    return g.y;
  }

  // v5 terrain link: every 0.8 m the slope must be walkable and the capsule must fit on the ground.
  terrainLink(a, b) {
    const T = this.col.terrain, dx = b.x - a.x, dz = b.z - a.z, steps = Math.ceil(Math.hypot(dx, dz) / 0.8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = a.x + dx * t, z = a.z + dz * t;
      if (T.slopeAt(x, z) > MAX_SLOPE * 0.95 || !this.col.fits(x, T.heightAt(x, z) + 0.06, z, 0.36, 1.6)) return false;
    }
    return true;
  }
  rel(p) { return p.y - (this.col.terrain ? this.col.terrain.heightAt(p.x, p.z) : 0); }

  segmentWalkable(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), steps = Math.ceil(dist / 0.35);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (this.walkable(a.x + dx * t, lerp(a.y, b.y, t), a.z + dz * t) === null) return false; }
    return true;
  }

  _hk(x, z) { return (Math.floor(x / this.cellSize) + 1000) * 4000 + (Math.floor(z / this.cellSize) + 1000); }
  _add(p) {
    const n = { id: this.nodes.length, p: p.clone(), edges: [], ok: true };
    this.nodes.push(n);
    const k = this._hk(p.x, p.z); let l = this.hash.get(k); if (!l) this.hash.set(k, l = []); l.push(n);
    return n;
  }
  _link(a, b, mult = 1) {
    if (a === b || a.edges.some((e) => e.to === b.id)) return;
    const c = a.p.distanceTo(b.p) * mult; a.edges.push({ to: b.id, cost: c }); b.edges.push({ to: a.id, cost: c });
  }
  near(p, r, fn) {
    const cs = this.cellSize, x0 = Math.floor((p.x - r) / cs), x1 = Math.floor((p.x + r) / cs), z0 = Math.floor((p.z - r) / cs), z1 = Math.floor((p.z + r) / cs);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const l = this.hash.get((ix + 1000) * 4000 + (iz + 1000)); if (l) for (const n of l) fn(n);
    }
  }

  build(builder, def) {
    const B = def.bounds, step = 2, T = this.col.terrain;
    for (const lvl of def.navLevels || []) {
      for (let x = B.minX + 1; x <= B.maxX - 1; x += step) for (let z = B.minZ + 1; z <= B.maxZ - 1; z += step) {
        const y = this.walkable(x, lvl, z); if (y !== null) this._add(new THREE.Vector3(x, y, z));
      }
    }
    if (T) { // v5: sample the heightfield itself (slope-aware), then every storey / roof region of the buildings
      const ts = def.navStep || 2.5;
      for (let x = B.minX + 1; x <= B.maxX - 1; x += ts) for (let z = B.minZ + 1; z <= B.maxZ - 1; z += ts) {
        if (T.slopeAt(x, z) > MAX_SLOPE * 0.92) continue;
        const th = T.heightAt(x, z), y = this.walkable(x, th, z, 0.3);
        if (y !== null) { const n = this._add(new THREE.Vector3(x, y, z)); if (Math.abs(y - th) < 0.05) n.p.terr = true; }
      }
    }
    for (const r of builder.navRegions) for (let x = r.x0; x <= r.x1 + 1e-3; x += r.step) for (let z = r.z0; z <= r.z1 + 1e-3; z += r.step) {
      const y = this.walkable(x, r.y, z); if (y !== null) this._add(new THREE.Vector3(x, y, z));
    }
    for (const p of builder.navExtra) { const y = this.walkable(p.x, p.y, p.z); if (y !== null) this._add(new THREE.Vector3(p.x, y, p.z)); }
    const base = this.nodes.slice();
    for (const a of base) this.near(a.p, 3.6, (b) => {
      if (b.id <= a.id) return;
      const tt = a.p.terr && b.p.terr, d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
      if (d > (tt ? 3.6 : 2.95) || Math.abs(a.p.y - b.p.y) > (tt ? Math.max(0.5, d * 0.95) : 0.5)) return;
      if (tt ? this.terrainLink(a.p, b.p) : this.segmentWalkable(a.p, b.p)) this._link(a, b);
    });
    for (const chain of builder.navChains) {
      const cn = chain.map((p) => this._add(p));
      if (chain.ladder) for (const n of cn) n.p.ladder = true; // bots switch to climb input on these links
      for (let i = 0; i < cn.length - 1; i++) this._link(cn[i], cn[i + 1], chain.cost || 1);
      for (const end of [cn[0], cn[cn.length - 1]]) {
        const cand = [];
        this.near(end.p, 3.4, (n) => { if (!chain.includes(n.p) && cn.indexOf(n) < 0 && Math.abs(n.p.y - end.p.y) < 0.6 && n.p.distanceTo(end.p) < 3.4) cand.push(n); });
        cand.sort((a, b) => a.p.distanceTo(end.p) - b.p.distanceTo(end.p));
        let linked = 0;
        for (const n of cand) { if (linked >= 4) break; if (this.segmentWalkable(end.p, n.p)) { this._link(end, n); linked++; } }
      }
    }
    // keep only the component that contains the Alpha spawn (unreachable roofs/islands are dropped)
    const comp = new Int32Array(this.nodes.length).fill(-1); let best = -1, bestSize = 0, c = 0;
    for (const n of this.nodes) {
      if (comp[n.id] >= 0) continue;
      const stack = [n.id]; comp[n.id] = c; let size = 0;
      while (stack.length) { const id = stack.pop(); size++; for (const e of this.nodes[id].edges) if (comp[e.to] < 0) { comp[e.to] = c; stack.push(e.to); } }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    const z = builder.zones.alpha;
    if (z) {
      const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2; let seed = null, sd = Infinity;
      for (const n of this.nodes) { if (this.rel(n.p) > 1 || !n.edges.length) continue; const d = (n.p.x - cx) ** 2 + (n.p.z - cz) ** 2; if (d < sd) { sd = d; seed = n; } }
      if (seed) best = comp[seed.id];
    }
    for (const n of this.nodes) n.ok = comp[n.id] === best && n.edges.length > 0;
    this.valid = this.nodes.filter((n) => n.ok);
    this.groundNodes = this.valid.filter((n) => this.rel(n.p) < 0.6);
    this.upperNodes = this.valid.filter((n) => this.rel(n.p) > 2.5);
  }

  nearest(p, requireLOS = true) {
    let best = null, bestS = Infinity; const cands = [];
    for (let r = 3; r <= 24 && !cands.length; r *= 2) this.near(p, r, (n) => { if (!n.ok) return; const dx = n.p.x - p.x, dz = n.p.z - p.z, dy = (n.p.y - p.y) * 3; cands.push([dx * dx + dz * dz + dy * dy, n]); });
    if (!cands.length) for (const n of this.valid) { const dx = n.p.x - p.x, dz = n.p.z - p.z, dy = (n.p.y - p.y) * 3; cands.push([dx * dx + dz * dz + dy * dy, n]); }
    for (const [s, n] of cands) if (s < bestS) { bestS = s; best = n; }
    if (!requireLOS) return best;
    cands.sort((a, b) => a[0] - b[0]);
    const eye = new THREE.Vector3(p.x, p.y + 1.0, p.z);
    for (let i = 0; i < Math.min(6, cands.length); i++) { const n = cands[i][1]; if (this.col.segmentClear(eye, new THREE.Vector3(n.p.x, n.p.y + 1.0, n.p.z))) return n; }
    return best;
  }

  // seed ≠ 0 → per-bot deterministic cost noise (1.0–1.8× per node), so different bots prefer different routes.
  findPath(from, to, seed = 0) {
    const s = this.nearest(from), g = this.nearest(to);
    const noise = seed ? (id) => { const x = Math.sin(id * 12.9898 + seed * 78.233) * 43758.5453; return 1 + 0.8 * (x - Math.floor(x)); } : null;
    if (!s || !g) return [];
    const N = this.nodes.length, gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // [f, id]
    const push = (f, id) => { heap.push([f, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    gs[s.id] = 0; push(s.p.distanceTo(g.p), s.id);
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === g.id) break;
      closed[cur] = 1;
      for (const e of this.nodes[cur].edges) {
        if (closed[e.to] || !this.nodes[e.to].ok) continue;
        const ng = gs[cur] + (noise ? e.cost * noise(e.to) : e.cost);
        if (ng < gs[e.to]) { gs[e.to] = ng; came[e.to] = cur; push(ng + this.nodes[e.to].p.distanceTo(g.p), e.to); }
      }
    }
    if (came[g.id] === -1 && g.id !== s.id) return [];
    const path = [];
    for (let c = g.id; c !== -1; c = came[c]) path.push(this.nodes[c].p);
    path.reverse();
    return this._smooth(path);
  }

  _smooth(path) {
    if (path.length < 3) return path.slice();
    const out = [path[0]]; let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 8);
      for (; j > i + 1; j--) {
        let terr = true; for (let k = i; k <= j; k++) if (!path[k].terr) { terr = false; break; }
        if (terr) { if (this.terrainLink(path[i], path[j])) break; continue; }
        let flat = true; for (let k = i; k < j; k++) if (Math.abs(path[k + 1].y - path[k].y) > 0.25) { flat = false; break; }
        if (flat && this.segmentWalkable(path[i], path[j])) break;
      }
      out.push(path[j]); i = j;
    }
    return out;
  }

  // Nearest open node to a designer point (same level preferred, open surroundings preferred).
  snap(p, maxDist = 12) {
    let best = null, bs = Infinity;
    this.near(p, maxDist, (n) => {
      if (!n.ok || Math.abs(n.p.y - p.y) > 1.2) return;
      const d = Math.hypot(n.p.x - p.x, n.p.z - p.z); if (d > maxDist) return;
      let open = 0; this.near(n.p, 2.1, (m) => { if (m.ok && Math.abs(m.p.y - n.p.y) < 0.5) open++; });
      const sc = d + Math.max(0, 7 - open) * 0.6; if (sc < bs) { bs = sc; best = n; }
    });
    return best ? best.p.clone() : p.clone();
  }

  randomNode(upperChance = 0.2, filter = null) {
    let pool = Math.random() < upperChance && this.upperNodes.length ? this.upperNodes : this.groundNodes;
    if (filter) { const f = pool.filter(filter); if (f.length) pool = f; }
    return pool.length ? pick(pool) : null;
  }
}

/* =====================================================================
   INPUT — raw pointer-lock mouse, key edges and immediate callbacks
   (clicks/keys are handled at event time: sub-frame latency).
   ===================================================================== */
class InputManager {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.buttons = [false, false, false]; this.wheel = 0; this.locked = false;
    this.onKey = null; this.onKeyUp = null; this.onButton = null; this.onLockChange = null; this.gameActive = false;
    this.bind();
  }
  bind() {
    const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyR', 'KeyC', 'KeyG', 'KeyE']);
    const fkeys = new Set(['F1', 'F2', 'F3', 'F4', 'F5']); // loadout hotkeys: never let the browser open help / reload
    window.addEventListener('keydown', (e) => {
      if (this.locked && (prevent.has(e.code) || e.ctrlKey || e.altKey)) e.preventDefault();
      if (fkeys.has(e.code) && this.gameActive) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (this.onKeyUp) this.onKeyUp(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = [false, false, false]; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 900 || Math.abs(dy) > 900) return;
      this.mouseDX += dx; this.mouseDY += dy;
    });
    document.addEventListener('mousedown', (e) => { if (!this.locked) return; this.buttons[e.button] = true; if (this.onButton) this.onButton(e.button, true); });
    document.addEventListener('mouseup', (e) => { this.buttons[e.button] = false; if (this.locked && this.onButton) this.onButton(e.button, false); });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.buttons = [false, false, false]; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.onLockChange) this.onLockChange(false, true); });
  }
  lock() {
    const el = this.canvas;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = el.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ignore */ } });
    } catch (e) { try { el.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consumeMouse(out) { out.x = this.mouseDX; out.y = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return out; }
  down(code) { return this.keys.has(code); }
  endFrame() { this.wheel = 0; }
}


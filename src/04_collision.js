/* =====================================================================
   TERRAIN (v5) — regular heightfield for the mountain maps. Every cell
   is split along its (i,j)–(i+1,j+1) diagonal, exactly like the render
   mesh and cannon's Heightfield, so feet, bullets and grenades agree.
   Slopes steeper than MAX_SLOPE (45°) cannot be walked up: you slide.
   ===================================================================== */
const MAX_SLOPE = 1.08; // ≈47°
class Terrain {
  constructor(o) {
    this.x0 = o.minX; this.z0 = o.minZ; this.s = o.step;
    this.nx = Math.round((o.maxX - o.minX) / o.step) + 1; this.nz = Math.round((o.maxZ - o.minZ) / o.step) + 1;
    const N = this.nx * this.nz; this.h = new Float32Array(N); this.wRock = new Float32Array(N); this.wDirt = new Float32Array(N);
    let mx = -Infinity;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const k = i + j * this.nx, r = o.sample(this.x0 + i * this.s, this.z0 + j * this.s);
      this.h[k] = r.h; this.wRock[k] = r.rock || 0; this.wDirt[k] = r.dirt || 0; if (r.h > mx) mx = r.h;
    }
    this.maxH = mx;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) { // steep = rock, whatever the designer said
      const x = this.x0 + i * this.s, z = this.z0 + j * this.s, k = i + j * this.nx, sl = this.slopeAt(x, z);
      this.wRock[k] = Math.max(this.wRock[k], clamp((sl - 0.62) / 0.3, 0, 1)) * (1 - this.wDirt[k] * 0.85);
    }
  }
  inside(x, z) { return x >= this.x0 && z >= this.z0 && x <= this.x0 + (this.nx - 1) * this.s && z <= this.z0 + (this.nz - 1) * this.s; }
  heightAt(x, z) {
    let fx = (x - this.x0) / this.s, fz = (z - this.z0) / this.s;
    const mx = this.nx - 1.0001, mz = this.nz - 1.0001;
    fx = fx < 0 ? 0 : fx > mx ? mx : fx; fz = fz < 0 ? 0 : fz > mz ? mz : fz;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, n = this.nx, k = i + j * n, h = this.h, h00 = h[k], h11 = h[k + n + 1];
    return u > v ? h00 + u * (h[k + 1] - h00) + v * (h11 - h[k + 1]) : h00 + v * (h[k + n] - h00) + u * (h11 - h[k + n]);
  }
  // Smoothed gradient (central differences over one cell) — slope tests do not flicker on triangle seams.
  gradAt(x, z, out = TERRAIN_G) { const e = this.s * 0.5; out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e); out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e); return out; }
  slopeAt(x, z) { const g = this.gradAt(x, z); return Math.hypot(g.x, g.z); }
  normalAt(x, z, out = new THREE.Vector3()) { const g = this.gradAt(x, z); return out.set(-g.x, 1, -g.z).normalize(); }
  _w(arr, x, z) {
    const fx = clamp((x - this.x0) / this.s, 0, this.nx - 1.0001), fz = clamp((z - this.z0) / this.s, 0, this.nz - 1.0001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = i + j * this.nx;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + this.nx] * (1 - u) + arr[k + this.nx + 1] * u) * v;
  }
  // footstep / impact surface: road dirt, rock, or grass
  surfaceAt(x, z) { return this._w(this.wDirt, x, z) > 0.5 ? 'sand' : this._w(this.wRock, x, z) > 0.5 ? 'concrete' : 'grass'; }
  // Ray march (0.9 m steps, 7-step bisection). Returns the hit distance or -1.
  raycast(o, d, maxDist) {
    if (o.y > this.maxH && d.y >= 0) return -1;
    const st = Math.min(0.9, this.s * 0.45);
    let t0 = 0;
    if (o.y < this.heightAt(o.x, o.z) - 0.02) return 0;
    for (let t = st; ; t += st) {
      const tt = t > maxDist ? maxDist : t, y = o.y + d.y * tt;
      if (y > this.maxH && d.y >= 0) return -1;
      if (y < this.heightAt(o.x + d.x * tt, o.z + d.z * tt)) {
        let a = t0, b = tt;
        for (let k = 0; k < 7; k++) { const m = (a + b) * 0.5; if (o.y + d.y * m < this.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        return a;
      }
      if (tt >= maxDist) return -1;
      t0 = tt;
    }
  }
}
const TERRAIN_G = { x: 0, z: 0 };

/* =====================================================================
   COLLISION WORLD — static AABBs (uniform-grid broadphase) + ramp
   wedges + ladder volumes. Hitscan walks the grid with a 2D DDA so
   long rays on big maps only test the boxes in the cells they cross.
   ===================================================================== */
class CollisionWorld {
  constructor() {
    this.boxes = []; this.ramps = []; this.ladders = []; this.terrain = null;
    this.cell = 4; this.grid = new Map(); this.stamp = 1;
    this._qf = []; this._qg = [];
  }

  _key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }

  addBox(min, max, o = {}) {
    const b = {
      kind: 'box', min: min.clone(), max: max.clone(), _s: 0,
      material: o.material || 'concrete', surface: o.surface || o.material || 'concrete',
      blocksMove: o.blocksMove !== false, blocksShot: o.blocksShot !== false, penetrable: !!o.penetrable,
    };
    this.boxes.push(b);
    const c = this.cell;
    for (let ix = Math.floor(b.min.x / c); ix <= Math.floor(b.max.x / c); ix++)
      for (let iz = Math.floor(b.min.z / c); iz <= Math.floor(b.max.z / c); iz++) {
        const k = this._key(ix, iz);
        let l = this.grid.get(k); if (!l) this.grid.set(k, l = []);
        l.push(b);
      }
    return b;
  }

  // v46 map mechanisms (Sky City trams / drawbridge): a box can be moved (re-indexed in the grid) or switched off
  _cells(b, fn) { const c = this.cell; for (let ix = Math.floor(b.min.x / c); ix <= Math.floor(b.max.x / c); ix++) for (let iz = Math.floor(b.min.z / c); iz <= Math.floor(b.max.z / c); iz++) fn(this._key(ix, iz)); }
  moveBox(b, dx, dy, dz) {
    this._cells(b, (k) => { const l = this.grid.get(k); if (l) { const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); } });
    b.min.x += dx; b.min.y += dy; b.min.z += dz; b.max.x += dx; b.max.y += dy; b.max.z += dz;
    this._cells(b, (k) => { let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(b); });
  }
  setSolid(b, move, shot = move) { b.blocksMove = move; b.blocksShot = shot; }

  query(minX, minZ, maxX, maxZ, out) {
    const c = this.cell, s = ++this.stamp;
    out.length = 0;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const l = this.grid.get(this._key(ix, iz));
        if (l) for (const b of l) if (b._s !== s) { b._s = s; out.push(b); }
      }
    return out;
  }

  addRamp(r) {
    const ramp = Object.assign({ kind: 'ramp', material: 'metal', surface: 'metal', blocksShot: true, penetrable: false }, r);
    const isX = r.axis === 'x', L = isX ? r.maxX - r.minX : r.maxZ - r.minZ, k = (r.y1 - r.y0) / L;
    const low = r.dir > 0 ? (isX ? r.minX : r.minZ) : (isX ? r.maxX : r.maxZ), len = Math.hypot(1, k);
    const n = isX ? new THREE.Vector3(-r.dir * k, 1, 0) : new THREE.Vector3(0, 1, -r.dir * k);
    ramp.planes = [
      { n: new THREE.Vector3(0, -1, 0), d: -r.y0 },
      { n: new THREE.Vector3(-1, 0, 0), d: -r.minX }, { n: new THREE.Vector3(1, 0, 0), d: r.maxX },
      { n: new THREE.Vector3(0, 0, -1), d: -r.minZ }, { n: new THREE.Vector3(0, 0, 1), d: r.maxZ },
      { n: n.divideScalar(len), d: (r.y0 - r.dir * k * low) / len },
    ];
    ramp.min = new THREE.Vector3(r.minX, r.y0, r.minZ); ramp.max = new THREE.Vector3(r.maxX, r.y1, r.maxZ);
    this.ramps.push(ramp);
    return ramp;
  }

  // Ladder volume: AABB in front of a wall face. n = outward normal (from wall to climber), top = platform height.
  addLadder(l) { this.ladders.push(l); return l; }
  ladderAt(x, y, z, r) {
    for (const l of this.ladders) if (x + r > l.minX && x - r < l.maxX && z + r > l.minZ && z - r < l.maxZ && y < l.y1 && y + 1.2 > l.y0) return l;
    return null;
  }

  rampHeight(r, x, z) {
    let t = r.axis === 'x' ? (x - r.minX) / (r.maxX - r.minX) : (z - r.minZ) / (r.maxZ - r.minZ);
    if (r.dir < 0) t = 1 - t;
    return r.y0 + (r.y1 - r.y0) * clamp(t, 0, 1);
  }
  rampMaxUnder(r, x, z, rad) {
    if (r.axis === 'x') return this.rampHeight(r, r.dir > 0 ? Math.min(x + rad, r.maxX) : Math.max(x - rad, r.minX), z);
    return this.rampHeight(r, x, r.dir > 0 ? Math.min(z + rad, r.maxZ) : Math.max(z - rad, r.minZ));
  }

  static overlap(b, x, y, z, r, h) {
    return x - r < b.max.x && x + r > b.min.x && z - r < b.max.z && z + r > b.min.z && y < b.max.y && y + h > b.min.y;
  }

  setTerrain(T) { this.terrain = T; }
  _terrainHit(o, d, t) {
    const T = this.terrain, point = o.clone().addScaledVector(d, t), surf = T.surfaceAt(point.x, point.z);
    return { t, point, normal: T.normalAt(point.x, point.z), collider: T, material: surf, penetrable: false };
  }

  fits(x, y, z, r, h) {
    if (this.terrain && y < this.terrain.heightAt(x, z) - 0.2) return false;
    for (const b of this.query(x - r, z - r, x + r, z + r, this._qf)) if (b.blocksMove && CollisionWorld.overlap(b, x, y, z, r, h)) return false;
    return true;
  }

  groundBelow(x, y, z, r, maxDown, up = 0.02) {
    let best = -Infinity, surf = 'concrete';
    for (const b of this.query(x - r, z - r, x + r, z + r, this._qg)) {
      if (!b.blocksMove) continue;
      if (x - r >= b.max.x || x + r <= b.min.x || z - r >= b.max.z || z + r <= b.min.z) continue;
      const top = b.max.y;
      if (top <= y + up && top >= y - maxDown && top > best) { best = top; surf = b.surface; }
    }
    for (const rp of this.ramps) { // v23: support while the footprint overlaps the ramp (like box ledges), not only the centre
      if (x + r <= rp.minX || x - r >= rp.maxX || z + r <= rp.minZ || z - r >= rp.maxZ) continue;
      const s = this.rampHeight(rp, clamp(x, rp.minX, rp.maxX), clamp(z, rp.minZ, rp.maxZ));
      if (s <= y + Math.max(up, 0.06) && s >= y - maxDown && s > best) { best = s; surf = rp.surface; }
    }
    const T = this.terrain;
    if (T) {
      const th = T.heightAt(x, z);
      if (th <= y + Math.max(up, 0.06) && th >= y - maxDown && th > best) return { y: th, surface: T.surfaceAt(x, z), terrain: true, steep: T.slopeAt(x, z) > MAX_SLOPE };
    }
    return best === -Infinity ? null : { y: best, surface: surf };
  }

  static rayBox(o, d, b, maxDist) {
    let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z', od = d[k], oo = o[k];
      if (Math.abs(od) < 1e-12) { if (oo < b.min[k] || oo > b.max[k]) return null; }
      else {
        let t1 = (b.min[k] - oo) / od, t2 = (b.max[k] - oo) / od, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; ax = a; sg = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    if (tmin < 0 || tmin > maxDist || ax < 0) return null;
    return { t: tmin, axis: ax, sign: sg };
  }

  static rayConvex(o, d, planes, maxDist) {
    let tEnter = -Infinity, tExit = maxDist, nEnter = null;
    for (const p of planes) {
      const denom = p.n.x * d.x + p.n.y * d.y + p.n.z * d.z, dist = p.d - (p.n.x * o.x + p.n.y * o.y + p.n.z * o.z);
      if (Math.abs(denom) < 1e-12) { if (dist < 0) return null; continue; }
      const t = dist / denom;
      if (denom < 0) { if (t > tEnter) { tEnter = t; nEnter = p.n; } } else if (t < tExit) tExit = t;
      if (tEnter > tExit) return null;
    }
    if (tEnter < 0 || !nEnter) return null;
    return { t: tEnter, normal: nEnter };
  }

  _hitFromBox(o, d, b, h) {
    const normal = new THREE.Vector3(); normal.setComponent(h.axis, h.sign);
    return { t: h.t, point: o.clone().addScaledVector(d, h.t), normal, collider: b, material: b.material, penetrable: b.penetrable };
  }

  // 2D DDA over the xz grid; visit(list, tExit) returns true to stop.
  _walk(o, d, maxDist, visit) {
    const c = this.cell, ax = Math.abs(d.x), az = Math.abs(d.z);
    let ix = Math.floor(o.x / c), iz = Math.floor(o.z / c);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = ax > 1e-9 ? c / ax : Infinity, tdz = az > 1e-9 ? c / az : Infinity;
    let tmx = ax > 1e-9 ? (sx > 0 ? (ix + 1) * c - o.x : o.x - ix * c) / ax : Infinity;
    let tmz = az > 1e-9 ? (sz > 0 ? (iz + 1) * c - o.z : o.z - iz * c) / az : Infinity;
    for (let guard = 0; guard < 2048; guard++) {
      const tExit = Math.min(tmx, tmz, maxDist), l = this.grid.get(this._key(ix, iz));
      if (l && visit(l, tExit)) return;
      if (tExit >= maxDist) return;
      if (tmx < tmz) { tmx += tdx; ix += sx; } else { tmz += tdz; iz += sz; }
    }
  }

  raycastAll(o, d, maxDist) {
    const hits = [], s = ++this.stamp;
    this._walk(o, d, maxDist, (l) => {
      for (const b of l) { if (b._s === s) continue; b._s = s; if (!b.blocksShot) continue; const h = CollisionWorld.rayBox(o, d, b, maxDist); if (h) hits.push(this._hitFromBox(o, d, b, h)); }
      return false;
    });
    for (const r of this.ramps) { const h = CollisionWorld.rayConvex(o, d, r.planes, maxDist); if (h) hits.push({ t: h.t, point: o.clone().addScaledVector(d, h.t), normal: h.normal.clone(), collider: r, material: r.material, penetrable: false }); }
    if (this.terrain) { const tt = this.terrain.raycast(o, d, maxDist); if (tt >= 0) hits.push(this._terrainHit(o, d, tt)); }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  raycast(o, d, maxDist, ignorePenetrable = false) {
    let best = null, bestT = maxDist, terrT = -1;
    if (this.terrain) { terrT = this.terrain.raycast(o, d, maxDist); if (terrT >= 0) bestT = terrT; } // terrain first: shortens the grid walk
    const s = ++this.stamp;
    this._walk(o, d, maxDist, (l, tExit) => {
      for (const b of l) {
        if (b._s === s) continue; b._s = s;
        if (!b.blocksShot || (ignorePenetrable && b.penetrable)) continue;
        const h = CollisionWorld.rayBox(o, d, b, bestT);
        if (h && h.t < bestT) { bestT = h.t; best = [b, h]; }
      }
      return best !== null && bestT <= tExit;
    });
    let rampHit = null;
    for (const r of this.ramps) { const h = CollisionWorld.rayConvex(o, d, r.planes, bestT); if (h && h.t < bestT) { bestT = h.t; rampHit = [r, h]; } }
    if (rampHit) { const [r, h] = rampHit; return { t: h.t, point: o.clone().addScaledVector(d, h.t), normal: h.normal.clone(), collider: r, material: r.material, penetrable: false }; }
    if (best) return this._hitFromBox(o, d, best[0], best[1]);
    return terrT >= 0 ? this._terrainHit(o, d, terrT) : null;
  }

  segmentClear(a, b, ignorePenetrable = false) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return this.raycast(a, d, len - 0.02, ignorePenetrable) === null;
  }
}

/* =====================================================================
   CHARACTER MOTOR — Quake/GoldSrc-style kinematic controller.
   Ground friction + acceleration (instant stops, counter-strafing),
   air-strafe, step-up, ramps, crouch-jump and SHIFT edge-guard.
   ===================================================================== */
class CharacterMotor {
  constructor(world, o = {}) {
    this.world = world;
    this.radius = o.radius ?? CFG.player.radius;
    this.standHeight = o.height ?? CFG.player.height;
    this.crouchHeight = o.crouchHeight ?? CFG.player.crouchHeight;
    this.height = this.standHeight;
    this.pos = new THREE.Vector3(); this.prevPos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.grounded = false; this.crouching = false; this.surface = 'concrete';
    this.stepOffset = 0; this.jumpBufferT = 0; this.landSpeed = 0; this.jumped = false;
    this.edgeGuard = false;
    this.climbInput = 0; this.ladder = null; this.ladderCd = 0; this.climbing = false; this.climbDist = 0;
    this.onTerrain = false; this.sliding = false;
    this.accelK = o.accelK ?? 1; this.frictionK = o.frictionK ?? 1; // v24: bots get momentum (players keep the snappy Quake-style values)
    this._c = [];
  }

  teleport(p) {
    this.pos.copy(p); this.prevPos.copy(p); this.vel.set(0, 0, 0);
    this.crouching = false; this.height = this.standHeight; this.stepOffset = 0;
    const g = this.world.groundBelow(p.x, p.y + 0.6, p.z, this.radius, 3, 0.6);
    if (g) this.pos.y = this.prevPos.y = g.y;
    this.grounded = !!g;
  }

  horizontalSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
  requestJump() {
    if (this.climbing) { // jump off the ladder: push away from the wall
      const l = this.ladder; this.vel.set(l.nx * 3.2, 3.6, l.nz * 3.2); this.climbing = false; this.ladder = null; this.ladderCd = 0.45; this.jumped = true; return;
    }
    this.jumpBufferT = CFG.player.jumpBuffer;
  }

  // Ladder volume: gravity off, W/S (climbInput) drive the Y axis. Airborne inside a volume = grab the ladder.
  _climb(dt, wishX, wishZ) {
    const P = CFG.player, l = this.ladder, ci = this.climbInput, top = this.pos.y >= l.top - 0.03;
    const tx = -l.nz, tz = l.nx, strafe = (wishX * tx + wishZ * tz) * (Math.abs(ci) > 0 ? 0.6 : 1);
    this.vel.x = tx * strafe * 1.6 - l.nx * (ci > 0 ? 1.4 : 0.35); this.vel.z = tz * strafe * 1.6 - l.nz * (ci > 0 ? 1.4 : 0.35);
    this.vel.y = ci * P.climbSpeed;
    if (top && ci > 0) { this.vel.y = 0.6; this.vel.x -= l.nx * 2.4; this.vel.z -= l.nz * 2.4; } // mount the platform
    this.grounded = false;
    this._moveAxis('x', this.vel.x * dt, false); this._moveAxis('z', this.vel.z * dt, false);
    const ground = this._moveY(this.vel.y * dt);
    this.climbDist += Math.abs(this.vel.y * dt);
    const g = this.world.groundBelow(this.pos.x, this.pos.y, this.pos.z, this.radius, 0.03);
    if ((ground || g) && ci <= 0) { this.grounded = true; this.vel.y = 0; if (g) { this.pos.y = g.y; this.surface = g.surface; } }
  }

  setCrouch(want) {
    const w = this.world, p = this.pos, d = this.standHeight - this.crouchHeight;
    if (want && !this.crouching) {
      this.crouching = true; this.height = this.crouchHeight;
      if (!this.grounded) { p.y += d; this.prevPos.y += d; this.stepOffset -= d; } // tuck legs: crouch-jump
    } else if (!want && this.crouching) {
      if (this.grounded) { if (w.fits(p.x, p.y, p.z, this.radius, this.standHeight)) { this.crouching = false; this.height = this.standHeight; } }
      else if (w.fits(p.x, p.y - d, p.z, this.radius, this.standHeight)) { p.y -= d; this.prevPos.y -= d; this.stepOffset += d; this.crouching = false; this.height = this.standHeight; }
      else if (w.fits(p.x, p.y, p.z, this.radius, this.standHeight)) { this.crouching = false; this.height = this.standHeight; }
    }
  }

  _friction(dt, hasInput) {
    const v = this.vel, sp = Math.hypot(v.x, v.z);
    if (sp < 0.02) { v.x = 0; v.z = 0; return; }
    const P = CFG.player, fr = (hasInput ? P.friction : P.brakeFriction) * this.frictionK;
    const drop = Math.max(sp, P.stopSpeed) * fr * dt, ns = Math.max(sp - drop, 0) / sp;
    v.x *= ns; v.z *= ns;
  }

  _accelerate(wx, wz, wishSpeed, accel, dt, cap = Infinity) {
    const v = this.vel, ws = Math.min(wishSpeed, cap), cur = v.x * wx + v.z * wz, add = ws - cur;
    if (add <= 0) return;
    let as = accel * this.accelK * wishSpeed * dt; if (as > add) as = add;
    v.x += as * wx; v.z += as * wz;
  }

  step(dt, wishX, wishZ, wishSpeed) {
    const P = CFG.player;
    this.prevPos.copy(this.pos);
    this.landSpeed = 0; this.jumped = false;
    if (this.ladderCd > 0) this.ladderCd -= dt;
    const lad = this.ladderCd > 0 || !this.world.ladders.length ? null : this.world.ladderAt(this.pos.x, this.pos.y, this.pos.z, this.radius);
    if (lad) {
      const atTop = this.pos.y >= lad.top - 0.05;
      this.climbing = this.grounded ? (this.climbInput > 0 && !atTop) : true;
      if (this.climbing) { this.ladder = lad; this.jumpBufferT = 0; this._climb(dt, wishX, wishZ); this.stepOffset = damp(this.stepOffset, 0, 16, dt); return; }
    }
    if (this.climbing) { this.climbing = false; if (this.vel.y > 0) this.vel.y = Math.min(this.vel.y, 1.5); }
    this.ladder = null;
    const hasInput = (wishX !== 0 || wishZ !== 0) && wishSpeed > 0, T = this.world.terrain;
    if (T && hasInput && this.grounded && this.onTerrain) { // walking uphill is slower (grade along the wish direction)
      const gr = T.gradAt(this.pos.x, this.pos.z), up = gr.x * wishX + gr.z * wishZ;
      if (up > 0.05) wishSpeed *= clamp(1 - up * 0.42, 0.6, 1);
    }
    if (this.jumpBufferT > 0) this.jumpBufferT -= dt;
    if (this.grounded) {
      if (this.jumpBufferT > 0) {
        this.jumpBufferT = 0; this.vel.y = P.jumpVel; this.grounded = false; this.jumped = true;
        const hs = this.horizontalSpeed(), cap = Math.max(wishSpeed, 1) * 1.2;
        if (hs > cap) { this.vel.x *= cap / hs; this.vel.z *= cap / hs; }
        this._accelerate(wishX, wishZ, wishSpeed, P.airAccel, dt, P.airCap);
      } else {
        this._friction(dt, hasInput);
        if (hasInput) this._accelerate(wishX, wishZ, wishSpeed, P.groundAccel, dt);
      }
    } else if (hasInput) this._accelerate(wishX, wishZ, wishSpeed, P.airAccel, dt, P.airCap);

    this._unwedgeRamps();
    const wasGrounded = this.grounded;
    if (!this.grounded) this.vel.y += CFG.gravity * dt; else this.vel.y = Math.min(this.vel.y, 0);
    const fallSpeed = -this.vel.y;
    const guard = this.edgeGuard && wasGrounded && !this.jumped;
    this._moveAxis('x', this.vel.x * dt, guard);
    this._moveAxis('z', this.vel.z * dt, guard);
    this._moveY(this.vel.y * dt);

    const maxDown = wasGrounded && this.vel.y <= 0 ? P.stepHeight : 0.02;
    const g = this.vel.y <= 0.001 ? this.world.groundBelow(this.pos.x, this.pos.y, this.pos.z, this.radius, maxDown) : null;
    this.onTerrain = !!(g && g.terrain); this.sliding = false;
    if (g && g.steep) { // too steep to stand on: slide down the fall line
      const gr = T.gradAt(this.pos.x, this.pos.z), gl = Math.hypot(gr.x, gr.z) || 1;
      this.pos.y = g.y; this.surface = g.surface; this.grounded = false; this.sliding = true;
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x -= (gr.x / gl) * 11 * dt; this.vel.z -= (gr.z / gl) * 11 * dt;
    } else if (g) {
      const dy = g.y - this.pos.y;
      if (wasGrounded && dy < -0.06 && !g.terrain) this.stepOffset -= dy;
      this.pos.y = g.y; this.surface = g.surface;
      if (!wasGrounded) this.landSpeed = Math.max(fallSpeed, 0.01);
      this.grounded = true; this.vel.y = 0;
    } else this.grounded = false;
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
  }

  // v23 safety net: a body below a ramp's surface inside its footprint (knock-back, teleport, old saves) is pushed out through the nearest side.
  _unwedgeRamps() {
    const w = this.world, p = this.pos, r = this.radius, h = this.height;
    for (const rp of w.ramps) {
      if (p.x + r <= rp.minX || p.x - r >= rp.maxX || p.z + r <= rp.minZ || p.z - r >= rp.maxZ || p.y + h <= rp.y0) continue;
      if (p.y >= w.rampHeight(rp, clamp(p.x, rp.minX, rp.maxX), clamp(p.z, rp.minZ, rp.maxZ)) - CFG.player.stepHeight) continue;
      const opts = [[rp.minX - r - 1e-3 - p.x, 0], [rp.maxX + r + 1e-3 - p.x, 0], [0, rp.minZ - r - 1e-3 - p.z], [0, rp.maxZ + r + 1e-3 - p.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      for (const [dx, dz] of opts) if (w.fits(p.x + dx, p.y, p.z + dz, r, h)) { p.x += dx; p.z += dz; break; }
    }
  }

  _moveAxis(axis, amount, guard) {
    if (amount === 0) return;
    const w = this.world, p = this.pos, r = this.radius, h = this.height, P = CFG.player;
    const before = p[axis], beforeY = p.y;
    p[axis] += amount;
    const cands = w.query(p.x - r - 0.05, p.z - r - 0.05, p.x + r + 0.05, p.z + r + 0.05, this._c);
    for (const b of cands) {
      if (!b.blocksMove || !CollisionWorld.overlap(b, p.x, p.y, p.z, r, h)) continue;
      const rise = b.max.y - p.y, allow = this.grounded ? P.stepHeight : P.airStep;
      if (rise > 0 && rise <= allow && w.fits(p.x, b.max.y + 1e-4, p.z, r, h)) {
        const old = p.y; p.y = b.max.y + 1e-4;
        if (this.grounded) this.stepOffset -= p.y - old; else if (this.vel.y < 0) this.vel.y = 0;
        continue;
      }
      p[axis] = amount > 0 ? b.min[axis] - r - 1e-5 : b.max[axis] + r + 1e-5;
      this.vel[axis] = 0;
    }
    for (const rp of w.ramps) {
      if (p.x + r <= rp.minX || p.x - r >= rp.maxX || p.z + r <= rp.minZ || p.z - r >= rp.maxZ || p.y + h <= rp.y0) continue;
      const top = w.rampMaxUnder(rp, p.x, p.z, r), allow = this.grounded ? P.stepHeight : P.airStep;
      if (!(top > p.y + allow && p.y < top - 0.02)) continue;
      // v23: the ramp's side is a wall that refuses moves INTO it; a body already wedged beside it may always move out
      // (before, every move on the axis was reverted → players who dropped off the low side of a ramp were stuck for good)
      const depth = (x, z) => Math.min(x + r - rp.minX, rp.maxX - x + r, z + r - rp.minZ, rp.maxZ - z + r);
      const bx = axis === 'x' ? p.x - amount : p.x, bz = axis === 'z' ? p.z - amount : p.z;
      if (depth(p.x, p.z) < depth(bx, bz)) continue;
      p[axis] -= amount; this.vel[axis] = 0;
    }
    const T = w.terrain;
    if (T) { // heightfield: follow walkable slopes, refuse to walk up anything steeper than 45°
      const th = T.heightAt(p.x, p.z);
      if (th > p.y) {
        // step assist (v16): a short steep bump whose ground 0.55 m further on is within step height is a step, not a cliff
        const dir = amount > 0 ? 0.55 : -0.55, aheadRise = T.heightAt(p.x + (axis === 'x' ? dir : 0), p.z + (axis === 'z' ? dir : 0)) - beforeY;
        const walkable = T.slopeAt(p.x, p.z) <= MAX_SLOPE || (this.grounded && aheadRise <= P.stepHeight);
        if (walkable && th - p.y < 0.6 && w.fits(p.x, th + 1e-3, p.z, r, h)) p.y = th;
        else { p[axis] = before; p.y = Math.max(beforeY, T.heightAt(p.x, p.z)); this.vel[axis] = 0; }
      }
    }
    // SHIFT edge-guard: refuse moves that would leave the footprint without support.
    if (guard && !w.groundBelow(p.x, p.y, p.z, r * 0.8, P.stepHeight + 0.05)) {
      p[axis] = before; p.y = beforeY; this.vel[axis] = 0;
    }
  }

  _moveY(amount) {
    const w = this.world, p = this.pos, r = this.radius, h = this.height, prevY = p.y;
    p.y += amount;
    let hitGround = false;
    for (const b of w.query(p.x - r, p.z - r, p.x + r, p.z + r, this._c)) {
      if (!b.blocksMove || !CollisionWorld.overlap(b, p.x, p.y, p.z, r, h)) continue;
      if (amount <= 0) { p.y = b.max.y; hitGround = true; } else p.y = b.min.y - h - 1e-4;
      this.vel.y = 0;
    }
    for (const rp of w.ramps) {
      if (p.x + r <= rp.minX || p.x - r >= rp.maxX || p.z + r <= rp.minZ || p.z - r >= rp.maxZ) continue;
      const s = w.rampHeight(rp, clamp(p.x, rp.minX, rp.maxX), clamp(p.z, rp.minZ, rp.maxZ));
      if (p.y < s && prevY >= s - CFG.player.stepHeight - 0.05) { p.y = s; if (this.vel.y < 0) { this.vel.y = 0; hitGround = true; } }
    }
    if (w.terrain) { const th = w.terrain.heightAt(p.x, p.z); if (p.y < th) { p.y = th; if (this.vel.y < 0) { this.vel.y = 0; hitGround = true; } } }
    return hitGround;
  }

  nudge(dx, dz) {
    const vx = this.vel.x, vz = this.vel.z;
    this._moveAxis('x', dx, false); this._moveAxis('z', dz, false);
    this.vel.x = vx; this.vel.z = vz;
  }

  static separate(a, b) {
    if (a.pos.y + a.height < b.pos.y || b.pos.y + b.height < a.pos.y) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, min = a.radius + b.radius, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1e-3, push = (min - d) * 0.5 + 1e-4;
    const nx = d2 > 0 ? dx / d : 1, nz = d2 > 0 ? dz / d : 0;
    a.nudge(-nx * push, -nz * push); b.nudge(nx * push, nz * push);
  }
}


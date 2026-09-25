/* =====================================================================
   PHYSICS WORLD (cannon-es) — static level bodies + dynamic debris:
   brass casings, ragdoll-lite corpses and bouncing grenades.
   ===================================================================== */
/* v5: static spatial-hash broadphase. The level is ~1000 static boxes and only a handful of
   awake dynamic bodies (casings, grenades, corpses, dropped guns). SAP swept every static pair
   each step (~5 ms); this bins the statics once and tests each AWAKE dynamic body only against
   the statics in its cells (+ oversized statics such as the terrain) and against other dynamics. */
class StaticHashBroadphase extends CANNON.Broadphase {
  constructor() { super(); this.cell = 6; this.hash = new Map(); this.big = []; this.nStatic = -1; this.stamp = 0; this.useBoundingBoxes = true; }
  _key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }
  _rebuild(world, n) {
    this.hash.clear(); this.big.length = 0; this.nStatic = n; const c = this.cell;
    for (const b of world.bodies) {
      if (b.type !== CANNON.Body.STATIC) continue;
      b.updateAABB(); b._bpS = 0;
      const lo = b.aabb.lowerBound, up = b.aabb.upperBound, x0 = Math.floor(lo.x / c), x1 = Math.floor(up.x / c), z0 = Math.floor(lo.z / c), z1 = Math.floor(up.z / c);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 48) { this.big.push(b); continue; }
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = this._key(ix, iz); let l = this.hash.get(k); if (!l) this.hash.set(k, l = []); l.push(b); }
    }
  }
  collisionPairs(world, p1, p2) {
    const B = world.bodies, STATIC = CANNON.Body.STATIC, SLEEPING = CANNON.Body.SLEEPING, dyn = [];
    let n = 0;
    for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.type === STATIC) n++; else dyn.push(b); }
    if (n !== this.nStatic) this._rebuild(world, n);
    const c = this.cell;
    for (let i = 0; i < dyn.length; i++) {
      const a = dyn[i];
      for (let j = i + 1; j < dyn.length; j++) if (this.needBroadphaseCollision(a, dyn[j])) this.intersectionTest(a, dyn[j], p1, p2);
      if (a.sleepState === SLEEPING) continue;
      if (a.aabbNeedsUpdate) a.updateAABB();
      const s = ++this.stamp, lo = a.aabb.lowerBound, up = a.aabb.upperBound;
      for (const st of this.big) if (this.needBroadphaseCollision(a, st)) this.intersectionTest(a, st, p1, p2);
      for (let ix = Math.floor(lo.x / c); ix <= Math.floor(up.x / c); ix++) for (let iz = Math.floor(lo.z / c); iz <= Math.floor(up.z / c); iz++) {
        const l = this.hash.get(this._key(ix, iz)); if (!l) continue;
        for (const st of l) { if (st._bpS === s) continue; st._bpS = s; if (this.needBroadphaseCollision(a, st)) this.intersectionTest(a, st, p1, p2); }
      }
    }
  }
  aabbQuery(world, aabb, result = []) { for (const b of world.bodies) { if (b.aabbNeedsUpdate) b.updateAABB(); if (b.aabb.overlaps(aabb)) result.push(b); } return result; }
}

class PhysicsWorld {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, CFG.gravity, 0) });
    this.world.broadphase = new StaticHashBroadphase(); this.world.broadphase.world = this.world;
    // sparse pair matrix: the dense one is N² for ~1000 static boxes (cleared every step, reallocated on every add/remove)
    if (CANNON.ObjectCollisionMatrix) { this.world.collisionMatrix = new CANNON.ObjectCollisionMatrix(); this.world.collisionMatrixPrevious = new CANNON.ObjectCollisionMatrix(); }
    this.world.allowSleep = true; this.world.solver.iterations = 8;
    this.matDefault = new CANNON.Material('default'); this.matCorpse = new CANNON.Material('corpse');
    this.matBrass = new CANNON.Material('brass'); this.matNade = new CANNON.Material('nade');
    this.world.defaultContactMaterial.friction = 0.35; this.world.defaultContactMaterial.restitution = 0.2;
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matCorpse, this.matDefault, { friction: 0.9, restitution: 0.02 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matBrass, this.matDefault, { friction: 0.25, restitution: 0.45 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matNade, this.matDefault, { friction: 0.5, restitution: 0.38 }));
    this.dynamics = []; this.casings = [];
    this.casingGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 8);
    this.casingGeoBig = new THREE.CylinderGeometry(0.009, 0.009, 0.06, 8);
    this.brass = new THREE.MeshPhysicalMaterial({ color: 0xd0a54a, metalness: 1, roughness: 0.28, clearcoat: 0.3 });
  }

  addStaticBox(min, max) {
    const he = new CANNON.Vec3((max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2);
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.matDefault, shape: new CANNON.Box(he) });
    body.position.set((max.x + min.x) / 2, (max.y + min.y) / 2, (max.z + min.z) / 2);
    this.world.addBody(body);
  }

  addStaticRamp(r) {
    const isX = r.axis === 'x', L = isX ? r.maxX - r.minX : r.maxZ - r.minZ, W = isX ? r.maxZ - r.minZ : r.maxX - r.minX;
    const rise = r.y1 - r.y0, len = Math.hypot(L, rise), th = 0.1, ang = Math.atan2(rise, L);
    const he = isX ? new CANNON.Vec3(len / 2, th / 2, W / 2) : new CANNON.Vec3(W / 2, th / 2, len / 2);
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.matDefault, shape: new CANNON.Box(he) });
    const q = new CANNON.Quaternion();
    if (isX) q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), r.dir * ang); else q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -r.dir * ang);
    body.quaternion.copy(q);
    const n = q.vmult(new CANNON.Vec3(0, 1, 0));
    body.position.set((r.minX + r.maxX) / 2 - n.x * th / 2, (r.y0 + r.y1) / 2 - n.y * th / 2, (r.minZ + r.maxZ) / 2 - n.z * th / 2);
    this.world.addBody(body);
  }

  // v5 terrain: cannon Heightfield (z-up) rotated onto the xz plane; column j runs from maxZ toward minZ.
  addHeightfield(T) {
    const data = [];
    for (let i = 0; i < T.nx; i++) { const col = new Array(T.nz); for (let j = 0; j < T.nz; j++) col[j] = T.h[i + (T.nz - 1 - j) * T.nx]; data.push(col); }
    // only grenades (collision group 4) touch the cannon heightfield: sphere-vs-pillar is cheap and they need true bounces.
    // Everything else (corpses, dropped guns, casings) uses _terrainContacts(): convex pillars cost ~2 ms per body per step.
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.matDefault, collisionFilterGroup: 2, collisionFilterMask: 4 });
    body.addShape(new CANNON.Heightfield(data, { elementSize: T.s }));
    body.position.set(T.x0, 0, T.z0 + (T.nz - 1) * T.s); body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(body); this.terrain = T;
  }

  // Terrain contact for non-grenade dynamics: every hull point below the heightfield gets pushed out and receives a
  // normal impulse (restitution) plus Coulomb friction at that point, so boxes tumble and settle on slopes.
  _terrainContacts() {
    const T = this.terrain; if (!T) return;
    const wp = this._tw || (this._tw = new CANNON.Vec3()), r = this._tr || (this._tr = new CANNON.Vec3()), vc = this._tv || (this._tv = new CANNON.Vec3());
    const rn = this._trn || (this._trn = new CANNON.Vec3()), tmp = this._tt || (this._tt = new CANNON.Vec3()), imp = this._ti || (this._ti = new CANNON.Vec3()), n3 = new THREE.Vector3();
    for (const d of this.dynamics) {
      if (d.removed || d.sinking || d.useHF) continue;
      const b = d.body; if (b.sleepState === CANNON.Body.SLEEPING) continue;
      if (!d.hull) { const sh = b.shapes[0]; d.hull = sh.halfExtents ? [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new CANNON.Vec3(x * sh.halfExtents.x, y * sh.halfExtents.y, z * sh.halfExtents.z)))) : sh.vertices ? sh.vertices.map((v) => v.clone()) : [new CANNON.Vec3(0, -(sh.radius || 0.05), 0)]; }
      let maxPen = 0, contacts = 0;
      for (const lp of d.hull) { b.quaternion.vmult(lp, r); const pen = T.heightAt(b.position.x + r.x, b.position.z + r.z) - (b.position.y + r.y); if (pen > maxPen) maxPen = pen; }
      if (maxPen > 0) { b.position.y += maxPen; if (b.previousPosition) b.previousPosition.y += maxPen; b.aabbNeedsUpdate = true; }
      for (let it = 0; it < 2; it++) for (const lp of d.hull) { // sequential impulses (2 passes), points within 1 cm of the surface count as touching
        b.quaternion.vmult(lp, r); wp.copy(b.position).vadd(r, wp);
        if (T.heightAt(wp.x, wp.z) - wp.y < -0.01) continue;
        if (it === 0) contacts++;
        T.normalAt(wp.x, wp.z, n3); const n = tmp.set(n3.x, n3.y, n3.z);
        b.angularVelocity.cross(r, vc); vc.vadd(b.velocity, vc);
        const vn = vc.dot(n); if (vn >= 0) continue;
        r.cross(n, rn); b.invInertiaWorld.vmult(rn, rn); rn.cross(r, rn);
        const kn = b.invMass + rn.dot(n), jn = (-(1 + (vn < -1.5 && it === 0 ? 0.22 : 0)) * vn) / kn;
        imp.copy(n).scale(jn, imp); b.applyImpulse(imp, r);
        b.angularVelocity.cross(r, vc); vc.vadd(b.velocity, vc); // Coulomb friction along the slide direction
        const vn2 = vc.dot(n); vc.x -= n.x * vn2; vc.y -= n.y * vn2; vc.z -= n.z * vn2;
        const vt = Math.hypot(vc.x, vc.y, vc.z);
        if (vt > 1e-4) { const jt = Math.min(vt / kn, (d.fric ?? 0.6) * jn); imp.set(-vc.x / vt * jt, -vc.y / vt * jt, -vc.z / vt * jt); b.applyImpulse(imp, r); }
      }
      if (contacts) { // static friction: on a slope gentler than the friction cone a slow body sticks instead of creeping
        const stick = d.age > 0.8 && T.slopeAt(b.position.x, b.position.z) < (d.fric ?? 0.6) && b.velocity.length() < 2.5, k = stick ? 0.6 : 0.97;
        b.velocity.x *= k; b.velocity.z *= k; if (stick && b.velocity.y > 0) b.velocity.y *= 0.5;
        b.angularVelocity.scale(stick && b.angularVelocity.lengthSquared() < 1 ? 0.8 : 0.96, b.angularVelocity); // let bodies topple; only calm the last wobble
      }
      // resting on the slope: our impulses run once per frame, so help cannon's sleep test along
      if (contacts && b.velocity.lengthSquared() < 0.45 && b.angularVelocity.lengthSquared() < 0.6) { if ((d.restT = (d.restT || 0) + 1) > 24) { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.sleep(); } } else d.restT = 0;
    }
  }

  addDynamic(o) {
    const body = new CANNON.Body({ mass: o.mass, material: o.material || this.matDefault, shape: o.shape,
      linearDamping: o.linearDamping ?? 0.05, angularDamping: o.angularDamping ?? 0.1, allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6 });
    body.position.set(o.position.x, o.position.y, o.position.z);
    if (o.quaternion) body.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
    if (o.velocity) body.velocity.set(o.velocity.x, o.velocity.y, o.velocity.z);
    if (o.angularVelocity) body.angularVelocity.set(o.angularVelocity.x, o.angularVelocity.y, o.angularVelocity.z);
    this.world.addBody(body);
    const d = { body, mesh: o.mesh, age: 0, life: o.life ?? 6, sink: o.sink ?? 1.2, offset: o.offset || null, removed: false, sinking: false, manual: !!o.manual };
    if (o.mesh) this.scene.add(o.mesh);
    this.dynamics.push(d);
    return d;
  }

  remove(d) {
    if (d.removed) return;
    d.removed = true;
    if (!d.sinking) this.world.removeBody(d.body);
    if (d.mesh) this.scene.remove(d.mesh);
  }

  ejectCasing(pos, vel, big = false) {
    if (this.casings.length > 40) this.remove(this.casings.shift());
    const mesh = new THREE.Mesh(big ? this.casingGeoBig : this.casingGeo, this.brass);
    const hy = big ? 0.03 : 0.015, hr = big ? 0.009 : 0.0065;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), Math.PI / 2));
    const d = this.addDynamic({ mesh, mass: 0.02, material: this.matBrass, shape: new CANNON.Box(new CANNON.Vec3(hr, hy, hr)), position: pos, quaternion: q, velocity: vel,
      angularVelocity: { x: rand(-25, 25), y: rand(-25, 25), z: rand(-25, 25) }, life: 5, sink: 0.4 });
    let tinks = 0;
    d.body.addEventListener('collide', (e) => { if (tinks > 2) return; if (Math.abs(e.contact.getImpactVelocityAlongNormal()) > 0.6) { tinks++; this.audio.casing(d.body.position); } });
    this.casings.push(d);
  }

  spawnCorpse(mesh, pos, yaw, hitDir, force, limp = null) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const axis = new THREE.Vector3(0, 1, 0).cross(hitDir).normalize(), spin = 2.2 + force * 0.4;
    const d = this.addDynamic({ mesh, mass: 60, material: this.matCorpse, shape: new CANNON.Box(new CANNON.Vec3(0.26, 0.88, 0.2)),
      position: { x: pos.x, y: pos.y + 0.9, z: pos.z }, quaternion: q, velocity: { x: hitDir.x * force, y: 1.2, z: hitDir.z * force },
      angularVelocity: { x: axis.x * spin, y: rand(-1, 1), z: axis.z * spin }, linearDamping: 0.15, angularDamping: 0.35, life: 8, sink: 1.5, offset: new THREE.Vector3(0, -0.9, 0) });
    d.limp = limp; d.fric = 0.9; d.corpse = true; d.fallDir = new CANNON.Vec3(hitDir.x, 0, hitDir.z); if (d.fallDir.lengthSquared() < 0.1) d.fallDir.set(1, 0, 0); d.fallDir.normalize();
    return d;
  }

  // v10 death collapse: while the body topples, the limbs go limp (knees buckle, arms drop, head lolls) — eased over ~0.45 s.
  _limp(d, dt) {
    const L = d.limp; L.t = Math.min(1, L.t + dt * 2.2); const k = 1 - Math.pow(1 - L.t, 3);
    for (let i = 0; i < 2; i++) { L.hips[i].rotation.x = lerp(L.h0[i], L.hipT[i], k); L.knees[i].rotation.x = lerp(L.k0[i], L.kneeT[i], k); }
    L.arms.rotation.x = lerp(L.a0, L.armT, k); L.arms.rotation.z = lerp(0, L.armZ, k);
    L.head.rotation.x = lerp(L.hd0, L.headT, k); L.head.rotation.z = lerp(0, L.headZ, k); L.torso.rotation.x = lerp(L.t0, L.torsoT, k);
    if (L.t >= 1) d.limp = null;
  }

  // Grenade body: caller owns lifetime (manual), physics syncs the mesh.
  grenadeBody(mesh, pos, vel) {
    const d = this.addDynamic({ mesh, mass: 0.4, material: this.matNade, shape: new CANNON.Sphere(0.05), position: pos, velocity: vel,
      angularVelocity: { x: rand(-12, 12), y: rand(-12, 12), z: rand(-12, 12) }, linearDamping: 0.12, angularDamping: 0.4, life: 999, manual: true });
    d.body.collisionFilterGroup = 4; d.useHF = true; // grenades bounce on the real heightfield
    d.body.addEventListener('collide', (e) => { const iv = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (iv > 1.2) this.audio.nadeBounce(d.body.position, iv / 8); });
    return d;
  }

  blast(pos, radius, strength) {
    for (const d of this.dynamics) {
      if (d.removed || d.sinking) continue;
      const b = d.body, dx = b.position.x - pos.x, dy = b.position.y - pos.y, dz = b.position.z - pos.z, dist = Math.hypot(dx, dy, dz);
      if (dist > radius || dist < 1e-3) continue;
      const k = strength * (1 - dist / radius) * b.mass;
      b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx / dist * k, (dy / dist + 0.6) * k, dz / dist * k));
    }
  }

  step(dt) {
    this.world.step(1 / 90, dt, 4);
    this._terrainContacts();
    const tmp = TMP_V4;
    for (let i = this.dynamics.length - 1; i >= 0; i--) {
      const d = this.dynamics[i];
      if (d.removed) { this.dynamics.splice(i, 1); continue; }
      d.age += dt;
      if (!d.manual && !d.sinking && d.age > d.life - d.sink) { d.sinking = true; this.world.removeBody(d.body); }
      if (d.sinking) {
        d.mesh.position.y -= dt * 0.6;
        if (d.age >= d.life) { this.remove(d); this.dynamics.splice(i, 1); const ci = this.casings.indexOf(d); if (ci >= 0) this.casings.splice(ci, 1); }
        continue;
      }
      const b = d.body;
      if (!d.mesh) continue;
      d.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      if (d.offset) { tmp.copy(d.offset).applyQuaternion(d.mesh.quaternion); d.mesh.position.set(b.position.x + tmp.x, b.position.y + tmp.y, b.position.z + tmp.z); }
      else d.mesh.position.set(b.position.x, b.position.y, b.position.z);
      if (d.limp) this._limp(d, dt);
      if (d.corpse && d.age > 0.5 && d.age < 5) { // never leave a body standing: still upright after 0.5 s → shove the shoulders over
        const q = b.quaternion, upY = 1 - 2 * (q.x * q.x + q.z * q.z);
        if (upY > 0.75) {
          d.shove = (d.shove || 0) + 1; const f = d.shove % 40 < 20 ? 1 : -1; // alternate direction in case a wall blocks one side
          const top = this._top || (this._top = new CANNON.Vec3()), imp = this._shv || (this._shv = new CANNON.Vec3());
          b.quaternion.vmult(new CANNON.Vec3(0, 0.75, 0), top); imp.copy(d.fallDir).scale(f * 60 * 1.6 * dt, imp);
          b.wakeUp(); b.applyImpulse(imp, top);
        }
      }
    }
  }
}

/* =====================================================================
   EFFECTS — pooled tracers, decals, golden impact sparks, dust, blood,
   smoke puffs, muzzle/explosion lights, fireballs and smoke clouds.
   ===================================================================== */
class ParticlePool {
  constructor(scene, max, map, additive, size) {
    this.max = max; this.cursor = 0; this.active = 0; this.additive = additive;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: additive ? 0 : 0.12 });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.userData.noAO = true;
    scene.add(this.points);
  }
  emit(p, vx, vy, vz, life, r, g, b, grav) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max; const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b; this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.active = 1;
  }
  update(dt) {
    if (!this.active) return;
    let any = 0; const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -1000; continue; }
      any = 1; this.vel[k + 1] += this.grav[i] * dt; this.vel[k] *= drag; this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.additive ? this.life[i] / this.maxLife[i] : 1;
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.active = any; this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

class SmokeCloud {
  constructor(fx, pos, duration) {
    this.fx = fx; this.pos = pos.clone(); this.t = 0; this.duration = duration; this.radius = 0; this.maxRadius = 4.6; this.dead = false;
    this.puffs = [];
    const tex = fx.tex.smoke;
    for (let i = 0; i < 30; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xbfc3c6, transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * 6.28 });
      const s = new THREE.Sprite(m); s.userData.noAO = true;
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.05, 0.9), rand(-1, 1)).normalize();
      s.userData.dir = dir; s.userData.d = rand(0.25, 1); s.userData.spin = rand(-0.15, 0.15); s.userData.size = rand(2.6, 4.2);
      fx.scene.add(s); this.puffs.push(s);
    }
  }
  // Effective occlusion sphere used for LOS checks.
  blocks(a, b) {
    if (this.radius < 1) return false;
    const c = TMP_V1.set(this.pos.x, this.pos.y + this.radius * 0.45, this.pos.z), r = this.radius * 0.82;
    const ab = TMP_V2.subVectors(b, a), len2 = ab.lengthSq(); if (len2 < 1e-6) return false;
    const t = clamp(TMP_V3.subVectors(c, a).dot(ab) / len2, 0, 1);
    return TMP_V4.copy(a).addScaledVector(ab, t).distanceToSquared(c) < r * r;
  }
  update(dt) {
    this.t += dt;
    const grow = clamp(this.t / 2.2, 0, 1), fade = clamp((this.duration - this.t) / 3, 0, 1);
    this.radius = this.maxRadius * (1 - Math.pow(1 - grow, 2)) * (fade > 0.3 ? 1 : fade / 0.3);
    for (const s of this.puffs) {
      const u = s.userData, r = this.radius * u.d;
      s.position.set(this.pos.x + u.dir.x * r, this.pos.y + 0.4 + u.dir.y * r * 0.7, this.pos.z + u.dir.z * r);
      const sc = u.size * (0.35 + 0.65 * grow); s.scale.set(sc, sc, 1);
      s.material.rotation += u.spin * dt; s.material.opacity = 0.92 * Math.min(grow * 2, 1) * fade;
    }
    if (this.t >= this.duration) this.dispose();
  }
  dispose() { if (this.dead) return; this.dead = true; for (const s of this.puffs) { this.fx.scene.remove(s); s.material.dispose(); } }
}

class Effects {
  constructor(scene, tf, audio) {
    this.scene = scene; this.audio = audio; this.tf = tf;
    this.tex = { smoke: tf.smoke(), flash: tf.flash(), dot: tf.dot(), fire: tf.fire(), scorch: tf.scorch() };
    const decalMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decalMats = { concrete: decalMat(tf.bulletHole('concrete')), metal: decalMat(tf.bulletHole('metal')), wood: decalMat(tf.bulletHole('wood')), glass: decalMat(tf.bulletHole('glass')) };
    this.scorchMat = new THREE.MeshBasicMaterial({ map: this.tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.decals = []; this.decalIdx = 0;
    const dGeo = new THREE.PlaneGeometry(0.12, 0.12);
    for (let i = 0; i < 180; i++) { const m = new THREE.Mesh(dGeo, this.decalMats.concrete); m.visible = false; m.userData.noAO = true; scene.add(m); this.decals.push(m); }
    this.scorches = []; this.scorchIdx = 0;
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), this.scorchMat); m.visible = false; m.userData.noAO = true; scene.add(m); this.scorches.push(m); }
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1); tGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(tGeo, mat); m.visible = false; m.frustumCulled = false; m.userData.noAO = true; scene.add(m);
      this.tracers.push({ mesh: m, active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, speed: 0, len: 0 });
    }
    this.sparks = new ParticlePool(scene, 700, this.tex.dot, true, 0.055);
    this.dust = new ParticlePool(scene, 700, this.tex.dot, false, 0.085);
    this.puffs = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.smoke, color: 0x9a9690, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData.noAO = true; scene.add(s);
      this.puffs.push({ s, t: 0, life: 0, vel: new THREE.Vector3(), s0: 0, s1: 0, a: 0 });
    }
    this.puffIdx = 0;
    this.fires = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.fire, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffc080 }));
      s.visible = false; s.userData.noAO = true; scene.add(s); this.fires.push({ s, t: 0, life: 0, s0: 0, s1: 0 });
    }
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd9a0 }));
      s.visible = false; s.userData.noAO = true; scene.add(s); this.flashes.push({ s, t: 0 });
    }
    // Fixed light pool (constant light count = no shader recompiles).
    this.playerLight = new THREE.PointLight(0xffaa33, 0, 8, 2); scene.add(this.playerLight);
    this.botLights = [new THREE.PointLight(0xffb060, 0, 10, 2), new THREE.PointLight(0xffb060, 0, 10, 2)]; this.botLights.forEach((l) => scene.add(l));
    this.botLightIdx = 0; this.botLightT = [0, 0];
    this.boomLight = new THREE.PointLight(0xffa050, 0, 22, 2); scene.add(this.boomLight); this.boomT = 0;
    this.playerLightT = 0;
    this.smokes = [];
  }

  decal(point, normal, material = 'concrete') {
    const m = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    m.material = this.decalMats[material] || this.decalMats.concrete;
    m.position.copy(point).addScaledVector(normal, 0.004);
    m.lookAt(TMP_V1.copy(point).add(normal)); m.rotateZ(Math.random() * Math.PI * 2);
    const s = rand(0.75, 1.2); m.scale.set(s, s, s); m.visible = true;
  }

  tracer(from, to, speed = 380, len = 3.5, color = 0xffd98a) {
    const tr = this.tracers.find((t) => !t.active) || this.tracers[0];
    tr.active = true; tr.start.copy(from); tr.dir.subVectors(to, from); tr.dist = tr.dir.length();
    if (tr.dist < 0.5) { tr.active = false; return; }
    tr.dir.divideScalar(tr.dist); tr.t = 0; tr.speed = speed; tr.len = len;
    tr.mesh.material.color.setHex(color); tr.mesh.quaternion.setFromUnitVectors(TMP_V1.set(0, 0, 1), tr.dir); tr.mesh.visible = true;
  }

  puff(p, vel, life, s0, s1, alpha, color = 0x9a9690) {
    const f = this.puffs[this.puffIdx]; this.puffIdx = (this.puffIdx + 1) % this.puffs.length;
    f.s.position.copy(p); f.vel.copy(vel); f.t = 0; f.life = life; f.s0 = s0; f.s1 = s1; f.a = alpha;
    f.s.material.color.setHex(color); f.s.material.rotation = Math.random() * 6.28; f.s.visible = true;
  }

  impact(hit, loud = true) {
    const p = hit.point, n = hit.normal, mat = hit.material;
    const dmat = mat === 'metal' ? 'metal' : mat === 'wood' ? 'wood' : mat === 'glass' ? 'glass' : 'concrete';
    this.decal(p, n, dmat);
    if (mat === 'metal' || mat === 'concrete' || mat === 'glass') { // golden glowing sparks, ~0.2 s
      const k = mat === 'metal' ? 12 : 6;
      for (let i = 0; i < k; i++) this.sparks.emit(p, n.x * rand(1.5, 5) + rand(-2.5, 2.5), n.y * rand(1.5, 5) + rand(0, 3), n.z * rand(1.5, 5) + rand(-2.5, 2.5), rand(0.12, 0.22), 1.6, 1.05, 0.45, -12);
    }
    if (mat !== 'metal' && mat !== 'glass') {
      const c = mat === 'wood' ? [0.48, 0.36, 0.2] : mat === 'sand' ? [0.72, 0.6, 0.42] : mat === 'grass' ? [0.42, 0.46, 0.28] : mat === 'snow' ? [0.9, 0.93, 0.96] : mat === 'plaster' ? [0.75, 0.65, 0.5] : [0.56, 0.54, 0.5];
      for (let i = 0; i < 8; i++) this.dust.emit(p, n.x * rand(0.6, 2) + rand(-0.6, 0.6), n.y * rand(0.6, 2) + rand(0, 1.2), n.z * rand(0.6, 2) + rand(-0.6, 0.6), rand(0.35, 0.8), c[0], c[1], c[2], -3);
      this.puff(p.clone().addScaledVector(n, 0.08), TMP_V1.copy(n).multiplyScalar(0.5), 0.9, 0.15, 0.7, 0.5, (Math.round(c[0] * 180) << 16) | (Math.round(c[1] * 180) << 8) | Math.round(c[2] * 180));
    }
    if (loud) this.audio.impact(p, mat);
  }

  blood(p, dir, amount = 12) {
    for (let i = 0; i < amount; i++) this.dust.emit(p, dir.x * rand(0.5, 2.5) + rand(-0.8, 0.8), dir.y * rand(0.5, 2) + rand(-0.2, 1.4), dir.z * rand(0.5, 2.5) + rand(-0.8, 0.8), rand(0.3, 0.7), rand(0.4, 0.55), 0.02, 0.02, -9);
    this.puff(p, TMP_V1.copy(dir).multiplyScalar(0.6), 0.5, 0.1, 0.5, 0.45, 0x6a0c08);
  }

  // v9 headshot: a bright metallic spark burst off the helmet (SF2 "ping")
  helmetSpark(p, dir) { for (let i = 0; i < 14; i++) this.sparks.emit(p, -dir.x * rand(0.5, 2.5) + rand(-1.6, 1.6), rand(0.4, 2.6), -dir.z * rand(0.5, 2.5) + rand(-1.6, 1.6), rand(0.12, 0.26), 2.2, 1.8, 1.1, -6); }
  shield(p) { for (let i = 0; i < 10; i++) this.sparks.emit(p, rand(-2, 2), rand(-1, 2.5), rand(-2, 2), rand(0.15, 0.3), 0.4, 0.85, 1.6, -3); }

  worldFlash(pos, scale = 0.6) {
    const f = this.flashes.find((x) => x.t <= 0) || this.flashes[0];
    f.s.position.copy(pos); f.s.scale.set(scale, scale, 1); f.s.material.rotation = Math.random() * 6.28; f.s.visible = true; f.t = 0.05;
    const i = this.botLightIdx = (this.botLightIdx + 1) % 2; const l = this.botLights[i];
    l.position.copy(pos); l.intensity = 20; this.botLightT[i] = 0.05;
  }

  // Muzzle flash light: #ffaa33, intensity 15, distance 8, on for 0.04 s.
  playerMuzzleLight(pos, strength = 1) { this.playerLight.position.copy(pos); this.playerLight.intensity = 15 * strength; this.playerLightT = 0.04; }

  explosion(pos) {
    for (let i = 0; i < 3; i++) {
      const f = this.fires.find((x) => x.t >= x.life) || this.fires[0];
      f.s.position.copy(pos).add(TMP_V1.set(rand(-0.4, 0.4), rand(0.2, 0.9), rand(-0.4, 0.4))); f.t = 0; f.life = rand(0.28, 0.42); f.s0 = 0.8; f.s1 = rand(4, 5.5);
      f.s.material.rotation = Math.random() * 6.28; f.s.visible = true;
    }
    for (let i = 0; i < 40; i++) this.sparks.emit(pos, rand(-9, 9), rand(2, 12), rand(-9, 9), rand(0.3, 0.9), 1.8, 1.0, 0.4, -14);
    for (let i = 0; i < 24; i++) this.dust.emit(pos, rand(-6, 6), rand(1, 8), rand(-6, 6), rand(0.6, 1.4), 0.3, 0.28, 0.25, -9);
    for (let i = 0; i < 10; i++) this.puff(pos.clone().add(TMP_V1.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1))), TMP_V2.set(rand(-1.2, 1.2), rand(0.6, 1.8), rand(-1.2, 1.2)), rand(2.2, 3.4), 1.0, rand(3.5, 5), 0.8, 0x3a3632);
    this.boomLight.position.copy(pos).y += 0.8; this.boomLight.intensity = 120; this.boomT = 0.35;
    const sc = this.scorches[this.scorchIdx]; this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    sc.position.set(pos.x, pos.y + 0.01, pos.z); sc.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); sc.visible = true;
  }

  flashbang(pos) {
    const f = this.fires.find((x) => x.t >= x.life) || this.fires[0];
    f.s.position.copy(pos); f.t = 0; f.life = 0.18; f.s0 = 1; f.s1 = 6; f.s.visible = true;
    for (let i = 0; i < 20; i++) this.sparks.emit(pos, rand(-5, 5), rand(0, 6), rand(-5, 5), rand(0.1, 0.3), 2, 2, 2, -8);
    this.boomLight.color.setHex(0xffffff); this.boomLight.position.copy(pos); this.boomLight.intensity = 400; this.boomT = 0.12;
  }

  spawnSmoke(pos, duration) { this.smokes.push(new SmokeCloud(this, pos, duration)); }
  smokeBlocks(a, b) { for (const s of this.smokes) if (!s.dead && s.blocks(a, b)) return true; return false; }

  update(dt) {
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt;
      const head = Math.min(tr.t * tr.speed, tr.dist), tail = Math.max(head - tr.len, 0);
      if (tail >= tr.dist - 0.01 || tr.t > 1.5) { tr.active = false; tr.mesh.visible = false; continue; }
      tr.mesh.position.copy(tr.start).addScaledVector(tr.dir, tail); tr.mesh.scale.set(0.018, 0.018, Math.max(head - tail, 0.01));
    }
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    for (const f of this.puffs) {
      if (!f.s.visible) continue;
      f.t += dt; const k = f.t / f.life;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.position.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.exp(-1.5 * dt));
      const sc = lerp(f.s0, f.s1, 1 - Math.pow(1 - k, 2)); f.s.scale.set(sc, sc, 1); f.s.material.opacity = f.a * (1 - k);
    }
    for (const f of this.fires) {
      if (f.t >= f.life) { f.s.visible = false; continue; }
      f.t += dt; const k = clamp(f.t / f.life, 0, 1), sc = lerp(f.s0, f.s1, Math.sqrt(k));
      f.s.scale.set(sc, sc, 1); f.s.material.opacity = 1 - k * k;
    }
    if (this.playerLightT > 0) { this.playerLightT -= dt; if (this.playerLightT <= 0) this.playerLight.intensity = 0; }
    for (let i = 0; i < 2; i++) if (this.botLightT[i] > 0) { this.botLightT[i] -= dt; if (this.botLightT[i] <= 0) this.botLights[i].intensity = 0; }
    if (this.boomT > 0) { this.boomT -= dt; this.boomLight.intensity *= Math.exp(-9 * dt); if (this.boomT <= 0) { this.boomLight.intensity = 0; this.boomLight.color.setHex(0xffa050); } }
    for (let i = this.smokes.length - 1; i >= 0; i--) { this.smokes[i].update(dt); if (this.smokes[i].dead) this.smokes.splice(i, 1); }
    this.sparks.update(dt); this.dust.update(dt);
  }
}


import { CANNON, THREE, clamp } from './01_core.js';
// Apex maps shared by the triangle-collision maps (src/07w_skulltown.js): doors, baked navigation, baked spawns.
// Doors at the original prop_door positions (v60: Apex's own leaf, canyonlands_door_single_02_avt, 1.52 × 2.64 m, hinge at its
// origin — tools/blender/apex_door.py; a box stand-in without it). A leaf linked to another (link_to_guid_0) is half of a double
// door: both open and close together. Every leaf swings into the building — the side with a roof over it — whichever side it
// is opened from. E opens / closes; a bot walking up opens it (they cannot press E); an open leaf blocks nothing, a closed one
// blocks moves, shots and grenades, and a closing door reopens on anyone in its swing. mechs[0]: the host streams netState().
class ApexDoors {
  constructor(b, entries, model = null) {
    this.b = b; this.doors = [];
    const byId = new Map();
    for (const e of entries) {
      const pivot = new THREE.Group(); pivot.position.set(e.x, e.y, e.z); pivot.rotation.y = e.yaw;
      if (model) {
        const leaf = model.clone(true); leaf.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); pivot.add(leaf);
      } else {
        const mat = new THREE.MeshStandardMaterial({ color: 0x854d3b, metalness: 0.45, roughness: 0.65 });
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 1.46), mat); leaf.position.set(0, 1.22, -0.75); leaf.castShadow = true; leaf.receiveShadow = true; pivot.add(leaf);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 1.35), new THREE.MeshStandardMaterial({ color: 0xd8b057, roughness: 0.7 })); stripe.position.set(0, 1.2, -0.75); pivot.add(stripe);
      }
      b.scene.add(pivot); pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pivot), col = b.col.addBox(box.min.clone(), box.max.clone(), { material: 'metal' });
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const body = new CANNON.Body({ mass: 0, material: b.phys.matDefault, shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)) });
      body.position.set(mid.x, mid.y, mid.z); b.phys.world.addBody(body);
      // leaf centre, door-plane normal (n); dir: the swing (±90°) that takes the free end into the building
      const d = { pivot, col, body, yaw: e.yaw, base: e.y, k: 0, target: 0, dir: 1, solid: true, botT: 0, box: box.clone(), center: mid,
        nx: Math.cos(e.yaw), nz: -Math.sin(e.yaw), partner: null, link: e.link };
      d.dir = this._inward(d);
      // v60 an open leaf is solid too (along the wall it swung to): its own collider and body, swapped in at the end of the swing
      pivot.rotation.y = e.yaw + d.dir * Math.PI * 0.5; pivot.updateMatrixWorld(true);
      const ob = new THREE.Box3().setFromObject(pivot), os = ob.getSize(new THREE.Vector3()), om = ob.getCenter(new THREE.Vector3());
      d.openCol = b.col.addBox(ob.min.clone(), ob.max.clone(), { material: 'metal' }); b.col.setSolid(d.openCol, false);
      d.openBody = new CANNON.Body({ mass: 0, material: b.phys.matDefault, shape: new CANNON.Box(new CANNON.Vec3(os.x / 2, os.y / 2, os.z / 2)) }); d.openBody.position.set(om.x, om.y, om.z);
      d.open = false; d.leaf = box.clone(); pivot.rotation.y = e.yaw; pivot.updateMatrixWorld(true);
      this.doors.push(d); if (e.id) byId.set(e.id, d);
    }
    for (const d of this.doors) { const o = d.link && byId.get(d.link); if (o && o !== d) { d.partner = o; o.partner = d; } }
  }
  _inward(d) { // +1 / −1: the swing whose free end moves to the roofed side (+90° moves it along endN of the normal)
    const roof = (s) => { const o = new THREE.Vector3(d.center.x + d.nx * s * 1.6, d.base + 1.4, d.center.z + d.nz * s * 1.6); const h = this.b.col.raycast(o, new THREE.Vector3(0, 1, 0), 25); return h ? 1 : 0; };
    const side = roof(1) - roof(-1) || 1, a = d.yaw + Math.PI / 2, endN = -Math.sin(a) * d.nx - Math.cos(a) * d.nz;
    return endN * side > 0 ? 1 : -1;
  }
  nearest(c) {
    if (!c.alive) return null;
    const eye = c.eyePos(new THREE.Vector3()); let best = null, dist = 2.8;
    for (const d of this.doors) {
      const n = eye.distanceTo(d.center); if (n >= dist) continue;
      const hit = this.b.col.raycast(eye, d.center.clone().sub(eye).normalize(), n);
      const own = (c) => c === d.col || c === d.openCol || (d.partner && (c === d.partner.col || c === d.partner.openCol)); // (its own leaves, shut or open)
      if (hit && !own(hit.collider) && hit.t < n - 0.25) continue; // a wall between you and the door
      best = d; dist = n;
    }
    return best;
  }
  prompt(c) { const d = this.nearest(c); return d ? '按 [E] ' + (d.target ? '關門' : '開門') : null; }
  interact(c) { const d = this.nearest(c); if (!d) return false; this._open(d, d.target ? 0 : 1); return true; }
  _open(d, target) { d.target = target; if (d.partner) d.partner.target = target; } // a double door moves as one
  _swing(d, k) {
    const moved = k !== d.k;
    d.k = k; d.pivot.rotation.y = d.yaw + d.dir * k * Math.PI * 0.5;
    if (moved) { d.pivot.updateMatrixWorld(true); d.leaf.setFromObject(d.pivot); } // where the leaf is now (anti-crush)
    const shut = k <= 0.02, open = k >= 0.98, W = this.b.phys.world; // in between (a third of a second) neither collider is solid
    if (shut !== d.solid) { d.solid = shut; this.b.col.setSolid(d.col, shut); if (shut) W.addBody(d.body); else W.removeBody(d.body); }
    if (open !== d.open) { d.open = open; this.b.col.setSolid(d.openCol, open); if (open) W.addBody(d.openBody); else W.removeBody(d.openBody); }
  }
  // a closing leaf meets a body: the angle of the body around the hinge (from the shut leaf) is inside the sweep that is left
  // and within its radius of the leaf now (0.45 m of arc), and it is within the leaf's reach
  _hit(d, c) {
    const p = c.motor.pos; if (!c.alive || Math.abs(p.y - d.base) > 2) return null;
    const hx = d.pivot.position.x, hz = d.pivot.position.z, dx = p.x - hx, dz = p.z - hz, r = Math.hypot(dx, dz);
    if (r > 1.55 + 0.45 || r < 0.05) return null;
    const now = d.dir * d.k * Math.PI * 0.5, a = Math.atan2(-dx, -dz) - d.yaw, rel = Math.atan2(Math.sin(a), Math.cos(a)), pad = Math.min(1.2, 0.45 / r);
    const inside = now > 0 ? rel > -pad && rel < now + pad : rel < pad && rel > now - pad;
    return inside && Math.abs(rel - now) < pad ? { r, rel } : null;
  }
  // v60 user: E must close a door from where you stand. A body the closing leaf meets steps back from the hinge, out of the
  // leaf's reach; only one that cannot (a wall behind it) sends the door back open.
  _shove(d) {
    const hx = d.pivot.position.x, hz = d.pivot.position.z;
    for (const c of this.b.game.combatants) {
      let hit = this._hit(d, c); if (!hit) continue;
      if (d.k < 0.12) return true; // in the doorway at the last moment: open again
      const p = c.motor.pos, x0 = p.x, z0 = p.z;
      c.motor.nudge((p.x - hx) / hit.r * 0.12, (p.z - hz) / hit.r * 0.12); // step back from the hinge
      if (!(hit = this._hit(d, c))) continue;
      const ang = d.yaw + hit.rel, t = -Math.sign(d.dir) * 0.12; // else along the leaf's sweep: out through the doorway
      c.motor.nudge(-Math.cos(ang) * t, Math.sin(ang) * t);
      if (Math.hypot(p.x - x0, p.z - z0) < 0.04) return true; // pinned against a wall
    }
    return false;
  }
  tick(h) {
    const g = this.b.game;
    for (const d of this.doors) {
      if (!g.isClient) {
        const near = (r) => g.combatants.some((c) => c.alive && Math.hypot(c.motor.pos.x - d.center.x, c.motor.pos.z - d.center.z) < r && Math.abs(c.motor.pos.y - d.base) < 2);
        const bot = d.k <= 0.02 && d.target === 0 && g.combatants.find((c) => c.alive && c.isBot && Math.hypot(c.motor.pos.x - d.center.x, c.motor.pos.z - d.center.z) < 1.9 && Math.abs(c.motor.pos.y - d.base) < 2);
        if (bot) { this._open(d, 1); d.botT = 3; if (d.partner) d.partner.botT = 3; }
        if (d.botT > 0 && (d.botT -= h) <= 0 && !near(2.6)) d.target = 0; // a bot's door closes behind it
        if (d.target === 0 && d.k > 0.02 && this._shove(d)) this._open(d, 1); // never closes on anyone in the swing (v60: only them — the one pressing E beside it may close it)
      }
      this._swing(d, clamp(d.k + Math.sign(d.target - d.k) * h * 3, 0, 1));
    }
  }
  render() {}
  netState() { return this.doors.flatMap((d) => [+d.k.toFixed(3), d.target, d.dir]); }
  applyNet(s) {
    if (!Array.isArray(s) || s.length !== this.doors.length * 3) return;
    this.doors.forEach((d, i) => { d.dir = s[i * 3 + 2] < 0 ? -1 : 1; d.target = s[i * 3 + 1] ? 1 : 0; this._swing(d, clamp(Number(s[i * 3]) || 0, 0, 1)); });
  }
}

// Baked navigation (tools/bake-apex-nav.mjs): u32 nodes, u32 links, Float32 x y z per node, then per link Int32 from, to, kind
// and Float32 cost — for NavGraph._baked.
function apexNav(buf) {
  const v = new DataView(buf), n = v.getUint32(0, true), m = v.getUint32(4, true), pos = new Float32Array(buf.slice(8, 8 + n * 12));
  const from = new Int32Array(m), to = new Int32Array(m), kind = new Int32Array(m), cost = new Float32Array(m);
  for (let i = 0, o = 8 + n * 12; i < m; i++, o += 16) { from[i] = v.getInt32(o, true); to[i] = v.getInt32(o + 4, true); kind[i] = v.getInt32(o + 8, true); cost[i] = v.getFloat32(o + 12, true); }
  return { pos, from, to, kind, cost };
}
// Baked spawn groups (west / east, out of each other's sight) and forward groups the match picks when they are safe.
function apexBakedSpawns(S, team, game) {
  const v = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  game.fwdSpawns = game.fwdSpawns || {};
  game.fwdSpawns[team] = S.forward[team].map((f) => ({ pts: f.pts.map(v), c: v(f.pts[0]), yaw: f.yaw }));
  return { pts: S.spawns[team].pts.map(v), yaw: S.spawns[team].yaw };
}

export { ApexDoors, apexBakedSpawns, apexNav };

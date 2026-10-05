/* =====================================================================
   v46 SKY CITY (天空之城 · SF2 "Skywalker" 스카이워커 / GNN 天空之門, sniper-mode map) — two white-brick tower tops
   floating over a sea of cloud, split by a deep chasm. Alpha holds the west roof, Bravo the east roof; a clock tower
   (showing the real time) closes the north end. No railings anywhere: whoever steps off the edge falls to his death.
   Mechanisms (press E at a GO box):
   · Drawbridge — one bascule leaf on each roof, hinged at the chasm edge next to its winch drum. Raised = the roofs are
     cut off; lowered = a 4 m walkway across the middle. A box beside each winch toggles both leaves.
   · Two trams on cables along the north and south edges (point-symmetric: the north car starts east, the south car
     west). Each line has three GO boxes — inside the car, at the west station and at the east station; a press sends
     the car to the other side (or calls it over). The car is an openwork box taller than a man: only its doorway, on
     the platform side, can be shot through, and stepping out of it over the chasm is a fall. Its roof cannot be stood on.
     While a car runs, the flat gears around the map (cable pulleys) turn.
   Layout (metres): roofs x ∈ ±[7, 27], z ∈ [−13, 13], floor y = 0; chasm 14 m; bridge z ∈ [−5, −1].
   ===================================================================== */
const SKY = {
  X0: 7, X1: 27, Z0: -13, Z1: 13, KILL_Y: -14,
  BR: { z0: -5, z1: -1, len: 7, up: 1.08, time: 4.0 },              // leaf width (z), length (x), raised angle (rad), travel time
  TRAM: { len: 7, w: 3, h: 2.9, dock: 20, speed: 4.6, door: 1.5 }, // car length (x) / width (z), dock centre |x|
  LINES: [{ id: 'N', z: -14.5, side: 1, start: 1 }, { id: 'S', z: 14.5, side: -1, start: 0 }], // side: +1 = doorway faces +z (platform south of the car)
};

// ---------------------------------------------------------------------------------------------------------------- build
function buildSky(b) {
  const S = SKY, solid = !b.dry, vis = (m) => m;
  // the two roofs (walkable slab) and the towers dropping into the clouds (collision only near the top; the rest is visual)
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -S.X1 : S.X0, x1 = sx < 0 ? -S.X0 : S.X1;
    b.box(x0, -2, S.Z0, x1, 0, S.Z1, vis('pavers'), { radar: false, surface: 'concrete' });
    b.box(x0, -40, S.Z0, x1, -2, S.Z1, vis('plasterWhite'), { radar: false, physics: false });
    b.box(x0 - 0.12, -0.35, S.Z0 - 0.12, x1 + 0.12, -0.02, S.Z1 + 0.12, vis('brick'), { collide: false, radar: false }); // red cornice band
  }
  // bridge winch (drum on its frame), the GO box next to it, the brick guard hut
  for (const sx of [-1, 1]) {
    const hx = sx * S.X0;                                             // hinge line (chasm edge)
    b.box(hx + sx * 1.0, 0, -8.6, hx + sx * 4.2, 2.7, -5.6, null, { material: 'metal', radar: 'crate' }); // winch drum + gears
    b.box(hx + sx * 1.8, 0, 0.6, hx + sx * 5.8, 3.3, 4.6, vis('brick'), { material: 'concrete', radar: 'solid' }); // guard hut (solid block)
    b.box(hx + sx * 1.75, 3.3, 0.5, hx + sx * 5.85, 3.55, 4.7, vis('plasterWhite'), { material: 'concrete', radar: false });
  }
  // crates and cover (point-symmetric: (x, z) on the west ↔ (−x, −z) on the east)
  const COVER = [
    // [x, z, w(x), d(z), h]
    [-25.0, -8.6, 1.4, 2.4, 1.6], [-21.5, -11.4, 2.8, 1.2, 1.2], [-17.2, -10.6, 1.3, 1.3, 1.3],
    [-24.6, 7.4, 1.4, 3.0, 1.6], [-14.0, 9.6, 1.3, 2.6, 1.3], [-11.2, 6.6, 1.2, 1.2, 1.2],
    [-12.4, -10.8, 2.6, 1.2, 1.4], [-18.6, 2.4, 1.2, 1.2, 1.3], [-16.0, -3.6, 2.4, 1.2, 1.2],
  ];
  for (const sx of [1, -1]) for (const [x, z, w, d, h] of COVER) {
    const cx = x * sx, cz = z * sx;
    b.box(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2, vis('wood'), { material: 'wood', penetrable: true, radar: 'crate', tile: 1.2 });
  }
  // street lamps at the roof corners (thin posts)
  for (const sx of [-1, 1]) for (const [x, z] of [[S.X1 - 0.6, S.Z0 + 0.6], [S.X1 - 0.6, S.Z1 - 0.6], [S.X0 + 0.6, S.Z1 - 0.6]]) b.box(sx * x - 0.1, 0, z * sx - 0.1, sx * x + 0.1, 2.6, z * sx + 0.1, vis('darkSteel'), { material: 'metal', radar: false });
  // clock tower to the north (out of reach; blocks bullets and grenades)
  b.box(-13, -40, -46, 13, 34, -24, vis('plasterWhite'), { radar: false, physics: true });
  // spawn zones: Alpha on the west roof facing east, Bravo on the east roof facing west
  b.spawnZone('alpha', -26, -6, -21, 6, -Math.PI / 2); b.spawnZone('bravo', 21, -6, 26, 6, Math.PI / 2);
  // patrol points (the bots also walk past the GO boxes — that is how they work the bridge)
  for (const [x, z] of [[-16, 0], [16, 0], [-10, -0.4], [10, 0.4], [-20, -11], [20, 11], [-20, 11], [20, -11], [0, -3]]) b.waypoint(x, z, 0);
  b.navRegion(-S.X1, S.Z0, S.X1, S.Z1, 0, 1.0);
  if (solid) b.mechs.push(new SkyMechanisms(b));
  else for (const sx of [-1, 1]) b.radar.push({ x0: sx < 0 ? -S.X0 : 0, z0: S.BR.z0, x1: sx < 0 ? 0 : S.X0, z1: S.BR.z1, kind: 'catwalk', top: 0 });
}

// ---------------------------------------------------------------------------------------------------------- mechanisms
// Host-authoritative: the host runs every press and broadcasts the state ~10×/s ('mech'); a client runs the same motion
// locally from that state (its own soldier rides the car and walks the bridge with no lag) and snaps when it drifts.
class SkyMechanisms {
  constructor(b) {
    this.b = b; this.m = b.game; this.col = b.col; this.S = SKY; this.time = 0;
    const S = SKY, T = S.TRAM, BR = S.BR;
    // -------- drawbridge: leaf colliders (walk + shots) while down; three slanted shot-blockers while raised
    this.bridge = { k: 0, target: 0, leaves: [] };                     // k: 0 = raised, 1 = lowered
    for (const sx of [-1, 1]) {
      const hx = sx * S.X0, tipX = 0;
      const walk = this.col.addBox(new THREE.Vector3(Math.min(hx, tipX), -0.32, BR.z0), new THREE.Vector3(Math.max(hx, tipX), 0, BR.z1), { material: 'metal', surface: 'metal' });
      const steps = [];
      for (let i = 0; i < 3; i++) {
        const a = BR.len * (i / 3), c = BR.len * ((i + 1) / 3), xa = hx - sx * a * Math.cos(BR.up), xc = hx - sx * c * Math.cos(BR.up);
        steps.push(this.col.addBox(new THREE.Vector3(Math.min(xa, xc), a * Math.sin(BR.up), BR.z0), new THREE.Vector3(Math.max(xa, xc), c * Math.sin(BR.up) + 0.3, BR.z1), { material: 'metal', blocksMove: false }));
      }
      this.bridge.leaves.push({ sx, hx, walk, steps, mesh: null });
    }
    // -------- trams
    this.trams = S.LINES.map((L) => {
      const t = { L, p: L.start, target: L.start, x: 0, prevX: 0, boxes: [], mesh: null };
      t.x = t.prevX = this._tramX(t.p);
      const hw = T.len / 2, z0 = L.z - T.w / 2, z1 = L.z + T.w / 2, inner = L.side > 0 ? z1 : z0, outer = L.side > 0 ? z0 : z1;
      const add = (x0, y0, za, x1, y1, zb, o = {}) => t.boxes.push(this.col.addBox(new THREE.Vector3(t.x + x0, y0, Math.min(za, zb)), new THREE.Vector3(t.x + x1, y1, Math.max(za, zb)), Object.assign({ material: 'metal', surface: 'wood' }, o)));
      add(-hw, -0.3, z0, hw, 0, z1);                                    // floor
      add(-hw, T.h, z0, hw, T.h + 1.6, z1, { blocksShot: true });       // roof (tall collider: nothing can stand on it)
      add(-hw, 0, outer, hw, T.h, outer - L.side * 0.12);               // back wall (cliff side)
      add(-hw, 0, z0, -hw + 0.12, T.h, z1); add(hw - 0.12, 0, z0, hw, T.h, z1); // end walls
      add(-hw, 0, inner, -T.door / 2, T.h, inner + L.side * 0.12 * -1); add(T.door / 2, 0, inner, hw, T.h, inner - L.side * 0.12); // platform side with the doorway
      return t;
    });
    // GO boxes: [kind, ref, x, z] (the car's own box rides with it)
    this.controls = [];
    for (const sx of [-1, 1]) this.controls.push({ kind: 'bridge', x: sx * (S.X0 + 1.4), z: -0.2, y: 0 });
    for (const t of this.trams) {
      const zSt = t.L.z + t.L.side * (T.w / 2 + 1.0);
      for (const sx of [-1, 1]) this.controls.push({ kind: 'tram', t, x: sx * (T.dock + T.len / 2 + 0.9), z: zSt, y: 0, station: sx });
      this.controls.push({ kind: 'tram', t, inCar: true, dx: T.len / 2 - 0.8, z: t.L.z - t.L.side * 0.7, y: 0 });
    }
    for (const c of this.controls) if (!c.inCar) this.col.addBox(new THREE.Vector3(c.x - 0.18, 0, c.z - 0.18), new THREE.Vector3(c.x + 0.18, 1.45, c.z + 0.18), { material: 'metal', blocksShot: false });
    for (const L of this.bridge.leaves) this.col.setSolid(L.walk, true, true); // the nav graph is sampled with the bridge down (initNav)
    this.gearSpin = 0; this.gearV = 0;
    this._visuals(b);
  }
  _tramX(p) { const d = this.S.TRAM.dock; return lerp(-d, d, p); }
  ctrlPos(c) { return c.inCar ? { x: c.t.x + c.dx * (c.t.L.side > 0 ? 1 : -1), z: c.z } : c; }

  // ---- simulation (fixed step, after every soldier has moved)
  tick(h) {
    const S = this.S, br = this.bridge;
    this.time += h;
    if (br.k !== br.target) {
      const was = br.k; br.k = br.target > br.k ? Math.min(br.target, br.k + h / S.BR.time) : Math.max(br.target, br.k - h / S.BR.time);
      if ((was === 1) !== (br.k === 1) || (br.k === br.target)) this._applyBridge(false);
    }
    let moving = 0;
    for (const t of this.trams) {
      t.prevX = t.x;
      if (t.p !== t.target) {
        const step = S.TRAM.speed * h / (2 * S.TRAM.dock), ease = Math.min(1, 0.25 + 3 * Math.min(t.p, 1 - t.p, 0.25)); // gentle start / stop
        t.p = t.target > t.p ? Math.min(t.target, t.p + step * ease) : Math.max(t.target, t.p - step * ease);
        const nx = this._tramX(t.p), dx = nx - t.x;
        if (dx) { this._carry(t, dx); for (const bx of t.boxes) this.col.moveBox(bx, dx, 0, 0); t.x = nx; moving = 1; }
        if (t.p === t.target) this.m.audio.mech && this.m.audio.mech('queue', new THREE.Vector3(t.x, 1, t.L.z));
      }
    }
    this.gearV = moving;
    // the host's bots work the bridge when they pass its GO box
    if (!this.m.isClient) for (const bot of this.m.bots) {
      if (!bot.alive || br.k !== br.target || Math.random() > 0.004) continue;
      for (const c of this.controls) if (c.kind === 'bridge' && Math.hypot(bot.motor.pos.x - c.x, bot.motor.pos.z - c.z) < 2.2) { this.press(c, bot); break; }
    }
  }
  // everyone standing in (or jumping inside) the car moves with it
  _carry(t, dx) {
    const T = this.S.TRAM, hw = T.len / 2;
    for (const c of this.m.combatants) {
      if (!c.alive) continue;
      const p = c.motor.pos;
      if (p.x > t.x - hw && p.x < t.x + hw && Math.abs(p.z - t.L.z) < T.w / 2 && p.y > -0.4 && p.y < T.h) p.x += dx;
    }
  }
  _applyBridge(init) {
    const br = this.bridge, down = br.k >= 1, up = br.k <= 0;
    for (const L of br.leaves) {
      this.col.setSolid(L.walk, down, down);
      for (const s of L.steps) this.col.setSolid(s, false, up);
    }
    // bots: the nodes over the chasm only exist while the bridge is down
    const nav = this.m.nav;
    if (nav && !init) for (const n of this.navBridge || []) n.ok = down;
  }
  initNav(nav) { // called once the nav graph exists (it is built with the bridge DOWN so both roofs stay one component)
    this.navBridge = nav.nodes.filter((n) => Math.abs(n.p.x) < this.S.X0 - 0.1);
    for (const n of nav.nodes) if (Math.abs(n.p.z) > this.S.Z1 - 0.3) n.ok = false; // never path into a tram bay (the car leaves)
    this._applyBridge(true); for (const n of this.navBridge) n.ok = this.bridge.k >= 1;
  }

  // ---- interaction
  nearest(c, reach = 1.7) {
    const p = c.motor.pos; let best = null, bd = reach;
    for (const k of this.controls) {
      const q = this.ctrlPos(k), d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < bd && Math.abs(p.y - (k.y || 0)) < 1.5) { bd = d; best = k; }
    }
    return best;
  }
  prompt(c) {
    const k = this.nearest(c); if (!k) return '';
    if (k.kind === 'bridge') { const br = this.bridge; return br.k !== br.target ? '吊橋運轉中…' : br.k >= 1 ? '按 [E] 升起吊橋' : '按 [E] 放下吊橋'; }
    const t = k.t; if (t.p !== t.target) return '纜車運行中…';
    if (k.inCar) return '按 [E] 纜車出發';
    const here = (t.p === 0 ? -1 : 1) === k.station; return here ? '按 [E] 纜車出發（送到對岸）' : '按 [E] 呼叫纜車';
  }
  // E pressed by a soldier (host) — returns true when a GO box took the press
  interact(c) {
    const k = this.nearest(c); if (!k) return false;
    this.press(k, c); return true;
  }
  press(k, who) {
    if (k.kind === 'bridge') { const br = this.bridge; if (br.k !== br.target) return; br.target = br.k >= 1 ? 0 : 1; this._applyBridge(false); this._sound(k); return; }
    const t = k.t; if (t.p !== t.target) return; t.target = t.p >= 1 ? 0 : 1; this._sound(this.ctrlPos(k));
  }
  _sound(at) { if (this.m.audio.mech) this.m.audio.mech('queue', new THREE.Vector3(at.x, 1, at.z)); }

  // ---- network
  netState() { return [+this.bridge.k.toFixed(3), this.bridge.target, ...this.trams.flatMap((t) => [+t.p.toFixed(4), t.target])]; }
  applyNet(s) {
    if (!Array.isArray(s) || s.length < 2 + this.trams.length * 2) return;
    const br = this.bridge; br.target = s[1] ? 1 : 0; if (Math.abs(br.k - s[0]) > 0.08) { br.k = clamp(+s[0] || 0, 0, 1); this._applyBridge(false); }
    this.trams.forEach((t, i) => {
      t.target = s[3 + i * 2] ? 1 : 0; const p = clamp(+s[2 + i * 2] || 0, 0, 1);
      if (Math.abs(t.p - p) > 0.03) { const dx = this._tramX(p) - t.x; t.p = p; this._carry(t, dx); for (const bx of t.boxes) this.col.moveBox(bx, dx, 0, 0); t.x = t.prevX = this._tramX(p); }
    });
  }

  // ---- visuals (fallback boxes; the Blender GLB replaces them when it is present)
  _visuals(b) {
    const S = this.S, T = S.TRAM, BR = S.BR, lib = b.lib, sc = b.scene, M = (n) => lib.get(n);
    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; return g; };
    const G = this.m.def._glb && this.m.def._glb.scene;
    const pick = (name) => { if (!G) return null; const o = G.getObjectByName(name); if (o) o.parent.remove(o); return o; };
    for (const L of this.bridge.leaves) {
      const pivot = new THREE.Group(); pivot.position.set(L.hx, 0, (BR.z0 + BR.z1) / 2); sc.add(pivot);
      const glb = pick(L.sx < 0 ? 'BRIDGE_W' : 'BRIDGE_E'), leaf = glb || box(BR.len, 0.3, BR.z1 - BR.z0, M(L.sx < 0 ? 'olive' : 'steel'), -L.sx * BR.len / 2, -0.15, 0);
      if (glb) leaf.position.sub(pivot.position); // GLB nodes are placed in world space (lowered); hang them on the hinge
      pivot.add(leaf); L.mesh = pivot;
    }
    for (const t of this.trams) {
      const g = pick('TRAM_' + t.L.id);
      if (g) { g.position.x -= this._tramX(t.L.start); sc.add(g); t.mesh = g; t.base = g.position.clone(); }
      else {
        const grp = new THREE.Group(), hw = T.len / 2, inner = t.L.side * T.w / 2;
        grp.add(box(T.len, 0.3, T.w, M('darkWood'), 0, -0.15, 0), box(T.len + 0.3, 0.25, T.w + 0.3, M('olive'), 0, T.h + 0.12, 0));
        grp.add(box(T.len, T.h, 0.12, M('darkWood'), 0, T.h / 2, -inner), box(0.12, T.h, T.w, M('darkWood'), -hw, T.h / 2, 0), box(0.12, T.h, T.w, M('darkWood'), hw, T.h / 2, 0));
        const seg = hw - T.door / 2; grp.add(box(seg, T.h, 0.12, M('darkWood'), -hw + seg / 2, T.h / 2, inner), box(seg, T.h, 0.12, M('darkWood'), hw - seg / 2, T.h / 2, inner));
        grp.add(box(0.5, 0.5, 0.6, M('darkSteel'), 0, T.h + 0.55, 0));
        grp.position.set(t.x, 0, t.L.z); sc.add(grp); t.mesh = grp; t.base = new THREE.Vector3(0, 0, t.L.z);
      }
    }
    // cables and the flat pulley gears at the four corners of each line
    this.gears = [];
    for (const t of this.trams) {
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2 * (S.X1 + 5), 6), M('darkSteel')); cab.rotation.z = Math.PI / 2; cab.position.set(0, T.h + 1.1, t.L.z); sc.add(cab);
      for (const sx of [-1, 1]) {
        const gx = sx * (S.X1 + 4.5), glb = pick(`GEAR_${t.L.id}${sx < 0 ? 'W' : 'E'}`), gear = glb || this._gearMesh(M('bronze'), 2.1);
        if (!glb) gear.position.set(gx, -0.2, t.L.z); sc.add(gear);
        this.gears.push({ o: gear, dir: sx * (t.L.side) });
        if (!G) sc.add(box(0.18, T.h + 1.4, 0.18, M('darkSteel'), gx, (T.h + 1.4) / 2 - 0.2, t.L.z));
      }
    }
    for (const k of this.controls) {
      const post = new THREE.Group(); post.add(box(0.08, 1.1, 0.08, M('darkSteel'), 0, 0.55, 0), box(0.36, 0.5, 0.26, M('bronze'), 0, 1.3, 0));
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: 0x40ff60 })); lamp.position.set(0, 1.13, 0.14); post.add(lamp);
      k.mesh = post; k.lamp = lamp; sc.add(post);
      if (k.inCar) { k.t.mesh.add(post); post.position.set(k.dx * (k.t.L.side > 0 ? 1 : -1), 0, (k.z - k.t.L.z)); post.rotation.y = k.t.L.side > 0 ? 0 : Math.PI; }
      else { post.position.set(k.x, 0, k.z); post.rotation.y = k.kind === 'bridge' ? (k.x < 0 ? -Math.PI / 2 : Math.PI / 2) : (k.z > 0 ? 0 : Math.PI); }
    }
    this.clock = this._clock(b);
    this.render(0, 1);
  }
  _gearMesh(mat, r) {
    const shape = new THREE.Shape(), teeth = 22;
    for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.88; const a0 = a - Math.PI / (teeth * 2) * 0.55, a1 = a + Math.PI / (teeth * 2) * 0.55; if (i === 0) shape.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); else shape.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr); shape.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr); }
    const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true); shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
  }
  _clock(b) {
    const G = this.m.def._glb && this.m.def._glb.scene, sc = b.scene;
    let hour = G && G.getObjectByName('CLOCK_H'), min = G && G.getObjectByName('CLOCK_M');
    if (!hour) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.8 })); face.position.set(0, 22, -23.95); sc.add(face);
      const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, 0.1); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.4 })); m.position.set(0, 22, -23.85); sc.add(m); return m; };
      hour = hand(2.6, 0.32); min = hand(4.0, 0.2);
    }
    return { hour, min };
  }
  // per rendered frame: interpolated car positions, leaf angles, gear spin, real-time clock
  render(dt, alpha) {
    const BR = this.S.BR;
    for (const L of this.bridge.leaves) if (L.mesh) L.mesh.rotation.z = -L.sx * BR.up * (1 - this.bridge.k);
    for (const t of this.trams) if (t.mesh) t.mesh.position.x = (t.base ? t.base.x : 0) + lerp(t.prevX, t.x, alpha);
    this.gearSpin += dt * this.gearV * 1.4;
    for (const g of this.gears) g.o.rotation.y = this.gearSpin * g.dir;
    for (const k of this.controls) if (k.lamp) { const busy = k.kind === 'bridge' ? this.bridge.k !== this.bridge.target : k.t.p !== k.t.target; k.lamp.material.color.setHex(busy ? 0xff3030 : 0x40ff60); }
    if (this.clock && this.clock.hour) { const d = new Date(), mm = d.getMinutes() + d.getSeconds() / 60, hh = (d.getHours() % 12) + mm / 60; this.clock.min.rotation.z = -mm / 60 * Math.PI * 2; this.clock.hour.rotation.z = -hh / 12 * Math.PI * 2; }
  }
}

MAPS.push({
  id: 'skycity', name: '天空之城', en: 'SKY CITY', desc: '雲端鐘樓 · 可升降吊橋 · 南北兩條纜車 · 四周無護欄 · 54×28', slogan: 'SKYWALKER · 別往下看',
  look: { desat: 0.06, contrast: 1.04, pivot: 0.45, highlights: 1.06 },
  bounds: { minX: -36, maxX: 36, minZ: -24, maxZ: 22 },
  indoor: false, navLevels: [0], navStep: 1.5, viewMult: 1.2, radarRange: 40, killY: SKY.KILL_Y,
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.75, sky: { turbidity: 3, rayleigh: 1.2, elevation: 40, azimuth: 200 },
  sun: { pos: [30, 55, 25], color: 0xfff4e6, intensity: 2.9, auto: true }, hemi: [0xeef2ff, 0xd8c8e0, 1.05], exposure: 0.95,
  fog: { color: 0xe6dcef, near: 90, far: 420 }, acoustics: 'outdoor', ambience: 'hill', shadowFollow: 0,
  shot: { pos: [0, 18, 38], target: [0, 0, -4] },
  objectives: { dom: [[-17, 0, 6], [0, 0, -3], [17, 0, -6]], relic: [19, 0, 5], domRadius: 3.2 },
  async preload() { if (this._glb === undefined) this._glb = null; },
  build(b) { buildSky(b); },
});

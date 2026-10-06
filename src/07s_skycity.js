/* =====================================================================
   v46 SKY CITY (天空之城 · SF2 "Skywalker" 스카이워커 / GNN 天空之門, sniper-mode map) — two white-brick tower tops
   floating over a sea of cloud, split by a deep chasm. Alpha holds the west roof, Bravo the east roof; a clock tower
   (showing the real time) closes the south end of the chasm. No railings anywhere: whoever steps off falls to his death.
   Layout = the player's Blender block-out (maps/skycity/blockout, Blender X = game z, Blender −Y = game x). The two roofs
   are MIRROR images (x → −x); the two tram lines are point images of each other.
   Mechanisms (press E at a GO box):
   · Drawbridge — one bascule leaf on each roof, hinged at the chasm edge beside its winch. Raised = the roofs are cut off;
     lowered = a 2.7 m walkway across the middle. The box between the leaf and the hut toggles both leaves.
   · Two trams on cables along the north (−z) and south (+z) edges. The north car parks at Alpha, the south car at Bravo;
     each line has three GO boxes — inside the car and one at each roof. A press sends the car to the other roof (or calls
     it over). Lower walls are solid wood (about 2 m), above them the arched windows are open: bullets and grenades go
     through. The doorway faces the roof; stepping out of it over the chasm is a fall; the roof of the car is out of reach.
     On the Alpha roof the south car stops behind the "straw" crate tunnel. While a car runs, the corner pulley gears turn.
   Metres: roofs x ∈ ±[11, 26.5], z ∈ [−12.75, 12.85], floor y = 0; chasm 22 m; bridge z ∈ [−0.9, 1.8].
   ===================================================================== */
const SKY = {
  X0: 11, X1: 26.5, Z0: -12.75, Z1: 12.85, KILL_Y: -14,
  BR: { z0: -0.9, z1: 1.8, len: 11, up: 1.08, time: 4.0 },          // leaf width (z), length (x, hinge → middle), raised angle, travel time
  TRAM: { len: 10.07, w: 5.4, h: 5.09, sill: 2.0, door: 2.0, speed: 5.2, cable: 6.29 },
  // x: car centre parked at Alpha (p = 0) / at Bravo (p = 1); side: +1 = the doorway faces +z; door: doorway offset along the car
  // (the doorway is in the middle; the south car parks flush with the outer edge, its doorway right at the straw tunnel)
  LINES: [{ id: 'N', z: -15.71, side: 1, x: [-15.615, 19.385], start: 0, door: 0 },
          { id: 'S', z: 15.71, side: -1, x: [-21.465, 21.465], start: 1, door: 0 }],
  PULLEY: { x: 29.2, r: 2.5 },
  GEAR: { z: -1.08, r: 5.2 },                                         // the big half gear on the outer edge of each roof
  // Alpha-side solids (x < 0); Bravo is the mirror. [x0, x1, z0, z1, h]
  HUT: [-16.37, -12.33, -7.18, -2.69, 3.2],
  // the hut is hollow: a doorless entrance and an open window on the north wall, an open window on the bridge side (shoot through)
  HUT_OPEN: [['-z', -15.75, -14.55, 0, 2.2], ['-z', -13.95, -12.95, 1.0, 2.1], ['+z', -15.85, -14.45, 1.0, 2.1]], HUT_T: 0.25,
  WINCH: [-13.5, -9.99, 2.06, 8.34, 2.7],
  CRATES: [
    [-20.86, -19.60, -12.29, -6.57, 3.0],                             // outer stack by the north tram stop (two crates)
    [-12.54, -11.64, -11.94, -9.50, 3.0], [-12.54, -11.64, -9.50, -7.00, 1.5], // chasm-side L: a walkable edge on its north end, flush against the hut
    [-17.54, -16.64, 7.18, 9.87, 1.5], [-17.54, -16.64, 9.87, 12.56, 3.0], [-20.41, -17.54, 11.66, 12.56, 3.0], // the L on the south side
  ],
  STRAW: [-22.74, -20.41, 7.18, 12.56, 3.0, 0.25, 2.1],               // crate tunnel along z: walls 0.25, hole 2.1 m tall
  GO: { bridge: [-13.33, -2.2], N: [-18.9, -12.33], S: [-23.4, 12.6] },
  SPAWN: [-25.6, -20.4, -0.9, 1.8],
  TOWER: { z: 19.21, x: 16.73, clockY: 9.5 },
};
const skyBox = (x0, x1, sx) => (sx < 0 ? [x0, x1] : [-x1, -x0]);       // an Alpha x-range on this roof

// ---------------------------------------------------------------------------------------------------------------- build
function buildSky(b) {
  const S = SKY, solid = !b.dry, glb = !b.dry && b.def._glb, vis = (m) => (glb ? null : m);
  if (glb) glb.scene.traverse((o) => { // Blender visuals: 'sky:<name>' placeholders → the game's materials
    if (!o.isMesh) return;
    const nm = ((o.material && o.material.name) || '').replace(/^sky:/, '');
    o.material = skyMat(b, nm); if (nm === 'btnGreen' || nm === 'btnRed') o.userData.btn = nm;
    if (o.material.transparent) { o.renderOrder = 2; o.userData.noAO = true; }
    o.castShadow = !/clockFace|glass|inlay|arrow/.test(nm); o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix();
  });
  for (const sx of [-1, 1]) {
    const [x0, x1] = skyBox(-S.X1, -S.X0, sx), B = (a, c, z0, z1, y0, y1, m, o) => { const [p, q] = skyBox(a, c, sx); b.box(p, y0, z0, q, y1, z1, m, o); };
    // the roof (walkable slab) and the tower dropping into the clouds (collision only near the top; the rest is visual)
    b.box(x0, -2, S.Z0, x1, 0, S.Z1, vis('pavers'), { radar: false, surface: 'concrete' });
    b.box(x0, -40, S.Z0, x1, -2, S.Z1, vis('plasterWhite'), { radar: false, physics: false });
    // the guard hut (hollow, walk in through the doorway; its windows are open) and the bridge winch (it overhangs the chasm a little)
    const H = S.HUT, W = S.WINCH, ht = S.HUT_T, wall = { material: 'concrete', radar: 'wall' };
    for (const [face, zw0, zw1] of [['-z', H[2], H[2] + ht], ['+z', H[3] - ht, H[3]]]) {
      let u = H[0];
      for (const [, a, c, y0, y1] of S.HUT_OPEN.filter((o) => o[0] === face).sort((p, q) => p[1] - q[1])) {
        B(u, a, zw0, zw1, 0, H[4], vis('brick'), wall); if (y0 > 0) B(a, c, zw0, zw1, 0, y0, vis('brick'), wall); B(a, c, zw0, zw1, y1, H[4], vis('brick'), wall); u = c;
      }
      B(u, H[1], zw0, zw1, 0, H[4], vis('brick'), wall);
    }
    B(H[0], H[0] + ht, H[2], H[3], 0, H[4], vis('brick'), wall); B(H[1] - ht, H[1], H[2], H[3], 0, H[4], vis('brick'), wall);
    B(H[0], H[1], H[2], H[3], H[4] - 0.02, H[4] + 0.32, vis('brick'), { material: 'concrete', radar: false });
    B(W[0], W[1], W[2], W[3], 0, W[4], null, { material: 'metal', radar: 'crate' });
    // crate stacks (one crate 1.5 m: standing shows the head from the chin up, crouching hides, too high to jump on; two = 3 m)
    for (const [a, c, z0, z1, h] of S.CRATES) B(a, c, z0, z1, 0, h, vis('wood'), { material: 'wood', penetrable: true, radar: h > 2 ? 'container' : 'crate', tile: 1.5 });
    // the "straw": a long crate with a walk-through hole, leading to where the south car stops on the Alpha roof
    const [a, c, z0, z1, h, t, hole] = S.STRAW, wo = { material: 'wood', penetrable: true, radar: 'container', tile: 1.5 };
    B(a, a + t, z0, z1, 0, h, vis('wood'), wo); B(c - t, c, z0, z1, 0, h, vis('wood'), wo); B(a + t, c - t, z0, z1, hole, h, vis('wood'), Object.assign({}, wo, { radar: false }));
    // the big half gear on the outer edge (walkable, half of it over the drop) and the corner pulley gears (walkable)
    const G = S.GEAR;
    for (let i = 0; i < 6; i++) {
      const u0 = G.r * i / 6, u1 = G.r * (i + 1) / 6, hz = Math.sqrt(Math.max(0, G.r * G.r - u1 * u1)) + 0.1;
      B(-S.X1 - u1, -S.X1 - u0, G.z - hz, G.z + hz, -0.4, -0.02, null, { material: 'metal', surface: 'metal', radar: 'catwalk' });
    }
    for (const L of S.LINES) { const px = sx * S.PULLEY.x, r = S.PULLEY.r * 0.8; b.box(px - r, -0.35, L.z - r, px + r, -0.11, L.z + r, null, { material: 'metal', surface: 'metal', radar: 'catwalk' }); }
  }
  // clock tower across the south end of the chasm (out of reach; blocks bullets and grenades)
  b.box(-S.TOWER.x, -40, S.TOWER.z, S.TOWER.x, 30, S.TOWER.z + 20, vis('plasterWhite'), { radar: false, physics: true });
  // spawn zones: Alpha on the west roof facing east, Bravo on the east roof facing west (behind the bridge: the raised leaves screen them)
  const [s0, s1, sz0, sz1] = S.SPAWN;
  b.spawnZone('alpha', s0, sz0, s1, sz1, -Math.PI / 2); b.spawnZone('bravo', -s1, sz0, -s0, sz1, Math.PI / 2);
  // patrol points (the bots also walk past the GO boxes — that is how they work the bridge)
  for (const [x, z] of [[-15, 0.4], [-19, -4], [-24, -8], [-14.5, 4], [-23, 5], [-19, 9.5], [-14, -10], [-25, 10]]) { b.waypoint(x, z, 0); b.waypoint(-x, z, 0); }
  b.waypoint(0, 0.45, 0);
  b.navRegion(-S.X1, S.Z0, S.X1, S.Z1, 0, 1.0);
  if (solid) { b.mechs.push(new SkyMechanisms(b)); skyAtmosphere(b); }
  if (glb) { glb.scene.updateMatrixWorld(true); b.scene.add(glb.scene); }
  else for (const sx of [-1, 1]) b.radar.push({ x0: sx < 0 ? -S.X0 : 0, z0: S.BR.z0, x1: sx < 0 ? 0 : S.X0, z1: S.BR.z1, kind: 'catwalk', top: 0 });
}

// ---------------------------------------------------------------------------------------------------------- mechanisms
// Host-authoritative: the host runs every press and broadcasts the state ~10×/s ('mech'); a client runs the same motion
// locally from that state (its own soldier rides the car and walks the bridge with no lag) and snaps when it drifts.
class SkyMechanisms {
  constructor(b) {
    this.b = b; this.m = b.game; this.col = b.col; this.S = SKY; this.time = 0;
    const S = SKY, T = S.TRAM, BR = S.BR;
    // -------- drawbridge: a flat walk box while down; while raised or turning, ten boxes follow the leaf (solid: you hit it, you can't run through it)
    this.bridge = { k: 0, target: 0, leaves: [] };                     // k: 0 = raised, 1 = lowered
    for (const sx of [-1, 1]) {
      const hx = sx * S.X0, tipX = 0;
      const walk = this.col.addBox(new THREE.Vector3(Math.min(hx, tipX), -0.32, BR.z0), new THREE.Vector3(Math.max(hx, tipX), 0, BR.z1), { material: 'metal', surface: 'metal' });
      const segs = [];
      for (let i = 0; i < 10; i++) segs.push(this.col.addBox(new THREE.Vector3(hx, 0, BR.z0), new THREE.Vector3(hx + 0.1, 0.1, BR.z1), { material: 'metal', surface: 'metal', blocksMove: false, blocksShot: false }));
      this.bridge.leaves.push({ sx, hx, walk, segs, mesh: null });
    }
    // -------- trams: solid floor, solid lower walls up to the sill (bullets stop), open arched windows above (bullets and
    // grenades pass), a roof whose tall collider nobody can stand on, and a doorway (offset along the car) facing the roof
    this.trams = S.LINES.map((L) => {
      const t = { L, p: L.start, target: L.start, x: 0, prevX: 0, boxes: [], mesh: null };
      t.x = t.prevX = this._tramX(t, t.p);
      const hw = T.len / 2, z0 = L.z - T.w / 2, z1 = L.z + T.w / 2, inner = L.side > 0 ? z1 : z0, outer = L.side > 0 ? z0 : z1, th = 0.14, d0 = L.door - T.door / 2, d1 = L.door + T.door / 2;
      const add = (x0, y0, za, x1, y1, zb, o = {}) => t.boxes.push(this.col.addBox(new THREE.Vector3(t.x + x0, y0, Math.min(za, zb)), new THREE.Vector3(t.x + x1, y1, Math.max(za, zb)), Object.assign({ material: 'wood', surface: 'wood', penetrable: true }, o)));
      add(-hw, -0.3, z0, hw, 0, z1, { material: 'metal', penetrable: false });  // floor
      add(-hw, T.h - 0.5, z0, hw, T.h + 1.6, z1, { material: 'metal', penetrable: false }); // roof (tall collider: nothing can stand on it)
      add(-hw, 0, outer, hw, T.sill, outer - L.side * th);             // back wall (cliff side)
      add(-hw, 0, z0, -hw + th, T.sill, z1); add(hw - th, 0, z0, hw, T.sill, z1); // end walls
      add(-hw, 0, inner, d0, T.sill, inner - L.side * th); add(d1, 0, inner, hw, T.sill, inner - L.side * th); // platform side, doorway between
      add(-hw, T.sill, outer, hw, T.h - 0.5, outer - L.side * th, { blocksShot: false }); // window openings: you can't climb out, shots fly through
      add(-hw, T.sill, z0, -hw + th, T.h - 0.5, z1, { blocksShot: false }); add(hw - th, T.sill, z0, hw, T.h - 0.5, z1, { blocksShot: false });
      add(-hw, T.sill, inner, d0, T.h - 0.5, inner - L.side * th, { blocksShot: false }); add(d1, T.sill, inner, hw, T.h - 0.5, inner - L.side * th, { blocksShot: false });
      return t;
    });
    // GO boxes (Alpha positions mirrored to Bravo); the car's own box rides with it, near its back wall
    this.controls = [];
    const go = (x, z, o) => this.controls.push(Object.assign({ x, z, y: 0 }, o));
    for (const sx of [-1, 1]) go(sx < 0 ? S.GO.bridge[0] : -S.GO.bridge[0], S.GO.bridge[1], { kind: 'bridge' });
    for (const t of this.trams) {
      const g = S.GO[t.L.id];
      for (const sx of [-1, 1]) go(sx < 0 ? g[0] : -g[0], g[1], { kind: 'tram', t, station: sx });
      go(0, t.L.z - t.L.side * 1.3, { kind: 'tram', t, inCar: true, dx: 0 });
    }
    for (const c of this.controls) if (!c.inCar) this.col.addBox(new THREE.Vector3(c.x - 0.18, 0, c.z - 0.18), new THREE.Vector3(c.x + 0.18, 1.45, c.z + 0.18), { material: 'metal', blocksShot: false });
    for (const L of this.bridge.leaves) this.col.setSolid(L.walk, true, true); // the nav graph is sampled with the bridge down (initNav)
    this.gearSpin = 0; this.gearV = 0;
    this._visuals(b);
  }
  _tramX(t, p) { return lerp(t.L.x[0], t.L.x[1], p); }
  ctrlPos(c) { return c.inCar ? { x: c.t.x + c.dx, z: c.z } : c; }

  // ---- simulation (fixed step, after every soldier has moved)
  tick(h) {
    const S = this.S, br = this.bridge;
    this.time += h;
    if (br.k !== br.target) {
      const was = br.k; br.k = br.target > br.k ? Math.min(br.target, br.k + h / S.BR.time) : Math.max(br.target, br.k - h / S.BR.time);
      if ((was === 1) !== (br.k === 1) || (br.k === br.target)) this._applyBridge(false); else this._poseLeaves();
    }
    let moving = 0;
    for (const t of this.trams) {
      t.prevX = t.x;
      if (t.p !== t.target) {
        const step = S.TRAM.speed * h / Math.abs(t.L.x[1] - t.L.x[0]), ease = Math.min(1, 0.25 + 3 * Math.min(t.p, 1 - t.p, 0.25)); // gentle start / stop
        t.p = t.target > t.p ? Math.min(t.target, t.p + step * ease) : Math.max(t.target, t.p - step * ease);
        const nx = this._tramX(t, t.p), dx = nx - t.x;
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
      if (p.x > t.x - hw && p.x < t.x + hw && Math.abs(p.z - t.L.z) < T.w / 2 && p.y > -0.4 && p.y < T.h - 0.5) p.x += dx;
    }
  }
  // the leaf at its current angle as ten AABB slices (hinge → tip, 0.32 m thick); anyone they sweep into is pushed out on top
  _poseLeaves() {
    const BR = this.S.BR, a = BR.up * (1 - this.bridge.k), ca = Math.cos(a), sa = Math.sin(a), th = 0.32, n = 10;
    for (const L of this.bridge.leaves) {
      const dx = -L.sx * ca, dy = sa, tx = -L.sx * th * sa, ty = -th * ca;
      L.segs.forEach((b, i) => {
        const s0 = BR.len * i / n, s1 = BR.len * (i + 1) / n, xs = [L.hx + dx * s0, L.hx + dx * s1, L.hx + dx * s0 + tx, L.hx + dx * s1 + tx], ys = [dy * s0, dy * s1, dy * s0 + ty, dy * s1 + ty];
        this.col.setBox(b, Math.min(...xs), Math.min(...ys), BR.z0, Math.max(...xs), Math.max(...ys), BR.z1);
      });
    }
  }
  _applyBridge(init) {
    const br = this.bridge, down = br.k >= 1;
    this._poseLeaves();
    for (const L of br.leaves) {
      this.col.setSolid(L.walk, down, down);
      for (const s of L.segs) this.col.setSolid(s, !down, !down);
    }
    // bots: the nodes over the chasm only exist while the bridge is down
    const nav = this.m.nav;
    if (nav && !init) for (const n of this.navBridge || []) n.ok = down;
  }
  initNav(nav) { // called once the nav graph exists (it is built with the bridge DOWN so both roofs stay one component)
    this.navBridge = nav.nodes.filter((n) => Math.abs(n.p.x) < this.S.X0 - 0.1);
    this._applyBridge(true); for (const n of this.navBridge) n.ok = this.bridge.k >= 1;
  }

  // ---- bots ride the trams (host): walk to the bay, call the car, step in, press GO, ride, step out on the far roof.
  // Offered while the bridge is up (otherwise they simply walk across); one bot per car at a time.
  botRide(bot) {
    if (this.bridge.k >= 1) return null;
    const S = this.S, T = S.TRAM, p = bot.motor.pos, sx = p.x < 0 ? -1 : 1;
    const lines = this.trams.filter((t) => !t.rider || !t.rider.alive || t.rider.ai.state !== 'RIDE').sort((a, b) => Math.abs(p.z - a.L.z) - Math.abs(p.z - b.L.z));
    const t = lines[0]; if (!t) return null;
    const me = this, home = sx < 0 ? 0 : 1, L = t.L, edge = L.z + L.side * (T.w / 2 + 0.75), out = L.z + L.side * (T.w / 2 + 2.2);
    const dock = L.x[home] + L.door, far = L.x[1 - home] + L.door, bayZ = edge, exitZ = out;
    const st = this.controls.find((k) => k.t === t && k.station === sx), car = this.controls.find((k) => k.t === t && k.inCar);
    t.rider = bot;
    const ride = {
      phase: 'go', T: 0,
      done() { if (t.rider === bot) t.rider = null; },
      step(ai, dt) {
        this.T += dt; if (this.T > 70 || !bot.alive) { this.done(); return false; }
        const m = bot.motor, walk = CFG.bot.patrolSpeed * 1.1;
        const toward = (x, z, spd) => { const dx = x - m.pos.x, dz = z - m.pos.z, d = Math.hypot(dx, dz) || 1; ai.wishX = dx / d; ai.wishZ = dz / d; ai.wishSpeed = spd; ai._turnTo(Math.atan2(-dx, -dz), 5, dt); return d; };
        const docked = (side) => t.p === t.target && t.p === side;
        switch (this.phase) {
          case 'go':
            if (!ai.path.length || !ai.goal || ai.goal.distanceTo(new THREE.Vector3(dock, 0, bayZ)) > 1) ai.setPath(new THREE.Vector3(dock, 0, bayZ), false);
            if (!ai._follow(walk, dt, true, true) || Math.hypot(m.pos.x - dock, m.pos.z - bayZ) < 1.2) this.phase = 'call';
            if (this.T > 30) { this.done(); return false; }
            break;
          case 'call':
            ai.wishSpeed = 0;
            if (docked(home)) { this.phase = 'board'; break; }
            if (t.p === t.target) me.press(st, bot);
            break;
          case 'board':
            if (!docked(home)) { this.phase = 'call'; break; }
            if (toward(t.x, car.z, walk) < 0.9) { me.press(car, bot); this.phase = 'ride'; }
            break;
          case 'ride':
            ai.wishSpeed = 0; ai._scan(dt, 1.2);
            if (docked(1 - home)) this.phase = 'exit';
            else if (t.p === t.target && t.p === home) me.press(car, bot); // still at home (someone called it back): go again
            break;
          case 'exit':
            if (toward(far, exitZ, walk) < 0.8 || Math.abs(m.pos.z - t.L.z) > T.w / 2 + 1.8) { this.done(); ai.path = []; ai.goal = null; return false; }
            break;
        }
        return true;
      },
    };
    return ride;
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
      if (Math.abs(t.p - p) > 0.03) { const dx = this._tramX(t, p) - t.x; t.p = p; this._carry(t, dx); for (const bx of t.boxes) this.col.moveBox(bx, dx, 0, 0); t.x = t.prevX = this._tramX(t, p); }
    });
  }

  // ---- visuals (fallback boxes; the Blender GLB replaces them when it is present)
  _visuals(b) {
    const S = this.S, T = S.TRAM, BR = S.BR, lib = b.lib, sc = b.scene, M = (n) => lib.get(n);
    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; return g; };
    const G = this.m.def._glb && this.m.def._glb.scene;
    const pick = (name) => { if (!G) return null; const o = G.getObjectByName(name); if (o) { o.parent.remove(o); o.matrixAutoUpdate = true; } return o; };
    const proto = G && G.getObjectByName('GO_PROTO'); if (proto) proto.parent.remove(proto);
    for (const L of this.bridge.leaves) {
      const pivot = new THREE.Group(); pivot.position.set(L.hx, 0, (BR.z0 + BR.z1) / 2); sc.add(pivot);
      const glb = pick(L.sx < 0 ? 'BRIDGE_W' : 'BRIDGE_E'), leaf = glb || box(BR.len, 0.3, BR.z1 - BR.z0, M(L.sx < 0 ? 'olive' : 'steel'), -L.sx * BR.len / 2, -0.15, 0);
      if (glb) leaf.position.sub(pivot.position); // GLB nodes are placed in world space (lowered); hang them on the hinge
      pivot.add(leaf); L.mesh = pivot;
    }
    for (const t of this.trams) {
      const g = pick('TRAM_' + t.L.id);
      if (g) { g.position.x -= this._tramX(t, t.L.start); sc.add(g); t.mesh = g; t.base = g.position.clone(); }
      else {
        const grp = new THREE.Group(), hw = T.len / 2, inner = t.L.side * T.w / 2, L = t.L, d0 = L.door - T.door / 2, d1 = L.door + T.door / 2;
        grp.add(box(T.len, 0.3, T.w, M('darkWood'), 0, -0.15, 0), box(T.len + 0.3, 0.25, T.w + 0.3, M('olive'), 0, T.h - 0.12, 0));
        grp.add(box(T.len, T.sill, 0.12, M('darkWood'), 0, T.sill / 2, -inner), box(0.12, T.sill, T.w, M('darkWood'), -hw, T.sill / 2, 0), box(0.12, T.sill, T.w, M('darkWood'), hw, T.sill / 2, 0));
        grp.add(box(d0 + hw, T.sill, 0.12, M('darkWood'), (-hw + d0) / 2, T.sill / 2, inner), box(hw - d1, T.sill, 0.12, M('darkWood'), (d1 + hw) / 2, T.sill / 2, inner));
        for (const [cx, cz] of [[-hw, -T.w / 2], [hw, -T.w / 2], [-hw, T.w / 2], [hw, T.w / 2]]) grp.add(box(0.16, T.h, 0.16, M('olive'), cx, T.h / 2, cz));
        grp.position.set(t.x, 0, L.z); sc.add(grp); t.mesh = grp; t.base = new THREE.Vector3(0, 0, 0);
      }
    }
    // cables, the cable poles and the flat pulley gears at the four corners
    this.gears = [];
    for (const t of this.trams) {
      const cab = G ? null : new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2 * S.PULLEY.x, 6), M('darkSteel')); if (cab) { cab.rotation.z = Math.PI / 2; cab.position.set(0, T.cable, t.L.z); sc.add(cab); }
      for (const sx of [-1, 1]) {
        const gx = sx * S.PULLEY.x, glb = pick(`GEAR_${t.L.id}${sx < 0 ? 'W' : 'E'}`), gear = glb || this._gearMesh(M('bronze'), S.PULLEY.r);
        if (!glb) gear.position.set(gx, -0.2, t.L.z); sc.add(gear);
        this.gears.push({ o: gear, dir: sx * t.L.side });
        if (!G) sc.add(box(0.3, T.cable + 0.6, 0.3, M('darkSteel'), gx, (T.cable + 0.6) / 2 - 0.3, t.L.z));
      }
    }
    for (const k of this.controls) {
      let post, lamp = null, lampR = null;
      if (proto) {
        post = proto.clone(true); post.matrixAutoUpdate = true;
        post.traverse((o) => { if (o.isMesh && o.userData.btn) { o.material = o.material.clone(); if (o.userData.btn === 'btnGreen') lamp = o.material; else lampR = o.material; } });
      } else {
        post = new THREE.Group(); post.add(box(0.08, 1.1, 0.08, M('darkSteel'), 0, 0.55, 0), box(0.36, 0.5, 0.26, M('bronze'), 0, 1.3, 0));
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: 0x40ff60 })); l.position.set(0, 1.13, 0.14); post.add(l); lamp = l.material;
      }
      k.mesh = post; k.lamp = lamp; k.lampR = lampR; sc.add(post);
      // every GO box faces into its roof (the panel looks at whoever comes to press it, not at the cliff)
      if (k.inCar) { k.t.mesh.add(post); post.position.set(k.dx, 0, k.z - k.t.L.z); post.rotation.y = k.t.L.side > 0 ? 0 : Math.PI; }
      else { post.position.set(k.x, 0, k.z); post.rotation.y = k.kind === 'bridge' ? (k.x < 0 ? -Math.PI / 2 : Math.PI / 2) : (k.z > 0 ? Math.PI : 0); }
    }
    this.floorGears = ['FLOORGEAR_W', 'FLOORGEAR_E'].map((n) => G && G.getObjectByName(n)).filter(Boolean); this.floorGears.forEach((o) => { o.matrixAutoUpdate = true; });
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
    if (hour) hour.matrixAutoUpdate = min.matrixAutoUpdate = true;
    if (!hour) {
      const Z = SKY.TOWER.z, Y = SKY.TOWER.clockY, face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.8 })); face.position.set(0, Y, Z - 0.4); face.rotation.y = Math.PI; sc.add(face);
      const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, 0.1); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.4 })); m.position.set(0, Y, Z - 0.5); sc.add(m); return m; };
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
    for (const [i, o] of this.floorGears.entries()) o.rotation.y = (i ? -1 : 1) * this.bridge.k * Math.PI * 1.5;
    for (const k of this.controls) if (k.lamp) { // green button lit = ready, red lit = running
      const busy = k.kind === 'bridge' ? this.bridge.k !== this.bridge.target : k.t.p !== k.t.target, blink = 0.55 + 0.45 * Math.sin(this.time * 9);
      k.lamp.color.setRGB(busy ? 0.08 : 0.25, busy ? 0.25 : 1.3, busy ? 0.1 : 0.35); if (k.lampR) k.lampR.color.setRGB(busy ? 1.4 * blink + 0.2 : 0.35, busy ? 0.18 : 0.06, busy ? 0.12 : 0.05);
    }
    if (this.clock && this.clock.hour) { const d = new Date(), mm = d.getMinutes() + d.getSeconds() / 60, hh = (d.getHours() % 12) + mm / 60; this.clock.min.rotation.z = mm / 60 * Math.PI * 2; this.clock.hour.rotation.z = hh / 12 * Math.PI * 2; } // the dial faces −z: clockwise seen from the roofs
  }
}

// ------------------------------------------------------------------------------------------------- materials
function skyMat(b, name) {
  const tf = b.tf, lib = b.lib, std = (key, o) => lib.basic('sky:' + key, () => new THREE.MeshStandardMaterial(o));
  const canvas = (key, size, draw, o = {}) => lib.basic('sky:' + key, () => {
    const map = tf.simple('sky_' + key, size, draw, true, true); map.anisotropy = 4;
    if (o.repeat) map.repeat.set(...o.repeat); if (o.offset) map.offset.set(...o.offset);
    return new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85, metalness: 0 }, o.mat || {}));
  });
  switch (name) {
    case 'floor': return canvas('floor', 512, (ctx, S) => { // pale marble flags with thin grey joints
      const rnd = mulberry32(77); ctx.fillStyle = '#cfc7bb'; ctx.fillRect(0, 0, S, S);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 196 + Math.floor(rnd() * 22); ctx.fillStyle = `rgb(${v},${v - 5},${v - 14})`; ctx.fillRect(i * S / 4 + 2, j * S / 4 + 2, S / 4 - 4, S / 4 - 4);
        for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(150,140,130,${0.08 + rnd() * 0.1})`; ctx.lineWidth = 1 + rnd(); ctx.beginPath(); let x = i * S / 4 + rnd() * S / 4, y = j * S / 4 + rnd() * S / 4; ctx.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); } }
      ctx.fillStyle = 'rgba(120,112,104,.55)'; for (let i = 0; i <= 4; i++) { ctx.fillRect(i * S / 4 - 2, 0, 4, S); ctx.fillRect(0, i * S / 4 - 2, S, 4); }
    }, { mat: { roughness: 0.62, color: 0x9c958c } }); // the roofs face the sun: keep the marble from blowing out
    case 'whiteBrick': return canvas('whiteBrick', 512, (ctx, S) => { // cream ashlar courses, offset joints
      const rnd = mulberry32(91); ctx.fillStyle = '#b9b2a8'; ctx.fillRect(0, 0, S, S); const rows = 8, h = S / rows;
      for (let j = 0; j < rows; j++) for (let i = -1; i < 4; i++) { const w = S / 3, x = i * w + (j % 2) * w / 2, v = 206 + Math.floor(rnd() * 22); ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`; ctx.fillRect(x + 3, j * h + 3, w - 6, h - 6); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 3, j * h + 3, w - 6, 3); }
    });
    case 'clockFace': return canvas('clockFace', 1024, (ctx, S) => { // roman dial, brass ring
      const c = S / 2; ctx.fillStyle = '#efe7d3'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = S * 0.02; ctx.beginPath(); ctx.arc(c, c, S * 0.47, 0, 7); ctx.stroke(); ctx.lineWidth = S * 0.006; ctx.beginPath(); ctx.arc(c, c, S * 0.36, 0, 7); ctx.stroke();
      ctx.fillStyle = '#4a3a26'; ctx.font = `bold ${S * 0.075}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((t, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; ctx.save(); ctx.translate(c + Math.cos(a) * S * 0.415, c + Math.sin(a) * S * 0.415); ctx.rotate(a + Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore(); });
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; ctx.fillRect(c + Math.cos(a) * S * 0.35 - 3, c + Math.sin(a) * S * 0.35 - 3, i % 5 ? 4 : 9, i % 5 ? 4 : 9); }
      ctx.strokeStyle = 'rgba(138,106,58,.5)'; ctx.lineWidth = 3; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * S * 0.08, c + Math.sin(a) * S * 0.08); ctx.lineTo(c + Math.cos(a) * S * 0.3, c + Math.sin(a) * S * 0.3); ctx.stroke(); }
    }, { repeat: [1 / 8.4, 1 / 8.4], offset: [0.5, -6.3 / 8.4], mat: { roughness: 0.7 } }); // glTF v = 1 + y on the dial (centre y 9.5, r 4.2)
    case 'goPanel': return canvas('goPanel', 128, (ctx, S) => { // dot-matrix 'GO' on black
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#f2f2f2'; ctx.font = `bold ${S * 0.36}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('G', S / 2, S * 0.3); ctx.fillText('O', S / 2, S * 0.72);
    }, { repeat: [1 / 0.24, 1 / 0.32], offset: [0.5, -2.2 / 0.32], mat: { emissive: 0x333333, roughness: 0.5 } });
    case 'inlay': return std('inlay', { color: 0xb0624a, roughness: 0.6, metalness: 0.1 });
    case 'stone': return std('stone', { color: 0xd6cfc2, roughness: 0.8 });
    case 'copper': return std('copper', { color: 0xd08a5c, roughness: 0.42, metalness: 0.55 });
    case 'tramGreen': return std('tramGreen', { color: 0x3f7d68, roughness: 0.5, metalness: 0.25 });
    case 'tramWood': return std('tramWood', { color: 0x7a5038, roughness: 0.75 });
    case 'roofTin': return std('roofTin', { color: 0x7e8784, roughness: 0.45, metalness: 0.55 });
    case 'leafGreen': return std('leafGreen', { color: 0x4a8a76, roughness: 0.5, metalness: 0.3 });
    case 'leafGrey': return std('leafGrey', { color: 0x4d5a66, roughness: 0.5, metalness: 0.35 });
    case 'arrow': return std('arrow', { color: 0xe3b23c, roughness: 0.4, metalness: 0.3, emissive: 0x3a2a00 });
    case 'rubber': return std('rubber', { color: 0x161616, roughness: 0.9 });
    case 'lampGlow': return lib.basic('sky:lampGlow', () => new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffc890, emissiveIntensity: 1.2 }));
    case 'glass': return lib.basic('sky:glass', () => new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 }));
    case 'btnGreen': return lib.basic('sky:btnG', () => new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
    case 'btnRed': return lib.basic('sky:btnR', () => new THREE.MeshBasicMaterial({ color: 0x501010 }));
    case 'bronze': return std('bronzeGear', { color: 0xb08a5a, roughness: 0.45, metalness: 0.7 });
    default: return MAT_PRESETS[name] ? lib.get(name) : std('x_' + name, { color: 0xcccccc });
  }
}

// a sea of cloud below the roofs, a plume rising out of the chasm, and a rainbow in the east
function skyAtmosphere(b) {
  const tf = b.tf, sc = b.scene;
  const puff = tf.simple('skyCloudPuff', 256, (ctx, S) => {
    const rnd = mulberry32(5); ctx.clearRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { const x = S * (0.25 + rnd() * 0.5), y = S * (0.3 + rnd() * 0.4), r = S * (0.08 + rnd() * 0.16), g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,248,252,.55)'); g.addColorStop(1, 'rgba(255,248,252,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  }, true, false);
  const mat = new THREE.SpriteMaterial({ map: puff, color: 0xf3e6f2, transparent: true, depthWrite: false, fog: true });
  const rnd = mulberry32(19), add = (x, y, z, s) => { const sp = new THREE.Sprite(mat); sp.position.set(x, y, z); sp.scale.set(s, s * 0.55, 1); sp.userData.noAO = true; sc.add(sp); return sp; };
  for (let i = 0, n = 0; i < 400 && n < 70; i++) { // the sea of cloud: well below the roofs and never around the towers (a puff's top half would veil the floor)
    const a = rnd() * Math.PI * 2, d = 45 + rnd() * 150, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85, sz = 30 + rnd() * 40, y = -16 - rnd() * 14;
    if (Math.abs(x) < 40 + sz / 2 && Math.abs(z) < 45 + sz / 2) continue;
    if (y + sz * 0.28 > -6) continue; add(x, y, z, sz); n++;
  }
  for (let i = 0; i < 26; i++) add((rnd() - 0.5) * 70, -24 - rnd() * 8, (rnd() - 0.5) * 50, 26 + rnd() * 16); // low layer under the roofs
  const plume = [];
  for (let i = 0; i < 9; i++) plume.push(add((rnd() - 0.5) * 6, -9 + i * 0.9, -9 + i * 2.2, 10 + rnd() * 6));
  b.animated.push((dt, t) => { plume.forEach((p, i) => { p.position.y = -9 + i * 0.9 + Math.sin(t * 0.3 + i) * 0.6; p.material.rotation = 0; }); });
  // rainbow: a thin additive arc far in the east sky
  const g = new THREE.RingGeometry(150, 162, 64, 1, Math.PI * 0.08, Math.PI * 0.62), cols = [], pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getX(i), pa.getY(i)), k = (r - 150) / 12, c = new THREE.Color().setHSL(0.78 * (1 - k), 0.9, 0.62); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const bow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  bow.position.set(260, -40, -120); bow.rotation.y = -Math.PI / 2.4; bow.userData.noAO = true; sc.add(bow);
}

MAPS.push({
  id: 'skycity', name: '天空之城', en: 'SKY CITY', desc: '雲端鐘樓 · 可升降吊橋 · 南北兩條纜車 · 四周無護欄 · 53×26', slogan: 'SKYWALKER · 別往下看',
  look: { desat: 0.06, contrast: 1.04, pivot: 0.45, highlights: 1.06 },
  bounds: { minX: -36, maxX: 36, minZ: -24, maxZ: 24 },
  indoor: false, navLevels: [0], navStep: 1.5, viewMult: 1.2, radarRange: 40, killY: SKY.KILL_Y,
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.75, sky: { turbidity: 3, rayleigh: 1.2, elevation: 40, azimuth: 200 },
  sun: { pos: [30, 55, 25], color: 0xfff4e6, intensity: 2.4, auto: true }, hemi: [0xeef2ff, 0xd8c8e0, 0.85], exposure: 0.8,
  fog: { color: 0xe6dcef, near: 140, far: 650 }, acoustics: 'outdoor', ambience: 'hill', shadowFollow: 0,
  shot: { pos: [0, 18, -40], target: [0, 0, 4] },
  thumb: { pos: [-40, 12, -34], target: [2, 6, 10], fov: 58 },
  objectives: { dom: [[-18, 0, -3], [0, 0, 0.45], [18, 0, -3]], relic: [18, 0, 3], domRadius: 3.2 },
  async preload() {
    if (this._glb !== undefined) return;
    this._glb = null;
    try {
      if (!window.SKY_GLB) await new Promise((res) => { const s = document.createElement('script'); s.src = 'assets/maps/skycity.js'; s.async = true; s.onload = res; s.onerror = res; document.head.appendChild(s); });
      if (window.SKY_GLB) {
        const bin = Uint8Array.from(atob(window.SKY_GLB), (c) => c.charCodeAt(0)).buffer, L = new GLTFLoader(), D = new DRACOLoader();
        D.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'); L.setDRACOLoader(D);
        this._glb = await L.parseAsync(bin, ''); D.dispose();
      }
    } catch (e) { console.warn('Sky City GLB unavailable, using fallback visuals', e && e.message); this._glb = null; }
  },
  build(b) {
    if (!b.dry && this._glb && !this._glbSrc) this._glbSrc = this._glb.scene;
    if (!b.dry && this._glbSrc) this._glb = { scene: this._glbSrc.clone(true) };
    buildSky(b);
  },
});

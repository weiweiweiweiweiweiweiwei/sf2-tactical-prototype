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
  const S = SKY, solid = !b.dry, glb = !b.dry && b.def._glb, vis = (m) => (glb ? null : m);
  if (glb) glb.scene.traverse((o) => { // Blender visuals: 'sky:<name>' placeholders → the game's materials
    if (!o.isMesh) return;
    const nm = ((o.material && o.material.name) || '').replace(/^sky:/, '');
    o.material = skyMat(b, nm); if (nm === 'btnGreen' || nm === 'btnRed') o.userData.btn = nm;
    if (o.material.transparent) { o.renderOrder = 2; o.userData.noAO = true; }
    o.castShadow = !/clockFace|glass|inlay|arrow/.test(nm); o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix();
  });
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
    [-12.4, -10.8, 2.6, 1.2, 1.4], [-16.6, 2.4, 1.2, 1.2, 1.3], [-15.0, -3.6, 2.4, 1.2, 1.2],
    [-20.4, -2.3, 1.2, 5.4, 2.6], [-19.3, 2.4, 1.2, 5.2, 2.6], // tall crate stacks screening the spawn
  ];
  for (const sx of [1, -1]) for (const [x, z, w, d, h] of COVER) {
    const cx = x * sx, cz = z * sx;
    b.box(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2, vis('wood'), { material: 'wood', penetrable: true, radar: 'crate', tile: 1.2 });
  }
  // street lamps at the roof corners (thin posts)
  for (const sx of [-1, 1]) for (const [x, z] of [[S.X1 - 0.6, S.Z0 + 0.6], [S.X1 - 0.6, S.Z1 - 0.6], [S.X0 + 0.6, S.Z1 - 0.6]]) b.box(sx * x - 0.1, 0, z * sx - 0.1, sx * x + 0.1, 2.6, z * sx + 0.1, vis('darkSteel'), { material: 'metal', radar: false });
  // clock tower to the north (out of reach; blocks bullets and grenades)
  b.box(-12, -40, -40, 12, 24, -20, vis('plasterWhite'), { radar: false, physics: true });
  // walkable flat gears: the big one half over the outer edge of each roof, the pulley gears off the four corners
  for (const sx of [-1, 1]) {
    for (const [dx, hz] of [[0.6, 2.9], [1.4, 2.6], [2.2, 2.05], [2.8, 1.1]]) b.box(sx > 0 ? S.X1 : -S.X1 - dx, -0.4, -hz, sx > 0 ? S.X1 + dx : -S.X1, -0.02, hz, null, { material: 'metal', surface: 'metal', radar: 'catwalk' });
    for (const L of S.LINES) b.box(sx * (S.X1 + 2.6) - 1.5, -0.35, L.z - 1.5, sx * (S.X1 + 2.6) + 1.5, -0.11, L.z + 1.5, null, { material: 'metal', surface: 'metal', radar: 'catwalk' });
  }
  // spawn zones: Alpha on the west roof facing east, Bravo on the east roof facing west
  b.spawnZone('alpha', -26, -3.6, -22, 3.6, -Math.PI / 2); b.spawnZone('bravo', 22, -3.6, 26, 3.6, Math.PI / 2);
  // patrol points (the bots also walk past the GO boxes — that is how they work the bridge)
  for (const [x, z] of [[-16, 0], [16, 0], [-10, -0.4], [10, 0.4], [-20, -11], [20, 11], [-20, 11], [20, -11], [0, -3]]) b.waypoint(x, z, 0);
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
      if ((was === 1) !== (br.k === 1) || (br.k === br.target)) this._applyBridge(false); else this._poseLeaves();
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
    for (const n of nav.nodes) if (Math.abs(n.p.z) > this.S.Z1 - 0.3) n.ok = false; // never path into a tram bay (the car leaves)
    this._applyBridge(true); for (const n of this.navBridge) n.ok = this.bridge.k >= 1;
  }

  // ---- bots ride the trams (host): walk to the bay, call the car, step in, press GO, ride, step out on the far roof.
  // Offered while the bridge is up (otherwise they simply walk across); one bot per car at a time.
  botRide(bot) {
    if (this.bridge.k >= 1) return null;
    const S = this.S, T = S.TRAM, p = bot.motor.pos, sx = p.x < 0 ? -1 : 1;
    const lines = this.trams.filter((t) => !t.rider || !t.rider.alive || t.rider.ai.state !== 'RIDE').sort((a, b) => Math.abs(p.z - a.L.z) - Math.abs(p.z - b.L.z));
    const t = lines[0]; if (!t) return null;
    const me = this, home = sx < 0 ? 0 : 1, dock = sx * T.dock, bayZ = t.L.z + t.L.side * (T.w / 2 + 0.9), exitZ = t.L.z + t.L.side * (T.w / 2 + 2.2);
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
            if (toward(dock, t.L.z, walk) < 0.7) { me.press(car, bot); this.phase = 'ride'; }
            break;
          case 'ride':
            ai.wishSpeed = 0; ai._scan(dt, 1.2);
            if (docked(1 - home)) this.phase = 'exit';
            else if (t.p === t.target && t.p === home) me.press(car, bot); // still at home (someone called it back): go again
            break;
          case 'exit':
            if (toward(-dock, exitZ, walk) < 0.8 || Math.abs(m.pos.z - t.L.z) > T.w / 2 + 1.8) { this.done(); ai.path = []; ai.goal = null; return false; }
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
      if (Math.abs(t.p - p) > 0.03) { const dx = this._tramX(p) - t.x; t.p = p; this._carry(t, dx); for (const bx of t.boxes) this.col.moveBox(bx, dx, 0, 0); t.x = t.prevX = this._tramX(p); }
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
      const cab = G ? null : new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2 * (S.X1 + 3), 6), M('darkSteel')); if (cab) { cab.rotation.z = Math.PI / 2; cab.position.set(0, T.h + 1.1, t.L.z); sc.add(cab); }
      for (const sx of [-1, 1]) {
        const gx = sx * (S.X1 + 2.6), glb = pick(`GEAR_${t.L.id}${sx < 0 ? 'W' : 'E'}`), gear = glb || this._gearMesh(M('bronze'), 2.1);
        if (!glb) gear.position.set(gx, -0.2, t.L.z); sc.add(gear);
        this.gears.push({ o: gear, dir: sx * (t.L.side) });
        if (!G) sc.add(box(0.18, T.h + 1.4, 0.18, M('darkSteel'), gx, (T.h + 1.4) / 2 - 0.2, t.L.z));
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
      if (k.inCar) { k.t.mesh.add(post); post.position.set(k.dx * (k.t.L.side > 0 ? 1 : -1), 0, (k.z - k.t.L.z)); post.rotation.y = k.t.L.side > 0 ? 0 : Math.PI; }
      else { post.position.set(k.x, 0, k.z); post.rotation.y = k.kind === 'bridge' ? (k.x < 0 ? -Math.PI / 2 : Math.PI / 2) : (k.z > 0 ? 0 : Math.PI); }
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
      const face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.8 })); face.position.set(0, 9.5, -19.6); sc.add(face);
      const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, 0.1); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.4 })); m.position.set(0, 9.5, -19.5); sc.add(m); return m; };
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
    if (this.clock && this.clock.hour) { const d = new Date(), mm = d.getMinutes() + d.getSeconds() / 60, hh = (d.getHours() % 12) + mm / 60; this.clock.min.rotation.z = -mm / 60 * Math.PI * 2; this.clock.hour.rotation.z = -hh / 12 * Math.PI * 2; }
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
  id: 'skycity', name: '天空之城', en: 'SKY CITY', desc: '雲端鐘樓 · 可升降吊橋 · 南北兩條纜車 · 四周無護欄 · 54×28', slogan: 'SKYWALKER · 別往下看',
  look: { desat: 0.06, contrast: 1.04, pivot: 0.45, highlights: 1.06 },
  bounds: { minX: -36, maxX: 36, minZ: -24, maxZ: 22 },
  indoor: false, navLevels: [0], navStep: 1.5, viewMult: 1.2, radarRange: 40, killY: SKY.KILL_Y,
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, envIntensity: 0.75, sky: { turbidity: 3, rayleigh: 1.2, elevation: 40, azimuth: 200 },
  sun: { pos: [30, 55, 25], color: 0xfff4e6, intensity: 2.4, auto: true }, hemi: [0xeef2ff, 0xd8c8e0, 0.85], exposure: 0.8,
  fog: { color: 0xe6dcef, near: 140, far: 650 }, acoustics: 'outdoor', ambience: 'hill', shadowFollow: 0,
  shot: { pos: [0, 18, 38], target: [0, 0, -4] },
  objectives: { dom: [[-17, 0, 6], [0, 0, -3], [17, 0, -6]], relic: [19, 0, 5], domRadius: 3.2 },
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

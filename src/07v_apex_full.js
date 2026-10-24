// Full imported extent. Repeated meshes stay instanced; AI combat remains in the verified village.
// Stand-in sliding doors at the original prop_door positions (E opens / closes; a closing door reopens on anyone in it).
// mechs[0] on this map: the host streams netState() to clients.
class ApexDoors {
  constructor(b, entries) {
    this.b = b; this.doors = [];
    for (const d of entries) {
      const pivot = new THREE.Group(); pivot.position.set(d.x, d.y, d.z); pivot.rotation.y = d.yaw;
      const mat = new THREE.MeshStandardMaterial({ color: 0x854d3b, metalness: 0.45, roughness: 0.65 });
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 1.5), mat); leaf.position.set(0, 1.3, -0.75); leaf.castShadow = true; leaf.receiveShadow = true; pivot.add(leaf);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 1.35), new THREE.MeshStandardMaterial({ color: 0xd8b057, roughness: 0.7 })); stripe.position.set(0, 1.2, -0.75); pivot.add(stripe);
      b.scene.add(pivot); pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pivot), col = b.col.addBox(box.min.clone(), box.max.clone(), { material: 'metal' });
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const body = new CANNON.Body({ mass: 0, material: b.phys.matDefault, shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)) });
      body.position.set(mid.x, mid.y, mid.z); b.phys.world.addBody(body);
      this.doors.push({ pivot, col, body, base: d.y, k: 0, target: 0, box: box.clone(), center: mid });
    }
  }
  nearest(c) {
    if (!c.alive) return null;
    const eye = c.eyePos(new THREE.Vector3()); let best = null, dist = 2.8;
    for (const d of this.doors) {
      const n = eye.distanceTo(d.center); if (n >= dist) continue;
      const hit = this.b.col.raycast(eye, d.center.clone().sub(eye).normalize(), n);
      if (hit && hit.collider !== d.col && hit.t < n - 0.25) continue; // a wall between you and the door
      best = d; dist = n;
    }
    return best;
  }
  prompt(c) { const d = this.nearest(c); return d ? '按 [E] ' + (d.target ? '關閉' : '開啟') + '電動門' : null; }
  interact(c) { const d = this.nearest(c); if (!d) return false; d.target = d.target ? 0 : 1; return true; }
  _slide(d, k) { // the leaf rises 2.9 m; its collider and physics body follow
    const dy = (k - d.k) * 2.9; d.k = k; if (!dy) return;
    d.pivot.position.y = d.base + k * 2.9; this.b.col.moveBox(d.col, 0, dy, 0);
    d.body.position.y += dy; d.body.aabbNeedsUpdate = true;
  }
  tick(h) {
    const g = this.b.game;
    for (const d of this.doors) {
      if (!g.isClient && d.target === 0 && d.k > 0 && g.combatants.some((c) => c.alive && CollisionWorld.overlap(d.box, c.motor.pos.x, c.motor.pos.y, c.motor.pos.z, c.motor.radius + 0.15, c.motor.height))) d.target = 1;
      this._slide(d, clamp(d.k + Math.sign(d.target - d.k) * h * 1.6, 0, 1));
    }
  }
  render() {}
  netState() { return this.doors.flatMap((d) => [d.k, d.target]); }
  applyNet(s) {
    if (!Array.isArray(s) || s.length !== this.doors.length * 2) return;
    this.doors.forEach((d, i) => { this._slide(d, clamp(Number(s[i * 2]) || 0, 0, 1)); d.target = s[i * 2 + 1] ? 1 : 0; });
  }
}

// Keeps the full world cheap: static physics exists only in 16 m tiles around combatants and live grenades (the whole map
// would flood the cannon broadphase), and props farther than 110 m are hidden (the terrain shell always draws).
// A tile body is built once and kept; tiles join within 2 tiles of someone and leave beyond 3 (no churn at a border).
class ApexStreaming {
  constructor(b, boxes, meshes) {
    this.b = b; this.meshes = meshes; this.active = new Map(); this.built = new Map(); this.physT = 0; this.cullT = 0;
    // tile key -> indices of the packed boxes (x0 y0 z0 x1 y1 z1) crossing it
    this.tiles = new Map();
    for (let i = 0, n = boxes.length / 6; i < n; i++) {
      const j = i * 6;
      for (let x = Math.floor(boxes[j] / 16); x <= Math.floor((boxes[j + 3] - 0.001) / 16); x++)
        for (let z = Math.floor(boxes[j + 2] / 16); z <= Math.floor((boxes[j + 5] - 0.001) / 16); z++) {
          const key = x + ',' + z; let t = this.tiles.get(key); if (!t) this.tiles.set(key, t = []); t.push(i);
        }
    }
    this.boxes = boxes;
  }
  _body(key) { // one static compound per tile, each box clipped to the tile
    const [x, z] = key.split(',').map(Number), a = this.boxes, x0 = x * 16, z0 = z * 16;
    const body = new CANNON.Body({ mass: 0, material: this.b.phys.matDefault }); body.position.set(x0, 0, z0);
    for (const i of this.tiles.get(key)) { // what Body.addShape does, with the radius / mass update once at the end (it is O(shapes) per add)
      const j = i * 6, minX = Math.max(a[j], x0), minZ = Math.max(a[j + 2], z0), maxX = Math.min(a[j + 3], x0 + 16), maxZ = Math.min(a[j + 5], z0 + 16);
      const s = new CANNON.Box(new CANNON.Vec3((maxX - minX) / 2, (a[j + 4] - a[j + 1]) / 2, (maxZ - minZ) / 2)); s.body = body;
      body.shapes.push(s); body.shapeOffsets.push(new CANNON.Vec3((minX + maxX) / 2 - x0, (a[j + 1] + a[j + 4]) / 2, (minZ + maxZ) / 2 - z0)); body.shapeOrientations.push(new CANNON.Quaternion());
    }
    body.updateMassProperties(); body.updateBoundingRadius(); body.aabbNeedsUpdate = true;
    return body;
  }
  tick(h) {
    if ((this.physT -= h) > 0) return;
    this.physT = 0.25;
    const g = this.b.game, world = this.b.phys.world, wanted = new Set(), keep = new Set(), pos = g.combatants.filter((c) => c.alive).map((c) => c.motor.pos);
    for (const gr of g.grenades) if (gr.dyn?.body) pos.push(gr.dyn.body.position);
    for (const p of pos) {
      const tx = Math.floor(p.x / 16), tz = Math.floor(p.z / 16);
      for (let x = tx - 3; x <= tx + 3; x++) for (let z = tz - 3; z <= tz + 3; z++) { const key = x + ',' + z; keep.add(key); if (Math.abs(x - tx) <= 2 && Math.abs(z - tz) <= 2) wanted.add(key); }
    }
    for (const [key, body] of this.active) if (!keep.has(key)) { world.removeBody(body); this.active.delete(key); }
    let builds = 6; // new tiles per pass at most: the 2-tile margin is 32 m, a runner covers 1.5 m per pass
    for (const key of wanted) {
      if (this.active.has(key) || !this.tiles.has(key)) continue;
      let body = this.built.get(key);
      if (!body) { if (builds-- <= 0) continue; body = this._body(key); this.built.set(key, body); }
      world.addBody(body); this.active.set(key, body);
    }
  }
  render(dt) {
    if ((this.cullT -= dt) > 0) return;
    this.cullT = 0.25;
    const p = this.b.game.camera.position;
    for (const m of this.meshes) m.visible = m.userData.fullWorld || m.boundingSphere.center.distanceTo(p) - m.boundingSphere.radius < 110;
  }
  interact() { return false; }
  prompt() { return null; }
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
function apexFullSpawns(team, game) {
  const S = game.def._full.navMeta, v = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  game.fwdSpawns = game.fwdSpawns || {};
  game.fwdSpawns[team] = S.forward[team].map((f) => ({ pts: f.pts.map(v), c: v(f.pts[0]), yaw: f.yaw }));
  return { pts: S.spawns[team].pts.map(v), yaw: S.spawns[team].yaw };
}

MAPS.push({
  id: 'apex_full', name: 'Apex 訓練場・全場景', en: 'APEX FULL RANGE',
  desc: '全場景探索 · E 電動門 · 二段跳／滑鏟／攀爬', slogan: '完整匯入範圍 · 近似碰撞',
  bounds: { minX: -909, maxX: 208, minZ: -780, maxZ: 244 }, indoor: false, navLevels: [], killY: -284, killOutside: true, traversal: true,
  background: 0x9daeb9, envIntensity: 0.6, exposure: 0.8,
  sun: { pos: [-20, 70, 25], color: 0xfff0d5, intensity: 2 }, hemi: [0xdce8f2, 0x665b49, 1.2],
  fog: { color: 0x9daeb9, near: 400, far: 1400 }, acoustics: 'outdoor', ambience: 'wind',
  shot: { pos: [-350, 800, 350], target: [-350, 0, -250] },
  thumb: { pos: [65, 45, -70], target: [-10, 5, 15] }, // room picture: the village under the fog, not the overview
  objectives: { dom: [[-20, 0, 0], [0, 0, 0], [20, 0, 0]], relic: [0, 0, 0], domRadius: 3.6 }, // replaced by the baked ones on load
  spawnPoints: apexFullSpawns,
  async preload() {
    if (this._full) return;
    const p = await apexPack('apex_full', 'assets/maps/apex-full/'), text = (b) => JSON.parse(new TextDecoder().decode(b));
    const manifest = text(p.manifest), navMeta = text(p.navMeta);
    this._full = { manifest, navMeta, nav: apexNav(p.nav), data: apexCollision(p.collision), gltf: await apexGLTF(p.glb) };
    // the whole reachable area is the battlefield: baked objectives, and the bots' lanes / push direction use its extent
    this.killY = manifest.killY; this.objectives = navMeta.objectives; this.aiBounds = navMeta.aiBounds;
    const A = navMeta.spawns.alpha.pts[0], C = navMeta.spawns.bravo.pts[0], dx = C[0] - A[0], dz = C[2] - A[2], l = Math.hypot(dx, dz);
    this.aiAxis = { mx: (A[0] + C[0]) / 2, mz: (A[2] + C[2]) / 2, ax: dx / l, az: dz / l, half: l * 0.62, laneHalf: Math.max(40, l * 0.4) }; // spawns at ±0.8 of the push
  },
  build(b) {
    const S = this._full && this._full.navMeta.spawns, zone = (t) => { const p = S[t].pts[0]; b.spawnZone(t, p[0] - 6, p[2] - 6, p[0] + 6, p[2] + 6, S[t].yaw); };
    if (S) { zone('alpha'); zone('bravo'); } else { b.spawnZone('alpha', -30, -30, -24, -24, 0); b.spawnZone('bravo', 24, 24, 30, 30, Math.PI); } // (lobby preview before the first load)
    if (b.dry) return;
    const { data, gltf, manifest } = this._full;
    b.navBaked = this._full.nav;
    b.game.camera.far = 2200; b.game.camera.updateProjectionMatrix();
    b.col.addPacked(data.boxes, { material: 'concrete' });
    // Visual geometry retains shared prototypes and original transforms.
    gltf.scene.updateMatrixWorld(true);
    const batches = new Map(), villageMats = new Map(); let objects = 0;
    // the village batch gets its own copy of a material: one material drawn both merged and instanced makes three.js re-pick
    // its shader program at every switch (instancing and vertex-alpha flags differ)
    const villageMat = (m) => { let c = villageMats.get(m); if (!c) villageMats.set(m, c = m.clone()); return c; };
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return; objects++;
      // Engine-only fog cards need their depth-fade shaders; opaque substitutes obscure the map.
      if (/atmosphere|fog_volume|godray|lightshaft|vistas/i.test(o.name)) return;
      const mat = o.material;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        m.side = THREE.DoubleSide; // the export has cropped and one-sided shells seen from behind
        if (m.transparent && !/glass/i.test(m.name)) { m.alphaTest = 0.35; m.transparent = false; m.depthWrite = true; }
        if (/decal|stain|stencil/i.test(m.name)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
      }
      const matrix = o.matrixWorld.clone(); matrix.elements[13] += data.visualYOffset; // same visual drop as the test region's GLB
      const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      if (Math.abs(p.x) <= 40 && Math.abs(p.z) <= 40 && !Array.isArray(mat) && !mat.transparent) { // the village: merged per material
        const geo = o.geometry.clone(); geo.applyMatrix4(matrix); b._batch(villageMat(mat), geo, false); return;
      }
      const key = o.geometry.uuid + ':' + (Array.isArray(mat) ? mat.map((m) => m.uuid).join(',') : mat.uuid) + ':' + Math.floor(p.x / 64) + ',' + Math.floor(p.z / 64);
      if (!batches.has(key)) batches.set(key, { geo: o.geometry, mat, matrices: [], world: /Full_world|Full world/i.test(o.name) });
      batches.get(key).matrices.push(matrix);
    });
    const meshes = [];
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.matrices.length);
      batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.fullWorld = batch.world; // no static shadow casters on the full map (cost)
      b.scene.add(mesh); meshes.push(mesh);
    }
    const doors = new ApexDoors(b, manifest.doors);
    b.mechs.push(doors, new ApexStreaming(b, data.boxes, meshes));
    window.__apexFull = { objects, drawGroups: batches.size, doors: doors.doors.length, collisionBoxes: data.count, manifest };
  }
});

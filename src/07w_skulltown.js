// v60 Skull Town (Apex Arenas / TDM, mp_rr_freedm_skulltown) rebuilt from the user's own install: the BSP world and 24k static
// props at their original transforms (tools/blender/skulltown_build.py), lighting baked in Cycles into two lightmaps — the play
// area and the scenery around it — and collision from the real triangles (TriSoup: slopes are slopes, thin props are walkable).
// tools/blender/skulltown_export.py → tools/pack-apex-js.mjs skulltown → assets/maps/apex-skulltown/pack/.

// Packed triangles (tools/pack-apex-js.mjs): 'STRQ', version 1, vertex count, triangle count, scale; Int16 x y z per vertex
// (metres × scale), Uint32 indices, Uint8 surface per triangle (TRI_SURFACES).
function skullTris(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0x51525453 || v.getUint32(4, true) !== 1) throw new Error('Skull Town collision: unknown format');
  const nv = v.getUint32(8, true), nt = v.getUint32(12, true), s = v.getFloat32(16, true);
  const q = new Int16Array(buf, 20, nv * 3), pos = new Float32Array(nv * 3);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / s;
  const io = (20 + nv * 6 + 3) & ~3, idx = new Uint32Array(buf, io, nt * 3), mats = new Uint8Array(buf, io + nt * 12, nt);
  return { pos, idx, mats };
}
async function skullTexture(buf) {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }), { imageOrientation: 'none', colorSpaceConversion: 'none' });
  const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; // glTF UVs: TEXCOORD_1
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
// The world's own look comes from the bake: lightmap only (the live sun and sky would light it twice). A live shadow (a soldier,
// a door) still darkens the part of the bake that the sun lit.
function skullWorldMaterial(src, lm, scale) {
  const m = new THREE.MeshLambertMaterial({ map: src.map, color: src.color, lightMap: lm, lightMapIntensity: scale, side: THREE.DoubleSide,
    alphaTest: src.alphaTest || (src.transparent ? 0.35 : 0), transparent: false, name: src.name });
  if (/decal|stain|drip|_transparent|erosion/i.test(src.name)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', `
      float sunVis = 1.0;
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow sunSh = directionalLightShadows[ 0 ];
        sunVis = getShadow( directionalShadowMap[ 0 ], sunSh.shadowMapSize, sunSh.shadowBias, sunSh.shadowRadius, vDirectionalShadowCoord[ 0 ] );
      #endif
      #ifdef USE_LIGHTMAP
        vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
        float sunK = smoothstep( 0.35, 0.7, max( lightMapTexel.r, max( lightMapTexel.g, lightMapTexel.b ) ) );
        irradiance = lightMapTexel.rgb * lightMapIntensity * mix( 1.0, 0.4 + 0.6 * sunVis, sunK );
      #endif`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n      reflectedLight.directDiffuse = vec3( 0.0 );');
  };
  m.customProgramCacheKey = () => 'skullWorld';
  return m;
}

// The play area's floors as PhysicsWorld terrain for corpses / dropped guns / casings (their box hulls get ground contacts);
// grenades (spheres) bounce on real triangles in streamed cannon Trimesh tiles (SkullStreaming).
class TriGround {
  constructor(tris) { this.t = tris; this.n = new THREE.Vector3(); }
  heightAt(x, z, y = 1e4) { const g = this.t.groundAt(x, y, z, 0, 3); return g === null ? -1e9 : g; }
  normalAt(x, z, out = new THREE.Vector3(), y = 1e4) {
    const g = this.t.groundAt(x, y, z, 0, 3), i = this.t.lastTri * 3;
    return g === null || i < 0 ? out.set(0, 1, 0) : out.set(this.t.nrm[i], this.t.nrm[i + 1], this.t.nrm[i + 2]);
  }
  slopeAt(x, z, y) { const n = this.normalAt(x, z, this.n, y); return Math.hypot(n.x, n.z) / Math.max(n.y, 1e-3); }
}

// Grenade trimesh tiles (16 m, built once, in the world while a grenade is within a tile) and prop culling past 150 m.
class SkullStreaming {
  constructor(b, tris, meshes) { this.b = b; this.tris = tris; this.meshes = meshes; this.built = new Map(); this.active = new Map(); this.physT = 0; this.cullT = 0; }
  _tile(key) {
    const [x, z] = key.split(',').map(Number), T = this.tris, v = T.v, verts = [], ids = [];
    T.each(x * 16, z * 16, x * 16 + 16, z * 16 + 16, (t) => {
      const o = t * 6; if (T.bb[o + 3] < x * 16 || T.bb[o] > x * 16 + 16 || T.bb[o + 5] < z * 16 || T.bb[o + 2] > z * 16 + 16) return false;
      const n = verts.length / 3; for (let k = 0; k < 9; k++) verts.push(v[t * 9 + k]); ids.push(n, n + 1, n + 2); return false;
    });
    if (!ids.length) return null;
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.b.phys.matDefault, collisionFilterGroup: 2, collisionFilterMask: 4 });
    body.addShape(new CANNON.Trimesh(verts, ids)); return body;
  }
  tick(h) {
    if ((this.physT -= h) > 0) return;
    this.physT = 0.1;
    const world = this.b.phys.world, want = new Set();
    for (const gr of this.b.game.grenades) {
      const p = gr.dyn?.body?.position; if (!p) continue;
      const tx = Math.floor(p.x / 16), tz = Math.floor(p.z / 16);
      for (let x = tx - 1; x <= tx + 1; x++) for (let z = tz - 1; z <= tz + 1; z++) want.add(x + ',' + z);
    }
    for (const [key, body] of this.active) if (!want.has(key)) { world.removeBody(body); this.active.delete(key); }
    for (const key of want) {
      if (this.active.has(key)) continue;
      if (!this.built.has(key)) this.built.set(key, this._tile(key));
      const body = this.built.get(key); if (body) { world.addBody(body); this.active.set(key, body); }
    }
  }
  render(dt) {
    if ((this.cullT -= dt) > 0) return;
    this.cullT = 0.25;
    const p = this.b.game.camera.position;
    for (const m of this.meshes) m.visible = m.boundingSphere.center.distanceTo(p) - m.boundingSphere.radius < 150;
  }
  interact() { return false; }
  prompt() { return null; }
}

MAPS.push({
  id: 'apex_skulltown', name: 'Apex 骷髏鎮', en: 'SKULL TOWN',
  desc: '原版場景與擺設 · 烘焙光照 · 真實三角形碰撞 · E 開門', slogan: '巨獸骸骨下的小鎮 · 屋頂、巷弄、斜坡',
  bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, indoor: false, navLevels: [], killY: -60, killOutside: true, traversal: true,
  background: 0xa9c4dc, envIntensity: 0.55, exposure: 0.85,
  sun: { pos: [1.5, 68, -73], color: 0xffeed7, intensity: 2.6 }, hemi: [0xbcd6ee, 0x8a7356, 1.1], // the map's light_environment: 42.8° up, from Apex −y
  fog: { color: 0xa9c4dc, near: 160, far: 900 }, acoustics: 'outdoor', ambience: 'desert', shadowFollow: 60,
  shot: { pos: [0, 260, 120], target: [0, 0, 0] },
  thumb: { pos: [-60, 30, 70], target: [0, 6, 0] },
  objectives: { dom: [[-30, 0, 0], [0, 0, 0], [30, 0, 0]], relic: [0, 0, 0], domRadius: 5 }, // replaced by the baked ones on load
  spawnPoints(team, game) {
    const S = game.def._skull.navMeta;
    if (!S) { const p = team === 'alpha' ? [-60, 4, 0] : [60, 4, 0]; return { pts: [new THREE.Vector3(...p)], yaw: team === 'alpha' ? -Math.PI / 2 : Math.PI / 2 }; } // (nav bake run)
    return apexBakedSpawns(S, team, game);
  },
  async preload() {
    if (this._skull) return;
    const p = await apexPack('apex_skulltown', 'assets/maps/apex-skulltown/'), text = (b) => JSON.parse(new TextDecoder().decode(b));
    const manifest = text(p.manifest), navMeta = p.navMeta ? text(p.navMeta) : null;
    const [lmInner, lmOuter, gltf, door] = await Promise.all([skullTexture(p.lm_inner), skullTexture(p.lm_outer), apexGLTF(p.glb), apexGLTF(p.door)]);
    this._skull = { manifest, navMeta, nav: p.nav ? apexNav(p.nav) : null, tris: skullTris(p.collision), gltf, door: door.scene, lm: { inner: lmInner, outer: lmOuter } };
    const B = manifest.playBounds; this.bounds = { minX: Math.floor(B.minX), maxX: Math.ceil(B.maxX), minZ: Math.floor(B.minZ), maxZ: Math.ceil(B.maxZ) };
    this.killY = manifest.killY;
    if (navMeta) {
      this.objectives = navMeta.objectives; this.aiBounds = navMeta.aiBounds;
      const A = navMeta.spawns.alpha.pts[0], C = navMeta.spawns.bravo.pts[0], dx = C[0] - A[0], dz = C[2] - A[2], l = Math.hypot(dx, dz);
      this.aiAxis = { mx: (A[0] + C[0]) / 2, mz: (A[2] + C[2]) / 2, ax: dx / l, az: dz / l, half: l * 0.62, laneHalf: Math.max(30, l * 0.4) };
    }
  },
  build(b) {
    const S = this._skull && this._skull.navMeta && this._skull.navMeta.spawns, zone = (t) => { const p = S[t].pts[0]; b.spawnZone(t, p[0] - 5, p[2] - 5, p[0] + 5, p[2] + 5, S[t].yaw); };
    if (S) { zone('alpha'); zone('bravo'); } else { b.spawnZone('alpha', -65, -5, -55, 5, -Math.PI / 2); b.spawnZone('bravo', 55, -5, 65, 5, Math.PI / 2); }
    if (b.dry) return;
    const { manifest, tris, gltf, lm, nav } = this._skull;
    if (nav) b.navBaked = nav;
    b.game.camera.far = 1600; b.game.camera.updateProjectionMatrix();
    const soup = b.col.addTris(tris.pos, tris.idx, 'concrete', tris.mats);
    b.phys.triGround = new TriGround(soup);
    // the edge of the arena: invisible walls 2 m outside the play bounds (moves, shots, grenades)
    const B = this.bounds, H = 120, L = -60;
    for (const a of [[B.minX - 3, L, B.minZ - 3, B.minX - 2, H, B.maxZ + 3], [B.maxX + 2, L, B.minZ - 3, B.maxX + 3, H, B.maxZ + 3], [B.minX - 3, L, B.minZ - 3, B.maxX + 3, H, B.minZ - 2], [B.minX - 3, L, B.maxZ + 2, B.maxX + 3, H, B.maxZ + 3]]) {
      const lo = new THREE.Vector3(a[0], a[1], a[2]), hi = new THREE.Vector3(a[3], a[4], a[5]);
      b.col.addBox(lo, hi, { material: 'concrete', radar: 'wall' }); b.phys.addStaticBox(lo, hi);
    }
    // visuals: the two world halves with their lightmaps; props instanced per geometry / material / 64 m cell
    gltf.scene.updateMatrixWorld(true);
    const batches = new Map(), worldMats = new Map(), scale = Math.PI * 0.85;
    const meshes = []; let objects = 0;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return; objects++;
      if (/^World_(inner|outer)/.test(o.name) || /^World_(inner|outer)/.test(o.parent?.name || '')) {
        const part = /inner/.test(o.name + (o.parent?.name || '')) ? 'inner' : 'outer', L = lm[part], max = manifest.lightmaps[part].max;
        const conv = (m) => { const k = m.uuid + part; if (!worldMats.has(k)) worldMats.set(k, skullWorldMaterial(m, L, max * scale)); return worldMats.get(k); };
        const mesh = new THREE.Mesh(o.geometry, Array.isArray(o.material) ? o.material.map(conv) : conv(o.material));
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); mesh.matrixWorldNeedsUpdate = true;
        mesh.receiveShadow = true; mesh.castShadow = false; b.scene.add(mesh); return;
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.transparent && !/glass/i.test(m.name)) { m.alphaTest = 0.35; m.transparent = false; m.depthWrite = true; }
        if (m.alphaTest > 0 || /grass|plant|bush|foliage|leaf|fence|chain|wire/i.test(m.name)) m.side = THREE.DoubleSide;
      }
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const key = o.geometry.uuid + ':' + (Array.isArray(o.material) ? o.material.map((m) => m.uuid).join(',') : o.material.uuid) + ':' + Math.floor(p.x / 64) + ',' + Math.floor(p.z / 64);
      if (!batches.has(key)) batches.set(key, { geo: o.geometry, mat: o.material, matrices: [] });
      batches.get(key).matrices.push(o.matrixWorld.clone());
    });
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.matrices.length);
      batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
      mesh.castShadow = false; mesh.receiveShadow = true; // their shadows are in the bake
      b.scene.add(mesh); meshes.push(mesh);
    }
    const doors = new ApexDoors(b, manifest.doors, this._skull.door);
    b.mechs.push(doors, new SkullStreaming(b, soup, meshes));
    window.__skull = { objects, drawGroups: batches.size, doors: doors.doors.length, triangles: soup.n, manifest };
  }
});

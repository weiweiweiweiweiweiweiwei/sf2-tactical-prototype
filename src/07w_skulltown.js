import { CANNON, THREE, clamp } from './01_core.js';
import { TriSoup } from './04_collision.js';
import { MAPS } from './07_maps.js';
import { apexGLTF, apexPack } from './07u_apex.js';
import { ApexDoors, apexBakedSpawns, apexNav } from './07v_apex_full.js';
// v60 Skull Town (Apex Arenas / TDM, mp_rr_freedm_skulltown) rebuilt from the user's own install: the BSP world and 24k static
// props at their original transforms (tools/blender/skulltown_build.py), lighting baked in Cycles into two lightmaps — the play
// area and the scenery around it — and collision from the real triangles (TriSoup: slopes are slopes, thin props are walkable).
// tools/blender/skulltown_export.py → tools/pack-apex-js.mjs skulltown → assets/maps/apex-skulltown/pack/.

// Packed triangles (tools/pack-apex-js.mjs): 'STRQ', version 1, vertex count, triangle count, scale; Int16 x y z per vertex
// (metres × scale), Uint32 indices, Uint8 surface per triangle (TRI_SURFACES).
// gzip-packed parts (tools/pack-apex-js.mjs gzips the collision): the browser's own DecompressionStream, no library
async function apexGunzip(buf) {
  const b = new Uint8Array(buf); if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function skullTris(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0, true) === 0x5a525453 && v.getUint32(4, true) === 1) { // v62t 'STRZ' (tools/pack-apex-js.mjs strz): welded, delta / LEB128 coded
    const nv = v.getUint32(8, true), nt = v.getUint32(12, true), s = v.getFloat32(16, true), nb = v.getUint32(20, true), B = new Uint8Array(buf), pos = new Float32Array(nv * 3);
    let o = 24;
    for (let c = 0; c < 3; c++, o += nv * 2) { let pv = 0; for (let i = 0; i < nv; i++) { pv = (pv + (B[o + i] | (B[o + nv + i] << 8))) & 0xffff; pos[i * 3 + c] = ((pv << 16) >> 16) / s; } }
    const idx = new Uint32Array(nt * 3); let hi = -1, p = o;
    for (let i = 0; i < nt * 3; i++) { let z = 0, sh = 0, b; do { b = B[p++]; z |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80); const x = z === 0 ? hi + 1 : hi - z + 1; idx[i] = x; if (x > hi) hi = x; }
    return { pos, idx, mats: B.slice(o + nb, o + nb + nt) };
  }
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
  if (/thunderdome_fence|arena_start_barrier/i.test(src.name)) m.visible = false; // the Arenas hex fence and start barriers (the sky shows instead)
  if (/decal|stain|drip|_transparent|erosion/i.test(src.name)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', `
      float sunVis = 1.0;
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow sunSh = directionalLightShadows[ 0 ];
        sunVis = getShadow( directionalShadowMap[ 0 ], sunSh.shadowMapSize, sunSh.shadowIntensity, sunSh.shadowBias, sunSh.shadowRadius, vDirectionalShadowCoord[ 0 ] ); // (r169+: shadowIntensity)
      #endif
      #ifdef USE_LIGHTMAP
        vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
        float sunK = smoothstep( 0.35, 0.7, max( lightMapTexel.r, max( lightMapTexel.g, lightMapTexel.b ) ) );
        irradiance = ( lightMapTexel.rgb + vec3( 0.07, 0.078, 0.09 ) ) * lightMapIntensity * mix( 1.0, 0.4 + 0.6 * sunVis, sunK ); // + a little sky: shade and rooms never go black
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

// Prop culling past 150 m (v63m: the grenade trimesh tiles are gone, see tick).
class SkullStreaming {
  constructor(b, tris, meshes) {
    // how far a batch draws grows with its pieces' size: litter goes at 45 m, a house frame at 160 (draw calls halved)
    const M = new THREE.Matrix4();
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.getMatrixAt(0, M); m.userData.far = clamp(m.geometry.boundingSphere.radius * M.getMaxScaleOnAxis() * 35, 45, 160);
    }
    this.b = b; this.meshes = meshes; this.cullT = 0; }
  tick() {} // v63m grenades on a triangle map bounce in Match.stepGrenades (swept rays + floor rest): cannon trimesh tiles of the map
  // (16 m, 3×3 around each grenade, ~100k triangles) cost up to 100 ms a step
  render(dt) {
    if ((this.cullT -= dt) > 0) return;
    this.cullT = 0.25;
    const p = this.b.game.camera.position;
    for (const m of this.meshes) m.visible = m.boundingSphere.center.distanceTo(p) - m.boundingSphere.radius < m.userData.far;
  }
  interact() { return false; }
  prompt() { return null; }
}

// Skull Town is an Arenas map: a hex dome (live_fire_frame), its rings, girders and walls close it in. Node names are the models (a multi-material one: its parent's).
const APEX_ARENA_SHELL = /^(live_fire_frame|fs_girder_beam|fs_modular_\w*floorconnector|grave_wall_gasket|thunderdome|fake_sky)/i;

// v63i walkable surfaces you can see but not stand on (user 10-28: a ramp in the firing range, hills with nothing under them):
// tools/apex-colpatch.mjs finds the up-facing render triangles with no collision floor at or just under them and writes
// <packDir>/colpatch.js (window.APEX_COLPATCH[id] = base64 Float32, 9 per triangle); they join the collision here.
function apexColPatchLoad(id, dir) {
  if (/[?&]nocolpatch/.test(location.search)) return Promise.resolve(null); // (the tool itself measures without it)
  const get = () => (window.APEX_COLPATCH || {})[id] || null;
  if (get()) return Promise.resolve(get());
  return new Promise((res) => { const s = document.createElement('script'); s.src = dir + 'colpatch.js'; s.onload = () => res(get()); s.onerror = () => res(null); document.head.appendChild(s); });
}
function apexColPatch(id, tris, b64) {
  if (!b64) return tris;
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const add = new Float32Array(u8.buffer), n = add.length / 9, nv = tris.pos.length / 3;
  const pos = new Float32Array(tris.pos.length + add.length); pos.set(tris.pos); pos.set(add, tris.pos.length);
  const idx = new Uint32Array(tris.idx.length + n * 3); idx.set(tris.idx); for (let i = 0; i < n * 3; i++) idx[tris.idx.length + i] = nv + i;
  const mats = tris.mats ? new Uint8Array(tris.mats.length + n) : null; if (mats) mats.set(tris.mats); // (patch: the soup's default surface)
  return { pos, idx, mats };
}

// Shared by the triangle-collision Apex maps (Skull Town, the rebuilt firing range): the pack (packDir) holds glb, collision,
// manifest, lm_inner, lm_outer, door and — once tools/bake-apex-nav.mjs has run — nav + navMeta.
function apexTriMap(def) {
  return Object.assign({
    spawnPoints(team, game) {
      const S = game.def._tri.navMeta;
      if (!S) { const p = team === 'alpha' ? [-60, 4, 0] : [60, 4, 0]; return { pts: [new THREE.Vector3(...p)], yaw: team === 'alpha' ? -Math.PI / 2 : Math.PI / 2 }; } // (nav bake run)
      return apexBakedSpawns(S, team, game);
    },
    async preload() {
      if (this._tri) return;
      const LT = window.__loadT = {}, t0 = performance.now(), lap = (k) => { LT[k] = Math.round(performance.now() - t0 - Object.values(LT).reduce((a, v) => a + v, 0)); }; // v62t load profile (tools/_loadprof.mjs)
      const p = await apexPack(this.id, this.packDir), text = (b) => JSON.parse(new TextDecoder().decode(b)); lap('pack scripts + base64');
      const manifest = text(p.manifest), navMeta = p.navMeta ? text(p.navMeta) : null;
      const [lmInner, lmOuter, gltf, door] = await Promise.all([skullTexture(p.lm_inner), skullTexture(p.lm_outer), apexGLTF(p.glb), apexGLTF(p.door)]); lap('glb (Draco, WebP) + lightmaps');
      const nav = p.nav ? apexNav(p.nav) : null; lap('nav'); const tris = apexColPatch(this.id, skullTris(await apexGunzip(p.collision)), await apexColPatchLoad(this.id, this.packDir)); lap('collision gunzip');
      const soup = new TriSoup(tris.pos, tris.idx, 'concrete', tris.mats); lap('collision grid'); // (v62t here, not in build: the room's preload pays for it)
      this._tri = { manifest, navMeta, nav, tris, soup, gltf, door: door.scene, lm: { inner: lmInner, outer: lmOuter } };
      const B = manifest.playBounds; this.bounds = { minX: Math.floor(B.minX), maxX: Math.ceil(B.maxX), minZ: Math.floor(B.minZ), maxZ: Math.ceil(B.maxZ) };
      this.killY = manifest.killY;
      if (navMeta) {
        this.objectives = navMeta.objectives; this.aiBounds = navMeta.aiBounds;
        const A = navMeta.spawns.alpha.pts[0], C = navMeta.spawns.bravo.pts[0], dx = C[0] - A[0], dz = C[2] - A[2], l = Math.hypot(dx, dz);
        this.aiAxis = { mx: (A[0] + C[0]) / 2, mz: (A[2] + C[2]) / 2, ax: dx / l, az: dz / l, half: l * 0.62, laneHalf: Math.max(30, l * 0.4) };
      }
    },
    build(b) {
      const S = this._tri && this._tri.navMeta && this._tri.navMeta.spawns, zone = (t) => { const p = S[t].pts[0]; b.spawnZone(t, p[0] - 5, p[2] - 5, p[0] + 5, p[2] + 5, S[t].yaw); };
      if (S) { zone('alpha'); zone('bravo'); } else { b.spawnZone('alpha', -65, -5, -55, 5, -Math.PI / 2); b.spawnZone('bravo', 55, -5, 65, 5, Math.PI / 2); }
      if (b.dry) return;
      const { manifest, tris, gltf, lm, nav } = this._tri;
      if (nav) b.navBaked = nav;
      b.game.camera.far = 1600; b.game.camera.updateProjectionMatrix();
      const LT = window.__loadT || {}, t1 = performance.now();
      const soup = b.col.useTris(this._tri.soup);
      b.phys.triGround = new TriGround(soup);
      // the edge of the arena: invisible walls 2 m outside the play bounds (moves, shots, grenades)
      const B = this.bounds, H = 120, L = -60;
      for (const a of [[B.minX - 3, L, B.minZ - 3, B.minX - 2, H, B.maxZ + 3], [B.maxX + 2, L, B.minZ - 3, B.maxX + 3, H, B.maxZ + 3], [B.minX - 3, L, B.minZ - 3, B.maxX + 3, H, B.minZ - 2], [B.minX - 3, L, B.maxZ + 2, B.maxX + 3, H, B.maxZ + 3]]) {
        const lo = new THREE.Vector3(a[0], a[1], a[2]), hi = new THREE.Vector3(a[3], a[4], a[5]);
        b.col.addBox(lo, hi, { material: 'concrete', radar: 'wall' }); b.phys.addStaticBox(lo, hi);
      }
      // visuals: the two world halves with their lightmaps; props instanced per geometry / material / 64 m cell
      gltf.scene.updateMatrixWorld(true);
      const batches = new Map(), worldMats = new Map(), scale = Math.PI * 1.0, sunLm = manifest.lightmaps.inner.max * 0.8; // sunlit ground ≈ 80 % of the bake's top
      const meshes = []; let objects = 0;
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return; objects++;
      if (APEX_ARENA_SHELL.test(o.name) || APEX_ARENA_SHELL.test(o.parent?.name || '') || /cubemap|ascent_test_colors/i.test((Array.isArray(o.material) ? o.material[0] : o.material).name)) return; // the Arenas shell (its hex dome wears a dev test material) hides the sky; reflection-probe boxes
        if (/^World_(inner|outer)/.test(o.name) || /^World_(inner|outer)/.test(o.parent?.name || '')) {
          const part = /inner/.test(o.name + (o.parent?.name || '')) ? 'inner' : 'outer', L = lm[part], max = manifest.lightmaps[part].max;
          const conv = (m) => { const k = m.uuid + part; if (!worldMats.has(k)) worldMats.set(k, skullWorldMaterial(m, L, max * scale)); return worldMats.get(k); };
          const mesh = new THREE.Mesh(o.geometry, Array.isArray(o.material) ? o.material.map(conv) : conv(o.material));
          mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); mesh.matrixWorldNeedsUpdate = true;
          mesh.receiveShadow = true; mesh.castShadow = false; b.scene.add(mesh); return;
        }
        // v64m Apex's grass clumps (universal_grass_clump_*) came without their texture: their cards drew as flat grey / dark shards that read
        // as noise from afar (user 10-28) — left out (15 on the range, 1.8k triangles)
        if ([].concat(o.material).some((m) => /grass_clump/i.test(m.name) && !m.map)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.transparent && !/glass/i.test(m.name)) { m.alphaTest = 0.35; m.transparent = false; m.depthWrite = true; }
          if (m.alphaTest > 0 || /grass|plant|bush|foliage|leaf|fence|chain|wire/i.test(m.name)) m.side = THREE.DoubleSide;
        }
        const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
        const key = o.geometry.uuid + ':' + (Array.isArray(o.material) ? o.material.map((m) => m.uuid).join(',') : o.material.uuid) + ':' + Math.floor(p.x / 64) + ',' + Math.floor(p.z / 64);
        if (!batches.has(key)) batches.set(key, { geo: o.geometry, mat: o.material, matrices: [], light: [] });
        batches.get(key).matrices.push(o.matrixWorld.clone()); batches.get(key).light.push(o.userData.lm ?? o.parent?.userData.lm ?? -1);
      });
      for (const batch of batches.values()) {
        const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.matrices.length);
        batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
        // the bake under each prop (tools/blender/skulltown_export.py 'lm'): live sun and sky light it, so one indoors or in deep
        // shade is dimmed toward what the room around it got (full brightness from half the sunlit ground up, never below half)
        { // (every batch gets instance colours, even all-1: one shader variant per material instead of two — v60e load time)
          const c = new THREE.Color();
          batch.light.forEach((v, i) => { const k = v < 0 ? 1 : clamp(v / (sunLm * 0.5), 0.5, 1); mesh.setColorAt(i, c.setScalar(k)); }); // (≥ 0.5: the ground under a big rock is in its own shadow)
        }
        mesh.castShadow = false; mesh.receiveShadow = true; // their shadows are in the bake
        b.scene.add(mesh); meshes.push(mesh);
      }
      const doors = new ApexDoors(b, manifest.doors, this._tri.door);
      b.mechs.push(doors, new SkullStreaming(b, soup, meshes));
      window.__triMap = { objects, drawGroups: batches.size, doors: doors.doors.length, triangles: soup.n, manifest };
      LT['visuals + doors'] = Math.round(performance.now() - t1);
    }
  }, def);
}

MAPS.push(apexTriMap({
  id: 'apex_skulltown', packDir: 'assets/maps/apex-skulltown/', name: 'Apex 骷髏鎮', en: 'SKULL TOWN',
  desc: '原版場景與擺設 · 烘焙光照 · 真實三角形碰撞 · E 開門', slogan: '巨獸骸骨下的小鎮 · 屋頂、巷弄、斜坡',
  bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, indoor: false, navLevels: [], killY: -60, killOutside: true, traversal: true,
  // the sky is the Poly Haven HDRI the bake was lit by (tools/blender/skulltown_export.py SKY): background, IBL and the live sun's
  // direction (props, soldiers) all match the lightmaps
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, background: 0xb8c8d8, envIntensity: 0.7, exposure: 1.0,
  sun: { pos: [1.5, 68, -73], color: 0xfff1de, intensity: 2.6, auto: true }, hemi: [0xbcd6ee, 0x8a7356, 0.8],
  fog: { color: 0xc4ced8, near: 180, far: 1100 }, acoustics: 'outdoor', ambience: 'desert', shadowFollow: 60,
  shot: { pos: [0, 260, 120], target: [0, 0, 0] },
  // the user's Blender view (10-27), solved from 8 landmarks; fov 43.8 = Blender's 50 mm viewport lens at 16:9
  thumb: { pos: [210.4, 106.2, 17.5], target: [121.5, 61.7, 7.0], fov: 43.8 },
  objectives: { dom: [[-30, 0, 0], [0, 0, 0], [30, 0, 0]], relic: [0, 0, 0], domRadius: 5 }, // replaced by the baked ones on load
}));
// v60 the firing range, rebuilt the same way (tools/blender/apex_maps.py 'range'): the canyon around the village, centred on the
// area the old box-collision map's bots could reach
MAPS.push(apexTriMap({
  id: 'apex_full', packDir: 'assets/maps/apex-range/', name: 'Apex 訓練場・全場景', en: 'APEX FIRING RANGE',
  desc: '原版場景與擺設 · 烘焙光照 · 真實三角形碰撞 · E 開門', slogan: '峽谷裡的訓練場 · 靶場、村落、高台',
  bounds: { minX: -165, maxX: 165, minZ: -140, maxZ: 140 }, indoor: false, navLevels: [], killY: -80, killOutside: true, traversal: true,
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriBackground: true, background: 0xb8c8d8, envIntensity: 0.7, exposure: 1.0,
  sun: { pos: [-20, 70, 25], color: 0xfff1de, intensity: 2.6, auto: true }, hemi: [0xbcd6ee, 0x6f6450, 0.8],
  fog: { color: 0xc4ced8, near: 180, far: 1100 }, acoustics: 'outdoor', ambience: 'wind', shadowFollow: 60,
  shot: { pos: [0, 300, 140], target: [0, 0, 0] },
  // the user's Blender view (10-27): up at the stilt houses past the red-panel tower; solved from the axis gizmo and 5 landmarks
  thumb: { pos: [72.0, 15.9, 97.9], target: [-6.6, 35.9, 39.4], fov: 43.8 },
  objectives: { dom: [[-30, 0, 0], [0, 0, 0], [30, 0, 0]], relic: [0, 0, 0], domRadius: 5 }, // replaced by the baked ones on load
}));

export { TriGround };

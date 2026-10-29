import { THREE } from './01_core.js';
import { TriSoup } from './04_collision.js';
import { MAPS } from './07_maps.js';
import { apexGLTF } from './07u_apex.js';
import { TriGround } from './07w_skulltown.js';
/* =====================================================================
   v65o SPECIAL FORCE 2'S OWN MAPS (user 10-29: every regular SF2 map) — built from the user's install by tools/sf2_map_build.mjs:
   the level's static meshes at their own matrices plus its BSP floors / walls in one GLB, and a meta (player starts, ladders),
   shipped as assets/maps/sf2-<map>/map.js (window.SF2_MAPS[id]). The collision is the GLB's own triangles (the sky dome and other
   meshes bigger than 300 m left out), spawns ring each team's SF2 player start, bots sample the floors at run time (navLevels).
   ===================================================================== */
const sf2MapScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('missing ' + src)); document.head.appendChild(s); });

function sf2TriMap(def) {
  return Object.assign({
    indoor: false, killOutside: false, traversal: false, acoustics: 'indoor', ambience: 'warehouse',
    background: 0x8c9aa6, envIntensity: 0.55, exposure: 1.0, hemi: [0xd8e2ec, 0x5a5048, 0.9],
    sun: { pos: [30, 60, 20], color: 0xfff1de, intensity: 1.6, auto: true }, fog: { color: 0x8c9aa6, near: 80, far: 400 }, shadowFollow: 40,
    async preload() {
      if (this._s2) return;
      const key = this.id, dir = `assets/maps/sf2-${key.slice(4)}/`;
      if (!(window.SF2_MAPS && window.SF2_MAPS[key])) await sf2MapScript(dir + 'map.js');
      const d = window.SF2_MAPS[key], bin = Uint8Array.from(atob(d.glb), (c) => c.charCodeAt(0)).buffer; d.glb = null;
      const gltf = await apexGLTF(bin); gltf.scene.updateMatrixWorld(true);
      // collision: every mesh's world triangles (instances share geometry), the sky dome and other huge shells out
      const pos = [], idx = [], v = new THREE.Vector3(), box = new THREE.Box3(), size = new THREE.Vector3(), all = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        box.setFromObject(o); if (box.getSize(size).length() > 300) { o.userData.sky = true; return; }
        all.union(box);
        const g = o.geometry, P = g.attributes.position, base = pos.length / 3;
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
      });
      const soup = new TriSoup(new Float32Array(pos), new Uint32Array(idx), 'concrete');
      this._s2 = { gltf, soup, meta: d.meta };
      this.bounds = { minX: Math.floor(all.min.x) - 2, maxX: Math.ceil(all.max.x) + 2, minZ: Math.floor(all.min.z) - 2, maxZ: Math.ceil(all.max.z) + 2 };
      this.killY = all.min.y - 15;
      const levels = []; for (let y = Math.floor(all.min.y); y <= Math.ceil(all.max.y); y += 1) levels.push(y + 0.9); this.navLevels = levels; // (each 1 m slab: walkable() snaps to the floor under it)
    },
    // each team rings its SF2 player start (team 0 → alpha); the points stand on the floor and fit a soldier
    spawnPoints(team, game) {
      const S = this._s2.meta.starts, s = S.find((x) => (x.team === 0 ? 'alpha' : 'bravo') === team) || S[team === 'alpha' ? 0 : S.length - 1], pts = [], col = game.collision;
      for (let r = 0; r <= 5; r += 1.2) for (let a = 0; a < Math.PI * 2; a += r ? 1.2 / r : 7) {
        const x = s.pos[0] + Math.cos(a) * r, z = s.pos[2] + Math.sin(a) * r, g = col.groundBelow(x, s.pos[1] + 1.2, z, 0.3, 3, 0);
        if (g && !g.steep && col.fits(x, g.y + 0.05, z, 0.42, 1.8)) { const p = new THREE.Vector3(x, g.y, z); p.spawnYaw = s.yaw; pts.push(p); }
      }
      return { pts: pts.length ? pts : [new THREE.Vector3(...s.pos)], yaw: s.yaw };
    },
    build(b) {
      const S = this._s2 && this._s2.meta.starts;
      if (S) for (const s of S) { const t = s.team === 0 ? 'alpha' : 'bravo'; b.spawnZone(t, s.pos[0] - 4, s.pos[2] - 4, s.pos[0] + 4, s.pos[2] + 4, s.yaw); }
      if (b.dry) return;
      const { gltf, soup } = this._s2;
      b.col.useTris(soup); b.phys.triGround = new TriGround(soup);
      for (const l of this._s2.meta.ladders || []) b.navExtra.push(new THREE.Vector3(l[0], l[1], l[2])); // (SF2's ladder volumes: climbing is a follow-up)
      const meshes = []; gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) {
        m.removeFromParent(); m.matrixWorld.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = false; m.updateMatrix();
        m.castShadow = !m.userData.sky; m.receiveShadow = true;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { mt.side = THREE.DoubleSide; if (mt.map) mt.map.anisotropy = 4; }
        b.scene.add(m);
      }
    },
  }, def);
}

// v65o the regular SF2 maps (docs/research/sf2/map-inventory.md), one push each as they are built (docs/loop/SF2_ALL.md M3)
MAPS.push(sf2TriMap({
  id: 'sf2_alcatraz', name: 'SF2 惡魔島', en: 'ALCATRAZ', desc: 'Special Force 2 原版地圖 · 原版模型與擺設 · 三角形碰撞', slogan: '監獄牢房區 · 近距離交戰',
  bounds: { minX: -20, maxX: 20, minZ: -45, maxZ: 45 }, indoor: true, killY: -20,
  shot: { pos: [0, 40, 30], target: [0, 0, 0] }, thumb: { pos: [0, 30, 45], target: [0, 0, 0], fov: 50 },
  objectives: { dom: [[0, 0, -15], [0, 0, 8], [0, 0, 30]], relic: [0, 0, 8], domRadius: 4 },
}));

export { sf2TriMap };

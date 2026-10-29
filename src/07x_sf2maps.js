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

// v65u user 10-29: Alcatraz and Dust City taken off the map list ("almost unplayable"); the builder and their files stay for
// the 1:1 Desert Camp attempt. true lists them again.
const SF2_LISTED = false;

function sf2TriMap(def) {
  return Object.assign({
    indoor: false, killOutside: false, traversal: false, navClimb: 0.45, navGrid: 1, bodyRadius: 0.25, underFloorAirOnly: true, acoustics: 'indoor', ambience: 'warehouse',
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
        const ex = (k) => o.userData[k] || (o.parent && o.parent.userData[k]); // (glTF node extras: on the node, or its group)
        if (ex('colOnly')) o.userData.colOnly = true; else if (ex('nocol')) { o.userData.nocol = true; return; } // v65v SF2's collision: off where it turned it off, its blocking volumes in
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
      const levels = []; for (let y = Math.floor(all.min.y); y <= Math.ceil(all.max.y); y += 0.5) levels.push(y + 0.2); this.navLevels = levels; // v65v slabs every 0.5 m: NavGraph.walkable() takes a floor within ±0.25 m of the slab, so 1 m slabs missed every floor between (SF2's uneven ground: Desert Camp's graph fell into 155 pieces, no path between the bases)
    },
    // v65v every SF2 start of the team (TDM ones, tools/sf2_map_build.mjs) is a spawn point, on the floor and fitting a soldier
    spawnPoints(team, game) {
      // (SF2's TDM starts are spread over the map for respawns; a team's base is its densest cluster — 15 m cells, the starts within 12 m of
      // the densest cell's mean: Desert Camp Alpha 13 at (−15, −30), Bravo 12 at (30, 45) — v65v both teams had spawned in one corner)
      const all = this._s2.meta.starts, mine = all.filter((x) => (x.team === 0 ? 'alpha' : 'bravo') === team), pts = [], col = game.collision, cells = new Map();
      for (const s of mine) { const k = Math.round(s.pos[0] / 15) + ',' + Math.round(s.pos[2] / 15); cells.set(k, (cells.get(k) || []).concat([s])); }
      const best = [...cells.values()].sort((a, c) => c.length - a.length)[0] || [], cx = best.reduce((t, s) => t + s.pos[0], 0) / (best.length || 1), cz = best.reduce((t, s) => t + s.pos[2], 0) / (best.length || 1);
      const base = mine.filter((s) => Math.hypot(s.pos[0] - cx, s.pos[2] - cz) < 12), S = base.length ? base : mine.length ? mine : [all[team === 'alpha' ? 0 : all.length - 1]];
      for (const s of S) {
        const g = col.groundBelow(s.pos[0], s.pos[1] + 1.2, s.pos[2], 0.3, 3, 0);
        if (g && col.fits(s.pos[0], g.y + 0.05, s.pos[2], 0.3, 1.8)) { const p = new THREE.Vector3(s.pos[0], g.y, s.pos[2]); p.spawnYaw = s.yaw; pts.push(p); }
      }
      return { pts: pts.length ? pts : [new THREE.Vector3(...S[0].pos)], yaw: S[0].yaw };
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
        if (m.userData.colOnly) { m.removeFromParent(); continue; } // (a blocking volume: in the triangle soup, not drawn)
        m.removeFromParent(); m.matrixWorld.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = false; m.updateMatrix();
        m.castShadow = !m.userData.sky; m.receiveShadow = true;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { mt.side = THREE.DoubleSide; if (mt.map) mt.map.anisotropy = 4; }
        b.scene.add(m);
      }
    },
  }, def);
}

// v65o the regular SF2 maps (docs/research/sf2/map-inventory.md), one push each as they are built (docs/loop/SF2_ALL.md M3)
SF2_LISTED && MAPS.push(sf2TriMap({
  id: 'sf2_alcatraz', name: 'SF2 惡魔島', en: 'ALCATRAZ', desc: 'Special Force 2 原版地圖 · 原版模型與擺設 · 三角形碰撞', slogan: '監獄牢房區 · 近距離交戰',
  bounds: { minX: -20, maxX: 20, minZ: -45, maxZ: 45 }, indoor: true, killY: -20,
  shot: { pos: [0, 40, 30], target: [0, 0, 0] }, thumb: { pos: [0, 30, 45], target: [0, 0, 0], fov: 50 },
  objectives: { dom: [[0, 0, -15], [0, 0, 8], [0, 0, 30]], relic: [0, 0, 8], domRadius: 4 },
}));
// v65t 沙漠之都 (user 10-29): SF2's DustCity — the desert town, its BSP streets and walls, 1829 placed meshes; Alpha spawns in the
// north-west corner, Bravo in the south-east (game metres: x −44 … 76, z −38 … 43)
SF2_LISTED && MAPS.push(sf2TriMap({
  id: 'sf2_dustcity', name: 'SF2 沙漠之都', en: 'DUST CITY', desc: 'Special Force 2 原版地圖 · 原版模型與擺設 · 三角形碰撞', slogan: '沙漠城鎮 · 巷戰與屋頂狙擊',
  bounds: { minX: -46, maxX: 78, minZ: -46, maxZ: 46 }, indoor: false, killY: -20,
  shot: { pos: [16, 70, 60], target: [16, 0, 0] }, thumb: { pos: [16, 80, 70], target: [16, 0, 0], fov: 55 },
  objectives: { dom: [[-12, 0, -22], [8, 0, 0], [28, 0, 22]], relic: [8, 0, 0], domRadius: 5 },
}));

export { sf2TriMap };

// v65v Desert Camp (user 10-29: 1:1, the SF2 map to keep) — every placed mesh incl. SFStaticMeshActor / SFKActorNoSync (archetype meshes),
// collision as SF2 sets it (components with CollideActors / BlockActors off left out, its 29 blocking volumes in); Alpha (TDM starts)
// south of the square, Bravo north (game metres: x −36 … 55, z −30 … 57)
MAPS.push(sf2TriMap({
  id: 'sf2_desertcamp', name: 'SF2 沙漠營地', en: 'DESERT CAMP', desc: 'Special Force 2 原版地圖 1:1 · 原版模型、擺設與碰撞', slogan: '沙漠營地 · 中央廣場與兩側巷道',
  bounds: { minX: -38, maxX: 57, minZ: -32, maxZ: 59 }, indoor: false, killY: -20,
  shot: { pos: [10, 60, 70], target: [10, 0, 12] }, thumb: { pos: [10, 70, 80], target: [10, 0, 12], fov: 55 },
  objectives: { dom: [[-4, 0, -12], [3, 0, 7], [9, 0, 26]], relic: [3, 0, 7], domRadius: 5 },
}));

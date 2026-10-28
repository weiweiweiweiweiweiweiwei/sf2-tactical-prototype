import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* =====================================================================
   CORE CONFIG — movement, damage model, modes, difficulty, scoring.
   ===================================================================== */
const CFG = {
  gravity: -20,
  fixedStep: 1 / 60, // v63g the whole simulation (Match.tick) — was 1/120 for movement, weapons and physics only
  player: {
    radius: 0.34, height: 1.8, crouchHeight: 1.2, eye: 1.64, crouchEye: 1.06,
    stepHeight: 0.45, airStep: 0.36, jumpVel: 7.0, jumpBuffer: 0.12,
    groundAccel: 14, airAccel: 10, airCap: 0.85,
    friction: 8, brakeFriction: 18, stopSpeed: 3.2,
    sprintMult: 1.3, crouchMult: 0.36, hp: 100, climbSpeed: 3.4, baseSpeed: 5.9, sf2Speed: 6.43, // v64r sf2Speed: SF2's MaxSpeed 390 UU/s in m/s — the M4A1 alone (load 4.1 → 340.1) walks the old 5.9 × 0.95
  },
  bot: { eye: 1.6, runSpeed: 4.9, patrolSpeed: 3.3 },
  spawnProtect: 3.5,
  respawn: 3.0,
  assistWindow: 10,
};

// Score awarded to the killer's team (team score = sum of member scores).
const POINTS = { head: 50, body: 30, knife: 50, grenade: 40, assist: 15, capture: 75, relic: 150 };

// Hit-zone multipliers (chest = weapon base damage).
const PART_MULT = { head: 2.5, chest: 1, stomach: 0.9, thigh: 0.75, shin: 0.75, foot: 0.75 }; // CLAUDE.md §4.2 (v21): head ×2.5, chest 1, abdomen 0.9, limbs 0.75
// v58 damage models (room 設置 → 扣血機制). 'sf2': the multipliers above, range falloff, sniper headshots kill, and a helmet
// that a headshot knocks off when it would not kill (that hit counts as a body hit; the bare head takes the full ×2.5 after).
// 'apex' (Apex Legends, Season 24–30, 2025–26): 100 HP plus a body shield levelled by Evo — the damage you deal — to 50 / 75 /
// 100; damage hits the shield first and the rest of that bullet carries into health; per-shot damage, head / leg multipliers
// and headshot range are the gun's Apex counterpart's (v62u: APEX_WEAPONS, apexFor; helmets no longer reduce headshots); no range
// falloff except shotguns; no sniper one-shot rule. Health and shields come back after 4 s without damage, as in Apex's Mixtape
// modes (user: option 1B). Evo thresholds are scaled down from Apex's 450 / 1700 for respawn matches; each soldier keeps its Evo.
const APEX = {
  shields: [50, 75, 100], evo: [0, 150, 500], regenDelay: 4, regenHp: 5, regenShield: 5, // v60 user: 5 a second (health, then shield)
};
const APEX_STEP = 0.8; // v59 step height on the Apex maps (def.traversal): their 1 m collision columns step 0.5–0.75 m on a walkable slope
const apexShield = (evo) => APEX.shields[APEX.evo.reduce((lv, need, i) => (evo >= need ? i : lv), 0)];
const PART_LABEL = { head: '頭部', chest: '胸部', stomach: '腹部', thigh: '大腿', shin: '小腿', foot: '腳' };

/* ---------------------------------------------------------------------
   WEAPON DATABASE — data-driven. Each entry uses the public schema
   (name, type, damage, fireRate, recoilPitch, recoilYaw, recoilRecovery,
   hipSpread, adsSpread, adsFov, adsType, mobility, maxAmmo, reloadTime,
   modelUrl) plus optional tuning; `compileWeapon` turns it into the
   runtime definition. Adding a weapon = adding one entry.
     • v21 damage model (CLAUDE.md §4.2): damageNear / damageFar with linear falloff between falloffStart and
       falloffEnd (m); parts head ×2.5 · chest 1 · abdomen 0.9 · limbs 0.75; sniper headshot = kill.
     • Rifles 25–34 near → 3–4 chest hits close, 4–5 far; rifle headshots need 2.
     • v53 fire rate / reload / ADS speed of the rifles marked 'SF2 EU wiki (unverified)' follow docs/research/sf2/evidence/sf2_params.json
       (adsSpeed 12 ≈ 0.25 s, 10 ≈ 0.30 s to 95 %). Unverified search-snippet values: tune freely if they play wrong.
   ------------------------------------------------------------------- */
const WEAPON_DATABASE = {
  m4a1: {
    // v62d timing from SF2's own class default (docs/research/sf2/client-data): FireInterval 0.096, ReloadTimes[0] 2.3,
    // EquipTime 0.8, ZoomingInTime 0.25 (adsSpeed 12 ≈ 0.25 s); adsFov 55 = fZoomedFOV. Damage stays on the balance rules.
    name: 'M4A1', type: 'assault', slot: 'primary', damageNear: 26, damageFar: 20, falloffStart: 25, falloffEnd: 60, fireRate: 0.096,
    recoilPitch: 0.012, recoilYaw: 0.009, recoilRecovery: 9,
    hipSpread: 0.075, adsSpread: 0.0022, adsFov: 55, adsType: '3d_sight', mobility: 0.95, maxAmmo: 30, reloadTime: 2.3, equipTime: 0.8, adsSpeed: 12, modelUrl: null,
    // v62f SF2's own viewmodel lenses — UE3 FOVs are HORIZONTAL: aimed fZoomedMeshFOV 35 (16:9: 20.1° vertical, matches the user's SF2
    // ADS screenshot to the pixel); v62i hip = the weapon's fZoomOutFOV (M4A1 60 → 36°; the user's SF2 hip shots fit it: AK-103 60, G36C 50),
    // reaching off the bottom-right corner (v62f took that for a mistake and used 90)
    vmHFov: 60, vmAdsHFov: 35, sf2ZoomIn: [-3, 0, -0.87], sf2ZoomOut: [-1, 0, 0], sf2ReloadAnim: 2.533, // v64m SF2's ReloadBlendTime (the Reload clip's length; rounds in at reloadTime)
    model: 'm4', sound: 'm4', sf2: 'm4a1', tracerEvery: 2, penetration: 1, desc: '均衡的全自動步槍，全息瞄具。',
    // v62e SF2's own recoil block (Default__SFCWeaponM4A1.RecoilDefault over SFCWeaponARBase, RecoilZoomModifier, RecoilCrouchModifier)
    sf2Recoil: { nextCrossVert: 1.26, maxCrossVert: 14, vertInc: 9000, vertDec: 12, crossDecreasInc: 9, incline: 0.5, forceCorrection: 50,
      domDefault: 0.25, domZoomDefault: 0, domInc: 0.13, domMax: 2, domMin: 0.1, domDec: 6, maxMovingValue: 0.7, mulValueRun: 0.8, mulValueJump: 6,
      zoomMod: 0.6, crouchMod: 0.9 },
  },
  g36c: {
    name: 'G36C 黃金 消音', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 25, falloffEnd: 60, fireRate: 0.08,
    recoilPitch: 0.011, recoilYaw: 0.012, recoilRecovery: 10,
    hipSpread: 0.07, adsSpread: 0.0018, adsFov: 42, vmAdsFov: 17, adsVertical: 0.075, adsType: 'red_dot', mobility: 0.95, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'g36c', sound: 'g36s', suppressed: true, tracerEvery: 0, penetration: 1, desc: 'EOTech 全息瞄具 + 消音器，槍聲小、不暴露雷達。',
  },
  g36c_gold: { // v45: the same gold G36C (Blender model) with the G36 four-prong flash hider instead of the can
    name: 'G36C 黃金', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 25, falloffEnd: 60, fireRate: 0.08,
    recoilPitch: 0.011, recoilYaw: 0.012, recoilRecovery: 10,
    hipSpread: 0.07, adsSpread: 0.0018, adsFov: 42, vmAdsFov: 17, adsVertical: 0.075, adsType: 'red_dot', mobility: 0.95, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'g36c', sound: 'g36', tracerEvery: 2, penetration: 1, desc: 'EOTech 全息瞄具 + 四叉消焰器，5.56 清脆槍聲，開火會上敵方雷達。',
  },
  // v62h Special Force 2's own (black) G36C, its flip-up iron sight on the 'Sight' socket; timing / recoil from Default__SFCWeaponG36C.
  // Damage on the balance rules, as the gold ones.
  g36c_sf2: {
    name: 'G36C', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 25, falloffEnd: 60, fireRate: 0.109,
    recoilPitch: 0.011, recoilYaw: 0.012, recoilRecovery: 10,
    hipSpread: 0.07, adsSpread: 0.0018, adsFov: 55, adsType: '3d_sight', mobility: 0.95, maxAmmo: 30, reloadTime: 2.28, equipTime: 0.85, adsSpeed: 12, modelUrl: null,
    vmHFov: 50, vmAdsHFov: 40, model: 'g36c_sf2', sound: 'g36', sf2: 'g36c', tracerEvery: 2, penetration: 1, tp: { len: 0.72, body: 'dark', mag: 'box' },
    sf2Recoil: { nextCrossVert: 1.78, maxCrossVert: 10.6, vertInc: 15000, vertDec: 13, crossDecreasInc: 15, incline: 0.05, forceCorrection: 50,
      domDefault: 0.15, domZoomDefault: 0, domInc: 0.3, domMax: 2.2, domMin: 0, domDec: 1.4, maxMovingValue: 0.8, mulValueRun: 0.4, mulValueJump: 6,
      zoomMod: 0.35, crouchMod: 0.9 },
    sf2ZoomIn: [2.4, -0.002, 0.3], sf2ReloadSounds: [[0.12, 'magout'], [0.32, 'magin'], [0.76, 'charge']], sf2ReloadAnim: 2.5, // v64m SF2's ReloadBlendTime (the Reload clip's length; rounds in at reloadTime)
    desc: 'SF2 原版 G36C：5.56mm、輕巧，後座力小、開鏡穩，翻轉式機械瞄具。',
  },
  mp5: {
    name: 'MP5', type: 'smg', slot: 'primary', damageNear: 25, damageFar: 16, falloffStart: 10, falloffEnd: 35, fireRate: 0.07,
    recoilPitch: 0.008, recoilYaw: 0.008, recoilRecovery: 12,
    hipSpread: 0.055, adsSpread: 0.003, adsFov: 58, adsType: '3d_sight', mobility: 1.02, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'mp5', sound: 'mp5', range: 170, tracerEvery: 3, desc: '經典衝鋒槍，腰射較穩定。',
  },
  mp5k: { // v62z (loop H3) Special Force 2's own MP5K (tools/sf2_rig_build.mjs mp5k): damage on the MP5's balance; timing, lenses and
    // recoil from its SF2 class (SF2_WEAPONS below, tools/sf2_weapon_table.py)
    name: 'MP5K', type: 'smg', slot: 'primary', damageNear: 25, damageFar: 16, falloffStart: 10, falloffEnd: 35, fireRate: 0.07,
    recoilPitch: 0.008, recoilYaw: 0.008, recoilRecovery: 12,
    hipSpread: 0.055, adsSpread: 0.003, adsFov: 55, adsType: '3d_sight', mobility: 1.04, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'mp5k', sound: 'mp5', sf2: 'mp5k', range: 160, tracerEvery: 3, tp: { len: 0.36, body: 'dark', mag: 'box' }, desc: '短槍管 MP5，SF2 原版槍模與動畫。',
  },
  p90: {
    name: 'P90', type: 'smg', slot: 'primary', damageNear: 22, damageFar: 14, falloffStart: 10, falloffEnd: 35, fireRate: 0.066,
    recoilPitch: 0.006, recoilYaw: 0.007, recoilRecovery: 14,
    hipSpread: 0.05, adsSpread: 0.0035, adsFov: 60, adsType: 'red_dot', mobility: 1.05, maxAmmo: 50, reloadTime: 2.5, modelUrl: null,
    model: 'p90', sound: 'p90', range: 160, tracerEvery: 3, desc: '無托結構、頂置 50 發彈匣，射速最快。',
  },
  remington870: {
    name: 'Remington 870', type: 'shotgun', slot: 'primary', damageNear: 18, damageFar: 4, falloffStart: 5, falloffEnd: 25, pellets: 8, fireRate: 1.0,
    recoilPitch: 0.08, recoilYaw: 0.02, recoilRecovery: 6,
    hipSpread: 0.11, adsSpread: 0.075, adsFov: 65, adsType: 'none', mobility: 0.9, maxAmmo: 8, reloadTime: 3.5, modelUrl: null,
    model: 'm870', sound: 'm870', range: 60, shellReload: 0.44, tracerEvery: 0, desc: '泵動式散彈槍，8 顆彈丸，貼身一槍致命。',
  },
  m249: {
    name: 'M249', type: 'lmg', slot: 'primary', damageNear: 28, damageFar: 21, falloffStart: 30, falloffEnd: 80, fireRate: 0.075,
    recoilPitch: 0.011, recoilYaw: 0.014, recoilRecovery: 8,
    hipSpread: 0.09, adsSpread: 0.004, adsFov: 55, adsType: '3d_sight', mobility: 0.8, maxAmmo: 100, reloadTime: 5.5, modelUrl: null,
    model: 'm249', sound: 'm249', penetration: 2, range: 300, adsSpeed: 10, reserveMult: 2, tracerEvery: 2, desc: '輕機槍：100 發彈鏈，換彈慢、移動慢。',
  },
  cheytac_m200: {
    name: 'CheyTac M200', type: 'sniper', slot: 'primary', damageNear: 120, damageFar: 105, falloffStart: 60, falloffEnd: 200, fireRate: 1.2,
    recoilPitch: 0.075, recoilYaw: 0.01, recoilRecovery: 5,
    hipSpread: 0.15, adsSpread: 0.0, adsFov: 15, adsType: '2d_scope_overlay', mobility: 0.8, maxAmmo: 5, reloadTime: 3.2, modelUrl: null,
    model: 'm200', sound: 'm200', zoomFovs: [15, 7], penetration: 2, range: 450, adsSpeed: 16, tracerEvery: 1, desc: '栓動狙擊，站定開鏡第 1 幀 100% 精準。',
  },
  p226: {
    name: 'P226', type: 'pistol', slot: 'secondary', damageNear: 28, damageFar: 18, falloffStart: 10, falloffEnd: 35, fireRate: 0.18,
    recoilPitch: 0.03, recoilYaw: 0.005, recoilRecovery: 12,
    hipSpread: 0.03, adsSpread: 0.004, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 15, reloadTime: 1.5, modelUrl: null,
    model: 'p226', sound: 'p226', range: 160, desc: '半自動手槍，爆頭 2 槍。',
  },
  deagle: {
    name: 'Desert Eagle', type: 'pistol', slot: 'secondary', damageNear: 50, damageFar: 34, falloffStart: 12, falloffEnd: 40, fireRate: 0.3,
    recoilPitch: 0.05, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.04, adsSpread: 0.004, adsFov: 58, adsType: '3d_sight', mobility: 0.97, maxAmmo: 7, reloadTime: 2.1, modelUrl: null,
    model: 'deagle', sound: 'deagle', range: 180, penetration: 1, desc: '.50 大口徑，身體 3 槍、爆頭 2 槍。',
  },
  /* ------------------------------ v5 arsenal (31 guns, ≥5 per class) ------------------------------ */
  ak47: {
    name: 'AK-47', type: 'assault', slot: 'primary', damageNear: 34, damageFar: 25, falloffStart: 25, falloffEnd: 60, fireRate: 0.113, recoilPitch: 0.016, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.08, adsSpread: 0.0028, adsFov: 58, adsType: '3d_sight', mobility: 0.93, maxAmmo: 30, reloadTime: 2.4, modelUrl: null, adsSpeed: 12,
    sound: 'ak', penetration: 2, bloomPerShot: 0.005, bloomMax: 0.032, tp: { len: 0.9, body: 'wood', mag: 'curve' }, desc: '7.62mm 重火力，後座力大、穿透強，機械瞄具。', // v53 SF2 EU wiki (unverified): RPM/reload/ADS
  },
  // v62h Special Force 2's own AK-103 (model, animation, sounds from the user's install; timing / recoil from Default__SFCWeaponAK103,
  // docs/research/sf2/client-data). Damage on the balance rules, as the AK-47 (same 7.62 mm).
  ak103: {
    name: 'AK-103', type: 'assault', slot: 'primary', damageNear: 34, damageFar: 25, falloffStart: 25, falloffEnd: 60, fireRate: 0.115, recoilPitch: 0.016, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.08, adsSpread: 0.0028, adsFov: 55, adsType: '3d_sight', mobility: 0.93, maxAmmo: 30, reloadTime: 2.4, equipTime: 0.9, adsSpeed: 12, modelUrl: null,
    vmHFov: 60, vmAdsHFov: 40, model: 'ak103', sound: 'ak', sf2: 'ak103', penetration: 2, tracerEvery: 2, tp: { len: 0.9, body: 'dark', mag: 'curve' },
    sf2Recoil: { nextCrossVert: 2.04, maxCrossVert: 13, vertInc: 15000, vertDec: 13, crossDecreasInc: 15, incline: 0.15, forceCorrection: 50,
      domDefault: 0.1, domZoomDefault: 0, domInc: 0.4, domMax: 2.5, domMin: 0, domDec: 1.35, maxMovingValue: 1.2, mulValueRun: 0.1, mulValueJump: 6,
      zoomMod: 0.3, crouchMod: 0.8 },
    sf2ZoomIn: [-3, 0, -0.28], sf2ZoomOut: [0, 0, -0.5], sf2ReloadSounds: [[0.13, 'magout'], [0.39, 'magin'], [0.76, 'charge']], sf2ReloadAnim: 2.533, // v64m SF2's ReloadBlendTime (the Reload clip's length; rounds in at reloadTime)
    desc: 'SF2 原版 AK-103：7.62mm、黑色聚合物護木，後座力大但開鏡穩，機械瞄具。',
  },
  scarl: {
    name: 'SCAR-L', type: 'assault', slot: 'primary', damageNear: 28, damageFar: 21, falloffStart: 25, falloffEnd: 60, fireRate: 0.103, recoilPitch: 0.011, recoilYaw: 0.008, recoilRecovery: 10,
    hipSpread: 0.072, adsSpread: 0.0019, adsFov: 52, adsType: '3d_sight', mobility: 0.94, maxAmmo: 30, reloadTime: 2.3, modelUrl: null, adsSpeed: 12,
    sound: 'scar', penetration: 1, tp: { len: 0.88, body: 'tan', mag: 'box' }, desc: '沙色模組化步槍，後座柔和、全息瞄具。', // v53 SF2 EU wiki (unverified): RPM/reload/ADS
  },
  famas: {
    name: 'FAMAS', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 18, falloffStart: 25, falloffEnd: 60, fireRate: 0.087, recoilPitch: 0.0105, recoilYaw: 0.013, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0028, adsFov: 56, adsType: '3d_sight', mobility: 0.96, maxAmmo: 25, reloadTime: 2.7, modelUrl: null,
    sound: 'famas', tp: { len: 0.76, body: 'dark', mag: 'box', bull: true }, desc: '法國無托步槍，射速快、精準，提把機械瞄具。', // v53 SF2 EU wiki (unverified): RPM
  },
  aug: {
    name: 'Steyr AUG', type: 'assault', slot: 'primary', damageNear: 27, damageFar: 22, falloffStart: 25, falloffEnd: 70, fireRate: 0.085, recoilPitch: 0.0095, recoilYaw: 0.007, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0014, adsFov: 40, adsType: 'red_dot', mobility: 0.95, maxAmmo: 30, reloadTime: 2.4, modelUrl: null,
    sound: 'm4', rate: 0.94, tp: { len: 0.8, body: 'green', mag: 'box', bull: true, scope: true }, desc: '無托步槍，內建 1.5 倍光學瞄具，最精準的突擊步槍。',
  },
  ump45: {
    name: 'UMP45', type: 'smg', slot: 'primary', damageNear: 30, damageFar: 18, falloffStart: 10, falloffEnd: 35, fireRate: 0.092, recoilPitch: 0.0105, recoilYaw: 0.009, recoilRecovery: 11,
    hipSpread: 0.055, adsSpread: 0.003, adsFov: 58, adsType: 'red_dot', mobility: 1.0, maxAmmo: 25, reloadTime: 2.1, modelUrl: null,
    sound: 'ump', range: 150, tp: { len: 0.62, body: 'dark', mag: 'box' }, desc: '.45 大口徑衝鋒槍，單發傷害高、射速慢。',
  },
  vector: {
    name: 'KRISS Vector', type: 'smg', slot: 'primary', damageNear: 20, damageFar: 12, falloffStart: 10, falloffEnd: 30, fireRate: 0.052, recoilPitch: 0.0055, recoilYaw: 0.006, recoilRecovery: 15,
    hipSpread: 0.05, adsSpread: 0.0035, adsFov: 60, adsType: 'red_dot', mobility: 1.04, maxAmmo: 25, reloadTime: 1.9, modelUrl: null,
    sound: 'vector', range: 130, tp: { len: 0.6, body: 'dark', mag: 'box' }, desc: 'Super V 減後座系統，1150 RPM 極速但彈匣小。',
  },
  mp7: {
    name: 'MP7A1', type: 'smg', slot: 'primary', damageNear: 22, damageFar: 15, falloffStart: 10, falloffEnd: 35, fireRate: 0.063, recoilPitch: 0.0065, recoilYaw: 0.0065, recoilRecovery: 14,
    hipSpread: 0.048, adsSpread: 0.003, adsFov: 60, adsType: 'red_dot', mobility: 1.06, maxAmmo: 40, reloadTime: 2.0, modelUrl: null,
    sound: 'mp7', range: 160, penetration: 1, tp: { len: 0.52, body: 'dark', mag: 'none' }, desc: '4.6mm 穿甲彈，體積最小、機動性最高。',
  },
  rpk: {
    name: 'RPK', type: 'lmg', slot: 'primary', damageNear: 30, damageFar: 22, falloffStart: 30, falloffEnd: 80, fireRate: 0.1, recoilPitch: 0.013, recoilYaw: 0.012, recoilRecovery: 8,
    hipSpread: 0.085, adsSpread: 0.0035, adsFov: 56, adsType: '3d_sight', mobility: 0.85, maxAmmo: 75, reloadTime: 4.2, modelUrl: null,
    sound: 'ak', rate: 0.92, penetration: 2, reserveMult: 3, tp: { len: 1.04, body: 'wood', mag: 'drum' }, desc: 'AK 系重槍管機槍，75 發彈鼓，機械瞄具。',
  },
  negev: {
    name: 'Negev', type: 'lmg', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 30, falloffEnd: 80, fireRate: 0.066, recoilPitch: 0.01, recoilYaw: 0.015, recoilRecovery: 8,
    hipSpread: 0.095, adsSpread: 0.0045, adsFov: 54, adsType: 'red_dot', mobility: 0.8, maxAmmo: 150, reloadTime: 5.8, modelUrl: null,
    sound: 'm249', rate: 1.08, reserveMult: 2, tp: { len: 1.0, body: 'dark', mag: 'belt' }, desc: '150 發彈鏈、900 RPM 壓制火力，左右晃動大。',
  },
  pkm: {
    name: 'PKM', type: 'lmg', slot: 'primary', damageNear: 32, damageFar: 25, falloffStart: 30, falloffEnd: 90, fireRate: 0.09, recoilPitch: 0.014, recoilYaw: 0.013, recoilRecovery: 7,
    hipSpread: 0.09, adsSpread: 0.004, adsFov: 55, adsType: '3d_sight', mobility: 0.76, maxAmmo: 100, reloadTime: 6.2, modelUrl: null,
    sound: 'pkm', penetration: 2, reserveMult: 2, tp: { len: 1.12, body: 'dark', mag: 'belt' }, desc: '7.62×54R 通用機槍，穿透與射程最佳，非常笨重。',
  },
  mg42: {
    name: 'MG42', type: 'lmg', slot: 'primary', damageNear: 26, damageFar: 19, falloffStart: 30, falloffEnd: 80, fireRate: 0.05, recoilPitch: 0.012, recoilYaw: 0.018, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.005, adsFov: 56, adsType: '3d_sight', mobility: 0.74, maxAmmo: 50, reloadTime: 5.0, modelUrl: null,
    sound: 'mg42', penetration: 2, reserveMult: 3, tp: { len: 1.18, body: 'dark', mag: 'drum' }, desc: '「希特勒電鋸」1200 RPM，散熱槍管套，極難控制。',
  },
  benelli_m4: {
    name: 'Benelli M4', type: 'shotgun', slot: 'primary', damageNear: 15, damageFar: 3.5, falloffStart: 5, falloffEnd: 25, pellets: 8, fireRate: 0.26, recoilPitch: 0.06, recoilYaw: 0.02, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.068, adsFov: 64, adsType: '3d_sight', mobility: 0.9, maxAmmo: 7, reloadTime: 3.3, modelUrl: null,
    sound: 'm870', rate: 1.06, pump: false, shellReload: 0.45, range: 55, tracerEvery: 0, tp: { len: 0.98, body: 'dark', mag: 'none' }, desc: '半自動散彈槍（戰術版伸縮托），連發速度快。',
  },
  m1014: {
    name: 'M1014', type: 'shotgun', slot: 'primary', damageNear: 16, damageFar: 3.5, falloffStart: 5, falloffEnd: 25, pellets: 8, fireRate: 0.3, recoilPitch: 0.065, recoilYaw: 0.02, recoilRecovery: 7,
    hipSpread: 0.105, adsSpread: 0.072, adsFov: 64, adsType: '3d_sight', mobility: 0.88, maxAmmo: 8, reloadTime: 3.8, modelUrl: null,
    sound: 'm870', rate: 1.0, pump: false, shellReload: 0.46, range: 55, tracerEvery: 0, tp: { len: 1.02, body: 'tan', mag: 'none' }, desc: 'Benelli M4 的美軍版（固定托、沙色），8 發管式彈倉。',
  },
  saiga12: {
    name: 'Saiga-12', type: 'shotgun', slot: 'primary', damageNear: 13, damageFar: 3, falloffStart: 5, falloffEnd: 22, pellets: 9, fireRate: 0.22, recoilPitch: 0.07, recoilYaw: 0.022, recoilRecovery: 7,
    hipSpread: 0.11, adsSpread: 0.08, adsFov: 64, adsType: '3d_sight', mobility: 0.9, maxAmmo: 8, reloadTime: 3.0, modelUrl: null,
    sound: 'saiga', pump: false, range: 50, tracerEvery: 0, tp: { len: 0.95, body: 'dark', mag: 'box' }, desc: 'AK 系統半自動散彈槍，彈匣供彈、換彈最快。',
  },
  ksg: {
    name: 'KSG', type: 'shotgun', slot: 'primary', damageNear: 17, damageFar: 4, falloffStart: 5, falloffEnd: 25, pellets: 8, fireRate: 0.8, recoilPitch: 0.075, recoilYaw: 0.02, recoilRecovery: 6,
    hipSpread: 0.1, adsSpread: 0.07, adsFov: 64, adsType: 'red_dot', mobility: 0.9, maxAmmo: 14, reloadTime: 5.2, modelUrl: null,
    sound: 'm870', rate: 0.96, shellReload: 0.36, range: 60, tracerEvery: 0, tp: { len: 0.72, body: 'dark', mag: 'none', bull: true }, desc: '雙管式彈倉無托泵動散彈槍，14 發容量。',
  },
  awp: {
    name: 'AWP', type: 'sniper', slot: 'primary', damageNear: 115, damageFar: 100, falloffStart: 60, falloffEnd: 200, fireRate: 1.45, recoilPitch: 0.07, recoilYaw: 0.01, recoilRecovery: 5,
    hipSpread: 0.15, adsSpread: 0.0, adsFov: 18, adsType: '2d_scope_overlay', mobility: 0.78, maxAmmo: 10, reloadTime: 3.6, modelUrl: null,
    sound: 'awp', zoomFovs: [18, 8], penetration: 2, range: 450, adsSpeed: 15, tracerEvery: 1, tp: { len: 1.18, body: 'green', mag: 'box', scope: true }, desc: '經典綠色拇指孔槍托，10 發彈匣，一槍斃命。',
  },
  barrett: {
    name: 'Barrett M82', type: 'sniper', slot: 'primary', damageNear: 150, damageFar: 135, falloffStart: 60, falloffEnd: 220, fireRate: 0.45, recoilPitch: 0.11, recoilYaw: 0.02, recoilRecovery: 4,
    hipSpread: 0.18, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.7, maxAmmo: 10, reloadTime: 4.2, modelUrl: null,
    sound: 'barrett', bolt: false, zoomFovs: [20, 9], penetration: 3, range: 500, adsSpeed: 12, tracerEvery: 1, tp: { len: 1.4, body: 'dark', mag: 'box', scope: true }, desc: '.50 BMG 半自動反器材步槍，打腿也一槍倒，後座驚人。',
  },
  kar98k: {
    name: 'Kar98k', type: 'sniper', slot: 'primary', damageNear: 105, damageFar: 90, falloffStart: 50, falloffEnd: 180, fireRate: 1.3, recoilPitch: 0.06, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.12, adsSpread: 0.0, adsFov: 28, adsType: '2d_scope_overlay', mobility: 0.9, maxAmmo: 5, reloadTime: 3.0, modelUrl: null,
    sound: 'kar98', zoomFovs: [28, 14], penetration: 2, range: 400, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.1, body: 'wood', mag: 'none', scope: true }, desc: '二戰木製栓動步槍，低倍鏡、開鏡快、輕巧。',
  },
  svd: {
    name: 'SVD Dragunov', type: 'sniper', slot: 'primary', damageNear: 60, damageFar: 50, falloffStart: 50, falloffEnd: 180, fireRate: 0.32, recoilPitch: 0.045, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.0008, adsFov: 26, adsType: '2d_scope_overlay', mobility: 0.86, maxAmmo: 10, reloadTime: 3.0, modelUrl: null,
    sound: 'svd', bolt: false, zoomFovs: [26, 13], penetration: 2, range: 400, adsSpeed: 16, tracerEvery: 1, tp: { len: 1.2, body: 'wood', mag: 'box', scope: true }, desc: '半自動精確射手步槍：身體 2 槍、爆頭 1 槍，射速快。',
  },
  glock18: {
    name: 'Glock 18', type: 'pistol', slot: 'secondary', damageNear: 20, damageFar: 12, falloffStart: 8, falloffEnd: 30, fireRate: 0.05, recoilPitch: 0.018, recoilYaw: 0.014, recoilRecovery: 12,
    hipSpread: 0.035, adsSpread: 0.006, adsFov: 62, adsType: '3d_sight', mobility: 1.02, maxAmmo: 20, reloadTime: 1.6, modelUrl: null,
    sound: 'p226', rate: 1.12, auto: true, range: 120, tp: { len: 0.2, body: 'dark', pistol: true }, desc: '全自動手槍，1200 RPM，爆頭 2 槍。',
  },
  usp: {
    name: 'USP-S', type: 'pistol', slot: 'secondary', damageNear: 26, damageFar: 17, falloffStart: 10, falloffEnd: 35, fireRate: 0.16, recoilPitch: 0.024, recoilYaw: 0.006, recoilRecovery: 12,
    hipSpread: 0.026, adsSpread: 0.0035, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 12, reloadTime: 1.7, modelUrl: null,
    sound: 'usp', suppressed: true, range: 170, tp: { len: 0.34, body: 'dark', pistol: true }, desc: '消音手槍：安靜、不暴露雷達、最精準的副武器。',
  },
  m1911: {
    name: 'Colt M1911', type: 'pistol', slot: 'secondary', damageNear: 34, damageFar: 22, falloffStart: 10, falloffEnd: 35, fireRate: 0.2, recoilPitch: 0.04, recoilYaw: 0.01, recoilRecovery: 9,
    hipSpread: 0.032, adsSpread: 0.0045, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 7, reloadTime: 1.8, modelUrl: null,
    sound: 'm1911', range: 170, tp: { len: 0.22, body: 'steel', pistol: true }, desc: '.45 ACP 經典手槍：身體 3 槍、爆頭 2 槍。',
  },
  // ---------------- v40 SF2 arsenal, batch 1 (models reused from the closest existing gun; stats from namu.wiki hand-feel notes) ----------------
  m16a3: {
    name: 'M16A3', type: 'assault', slot: 'primary', damageNear: 28, damageFar: 22, falloffStart: 30, falloffEnd: 70, fireRate: 0.103, recoilPitch: 0.0135, recoilYaw: 0.008, recoilRecovery: 9,
    hipSpread: 0.08, adsSpread: 0.0018, adsFov: 54, adsType: '3d_sight', mobility: 0.93, maxAmmo: 30, reloadTime: 2.3, modelUrl: null, adsSpeed: 12,
    sound: 'm4', rate: 0.95, penetration: 1, tp: { len: 0.98, body: 'dark', mag: 'box' }, desc: '長槍管 M16，射程與精度高於 M4，後座略大。', // v53 SF2 EU wiki (unverified): RPM/reload/ADS
  },
  k2: {
    name: 'K2', type: 'assault', slot: 'primary', damageNear: 27, damageFar: 20, falloffStart: 25, falloffEnd: 60, fireRate: 0.084, recoilPitch: 0.0115, recoilYaw: 0.0095, recoilRecovery: 10,
    hipSpread: 0.072, adsSpread: 0.0021, adsFov: 55, adsType: '3d_sight', mobility: 0.96, maxAmmo: 30, reloadTime: 2.2, modelUrl: null,
    sound: 'm4', rate: 1.04, penetration: 1, tp: { len: 0.9, body: 'dark', mag: 'box' }, desc: '韓國制式步槍，平衡好用、機動性佳。',
  },
  xm8: {
    name: 'XM8', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 25, falloffEnd: 60, fireRate: 0.107, recoilPitch: 0.0095, recoilYaw: 0.0075, recoilRecovery: 11,
    hipSpread: 0.068, adsSpread: 0.0019, adsFov: 50, adsType: 'red_dot', mobility: 0.98, maxAmmo: 30, reloadTime: 2.2, modelUrl: null, adsSpeed: 12,
    sound: 'scar', rate: 1.1, penetration: 1, tp: { len: 0.82, body: 'tan', mag: 'box' }, desc: '一體成形的未來步槍，後座柔和、射速快。', // v53 SF2 EU wiki (unverified): RPM/reload/ADS
  },
  galil: {
    name: 'GALIL', type: 'assault', slot: 'primary', damageNear: 31, damageFar: 23, falloffStart: 25, falloffEnd: 60, fireRate: 0.092, recoilPitch: 0.0145, recoilYaw: 0.011, recoilRecovery: 8,
    hipSpread: 0.078, adsSpread: 0.0026, adsFov: 56, adsType: '3d_sight', mobility: 0.93, maxAmmo: 35, reloadTime: 2.6, modelUrl: null,
    sound: 'ak', rate: 1.06, penetration: 1, tp: { len: 0.95, body: 'wood', mag: 'curve' }, desc: '以色列 AK 系步槍，35 發大彈匣，威力與後座介於 M4 和 AK 之間。',
  },
  sg551: {
    name: 'SG 551', type: 'assault', slot: 'primary', damageNear: 27, damageFar: 22, falloffStart: 30, falloffEnd: 70, fireRate: 0.097, recoilPitch: 0.0105, recoilYaw: 0.0065, recoilRecovery: 11,
    hipSpread: 0.074, adsSpread: 0.0014, adsFov: 46, adsType: 'red_dot', mobility: 0.94, maxAmmo: 30, reloadTime: 2.5, modelUrl: null,
    sound: 'scar', rate: 1.04, penetration: 1, tp: { len: 0.86, body: 'dark', mag: 'box' }, desc: '瑞士精準步槍，開鏡極穩，適合中距離點射。', // v53 SF2 EU wiki (unverified): RPM
  },
  hk417: {
    name: 'HK417', type: 'assault', slot: 'primary', damageNear: 36, damageFar: 29, falloffStart: 30, falloffEnd: 80, fireRate: 0.11, recoilPitch: 0.017, recoilYaw: 0.01, recoilRecovery: 8,
    hipSpread: 0.085, adsSpread: 0.0015, adsFov: 50, adsType: '3d_sight', mobility: 0.9, maxAmmo: 20, reloadTime: 2.6, modelUrl: null,
    sound: 'ak', rate: 0.93, penetration: 2, tp: { len: 0.98, body: 'dark', mag: 'box' }, desc: '7.62mm 戰鬥步槍：爆頭 1 發、身體 3 發，20 發彈匣，後座重。',
  },
  scarh: {
    name: 'SCAR-H', type: 'assault', slot: 'primary', damageNear: 37, damageFar: 29, falloffStart: 30, falloffEnd: 80, fireRate: 0.104, recoilPitch: 0.0175, recoilYaw: 0.011, recoilRecovery: 8,
    hipSpread: 0.085, adsSpread: 0.0017, adsFov: 52, adsType: '3d_sight', mobility: 0.9, maxAmmo: 20, reloadTime: 2.5, modelUrl: null,
    sound: 'ak', rate: 0.9, penetration: 2, tp: { len: 0.96, body: 'tan', mag: 'box' }, desc: 'SCAR 的 7.62mm 版本：單發傷害高、穿透強，射速較慢。',
  },
  // v64 SF2's attachment builds (user 10-28): the base gun's SF2 rig with SF2's own EOTech / Reflex (its reticle) and silencer
  // (tools/sf2_rig_build.mjs g36c_eo / hk417_rs / scarl_eo); timing, lenses and recoil from their own SF2 classes (SF2_WEAPONS below),
  // damage on the base gun's balance; suppressed (SF2's AR_Silence shot, no radar ping, no flash). The camos come later.
  g36c_eo: {
    name: 'G36C EOTech 消音', type: 'assault', slot: 'primary', damageNear: 25, damageFar: 19, falloffStart: 25, falloffEnd: 60, fireRate: 0.109,
    recoilPitch: 0.011, recoilYaw: 0.012, recoilRecovery: 10,
    hipSpread: 0.07, adsSpread: 0.0018, adsFov: 55, adsType: '3d_sight', mobility: 0.95, maxAmmo: 30, reloadTime: 2.28, modelUrl: null,
    sound: 'g36s', suppressed: true, tracerEvery: 0, penetration: 1, tp: { len: 0.9, body: 'dark', mag: 'box' },
    desc: 'SF2 原版 G36C，EOTech 全息瞄具 + 消音器：槍聲小、不上敵方雷達。',
  },
  hk417_rs: {
    name: 'HK417 mod2A Reflex 消音', type: 'assault', slot: 'primary', damageNear: 36, damageFar: 29, falloffStart: 30, falloffEnd: 80, fireRate: 0.102, recoilPitch: 0.017, recoilYaw: 0.01, recoilRecovery: 8,
    hipSpread: 0.085, adsSpread: 0.0015, adsFov: 55, adsType: '3d_sight', mobility: 0.9, maxAmmo: 20, reloadTime: 2.18, modelUrl: null,
    sound: 'g36s', rate: 0.85, suppressed: true, tracerEvery: 0, penetration: 2, tp: { len: 1.15, body: 'dark', mag: 'box' },
    desc: 'SF2 原版 HK417 mod2A，Reflex 內紅點 + 消音器：7.62mm 高傷害，後座比原版好控。',
  },
  scarl_eo: {
    name: 'SCAR-L MK2 EOTech 消音', type: 'assault', slot: 'primary', damageNear: 28, damageFar: 21, falloffStart: 25, falloffEnd: 60, fireRate: 0.0945, recoilPitch: 0.011, recoilYaw: 0.008, recoilRecovery: 10,
    hipSpread: 0.072, adsSpread: 0.0019, adsFov: 55, adsType: '3d_sight', mobility: 0.94, maxAmmo: 30, reloadTime: 2.35, modelUrl: null,
    sound: 'g36s', rate: 0.95, suppressed: true, tracerEvery: 0, penetration: 1, tp: { len: 1.05, body: 'tan', mag: 'box' },
    desc: 'SF2 原版 SCAR-L MK2，EOTech 全息瞄具 + 消音器：射速比 SCAR-L 快。',
  },
  qbz97: {
    name: 'QBZ-97', type: 'assault', slot: 'primary', damageNear: 26, damageFar: 20, falloffStart: 25, falloffEnd: 65, fireRate: 0.08, recoilPitch: 0.0105, recoilYaw: 0.0085, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0017, adsFov: 44, adsType: 'red_dot', mobility: 0.96, maxAmmo: 30, reloadTime: 2.6, modelUrl: null,
    sound: 'm4', rate: 1.08, penetration: 1, tp: { len: 0.78, body: 'dark', mag: 'box', bull: true }, desc: '無托步槍，槍身短、開鏡穩定。',
  },
  pp2000: {
    name: 'PP-2000', type: 'smg', slot: 'primary', damageNear: 21, damageFar: 14, falloffStart: 10, falloffEnd: 32, fireRate: 0.06, recoilPitch: 0.0075, recoilYaw: 0.0075, recoilRecovery: 13,
    hipSpread: 0.05, adsSpread: 0.0035, adsFov: 60, adsType: 'red_dot', mobility: 1.07, maxAmmo: 44, reloadTime: 2.1, modelUrl: null,
    sound: 'mp7', rate: 0.94, range: 150, tp: { len: 0.48, body: 'dark', mag: 'none' }, desc: '俄製輕量衝鋒槍，44 發長彈匣，跑打靈活。',
  },
  vz61: {
    name: 'Scorpion vz.61', type: 'smg', slot: 'primary', damageNear: 19, damageFar: 12, falloffStart: 8, falloffEnd: 28, fireRate: 0.056, recoilPitch: 0.008, recoilYaw: 0.009, recoilRecovery: 13,
    hipSpread: 0.044, adsSpread: 0.0045, adsFov: 62, adsType: '3d_sight', mobility: 1.09, maxAmmo: 20, reloadTime: 1.7, modelUrl: null,
    sound: 'p90', rate: 1.15, range: 130, tp: { len: 0.42, body: 'dark', mag: 'none' }, desc: '蠍式衝鋒槍：極輕、射速高，彈匣小、換彈快。',
  },
  m40a1: {
    name: 'M40A1', type: 'sniper', slot: 'primary', damageNear: 110, damageFar: 96, falloffStart: 60, falloffEnd: 200, fireRate: 1.35, recoilPitch: 0.065, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.14, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.82, maxAmmo: 5, reloadTime: 3.3, modelUrl: null,
    sound: 'm40', zoomFovs: [20, 9], penetration: 2, range: 420, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.12, body: 'green', mag: 'none', scope: true }, desc: '美軍陸戰隊栓動狙擊槍，身體 1 發，移動較 AWP 靈活。',
  },
  // v64 SF2's own K14 (sni_k14, tools/sf2_rig_build.mjs k14): the rig, its bolt in the Fire clip, its sounds; damage on the M40A1's balance
  k14: {
    name: 'K14', type: 'sniper', slot: 'primary', damageNear: 110, damageFar: 96, falloffStart: 60, falloffEnd: 200, fireRate: 1.2, recoilPitch: 0.065, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.14, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.82, maxAmmo: 5, reloadTime: 3.0, modelUrl: null,
    sound: 'm40', zoomFovs: [20, 9], zoomHFovs: [45, 20], penetration: 2, range: 420, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.15, body: 'dark', mag: 'box', scope: true }, // v64f zoomHFovs: SF2's own two steps, horizontal like UE3 — fZoomedFOV 45, then 20 (SFPawn's CamFOVSniperZoomIn2nd; the user's SF2 shots: step 2 ≈ 2.5× step 1)
    desc: 'SF2 原版 K14（衝擊波）：韓國栓動狙擊槍，身體 1 發，開鏡快。',
  },
  // v64s SF2's own TRG-41 (sni_trg on the Zeiss scope, tools/sf2_rig_build.mjs trg; user 10-28's first sniper): timing, zoom and
  // recoil from SFCWeaponTRG (SF2_WEAPONS), its scope's own reticle (Zeiss: ScopeView_Reticle_03); damage on the K14's balance
  trg: {
    name: 'TRG-41', type: 'sniper', slot: 'primary', damageNear: 110, damageFar: 96, falloffStart: 60, falloffEnd: 200, fireRate: 1.2, recoilPitch: 0.065, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.14, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.82, maxAmmo: 5, reloadTime: 3.0, modelUrl: null, sf2Reticle: 'zeiss',
    sound: 'm40', zoomFovs: [20, 9], zoomHFovs: [55, 20], penetration: 2, range: 420, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.2, body: 'dark', mag: 'box', scope: true }, // (zoomHFovs: SFCWeaponTRG fZoomedFOV 55, then SFPawn's 20)
    desc: 'SF2 原版 TRG-41：芬蘭 Sako 栓動狙擊槍，Zeiss 狙擊鏡，身體 1 發。',
  },
  sr25: {
    name: 'SR-25', type: 'sniper', slot: 'primary', damageNear: 62, damageFar: 52, falloffStart: 50, falloffEnd: 180, fireRate: 0.3, recoilPitch: 0.042, recoilYaw: 0.011, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.0007, adsFov: 26, adsType: '2d_scope_overlay', mobility: 0.87, maxAmmo: 20, reloadTime: 3.0, modelUrl: null,
    sound: 'svd', rate: 1.08, bolt: false, zoomFovs: [26, 13], penetration: 2, range: 400, adsSpeed: 16, tracerEvery: 1, tp: { len: 1.12, body: 'dark', mag: 'box', scope: true }, desc: '半自動精確射手步槍，20 發彈匣：身體 2 發、爆頭 1 發。',
  },
  psg1: {
    name: 'PSG1', type: 'sniper', slot: 'primary', damageNear: 66, damageFar: 56, falloffStart: 50, falloffEnd: 180, fireRate: 0.38, recoilPitch: 0.048, recoilYaw: 0.01, recoilRecovery: 7,
    hipSpread: 0.11, adsSpread: 0.0005, adsFov: 24, adsType: '2d_scope_overlay', mobility: 0.84, maxAmmo: 10, reloadTime: 3.1, modelUrl: null,
    sound: 'svd', rate: 1.12, bolt: false, zoomFovs: [24, 11], penetration: 2, range: 420, adsSpeed: 15, tracerEvery: 1, tp: { len: 1.2, body: 'dark', mag: 'box', scope: true }, desc: 'HK 半自動狙擊槍，精準度最高，射速比 SR-25 慢。',
  },
  mg4: {
    name: 'MG4', type: 'lmg', slot: 'primary', damageNear: 26, damageFar: 20, falloffStart: 30, falloffEnd: 80, fireRate: 0.068, recoilPitch: 0.0105, recoilYaw: 0.013, recoilRecovery: 8,
    hipSpread: 0.088, adsSpread: 0.0038, adsFov: 54, adsType: 'red_dot', mobility: 0.82, maxAmmo: 100, reloadTime: 5.0, modelUrl: null,
    sound: 'm249', rate: 1.05, penetration: 2, range: 300, adsSpeed: 11, reserveMult: 2, tracerEvery: 2, tp: { len: 1.0, body: 'dark', mag: 'box' }, desc: '德製輕機槍：100 發，射速高、比 M249 輕巧。',
  },
  k3: {
    name: 'K3', type: 'lmg', slot: 'primary', damageNear: 27, damageFar: 21, falloffStart: 30, falloffEnd: 80, fireRate: 0.078, recoilPitch: 0.011, recoilYaw: 0.0135, recoilRecovery: 8,
    hipSpread: 0.09, adsSpread: 0.0042, adsFov: 55, adsType: '3d_sight', mobility: 0.81, maxAmmo: 100, reloadTime: 5.3, modelUrl: null,
    sound: 'm249', rate: 0.98, penetration: 2, range: 300, adsSpeed: 10, reserveMult: 2, tracerEvery: 2, tp: { len: 1.02, body: 'dark', mag: 'box' }, desc: '韓國制式輕機槍，穩定的 100 發火力。',
  },
  aa12: {
    name: 'AA-12', type: 'shotgun', slot: 'primary', damageNear: 11, damageFar: 2.5, falloffStart: 4, falloffEnd: 20, pellets: 8, fireRate: 0.2, recoilPitch: 0.05, recoilYaw: 0.02, recoilRecovery: 8,
    hipSpread: 0.12, adsSpread: 0.085, adsFov: 64, adsType: '3d_sight', mobility: 0.88, maxAmmo: 20, reloadTime: 3.4, modelUrl: null,
    sound: 'saiga', rate: 1.08, pump: false, auto: true, range: 45, tracerEvery: 0, tp: { len: 0.98, body: 'dark', mag: 'box' }, desc: '全自動散彈槍，20 發彈鼓，貼身壓制無敵。',
  },
  m92fs: {
    name: 'Beretta M92FS', type: 'pistol', slot: 'secondary', damageNear: 27, damageFar: 18, falloffStart: 10, falloffEnd: 35, fireRate: 0.17, recoilPitch: 0.028, recoilYaw: 0.006, recoilRecovery: 12,
    hipSpread: 0.03, adsSpread: 0.004, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 15, reloadTime: 1.6, modelUrl: null,
    sound: 'p226', rate: 0.97, range: 160, tp: { len: 0.22, body: 'dark', pistol: true }, desc: '經典 9mm 手槍，穩定好控。',
  },
  cz75: {
    name: 'CZ 75 BD', type: 'pistol', slot: 'secondary', damageNear: 26, damageFar: 17, falloffStart: 10, falloffEnd: 35, fireRate: 0.15, recoilPitch: 0.026, recoilYaw: 0.006, recoilRecovery: 13,
    hipSpread: 0.028, adsSpread: 0.0038, adsFov: 60, adsType: '3d_sight', mobility: 1.01, maxAmmo: 16, reloadTime: 1.5, modelUrl: null,
    sound: 'p226', rate: 1.05, range: 160, tp: { len: 0.2, body: 'dark', pistol: true }, desc: '捷克手槍，射速快、16 發。',
  },
  jericho: {
    name: 'Jericho 941', type: 'pistol', slot: 'secondary', damageNear: 30, damageFar: 20, falloffStart: 10, falloffEnd: 35, fireRate: 0.19, recoilPitch: 0.032, recoilYaw: 0.007, recoilRecovery: 11,
    hipSpread: 0.03, adsSpread: 0.0042, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 13, reloadTime: 1.6, modelUrl: null,
    sound: 'p226', rate: 0.92, range: 165, tp: { len: 0.22, body: 'steel', pistol: true }, desc: '以色列手槍，單發威力略高於 P226。',
  },
  sw60: {
    name: 'S&W Model 60', type: 'pistol', slot: 'secondary', damageNear: 44, damageFar: 30, falloffStart: 10, falloffEnd: 35, fireRate: 0.34, recoilPitch: 0.05, recoilYaw: 0.01, recoilRecovery: 8,
    hipSpread: 0.036, adsSpread: 0.0042, adsFov: 58, adsType: '3d_sight', mobility: 1.02, maxAmmo: 5, reloadTime: 2.4, modelUrl: null,
    sound: 'deagle', rate: 1.14, range: 170, tp: { len: 0.18, body: 'steel', pistol: true }, desc: '.38 左輪：5 發，身體 3 發、爆頭 1 發。',
  },
  // ---------------- v40 batch 2 ----------------
  m14ebr: {
    name: 'M14 EBR', type: 'sniper', slot: 'primary', damageNear: 58, damageFar: 48, falloffStart: 45, falloffEnd: 160, fireRate: 0.28, recoilPitch: 0.04, recoilYaw: 0.012, recoilRecovery: 8,
    hipSpread: 0.09, adsSpread: 0.001, adsFov: 30, adsType: '2d_scope_overlay', mobility: 0.89, maxAmmo: 20, reloadTime: 3.5, modelUrl: null,
    sound: 'svd', rate: 1.02, bolt: false, zoomFovs: [30, 15], penetration: 2, range: 380, adsSpeed: 18, tracerEvery: 1, tp: { len: 1.05, body: 'dark', mag: 'box', scope: true }, desc: '半自動精確射手步槍，射速最快的狙擊選項。', // v53 SF2 EU wiki (unverified): RPM/reload
  },
  type89: {
    name: 'Howa Type 89', type: 'assault', slot: 'primary', damageNear: 26, damageFar: 20, falloffStart: 25, falloffEnd: 65, fireRate: 0.103, recoilPitch: 0.0098, recoilYaw: 0.0078, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0019, adsFov: 54, adsType: '3d_sight', mobility: 0.95, maxAmmo: 30, reloadTime: 2.3, modelUrl: null, adsSpeed: 10,
    sound: 'm4', rate: 1.06, penetration: 1, tp: { len: 0.92, body: 'dark', mag: 'box' }, desc: '日本自衛隊步槍，後座低、連射穩定。', // v53 SF2 EU wiki (unverified): RPM/reload/ADS
  },
  l86a1: {
    name: 'L86A1 LSW', type: 'lmg', slot: 'primary', damageNear: 27, damageFar: 22, falloffStart: 35, falloffEnd: 85, fireRate: 0.085, recoilPitch: 0.009, recoilYaw: 0.008, recoilRecovery: 10,
    hipSpread: 0.085, adsSpread: 0.0016, adsFov: 42, adsType: 'red_dot', mobility: 0.86, maxAmmo: 30, reloadTime: 2.8, modelUrl: null,
    sound: 'm4', rate: 0.97, penetration: 2, range: 300, adsSpeed: 13, tracerEvery: 2, tp: { len: 0.9, body: 'dark', mag: 'box', bull: true }, desc: '英軍無托輕機槍：彈匣只有 30 發，但精準度是機槍裡最高的。',
  },
  hk23e: {
    name: 'HK23E', type: 'lmg', slot: 'primary', damageNear: 28, damageFar: 22, falloffStart: 30, falloffEnd: 80, fireRate: 0.072, recoilPitch: 0.0115, recoilYaw: 0.014, recoilRecovery: 8,
    hipSpread: 0.09, adsSpread: 0.004, adsFov: 55, adsType: '3d_sight', mobility: 0.8, maxAmmo: 100, reloadTime: 5.4, modelUrl: null,
    sound: 'm249', rate: 1.02, penetration: 2, range: 300, adsSpeed: 10, reserveMult: 2, tracerEvery: 2, tp: { len: 1.04, body: 'dark', mag: 'box' }, desc: 'HK 彈鏈機槍，100 發，射速與 M249 相近。',
  },
  frf2: {
    name: 'FR-F2', type: 'sniper', slot: 'primary', damageNear: 112, damageFar: 98, falloffStart: 60, falloffEnd: 200, fireRate: 1.4, recoilPitch: 0.066, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.14, adsSpread: 0.0, adsFov: 19, adsType: '2d_scope_overlay', mobility: 0.8, maxAmmo: 10, reloadTime: 3.5, modelUrl: null,
    sound: 'awp', rate: 1.06, zoomFovs: [19, 8], penetration: 2, range: 450, adsSpeed: 16, tracerEvery: 1, tp: { len: 1.14, body: 'dark', mag: 'box', scope: true }, desc: '法軍栓動狙擊槍，10 發，身體 1 發。',
  },
  cz700: {
    name: 'CZ 700', type: 'sniper', slot: 'primary', damageNear: 108, damageFar: 94, falloffStart: 60, falloffEnd: 200, fireRate: 1.3, recoilPitch: 0.062, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.13, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.84, maxAmmo: 10, reloadTime: 3.2, modelUrl: null,
    sound: 'cz700', zoomFovs: [20, 9], penetration: 2, range: 420, adsSpeed: 18, tracerEvery: 1, tp: { len: 1.1, body: 'dark', mag: 'box', scope: true }, desc: '捷克栓動狙擊槍，拉栓快、移動靈活。',
  },
  infinity: {
    name: 'Infinity', type: 'pistol', slot: 'secondary', damageNear: 29, damageFar: 19, falloffStart: 10, falloffEnd: 35, fireRate: 0.13, recoilPitch: 0.024, recoilYaw: 0.005, recoilRecovery: 14,
    hipSpread: 0.026, adsSpread: 0.0032, adsFov: 60, adsType: '3d_sight', mobility: 1.01, maxAmmo: 17, reloadTime: 1.5, modelUrl: null,
    sound: 'm1911', rate: 1.06, range: 170, tp: { len: 0.24, body: 'steel', pistol: true }, desc: '競賽級手槍，射速快、精準度高、後座小。',
  },
};

const TYPE_TUNING = { // spread growth / movement penalties per weapon family
  assault: { kind: 'rifle', bloomPerShot: 0.0042, bloomMax: 0.028, spreadMove: 0.045, adsMoveSpread: 0.03, spreadSprint: 0.1, spreadAir: 0.18, spreadPerShot: 0.008, spreadMax: 0.06, adsBloomMult: 0.3, spreadRecover: 5, noise: 40, reloadSounds: [[0.18, 'magout'], [0.58, 'magin'], [0.82, 'charge']], kick: { z: 0.042, y: 0.01, rx: 0.06 }, adsMove: 0.75 },
  smg: { kind: 'smg', bloomPerShot: 0.0032, bloomMax: 0.024, spreadMove: 0.03, adsMoveSpread: 0.02, spreadSprint: 0.075, spreadAir: 0.14, spreadPerShot: 0.006, spreadMax: 0.05, adsBloomMult: 0.35, spreadRecover: 6.5, noise: 32, reloadSounds: [[0.18, 'magout'], [0.55, 'magin'], [0.8, 'charge']], kick: { z: 0.03, y: 0.008, rx: 0.045 }, adsMove: 0.82 },
  lmg: { kind: 'lmg', bloomPerShot: 0.0036, bloomMax: 0.034, spreadMove: 0.06, adsMoveSpread: 0.04, spreadSprint: 0.12, spreadAir: 0.2, spreadPerShot: 0.009, spreadMax: 0.07, adsBloomMult: 0.35, spreadRecover: 4, noise: 46, reloadSounds: [[0.12, 'boltback'], [0.35, 'magout'], [0.65, 'magin'], [0.88, 'charge']], kick: { z: 0.05, y: 0.012, rx: 0.065 }, adsMove: 0.6 },
  shotgun: { kind: 'shotgun', bloomPerShot: 0, bloomMax: 0, spreadMove: 0.02, adsMoveSpread: 0.015, spreadSprint: 0.04, spreadAir: 0.06, spreadPerShot: 0, spreadMax: 0, adsBloomMult: 0, spreadRecover: 6, noise: 48, reloadSounds: [], kick: { z: 0.1, y: 0.02, rx: 0.2 }, adsMove: 0.8 },
  sniper: { kind: 'sniper', bloomPerShot: 0, bloomMax: 0, spreadMove: 0.1, adsMoveSpread: 0, spreadSprint: 0.14, spreadAir: 0.26, spreadPerShot: 0, spreadMax: 0, adsBloomMult: 0, spreadRecover: 5, noise: 60, reloadSounds: [[0.16, 'magout'], [0.52, 'magin'], [0.74, 'boltback'], [0.88, 'boltfwd']], kick: { z: 0.12, y: 0.02, rx: 0.22 }, adsMove: 0.5 },
  pistol: { kind: 'pistol', bloomPerShot: 0.0065, bloomMax: 0.03, spreadMove: 0.028, adsMoveSpread: 0.018, spreadSprint: 0.06, spreadAir: 0.1, spreadPerShot: 0.018, spreadMax: 0.06, adsBloomMult: 0.5, spreadRecover: 6, noise: 30, reloadSounds: [[0.18, 'magout_p'], [0.58, 'magin_p'], [0.84, 'slide']], kick: { z: 0.035, y: 0.01, rx: 0.14 }, adsMove: 0.85 }, // v54 '_p': pistol recordings
};

function compileWeapon(id, s) {
  const t = TYPE_TUNING[s.type];
  const auto = s.auto ?? (s.type === 'assault' || s.type === 'smg' || s.type === 'lmg');
  const pump = s.type === 'shotgun' && s.pump !== false, bolt = s.type === 'sniper' && s.bolt !== false;
  const def = Object.assign({}, t, {
    id, name: s.name, kind: t.kind, type: s.type, slot: s.slot, model: s.model || id, modelUrl: s.modelUrl || null, desc: s.desc || '',
    mag: s.maxAmmo, reserve: s.maxAmmo * (s.reserveMult || (s.type === 'sniper' ? 5 : 4)), interval: s.fireRate, auto,
    damage: s.damageNear, damageNear: s.damageNear, damageFar: s.damageFar ?? s.damageNear, falloffStart: s.falloffStart ?? 1e6, falloffEnd: s.falloffEnd ?? 1e6 + 1,
    pellets: s.pellets || 1, headKill: s.headKill ?? (s.type === 'sniper'), headMult: s.headMult || PART_MULT.head, range: s.range || 260, penetration: s.penetration || 0,
    hipBase: s.hipSpread, adsBase: s.adsSpread, spreadBase: s.hipSpread, spreadCrouch: 0.8,
    recoil: { first: s.recoilPitch * 0.75, climb: s.recoilPitch, climbShots: 10, late: s.recoilPitch * 0.75, h: s.recoilYaw, hStart: 6, jitter: s.recoilYaw * 0.35 },
    recoilRecovery: s.recoilRecovery, adsFov: s.adsFov, vmAdsFov: s.vmAdsFov, vmHFov: s.vmHFov || 0, vmAdsHFov: s.vmAdsHFov || 0, adsVertical: s.adsVertical || 0, adsType: s.adsType, adsRecoilMult: 1, adsSpeed: s.adsSpeed || (s.type === 'smg' ? 24 : 20),
    moveSpeed: CFG.player.baseSpeed * s.mobility, mobility: s.mobility, reloadTime: s.reloadTime, equipTime: s.equipTime || 0, sf2Recoil: s.sf2Recoil || null, sound: s.sound || id,
    sf2: s.sf2 || null, sf2Rig: s.sf2Rig || null, sf2ZoomIn: s.sf2ZoomIn || null, sf2ZoomOut: s.sf2ZoomOut || null, sf2ReloadSounds: s.sf2ReloadSounds || null, sf2ReloadAnim: s.sf2ReloadAnim || null, sf2Reticle: s.sf2Reticle || null, camo: s.camo || null, // v62h (sf2 never reached the def before: v61's SF2 gun sounds never played)
    suppressed: !!s.suppressed, tracerEvery: s.tracerEvery ?? 2, shellReload: s.shellReload || 0, zoomFovs: s.zoomFovs || [s.adsFov], zoomHFovs: s.zoomHFovs || null,
    noise: s.suppressed ? 14 : t.noise, pump, bolt, soundRate: s.rate || 1, tpSpec: s.tp || null,
    fireMode: auto ? 'AUTO' : pump ? 'PUMP' : bolt ? 'BOLT' : 'SEMI',
    bot: { rate: bolt ? 1.45 : s.type === 'sniper' ? Math.max(0.5, s.fireRate * 2) : s.type === 'pistol' ? (auto ? s.fireRate * 1.1 : Math.max(0.3, s.fireRate * 2.2)) : s.type === 'shotgun' ? Math.max(0.35, s.fireRate * 1.3) : s.fireRate * 1.05 },
  });
  if (s.bloomPerShot) { def.bloomPerShot = s.bloomPerShot; def.bloomMax = s.bloomMax || def.bloomMax; }
  // semi-auto snipers / magazine-fed shotguns reload like rifles (no bolt cycling, no shell-by-shell)
  if (s.type === 'sniper' && !bolt) def.reloadSounds = [[0.18, 'magout'], [0.58, 'magin'], [0.84, 'charge']];
  if (s.type === 'shotgun' && !def.shellReload) def.reloadSounds = [[0.18, 'magout'], [0.6, 'magin'], [0.84, 'charge']];
  if (s.type === 'sniper') { def.scopedThreshold = 0.85; def.scopedMoveMax = 0.055; def.adsSpreadMult = 0; }
  return def;
}

// <sf2-weights>
/* v64r SF2's weapon weights [equip, unequip] (SFGameContent; tools/sf2_weight_table.py) — the load in hand sets the walking speed
   (src/12_player.js sf2Speed). No SF2 class of their own: mp5 ≈ MP7A1, ak47 ≈ AK103, negev ≈ Ultimax, pkm ≈ FNMAG, mg42 ≈ MG4, m1014 ≈ BNLLI, usp ≈ P226. */
const SF2_WEIGHT = {
  m4a1: [4.1, 2.05], g36c: [3.5, 1.75], g36c_gold: [3.5, 1.75], g36c_sf2: [3.5, 1.75], g36c_eo: [3.5, 1.75], g36c_circuit: [3.5, 1.75],
  mp5: [2.25, 1.25], mp5k: [1.9, 0.9], p90: [2.4, 1.4], remington870: [2.8, 1.8], m249: [7.5, 3.75], cheytac_m200: [9.5, 4.75],
  p226: [1.0, 0.0], deagle: [1.0, 0.0], ak47: [5.7, 2.85], ak103: [5.7, 2.85], scarl: [4.6, 2.3], scarl_eo: [4.6, 2.3],
  famas: [3.4, 1.7], aug: [4.3, 2.15], ump45: [1.96, 0.98], vector: [2.0, 1.0], mp7: [2.25, 1.25], rpk: [7.7, 3.85],
  negev: [7.0, 3.5], pkm: [6.8, 3.4], mg42: [7.8, 3.9], benelli_m4: [2.5, 1.5], m1014: [2.5, 1.5], saiga12: [3.0, 2.0],
  ksg: [2.4, 1.2], awp: [8.1, 4.05], barrett: [9.9, 4.95], kar98k: [5.6, 2.8], svd: [5.8, 2.9], glock18: [1.0, 0.0],
  usp: [1.0, 0.0], m1911: [1.0, 0.0], m16a3: [5.8, 2.9], k2: [4.0, 2.0], xm8: [3.2, 1.6], galil: [5.6, 2.8],
  sg551: [4.2, 2.1], hk417: [4.5, 2.25], scarh: [4.8, 2.4], hk417_rs: [4.2, 2.1], qbz97: [4.3, 2.15], pp2000: [2.9, 1.9],
  vz61: [2.8, 1.8], m40a1: [5.7, 2.85], k14: [7.6, 3.8], sr25: [7.0, 3.5], psg1: [7.0, 3.5], mg4: [7.8, 3.9],
  k3: [6.8, 3.4], aa12: [4.0, 2.0], m92fs: [1.0, 0.0], cz75: [1.0, 0.0], jericho: [1.0, 0.0], sw60: [1.0, 0.0],
  m14ebr: [6.1, 3.05], type89: [4.7, 2.35], l86a1: [7.2, 3.6], hk23e: [7.9, 3.95], frf2: [6.3, 3.15], cz700: [7.5, 3.75],
  trg: [7.3, 3.65], awp_circuit: [8.1, 4.05], cheytac_m200_circuit: [9.5, 4.75], cz700_circuit: [7.5, 3.75], k14_circuit: [7.6, 3.8], infinity: [1.0, 0.0],
  knife: [1.0, 0.0], he: [1.0, 0.0], flash: [1.0, 0.0], smoke: [1.0, 0.0],
};
// </sf2-weights>
// <sf2-weapons>
/* v62i SF2's own timing, lenses, zoom offsets and recoil for the guns with an SF2 rig — generated by tools/sf2_weapon_table.py from
   docs/research/sf2/client-data/weapons.json; applied onto WEAPON_DATABASE before compileWeapon. Damage stays on the balance rules. */
const SF2_WEAPONS = {
  m16a3: {'fireRate': 0.098, 'reloadTime': 2.3, 'equipTime': 0.8, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'm16a3', 'sf2': 'm16a3', 'sf2ZoomIn': [2.0, 0.0, -0.89], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.07, 'magout'], [0.35, 'magin'], [0.72, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.7, 'maxCrossVert': 15.0, 'vertInc': 7000.0, 'vertDec': 11.0, 'crossDecreasInc': 9.0, 'incline': 0.15, 'forceCorrection': 50.0, 'domDefault': 0.08, 'domZoomDefault': 0.0, 'domInc': 0.1, 'domMax': 1.3, 'domMin': 0.1, 'domDec': 6.0, 'maxMovingValue': 0.7, 'mulValueRun': 0.8, 'mulValueJump': 6.0, 'zoomMod': 0.6, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.533}, // SFCWeaponM16A3
  k2: {'fireRate': 0.1, 'reloadTime': 2.2, 'equipTime': 0.75, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'k2', 'sf2': 'k2', 'sf2ZoomIn': [0.0, -0.01, -0.17], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.35, 'magin'], [0.75, 'charge']], 'sf2Recoil': {'nextCrossVert': 0.6, 'maxCrossVert': 7.0, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.28, 'domZoomDefault': 0.0, 'domInc': 0.3, 'domMax': 1.0, 'domMin': 0.0, 'domDec': 1.25, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.8, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.4}, // SFCWeaponK2
  scarl: {'fireRate': 0.107, 'reloadTime': 2.35, 'equipTime': 0.9, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'scarl', 'sf2': 'scarh', 'sf2ZoomIn': [0.0, -0.01, -0.2], 'sf2ZoomOut': [-1.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.44, 'magin'], [0.72, 'charge']], 'sf2Recoil': {'nextCrossVert': 2.1, 'maxCrossVert': 15.0, 'vertInc': 15000.0, 'vertDec': 12.0, 'crossDecreasInc': 9.0, 'incline': 0.35, 'forceCorrection': 50.0, 'domDefault': 0.15, 'domZoomDefault': 0.0, 'domInc': 0.22, 'domMax': 2.4, 'domMin': 0.1, 'domDec': 2.0, 'maxMovingValue': 0.7, 'mulValueRun': 0.7, 'mulValueJump': 6.0, 'zoomMod': 0.99, 'crouchMod': 0.85}, 'sf2ReloadAnim': 2.45}, // SFCWeaponSCARL
  scarh: {'fireRate': 0.105, 'reloadTime': 2.45, 'equipTime': 0.92, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'scarh', 'sf2': 'scarh', 'sf2ZoomIn': [0.0, -0.01, -0.2], 'sf2ZoomOut': [-1.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.44, 'magin'], [0.72, 'charge']], 'sf2Recoil': {'nextCrossVert': 2.1, 'maxCrossVert': 15.0, 'vertInc': 15000.0, 'vertDec': 12.0, 'crossDecreasInc': 9.0, 'incline': 0.35, 'forceCorrection': 50.0, 'domDefault': 0.15, 'domZoomDefault': 0.0, 'domInc': 0.22, 'domMax': 2.4, 'domMin': 0.1, 'domDec': 2.0, 'maxMovingValue': 0.7, 'mulValueRun': 0.7, 'mulValueJump': 6.0, 'zoomMod': 0.99, 'crouchMod': 0.85}, 'sf2ReloadAnim': 2.533}, // SFCWeaponSCARH
  famas: {'fireRate': 0.085, 'reloadTime': 2.35, 'equipTime': 0.8, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'famas', 'sf2': 'famas', 'sf2ZoomIn': [0.0, -0.02, -0.17], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.2, 'magout'], [0.4, 'magin'], [0.73, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.1, 'maxCrossVert': 12.0, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.1, 'forceCorrection': 50.0, 'domDefault': 0.3, 'domZoomDefault': 0.2, 'domInc': 0.3, 'domMax': 1.5, 'domMin': 0.0, 'domDec': 1.25, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.99, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.5}, // SFCWeaponFAMAS
  xm8: {'fireRate': 0.106, 'reloadTime': 2.25, 'equipTime': 0.79, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'xm8', 'sf2': 'xm8', 'sf2ZoomIn': [6.0, 0.0, 0.04], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.27, 'magin'], [0.73, 'charge']], 'sf2Recoil': {'nextCrossVert': 2.0, 'maxCrossVert': 15.0, 'vertInc': 15000.0, 'vertDec': 12.0, 'crossDecreasInc': 9.0, 'incline': 0.35, 'forceCorrection': 50.0, 'domDefault': 0.17, 'domZoomDefault': 0.0, 'domInc': 0.22, 'domMax': 2.4, 'domMin': 0.1, 'domDec': 2.0, 'maxMovingValue': 0.7, 'mulValueRun': 0.7, 'mulValueJump': 6.0, 'zoomMod': 0.6, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.533}, // SFCWeaponXM8
  galil: {'fireRate': 0.112, 'reloadTime': 2.1, 'equipTime': 0.8, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 65.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'galil', 'sf2': 'galil', 'sf2ZoomIn': [2.0, -0.01, 0.0], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.23, 'magout'], [0.72, 'magin'], [0.76, 'charge']], 'sf2Recoil': {'nextCrossVert': 2.3, 'maxCrossVert': 14.0, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.15, 'forceCorrection': 50.0, 'domDefault': 0.05, 'domZoomDefault': 0.0, 'domInc': 0.42, 'domMax': 2.5, 'domMin': 0.0, 'domDec': 1.38, 'maxMovingValue': 1.2, 'mulValueRun': 0.1, 'mulValueJump': 6.0, 'zoomMod': 0.4, 'crouchMod': 0.7}, 'sf2ReloadAnim': 2.2}, // SFCWeaponGALIL
  hk417: {'fireRate': 0.102, 'reloadTime': 2.18, 'equipTime': 0.85, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 40.0, 'sf2Rig': 'hk417', 'sf2': 'hk417', 'sf2ZoomIn': [-4.0, -0.02, -0.2], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.16, 'magout'], [0.37, 'magin'], [0.77, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.7, 'maxCrossVert': 9.0, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.3, 'domZoomDefault': 0.0, 'domInc': 0.22, 'domMax': 2.1, 'domMin': 0.0, 'domDec': 1.35, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.35, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.3}, // SFCWeaponHK417
  mp5k: {'fireRate': 0.076, 'reloadTime': 2.0, 'equipTime': 0.63, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'mp5k', 'sf2': 'mp5k', 'sf2ZoomIn': [3.0, -0.03, -0.2], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.17, 'magout'], [0.48, 'magin'], [0.77, 'charge']], 'sf2Recoil': {'nextCrossVert': 0.94, 'maxCrossVert': 3.0, 'vertInc': 3670.0, 'vertDec': 10.0, 'crossDecreasInc': 30.0, 'incline': 0.1, 'forceCorrection': 50.0, 'domDefault': 0.6, 'domZoomDefault': 0.0, 'domInc': 0.2, 'domMax': 1.8, 'domMin': 0.05, 'domDec': 1.0, 'maxMovingValue': 1.0, 'mulValueRun': 0.35, 'mulValueJump': 2.0, 'zoomMod': 0.6, 'crouchMod': 0.8}, 'sf2ReloadAnim': 2.133}, // SFCWeaponMP5K
  qbz97: {'fireRate': 0.107, 'reloadTime': 2.3, 'equipTime': 0.8, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'qbz97', 'sf2': 'qbz97', 'sf2ZoomIn': [10.0, 0.0, -0.1], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.19, 'magout'], [0.4, 'magin'], [0.73, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.45, 'maxCrossVert': 12.5, 'vertInc': 15000.0, 'vertDec': 11.0, 'crossDecreasInc': 15.0, 'incline': 0.08, 'forceCorrection': 50.0, 'domDefault': 0.2, 'domZoomDefault': 0.0, 'domInc': 0.25, 'domMax': 1.15, 'domMin': 0.0, 'domDec': 1.3, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.7, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.533}, // SFCWeaponQBZ97
  g36c_eo: {'fireRate': 0.109, 'reloadTime': 2.28, 'equipTime': 0.85, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 50.0, 'vmAdsHFov': 20, 'sf2Rig': 'g36c_eo', 'sf2': 'g36c_eo', 'sf2ZoomIn': [2.4, -0.002, 0.3], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.32, 'magin'], [0.76, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.78, 'maxCrossVert': 10.6, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.15, 'domZoomDefault': 0.0, 'domInc': 0.3, 'domMax': 2.2, 'domMin': 0.0, 'domDec': 1.4, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.35, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.5}, // SFCWeaponG36C_EOTech_Silencer_ButterflyFX
  hk417_rs: {'fireRate': 0.102, 'reloadTime': 2.18, 'equipTime': 0.85, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 15, 'sf2Rig': 'hk417_rs', 'sf2': 'hk417_rs', 'sf2ZoomIn': [-4.0, -0.02, -0.2], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.16, 'magout'], [0.37, 'magin'], [0.77, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.63, 'maxCrossVert': 7.9, 'vertInc': 11700.0, 'vertDec': 15.86, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.2, 'domZoomDefault': 0.0, 'domInc': 0.23, 'domMax': 1.848, 'domMin': 0.0, 'domDec': 1.539, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.35, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.3}, // SFCWeaponHK417_mod2A
  scarl_eo: {'fireRate': 0.095, 'reloadTime': 2.35, 'equipTime': 0.9, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 20, 'sf2Rig': 'scarl_eo', 'sf2': 'scarl_eo', 'sf2ZoomIn': [0.0, -0.01, -0.2], 'sf2ZoomOut': [-1.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.12, 'magout'], [0.44, 'magin'], [0.72, 'charge']], 'sf2Recoil': {'nextCrossVert': 2.1, 'maxCrossVert': 15.0, 'vertInc': 15000.0, 'vertDec': 12.0, 'crossDecreasInc': 9.0, 'incline': 0.35, 'forceCorrection': 50.0, 'domDefault': 0.15, 'domZoomDefault': 0.0, 'domInc': 0.22, 'domMax': 2.4, 'domMin': 0.1, 'domDec': 2.0, 'maxMovingValue': 0.7, 'mulValueRun': 0.7, 'mulValueJump': 6.0, 'zoomMod': 0.99, 'crouchMod': 0.85}, 'sf2ReloadAnim': 2.45}, // SFCWeaponSCARL_MK2
  k14: {'fireRate': 1.2, 'reloadTime': 3.0, 'equipTime': 0.8, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 70.0, 'sf2Rig': 'k14', 'sf2': 'k14', 'sf2ZoomIn': [1.2, -0.01, -0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.25}, // SFCWeaponK14
  m40a1: {'fireRate': 1.3, 'reloadTime': 2.75, 'equipTime': 0.7, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 65.0, 'sf2Rig': 'm40a1', 'sf2': 'm40a1', 'sf2ZoomIn': [1.2, -0.015, 0.015], 'sf2ZoomOut': [0.5, 1.0, 1.0], 'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 2.95, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20]}, // SFCWeaponM40A1
  cz700: {'fireRate': 1.3, 'reloadTime': 3.05, 'equipTime': 0.8, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'cz700', 'sf2': 'cz700', 'sf2ZoomIn': [1.2, -0.01, 0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.166, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20]}, // SFCWeaponCZ700
  cheytac_m200: {'fireRate': 1.6, 'reloadTime': 3.2, 'equipTime': 0.95, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 62.0, 'sf2Rig': 'cheytac', 'sf2': 'cheytac', 'sf2ZoomIn': [1.2, -0.01, 0.012], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.5, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20]}, // SFCWeaponCheyTac
  awp: {'fireRate': 1.4, 'reloadTime': 2.8, 'equipTime': 0.65, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'awp', 'sf2': 'awp', 'sf2ZoomIn': [1.2, -0.01, 0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.0, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20]}, // SFCWeaponAWP
  barrett: {'fireRate': 1.3, 'reloadTime': 3.7, 'equipTime': 1.3, 'adsSpeed': 15, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'barrett', 'sf2': 'barrett', 'sf2ZoomIn': [1.2, -0.012, 0.015], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.2, 'magout'], [0.45, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.9, 'sf2Reticle': 'mil3', 'zoomHFovs': [55, 20]}, // SFCWeaponBarret
  kar98k: {'fireRate': 1.4, 'reloadTime': 3.3, 'equipTime': 0.9, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'kar98k', 'sf2': 'kar98k', 'sf2ZoomIn': [1.2, -0.015, 0.015], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.466, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20]}, // SFCWeaponKar98k
  sr25: {'fireRate': 1.15, 'reloadTime': 3.2, 'equipTime': 1.5, 'adsSpeed': 16, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'sr25', 'sf2': 'sr25', 'sf2ZoomIn': [1.2, -0.015, 0.015], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.2, 'magout'], [0.45, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.4, 'sf2Reticle': 'mil', 'zoomHFovs': [20, 12]}, // SFCWeaponSR25
  psg1: {'fireRate': 0.95, 'reloadTime': 3.0, 'equipTime': 1.45, 'adsSpeed': 16, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'psg1', 'sf2': 'psg1', 'sf2ZoomIn': [1.2, -0.01, 0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.2, 'magout'], [0.45, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.033, 'sf2Reticle': 'mil', 'zoomHFovs': [20, 12]}, // SFCWeaponPSG1
  frf2: {'fireRate': 1.45, 'reloadTime': 3.2, 'equipTime': 1.1, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 60.0, 'sf2Rig': 'frf2', 'sf2': 'frf2', 'sf2ZoomIn': [1.2, -0.01, 0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.5, 'sf2Reticle': 'mil1', 'zoomHFovs': [55, 20]}, // SFCWeaponFRF2
  m14ebr: {'fireRate': 0.3, 'reloadTime': 3.5, 'equipTime': 1.6, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 20, 'sf2Rig': 'm14ebr', 'sf2': 'm14ebr', 'sf2ZoomIn': [14.0, -0.08, -1.46], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.2, 'magout'], [0.45, 'magin'], [0.75, 'charge']], 'sf2Recoil': {'nextCrossVert': 5.0, 'maxCrossVert': 20.0, 'vertInc': 30000.0, 'vertDec': 9.0, 'crossDecreasInc': 7.5, 'incline': 0.4, 'forceCorrection': 50.0, 'domDefault': 0.3, 'domZoomDefault': 0.0, 'domInc': 0.6, 'domMax': 2.5, 'domMin': 0.0, 'domDec': 1.0, 'maxMovingValue': 1.5, 'mulValueRun': 1.2, 'mulValueJump': 8.0, 'zoomMod': 0.99, 'crouchMod': 0.6}, 'sf2ReloadAnim': 3.65}, // SFCWeaponM14EBR
  aug: {'fireRate': 0.102, 'reloadTime': 2.6, 'equipTime': 0.85, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'aug', 'sf2': 'aug', 'sf2ZoomIn': [-5.0, -0.01, -0.17], 'sf2ZoomOut': [-2.0, 1.0, 0.0], 'sf2ReloadSounds': [[0.15, 'magout'], [0.4, 'magin'], [0.75, 'charge']], 'sf2Recoil': {'nextCrossVert': 1.4, 'maxCrossVert': 10.0, 'vertInc': 15000.0, 'vertDec': 12.0, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.25, 'domZoomDefault': 0.0, 'domInc': 0.28, 'domMax': 1.6, 'domMin': 0.0, 'domDec': 1.48, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.75, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.75}, // SFCWeaponAUGA3
  sg551: {'fireRate': 0.097, 'reloadTime': 1.98, 'equipTime': 0.83, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 40.0, 'sf2Rig': 'sg551', 'sf2': 'sg551', 'sf2ZoomIn': [3.0, -0.01, -0.3], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.15, 'magout'], [0.4, 'magin'], [0.75, 'charge']], 'sf2Recoil': {'nextCrossVert': 0.5, 'maxCrossVert': 8.0, 'vertInc': 15000.0, 'vertDec': 5.0, 'crossDecreasInc': 15.0, 'incline': 0.04, 'forceCorrection': 50.0, 'domDefault': 0.15, 'domZoomDefault': 0.0, 'domInc': 0.3, 'domMax': 1.1, 'domMin': 0.0, 'domDec': 1.35, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.75, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.15}, // SFCWeaponSIG551
  type89: {'fireRate': 0.106, 'reloadTime': 2.35, 'equipTime': 0.82, 'adsSpeed': 12, 'adsFov': 55, 'adsType': '3d_sight', 'vmHFov': 60.0, 'vmAdsHFov': 35.0, 'sf2Rig': 'type89', 'sf2': 'type89', 'sf2ZoomIn': [-2.0, -0.0, 0.0], 'sf2ZoomOut': [0.0, 0.0, -0.5], 'sf2ReloadSounds': [[0.15, 'magout'], [0.4, 'magin'], [0.75, 'charge']], 'sf2Recoil': {'nextCrossVert': 0.6, 'maxCrossVert': 7.0, 'vertInc': 15000.0, 'vertDec': 13.0, 'crossDecreasInc': 15.0, 'incline': 0.05, 'forceCorrection': 50.0, 'domDefault': 0.2, 'domZoomDefault': 0.0, 'domInc': 0.28, 'domMax': 1.35, 'domMin': 0.0, 'domDec': 1.28, 'maxMovingValue': 0.8, 'mulValueRun': 0.4, 'mulValueJump': 6.0, 'zoomMod': 0.4, 'crouchMod': 0.9}, 'sf2ReloadAnim': 2.6}, // SFCWeaponType89
  trg: {'fireRate': 1.2, 'reloadTime': 3.3, 'equipTime': 0.7, 'adsSpeed': 17, 'adsFov': 20, 'adsType': '2d_scope_overlay', 'vmHFov': 65.0, 'sf2Rig': 'trg', 'sf2': 'trg', 'sf2ZoomIn': [1.2, -0.01, -0.01], 'sf2ZoomOut': [0.0, 0.0, 0.0], 'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']], 'sf2ReloadAnim': 3.466}, // SFCWeaponTRG
};
for (const [id, o] of Object.entries(SF2_WEAPONS)) { const s = WEAPON_DATABASE[id]; Object.assign(s, o); delete s.vmAdsFov; delete s.adsVertical; } // (their own sights now)
// </sf2-weapons>
// <apex-weapons>
/* v62u Apex damage per gun (docs/research/apex/weapons-full.json 'current': official > S30.1 > S14) — generated by
   tools/apex_weapon_table.py. body / head / leg per pellet, rpm with the rechamber, headMax = headshot range (m). */
const APEX_WEAPONS = {
  havoc: {"name": "HAVOC Rifle", "body": 20.0, "head": 26.0, "leg": 15.0, "pellets": 1, "rpm": 672.0, "headMax": 300.4},
  hemlok: {"name": "Hemlok Burst AR", "body": 21, "head": 29.4, "leg": 15.75, "pellets": 1, "rpm": 930.0, "headMax": 300.4},
  nemesis: {"name": "Nemesis Burst AR", "body": 17.0, "head": 22.1, "leg": 12.8, "pellets": 1, "rpm": 1080.0, "headMax": 300.4},
  r301: {"name": "R-301 Carbine", "body": 15.0, "head": 19.5, "leg": 11.3, "pellets": 1, "rpm": 810.0, "headMax": 300.4},
  flatline: {"name": "VK-47 Flatline", "body": 20.0, "head": 26.0, "leg": 15.0, "pellets": 1, "rpm": 600.0, "headMax": 300.4},
  alternator: {"name": "Alternator SMG", "body": 18.0, "head": 22.5, "leg": 14.4, "pellets": 1, "rpm": 600.0, "headMax": 38.1},
  car: {"name": "C.A.R. SMG", "body": 14.0, "head": 17.5, "leg": 11.2, "pellets": 1, "rpm": 930.0, "headMax": 38.1},
  prowler: {"name": "Prowler Burst PDW", "body": 16.0, "head": 20.0, "leg": 12.8, "pellets": 1, "rpm": 1260.0, "headMax": 38.1},
  r99: {"name": "R-99 SMG", "body": 12.0, "head": 15.0, "leg": 9.6, "pellets": 1, "rpm": 1080.0, "headMax": 38.1},
  volt: {"name": "Volt SMG", "body": 16.0, "head": 20.0, "leg": 12.8, "pellets": 1, "rpm": 720.0, "headMax": 38.1},
  devotion: {"name": "Devotion LMG", "body": 16.0, "head": 20.0, "leg": 13.6, "pellets": 1, "rpm": 300.0, "headMax": 57.1},
  lstar: {"name": "L-STAR EMG", "body": 19.0, "head": 23.8, "leg": 16.2, "pellets": 1, "rpm": 600.0, "headMax": 57.1},
  spitfire: {"name": "M600 Spitfire", "body": 21.0, "head": 26.3, "leg": 17.8, "pellets": 1, "rpm": 540.0, "headMax": 57.1},
  rampage: {"name": "Rampage LMG", "body": 29.0, "head": 36.3, "leg": 24.7, "pellets": 1, "rpm": 300.0, "headMax": 63.5},
  r3030: {"name": "30-30 Repeater", "body": 51, "head": 71.4, "leg": 43.35, "pellets": 1, "rpm": 63.5, "headMax": 450.0},
  bocek: {"name": "Bocek Compound Bow", "body": 35.0, "head": 52.5, "leg": 28.0, "pellets": 1, "rpm": 150.0, "headMax": 300.4},
  g7: {"name": "G7 Scout", "body": 33.0, "head": 47.9, "leg": 24.8, "pellets": 1, "rpm": 246.0, "headMax": 450.0},
  tripletake: {"name": "Triple Take", "body": 22.0, "head": 33.0, "leg": 19.8, "pellets": 3, "rpm": 90.0, "headMax": 450.0},
  chargerifle: {"name": "Charge Rifle", "body": 75.0, "head": 135.0, "leg": 67.5, "pellets": 1, "rpm": 78.0, "headMax": 750.0},
  kraber: {"name": "Kraber .50-Cal Sniper", "body": 150.0, "head": 210.0, "leg": 120.0, "pellets": 1, "rpm": 24.7, "headMax": 750.0},
  longbow: {"name": "Longbow DMR", "body": 60.0, "head": 108.0, "leg": 48.0, "pellets": 1, "rpm": 78.0, "headMax": 750.0},
  sentinel: {"name": "Sentinel", "body": 70.0, "head": 126.0, "leg": 63.0, "pellets": 1, "rpm": 31.2, "headMax": 750.0},
  eva8: {"name": "EVA-8 Auto", "body": 7.0, "head": 7.0, "leg": 7.0, "pellets": 8, "rpm": 168.0, "headMax": 38.1},
  mastiff: {"name": "Mastiff Shotgun", "body": 19.0, "head": 19.0, "leg": 19.0, "pellets": 5, "rpm": 66.0, "headMax": 38.1},
  mozambique: {"name": "Mozambique Shotgun", "body": 17.0, "head": 21.3, "leg": 17.0, "pellets": 3, "rpm": 168.0, "headMax": 38.1},
  peacekeeper: {"name": "Peacekeeper", "body": 11.0, "head": 11.0, "leg": 11.0, "pellets": 9, "rpm": 44.4, "headMax": 100.1},
  p2020: {"name": "P2020", "body": 24.0, "head": 30.0, "leg": 21.6, "pellets": 1, "rpm": 420.0, "headMax": 38.1},
  re45: {"name": "RE-45 Auto", "body": 16, "head": 20.0, "leg": 14.4, "pellets": 1, "rpm": 780.0, "headMax": 38.1},
  wingman: {"name": "Wingman", "body": 50.0, "head": 75.0, "leg": 45.0, "pellets": 1, "rpm": 168.0, "headMax": 254.0},
};
const APEX_POOL = {"assault": ["r301", "flatline", "havoc"], "smg": ["alternator", "car", "r99", "volt"], "lmg": ["spitfire", "rampage"], "pistol": ["p2020", "re45", "wingman"], "shotgun": ["eva8", "mastiff", "peacekeeper", "mozambique"], "sniper": ["longbow", "g7", "r3030"], "sniper_bolt": ["kraber", "sentinel"]};
// </apex-weapons>
// v62u the Apex counterpart of a gun (Apex damage model): same class (bolt actions to Apex's bolt guns), nearest rate of fire in log scale (rechamber included)
const apexFor = (def) => (APEX_POOL[def.bolt ? 'sniper_bolt' : def.type] || []).map((k) => APEX_WEAPONS[k]).reduce((best, a) => (!best || Math.abs(Math.log(a.rpm * def.interval / 60)) < Math.abs(Math.log(best.rpm * def.interval / 60)) ? a : best), null);
const WEAPON_DEFS = {};
// v64o 魔術迴路 G36C (user 10-28): SF2's SFCItem_G36C_EOTech_Silencer_CircuitFX — the G36C EOTech + silencer with the CircuitFX camo
// (SF2Camo in src/09c_sf2rig.js); otherwise the same gun
WEAPON_DATABASE.g36c_circuit = Object.assign({}, WEAPON_DATABASE.g36c_eo, { name: 'G36C 魔術迴路', camo: 'circuit',
  desc: 'SF2 原版 G36C EOTech 消音，魔術迴路迷彩：電路紋路流動，擊殺後閃出黃色電光 1.5 秒。' });
// v64x SF2 also sells the CircuitFX camo on its bolt guns (SFCItem_AWP_CircuitFX, _CheyTac_, _CZ700_, _K14_): the same guns under it
for (const [id, name] of [['awp', 'AWP'], ['cheytac_m200', 'CheyTac M200'], ['cz700', 'CZ 700'], ['k14', 'K14']]) {
  WEAPON_DATABASE[id + '_circuit'] = Object.assign({}, WEAPON_DATABASE[id], { name: name + ' 魔術迴路', camo: 'circuit', desc: `SF2 原版 ${name}，魔術迴路迷彩：電路紋路流動，擊殺後閃出黃色電光。` });
}
for (const [id, s] of Object.entries(WEAPON_DATABASE)) { WEAPON_DEFS[id] = compileWeapon(id, s); WEAPON_DEFS[id].apex = apexFor(WEAPON_DEFS[id]); }
// v64n Apex 扣血 (user 10-28 A): the same mags, but a kill takes ~2.5× the hits (200 health + shield at Apex's per-shot damage against
// 100 at ours) — the reserve grows by that ratio of body hits to kill (1–4×; Weapon.reserveMax). B: a kill hands one mag back (Match._killAnnounce).
for (const d of Object.values(WEAPON_DEFS)) if (d.apex && d.damageNear > 0) {
  const n = d.pellets || 1, ours = Math.ceil(100 / (d.damageNear * n)), theirs = Math.ceil((100 + APEX.shields[APEX.shields.length - 1]) / (d.apex.body * (d.apex.pellets || 1)));
  d.apexReserveMult = Math.min(4, Math.max(1, theirs / ours)); // (clamp is declared further down)
}
Object.assign(WEAPON_DEFS, {
  knife: {
    id: 'knife', name: 'KNIFE', kind: 'knife', model: 'knife', moveSpeed: 6.4, adsMove: 1,
    slash: { dmg: 35, range: 2.1, interval: 0.42, delay: 0.06 },
    stab: { dmg: 70, range: 1.75, interval: 0.95, delay: 0.18 },
    headMult: 1.5, falloff: 1, noise: 6,
  },
  fall: { id: 'fall', name: '墜落', kind: 'fall', headMult: 1, falloff: 1 },
  grab: { id: 'grab', name: '擒拿', kind: 'grab', damage: 78, killRange: 1.15, range: 1.9, headMult: 1, falloff: 1 },
  he: { id: 'he', name: '手榴彈', kind: 'grenade', gtype: 'he', model: 'he', count: 2, fuse: 2.6, damage: 130, radius: 9, lethal: 1.4, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
  flash: { id: 'flash', name: '閃光彈', kind: 'grenade', gtype: 'flash', model: 'flash', count: 1, fuse: 1.9, radius: 24, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
  smoke: { id: 'smoke', name: '煙霧彈', kind: 'grenade', gtype: 'smoke', model: 'smoke', count: 1, fuse: 1.8, duration: 17, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
});
// v64r SF2's walking speed by weight (user 10-28: as in SF2): SFPawn.SetGroundSpeedByWeight — 390 UU/s up to a load of 2, 295 from 6 on,
// straight between (MaxSpeedWeight 2 / MinSpeedWeight 6, MaxSpeed 390 / MinSpeed 295); the load (CalculateInventoryWeight) is the
// equip weight of the weapon in hand + the unequip weight of the other slot (a primary: + the secondary's, 0 for SF2's pistols;
// a pistol, knife or grenade: + the primary's). docs/research/sf2/weight-speed.md. def.moveSpeed (bots, the move spread) takes
// the usual pairing (a primary alone, the rest with an M4A1 put away); the player's own speed is worked out live (src/12_player.js).
const sf2Speed = (load) => CFG.player.sf2Speed * Math.min(780, Math.max(295, 390 - (load - 2) * 95 / 4)) / 390;
const sf2Load = (w, weapons) => { const d = w.def || w; if (!d.weight) return null; const o = weapons.find((x) => x !== w && x.def && x.def.slot === (d.slot === 'primary' ? 'secondary' : 'primary')); return d.weight[0] + (o && o.def.weight ? o.def.weight[1] : 0); };
for (const [id, d] of Object.entries(WEAPON_DEFS)) { const w = SF2_WEIGHT[id]; if (!w) continue; d.weight = w; d.moveSpeed = sf2Speed(w[0] + (d.slot === 'primary' ? 0 : SF2_WEIGHT.m4a1[1])); }
const PRIMARY_IDS = Object.keys(WEAPON_DATABASE).filter((k) => WEAPON_DATABASE[k].slot === 'primary');
const SECONDARY_IDS = Object.keys(WEAPON_DATABASE).filter((k) => WEAPON_DATABASE[k].slot === 'secondary');
const WEAPON_ICONS = {}; // id → line-art dataURL (generated at boot)
// v20 armory card intros (one line, role-focused; SF2-style list supplied by the user where the gun matches).
const WEAPON_BLURBS = {
  m4a1: '泛用性最高的標準步槍，後座力易控。',
  g36c: '緊湊型步槍，機動性佳；消音器讓你不上敵方雷達。',
  g36c_gold: '緊湊型步槍，機動性佳；沒有消音器，槍聲大但清脆好控。',
  ak47: '單發破壞力極高，但後座力大，需要精準的點射技巧。',
  scarl: '單發傷害與穿透力優異的模組化步槍。',
  famas: '高射速的犢牛式步槍，近距離爆發力強。',
  aug: '內建基礎瞄具，適合中遠距離穩定輸出。',
  mp5: '經典衝鋒槍，腰射穩定、容錯率高。',
  mp5k: '短槍管 MP5，射速快、近距離靈活。',
  g36c_eo: '緊湊型步槍加全息瞄具與消音器，不上敵方雷達。',
  g36c_circuit: '魔術迴路迷彩的 G36C EOTech 消音：電路紋路流動，擊殺時閃出電光。',
  awp_circuit: '魔術迴路迷彩的 AWP。', cheytac_m200_circuit: '魔術迴路迷彩的 CheyTac M200。', cz700_circuit: '魔術迴路迷彩的 CZ 700。', k14_circuit: '魔術迴路迷彩的 K14。',
  hk417_rs: '7.62mm 戰鬥步槍加內紅點與消音器，單發傷害高。',
  scarl_eo: '高射速的 SCAR-L 加全息瞄具與消音器。',
  k14: '韓國栓動狙擊槍，開鏡快、移動靈活。',
  trg: '芬蘭 Sako 栓動狙擊槍，Zeiss 鏡，細十字貫穿視野。',
  p90: '50 發大彈匣，適合持續火力壓制與近距離掃射。',
  ump45: '衝鋒槍中單發傷害較高的一把，射速偏慢但穩定。',
  vector: '利用特殊槍機設計將後座力降至最低，近戰秒傷極高。',
  mp7: '極高的射速與極佳的機動性，跑動射擊的首選。',
  m249: '標準輕機槍，擁有 100 發彈鏈，適合架點與穿透障礙物。',
  rpk: '以 AK 為基礎延伸的機槍，單發傷害不俗。',
  negev: '高射速彈鏈機槍，壓制力強但左右晃動大。',
  pkm: '重型通用機槍，射程與穿透最佳，但極其笨重。',
  mg42: '德製高射速機槍，連射時的壓制力極強，也極難控制。',
  remington870: '泵動式散彈槍，貼身一槍致命，節奏要算準。',
  benelli_m4: '半自動散彈槍，連發速度快，近距離清點利器。',
  m1014: '美軍制式半自動散彈槍，容量大、表現穩定。',
  saiga12: 'AK 系統彈匣供彈散彈槍，換彈最快。',
  ksg: '雙彈倉泵動散彈槍，14 發容量，持久作戰。',
  cheytac_m200: '重型反器材狙擊槍，穿透力與傷害封頂。',
  awp: '經典重型狙擊槍，擁有極高的致死率（一發斃命）。',
  barrett: '反器材狙擊槍，打到哪裡都倒，後座驚人。',
  kar98k: '二戰經典栓動步槍，開鏡快、輕巧靈活。',
  svd: '經典蘇聯連發狙擊槍，射速快。',
  p226: '標準副武器，穩定可靠的半自動手槍。',
  deagle: '大口徑手槍，單發威力驚人，但後座大。',
  glock18: '全自動手槍，近距離秒傷媲美衝鋒槍。',
  usp: '消音手槍，安靜不上雷達，最精準的副武器。',
  m1911: '經典 .45 手槍，單發威力可靠。',
  m16a3: '射程與精度出色的長槍管步槍。',
  k2: '平衡好用的韓國步槍。',
  xm8: '後座最柔和的未來步槍。',
  galil: '35 發彈匣、威力不俗的 AK 系步槍。',
  sg551: '開鏡極穩，中距離點射首選。',
  hk417: '7.62mm 戰鬥步槍，一槍一槍打得重。',
  scarh: '高傷害高穿透的 7.62mm SCAR。',
  qbz97: '槍身短的無托步槍。',
  pp2000: '44 發長彈匣的輕巧衝鋒槍。',
  vz61: '最輕的衝鋒槍，換彈極快。',
  m40a1: '靈活的栓動狙擊槍。',
  sr25: '20 發半自動狙擊。',
  psg1: '最精準的半自動狙擊。',
  mg4: '輕巧高射速的輕機槍。',
  k3: '穩定的 100 發輕機槍。',
  aa12: '全自動散彈槍，貼身無敵。',
  m92fs: '經典 9mm 手槍。',
  cz75: '射速快的 16 發手槍。',
  jericho: '單發較重的 9mm 手槍。',
  sw60: '5 發左輪，單發威力大。',
  m14ebr: '射速最快的半自動狙擊。',
  type89: '後座低的日本步槍。',
  l86a1: '最精準的機槍，30 發彈匣。',
  hk23e: '100 發彈鏈機槍。',
  frf2: '10 發栓動狙擊槍。',
  cz700: '拉栓快的輕巧狙擊槍。',
  infinity: '競賽級高精度手槍。',
};
const TYPE_LABEL = { assault: '突擊步槍', smg: '衝鋒槍', lmg: '輕機槍', shotgun: '散彈槍', sniper: '狙擊槍', pistol: '手槍' };

// 0–100 stat bars for the Warehouse UI.
function weaponStats(id) {
  const s = WEAPON_DATABASE[id], d = WEAPON_DEFS[id];
  return {
    damage: clamp(Math.round((s.damageNear * (s.pellets || 1)) / 60 * 100), 5, 100),
    fireRate: clamp(Math.round(60 / s.fireRate / 950 * 100), 5, 100),
    accuracy: clamp(Math.round((1 - clamp(s.adsSpread / 0.08, 0, 1)) * 60 + (1 - clamp(s.hipSpread / 0.16, 0, 1)) * 40), 5, 100),
    control: clamp(Math.round((1 - clamp(s.recoilPitch / 0.09, 0, 1)) * 100), 5, 100),
    mobility: clamp(Math.round((d && d.weight ? d.moveSpeed / CFG.player.baseSpeed : s.mobility) * 90), 5, 100), // v64r SF2: from the weight
    rpm: Math.round(60 / s.fireRate), mag: s.maxAmmo, kind: d.kind,
  };
}

const DEFAULT_LOADOUTS = [
  { name: '突擊兵', primary: 'm4a1', secondary: 'p226' },
  { name: '狙擊手', primary: 'cheytac_m200', secondary: 'deagle' },
  { name: '突破手', primary: 'p90', secondary: 'p226' },
];

const STAR_BADGE = '<svg viewBox="0 0 24 24"><defs><linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#f5c542"/><stop offset="1" stop-color="#b8801a"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="#2a1d05" stroke="#e6b23a" stroke-width="1.4"/><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="url(#sbg)" stroke="#fff2b8" stroke-width=".5"/></svg>'; // v45 host badge
const mapThumb = (def) => `assets/maps/thumbs/${def.id}.jpg`; // v46 room map pictures
const LOADOUT_KEYS = 'ABC'; // v45: three loadout sets A–C (SF2 armory tabs), F1–F3 queue them in a match

const MODES = {
  general: { name: '一般模式', desc: '配裝主武器 + 副武器 + 刀 + 三種投擲物', slots: ['primary', 'secondary', 'knife', 'he', 'smoke', 'flash'] }, // v45 wheel order: gun, pistol, knife, HE ×2, smoke, flash
  rifle: { name: '步槍戰', desc: '只能使用步槍 / 衝鋒槍 / 機槍與刀', slots: ['primary', 'knife'], primaryFilter: ['rifle', 'smg', 'lmg'], fallback: 'm4a1' },
  sniper: { name: '狙擊戰', desc: '全員狙擊槍（配裝的主武器若不是狙擊槍則用 CheyTac）+ 刀', slots: ['primary', 'knife'], primaryFilter: ['sniper'], fallback: 'cheytac_m200' },
  pistol: { name: '小槍戰', desc: '全員只能拿配裝的副武器（手槍）', slots: ['secondary'] },
  knife: { name: '小刀戰', desc: '全員只能拿刀，貼身肉搏', slots: ['knife'] },
};
const BOT_POOLS = {
  general: ['m4a1', 'ak47', 'g36c', 'g36c_gold', 'g36c_eo', 'g36c_circuit', 'hk417_rs', 'scarl_eo', 'scarl', 'famas', 'aug', 'mp5', 'mp5k', 'p90', 'ump45', 'vector', 'mp7', 'remington870', 'benelli_m4', 'saiga12', 'm249', 'rpk', 'negev', 'pkm', 'trg', 'cheytac_m200', 'k14', 'awp', 'svd', 'kar98k', 'm16a3', 'k2', 'xm8', 'galil', 'sg551', 'hk417', 'scarh', 'qbz97', 'pp2000', 'vz61', 'aa12', 'mg4', 'k3', 'm40a1', 'sr25', 'psg1', 'm14ebr', 'type89', 'l86a1', 'hk23e', 'frf2', 'cz700'],
  rifle: ['m4a1', 'ak47', 'g36c', 'g36c_gold', 'g36c_eo', 'g36c_circuit', 'hk417_rs', 'scarl_eo', 'scarl', 'famas', 'aug', 'mp5', 'mp5k', 'p90', 'ump45', 'vector', 'mp7', 'm249', 'rpk', 'negev', 'pkm', 'mg42', 'm16a3', 'k2', 'xm8', 'galil', 'sg551', 'hk417', 'scarh', 'qbz97', 'pp2000', 'vz61', 'mg4', 'k3', 'type89', 'l86a1', 'hk23e'],
  sniper: ['trg', 'cheytac_m200', 'cheytac_m200_circuit', 'k14', 'k14_circuit', 'awp_circuit', 'cz700_circuit', 'awp', 'barrett', 'kar98k', 'svd', 'm40a1', 'sr25', 'psg1', 'm14ebr', 'frf2', 'cz700'], pistol: ['p226', 'deagle', 'glock18', 'usp', 'm1911', 'm92fs', 'cz75', 'jericho', 'sw60', 'infinity'], knife: ['knife'],
};

// Match rules (state-machine classes live in the match module).
const RULES = {
  tdm: { name: '團隊死鬥', desc: '陣亡 3 秒復活 · 先達到目標分數獲勝（爆頭 50 · 擊殺 30）', unit: '分', targets: [500, 1000, 1500, 2500], times: [0], timeUnit: 'min', def: { target: 1000, time: 0 } }, // v45: no time limit
  rounds: { name: '回合殲滅', desc: '陣亡本回合不復活 · 先贏得指定回合數', unit: '勝', targets: [5, 6, 7, 8, 9], times: [600], timeUnit: 'sec', def: { target: 6, time: 600 } }, // v45: SF2 先勝 rounds, 10 min a round
  relic: { name: '奪取戰', desc: '藍隊進攻奪取山丘聖物並運回撤離點 · 紅隊防守 · 回合制', unit: '勝', targets: [5, 6, 7, 8, 9], times: [600], timeUnit: 'sec', def: { target: 6, time: 600 } },
  dom: { name: '佔領戰', desc: '按住 E 6 秒佔領 A/B/C · 佔點隨時間得分 · 全佔封鎖對手得分', unit: '分', targets: [150, 250, 400], times: [0], timeUnit: 'min', def: { target: 250, time: 0 } },
};
const FREEZE_TIME = 5;

const DIFFICULTY = [
  { name: '簡單', react: 0.7, aimErr: 0.07, headChance: 0.03, turn: 4.0, burst: [2, 4], burstGap: [0.6, 1.0], strafe: 0.0, view: 42, nade: 0.12, settle: 1.1, track: 4 },
  { name: '普通', react: 0.45, aimErr: 0.048, headChance: 0.08, turn: 6.0, burst: [3, 5], burstGap: [0.4, 0.75], strafe: 0.5, view: 55, nade: 0.25, settle: 0.8, track: 7 },
  { name: '困難', react: 0.28, aimErr: 0.032, headChance: 0.15, turn: 9.0, burst: [3, 6], burstGap: [0.28, 0.55], strafe: 1.0, view: 75, nade: 0.4, settle: 0.55, track: 11 },
];

const TIPS = [
  '主武器（步槍、衝鋒槍、機槍、狙擊槍）爆頭一槍斃命；手槍爆頭需要 2 槍。計分：爆頭 50、擊殺 30。',
  '按住 SHIFT 衝刺，同時站在邊緣不會掉下去 — 適合在走廊上卡位。',
  '面對 0.5–1.45 m 的矮牆或平台按住 W 再按 SPACE 會直接翻越攀上；跳起來按住 W 撞到更高的邊緣也能攀爬。',
  '衝刺中按 C / Ctrl 滑鏟：約 0.7 秒的加速低姿滑行，A / D 可微調方向，滑鏟中跳躍能保留速度。',
  '狙擊鏡：站定開鏡 100% 精準；移動中開鏡會像 CS 一樣失準，先急停再開槍。',
  '剛重生有 3.5 秒無敵保護，開槍會立即解除保護。',
  '對戰中按 F1–F3 預約配裝，下次重生時才會換上。',
  '佔領戰：站進據點圈內按住 E 6 秒；三點全佔，敵方連擊殺都無法得分！',
  '奪取戰：靠近山丘上的聖物按 E 拿起，扛回藍隊撤離點即贏得回合。',
  '走到梯子前按 W 往上爬、S 往下，SPACE 跳離梯子。',
  '散彈槍 8 顆彈丸，貼身一槍致命，10 公尺外威力大減。',
  'Bot 只看得到前方 120° 並且會被牆擋住視線：從背後繞過去、蹲著走（沒有腳步聲）就能偷襲。',
  '狙擊槍子彈會穿透人體：兩個敵人重疊時，一槍爆頭可以同時擊殺兩人（COLLATERAL）。',
  '手榴彈像拉弓一樣蓄力：按住越久丟越遠；邊跑邊跳再放開，可以丟得非常遠。',
  '準心對到敵人時，準心下方會出現他的紅色名字。',
  '按 F 左手擒拿：貼身（約 1 公尺內）一擊斃命，稍遠會把敵人打到殘血。',
  '點放的第一發子彈絕對精準；按住連射會逐漸擴散，放開後很快收斂 — 中遠距離請點放或開鏡。',
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
// Yield one frame (with a timeout fallback so throttled/background tabs never stall the loader).
const nextFrame = () => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 50); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP_V1 = new THREE.Vector3(), TMP_V2 = new THREE.Vector3(), TMP_V3 = new THREE.Vector3(), TMP_V4 = new THREE.Vector3();
// v25: a reproducible random stream per shot — the shooter's network id + shot number seed the spread cone, so the host
// and the shooter's own client draw exactly the same bullet direction.
function hash2(a, b) { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; }
const shotRng = (id, n) => mulberry32(hash2(id, n));
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// v21 (CLAUDE.md §4.2): linear falloff damageNear → damageFar between falloffStart and falloffEnd; sniper headshots always kill.
// Knife / grab / grenades keep their own single `damage` (+ optional exponential `falloff`).
function calcDamage(def, part, dist, mult = 1, apex = false) {
  if (part === 'head' && def.headKill && !apex) return 999;
  const legs = part === 'thigh' || part === 'shin' || part === 'foot';
  if (apex && def.apex && def.damageNear !== undefined) { // v62u the Apex counterpart's damage (APEX_WEAPONS): a blast keeps its Apex total over our pellets
    const a = def.apex, m = part === 'head' ? (dist <= a.headMax ? a.head / a.body : 1) : legs ? a.leg / a.body : 1;
    const t = def.type === 'shotgun' ? clamp((dist - def.falloffStart) / Math.max(1e-3, def.falloffEnd - def.falloffStart), 0, 1) : 0; // our shotgun falloff, as before
    return a.body * a.pellets / def.pellets * (1 + (def.damageFar / def.damageNear - 1) * t) * m * mult;
  }
  const m = part === 'head' ? (def.headMult ?? PART_MULT.head) : PART_MULT[part] ?? 1; // SF2 (and a gun with no Apex counterpart: none now)
  let base;
  if (def.damageNear !== undefined) base = def.damageNear + (def.damageFar - def.damageNear) * clamp((dist - def.falloffStart) / Math.max(1e-3, def.falloffEnd - def.falloffStart), 0, 1);
  else base = def.damage * Math.pow(def.falloff ?? 1, dist / 10);
  return base * m * mult;
}

// v24: lightweight per-frame profiler (EMA + worst of the last window) → window.__stats / tools/check.mjs / FPS overlay.
class FrameProfiler {
  constructor() { this.k = {}; }
  add(name, ms) { const e = this.k[name] || (this.k[name] = { avg: ms, max: 0, winMax: 0, n: 0 }); e.avg += (ms - e.avg) * 0.05; e.winMax = Math.max(e.winMax, ms); if (++e.n >= 120) { e.max = e.winMax; e.winMax = 0; e.n = 0; } }
  snapshot() { const o = {}; for (const [k, e] of Object.entries(this.k)) o[k] = { avg: +e.avg.toFixed(2), max: +Math.max(e.max, e.winMax).toFixed(1) }; return o; }
}

// v24 input latency: a GPU that cannot finish a frame within one refresh lets the browser queue 2–3 frames, so the picture
// trails the mouse by 50–100 ms even at a decent FPS. A fence after each frame tells how many submitted frames the GPU has
// not finished yet (WebGL2 updates sync status between tasks, i.e. by the next rAF).
class GpuPacer {
  constructor(gl) { this.gl = gl; this.ok = !!(gl && gl.fenceSync); this.fences = []; this.skips = 0; }
  inFlight() {
    const gl = this.gl;
    while (this.fences.length && gl.getSyncParameter(this.fences[0], gl.SYNC_STATUS) === gl.SIGNALED) gl.deleteSync(this.fences.shift());
    return this.fences.length;
  }
  mark() {
    if (!this.ok) return;
    const gl = this.gl, f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    if (f) this.fences.push(f); if (this.fences.length > 4) gl.deleteSync(this.fences.shift());
  }
}

const Settings = {
  data: {
    sens: 2.0, zoomSens: 1.0, volume: 0.8, fov: 75, quality: 'high', hdri: true, adsMode: 'toggle', announcer: true, showFps: true, hipMode: 'precise', killcam: true,
    hitSound: 'sf2', // v38 ESC → 命中音效 (audition list, HIT_SOUNDS); v64e SF2's own by default
    hudStyle: 'minimal', // v19: 'minimal' (SF2) | 'panel' (v5)
    loadouts: DEFAULT_LOADOUTS.map((l) => Object.assign({}, l)),
    lobby: { map: 5, mode: 'general', rule: 'dom', difficulty: 1, allies: 6, enemies: 6, loadout: 0, opts: { pickup: true, killcam: true, ff: false },
      ruleCfg: Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, Object.assign({}, r.def)])) },
  },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('sf2proto.v3') || 'null') || JSON.parse(localStorage.getItem('sf2proto.v2') || 'null');
      if (s) {
        const lobby = Object.assign({}, this.data.lobby, s.lobby || {});
        lobby.ruleCfg = Object.assign({}, this.data.lobby.ruleCfg, (s.lobby && s.lobby.ruleCfg) || {});
        lobby.opts = Object.assign({ pickup: true, killcam: true, ff: false }, lobby.opts); if (lobby.loadout > 2) lobby.loadout = 0; lobby.enemies = lobby.allies = Math.max(lobby.allies | 0, 1); // v45 room: N vs N
        if (!RULES[lobby.rule]) lobby.rule = 'tdm';
        for (const [k, r] of Object.entries(RULES)) { const c = lobby.ruleCfg[k]; if (!c || !r.targets.includes(c.target) || !r.times.includes(c.time)) lobby.ruleCfg[k] = Object.assign({}, r.def); }
        const loadouts = Array.isArray(s.loadouts) && s.loadouts.length >= 3 ? s.loadouts.slice(0, 3) : this.data.loadouts; // v45: 5 sets → 3
        Object.assign(this.data, s); this.data.lobby = lobby; this.data.loadouts = loadouts;
        for (const l of this.data.loadouts) { if (!WEAPON_DATABASE[l.primary] || WEAPON_DATABASE[l.primary].slot !== 'primary') l.primary = 'm4a1'; if (!WEAPON_DATABASE[l.secondary] || WEAPON_DATABASE[l.secondary].slot !== 'secondary') l.secondary = 'p226'; }
        const used = new Set(); // v45: a primary can sit in one set only — later duplicates take the first free gun
        for (const l of this.data.loadouts) { if (used.has(l.primary)) l.primary = PRIMARY_IDS.find((k) => !used.has(k) && !this.data.loadouts.some((o) => o.primary === k)); used.add(l.primary); }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() { try { localStorage.setItem('sf2proto.v3', JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
};
Settings.load();

// v62s graphics presets (moved from 15_postfx.js: the map builders read activeQuality() too)
// low also drops world image-based reflections (−3.7 ms; hemisphere fill compensates, the gun keeps its own) and redraws the
// sun shadow map every 2nd frame (−3 ms): Intel UHD 1080p ≈ 19.6 ms at 70 % res, ≈ 15 ms after dynamic resolution.
// v24 (frozen 12v12 frame, Intel UHD, 50 % res): 1-tap hard shadows on low −1.8 ms (PCF = 9 taps in every pixel); soldier LOD 587k → 81k triangles.
const QUALITY = {
  low:    { post: false, pr: 0.7, shadow: 1024, soft: false, hard: true, mapLights: true, fxLights: false, worldEnv: false, shadowEvery: 2, ao: 0, bloom: false, minScale: 0.5 },
  medium: { post: true, pr: 0.85, shadow: 1024, soft: false, mapLights: true, fxLights: false, ao: 0, bloom: true, smaa: false, minScale: 0.55 },
  high:   { post: true, pr: 1, shadow: 2048, soft: true, mapLights: true, fxLights: true, ao: 0, bloom: true, smaa: true, minScale: 0.55 },
  ultra:  { post: true, pr: 1.25, shadow: 4096, soft: true, mapLights: true, fxLights: true, ao: 1, bloom: true, smaa: true, minScale: 0.6 },
};
const Q_ORDER = ['low', 'medium', 'high', 'ultra'];
const Q_LABEL = { low: '低', medium: '中', high: '高', ultra: '極致' };
// Settings 'auto' (v24 default): the governor's current preset — starts at high on a discrete GPU, low on an integrated one.
let AUTO_Q = null;
function setAutoQ(q) { AUTO_Q = q; } // (v62s ES modules: an importer cannot assign another module's binding — 17_app sets it through here)
function activeQuality() { const q = Settings.data.quality; return q === 'auto' ? (AUTO_Q || 'high') : (QUALITY[q] ? q : 'high'); }

// Resolve a loadout into this mode's weapon list.
function loadoutDefs(mode, loadout) {
  const M = MODES[mode];
  return M.slots.map((s) => {
    if (s === 'primary') { let id = loadout.primary; if (M.primaryFilter && !M.primaryFilter.includes(WEAPON_DEFS[id].kind)) id = M.fallback; return WEAPON_DEFS[id]; }
    if (s === 'secondary') return WEAPON_DEFS[loadout.secondary];
    return WEAPON_DEFS[s];
  });
}


export { sf2Load, sf2Speed, APEX, APEX_POOL, APEX_STEP, APEX_WEAPONS, AUTO_Q, BOT_POOLS, CANNON, CFG, DIFFICULTY, DRACOLoader, EffectComposer, FREEZE_TIME, FrameProfiler, FullScreenQuad, GLTFLoader, GTAOPass, GpuPacer, LOADOUT_KEYS, MODES, OutputPass, PART_MULT, POINTS, PRIMARY_IDS, Pass, QUALITY, Q_LABEL, Q_ORDER, RGBELoader, RULES, RenderPass, RoomEnvironment, RoundedBoxGeometry, SECONDARY_IDS, SMAAPass, STAR_BADGE, Settings, SkeletonUtils, Sky, THREE, TIPS, TMP_V1, TMP_V2, TMP_V3, TMP_V4, TYPE_LABEL, UnrealBloomPass, WEAPON_BLURBS, WEAPON_DATABASE, WEAPON_DEFS, WEAPON_ICONS, activeQuality, apexShield, calcDamage, clamp, damp, lerp, loadoutDefs, mapThumb, mergeGeometries, mulberry32, nextFrame, pick, rand, randInt, setAutoQ, shotRng, sleep, weaponStats, wrapAngle };

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* =====================================================================
   CORE CONFIG — movement, damage model, modes, difficulty, scoring.
   ===================================================================== */
const CFG = {
  gravity: -20,
  fixedStep: 1 / 120,
  player: {
    radius: 0.34, height: 1.8, crouchHeight: 1.2, eye: 1.64, crouchEye: 1.06,
    stepHeight: 0.45, airStep: 0.36, jumpVel: 7.0, jumpBuffer: 0.12,
    groundAccel: 14, airAccel: 10, airCap: 0.85,
    friction: 8, brakeFriction: 18, stopSpeed: 3.2,
    sprintMult: 1.3, crouchMult: 0.36, hp: 100, climbSpeed: 3.4, baseSpeed: 5.9,
  },
  bot: { eye: 1.6, runSpeed: 4.9, patrolSpeed: 3.3 },
  spawnProtect: 3.5,
  respawn: 3.0,
  assistWindow: 10,
};

// Score awarded to the killer's team (team score = sum of member scores).
const POINTS = { head: 50, body: 30, knife: 50, grenade: 40, assist: 15, capture: 75, relic: 150 };

// Hit-zone multipliers (chest = weapon base damage).
const PART_MULT = { head: 1, chest: 1, stomach: 0.9, thigh: 0.72, shin: 0.55, foot: 0.4 };
const PART_LABEL = { head: '頭部', chest: '胸部', stomach: '腹部', thigh: '大腿', shin: '小腿', foot: '腳' };

/* ---------------------------------------------------------------------
   WEAPON DATABASE — data-driven. Each entry uses the public schema
   (name, type, damage, fireRate, recoilPitch, recoilYaw, recoilRecovery,
   hipSpread, adsSpread, adsFov, adsType, mobility, maxAmmo, reloadTime,
   modelUrl) plus optional tuning; `compileWeapon` turns it into the
   runtime definition. Adding a weapon = adding one entry.
     • Primary (rifle / SMG / LMG / sniper): headshot = instant kill.
     • Rifles 23–24 dmg → chest 5 · thigh 6–7 · foot 11 shots.
     • Pistols: headshot needs 2 shots.
   ------------------------------------------------------------------- */
const WEAPON_DATABASE = {
  m4a1: {
    name: 'M4A1', type: 'assault', slot: 'primary', damage: 24, fireRate: 0.09,
    recoilPitch: 0.012, recoilYaw: 0.009, recoilRecovery: 9,
    hipSpread: 0.075, adsSpread: 0.0022, adsFov: 55, adsType: '3d_sight', mobility: 0.95, maxAmmo: 30, reloadTime: 2.2, modelUrl: null,
    model: 'm4', sound: 'm4', tracerEvery: 2, penetration: 1, desc: '均衡的全自動步槍，全息瞄具。',
  },
  g36c: {
    name: 'G36C 黃金', type: 'assault', slot: 'primary', damage: 23, fireRate: 0.08,
    recoilPitch: 0.011, recoilYaw: 0.012, recoilRecovery: 10,
    hipSpread: 0.07, adsSpread: 0.0018, adsFov: 50, adsType: 'red_dot', mobility: 0.95, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'g36c', sound: 'g36s', suppressed: true, tracerEvery: 0, penetration: 1, desc: '提把紅點 + 消音器，槍聲小、不暴露雷達。',
  },
  mp5: {
    name: 'MP5', type: 'smg', slot: 'primary', damage: 19, fireRate: 0.07,
    recoilPitch: 0.008, recoilYaw: 0.008, recoilRecovery: 12,
    hipSpread: 0.055, adsSpread: 0.003, adsFov: 58, adsType: '3d_sight', mobility: 1.02, maxAmmo: 30, reloadTime: 2.0, modelUrl: null,
    model: 'mp5', sound: 'mp5', falloff: 0.965, range: 170, tracerEvery: 3, desc: '經典衝鋒槍，腰射較穩定。',
  },
  p90: {
    name: 'P90', type: 'smg', slot: 'primary', damage: 18, fireRate: 0.066,
    recoilPitch: 0.006, recoilYaw: 0.007, recoilRecovery: 14,
    hipSpread: 0.05, adsSpread: 0.0035, adsFov: 60, adsType: 'red_dot', mobility: 1.05, maxAmmo: 50, reloadTime: 2.5, modelUrl: null,
    model: 'p90', sound: 'p90', falloff: 0.96, range: 160, tracerEvery: 3, desc: '無托結構、頂置 50 發彈匣，射速最快。',
  },
  remington870: {
    name: 'Remington 870', type: 'shotgun', slot: 'primary', damage: 18, pellets: 8, fireRate: 1.0,
    recoilPitch: 0.08, recoilYaw: 0.02, recoilRecovery: 6,
    hipSpread: 0.11, adsSpread: 0.075, adsFov: 65, adsType: 'none', mobility: 0.9, maxAmmo: 8, reloadTime: 3.5, modelUrl: null,
    model: 'm870', sound: 'm870', falloff: 0.82, range: 60, headKill: false, headMult: 2, shellReload: 0.44, tracerEvery: 0, desc: '泵動式散彈槍，8 顆彈丸，貼身一槍致命。',
  },
  m249: {
    name: 'M249', type: 'lmg', slot: 'primary', damage: 24, fireRate: 0.075,
    recoilPitch: 0.011, recoilYaw: 0.014, recoilRecovery: 8,
    hipSpread: 0.09, adsSpread: 0.004, adsFov: 55, adsType: '3d_sight', mobility: 0.8, maxAmmo: 100, reloadTime: 5.5, modelUrl: null,
    model: 'm249', sound: 'm249', penetration: 2, falloff: 0.995, range: 300, adsSpeed: 10, reserveMult: 2, tracerEvery: 2, desc: '輕機槍：100 發彈鏈，換彈慢、移動慢。',
  },
  cheytac_m200: {
    name: 'CheyTac M200', type: 'sniper', slot: 'primary', damage: 115, fireRate: 1.2,
    recoilPitch: 0.075, recoilYaw: 0.01, recoilRecovery: 5,
    hipSpread: 0.15, adsSpread: 0.0, adsFov: 15, adsType: '2d_scope_overlay', mobility: 0.8, maxAmmo: 5, reloadTime: 3.2, modelUrl: null,
    model: 'm200', sound: 'm200', zoomFovs: [15, 7], penetration: 2, range: 450, adsSpeed: 16, tracerEvery: 1, desc: '栓動狙擊，站定開鏡第 1 幀 100% 精準。',
  },
  p226: {
    name: 'P226', type: 'pistol', slot: 'secondary', damage: 26, fireRate: 0.18,
    recoilPitch: 0.03, recoilYaw: 0.005, recoilRecovery: 12,
    hipSpread: 0.03, adsSpread: 0.004, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 15, reloadTime: 1.5, modelUrl: null,
    model: 'p226', sound: 'p226', headMult: 2.1, falloff: 0.97, range: 160, desc: '半自動手槍，爆頭 2 槍。',
  },
  deagle: {
    name: 'Desert Eagle', type: 'pistol', slot: 'secondary', damage: 45, fireRate: 0.3,
    recoilPitch: 0.05, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.04, adsSpread: 0.004, adsFov: 58, adsType: '3d_sight', mobility: 0.97, maxAmmo: 7, reloadTime: 2.1, modelUrl: null,
    model: 'deagle', sound: 'deagle', headMult: 2.0, falloff: 0.97, range: 180, penetration: 1, desc: '.50 大口徑，身體 3 槍、爆頭 2 槍。',
  },
  /* ------------------------------ v5 arsenal (31 guns, ≥5 per class) ------------------------------ */
  ak47: {
    name: 'AK-47', type: 'assault', slot: 'primary', damage: 24.5, fireRate: 0.1, recoilPitch: 0.016, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.08, adsSpread: 0.0028, adsFov: 58, adsType: '3d_sight', mobility: 0.93, maxAmmo: 30, reloadTime: 2.5, modelUrl: null,
    sound: 'ak', penetration: 2, falloff: 0.988, bloomPerShot: 0.005, bloomMax: 0.032, tp: { len: 0.9, body: 'wood', mag: 'curve' }, desc: '7.62mm 重火力，後座力大、穿透強，機械瞄具。',
  },
  scarl: {
    name: 'SCAR-L', type: 'assault', slot: 'primary', damage: 23.5, fireRate: 0.096, recoilPitch: 0.011, recoilYaw: 0.008, recoilRecovery: 10,
    hipSpread: 0.072, adsSpread: 0.0019, adsFov: 52, adsType: '3d_sight', mobility: 0.94, maxAmmo: 30, reloadTime: 2.3, modelUrl: null,
    sound: 'scar', penetration: 1, tp: { len: 0.88, body: 'tan', mag: 'box' }, desc: '沙色模組化步槍，後座柔和、全息瞄具。',
  },
  famas: {
    name: 'FAMAS', type: 'assault', slot: 'primary', damage: 21.5, fireRate: 0.06, recoilPitch: 0.0105, recoilYaw: 0.013, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0028, adsFov: 56, adsType: '3d_sight', mobility: 0.96, maxAmmo: 25, reloadTime: 2.7, modelUrl: null,
    sound: 'm4', rate: 1.12, tp: { len: 0.76, body: 'dark', mag: 'box', bull: true }, desc: '法國無托步槍，射速 1000 RPM，提把機械瞄具。',
  },
  aug: {
    name: 'Steyr AUG', type: 'assault', slot: 'primary', damage: 22.5, fireRate: 0.085, recoilPitch: 0.0095, recoilYaw: 0.007, recoilRecovery: 11,
    hipSpread: 0.07, adsSpread: 0.0014, adsFov: 40, adsType: 'red_dot', mobility: 0.95, maxAmmo: 30, reloadTime: 2.4, modelUrl: null,
    sound: 'm4', rate: 0.94, tp: { len: 0.8, body: 'green', mag: 'box', bull: true, scope: true }, desc: '無托步槍，內建 1.5 倍光學瞄具，最精準的突擊步槍。',
  },
  ump45: {
    name: 'UMP45', type: 'smg', slot: 'primary', damage: 22, fireRate: 0.092, recoilPitch: 0.0105, recoilYaw: 0.009, recoilRecovery: 11,
    hipSpread: 0.055, adsSpread: 0.003, adsFov: 58, adsType: 'red_dot', mobility: 1.0, maxAmmo: 25, reloadTime: 2.1, modelUrl: null,
    sound: 'ump', falloff: 0.955, range: 150, tp: { len: 0.62, body: 'dark', mag: 'box' }, desc: '.45 大口徑衝鋒槍，單發傷害高、射速慢。',
  },
  vector: {
    name: 'KRISS Vector', type: 'smg', slot: 'primary', damage: 16, fireRate: 0.052, recoilPitch: 0.0055, recoilYaw: 0.006, recoilRecovery: 15,
    hipSpread: 0.05, adsSpread: 0.0035, adsFov: 60, adsType: 'red_dot', mobility: 1.04, maxAmmo: 25, reloadTime: 1.9, modelUrl: null,
    sound: 'vector', falloff: 0.95, range: 130, tp: { len: 0.6, body: 'dark', mag: 'box' }, desc: 'Super V 減後座系統，1150 RPM 極速但彈匣小。',
  },
  mp7: {
    name: 'MP7A1', type: 'smg', slot: 'primary', damage: 17, fireRate: 0.063, recoilPitch: 0.0065, recoilYaw: 0.0065, recoilRecovery: 14,
    hipSpread: 0.048, adsSpread: 0.003, adsFov: 60, adsType: 'red_dot', mobility: 1.06, maxAmmo: 40, reloadTime: 2.0, modelUrl: null,
    sound: 'mp7', falloff: 0.96, range: 160, penetration: 1, tp: { len: 0.52, body: 'dark', mag: 'none' }, desc: '4.6mm 穿甲彈，體積最小、機動性最高。',
  },
  rpk: {
    name: 'RPK', type: 'lmg', slot: 'primary', damage: 24, fireRate: 0.1, recoilPitch: 0.013, recoilYaw: 0.012, recoilRecovery: 8,
    hipSpread: 0.085, adsSpread: 0.0035, adsFov: 56, adsType: '3d_sight', mobility: 0.85, maxAmmo: 75, reloadTime: 4.2, modelUrl: null,
    sound: 'ak', rate: 0.92, penetration: 2, reserveMult: 3, tp: { len: 1.04, body: 'wood', mag: 'drum' }, desc: 'AK 系重槍管機槍，75 發彈鼓，機械瞄具。',
  },
  negev: {
    name: 'Negev', type: 'lmg', slot: 'primary', damage: 20, fireRate: 0.066, recoilPitch: 0.01, recoilYaw: 0.015, recoilRecovery: 8,
    hipSpread: 0.095, adsSpread: 0.0045, adsFov: 54, adsType: 'red_dot', mobility: 0.8, maxAmmo: 150, reloadTime: 5.8, modelUrl: null,
    sound: 'm249', rate: 1.08, reserveMult: 2, tp: { len: 1.0, body: 'dark', mag: 'belt' }, desc: '150 發彈鏈、900 RPM 壓制火力，左右晃動大。',
  },
  pkm: {
    name: 'PKM', type: 'lmg', slot: 'primary', damage: 23.5, fireRate: 0.09, recoilPitch: 0.014, recoilYaw: 0.013, recoilRecovery: 7,
    hipSpread: 0.09, adsSpread: 0.004, adsFov: 55, adsType: '3d_sight', mobility: 0.76, maxAmmo: 100, reloadTime: 6.2, modelUrl: null,
    sound: 'pkm', penetration: 2, reserveMult: 2, tp: { len: 1.12, body: 'dark', mag: 'belt' }, desc: '7.62×54R 通用機槍，穿透與射程最佳，非常笨重。',
  },
  mg42: {
    name: 'MG42', type: 'lmg', slot: 'primary', damage: 22, fireRate: 0.05, recoilPitch: 0.012, recoilYaw: 0.018, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.005, adsFov: 56, adsType: '3d_sight', mobility: 0.74, maxAmmo: 50, reloadTime: 5.0, modelUrl: null,
    sound: 'mg42', penetration: 2, reserveMult: 3, tp: { len: 1.18, body: 'dark', mag: 'drum' }, desc: '「希特勒電鋸」1200 RPM，散熱槍管套，極難控制。',
  },
  benelli_m4: {
    name: 'Benelli M4', type: 'shotgun', slot: 'primary', damage: 15, pellets: 8, fireRate: 0.26, recoilPitch: 0.06, recoilYaw: 0.02, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.068, adsFov: 64, adsType: '3d_sight', mobility: 0.9, maxAmmo: 7, reloadTime: 3.3, modelUrl: null,
    sound: 'm870', rate: 1.06, pump: false, shellReload: 0.45, falloff: 0.8, range: 55, headKill: false, headMult: 2, tracerEvery: 0, tp: { len: 0.98, body: 'dark', mag: 'none' }, desc: '半自動散彈槍（戰術版伸縮托），連發速度快。',
  },
  m1014: {
    name: 'M1014', type: 'shotgun', slot: 'primary', damage: 16, pellets: 8, fireRate: 0.3, recoilPitch: 0.065, recoilYaw: 0.02, recoilRecovery: 7,
    hipSpread: 0.105, adsSpread: 0.072, adsFov: 64, adsType: '3d_sight', mobility: 0.88, maxAmmo: 8, reloadTime: 3.8, modelUrl: null,
    sound: 'm870', rate: 1.0, pump: false, shellReload: 0.46, falloff: 0.8, range: 55, headKill: false, headMult: 2, tracerEvery: 0, tp: { len: 1.02, body: 'tan', mag: 'none' }, desc: 'Benelli M4 的美軍版（固定托、沙色），8 發管式彈倉。',
  },
  saiga12: {
    name: 'Saiga-12', type: 'shotgun', slot: 'primary', damage: 13, pellets: 9, fireRate: 0.22, recoilPitch: 0.07, recoilYaw: 0.022, recoilRecovery: 7,
    hipSpread: 0.11, adsSpread: 0.08, adsFov: 64, adsType: '3d_sight', mobility: 0.9, maxAmmo: 8, reloadTime: 3.0, modelUrl: null,
    sound: 'saiga', pump: false, falloff: 0.79, range: 50, headKill: false, headMult: 2, tracerEvery: 0, tp: { len: 0.95, body: 'dark', mag: 'box' }, desc: 'AK 系統半自動散彈槍，彈匣供彈、換彈最快。',
  },
  ksg: {
    name: 'KSG', type: 'shotgun', slot: 'primary', damage: 17, pellets: 8, fireRate: 0.8, recoilPitch: 0.075, recoilYaw: 0.02, recoilRecovery: 6,
    hipSpread: 0.1, adsSpread: 0.07, adsFov: 64, adsType: 'red_dot', mobility: 0.9, maxAmmo: 14, reloadTime: 5.2, modelUrl: null,
    sound: 'm870', rate: 0.96, shellReload: 0.36, falloff: 0.82, range: 60, headKill: false, headMult: 2, tracerEvery: 0, tp: { len: 0.72, body: 'dark', mag: 'none', bull: true }, desc: '雙管式彈倉無托泵動散彈槍，14 發容量。',
  },
  awp: {
    name: 'AWP', type: 'sniper', slot: 'primary', damage: 115, fireRate: 1.45, recoilPitch: 0.07, recoilYaw: 0.01, recoilRecovery: 5,
    hipSpread: 0.15, adsSpread: 0.0, adsFov: 18, adsType: '2d_scope_overlay', mobility: 0.78, maxAmmo: 10, reloadTime: 3.6, modelUrl: null,
    sound: 'awp', zoomFovs: [18, 8], penetration: 2, range: 450, adsSpeed: 15, tracerEvery: 1, tp: { len: 1.18, body: 'green', mag: 'box', scope: true }, desc: '經典綠色拇指孔槍托，10 發彈匣，一槍斃命。',
  },
  barrett: {
    name: 'Barrett M82', type: 'sniper', slot: 'primary', damage: 140, fireRate: 0.45, recoilPitch: 0.11, recoilYaw: 0.02, recoilRecovery: 4,
    hipSpread: 0.18, adsSpread: 0.0, adsFov: 20, adsType: '2d_scope_overlay', mobility: 0.7, maxAmmo: 10, reloadTime: 4.2, modelUrl: null,
    sound: 'barrett', bolt: false, zoomFovs: [20, 9], penetration: 3, range: 500, adsSpeed: 12, tracerEvery: 1, tp: { len: 1.4, body: 'dark', mag: 'box', scope: true }, desc: '.50 BMG 半自動反器材步槍，打腿也一槍倒，後座驚人。',
  },
  kar98k: {
    name: 'Kar98k', type: 'sniper', slot: 'primary', damage: 100, fireRate: 1.3, recoilPitch: 0.06, recoilYaw: 0.01, recoilRecovery: 6,
    hipSpread: 0.12, adsSpread: 0.0, adsFov: 28, adsType: '2d_scope_overlay', mobility: 0.9, maxAmmo: 5, reloadTime: 3.0, modelUrl: null,
    sound: 'kar98', zoomFovs: [28, 14], penetration: 2, range: 400, adsSpeed: 17, tracerEvery: 1, tp: { len: 1.1, body: 'wood', mag: 'none', scope: true }, desc: '二戰木製栓動步槍，低倍鏡、開鏡快、輕巧。',
  },
  svd: {
    name: 'SVD Dragunov', type: 'sniper', slot: 'primary', damage: 70, fireRate: 0.32, recoilPitch: 0.045, recoilYaw: 0.012, recoilRecovery: 7,
    hipSpread: 0.1, adsSpread: 0.0008, adsFov: 26, adsType: '2d_scope_overlay', mobility: 0.86, maxAmmo: 10, reloadTime: 3.0, modelUrl: null,
    sound: 'svd', bolt: false, zoomFovs: [26, 13], penetration: 2, range: 400, adsSpeed: 16, tracerEvery: 1, tp: { len: 1.2, body: 'wood', mag: 'box', scope: true }, desc: '半自動精確射手步槍：身體 2 槍、爆頭 1 槍，射速快。',
  },
  glock18: {
    name: 'Glock 18', type: 'pistol', slot: 'secondary', damage: 18, fireRate: 0.05, recoilPitch: 0.018, recoilYaw: 0.014, recoilRecovery: 12,
    hipSpread: 0.035, adsSpread: 0.006, adsFov: 62, adsType: '3d_sight', mobility: 1.02, maxAmmo: 20, reloadTime: 1.6, modelUrl: null,
    sound: 'p226', rate: 1.12, auto: true, headMult: 3.0, falloff: 0.96, range: 120, tp: { len: 0.2, body: 'dark', pistol: true }, desc: '全自動手槍，1200 RPM，爆頭 2 槍。',
  },
  usp: {
    name: 'USP-S', type: 'pistol', slot: 'secondary', damage: 24, fireRate: 0.16, recoilPitch: 0.024, recoilYaw: 0.006, recoilRecovery: 12,
    hipSpread: 0.026, adsSpread: 0.0035, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 12, reloadTime: 1.7, modelUrl: null,
    sound: 'usp', suppressed: true, headMult: 2.3, falloff: 0.97, range: 170, tp: { len: 0.34, body: 'dark', pistol: true }, desc: '消音手槍：安靜、不暴露雷達、最精準的副武器。',
  },
  m1911: {
    name: 'Colt M1911', type: 'pistol', slot: 'secondary', damage: 34, fireRate: 0.2, recoilPitch: 0.04, recoilYaw: 0.01, recoilRecovery: 9,
    hipSpread: 0.032, adsSpread: 0.0045, adsFov: 60, adsType: '3d_sight', mobility: 1.0, maxAmmo: 7, reloadTime: 1.8, modelUrl: null,
    sound: 'm1911', headMult: 2.0, falloff: 0.97, range: 170, tp: { len: 0.22, body: 'steel', pistol: true }, desc: '.45 ACP 經典手槍：身體 3 槍、爆頭 2 槍。',
  },
};

const TYPE_TUNING = { // spread growth / movement penalties per weapon family
  assault: { kind: 'rifle', bloomPerShot: 0.0042, bloomMax: 0.028, spreadMove: 0.045, adsMoveSpread: 0.03, spreadSprint: 0.1, spreadAir: 0.18, spreadPerShot: 0.008, spreadMax: 0.06, adsBloomMult: 0.3, spreadRecover: 5, noise: 40, reloadSounds: [[0.18, 'magout'], [0.58, 'magin'], [0.82, 'charge']], kick: { z: 0.042, y: 0.01, rx: 0.06 }, adsMove: 0.75 },
  smg: { kind: 'smg', bloomPerShot: 0.0032, bloomMax: 0.024, spreadMove: 0.03, adsMoveSpread: 0.02, spreadSprint: 0.075, spreadAir: 0.14, spreadPerShot: 0.006, spreadMax: 0.05, adsBloomMult: 0.35, spreadRecover: 6.5, noise: 32, reloadSounds: [[0.18, 'magout'], [0.55, 'magin'], [0.8, 'charge']], kick: { z: 0.03, y: 0.008, rx: 0.045 }, adsMove: 0.82 },
  lmg: { kind: 'lmg', bloomPerShot: 0.0036, bloomMax: 0.034, spreadMove: 0.06, adsMoveSpread: 0.04, spreadSprint: 0.12, spreadAir: 0.2, spreadPerShot: 0.009, spreadMax: 0.07, adsBloomMult: 0.35, spreadRecover: 4, noise: 46, reloadSounds: [[0.12, 'boltback'], [0.35, 'magout'], [0.65, 'magin'], [0.88, 'charge']], kick: { z: 0.05, y: 0.012, rx: 0.065 }, adsMove: 0.6 },
  shotgun: { kind: 'shotgun', bloomPerShot: 0, bloomMax: 0, spreadMove: 0.02, adsMoveSpread: 0.015, spreadSprint: 0.04, spreadAir: 0.06, spreadPerShot: 0, spreadMax: 0, adsBloomMult: 0, spreadRecover: 6, noise: 48, reloadSounds: [], kick: { z: 0.1, y: 0.02, rx: 0.2 }, adsMove: 0.8 },
  sniper: { kind: 'sniper', bloomPerShot: 0, bloomMax: 0, spreadMove: 0.1, adsMoveSpread: 0, spreadSprint: 0.14, spreadAir: 0.26, spreadPerShot: 0, spreadMax: 0, adsBloomMult: 0, spreadRecover: 5, noise: 60, reloadSounds: [[0.16, 'magout'], [0.52, 'magin'], [0.74, 'boltback'], [0.88, 'boltfwd']], kick: { z: 0.12, y: 0.02, rx: 0.22 }, adsMove: 0.5 },
  pistol: { kind: 'pistol', bloomPerShot: 0.0065, bloomMax: 0.03, spreadMove: 0.028, adsMoveSpread: 0.018, spreadSprint: 0.06, spreadAir: 0.1, spreadPerShot: 0.018, spreadMax: 0.06, adsBloomMult: 0.5, spreadRecover: 6, noise: 30, reloadSounds: [[0.18, 'magout'], [0.58, 'magin'], [0.84, 'slide']], kick: { z: 0.035, y: 0.01, rx: 0.14 }, adsMove: 0.85 },
};

function compileWeapon(id, s) {
  const t = TYPE_TUNING[s.type];
  const auto = s.auto ?? (s.type === 'assault' || s.type === 'smg' || s.type === 'lmg');
  const pump = s.type === 'shotgun' && s.pump !== false, bolt = s.type === 'sniper' && s.bolt !== false;
  const def = Object.assign({}, t, {
    id, name: s.name, kind: t.kind, type: s.type, slot: s.slot, model: s.model || id, modelUrl: s.modelUrl || null, desc: s.desc || '',
    mag: s.maxAmmo, reserve: s.maxAmmo * (s.reserveMult || (s.type === 'sniper' ? 5 : 4)), interval: s.fireRate, auto,
    damage: s.damage, pellets: s.pellets || 1, headKill: s.headKill ?? (s.slot === 'primary'), headMult: s.headMult || 4,
    falloff: s.falloff ?? (s.type === 'sniper' ? 1 : 0.99), range: s.range || 260, penetration: s.penetration || 0,
    hipBase: s.hipSpread, adsBase: s.adsSpread, spreadBase: s.hipSpread, spreadCrouch: 0.8,
    recoil: { first: s.recoilPitch * 0.75, climb: s.recoilPitch, climbShots: 10, late: s.recoilPitch * 0.75, h: s.recoilYaw, hStart: 6, jitter: s.recoilYaw * 0.35 },
    recoilRecovery: s.recoilRecovery, adsFov: s.adsFov, adsType: s.adsType, adsRecoilMult: 1, adsSpeed: s.adsSpeed || (s.type === 'smg' ? 24 : 20),
    moveSpeed: CFG.player.baseSpeed * s.mobility, mobility: s.mobility, reloadTime: s.reloadTime, sound: s.sound || id,
    suppressed: !!s.suppressed, tracerEvery: s.tracerEvery ?? 2, shellReload: s.shellReload || 0, zoomFovs: s.zoomFovs || [s.adsFov],
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

const WEAPON_DEFS = {};
for (const [id, s] of Object.entries(WEAPON_DATABASE)) WEAPON_DEFS[id] = compileWeapon(id, s);
Object.assign(WEAPON_DEFS, {
  knife: {
    id: 'knife', name: 'KNIFE', kind: 'knife', model: 'knife', moveSpeed: 6.4, adsMove: 1,
    slash: { dmg: 35, range: 2.1, interval: 0.42, delay: 0.06 },
    stab: { dmg: 70, range: 1.75, interval: 0.95, delay: 0.18 },
    headMult: 1.5, falloff: 1, noise: 6,
  },
  grab: { id: 'grab', name: '擒拿', kind: 'grab', damage: 78, killRange: 1.15, range: 1.9, headMult: 1, falloff: 1 },
  he: { id: 'he', name: '手榴彈', kind: 'grenade', gtype: 'he', model: 'he', count: 1, fuse: 2.6, damage: 130, radius: 9, lethal: 1.4, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
  flash: { id: 'flash', name: '閃光彈', kind: 'grenade', gtype: 'flash', model: 'flash', count: 2, fuse: 1.9, radius: 24, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
  smoke: { id: 'smoke', name: '煙霧彈', kind: 'grenade', gtype: 'smoke', model: 'smoke', count: 1, fuse: 1.8, duration: 17, moveSpeed: 6.0, adsMove: 1, falloff: 1 },
});
const PRIMARY_IDS = Object.keys(WEAPON_DATABASE).filter((k) => WEAPON_DATABASE[k].slot === 'primary');
const SECONDARY_IDS = Object.keys(WEAPON_DATABASE).filter((k) => WEAPON_DATABASE[k].slot === 'secondary');
const WEAPON_ICONS = {}; // id → line-art dataURL (generated at boot)
// v20 armory card intros (one line, role-focused; SF2-style list supplied by the user where the gun matches).
const WEAPON_BLURBS = {
  m4a1: '泛用性最高的標準步槍，後座力易控。',
  g36c: '緊湊型步槍，機動性佳；消音器讓你不上敵方雷達。',
  ak47: '單發破壞力極高，但後座力大，需要精準的點射技巧。',
  scarl: '單發傷害與穿透力優異的模組化步槍。',
  famas: '高射速的犢牛式步槍，近距離爆發力強。',
  aug: '內建基礎瞄具，適合中遠距離穩定輸出。',
  mp5: '經典衝鋒槍，腰射穩定、容錯率高。',
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
};
const TYPE_LABEL = { assault: '突擊步槍', smg: '衝鋒槍', lmg: '輕機槍', shotgun: '散彈槍', sniper: '狙擊槍', pistol: '手槍' };

// 0–100 stat bars for the Warehouse UI.
function weaponStats(id) {
  const s = WEAPON_DATABASE[id], d = WEAPON_DEFS[id];
  return {
    damage: clamp(Math.round((s.damage * (s.pellets || 1)) / 60 * 100), 5, 100),
    fireRate: clamp(Math.round(60 / s.fireRate / 950 * 100), 5, 100),
    accuracy: clamp(Math.round((1 - clamp(s.adsSpread / 0.08, 0, 1)) * 60 + (1 - clamp(s.hipSpread / 0.16, 0, 1)) * 40), 5, 100),
    control: clamp(Math.round((1 - clamp(s.recoilPitch / 0.09, 0, 1)) * 100), 5, 100),
    mobility: clamp(Math.round(s.mobility * 90), 5, 100),
    rpm: Math.round(60 / s.fireRate), mag: s.maxAmmo, kind: d.kind,
  };
}

const DEFAULT_LOADOUTS = [
  { name: '突擊兵', primary: 'm4a1', secondary: 'p226' },
  { name: '狙擊手', primary: 'cheytac_m200', secondary: 'deagle' },
  { name: '突破手', primary: 'p90', secondary: 'p226' },
  { name: '近戰專家', primary: 'remington870', secondary: 'deagle' },
  { name: '火力支援', primary: 'm249', secondary: 'p226' },
];

const MODES = {
  general: { name: '一般模式', desc: '配裝主武器 + 副武器 + 刀 + 三種投擲物', slots: ['primary', 'secondary', 'knife', 'he', 'flash', 'smoke'] },
  rifle: { name: '步槍戰', desc: '只能使用步槍 / 衝鋒槍 / 機槍與刀', slots: ['primary', 'knife'], primaryFilter: ['rifle', 'smg', 'lmg'], fallback: 'm4a1' },
  sniper: { name: '狙擊戰', desc: '全員狙擊槍（配裝的主武器若不是狙擊槍則用 CheyTac）+ 刀', slots: ['primary', 'knife'], primaryFilter: ['sniper'], fallback: 'cheytac_m200' },
  pistol: { name: '小槍戰', desc: '全員只能拿配裝的副武器（手槍）', slots: ['secondary'] },
  knife: { name: '小刀戰', desc: '全員只能拿刀，貼身肉搏', slots: ['knife'] },
};
const BOT_POOLS = {
  general: ['m4a1', 'ak47', 'g36c', 'scarl', 'famas', 'aug', 'mp5', 'p90', 'ump45', 'vector', 'mp7', 'remington870', 'benelli_m4', 'saiga12', 'm249', 'rpk', 'negev', 'pkm', 'cheytac_m200', 'awp', 'svd', 'kar98k'],
  rifle: ['m4a1', 'ak47', 'g36c', 'scarl', 'famas', 'aug', 'mp5', 'p90', 'ump45', 'vector', 'mp7', 'm249', 'rpk', 'negev', 'pkm', 'mg42'],
  sniper: ['cheytac_m200', 'awp', 'barrett', 'kar98k', 'svd'], pistol: ['p226', 'deagle', 'glock18', 'usp', 'm1911'], knife: ['knife'],
};

// Match rules (state-machine classes live in the match module).
const RULES = {
  tdm: { name: '團隊死鬥', desc: '陣亡 3 秒復活 · 先達到目標分數獲勝（爆頭 50 · 擊殺 30）', unit: '分', targets: [500, 1000, 1500, 2500], times: [10, 15, 20], timeUnit: 'min', def: { target: 1000, time: 15 } },
  rounds: { name: '回合殲滅', desc: '陣亡本回合不復活 · 先贏得指定回合數', unit: '勝', targets: [3, 5, 7, 10], times: [90, 150, 240], timeUnit: 'sec', def: { target: 10, time: 150 } },
  relic: { name: '奪取戰', desc: '藍隊進攻奪取山丘聖物並運回撤離點 · 紅隊防守 · 回合制', unit: '勝', targets: [3, 5, 7], times: [120, 180, 240], timeUnit: 'sec', def: { target: 5, time: 180 } },
  dom: { name: '佔領戰', desc: '按住 E 6 秒佔領 A/B/C · 佔點隨時間得分 · 全佔封鎖對手得分', unit: '分', targets: [150, 250, 400], times: [10, 15, 20], timeUnit: 'min', def: { target: 250, time: 15 } },
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
  '對戰中按 F1–F5 預約配裝，下次重生時才會換上。',
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
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function calcDamage(def, part, dist, mult = 1) {
  if (part === 'head' && def.headKill) return 999;
  const m = part === 'head' ? (def.headMult || 4) : PART_MULT[part] ?? 1;
  return def.damage * m * Math.pow(def.falloff ?? 1, dist / 10) * mult;
}

const Settings = {
  data: {
    sens: 2.0, zoomSens: 1.0, volume: 0.8, fov: 75, quality: 'high', hdri: true, dof: true, adsMode: 'toggle', announcer: true, showFps: true, hipMode: 'precise', killcam: true,
    hudStyle: 'minimal', // v19: 'minimal' (SF2) | 'panel' (v5)
    look: {}, // v17: per-map player grade (Resolve units), see LOOK_DEFAULT
    loadouts: DEFAULT_LOADOUTS.map((l) => Object.assign({}, l)),
    lobby: { map: 5, mode: 'general', rule: 'dom', difficulty: 1, allies: 6, enemies: 6, loadout: 0,
      ruleCfg: Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, Object.assign({}, r.def)])) },
  },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('sf2proto.v3') || 'null') || JSON.parse(localStorage.getItem('sf2proto.v2') || 'null');
      if (s) {
        const lobby = Object.assign({}, this.data.lobby, s.lobby || {});
        lobby.ruleCfg = Object.assign({}, this.data.lobby.ruleCfg, (s.lobby && s.lobby.ruleCfg) || {});
        if (!RULES[lobby.rule]) lobby.rule = 'tdm';
        for (const [k, r] of Object.entries(RULES)) { const c = lobby.ruleCfg[k]; if (!c || !r.targets.includes(c.target) || !r.times.includes(c.time)) lobby.ruleCfg[k] = Object.assign({}, r.def); }
        const loadouts = Array.isArray(s.loadouts) && s.loadouts.length === 5 ? s.loadouts : this.data.loadouts;
        Object.assign(this.data, s); this.data.lobby = lobby; this.data.loadouts = loadouts;
        for (const l of this.data.loadouts) { if (!WEAPON_DATABASE[l.primary] || WEAPON_DATABASE[l.primary].slot !== 'primary') l.primary = 'm4a1'; if (!WEAPON_DATABASE[l.secondary] || WEAPON_DATABASE[l.secondary].slot !== 'secondary') l.secondary = 'p226'; }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() { try { localStorage.setItem('sf2proto.v3', JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
};
Settings.load();

// Resolve a loadout into this mode's weapon list.
function loadoutDefs(mode, loadout) {
  const M = MODES[mode];
  return M.slots.map((s) => {
    if (s === 'primary') { let id = loadout.primary; if (M.primaryFilter && !M.primaryFilter.includes(WEAPON_DEFS[id].kind)) id = M.fallback; return WEAPON_DEFS[id]; }
    if (s === 'secondary') return WEAPON_DEFS[loadout.secondary];
    return WEAPON_DEFS[s];
  });
}


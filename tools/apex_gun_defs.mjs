// v66w the Apex guns as weapons of their own (user 11-05 全 A): docs/research/apex/weapons-full.json (S30.1 + the S14 scripts)
// -> the <apex-guns> block of src/01_core.js (WEAPON_DATABASE apex_<gun>, SF2_WEIGHT by class). Models: tools/blender/apex_gun_build.py.
//   node tools/apex_gun_defs.mjs
import fs from 'node:fs';
const D = JSON.parse(fs.readFileSync('docs/research/apex/weapons-full.json', 'utf8')).weapons;
// data name prefix -> [gun id (model apex_<id>), APEX_WEAPONS key, 中文名, sound donor (an existing gun), fire: auto | semi | pump | bolt | burst-semi | burst-auto]
const G = [
  ['HAVOC', 'havoc', 'havoc', '哈沃克步槍', 'scarl', 'auto'], ['Hemlok', 'hemlok', 'hemlok', '赫姆洛克連發突擊步槍', 'm16a3', 'burst-semi'],
  ['Nemesis', 'nemesis', 'nemesis', '復仇女神連發突擊步槍', 'famas', 'burst-auto'], ['R-301', 'r301', 'r301', 'R-301 卡賓槍', 'm4a1', 'auto'],
  ['VK-47', 'flatline', 'flatline', 'VK-47 平行步槍', 'ak47', 'auto'], ['Alternator', 'alternator', 'alternator', '轉換者衝鋒槍', 'ump45', 'auto'],
  ['C.A.R.', 'car', 'car', 'C.A.R. 衝鋒槍', 'vector', 'auto'], ['Prowler', 'prowler', 'prowler', '獵兵連發衝鋒槍', 'p90', 'burst-semi'],
  ['R-99', 'r99', 'r99', 'R-99 衝鋒槍', 'mp5k', 'auto'], ['Volt', 'volt', 'volt', '電能衝鋒槍', 'mp7', 'auto'],
  ['Devotion', 'devotion', 'devotion', '專注輕機槍', 'm249', 'auto'], ['L-STAR', 'lstar', 'lstar', 'L-STAR 能量機槍', 'negev', 'auto'],
  ['M600', 'spitfire', 'spitfire', 'M600 噴火輕機槍', 'mg4', 'auto'], ['Rampage', 'rampage', 'rampage', '暴走輕機槍', 'pkm', 'auto'],
  ['30-30', 'repeater', 'r3030', '30-30 連發步槍', 'kar98k', 'semi'], ['Bocek', 'bocek', 'bocek', '波塞克複合弓', 'usp', 'semi'],
  ['G7', 'g7', 'g7', 'G7 偵查槍', 'svd', 'semi'], ['Triple Take', 'tripletake', 'tripletake', '三重式狙擊槍', 'sr25', 'semi'],
  ['Charge Rifle', 'chargerifle', 'chargerifle', '充能步槍', 'psg1', 'semi'], ['Kraber', 'kraber', 'kraber', '克雷貝爾 .50 狙擊槍', 'barrett', 'bolt'],
  ['Longbow', 'longbow', 'longbow', '長弓精確步槍', 'm40a1', 'semi'], ['Sentinel', 'sentinel', 'sentinel', '哨兵狙擊槍', 'awp', 'bolt'],
  ['EVA-8', 'eva8', 'eva8', 'EVA-8 自動霰彈槍', 'saiga12', 'auto'], ['Mastiff', 'mastiff', 'mastiff', '敖犬霰彈槍', 'benelli_m4', 'semi'],
  ['Mozambique', 'mozambique', 'mozambique', '莫三比克霰彈槍', 'm1014', 'semi'], ['Peacekeeper', 'peacekeeper', 'peacekeeper', '和平捍衛者霰彈槍', 'remington870', 'pump'],
  ['P2020', 'p2020', 'p2020', 'P2020 手槍', 'p226', 'semi'], ['RE-45', 're45', 're45', 'RE-45 自動手槍', 'glock18', 'auto'],
  ['Wingman', 'wingman', 'wingman', '小幫手手槍', 'deagle', 'semi'],
];
const CAT = { '突击步枪': 'assault', '冲锋枪': 'smg', '轻机枪': 'lmg', '精确射手武器': 'sniper', '狙击步枪': 'sniper', '霰弹枪': 'shotgun', '手枪': 'pistol' };
// SF2's load by class (the walking pace, src/12_player.js sf2Speed): Apex has no weights — a class's typical SF2 gun
const WEIGHT = { assault: [4.1, 2.05], smg: [2.2, 1.1], lmg: [7.2, 3.6], marksman: [4.5, 2.25], sniper: [7.6, 3.8], shotgun: [3.0, 1.5], pistol: [1.0, 0] };
// the sniper rifles get the game's scope (two zoom levels, like Apex's 4–8×; Kraber's own is built in) — the marksman guns keep iron sights
const SCOPED = new Set(); // (v67b the scopes are optics now — tools/out/apex/guns/build.json lists what each gun takes; the sniper rifles start on the 4–8×)
const BUILD = JSON.parse(fs.readFileSync('tools/out/apex/guns/build.json', 'utf8'));
const MAGS = fs.existsSync('tools/out/apex/guns/mags.json') ? JSON.parse(fs.readFileSync('tools/out/apex/guns/mags.json', 'utf8')) : {}; // v67d tools/apex_mags.py
const DEFOPT = { kraber: 'talon', sentinel: 'talon', longbow: 'talon', chargerifle: 'talon' };
const r = (v, n = 4) => +(+v).toFixed(n);
// v66x the Apex guns' own sounds (assets/sfx_apex.js, tools/apex_sfx.py): a gun with its own fire bank plays its banks (sf2 = apex_<gun>)
const APEXSND = fs.existsSync('assets/sfx_apex.js') ? new Set([...fs.readFileSync('assets/sfx_apex.js', 'utf8').matchAll(/"sf2_apex_([a-z0-9]+)_fire"/g)].map((m) => m[1])) : new Set();
const out = [], weights = [];
for (const [pre, id, key, zh, donor, fire] of G) {
  const w = D.find((x) => x.name.startsWith(pre)); if (!w) throw new Error('no data ' + pre);
  const c = w.current, s = w.s14 || {}, f = s.fire || {}, type = CAT[w.category], marks = w.category === '精确射手武器';
  const pistolSlot = type === 'pistol' || id === 'mozambique';
  const pat = s.recoil && s.recoil.pattern;
  const rpm = { r3030: 63.5, kraber: 24.7, sentinel: 31.2, peacekeeper: 44.4 }[key] || c.rpm; // (the rechamber in: APEX_WEAPONS' rate)
  const mag = c.mag || (id === 'lstar' ? 24 : id === 'bocek' ? 1 : 10); // (L-STAR: the overheat ≈ 24 shots; Bocek: one arrow nocked)
  const e = {
    name: zh, type, slot: pistolSlot ? 'secondary' : 'primary', damageNear: c.body, damageFar: c.body, pellets: c.pellets || 1,
    headMult: r(c.head / c.body, 3), fireRate: r(60 / rpm), auto: fire === 'auto' || fire === 'burst-auto',
    ...(fire === 'pump' ? { pump: true } : type === 'shotgun' ? { pump: false } : {}), ...(type === 'sniper' ? { bolt: fire === 'bolt' } : {}),
    recoilPitch: pat ? 0.011 : { sniper: 0.05, shotgun: 0.04, pistol: 0.03 }[type] || 0.02, recoilYaw: pat ? 0.008 : 0.006, recoilRecovery: 8, // (no pattern: the kick of its class)
    hipSpread: type === 'shotgun' ? 0.06 : r((c.spread_stand_hip || 3) * Math.PI / 180 * 0.5), adsSpread: 0.0015,
    adsFov: SCOPED.has(id) ? 20 : c.zoom_fov || 55, adsType: SCOPED.has(id) ? '2d_scope_overlay' : '3d_sight', mobility: 0.95, maxAmmo: mag,
    reloadTime: id === 'bocek' ? 0.55 : c.reload_tactical_s, equipTime: c.deploy_s, adsSpeed: r(1 / Math.max(0.12, c.ads_s || 0.27) * 3.3, 1),
    reserveMult: id === 'bocek' ? 24 : undefined, apexZooms: [c.zoom_fov || 55], // (v67c Apex's zoom_fov: horizontal ° at Apex's FOV 70 — src/11_weaponsystem.js scales it to the player's FOV)
    model: 'apex_' + id, apexKey: key, apexDonor: donor, apexSnd: APEXSND.has(id) ? 'apex_' + id : undefined, tracerEvery: 2, penetration: 1,
    desc: `Apex Legends 原版 ${w.name}：傷害、射速、彈匣、換彈、拔槍照 Apex（S30.1）${pat ? '，後座照它的彈道表' : ''}。`,
  };
  if (fire.startsWith('burst')) Object.assign(e, { burst: f.burst_count || { nemesis: 4 }[id], burstDelay: f.burst_delay_s || 0.3 });
  if (f.rate_max_hz) Object.assign(e, { rampHz: f.rate_max_hz, rampTime: f.rate_speedup_s });
  // v66y the rest of Apex's firing mechanics: windup = hold this long before the first round (HAVOC's barrel spin-up 0.42 s, the Charge
  // Rifle's charge); bowDraw = Bocek: fires on release, damage × draw / full draw (≥ 40 %); heatCool = L-STAR: no reload, the "mag"
  // is heat — it cools back to full in this many seconds 0.4 s after the last shot, an empty one overheats (the reload time, 3.26 s);
  // hLine = Triple Take's three rounds side by side, this far apart (rad)
  const MECH = { havoc: { windup: 0.42 }, chargerifle: { windup: 0.5 }, bocek: { bowDraw: c.charge_s || 0.54 }, lstar: { heatCool: 2.4, reserveMult: 60 }, tripletake: { hLine: 0.012 } }[id];
  if (MECH) Object.assign(e, MECH);
  // v66z the hip pose where the default one misfits (tools/out/_apexvm.mjs sheets): Bocek's 1.3 m bow filled the right half, Kraber's stock rose into view
  const HIP = { bocek: [0.24, -0.21, -0.6], kraber: [0.15, -0.19, -0.52], lstar: [0.15, -0.18, -0.42] }[id];
  if (HIP) e.apexHip = HIP;
  if (pat) e.apexPattern = { loop: pat.loop_offset || 0, b: pat.bullets.map((b) => [r(b[0], 3), r(b[1], 3)]) };
  const OPT_ORDER = ['hcog_og', 'holo', 'cro', 'holo_mag', 'hcog', 'acgs', 'aog', 'dcom', 'talon'];
  const opts = Object.keys((BUILD[id] || {}).optics || {}).sort((a, b) => OPT_ORDER.indexOf(a) - OPT_ORDER.indexOf(b));
  if (opts.length) { e.apexOptics = opts; if (DEFOPT[id]) e.defaultOptic = DEFOPT[id]; }
  if (MAGS[id] && MAGS[id].base === mag) e.apexMags = { kind: MAGS[id].kind, l: MAGS[id].l }; // v67d its extended mags (Apex's bullets / highcal / energy / sniper _mag_l1–3)
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  out.push(`  apex_${id}: ${JSON.stringify(e)},`);
  weights.push(`apex_${id}: ${JSON.stringify(WEIGHT[marks ? 'marksman' : type === 'sniper' && id !== 'kraber' && id !== 'sentinel' ? 'marksman' : type])}`);
}
const block = `// <apex-guns> v66w the Apex guns (tools/apex_gun_defs.mjs from docs/research/apex/weapons-full.json; models tools/blender/apex_gun_build.py).
// Damage per hit as Apex (no falloff; head = head / body), rate with the rechamber, mag, tactical reload, deploy, iron-sight FOV, recoil
// from each gun's own pattern (apexPattern: per shot [yaw, pitch] degrees, then looping from loop). Sounds: its own (apexSnd, assets/sfx_apex.js) or, with none named in Apex's banks, borrowed from apexDonor.
Object.assign(WEAPON_DATABASE, {
${out.join('\n')}
});
for (const s of Object.values(WEAPON_DATABASE)) if (s.apexDonor) { const d = WEAPON_DATABASE[s.apexDonor]; if (d) { s.sound = d.sound || s.apexDonor; s.sf2 = s.apexSnd || d.sf2 || null; } }
Object.assign(SF2_WEIGHT, { ${weights.join(', ')} });
// </apex-guns>`;
const P = 'src/01_core.js'; let src = fs.readFileSync(P, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n', b = block.replace(/\n/g, nl);
if (src.includes('// <apex-guns>')) src = src.replace(/\/\/ <apex-guns>[\s\S]*?\/\/ <\/apex-guns>/, () => b);
else { const a = 'for (const [id, s] of Object.entries(WEAPON_DATABASE)) { WEAPON_DEFS[id] = compileWeapon(id, s);'; if (!src.includes(a)) throw new Error('anchor'); src = src.replace(a, b + nl + a); }
fs.writeFileSync(P, src);
console.log('apex guns', out.length);

// v64e Special Force 2's own effect sounds (user 10-28) from the user's install via UModel (`-export -sounds` of Sound_Grenades,
// Sound_Explosions, Sound_common, Sound_Impacts, SoundUX → tools/out/sf2/fx_sounds/<pkg>/SoundNodeWave/*.ogg) → assets/sfx_sf2_fx.js
// (window.SF2_SFX_FX, merged into the sound pack like sfx_sf2.js). Which wave SF2 plays for what (its SoundCues / script names):
//   sf2_he      M67_Explo_01 / 02     (Cue_M67_Explo, frag)          sf2_flash   M84_Explo_01 / 02  (Cue_M84_Explo, flashbang)
//   sf2_smoke   M18_Explo_01          (Cue_M18_Explo, smoke)         nade_pin / nade_throw / nade_equip  Grenade_Pin / _Throw / _Equip
//   sf2_hit     bullet_hit_2d_03      (HitNormal_cue: your bullet hit someone, volume 1.5–2)
//   sf2_hitdead Bullet_flesh_01–05    (HitDead_cue: the killing hit, pitch 0.8)   sf2_kill  kill3_New  (cue_kill3_new)
//   sf2_switch  hud_switch05          (the HUD's weapon switch, named in SFGame)
//   kfb_default / _normal / _special / _rare / _continuous  hud_kill_*  (SFKillMessage.GetKillFeedBackSound: the kill's own sound, by
//               the tier of its kill message — plain kill / 瞬間秒殺 遠射 / 爆頭 背後 復仇 刀 雷 / 最後一擊 首殺 / 連殺)
//   node tools/sfx_sf2_fx.mjs
import fs from 'node:fs';
const D = 'tools/out/sf2/fx_sounds', W = (pkg, n) => fs.readFileSync(`${D}/${pkg}/SoundNodeWave/${n}.ogg`).toString('base64');
const MAP = {
  sf2_he: ['Sound_Explosions', 'M67_Explo_01', 'M67_Explo_02'], sf2_flash: ['Sound_Explosions', 'M84_Explo_01', 'M84_Explo_02'], sf2_smoke: ['Sound_Explosions', 'M18_Explo_01'],
  nade_pin: ['Sound_Grenades', 'Grenade_Pin'], nade_throw: ['Sound_Grenades', 'Grenade_Throw'], nade_equip: ['Sound_Grenades', 'Grenade_Equip'],
  sf2_hit: ['Sound_common', 'bullet_hit_2d_03'], sf2_hitdead: ['Sound_Impacts', 'Bullet_flesh_01', 'Bullet_flesh_02', 'Bullet_flesh_03', 'Bullet_flesh_04', 'Bullet_flesh_05'],
  sf2_kill: ['Sound_common', 'kill3_New'], sf2_switch: ['SoundUX', 'hud_switch05'],
  kfb_default: ['SoundUX', 'hud_kill_default'], kfb_normal: ['SoundUX', 'hud_kill_normal'], kfb_special: ['SoundUX', 'hud_kill_special'],
  kfb_rare: ['SoundUX', 'hud_kill_rare'], kfb_continuous: ['SoundUX', 'hud_kill_continuous'],
};
const out = Object.fromEntries(Object.entries(MAP).map(([k, [pkg, ...ns]]) => [k, ns.map((n) => W(pkg, n))]));
const js = `/* Special Force 2 original effect sounds from the user's own install — tools/sfx_sf2_fx.mjs */\nwindow.SF2_SFX_FX = ${JSON.stringify(out)};\n`;
fs.writeFileSync('assets/sfx_sf2_fx.js', js);
console.log('assets/sfx_sf2_fx.js', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), (js.length / 1024).toFixed(0) + ' KB');

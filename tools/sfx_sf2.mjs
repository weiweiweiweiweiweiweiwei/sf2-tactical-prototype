// v61 Special Force 2's own gun sounds (user 2026-10-27), from the user's install via UModel (`-export -sounds Sound_<GUN>`,
// tools/out/sf2/<id>/Sound_<GUN>/SoundNodeWave/*.ogg) -> assets/sfx_sf2.js (window.SF2_SFX_ORIG, merged into the sound pack).
// Banks per gun id: sf2_<id>_fire (WeaponFire1..n), sf2_<id>_far (the _T takes), sf2_<id>_magout / _magin / _charge (reload
// clip out / in / slide), sf2_<id>_draw (equip). The game asks for them by the weapon's `sf2` id (src/02_audio.js).
//   node tools/sfx_sf2.mjs m4a1 ak103 g36c
import fs from 'node:fs'; import path from 'node:path';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['m4a1'], out = {};
const role = (f) => /WeaponFire\d*_T(_\d+)?\./i.test(f) ? 'far' : /WeaponFire\d*(_\d+)?\./i.test(f) ? 'fire' : // (M4A1 / AK-103: WeaponFire1.._T; G36C: WeaponFire, _01, _T, _T_01)
   /ReloadClipOut/i.test(f) ? 'magout' : /ReloadClipIn/i.test(f) ? 'magin' : /ReloadSlide/i.test(f) ? 'charge' : /WeaponEquip/i.test(f) ? 'draw' : null;
for (const id of ids) {
  const root = `tools/out/sf2/${id}`, dir = fs.readdirSync(root).filter((d) => /^Sound_/i.test(d)).map((d) => path.join(root, d, 'SoundNodeWave')).find((d) => fs.existsSync(d));
  if (!dir) { console.warn('no sounds for', id); continue; }
  const prefix = new RegExp('^' + id + '_', 'i');
  for (const f of fs.readdirSync(dir).filter((f) => prefix.test(f) && f.endsWith('.ogg'))) { // (the un-prefixed copies are the same clips)
    const r = role(f); if (!r) continue;
    (out[`sf2_${id}_${r}`] ||= []).push(fs.readFileSync(path.join(dir, f)).toString('base64'));
  }
}
const js = `/* Special Force 2 original gun sounds from the user's own install — tools/sfx_sf2.mjs */\nwindow.SF2_SFX_ORIG = ${JSON.stringify(out)};\n`;
fs.writeFileSync('assets/sfx_sf2.js', js);
console.log('assets/sfx_sf2.js', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), (js.length / 1024).toFixed(0) + ' KB');

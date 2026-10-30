// v61 Special Force 2's own gun sounds (user 2026-10-27), from the user's install via UModel (`-export -sounds Sound_<GUN>`,
// tools/out/sf2/<id>/Sound_<GUN>/SoundNodeWave/*.ogg) -> assets/sfx_sf2.js (window.SF2_SFX_ORIG, merged into the sound pack).
// Banks per gun id: sf2_<id>_fire (WeaponFire1..n), sf2_<id>_far (the _T takes), sf2_<id>_magout / _magin / _charge (reload
// clip out / in / slide), sf2_<id>_draw (equip). The game asks for them by the weapon's `sf2` id (src/02_audio.js).
// v64 a variant `<id>=<gun>[+silence]` (g36c_eo=g36c+silence) borrows <gun>'s banks by reference (no second copy): with +silence its
// fire / far are SF2's own suppressed rifle shot (Sound_Silence AR_Silence / _T → tools/out/sf2/silence/), its reload and draw the gun's.
// A bolt gun's Fire_Slide is its sf2_<id>_boltback.
//   node tools/sfx_sf2.mjs m4a1 ak103 g36c … g36c_eo=g36c+silence
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2).length ? process.argv.slice(2) : ['m4a1'], out = {}, alias = [];
const ids = args.filter((a) => !a.includes('=')).map((a) => a.split('@')); // v64y <id>@<file prefix> when the waves are named otherwise (svd@DragunovSVD)
for (const a of args.filter((a) => a.includes('='))) {
  const [id, spec] = a.split('='), [gun, silence] = spec.split('+');
  for (const r of ['magout', 'magin', 'charge', 'draw', 'boltback']) alias.push([`sf2_${id}_${r}`, `sf2_${gun}_${r}`]);
  if (silence) {
    const d = 'tools/out/sf2/silence/Sound_Silence/SoundNodeWave';
    out[`sf2_silence_ar_fire`] ??= [fs.readFileSync(`${d}/AR_Silence.ogg`).toString('base64')];
    out[`sf2_silence_ar_far`] ??= [fs.readFileSync(`${d}/AR_Silence_T.ogg`).toString('base64')];
    alias.push([`sf2_${id}_fire`, 'sf2_silence_ar_fire'], [`sf2_${id}_far`, 'sf2_silence_ar_far']);
  } else alias.push([`sf2_${id}_fire`, `sf2_${gun}_fire`], [`sf2_${id}_far`, `sf2_${gun}_far`]);
}
const role = (f) => /WeaponFire\d*_T(_\d+)?\./i.test(f) ? 'far' : /WeaponFire\d*(_\d+)?\./i.test(f) ? 'fire' : // (M4A1 / AK-103: WeaponFire1.._T; G36C: WeaponFire, _01, _T, _T_01)
   /WeaponFire_Slide/i.test(f) ? 'boltback' : /Rel(oa|ao)dClipOut/i.test(f) ? 'magout' : /Rel(oa|ao)dClipIn/i.test(f) ? 'magin' : /Rel(oa|ao)dSlide/i.test(f) ? 'charge' : /(Weapon)?Equip(_T)?\./i.test(f) ? 'draw' : null; // (v65e SF2's own typos: AUGA3_WeaponRelaod…, AUGA3Equip)
for (const [id, pre] of ids) {
  const root = `tools/out/sf2/${id}`, dir = fs.readdirSync(root).filter((d) => /^Sound_/i.test(d)).map((d) => path.join(root, d, 'SoundNodeWave')).find((d) => fs.existsSync(d));
  if (!dir) { console.warn('no sounds for', id); continue; }
  const prefix = new RegExp('^_?' + (pre || id) + '_?(Weapon|Equip)', 'i');
  for (const f of fs.readdirSync(dir).filter((f) => prefix.test(f) && f.endsWith('.ogg'))) { // (the un-prefixed copies are the same clips)
    const r = role(f); if (!r) continue;
    (out[`sf2_${id}_${r}`] ||= []).push(fs.readFileSync(path.join(dir, f)).toString('base64'));
  }
}
let js = `/* Special Force 2 original gun sounds from the user's own install — tools/sfx_sf2.mjs */\nwindow.SF2_SFX_ORIG = ${JSON.stringify(out)};\n`;
const S = 'window.SF2_SFX_ORIG';
for (const [k, from] of alias) if (out[from]) js += `${S}['${k}'] = ${S}['${from}'];\n`;
fs.writeFileSync('assets/sfx_sf2.js', js);
console.log('assets/sfx_sf2.js', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), (js.length / 1024).toFixed(0) + ' KB');

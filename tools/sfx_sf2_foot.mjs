// v66o SF2's own footsteps (user 11-01: 照原版): Sound_FootSteps — per surface a walk / run step (FootStepSound, Cue_Run_*: footstep_<s>_NN),
// a sprint step (FootStepSoundDash, Cue_Dash_*: Footstep_<s>_dash_NN) and a landing (Cue_Land_*: Footstep_Land_<s>_NN); the sprint
// breathing SFPawnFX_Human.Breath (Sound_Temp Breath_Left / _Right — the male soldier's Breath_man_NN) -> assets/sfx_sf2_foot.js
// (window.SF2_SFX_FOOT, merged into the sound pack: sf2step_<surface>, sf2step_<surface>_dash, sf2land_<surface>, sf2_breath)
//   UModel -export -sounds Sound_FootSteps, Sound_Temp -> tools/out/sf2/foot/ ; node tools/sfx_sf2_foot.mjs
import fs from 'node:fs'; import path from 'node:path';
const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, f.name); if (f.isDirectory()) walk(q); else if (f.name.endsWith('.ogg')) files.push(q); } })('tools/out/sf2/foot');
// the game's surfaces -> SF2's (carpet: fabric; the SF2 maps' own kinds kept as SF2 names)
const SURF = { concrete: 'con', metal: 'metal', wood: 'wood', sand: 'sand', snow: 'snow', carpet: 'fabric', grass: 'grass', tile: 'tile', soil: 'soil', mud: 'mud', water: 'water', glass: 'glass', metalgrate: 'metalgrate', woodpanel: 'woodpanel' };
const out = {}, b64 = (f) => fs.readFileSync(f).toString('base64'), add = (k, f) => (out[k] ||= []).push(b64(f));
for (const [ours, s] of Object.entries(SURF)) {
  for (const f of files) {
    const n = path.basename(f, '.ogg').toLowerCase();
    if (new RegExp(`^footstep_${s}_[0-9]+$`).test(n)) add(`sf2step_${ours}`, f);
    else if (new RegExp(`^footstep_${s}_dash_[0-9]+$`).test(n)) add(`sf2step_${ours}_dash`, f);
    else if (new RegExp(`^footstep_land_${s === 'con' ? 'con' : s}_[0-9]+$`).test(n)) add(`sf2land_${ours}`, f);
  }
}
for (const f of files) if (/^breath_man_\d+$/i.test(path.basename(f, '.ogg'))) add('sf2_breath', f);
const js = `/* Special Force 2 original footsteps and sprint breathing from the user's own install — tools/sfx_sf2_foot.mjs */\nwindow.SF2_SFX_FOOT = ${JSON.stringify(out)};\n`;
fs.writeFileSync('assets/sfx_sf2_foot.js', js);
console.log('assets/sfx_sf2_foot.js', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), (js.length / 1024).toFixed(0) + ' KB');

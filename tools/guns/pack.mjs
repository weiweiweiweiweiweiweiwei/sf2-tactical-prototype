// v45 Blender guns: every tools/guns/<id>.glb → assets/guns/guns.js (window.GUN_GLB[id] = base64), loaded like assets/sfx.js.
// node tools/guns/pack.mjs
import fs from 'node:fs'; import path from 'node:path';
// v62h m4a1_sf2.glb (the static v61 M4A1) stays out: the animated m4a1_sf2_rig.glb replaced it and both need the same loader
const SKIP = new Set(['m4a1_sf2.glb']); // (v62z (loop) the M16A3 / QBZ-97 rigs are in: their sight lines are set)
// v63e apex_* (EA's models, local only) stay out; v63f *_3rd.glb (third-person SF2 models) are in (09_models GUN_3RD)
const dir = 'tools/guns', out = 'assets/guns/guns.js', files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb') && !SKIP.has(f) && !f.startsWith('apex_'));
let js = '/* Blender gun models — built by tools/blender/<gun>_build.py. <id>.glb: original work, CC0; <id>_sf2.glb: Special Force 2 originals from the user install (tools/blender/sf2_gun_build.py). */\nwindow.GUN_GLB = window.GUN_GLB || {};\n';
for (const f of files) js += `window.GUN_GLB['${path.basename(f, '.glb')}'] = '${fs.readFileSync(path.join(dir, f)).toString('base64')}';\n`;
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, js);
console.log(out, files, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');

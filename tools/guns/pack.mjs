// v45 Blender guns: every tools/guns/<id>.glb → assets/guns/guns.js (window.GUN_GLB[id] = base64), loaded like assets/sfx.js.
// node tools/guns/pack.mjs
import fs from 'node:fs'; import path from 'node:path';
const dir = 'tools/guns', out = 'assets/guns/guns.js', files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb'));
let js = '/* Blender gun models — built by tools/blender/<gun>_build.py. <id>.glb: original work, CC0; <id>_sf2.glb: Special Force 2 originals from the user install (tools/blender/sf2_gun_build.py). */\nwindow.GUN_GLB = window.GUN_GLB || {};\n';
for (const f of files) js += `window.GUN_GLB['${path.basename(f, '.glb')}'] = '${fs.readFileSync(path.join(dir, f)).toString('base64')}';\n`;
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, js);
console.log(out, files, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');

// v46 Sky City: wrap the Blender GLB as a script (window.SKY_GLB = base64) so file:// play can load it.   node tools/sky/pack.mjs
import fs from 'node:fs'; import path from 'node:path';
const src = process.argv[2] || 'tools/sky/sky.glb', out = 'assets/maps/skycity.js', buf = fs.readFileSync(src);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `/* Sky City visuals — built by tools/blender/sky_build.py (src/07s_skycity.js layout). Original work, CC0. */\nwindow.SKY_GLB = '${buf.toString('base64')}';\n`);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB');

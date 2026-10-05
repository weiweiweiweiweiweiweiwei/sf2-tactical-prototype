// v44 Sakura Inn: wrap the Blender GLB as a script (window.RYOKAN_GLB = base64) so file:// play can load it like assets/sfx.js.
// node tools/ryokan/pack_glb.mjs [tools/ryokan/ryokan.glb] → assets/maps/ryokan.js
import fs from 'node:fs'; import path from 'node:path';
const src = process.argv[2] || 'tools/ryokan/ryokan.glb', out = 'assets/maps/ryokan.js', buf = fs.readFileSync(src);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `/* Sakura Inn visuals — built by tools/blender/ryokan_build.py from the game's own plan (src/07r_ryokan.js). Original work, CC0. */\nwindow.RYOKAN_GLB = '${buf.toString('base64')}';\n`);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB', '(glb ' + (buf.length / 1048576).toFixed(2) + ' MB)');

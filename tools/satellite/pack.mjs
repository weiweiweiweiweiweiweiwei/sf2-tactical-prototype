// v52 Satellite Base: wrap the Blender GLB as a script (window.SAT_GLB = base64) so file:// play can load it like assets/sfx.js.
// node tools/satellite/pack.mjs [tools/satellite/satellite.glb] → assets/maps/satellite.js
import fs from 'node:fs';
const src = process.argv[2] || 'tools/satellite/satellite.glb', out = 'assets/maps/satellite.js', buf = fs.readFileSync(src);
fs.writeFileSync(out, `/* Satellite Base dressing — built by tools/blender/sat_build.py from the game's own grid (satellitePlan() in src/07_maps.js). Original work, CC0. */\nwindow.SAT_GLB = '${buf.toString('base64')}';\n`);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');

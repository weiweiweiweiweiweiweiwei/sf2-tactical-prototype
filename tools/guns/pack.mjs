// v45 Blender guns: every tools/guns/<id>.glb → assets/guns/guns.js (window.GUN_GLB[id] = base64), loaded like assets/sfx.js.
// node tools/guns/pack.mjs
import fs from 'node:fs'; import path from 'node:path';
// v62h m4a1_sf2.glb (the static v61 M4A1) stays out: the animated m4a1_sf2_rig.glb replaced it and both need the same loader
const SKIP = new Set(['m4a1_sf2.glb']); // (v62z (loop) the M16A3 / QBZ-97 rigs are in: their sight lines are set)
// v63e apex_* (EA's models, local only) stay out; v64d *_3rd.glb out again (soldiers hold the merged procedural gun: cheaper)
const dir = 'tools/guns', out = 'assets/guns/guns.js' /* (v65j removed: per-gun files) */, files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb') && !SKIP.has(f) && !f.startsWith('apex_') && !f.endsWith('_3rd.glb'));
// v65j one file per gun (assets/guns/g/<id>.js) + assets/guns/index.js (window.GUN_INDEX): the game loads only the guns it shows
// (src/09_models.js ensureGunModels) instead of one 60 MB guns.js parsed at start
const gdir = 'assets/guns/g'; fs.mkdirSync(gdir, { recursive: true });
for (const f of fs.readdirSync(gdir)) if (f.endsWith('.js') && !files.includes(path.basename(f, '.js') + '.glb')) fs.unlinkSync(path.join(gdir, f)); // (a gun no longer packed)
let total = 0;
for (const f of files) {
  const id = path.basename(f, '.glb'), js = `(window.GUN_GLB || (window.GUN_GLB = {}))['${id}'] = '${fs.readFileSync(path.join(dir, f)).toString('base64')}';
`;
  fs.writeFileSync(path.join(gdir, id + '.js'), js); total += js.length;
}
const ids = files.map((f) => path.basename(f, '.glb'));
fs.writeFileSync('assets/guns/index.js', `/* gun models, one file each in assets/guns/g/ — tools/guns/pack.mjs. <id>.glb: original work, CC0; <id>_sf2*.glb: Special Force 2 originals from the user install */
window.GUN_INDEX = ${JSON.stringify(ids)};
`);
if (fs.existsSync(out)) fs.unlinkSync(out); // (the old all-in-one file)
console.log('assets/guns/g/', ids.length, 'guns', (total / 1048576).toFixed(1) + ' MB');

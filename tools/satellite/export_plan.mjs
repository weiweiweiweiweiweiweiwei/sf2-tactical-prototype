// v52 Satellite Base: run the game's own satellitePlan() (src/07_maps.js) in a sandbox and write the grid for Blender.
// node tools/satellite/export_plan.mjs → tools/satellite/plan.json
import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('src/07_maps.js', 'utf8'), m = /function satellitePlan\(\) \{[\s\S]*?\r?\n\}\r?\n/.exec(src);
if (!m) throw new Error('satellitePlan() not found');
const ctx = { Math, Uint8Array }; vm.createContext(ctx); vm.runInContext(m[0] + '\nglobalThis.__p = satellitePlan();', ctx);
const P = ctx.__p, out = { H: P.H, B: P.B, W: P.W, D: P.D, open: Array.from(P.open) };
fs.writeFileSync('tools/satellite/plan.json', JSON.stringify(out));
console.log('plan.json', P.W, 'x', P.D, 'open cells', out.open.reduce((a, v) => a + v, 0));

// v44 Sakura Inn: run the game's own ryokanPlan() (src/07r_ryokan.js) in a sandbox and write the metric plan for Blender.
// node tools/ryokan/export_plan.mjs → tools/ryokan/plan.json
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd(), src = fs.readFileSync(path.join(ROOT, 'src/07r_ryokan.js'), 'utf8');
const ctx = { MAPS: [], THREE: {}, GLTFLoader: class {}, window: {}, document: {}, console, Math, Uint8Array, Int16Array, Float32Array };
vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.__plan = ryokanPlan(); globalThis.__spec = RYOKAN_SPEC;', ctx);
const P = ctx.__plan, out = Object.assign({}, P); delete out.U; delete out.V; delete out.P;
out.F2 = P.S.F2; out.TOP1 = P.S.TOP1; out.TOP2 = P.S.TOP2; out.EAVE = P.S.EAVE; out.BOUND = P.S.BOUND;
fs.mkdirSync(path.join(ROOT, 'tools/ryokan'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/ryokan/plan.json'), JSON.stringify(out));
console.log('plan.json', { walls: P.walls.length, rails: P.rails.length, parts2: P.parts2.length, slabs: P.slabs.length, buildings: P.buildings.length, props: P.props.length, ground: P.ground.length, outside: P.outside.length });

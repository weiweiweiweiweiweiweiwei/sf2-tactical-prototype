// v66d put an SF2 map's particle effects into its built map.js without rebuilding the GLB (the build's intermediates may be gone):
//   python tools/sf2_fx.py <Map> && node tools/sf2_fx_patch.mjs <Map>
import fs from 'node:fs'; import { sf2FxMeta } from './sf2_fx_meta.mjs';
const MAP = process.argv[2] || 'Desertcamp', f = `assets/maps/sf2-${MAP.toLowerCase()}/map.js`, src = fs.readFileSync(f, 'utf8');
const a = src.indexOf('{ meta: ') + 8, b = src.indexOf(", glb: '"); if (a < 8 || b < 0) throw new Error('unexpected map.js layout: ' + f);
const meta = JSON.parse(src.slice(a, b)); meta.fx = await sf2FxMeta(MAP);
fs.writeFileSync(f, src.slice(0, a) + JSON.stringify(meta) + src.slice(b));
console.log(f, (fs.statSync(f).size / 1048576).toFixed(1) + ' MB');

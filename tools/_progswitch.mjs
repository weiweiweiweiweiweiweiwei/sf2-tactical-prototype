import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (q) => {
  const S = SF2.Settings.data; S.quality = q; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 12, enemies: 12 }); await app.startMatch(); app.state = 'playing'; app.match.player.spawnProtect = 1e9;
  await new Promise((res) => setTimeout(res, 9000));
  const m = app.match, R = app.renderer, props = R.properties, mats = new Map();
  const scan = (scene, tag) => scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return; for (const mt of Array.isArray(o.material) ? o.material : [o.material]) { if (!mt) continue; const e = mats.get(mt) || { mt, objs: [] }; e.objs.push({ tag, skin: !!o.isSkinnedMesh, inst: !!o.isInstancedMesh, rs: !!o.receiveShadow, cs: !!o.castShadow, type: o.type }); mats.set(mt, e); } });
  scan(m.scene, 'world'); scan(m.weapons.scene, 'vm');
  const before = new Map([...mats.keys()].map((mt) => [mt, props.get(mt).currentProgram]));
  let switched = new Map(); for (let f = 0; f < 20; f++) { await new Promise((res) => requestAnimationFrame(() => res())); for (const mt of mats.keys()) { const cp = props.get(mt).currentProgram; if (cp !== before.get(mt)) { switched.set(mt, (switched.get(mt) || 0) + 1); before.set(mt, cp); } } }
  const mixed = [...mats.values()].filter((e) => { const k = (x) => `${x.skin}${x.inst}${x.rs}`; return new Set(e.objs.map(k)).size > 1; }).map((e) => ({ mat: e.mt.type + (e.mt.name ? ':' + e.mt.name : '') + (e.mt.map ? '(map)' : ''), n: e.objs.length, variants: [...new Set(e.objs.map((x) => `${x.tag}/${x.type}/skin${+x.skin}/inst${+x.inst}/rs${+x.rs}`))].slice(0, 4).join(' | '), switchesIn20: switched.get(e.mt) || 0 }));
  const topSwitch = [...switched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([mt, n]) => ({ mat: mt.type + (mt.map ? '(map)' : '') + (mt.color ? ' #' + mt.color.getHexString() : ''), switchesIn20: n, users: mats.get(mt).objs.length, kinds: [...new Set(mats.get(mt).objs.map((x) => `${x.tag}/${x.type}/skin${+x.skin}/rs${+x.rs}`))].join(' | ').slice(0, 120) }));
  return { programs: R.info.programs.length, mixed, topSwitch };
}, process.argv[2] || 'high');
console.log('programs', r.programs); console.log('materials used by objects with different shader-relevant flags:'); console.table(r.mixed); console.log('materials whose program changed between frames (20 frames):'); console.table(r.topSwitch);
await b.close(); srv.close();

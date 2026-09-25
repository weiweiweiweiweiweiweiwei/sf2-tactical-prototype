// v24 probe: count three.js getProgram() calls per frame (each one allocates a ~100-field parameter object + a cache-key
// string) and attribute them to the pass (shadow / world / viewmodel / post) and the material that triggered them.
// usage: node tools/_progprobe.mjs [quality=high] [map=0] [bots=12]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [quality = 'high', map = '0', bots = '12'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async ({ quality, map, bots }) => {
  const S = SF2.Settings.data; S.quality = quality; Object.assign(S.lobby, { map, rule: 'tdm', allies: bots, enemies: bots });
  await app.startMatch(); app.state = 'playing'; const m = app.match; m.player.spawnProtect = 1e9;
  await new Promise((res) => setTimeout(res, 7000));
  const R = app.renderer, props = R.properties, hooked = new WeakSet(), counts = new Map();
  let label = 'other', frames = 0;
  const origGet = props.get;
  props.get = function (obj) {
    const mp = origGet.call(this, obj);
    if (obj && obj.isMaterial && !hooked.has(mp)) {
      hooked.add(mp); let env = mp.environment;
      Object.defineProperty(mp, 'environment', { configurable: true, get: () => env, set: (v) => { env = v; const k = `${label} | ${obj.type}${obj.name ? ':' + obj.name : ''}${obj.isShaderMaterial ? '' : ''}`; counts.set(k, (counts.get(k) || 0) + 1); } });
    }
    return mp;
  };
  const origRender = R.render.bind(R);
  R.render = (scene, cam) => { const prev = label; if (label !== 'shadow') label = scene === m.scene ? 'world' : scene === m.weapons.scene ? 'vm' : 'post:' + (scene.type || '?'); try { return origRender(scene, cam); } finally { label = prev; } };
  const sm = R.shadowMap, origSR = sm.render.bind(sm);
  sm.render = (...a) => { const prev = label; label = 'shadow'; try { return origSR(...a); } finally { label = prev; } };
  const t0 = performance.now();
  await new Promise((res) => { const f = () => { frames++; if (performance.now() - t0 > 5000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  props.get = origGet; R.render = origRender; sm.render = origSR;
  const rows = [...counts.entries()].map(([k, n]) => ({ k, perFrame: +(n / frames).toFixed(2) })).sort((a, b) => b.perFrame - a.perFrame);
  const total = rows.reduce((a, r) => a + r.perFrame, 0);
  return { frames, total: +total.toFixed(1), programs: R.info.programs.length, rows: rows.slice(0, 20) };
}, { quality, map: +map, bots: +bots });
console.log(`getProgram calls / frame: ${r.total} over ${r.frames} frames · programs ${r.programs} · ${quality}`); console.table(r.rows);
await b.close(); srv.close();

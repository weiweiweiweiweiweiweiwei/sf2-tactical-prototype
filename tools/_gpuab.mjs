// v24 probe: where does a weak GPU spend its frame? Toggles one thing at a time during a 12v12 match and measures the real
// frame cost with vsync off. usage: node tools/_gpuab.mjs [intel|nvidia] [quality=low] [map=0]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [gpu = 'intel', quality = 'low', map = '0'] = process.argv.slice(2);
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--use-adapter-luid=${m[1]},${m[2]}`] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?check=1`); await p.waitForFunction(() => window.app && window.SF2);
const res = await p.evaluate(async ({ quality, map }) => {
  const S = SF2.Settings.data; S.quality = quality; Object.assign(S.lobby, { map, rule: 'tdm', allies: 12, enemies: 12 });
  window.__noPace = true; await app.startMatch(); app.state = 'playing'; const M = app.match; M.player.spawnProtect = 1e9;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(9000); M.tick = () => {}; // freeze the scene: every variant renders the very same frame
  const R = app.renderer, frameCost = async (ms = 3500) => { const t = []; let last = performance.now(); const t0 = last; await new Promise((res) => { const f = (now) => { t.push(now - last); last = now; if (now - t0 > ms) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); t.sort((a, b) => a - b); return +t[t.length >> 1].toFixed(1); };
  const info = () => { R.info.autoReset = false; R.info.reset(); app.post.render(0, true); const o = { calls: R.info.render.calls, tris: Math.round(R.info.render.triangles / 1000) + 'k' }; R.info.autoReset = true; return o; };
  app.post.setScale = () => {}; // freeze dynamic resolution while comparing
  const out = [], run = async (name, on, off) => { on(); await sleep(400); const ms = await frameCost(); const i = info(); off(); out.push({ name, ms, ...i }); };
  const nop = () => {};
  const bots = M.bots, sun = M.sun;
  await run('baseline', nop, nop);
  const s0 = app.post.scale;
  const mats = (root) => { const l = []; root.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => l.push([o, x])); }); return l; };
  const nm = new Map();
  const setType = (t, size) => { R.shadowMap.type = t; sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } mats(M.scene).forEach(([o, x]) => (x.needsUpdate = true)); mats(M.weapons.scene).forEach(([o, x]) => (x.needsUpdate = true)); };
  const T0 = R.shadowMap.type, Z0 = sun.shadow.mapSize.x, THREE = SF2.THREE;
  await run('map point lights on', () => M.scene.traverse((o) => { if (o.isPointLight && o.userData.mapLight) o.visible = true; }), () => M.scene.traverse((o) => { if (o.isPointLight && o.userData.mapLight) o.visible = false; }));
  await run('baseline again', nop, nop);
  return { q: app.post.qName, scale: s0, pr: R.getPixelRatio(), out };
}, { quality, map: +map });
console.log(`${gpu} · ${res.q} · scale ${res.scale} · pixelRatio ${res.pr}`); console.table(res.out);
await b.close(); srv.close();

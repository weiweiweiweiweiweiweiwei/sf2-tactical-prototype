// v32: where does the Intel GPU spend a solo match frame at full HD? The scene is frozen (same frame every variant) and
// one thing is switched off at a time; real frame cost with vsync off.  node tools/_gpuab2.mjs [intel|nvidia] [map=0]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [gpu = 'intel', map = '0'] = process.argv.slice(2);
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--use-adapter-luid=${m[1]},${m[2]}`] });
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const res = await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'auto'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 6, enemies: 6 });
  window.__noPace = true; await app.startMatch(); app.state = 'playing'; const M = app.match; M.player.spawnProtect = 1e9;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(7000); const tick = M.tick.bind(M); M.tick = () => {};
  app.post.setScale = () => {};
  const frameCost = async (ms = 3000) => { const t = []; let last = performance.now(); const t0 = last; await new Promise((res) => { const f = (now) => { t.push(now - last); last = now; if (now - t0 > ms) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); t.sort((a, b) => a - b); return +t[t.length >> 1].toFixed(2); };
  const R = app.renderer, out = [], run = async (name, on, off) => { on(); await sleep(400); out.push({ name, ms: await frameCost() }); off(); await sleep(200); };
  const nop = () => {}, sun = M.sun, hud = document.getElementById('hud');
  const scale0 = app.post.scale, q = app.post.qName || app.post.q && app.post.q.name;
  await run(`baseline (scale ${scale0}, ${R.getPixelRatio()}x)`, nop, nop);
  const setS = (s) => { const f = Object.getPrototypeOf(app.post).setScale; f.call(app.post, s); };
  await run('render scale 0.35', () => setS(0.35), () => setS(scale0));
  await run('render scale 1.0', () => setS(1), () => setS(scale0));
  await run('no sun shadow', () => { sun.castShadow = false; }, () => { sun.castShadow = true; });
  await run('no shadow map at all', () => { R.shadowMap.enabled = false; }, () => { R.shadowMap.enabled = true; });
  await run('HUD hidden (DOM)', () => { hud.style.display = 'none'; }, () => { hud.style.display = ''; });
  await run('no viewmodel', () => { M.weapons.scene.visible = false; }, () => { M.weapons.scene.visible = true; });
  await run('bots hidden', () => M.bots.forEach((x) => { x.model.root.visible = false; }), () => M.bots.forEach((x) => { x.model.root.visible = x.alive; }));
  await run('baseline again', nop, nop);
  return { q, gpu: app.gpuShort, out };
}, +map);
console.log(`${res.gpu} · preset ${res.q}`); console.table(res.out);
await b.close(); srv.close();

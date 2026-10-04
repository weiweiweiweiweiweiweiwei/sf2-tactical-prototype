// live solo match on one GPU, headed + vsync: FPS / frames in flight / input-to-photon proxy with the GPU pacer on vs off
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const gpu = process.argv[2] || 'intel', size = (process.argv[3] || '1920x1080').split('x').map(Number);
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--use-adapter-luid=${m[1]},${m[2]}`] });
const p = await (await b.newContext({ viewport: { width: size[0], height: size[1] } })).newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (process_mode) => {
  const S = SF2.Settings.data; S.quality = 'auto'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 6, enemies: 6 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; app.match.player.spawnProtect = 1e9;
  await new Promise((r) => setTimeout(r, 6000));
  const out = {};
  const hud = document.getElementById('hud'), rad = document.getElementById('radarWrap') || document.querySelector('#hud canvas');
  const V = { base: [() => {}, () => {}], 'HUD hidden': [() => { hud.style.visibility = 'hidden'; }, () => { hud.style.visibility = ''; }], 'radar hidden': [() => { if (rad) rad.style.display = 'none'; }, () => { if (rad) rad.style.display = ''; }],
    'no HUD update calls': [() => { window.__hu = app.hud.update; app.hud.update = () => {}; }, () => { app.hud.update = window.__hu; }],
    'no CSS filter on canvas': [() => { window.__cf = app.renderer.domElement.style.filter; app.renderer.domElement.style.filter = ''; }, () => { app.renderer.domElement.style.filter = window.__cf; }],
    'no sun shadow': [() => { app.match.sun.castShadow = false; }, () => { app.match.sun.castShadow = true; }],
    'pixel ratio 0.4': [() => { app.renderer.setPixelRatio(0.4); app.renderer.setSize(innerWidth, innerHeight); window.__ss = app.post.setScale; app.post.setScale = () => {}; }, () => { app.post.setScale = window.__ss; app.renderer.setPixelRatio(app.post.pixelRatio()); app.renderer.setSize(innerWidth, innerHeight); }] };
  for (const [k, np] of (process_mode === 'hud' ? Object.keys(V).concat('base again').map((n) => [n, false]) : [['pacer on', false], ['pacer off', true], ['pacer on again', false]])) {
    const v = V[k] || V.base; v[0]();
    window.__noPace = np; app.pacer.hist = [0, 0, 0, 0, 0]; await new Promise((r) => setTimeout(r, 1500));
    window.__stats = { frames: 0, seconds: 0 }; app.pacer.hist = [0, 0, 0, 0, 0]; const sk0 = app.busyN;
    let raf = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { raf++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    out[k] = { gameFps: window.__stats.avgFps, rafPerSec: Math.round(raf / 5), inflight: app.pacer.hist.join('/'), busy: +(+window.__stats.gpuBusy).toFixed(2), scale: +app.post.scale.toFixed(2), q: window.__stats.q };
    v[1]();
  }
  return out;
}, process.argv[4] || '');
console.log(gpu, size.join('x')); console.table(r);
await b.close(); srv.close();

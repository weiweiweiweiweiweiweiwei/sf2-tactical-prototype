// Which version got slower? Same solo match (warehouse, 6v6, auto quality) on one GPU with vsync off, per build:
// real frame cost (ms), GPU queue (share of frames starting with ≥2 unfinished), dynamic resolution, quality preset.
// Builds that have rooms (v27+) start the match the way a player does: 建立房間 → 出發 (solo room, online).
// node tools/_perfver.mjs [intel|nvidia] [file …]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const gpu = process.argv[2] || 'intel', files = process.argv.slice(3).length ? process.argv.slice(3) : fs.readdirSync('versions').filter((f) => /^v(24|26|27)_/.test(f)).map((f) => 'versions/' + f).concat('index.html');
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
const VS = process.env.VSYNC === '1', b = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(VS ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']), '--autoplay-policy=no-user-gesture-required', ...(m ? [`--use-adapter-luid=${m[1]},${m[2]}`] : [])] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const f of files) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/${encodeURI(f)}`); await p.waitForFunction(() => window.app && window.SF2, null, { timeout: 60000 });
  // idle menu first (hub / room): frames per second the menu itself costs
  const idle = await p.evaluate(async () => { const t0 = performance.now(); let n = 0; await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return Math.round(n / 2); });
  const r = await p.evaluate(async () => {
    const S = SF2.Settings.data; S.quality = 'auto'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 6, enemies: 6 });
    if (app.createRoom) { app.createRoom(); await Promise.race([app.room.ready.catch(() => {}), new Promise((r) => setTimeout(r, 8000))]); }
    await app.startMatch(); app.state = 'playing'; app.input.locked = true;
    await new Promise((r) => setTimeout(r, 5000));
    window.__stats = { frames: 0, seconds: 0 }; await new Promise((r) => setTimeout(r, 8000));
    const st = window.__stats, d = (st.dts || []).slice().sort((a, b) => a - b);
    return { inflight: st.inflight, fps: st.avgFps, ms: +(st.seconds * 1000 / Math.max(1, st.frames)).toFixed(2), p99: d.length ? +d[Math.floor(d.length * 0.99)].toFixed(1) : null, busy: st.gpuBusy != null ? +(+st.gpuBusy).toFixed(2) : null, scale: st.scale != null ? +(+st.scale).toFixed(2) : null, q: st.q, net: !!(app.match.net), room: !!app.room, gpu: app.gpuShort };
  });
  console.log(f.replace('versions/', '').slice(0, 40).padEnd(42), JSON.stringify({ menuFps: idle, ...r }), errs.length ? errs.slice(0, 2) : '');
  await ctx.close();
}
await b.close(); srv.close();

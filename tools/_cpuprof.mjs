// CPU time per frame part (sim / ai / fx / hud / render submit) in a live solo match, per build, on one GPU (headed, vsync on)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const gpu = process.argv[2] || 'intel', files = process.argv.slice(3);
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
for (const f of files) {
  const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--use-adapter-luid=${m[1]},${m[2]}`] });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/${encodeURI(f)}`); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async () => {
    const S = SF2.Settings.data; S.quality = 'auto'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 6, enemies: 6 });
    if (app.createRoom) { app.createRoom(); await new Promise((r) => setTimeout(r, 4000)); }
    await app.startMatch(); app.state = 'playing'; app.input.locked = true; app.match.player.spawnProtect = 1e9;
    await new Promise((r) => setTimeout(r, 6000)); window.__stats = { frames: 0, seconds: 0 }; app.match.prof = null;
    await new Promise((r) => setTimeout(r, 8000));
    // long tasks: anything else on the main thread
    return { fps: window.__stats.avgFps, prof: app.match.prof && app.match.prof.snapshot(), scale: +app.post.scale.toFixed(2), busy: +(+window.__stats.gpuBusy).toFixed(2) };
  });
  console.log(f.slice(0, 30).padEnd(32), JSON.stringify(r));
  await b.close();
}
srv.close();

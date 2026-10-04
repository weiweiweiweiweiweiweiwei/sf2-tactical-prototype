// What Task Manager shows: real GPU utilisation (Windows "GPU Engine" counters, 3D engines, summed over all Chrome
// processes) while each build sits in its menu and while it plays a solo match. Headed Chrome, vsync on, one GPU.
// node tools/_gpuuse.mjs [intel|nvidia] [file …]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const gpu = process.argv[2] || 'intel', files = process.argv.slice(3).length ? process.argv.slice(3) : ['versions/v24_2026-09-25_獨立倉庫與效能優化版.html', 'index.html'];
const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : ''; }); await probe.close();
const m = new RegExp('VENDOR= ' + (gpu === 'intel' ? '0x8086' : '0x10de') + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 3D-engine utilisation of every chrome.exe process, averaged over `sec` one-second samples
const gpuNow = (sec = 4) => {
  const ps = `$ids=(Get-Process chrome -ErrorAction SilentlyContinue).Id; $s=Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${sec} -ErrorAction SilentlyContinue; $t=0; foreach($x in $s){ foreach($c in $x.CounterSamples){ if($c.InstanceName -match 'pid_(\\d+)_' -and $ids -contains [int]$Matches[1]){ $t+=$c.CookedValue } } }; [math]::Round($t/${sec},1)`;
  try { return +execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim(); } catch (e) { return null; }
};
for (const f of files) {
  const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(m ? [`--use-adapter-luid=${m[1]},${m[2]}`] : [])] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/${encodeURI(f)}`); await p.waitForFunction(() => window.app && window.SF2, null, { timeout: 60000 });
  await sleep(6000); // boot work (weapon icons, thumbnails) done
  const menu = gpuNow();
  let room = null;
  if (await p.evaluate(() => !!app.createRoom)) { await p.evaluate(() => app.createRoom()); await sleep(5000); room = gpuNow(); }
  await p.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'auto'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 6, enemies: 6 }); await app.startMatch(); app.state = 'playing'; app.input.locked = true; });
  await sleep(6000); const match = gpuNow(); const fps = await p.evaluate(() => window.__stats && window.__stats.avgFps);
  await p.evaluate(() => { app.input.locked = false; app.input.onLockChange(false); }); await sleep(6000); const paused = gpuNow(6);
  console.log(f.replace('versions/', '').slice(0, 36).padEnd(38), `GPU %  · ${room === null ? '房間畫面' : '大廳'} ${menu}${room === null ? '' : ` · 房間 ${room}`} · 對戰 ${match} (${fps} FPS) · 暫停 ${paused}`);
  await b.close(); await sleep(1500);
}
srv.close();

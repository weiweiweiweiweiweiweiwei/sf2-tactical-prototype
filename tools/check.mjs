// tools/check.mjs — automated check required by CLAUDE.md §3.3.
// Serves the project root, opens the game in headless Chrome (the system install: no Playwright browser download needed;
// falls back to Edge, then Playwright's own Chromium), starts a match, plays real frames for N seconds, then reports
// average FPS (window.__stats), spawn line of sight (window.__debug.spawnLOS) and kills.
// Fails (exit 1) on any console.error, uncaught exception, failed match start, or enemy spawn zones that can see each other.
//
//   node tools/check.mjs                      # map 0 (warehouse), 10 s, high quality
//   node tools/check.mjs --map all --seconds 6
//   node tools/check.mjs --map 6 --shot       # also saves tools/out/<map>.png
//   node tools/check.mjs --file versions/v16_2026-09-25_開鏡視野與地形修正版.html --map 0 --shot
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); if (i < 0) return d; const v = process.argv[i + 1]; return !v || v.startsWith('--') ? true : v; };
const SECONDS = +arg('seconds', 10), QUALITY = arg('quality', 'high'), FILE = arg('file', 'index.html'), SHOT = arg('shot', false), HEADED = !!arg('headed', false);
// v24 profiling options: --size 1920x1080 · --novsync (true frame cost, no 60 Hz cap) · --bots 12 (per team) · --audio (run the audio engine too)
const [VW, VH] = String(arg('size', '1280x720')).split('x').map(Number), NOVSYNC = !!arg('novsync', false), BOTS = +arg('bots', 5), AUDIO = !!arg('audio', false);
const MAPS = arg('map', '0') === 'all' ? [0, 1, 2, 3, 4, 5, 6] : String(arg('map', '0')).split(',').map(Number);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.cube': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const launchArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(NOVSYNC ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])];
// --gpu intel|nvidia: pin Chrome to one adapter of a hybrid laptop (LUIDs change per boot → read them from chrome://gpu first)
const GPU_ARG = arg('gpu', ''), GPU = GPU_ARG || 'nvidia', NOPACE = !!arg('nopace', false); // default: the discrete GPU (Chrome's default adapter flips between the two)
if (GPU) {
  const probe = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] }), pg = await probe.newPage();
  await pg.goto('chrome://gpu').catch(() => {}); await pg.waitForTimeout(2500);
  const txt = await pg.evaluate(() => { const iv = document.querySelector('info-view'); return iv && iv.shadowRoot ? iv.shadowRoot.textContent : document.body.innerText; });
  await probe.close();
  const vendor = /intel/i.test(GPU) ? '0x8086' : /nv/i.test(GPU) ? '0x10de' : GPU, m = new RegExp('VENDOR= ' + vendor + String.raw`[^\n]*?LUID=\{(\d+),(\d+)\}`).exec(txt);
  if (m) launchArgs.push(`--use-adapter-luid=${m[1]},${m[2]}`);
  else if (GPU_ARG) { console.error('GPU not found:', GPU); process.exit(2); }
}
let browser = null;
for (const channel of ['chrome', 'msedge', undefined]) {
  try { browser = await chromium.launch({ channel, headless: !HEADED, args: launchArgs }); break; } catch (e) { /* try next */ }
}
if (!browser) { console.error('No Chrome / Edge / Playwright Chromium found'); process.exit(2); }

let failed = false;
const rows = [], prof = [];
for (const map of MAPS) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('response', (res) => { if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`); });
  let r = null;
  try {
    await page.goto(base + encodeURI(FILE) + '?check=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.app && window.SF2, null, { timeout: 60000 });
    await page.evaluate(async ({ map, quality, bots, audio, nopace }) => {
      const S = window.SF2.Settings.data; S.quality = quality; S.showFps = true;
      Object.assign(S.lobby, { map, rule: 'tdm', allies: bots, enemies: bots });
      if (audio) window.app.audio.init();
      if (nopace) window.__noPace = true;
      await window.app.startMatch();
      if (!window.app.match || !window.app.match.running) throw new Error('match did not start');
      window.app.state = 'playing'; window.__stats = { frames: 0, seconds: 0 };
      window.__audio0 = audio ? { n: window.app.audio.nodesMade, t: performance.now() } : null;
    }, { map, quality: QUALITY, bots: BOTS, audio: AUDIO, nopace: NOPACE });
    await page.waitForTimeout(SECONDS * 1000);
    r = await page.evaluate(() => {
      const m = window.app.match;
      const info = window.app.renderer.info; info.autoReset = false; info.reset(); window.app.post.render(0, true); const calls = info.render.calls, tris = info.render.triangles; info.autoReset = true;
      const d = (window.__stats.dts || []).slice().sort((a, b) => a - b), q = (x) => d.length ? +d[Math.min(d.length - 1, Math.floor(x * d.length))].toFixed(1) : 0;
      const A = window.__audio0, nodesPerSec = A ? Math.round((window.app.audio.nodesMade - A.n) / ((performance.now() - A.t) / 1000)) : null;
      const frames = { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: d.length ? +d[d.length - 1].toFixed(1) : 0, over33: d.filter((x) => x > 33.4).length, n: d.length };
      return { frames, prof: m.prof ? m.prof.snapshot() : {}, nodesPerSec, id: m.def.id, stats: window.__stats, debug: window.__debug || {}, kills: m.combatants.reduce((a, c) => a + c.kills, 0), gpu: window.SF2.Settings.data.gpu,
        calls, tris };
    });
    if (SHOT) await page.waitForFunction(() => window.app.match.phase === 'live' && !document.querySelector('#freeze.on'), null, { timeout: 20000 }).then(() => page.waitForTimeout(600)).catch(() => {});
    if (SHOT) { fs.mkdirSync(path.join(ROOT, 'tools/out'), { recursive: true }); await page.screenshot({ path: path.join(ROOT, 'tools/out', `${r.id}${FILE === 'index.html' ? '' : '_' + path.basename(FILE, '.html').split('_')[0]}.png`) }); }
  } catch (e) { errors.push('check: ' + e.message); }
  const los = r && r.debug.spawnLOSPairs;
  const ok = !errors.length && r && r.stats && r.stats.frames > 0 && r.debug.spawnLOS !== true;
  if (!ok) failed = true;
  if (r) prof.push({ map: r.id, 'p50 ms': r.frames.p50, 'p95': r.frames.p95, 'p99': r.frames.p99, 'max': r.frames.max, '>33ms': r.frames.over33, 'tick avg/max': r.prof.tick ? `${r.prof.tick.avg}/${r.prof.tick.max}` : '-', 'render cpu avg/max': r.prof.render ? `${r.prof.render.avg}/${r.prof.render.max}` : '-', 'ai': r.prof.ai ? `${r.prof.ai.avg}/${r.prof.ai.max}` : '-', 'fx': r.prof.fx ? `${r.prof.fx.avg}/${r.prof.fx.max}` : '-', 'hud': r.prof.hud ? `${r.prof.hud.avg}/${r.prof.hud.max}` : '-', 'audio nodes/s': r.nodesPerSec ?? '-', 'gpuBusy': r.stats.gpuBusy ?? '-', inflight: (r.stats.inflight || []).join('/'), 'scale': r.stats.scale ?? '-', q: r.stats.q ?? '-' });
  rows.push({ map: r ? r.id : map, ok: ok ? 'PASS' : 'FAIL', avgFps: r && r.stats ? r.stats.avgFps : '-', frameMs: r && r.stats ? r.stats.frameMs : '-', drawCalls: r ? r.calls : '-', tris: r ? r.tris : '-',
    spawnLOS: los ? `${los.visible}/${los.pairs} (min ${los.minDist} m)` : (r && r.debug.spawnLOS === undefined ? 'n/a' : '-'), kills: r ? r.kills : '-', errors: errors.length });
  for (const e of errors.slice(0, 8)) console.log(`  [${r ? r.id : map}] ${e}`);
  if (r && rows.length === 1) console.log(`GPU: ${r.gpu}`);
  await page.close();
}
console.table(rows);
if (prof.length) { console.log(`frame timing (ms) · ${VW}x${VH} · ${QUALITY}${NOVSYNC ? ' · vsync off' : ''} · ${BOTS}v${BOTS}`); console.table(prof); }
await browser.close(); server.close();
console.log(failed ? 'CHECK_FAILED' : 'CHECK_OK');
process.exit(failed ? 1 : 0);

// v62t load-time profile of a map: each loading stage (the loader's labels), the shader programs compiled, and the stalls in
// the first seconds of play (frames over 50 ms = programs still compiling in-game).   MAP=apex_skulltown node tools/_loadprof.mjs
// LOBBY=<s>: wait in the room first; RUNS=2: a second match in the same tab (warm: the pack scripts / textures cached); PROFILE=<dir>: keep Chrome's caches between runs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, MAP = process.env.MAP || 'apex_skulltown', RUNS = +(process.env.RUNS || 1);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const gpu = process.env.GPU === 'intel' ? [] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
// PROFILE=<dir>: a persistent browser profile (Chrome's own shader / HTTP caches survive between runs, as for a real player)
const b = process.env.PROFILE ? await chromium.launchPersistentContext(process.env.PROFILE, { channel: 'chrome', args: gpu, viewport: { width: 1280, height: 720 } }) : await chromium.launch({ channel: 'chrome', args: gpu });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 }); await p.waitForFunction(() => window.__gameReady, null, { timeout: 90000 });
for (let run = 1; run <= RUNS; run++) {
  const r = await p.evaluate(async ([id, lobby]) => {
    const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map: SF2.MAPS.findIndex((m) => m.id === id), rule: 'tdm', allies: 6, enemies: 6 });
    if (lobby) { app.warm(S.lobby.map); await new Promise((r) => setTimeout(r, lobby * 1000)); } // LOBBY=<s>: sit in the room first (App.warm preloads the map)
    const marks = [], t0 = performance.now(); let last = '';
    const poll = setInterval(() => { if (app.loadLabel !== last) { last = app.loadLabel; marks.push([last, Math.round(performance.now() - t0)]); } }, 5);
    if (app.match) { try { app.match.dispose && app.match.dispose(); } catch (e) { /* */ } }
    await app.startMatch(); clearInterval(poll); const total = Math.round(performance.now() - t0);
    const info = app.renderer.info, progs = info.programs ? info.programs.length : -1;
    app.state = 'playing'; app.input.locked = true;
    // first 4 s of play: frame times and programs added since the load
    const ft = []; let tp = performance.now(); await new Promise((res) => { const f = () => { const n = performance.now(); ft.push(n - tp); tp = n; if (ft.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const stages = marks.map((m, i) => [m[0], (marks[i + 1] ? marks[i + 1][1] : total) - m[1]]);
    const progList = (info.programs || []).map((pr) => (pr.name || '?') + ' | ' + String(pr.cacheKey || '').split(',').slice(0, 3).join(','));
    return { warm: window.__warmLoad || null, progList, sub: window.__loadT || null, total, stages, programs: progs, programsAfter: info.programs.length, stalls: ft.filter((x) => x > 50).map((x) => Math.round(x)), worst: Math.round(Math.max(...ft)) };
  }, [MAP, +(process.env.LOBBY || 0)]);
  console.log(`${MAP} run ${run}: total ${r.total} ms · programs ${r.programs} → ${r.programsAfter} after 4 s of play · stalls >50 ms ${JSON.stringify(r.stalls)}`);
  for (const [k, ms] of r.stages) console.log(`   ${String(ms).padStart(6)} ms  ${k}`);
  if (r.sub) console.log('   inside:', JSON.stringify(r.sub));
  if (r.warm) console.log('   preloaded in the room:', JSON.stringify(r.warm), 'ms');
  if (process.env.PROGS) { const c = {}; for (const x of r.progList) { const k = x.split(' | ')[1].split(',')[0] + (x.split(' | ')[0] === '?' ? '' : ':named'); c[k] = (c[k] || 0) + 1; } console.log('   programs by name:', JSON.stringify(c)); }
}
console.log(errs.slice(0, 3)); await b.close(); srv.close();

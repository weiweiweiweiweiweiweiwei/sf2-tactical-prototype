// scratch v67m: peak / RMS (first 0.3 s) of the feedback and gun waves as decoded in the game
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }); const H = await (await b.newContext()).newPage();
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
const r = await H.evaluate(async () => { app.audio.init(); await new Promise((r) => { const w = () => (SF2.AudioEngine.samplesReady ? r() : setTimeout(w, 200)); w(); });
  const S = SF2.AudioEngine.samples, out = {};
  for (const k of ['sf2_hit', 'sf2_hitdead', 'sf2_kill', 'kfb_default', 'kfb_special', 'kfb_rare', 'sf2_m4a1_fire', 'sf2_awp_fire', 'sf2_barrett_fire', 'sf2_m40a1_fire', 'sf2_ak47_fire']) {
    const l = S[k]; if (!l) { out[k] = null; continue; } const bf = k === 'sf2_hit' ? app.audio._hitHead(l[0]) : l[0]; let pk = 0, ss = 0, n = 0; const N = Math.min(bf.length, Math.round(bf.sampleRate * 0.3));
    for (let c = 0; c < bf.numberOfChannels; c++) { const a = bf.getChannelData(c); for (let i = 0; i < N; i++) { pk = Math.max(pk, Math.abs(a[i])); ss += a[i] * a[i]; n++; } }
    out[k] = { peak: +pk.toFixed(3), rmsDb: +(10 * Math.log10(ss / n)).toFixed(1), dur: +bf.duration.toFixed(2) };
  } return out; });
console.log(JSON.stringify(r)); await b.close(); srv.close();

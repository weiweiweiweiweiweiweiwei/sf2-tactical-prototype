// scratch v67n: the announcer / UX cues resolve to their waves
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] }); const H = await (await b.newContext()).newPage(); const errs = []; H.on('pageerror', (e) => errs.push(e.message));
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
const r = await H.evaluate(async () => { const A = app.audio; A.init(); await new Promise((r) => { const w = () => (SF2.AudioEngine.samplesReady ? r() : setTimeout(w, 200)); w(); });
  const log = [], o = A._one.bind(A); A._one = (buf, out, g) => { for (const [k, l] of Object.entries(SF2.AudioEngine.samples)) if (l.includes(buf)) log.push(k + '@' + g); return o(buf, out, g); };
  A.announceKill(['double', 'headshot']); A.announceKill(['kill']); A.announceKill(['grenade']); A.uxCue('challenge'); A.uxCue('levelup');
  return { log, banks: Object.keys(SF2.AudioEngine.samples).filter((k) => /^annc_|^ui_/.test(k)).length }; });
console.log(JSON.stringify(r), errs); await b.close(); srv.close();

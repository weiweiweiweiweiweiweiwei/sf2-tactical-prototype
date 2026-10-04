// v38: every hit-sound option (ESC → 命中音效) in list order: body, body, head, kill — 2 s per option → tools/out/hit_audition.webm
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const A = app.audio, AE = A.constructor, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); await AE.loadSamples(); A.init(); await sleep(300);
  const opts = [...document.querySelectorAll('#optHit option')].map((o) => [o.value, o.textContent]);
  const dest = A.ctx.createMediaStreamDestination(); A.comp.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }), chunks = []; rec.ondataavailable = (e) => chunks.push(e.data); rec.start();
  await sleep(300);
  for (const [k] of opts) { SF2.Settings.data.hitSound = k; for (const kind of ['body', 'body', 'head', 'kill']) { A.hit(kind); await sleep(380); } await sleep(480); }
  rec.stop(); await new Promise((r) => (rec.onstop = r));
  const buf = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { opts, b64: btoa(s) };
});
fs.writeFileSync('tools/out/hit_audition.webm', Buffer.from(r.b64, 'base64'));
r.opts.forEach(([k, l], i) => { const t = 0.3 + i * 2.0; console.log(`${String(i + 1).padStart(2)}. ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}  ${l}`); });
console.log(errs); await b.close(); srv.close();

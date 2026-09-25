// v24 probe: poison the audio graph with a NaN sample and check the watchdog restores sound.
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); p.on('console', (m) => console.log('console:', m.text())); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const A = app.audio; A.init(); const W = A._watchdog.bind(A); window.__wdlog = []; A._watchdog = () => { const r0 = A.busResets; W(); window.__wdlog.push([+performance.now().toFixed(0), +A.ctx.currentTime.toFixed(2), r0, A.busResets]); }; await A.ctx.resume(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const level = () => { const a = new Float32Array(512); A.probe.getFloatTimeDomainData(a); let nan = 0, pk = 0; for (const v of a) { if (!Number.isFinite(v)) nan++; else pk = Math.max(pk, Math.abs(v)); } return { nan, pk: +pk.toFixed(3) }; };
  const beep = () => { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); g.gain.value = 0.3; o.connect(g); g.connect(A.dry); o.start(); o.stop(A.ctx.currentTime + 0.4); };
  const out = { state: A.ctx.state, sr: A.ctx.sampleRate, t0: A.ctx.currentTime };
  await sleep(500); out.t1 = A.ctx.currentTime;
  beep(); await sleep(150); out.before = level();
  const buf = A.ctx.createBuffer(1, 128, A.ctx.sampleRate); buf.getChannelData(0)[5] = NaN; const s = A.ctx.createBufferSource(); s.buffer = buf; s.connect(A.dry); s.start();
  await sleep(300); const o = A.ctx.createOscillator(), g = A.ctx.createGain(); g.gain.value = 0.3; o.connect(g); const dry0 = A.dry; g.connect(dry0); o.start();
  // a live sound keeps being re-routed to the CURRENT dry bus, like new SFX in a match would be
  out.tl = []; for (let i = 0; i < 30; i++) { await sleep(100); if (A.dry !== dry0 && !out.rewired) { out.rewired = true; const g2 = A.ctx.createGain(); g2.gain.value = 0.3; o.connect(g2); g2.connect(A.dry); } out.tl.push([+A.ctx.currentTime.toFixed(2), A.busResets, level().pk]); }
  o.stop(); out.resets = A.busResets; out.after = out.tl[out.tl.length - 1];
  out.t2 = A.ctx.currentTime; out.wd = window.__wdlog; out.now = +performance.now().toFixed(0); out.state2 = A.ctx.state; return out;
});
console.log(JSON.stringify(r));
await b.close(); srv.close();

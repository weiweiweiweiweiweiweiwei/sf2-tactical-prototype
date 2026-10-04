// v33 sound check + listening demo: records the game's real audio output while it plays a scripted sequence
// (own guns, distant guns, footsteps on several surfaces, ADS, three ambiences) → tools/out/v33_demo_<rec|proc>.webm
// node tools/_sfxdemo.mjs [proc]   (proc = the old procedural sounds, for an A/B)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, PROC = process.argv[2] === 'proc';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }), errs = [];
p.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || /\[audio\]/.test(m.text())) errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const t0 = Date.now();
const loaded = await p.evaluate(async (proc) => {
  const AE = app.audio.constructor; await AE.prepareBanks(); const ok = await AE.loadSamples();
  if (proc) AE.samplesReady = false, AE.samples = {};
  return { ok, groups: Object.keys(AE.samples).length, clips: Object.values(AE.samples).reduce((n, l) => n + l.length, 0) };
}, PROC);
console.log('sound pack:', JSON.stringify(loaded), `${Date.now() - t0} ms`);
const res = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'low'; S.volume = 0.8; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true;
  const m = app.match, A = app.audio, V = SF2.THREE.Vector3, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const bt of m.bots) { bt.ai.update = () => {}; bt.ai.wishSpeed = 0; }
  A.init(); await sleep(300);
  const dest = A.ctx.createMediaStreamDestination(); A.comp.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }), chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data); rec.start();
  const at = (dx, dz) => new V(A.listener.x + dx, A.listener.y, A.listener.z + dz);
  const peaks = []; const probe = setInterval(() => peaks.push(A._peak(A.probe)), 100);
  A.setAmbience('none'); await sleep(400);
  // 1. own guns: 3 taps + a short burst each
  for (const [snd, gap, n] of [['m4', 95, 6], ['ak', 100, 6], ['mp5', 75, 7], ['m870', 700, 2], ['awp', 1300, 2], ['p226', 220, 4], ['deagle', 400, 2]]) {
    for (let i = 0; i < n; i++) { A.gunshot(snd, null); await sleep(i < 3 ? Math.max(gap, 260) : gap); }
    await sleep(700);
  }
  // 2. an enemy M4 at 15 m (left), then at 60 m (right, far recording)
  for (const [dx, dz] of [[-15, 0], [60, -10]]) { for (let i = 0; i < 5; i++) { A.gunshot('m4', at(dx, dz)); await sleep(110); } await sleep(1100); }
  // 3. footsteps: walk on concrete, metal, grass (running), ADS twice
  for (const [surf, loud] of [['concrete', 0.55], ['metal', 0.55], ['grass', 0.7], ['snow', 0.7]]) { for (let i = 0; i < 5; i++) { A.footstep(null, surf, loud); await sleep(loud > 0.6 ? 300 : 420); } await sleep(300); }
  A.mech('zoom'); await sleep(700); A.mech('zoom'); await sleep(700); A.mech('draw'); await sleep(800);
  // 4. ambience: warehouse, harbor, hill — 5 s each
  for (const k of ['warehouse', 'harbor', 'hill']) { A.setAmbience(k); await sleep(5000); }
  A.setAmbience('none'); await sleep(600);
  clearInterval(probe); rec.stop(); await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(chunks, { type: 'audio/webm' }), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), maxPeak: Math.max(...peaks), finite: peaks.every(Number.isFinite), silentShare: +(peaks.filter((x) => x < 1e-4).length / peaks.length).toFixed(2), resets: A.busResets };
});
fs.mkdirSync('tools/out', { recursive: true });
const out = `tools/out/v33_demo_${PROC ? 'proc' : 'rec'}.webm`; fs.writeFileSync(out, Buffer.from(res.b64, 'base64'));
console.log(out, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`, JSON.stringify({ maxPeak: +res.maxPeak.toFixed(3), finite: res.finite, silentShare: res.silentShare, busResets: res.resets }));
if (errs.length) console.log('MESSAGES', errs.slice(0, 8));
await b.close(); srv.close();

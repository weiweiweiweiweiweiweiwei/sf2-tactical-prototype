// v47 render the procedural gun banks to WAV for listening → tools/out/gunsfx/<sound>.wav (3 variants, a 3-round burst for autos)
//   node tools/_gunsfx.mjs g36,m4,ak,famas,cz700,m40,kar98,awp
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, IDS = (process.argv[2] || 'm4').split(',');
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.SF2);
const AUTO = { g36: 0.08, m4: 0.09, ak: 0.1, famas: 0.06 };
for (const id of IDS) {
  const pcm = await p.evaluate(async ([id, gap]) => {
    const AE = SF2.AudioEngine, P = SF2.GUN_PROFILES[id], sr = 48000;
    const q = { ...P, dry: 0.15, low: P.low && { ...P.low, g: P.low.g * 1.45, tau: P.low.tau * 1.25 }, punch: P.punch && { ...P.punch, g: P.punch.g * 1.3 } };
    const v = []; for (let i = 0; i < 3; i++) v.push(await AE.renderProfile(q, 1337 + i));
    // single shots 1.2 s apart (snipers 2 s), then for autos a 3-shot burst at the real fire rate
    const step = gap ? 1.2 : 2.2, starts = [0, step, step * 2], burst = gap ? [step * 3, step * 3 + gap, step * 3 + gap * 2] : [];
    const all = [...starts.map((t, i) => [t, v[i]]), ...burst.map((t, i) => [t, v[i % 3]])];
    const len = Math.ceil((all.at(-1)[0] + 2.4) * sr), L = new Float32Array(len), R = new Float32Array(len);
    for (const [t, buf] of all) { const o = Math.floor(t * sr), a = buf.getChannelData(0), c = buf.getChannelData(1); for (let i = 0; i < a.length && o + i < len; i++) { L[o + i] += a[i] * 0.7; R[o + i] += c[i] * 0.7; } }
    const out = new Int16Array(len * 2); for (let i = 0; i < len; i++) { out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    return Array.from(new Uint8Array(out.buffer));
  }, [id, AUTO[id] || 0]);
  const data = Buffer.from(pcm), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(48000 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(`tools/out/gunsfx/${id}.wav`, Buffer.concat([h, data])); console.log('wrote', id);
}
console.log(errs.slice(0, 5)); await b.close(); srv.close();

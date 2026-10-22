// v54 recorded mechanical gun sounds (reload / bolt / pump / switch), all CC0 from OpenGameArt — see assets/CREDITS.md.
// Decodes the downloaded originals in headless Chrome (wav + mp3, no ffmpeg needed), finds the separate events in each
// file by their loudness envelope, and either
//   node tools/sfx_mech.mjs <srcDir> scan          → prints every event and writes tools/out/mech/<file>_<n>.wav to audition
//   node tools/sfx_mech.mjs <srcDir> build         → cuts the events picked in PICK below into assets/sfx_mech.js
// assets/sfx_mech.js = window.SF2_SFX_MECH { name: [base64 wav, …] } (24 kHz mono 16-bit), merged into the main pack
// by AudioEngine.loadSamples.
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const [SRC, MODE = 'scan'] = process.argv.slice(2);
const FILES = {
  rifle: 'assaultriflereload1_0.wav', rifle2: 'gunreload1.wav', pistol: 'reload.wav', cock: 'shotguncock_0.wav',
  clip1: 'clipload1.wav', clip2: 'clipload2.wav', bullet: 'singlebullet1.wav', clicks: 'equipment_clicks3.wav',
  rack: 'shotgun_zip/ShotgunSounds/Rack.mp3', shell1: 'shotgun_zip/ShotgunSounds/First Shell.mp3', shellN: 'shotgun_zip/ShotgunSounds/Subsequent Shells.mp3',
  chamber: 'shotgun_zip/ShotgunSounds/Shell in Chamber.mp3',
};
// game sound name → list of [file key, first event, last event?] (indices from a `scan` run; a range is cut as one clip, e.g. a
// charging handle's pull + slam; each entry becomes one random variant). Edit tools/sfx_mech_pick.json after auditioning.
const PICK = JSON.parse(fs.existsSync('tools/sfx_mech_pick.json') ? fs.readFileSync('tools/sfx_mech_pick.json', 'utf8') : '{}');

const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage(); await p.goto('about:blank');
const out = {}, table = [];
for (const [key, rel] of Object.entries(FILES)) {
  const buf = fs.readFileSync(path.join(SRC, rel)).toString('base64');
  const r = await p.evaluate(async ([b64, picks]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const ac = new OfflineAudioContext(1, 1, 44100), src = await ac.decodeAudioData(bytes), sr = src.sampleRate;
    const n = src.length, x = new Float32Array(n);
    for (let c = 0; c < src.numberOfChannels; c++) { const d = src.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / src.numberOfChannels; }
    // 5 ms RMS envelope against the file's own noise floor (20th percentile): an event starts when the level crosses 20 %
    // of the floor→peak range (or jumps ×2.5 within 20 ms inside a running event), ends after 40 ms under 6 % or at 0.8 s
    const hop = Math.round(sr * 0.005), env = []; for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += x[i + k] ** 2; env.push(Math.sqrt(s / hop)); }
    const peak = Math.max(...env), floor = [...env].sort((a, b) => a - b)[Math.floor(env.length * 0.2)], on = floor + 0.2 * (peak - floor), off = floor + 0.06 * (peak - floor);
    const ev = []; let cur = null, below = 0;
    for (let i = 0; i < env.length; i++) {
      const e = env[i];
      if (cur && i - cur.s > 12 && e > on && e > 2.5 * (env[i - 4] || 0)) { cur.e = i - 1; ev.push(cur); cur = null; } // a new hit inside a run
      if (!cur) { if (e > on) { cur = { s: Math.max(0, i - 2), pk: 0 }; below = 0; } continue; }
      cur.pk = Math.max(cur.pk, e / peak); below = e < off ? below + 1 : 0;
      if (below >= 8 || i - cur.s > 160) { cur.e = i - below + 3; ev.push(cur); cur = null; }
    }
    if (cur) { cur.e = env.length; ev.push(cur); }
    const seg = (e) => x.slice(e.s * hop, Math.min(n, e.e * hop));
    // brightness: zero-crossing rate (Hz) — helps tell a dull mag seat from a sharp click
    const zcr = (a) => { let z = 0; for (let i = 1; i < a.length; i++) if ((a[i] >= 0) !== (a[i - 1] >= 0)) z++; return Math.round(z / 2 / (a.length / sr)); };
    // export: 24 kHz mono 16-bit WAV, peak-normalised to −1 dBFS, 4 ms fades
    const wav = (a) => {
      const R = 24000, m = Math.floor(a.length * R / sr), y = new Float32Array(m);
      for (let i = 0; i < m; i++) { const t = i * sr / R, i0 = Math.floor(t), f = t - i0; y[i] = (a[i0] || 0) * (1 - f) + (a[i0 + 1] || 0) * f; }
      let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v)); const g = pk > 0 ? 0.89 / pk : 1, fd = Math.round(R * 0.004);
      const dv = new DataView(new ArrayBuffer(44 + m * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + m * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, R, true); dv.setUint32(28, R * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, m * 2, true);
      for (let i = 0; i < m; i++) { const fade = Math.min(1, i / fd, (m - 1 - i) / fd); dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, y[i] * g * fade)) * 32767, true); }
      let s = ''; const u = new Uint8Array(dv.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s);
    };
    return { dur: +(n / sr).toFixed(2), events: ev.map((e, i) => ({ i, t: +(e.s * 0.005).toFixed(3), len: +((e.e - e.s) * 0.005).toFixed(3), pk: +e.pk.toFixed(2), zcr: zcr(seg(e)) })),
      wavs: picks === 'all' ? ev.map((e) => wav(seg(e))) : Object.fromEntries(picks.map(([i, j]) => [i + '-' + j, ev[i] && ev[j] ? wav(seg({ s: ev[i].s, e: ev[j].e })) : null])) };
  }, [buf, MODE === 'scan' ? 'all' : Object.values(PICK).flat().filter(([k]) => k === key).map(([, i, j]) => [i, j ?? i])]);
  table.push([key, rel, r.dur, r.events]);
  if (MODE === 'scan') { fs.mkdirSync('tools/out/mech', { recursive: true }); r.wavs.forEach((w64, i) => fs.writeFileSync(`tools/out/mech/${key}_${i}.wav`, Buffer.from(w64, 'base64'))); }
  else for (const [name, list] of Object.entries(PICK)) for (const [k, i, j] of list) { const w = k === key && r.wavs[i + '-' + (j ?? i)]; if (w) (out[name] ||= []).push(w); }
}
for (const [key, rel, dur, ev] of table) console.log(key.padEnd(8), `${dur}s`.padStart(7), rel, '\n   ', ev.map((e) => `#${e.i} @${e.t}s ${e.len}s pk${e.pk} zcr${e.zcr}`).join(' | '));
if (MODE === 'build') {
  const js = '/* v54 recorded gun mechanics — built by tools/sfx_mech.mjs from CC0 OpenGameArt recordings (assets/CREDITS.md). 24 kHz mono WAV, base64. */\nwindow.SF2_SFX_MECH = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync('assets/sfx_mech.js', js); console.log('assets/sfx_mech.js', (js.length / 1024).toFixed(0) + ' KB', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
}
await b.close();

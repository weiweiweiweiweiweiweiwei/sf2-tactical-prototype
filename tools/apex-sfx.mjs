// Apex Legends gun sounds from the user's own install (loop H5, 2026-10-28): RSX exports the Miles sources (`--exporttypes asrc`
// from audio/ship/general.mbnk) as 32-bit float WAV, some 6-channel (5.1) → tools/guns/apex_<id>_sfx/<role>.wav, 16-bit stereo
// (5.1 folded down: L + 0.707·C + 0.707·Ls, R alike; LFE dropped), named by what they are for the game.
//   node tools/apex-sfx.mjs r301
import fs from 'node:fs'; import path from 'node:path';
const GID = process.argv[2] || 'r301', SRC = `tools/out/apex/${GID}/audio/audio`, OUT = `tools/guns/apex_${GID}_sfx`;
const ROLES = { r301: { // role: source (1st-person takes; the reload set is the normal one, the bolt from the empty reload)
  fire_first: 'wpn_r101_1p_wpnfire_firstshot_core_6ch_v4_01', fire_loop: 'wpn_r101_1p_wpnfire_loop_core2_6ch_v3_01', fire_tail: 'wpn_r101_1p_wpnfire_tail_core_6ch_v4_01',
  fire_single: 'Wpn_R101_1p_WpnFire_Single_Core2_2ch_v3_01', magout: 'wpn_r101_reload_magpull_fr0_2ch_v1_01', maggrab: 'wpn_r101_reload_maggrab_fr18_2ch_v1_01',
  magin: 'wpn_r101_reload_maginsert_fr35_2ch_v1_01', boltback: 'wpn_r101_emptyreload_boltback_fr51_2ch_v1_01', boltfwd: 'wpn_r101_emptyreload_boltforward_fr55_2ch_v1_01',
  draw: 'wpn_r101_firstdraw_fr19_2ch_v1_02', adsin: 'r101_1p_adsin_v2_1' } }[GID];
function readWav(b) { // RIFF: fmt (format 1 PCM16 or 3 float32, channels, rate) + data
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + n); o += 8 + n + (n & 1); }
  const ch = fmt.ch, n = data.length / (fmt.bits / 8) / ch, get = fmt.tag === 3 ? (i) => data.readFloatLE(i * 4) : (i) => data.readInt16LE(i * 2) / 32768;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (c) => get(i * ch + c);
    if (ch === 1) L[i] = R[i] = s(0); else if (ch === 2) { L[i] = s(0); R[i] = s(1); }
    else { const c = s(2) * 0.707; L[i] = s(0) + c + (ch > 4 ? s(4) * 0.707 : 0); R[i] = s(1) + c + (ch > 5 ? s(5) * 0.707 : 0); } // FL FR FC LFE BL BR
  }
  return { rate: fmt.rate, L, R, ch };
}
function writeWav(f, { rate, L, R }) {
  let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 1 ? 1 / peak : 1, n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * k)) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * k)) * 32767), 46 + i * 4); }
  fs.writeFileSync(f, b); return k;
}
fs.mkdirSync(OUT, { recursive: true });
for (const [role, name] of Object.entries(ROLES)) {
  const w = readWav(fs.readFileSync(path.join(SRC, name + '.wav'))), f = path.join(OUT, role + '.wav'), k = writeWav(f, w);
  console.log(role.padEnd(12), name, `${w.ch}ch ${w.rate} Hz ${(w.L.length / w.rate).toFixed(2)} s`, k < 1 ? `(scaled ×${k.toFixed(2)})` : '', (fs.statSync(f).size / 1024).toFixed(0), 'KB');
}

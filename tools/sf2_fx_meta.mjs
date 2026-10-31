// v66d an SF2 map's ambient particle effects for its meta (map.js meta.fx) — shared by tools/sf2_map_build.mjs and tools/sf2_fx_patch.mjs.
// Reads tools/sf2_fx.py's <map>_fx.json and the sheets it exported: the systems that keep running (a one-shot — the level-start car
// blast — is left out), their sprite emitters (distortion and mesh emitters skipped), each sheet once as WebP ≤ 256
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
export async function sf2FxMeta(MAP) {
  const fxFile = `tools/out/sf2/maps/${MAP}_fx.json`;
  if (!fs.existsSync(fxFile)) return null;
  const F = JSON.parse(fs.readFileSync(fxFile, 'utf8')), tex = {}, systems = {}, sheets = {}, pngs = {};
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q); else pngs[f.toLowerCase()] = q; } };
  walk(`tools/out/sf2/fx/${MAP}`);
  for (const [sn, ems] of Object.entries(F.systems)) {
    const keep = ems.filter((e) => !e.mesh && e.loops === 0 && F.mats[e.mat] && F.mats[e.mat].tex && F.mats[e.mat].blend !== 'Distortion' && pngs[F.mats[e.mat].tex.toLowerCase() + '.png']);
    if (!keep.length) continue;
    systems[sn] = keep.map((e) => { const m = F.mats[e.mat]; sheets[m.tex] = pngs[m.tex.toLowerCase() + '.png']; return { ...e, tex: m.tex, blend: m.blend }; });
  }
  // (UE's FX materials take their opacity where the sheet keeps it: a sheet with no alpha — fire, sparks, thin smoke on black — is
  // opaque by its brightness, so alpha = its brightest channel and the colour divided back out; a one-frame sheet whose edges are not
  // clear — T_sub_Smoke_02, a tiling cloud the material masks — gets a round fade, else every puff is a square)
  const single = new Set(Object.values(systems).flat().filter((e) => e.subH * e.subV === 1).map((e) => e.tex));
  for (const [t, f] of Object.entries(sheets)) {
    const img = sharp(f).resize(256, 256, { fit: 'inside', withoutEnlargement: true }), md = await sharp(f).metadata();
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
    if (md.channels < 4) for (let i = 0; i < data.length; i += 4) { const a = Math.max(data[i], data[i + 1], data[i + 2]); data[i + 3] = a; if (a) for (let k = 0; k < 3; k++) data[i + k] = Math.min(255, Math.round(data[i + k] * 255 / a)); }
    if (single.has(t)) {
      let edge = 0, n = 0; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { edge += data[(y * W + x) * 4 + 3]; n++; } for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { edge += data[(y * W + x) * 4 + 3]; n++; }
      if (edge / n > 50) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = Math.hypot((x + 0.5) / W - 0.5, (y + 0.5) / H - 0.5) * 2, m = Math.min(1, Math.max(0, (1 - r) / 0.6)); data[(y * W + x) * 4 + 3] *= m * m * (3 - 2 * m); }
    }
    tex[t] = 'data:image/webp;base64,' + (await sharp(data, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 85, alphaQuality: 90 }).toBuffer()).toString('base64');
  }
  const fx = { tex, systems, placed: F.placed.filter((q) => systems[q.t]) };
  console.log('fx', fx.placed.length, 'emitters,', Object.keys(systems).length, 'systems,', Object.keys(tex).length, 'sheets');
  return fx;
}

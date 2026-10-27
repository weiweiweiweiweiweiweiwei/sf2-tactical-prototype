/* =====================================================================
   v52 SATELLITE BASE — Blender dressing (tools/blender/sat_build.py → assets/maps/satellite.js = base64 GLB) and its
   special materials. The GLB is visual only: it sits on collider faces, on existing cover-box footprints and overhead,
   so the grid in satellitePlan() still decides movement, cover and sight lines. Placeholders 'sat:<name>' become the
   game PBR preset of that name (sat_wall, sat_trim, … in src/03_textures.js) or one of the materials below.
   ===================================================================== */
import { DRACOLoader, GLTFLoader, THREE, mulberry32 } from './01_core.js';
import { MAT_PRESETS } from './03_textures.js';
const SAT_HAS_GLB = true;

async function satPreload(def) {
  if (def._glb !== undefined) return;
  def._glb = null;
  try {
    if (!SAT_HAS_GLB) return;
    if (!window.SAT_GLB) await new Promise((res) => { const s = document.createElement('script'); s.src = 'assets/maps/satellite.js'; s.async = true; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    if (window.SAT_GLB) {
      const bin = Uint8Array.from(atob(window.SAT_GLB), (c) => c.charCodeAt(0)).buffer, L = new GLTFLoader(), D = new DRACOLoader();
      D.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/'); L.setDRACOLoader(D);
      def._glb = await L.parseAsync(bin, ''); D.dispose();
    }
  } catch (e) { console.warn('Satellite GLB unavailable, using fallback visuals', e && e.message); def._glb = null; }
}

// screen / sign pictures (canvas) — repeat wrapping: the GLB V is negated by the glTF flip
function satCanvas(tf, key, w, h, draw) {
  return tf.simple(key, w, (ctx, S) => { ctx.save(); ctx.scale(S / w, S / h); draw(ctx, w, h); ctx.restore(); }, true, true);
}
function satScreen(ctx, w, h, title) {
  ctx.fillStyle = '#04121b'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(70,170,210,.18)'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += w / 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += h / 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(40,120,160,.55)'; ctx.fillRect(0, 0, w, h * 0.09);
  ctx.fillStyle = '#bfefff'; ctx.font = `bold ${Math.round(h * 0.06)}px monospace`; ctx.textBaseline = 'middle'; ctx.fillText(title, w * 0.02, h * 0.045);
  ctx.strokeStyle = 'rgba(120,210,240,.7)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
}
function satText(ctx, w, h, lines, o = {}) {
  ctx.clearRect(0, 0, w, h);
  if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = o.edge || '#d9b43a'; ctx.lineWidth = h * 0.06; ctx.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06); }
  ctx.fillStyle = o.color || '#f1f1ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach(([t, size, y], i) => { ctx.font = `bold ${Math.round(h * size)}px "Segoe UI", "Microsoft JhengHei", sans-serif`; ctx.fillText(t, w / 2, h * y); });
}
function satGlow(ctx, w, h, rgb, radial) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = 1 - y / (h - 1); // v = 0 at the bottom row (= the quad's first edge)
    let a;
    if (radial) { const d = Math.hypot(u - 0.5, v - 0.5) * 2; a = Math.max(0, 1 - d) ** 2; }
    else { const e = Math.min(1, Math.min(u, 1 - u) * 6); a = (1 - v) ** 2.2 * e; }
    const i = (y * w + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
}

function satSpecialMat(b, name) {
  const tf = b.tf, lib = b.lib, basic = (key, opts) => lib.basic('sat:' + key, () => new THREE.MeshBasicMaterial(opts));
  const glow = (key, rgb, radial, op) => lib.basic('sat:' + key, () => new THREE.MeshBasicMaterial({ map: satCanvas(tf, 'sat_' + key, 128, 128, (c, w, h) => satGlow(c, w, h, rgb, radial)), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  switch (name) {
    case 'screenMap': return basic('screenMap', { color: new THREE.Color(1.25, 1.25, 1.25), map: satCanvas(tf, 'sat_screenMap', 512, 256, (c, w, h) => {
      satScreen(c, w, h, 'SATCOM // GLOBAL TRACK   ORBIT 03');
      const rnd = mulberry32(5203); c.fillStyle = 'rgba(60,150,120,.55)';
      for (const [cx, cy, rx, ry] of [[0.2, 0.38, 0.11, 0.13], [0.27, 0.68, 0.06, 0.12], [0.49, 0.36, 0.07, 0.09], [0.53, 0.6, 0.06, 0.13], [0.7, 0.36, 0.16, 0.12], [0.82, 0.72, 0.06, 0.06]]) {
        c.beginPath(); for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283, r = 0.75 + rnd() * 0.4; c.lineTo(w * (cx + Math.cos(a) * rx * r), h * (cy + Math.sin(a) * ry * r)); } c.closePath(); c.fill();
      }
      for (const [ph, amp, col] of [[0, 0.22, '#5fe3ff'], [1.7, 0.3, '#ffd75a'], [3.6, 0.15, '#ff7a6a']]) {
        c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath();
        for (let x = 0; x <= w; x += 4) c.lineTo(x, h * (0.55 + Math.sin(x / w * 6.283 * 1.0 + ph) * amp)); c.stroke(); c.setLineDash([]);
        const sx = ((ph * 97) % 1) * w * 0.8 + w * 0.1, sy = h * (0.55 + Math.sin(sx / w * 6.283 + ph) * amp); c.fillStyle = col; c.fillRect(sx - 5, sy - 5, 10, 10);
      }
      c.fillStyle = '#9fe6ff'; c.font = `${Math.round(h * 0.045)}px monospace`; ['UPLINK  ●  LOCKED', 'AZ 214.6  EL 38.2', 'SIG -71.4 dBm'].forEach((t, i) => c.fillText(t, w * 0.02, h * (0.84 + i * 0.055)));
    }) });
    case 'screenRadar': return basic('screenRadar', { color: new THREE.Color(1.25, 1.25, 1.25), map: satCanvas(tf, 'sat_screenRadar', 512, 256, (c, w, h) => {
      satScreen(c, w, h, 'DISH TRACKING // AZ-EL');
      const cx = w * 0.3, cy = h * 0.56, R = h * 0.38;
      c.strokeStyle = 'rgba(90,240,170,.6)'; c.lineWidth = 1.5; for (let k = 1; k <= 4; k++) { c.beginPath(); c.arc(cx, cy, R * k / 4, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
      const g = c.createLinearGradient(cx, cy, cx + R, cy - R * 0.4); g.addColorStop(0, 'rgba(90,255,170,.55)'); g.addColorStop(1, 'rgba(90,255,170,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, -0.9, -0.35); c.closePath(); c.fill();
      c.fillStyle = '#ffe36a'; for (const [a, d] of [[-0.6, 0.7], [1.9, 0.45], [3.6, 0.82]]) c.fillRect(cx + Math.cos(a) * R * d - 3, cy + Math.sin(a) * R * d - 3, 6, 6);
      c.fillStyle = '#9fffd0'; c.font = `${Math.round(h * 0.05)}px monospace`;
      ['TARGET  KOMPSAT-5', 'RANGE   1 284 km', 'DOPPLER +2.41 kHz', 'LINK    GREEN'].forEach((t, i) => c.fillText(t, w * 0.62, h * (0.3 + i * 0.12)));
    }) });
    case 'screenData': return lib.basic('sat:screenData', () => {
      const map = satCanvas(tf, 'sat_screenData', 512, 256, (c, w, h) => {
        satScreen(c, w, h, 'TELEMETRY // BUS 2');
        const rnd = mulberry32(5207); c.font = `${Math.round(h * 0.045)}px monospace`;
        for (let row = 0; row < 16; row++) for (let col = 0; col < 3; col++) {
          const v = (rnd() * 999).toFixed(1).padStart(6, ' '), warn = rnd() < 0.08;
          c.fillStyle = warn ? '#ff8a5a' : col === 1 ? '#ffd76a' : '#8ff0c8'; c.fillText(`CH${String(row * 3 + col).padStart(2, '0')} ${v}`, w * (0.03 + col * 0.33), h * (0.14 + row * 0.054));
        }
      });
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.2), map }); m.userData.scroll = 0.02; return m;
    });
    case 'screenConsole': return basic('screenConsole', { color: new THREE.Color(1.15, 1.15, 1.15), map: satCanvas(tf, 'sat_screenConsole', 256, 128, (c, w, h) => {
      satScreen(c, w, h, 'OPS');
      const rnd = mulberry32(5209);
      for (let k = 0; k < 7; k++) { const v = 0.2 + rnd() * 0.7; c.fillStyle = v > 0.8 ? '#ff8a5a' : '#5fe3ff'; c.fillRect(w * (0.06 + k * 0.08), h * (0.92 - v * 0.7), w * 0.05, h * v * 0.7); }
      c.strokeStyle = '#ffd76a'; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= w * 0.36; x += 4) c.lineTo(w * 0.62 + x, h * (0.55 + Math.sin(x * 0.12) * 0.16)); c.stroke();
    }) });
    case 'led': return basic('led', { color: new THREE.Color(1.6, 1.6, 1.6), map: satCanvas(tf, 'sat_led', 256, 16, (c, w, h) => {
      c.fillStyle = '#0b0e10'; c.fillRect(0, 0, w, h); const rnd = mulberry32(5211);
      for (let k = 0; k < 16; k++) { const p = rnd(); c.fillStyle = p < 0.62 ? '#3dff8a' : p < 0.86 ? '#ffc23d' : '#ff4a3a'; c.beginPath(); c.arc(w * (k + 0.5) / 16, h / 2, h * 0.32, 0, 7); c.fill(); }
    }) });
    case 'hazard': return lib.basic('sat:hazard', () => new THREE.MeshStandardMaterial({ roughness: 0.7, map: satCanvas(tf, 'sat_hazard', 128, 128, (c, w, h) => {
      c.fillStyle = '#e1b52c'; c.fillRect(0, 0, w, h); c.fillStyle = '#16171a';
      for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * w / 2, h); c.lineTo(k * w / 2 + w / 4, h); c.lineTo(k * w / 2 + w / 4 + h, 0); c.lineTo(k * w / 2 + h, 0); c.closePath(); c.fill(); }
    }) }));
    case 'linePaint': return lib.basic('sat:linePaint', () => new THREE.MeshStandardMaterial({ color: 0xd9b32e, roughness: 0.6 }));
    case 'signA': case 'signC': case 'signW': case 'signE': {
      const T = { signA: [['保全室 A', 0.42, 0.38], ['SECURITY · A', 0.22, 0.75]], signC: [['保全室 C', 0.42, 0.38], ['SECURITY · C', 0.22, 0.75]],
        signW: [['◀ 西側走廊', 0.4, 0.38], ['WEST CORRIDOR · ALPHA', 0.2, 0.75]], signE: [['東側走廊 ▶', 0.4, 0.38], ['EAST CORRIDOR · BRAVO', 0.2, 0.75]] }[name];
      return lib.basic('sat:' + name, () => new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.35,
        map: satCanvas(tf, 'sat_' + name, 512, 128, (c, w, h) => satText(c, w, h, T, { bg: '#1b2a33' })), emissiveMap: satCanvas(tf, 'sat_' + name, 512, 128, () => {}) }));
    }
    case 'stencilSat': case 'stencilB': {
      const T = name === 'stencilSat' ? [['SATCOM CONTROL  ·  衛星通訊管制室', 0.62, 0.52]] : [['UPLINK CONTROL  ·  B', 0.62, 0.52]];
      return lib.basic('sat:' + name, () => new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, alphaTest: 0.3, map: satCanvas(tf, 'sat_' + name, 1024, 64, (c, w, h) => satText(c, w, h, T, { color: 'rgba(232,236,232,.85)' })) }));
    }
    case 'glowCyan': return glow('glowCyan', [70, 190, 255], false, 0.38);
    case 'glowRed': return glow('glowRed', [255, 60, 40], false, 0.32);
    case 'glowWhite': return glow('glowWhite', [200, 230, 255], true, 0.22);
    case 'lightPanel': return basic('lightPanel', { color: new THREE.Color(0.92, 0.97, 1).multiplyScalar(2.3) });
    case 'emRed': return basic('emRed', { color: new THREE.Color(3, 0.35, 0.25) });
    case 'holo': return basic('holo', { color: new THREE.Color(0.35, 0.95, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    case 'holoBase': return basic('holoBase', { color: new THREE.Color(0.5, 1.4, 2.0) });
    case 'glassDark': return lib.basic('sat:glassDark', () => new THREE.MeshStandardMaterial({ color: 0x0b141a, roughness: 0.08, metalness: 0.3, emissive: 0x0c3a4a, emissiveIntensity: 0.8 }));
    case 'keyboard': return lib.basic('sat:keyboard', () => new THREE.MeshStandardMaterial({ color: 0x1c2125, roughness: 0.75 }));
    case 'cable': return lib.basic('sat:cable', () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }));
  }
  return null;
}

// Swap the placeholders, add the GLB to the scene; the holo globe turns and the telemetry scrolls (per-frame animation).
function satDressing(b) {
  const glb = !b.dry && b.def._glb; if (!glb) return false;
  const sc = glb.scene, holo = [], scroll = new Set();
  sc.traverse((o) => {
    if (!o.isMesh) return;
    const nm = ((o.material && o.material.name) || '').replace(/^sat:/, ''), sp = satSpecialMat(b, nm);
    o.userData.srcMat = 'sat:' + nm;
    if (sp) { o.material = sp; if (sp.transparent) { o.renderOrder = 2; o.userData.noAO = true; } if (sp.userData.scroll) scroll.add(sp); }
    else if (MAT_PRESETS[nm]) o.material = b.lib.get(nm);
    o.castShadow = !/^(glow|holo|ceil|sign|floor)/.test(o.name); o.receiveShadow = true;
    if (/^holo/.test(o.name)) holo.push(o); else { o.matrixAutoUpdate = false; o.updateMatrix(); }
  });
  sc.updateMatrixWorld(true); b.scene.add(sc);
  b.animated.push((dt, t) => { for (const o of holo) o.rotation.y = t * 0.35; for (const m of scroll) if (m.map) m.map.offset.y = (t * m.userData.scroll) % 1; });
  return true;
}

export { satDressing, satPreload };

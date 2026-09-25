// Dev-only probe helpers (not part of the build). Load in the preview with: await import('/ref/dev.js?' + Date.now())
const w = window;
w.scope = function (src, mask) {
  const W = 400, H = Math.round(W * (src.naturalHeight || src.height) / (src.naturalWidth || src.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data;
  const Y = [], C = []; let sCb = 0, sCr = 0, clip = 0, crush = 0, n = 0, sS = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (mask && mask(i / W, j / H)) continue;
    const k = (j * W + i) * 4, r = d[k] / 255, g = d[k + 1] / 255, b = d[k + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, cb = (b - y) / 1.8556, cr = (r - y) / 1.5748;
    Y.push(y); C.push(Math.hypot(cb, cr)); sCb += cb; sCr += cr; n++;
    if (Math.max(r, g, b) > 0.985) clip++; if (y < 0.02) crush++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sS += mx > 0 ? (mx - mn) / mx : 0;
  }
  Y.sort((a, b) => a - b); const Cs = C.slice().sort((a, b) => a - b);
  const p = (A, q) => A[Math.min(A.length - 1, Math.floor(q * A.length))];
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { p5: r3(p(Y, .05)), p50: r3(p(Y, .5)), p95: r3(p(Y, .95)), meanY: r3(Y.reduce((a, b) => a + b, 0) / n),
    chroma: r3(C.reduce((a, b) => a + b, 0) / n), chP90: r3(p(Cs, .9)), sat: r3(sS / n), cb: r3(sCb / n), cr: r3(sCr / n), clip: r3(clip / n * 100), crush: r3(crush / n * 100) };
};
w.loadMap = async (idx, quality = 'high') => {
  const app = w.app;
  if (app.match) { app.match.dispose(); app.match = null; }
  const L = w.SF2.Settings.data.lobby; L.map = idx; L.rule = 'tdm'; L.allies = 4; L.enemies = 4; w.SF2.Settings.data.quality = quality;
  await app.startMatch(); app.state = 'paused'; if (app.input.unlock) app.input.unlock();
  return app.match.def.id;
};
w.grab = (view = 'shot') => {
  const app = w.app, m = app.match, cam = m.camera;
  if (view === 'shot') { const s = m.def.shot; cam.position.set(...s.pos); cam.lookAt(...s.target); cam.fov = 62; cam.updateProjectionMatrix(); app.post.render(0, false); }
  else if (view === 'eye') { // eye level from our spawn toward the map centre, soldiers hidden
    const p = m.player.motor.pos; cam.position.set(p.x, p.y + 1.62, p.z); cam.lookAt(0, 1.4, 0); cam.fov = 75; cam.updateProjectionMatrix();
    const vis = m.bots.map((b) => b.model.root.visible); m.bots.forEach((b) => { b.model.root.visible = false; });
    app.post.render(0, false); const o = w._copy(); m.bots.forEach((b, i) => { b.model.root.visible = vis[i]; }); return o;
  }
  else { m.player.updateCamera(1); app.post.render(0, true); }
  return w._copy();
};
w._copy = () => { const c = w.app.renderer.domElement, o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; };
w.show = (cv) => { const old = document.getElementById('dbgimg'); if (old) old.remove(); if (!cv) return 'hidden'; document.body.insertAdjacentHTML('beforeend', `<img id="dbgimg" src="${cv.toDataURL('image/jpeg', 0.88)}" style="position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99999;object-fit:contain;background:#000">`); return 'shown'; };
w.measure = async (idx, quality) => { if (idx !== undefined) await w.loadMap(idx, quality); const r = {}; for (const v of ['shot', 'eye']) r[v] = w.scope(w.grab(v)); return r; };
w.sf2ref = async () => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const mask = (u, v) => u < 0.3 && v < 0.12, out = {};
  for (const n of ['alley', 'factory', 'bunker']) out[n] = w.scope(await load('/ref/sf2_' + n + '.webp'), mask);
  return out;
};
w.errs = w.errs || [];
if (!w._errHook) { w._errHook = true; w.addEventListener('error', (e) => w.errs.push(e.message)); }
export default true;
// ---- spawn line-of-sight tools: every alpha × bravo spawn point, eye height 1.6 m ----
w.losPairs = () => {
  const m = w.app.match, V = w.SF2.THREE.Vector3, out = [];
  for (const p of m.spawns.alpha.pts) for (const q of m.spawns.bravo.pts) {
    const a = new V(p.x, p.y + 1.6, p.z), b = new V(q.x, q.y + 1.6, q.z);
    if (m.collision.segmentClear(a, b)) out.push([a, b]);
  }
  return out;
};
// where do the visible rays cross the planes x = xs[i]?  → [min z, max z] per plane
w.losCorridor = (pairs, xs) => xs.map((x) => { let lo = 1e9, hi = -1e9; for (const [a, b] of pairs) { const t = (x - a.x) / (b.x - a.x); if (t < 0 || t > 1) continue; const z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t; lo = Math.min(lo, z); hi = Math.max(hi, z); } return { x, z: [+lo.toFixed(1), +hi.toFixed(1)] }; });
// how many visible pairs survive candidate blockers [[x0,y0,z0,x1,y1,z1], …] (mirrored in x when mirror = true)
w.tryBlock = (pairs, boxes, mirror = true) => {
  const V = w.SF2.THREE.Vector3, CW = w.app.match.collision.constructor, all = [];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) { all.push({ min: new V(x0, y0, z0), max: new V(x1, y1, z1) }); if (mirror) all.push({ min: new V(-x1, y0, -z1), max: new V(-x0, y0 + (y1 - y0), -z0) }); }
  let n = 0; const d = new V();
  for (const [a, b] of pairs) { d.subVectors(b, a); const L = d.length(); d.divideScalar(L); if (!all.some((bx) => CW.rayBox(a, d, bx, L))) n++; }
  return n;
};
// ---- ramp side-fall probe: step off each ramp's long sides at many points, then try to walk out in 8 directions ----
w.rampProbe = () => {
  const app = w.app, m = app.match, pl = m.player, mo = pl.motor, col = m.collision, V = w.SF2.THREE.Vector3, keys = app.input.keys, res = [];
  app.state = 'playing'; while (!m.canMove()) m.tick(1 / 30, { x: 0, y: 0 });
  pl.spawnProtect = 1e9;
  const run = (secs) => { for (let i = 0; i < secs * 60; i++) { m.score.alpha = m.score.bravo = 0; m.timeLeft = 900; m.tick(1 / 60, { x: 0, y: 0 }); } }; // keep the match live for the whole probe
  let invalid = 0;
  for (const rp of col.ramps) {
    const alongZ = rp.axis !== 'x';
    for (let k = 0.15; k <= 0.9; k += 0.15) for (const side of [-1, 1]) {
      const a = alongZ ? rp.minZ + (rp.maxZ - rp.minZ) * k : rp.minX + (rp.maxX - rp.minX) * k;
      const x = alongZ ? (side < 0 ? rp.minX + 0.2 : rp.maxX - 0.2) : a, z = alongZ ? a : (side < 0 ? rp.minZ + 0.2 : rp.maxZ - 0.2);
      mo.teleport(new V(x, col.rampHeight(rp, x, z) + 0.05, z)); mo.vel.set(0, 0, 0);
      pl.yaw = alongZ ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (side < 0 ? 0 : Math.PI); // face outward over the side
      keys.clear(); keys.add('KeyW'); run(0.35); keys.clear(); run(1.2);
      const land = mo.pos.clone(); let best = 0;
      for (let d = 0; d < 8; d++) { mo.teleport(land.clone()); mo.vel.set(0, 0, 0); pl.yaw = d * Math.PI / 4; keys.add('KeyW'); run(1.5); keys.clear(); best = Math.max(best, Math.hypot(mo.pos.x - land.x, mo.pos.z - land.z)); }
      if (!m.canMove()) { invalid++; continue; }
      if (best < 1.2) res.push({ at: [+land.x.toFixed(2), +land.y.toFixed(2), +land.z.toFixed(2)], best: +best.toFixed(2) });
    }
  }
  keys.clear(); app.state = 'paused';
  return { ramps: col.ramps.length, invalid, stuck: res.length, samples: col.ramps.length * 12, examples: res.slice(0, 6) };
};

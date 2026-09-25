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

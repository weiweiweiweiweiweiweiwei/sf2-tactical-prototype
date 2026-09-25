/* =====================================================================
   v17 GRADE PANEL — in-game colour grading with DaVinci Resolve's
   primaries vocabulary (暗部 / 中灰 / 亮部 / 偏移 × Y R G B, 對比度 +
   軸心, 飽和度 50 = 1, 色溫 / 色調), a live RGB parade + vectorscope
   sampled from the final frame, .cube LUT import, split-screen compare,
   neutral screenshot export (to grade in Resolve) and JSON copy.
   Open with F8 or 暫停 → 調色. Per-map values persist in
   Settings.data.look[mapId]; imported LUTs in localStorage (LUT_STORE).
   ===================================================================== */
const GRADE_ROWS = [
  ['基本', [
    ['exposure', '曝光 (遊戲)', 0.2, 2, 0.01], ['temp', '色溫', -4000, 4000, 50], ['tint', '色調', -100, 100, 1],
    ['contrast', '對比度', 0, 2, 0.005], ['pivot', '軸心', 0.05, 0.95, 0.005], ['sat', '飽和度', 0, 100, 0.5],
    ['shadows', '陰影', -100, 100, 1], ['highlights', '高光', -100, 100, 1],
  ]],
  ['亮度 vs 飽和度', [['shadowSat', '暗部飽和', 0, 1.5, 0.01], ['highSat', '高光飽和', 0, 1.5, 0.01]]],
  ['校色輪（Y · R · G · B）', [
    ['lift', '暗部 Lift', -0.5, 0.5, 0.005], ['gamma', '中灰 Gamma', -0.5, 0.5, 0.005], ['gain', '亮部 Gain', 0, 3, 0.005], ['offset', '偏移 Offset', 0, 50, 0.1],
  ]],
  ['效果', [['vig', '暗角', 0, 1, 0.01], ['grain', '顆粒', 0, 0.08, 0.001], ['ca', '色差', 0, 0.01, 0.0005], ['lutMix', 'LUT 混合', 0, 1, 0.01]]],
];
const WHEEL_CH = ['Y', 'R', 'G', 'B'];

class GradePanel {
  constructor(app) {
    this.app = app; this.open = false; this.split = false; this.nextScope = 0; this.inputs = {};
    this.el = document.getElementById('gradePanel');
    this.sample = document.createElement('canvas'); this.sample.width = 160; this.sample.height = 90;
    this.sctx = this.sample.getContext('2d', { willReadFrequently: true });
    this.build();
    addEventListener('keydown', (e) => {
      if (e.code === 'F8') { e.preventDefault(); if (!e.repeat) this.toggle(); }
      else if (e.code === 'Escape' && this.open && !this.app.input.locked) this.close();
    });
  }

  $(id) { return document.getElementById(id); }
  get def() { return this.app.match && this.app.match.def; }

  build() {
    const body = this.$('gpBody'); let html = '';
    for (const [title, rows] of GRADE_ROWS) {
      html += `<h4>${title}</h4>`;
      for (const [key, label, min, max, step] of rows) {
        if (Array.isArray(LOOK_DEFAULT[key])) {
          html += `<div class="gpW"><span>${label}</span>` + WHEEL_CH.map((c, i) => `<label class="c${i}">${c}<input type="number" data-k="${key}" data-i="${i}" min="${min}" max="${max}" step="${step}"></label>`).join('') + '</div>';
        } else {
          html += `<div class="gpR"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}"><input type="number" data-k="${key}" min="${min}" max="${max}" step="${step}"></div>`;
        }
      }
    }
    body.innerHTML = html;
    body.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => this.onInput(inp));
      inp.addEventListener('dblclick', () => this.resetKey(inp.dataset.k)); // like Resolve: double-click resets
    });
    this.$('gpClose').onclick = () => this.close();
    this.$('gpSplit').onclick = () => { this.split = !this.split; this.app.post.setSplit(this.split ? 0.5 : 0); this.$('gpSplit').classList.toggle('on', this.split); };
    this.$('gpLutBtn').onclick = () => this.$('gpLut').click();
    this.$('gpLut').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then((t) => this.importLut(t, f.name)); };
    this.$('gpLutClear').onclick = () => { saveUserLut(this.def.id, null); this.app.post.applyLook(this.look, true); this.msg('已移除匯入的 LUT（地圖內建 LUT 若有則保留）'); };
    this.$('gpShot').onclick = () => this.neutralShot();
    this.$('gpCopy').onclick = () => this.copy();
    this.$('gpReset').onclick = () => this.resetAll();
  }

  toggle() { if (this.open) this.close(); else this.show(); }
  show() {
    const a = this.app;
    if (!a.match || !a.match.running || !(a.state === 'playing' || a.state === 'paused')) return;
    this.open = true; this.look = cloneLook(a.post.look || resolveLook(this.def));
    if (a.input.locked) a.input.unlock();
    document.body.classList.add('grading'); this.el.classList.add('on');
    this.$('gpMap').textContent = `${this.def.name} · ${this.def.en}`;
    this.sync(); this.msg('雙擊任一欄位＝重設該項。數值單位與達芬奇一級校色輪相同。');
    a.post.onFrame = () => this.frame();
  }
  close() {
    if (!this.open) return;
    this.open = false; this.el.classList.remove('on'); document.body.classList.remove('grading');
    if (this.split) { this.split = false; this.app.post.setSplit(0); this.$('gpSplit').classList.remove('on'); }
    this.app.post.onFrame = null; Settings.save();
  }

  sync() {
    const L = this.look;
    this.$('gpBody').querySelectorAll('input').forEach((inp) => {
      const k = inp.dataset.k, v = inp.dataset.i !== undefined ? L[k][+inp.dataset.i] : (k === 'exposure' ? L.exposure ?? this.def.exposure : L[k]);
      inp.value = +(+v).toFixed(4);
    });
  }
  onInput(inp) {
    const k = inp.dataset.k, v = parseFloat(inp.value); if (!isFinite(v)) return;
    if (inp.dataset.i !== undefined) this.look[k][+inp.dataset.i] = v; else this.look[k] = v;
    this.$('gpBody').querySelectorAll(`input[data-k="${k}"]`).forEach((o) => { if (o !== inp && o.dataset.i === inp.dataset.i) o.value = inp.value; });
    this.apply();
  }
  resetKey(k) { const base = resolveLook(this.def, false); this.look[k] = Array.isArray(base[k]) ? base[k].slice() : base[k]; this.sync(); this.apply(); }
  resetAll() {
    delete Settings.data.look[this.def.id]; saveUserLut(this.def.id, null); Settings.save();
    this.look = resolveLook(this.def); this.app.post.applyLook(this.look, true); this.sync(); this.msg('已重設為地圖預設調色');
  }
  // Store only what differs from the map preset, so later preset updates still reach untouched keys.
  apply() {
    this.app.post.applyLook(this.look);
    const base = resolveLook(this.def, false), diff = {};
    for (const k of LOOK_KEYS) if (JSON.stringify(this.look[k]) !== JSON.stringify(base[k])) diff[k] = this.look[k];
    if (Object.keys(diff).length) Settings.data.look[this.def.id] = diff; else delete Settings.data.look[this.def.id];
    clearTimeout(this._saveT); this._saveT = setTimeout(() => Settings.save(), 400);
  }

  importLut(text, name) {
    try {
      const lut = parseCube(text); saveUserLut(this.def.id, lut); this.app.post.film && this.app.post.film.setLut(lut);
      this.msg(`已套用 LUT「${name}」（${lut.size}³）。用「LUT 混合」調整強度。`);
    } catch (e) { this.msg('LUT 讀取失敗：' + e.message); }
  }

  // Neutral frame (same exposure, no film grade, no LUT) → PNG for grading in Resolve.
  neutralShot() {
    const p = this.app.post, keep = cloneLook(this.look), neutral = cloneLook(LOOK_DEFAULT);
    neutral.exposure = keep.exposure ?? this.def.exposure; neutral.vig = keep.vig; neutral.grain = 0; neutral.lutMix = 0;
    const split = this.split; p.setSplit(0); p.applyLook(neutral);
    const m = this.app.match, showVM = m.player.alive && m.weapons.current.vm.group.visible;
    p.render(0, showVM); const url = this.app.renderer.domElement.toDataURL('image/png');
    p.applyLook(keep); p.setSplit(split ? 0.5 : 0);
    const a = document.createElement('a'); a.href = url; a.download = `sf2_${this.def.id}_neutral_${Date.now()}.png`; a.click();
    this.msg('已下載未調色截圖。在達芬奇調好後匯出 .cube（17 或 33 點）再按「匯入 .cube」。');
  }

  copy() {
    const d = LOOK_DEFAULT, out = {};
    for (const k of LOOK_KEYS) if (JSON.stringify(this.look[k]) !== JSON.stringify(d[k])) out[k] = this.look[k];
    const txt = `${this.def.id}: look: ${JSON.stringify(out).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`;
    const done = () => this.msg('已複製：' + txt);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => this.msg(txt)); else this.msg(txt);
  }

  msg(t) { this.$('gpMsg').textContent = t; }

  /* ---- scopes: sampled right after the frame is drawn (same task, so no preserveDrawingBuffer needed) ---- */
  frame() {
    const now = performance.now(); if (!this.open || now < this.nextScope) return; this.nextScope = now + 300;
    const W = 160, H = 90, x = this.sctx;
    x.drawImage(this.app.renderer.domElement, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    drawParade(this.$('gpParade'), d, W, H); drawVector(this.$('gpVec'), d);
    const s = scopeStats(d); this.$('gpStats').textContent = `亮度 ${s.meanY} · p50 ${s.p50} · p95 ${s.p95} · 色度 ${s.chroma} · 裁切 ${s.clip}%`;
  }
}

// Luma / chroma statistics (Rec.709 on display values) — the same numbers used to match SF2 screenshots.
function scopeStats(d) {
  const n = d.length / 4, Y = new Float32Array(n); let sc = 0, clip = 0;
  for (let i = 0, k = 0; k < n; i += 4, k++) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    Y[k] = y; sc += Math.hypot((b - y) / 1.8556, (r - y) / 1.5748); if (Math.max(r, g, b) > 0.985) clip++;
  }
  const s = Y.slice().sort(), f = (v) => Math.round(v * 1000) / 1000;
  return { meanY: f(Y.reduce((a, b) => a + b, 0) / n), p50: f(s[Math.floor(n * 0.5)]), p95: f(s[Math.floor(n * 0.95)]), chroma: f(sc / n), clip: f(clip / n * 100) };
}

function drawParade(cv, d, W, H) {
  const c = cv.getContext('2d'), cw = cv.width, ch = cv.height, pw = Math.floor(cw / 3), img = c.createImageData(cw, ch), o = img.data;
  const acc = new Uint16Array(cw * ch);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4, px = Math.floor(i / W * (pw - 2));
    for (let ch3 = 0; ch3 < 3; ch3++) { const y = ch - 1 - Math.round(d[k + ch3] / 255 * (ch - 1)); acc[y * cw + ch3 * pw + px]++; }
  }
  const tint = [[255, 70, 60], [70, 255, 90], [80, 120, 255]];
  for (let p = 0; p < acc.length; p++) {
    const x = p % cw, t = tint[Math.min(2, Math.floor(x / pw))], a = Math.min(1, acc[p] / 6);
    o[p * 4] = t[0] * a; o[p * 4 + 1] = t[1] * a; o[p * 4 + 2] = t[2] * a; o[p * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  c.strokeStyle = 'rgba(255,200,80,.25)'; c.lineWidth = 1;
  for (const v of [0.25, 0.5, 0.75]) { const y = Math.round(ch - 1 - v * (ch - 1)) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(cw, y); c.stroke(); }
}

function drawVector(cv, d) {
  const c = cv.getContext('2d'), S = cv.width, R = S / 2 - 4, cx = S / 2, cy = S / 2;
  c.fillStyle = '#050606'; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(255,200,80,.28)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
  const pos = (r, g, b) => { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [cx + (b - y) / 1.8556 * 2 * R, cy - (r - y) / 1.5748 * 2 * R]; };
  c.fillStyle = 'rgba(255,200,80,.6)'; c.font = '9px Consolas,monospace';
  for (const [n, r, g, b] of [['R', 0.75, 0, 0], ['Y', 0.75, 0.75, 0], ['G', 0, 0.75, 0], ['C', 0, 0.75, 0.75], ['B', 0, 0, 0.75], ['M', 0.75, 0, 0.75]]) { const [x, y] = pos(r, g, b); c.strokeRect(x - 4, y - 4, 8, 8); c.fillText(n, x + 5, y - 5); }
  const sk = pos(0.8, 0.55, 0.42); c.strokeStyle = 'rgba(255,200,80,.18)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + (sk[0] - cx) * 3, cy + (sk[1] - cy) * 3); c.stroke(); // skin-tone line
  c.fillStyle = 'rgba(230,240,235,.16)';
  for (let i = 0; i < d.length; i += 4) { const [x, y] = pos(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); c.fillRect(x, y, 1, 1); }
}

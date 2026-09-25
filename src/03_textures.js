/* =====================================================================
   PBR TEXTURE FACTORY — every surface is generated procedurally as an
   albedo + normal (Sobel from a height field) + roughness set.
   Results are cached across matches.
   ===================================================================== */
class TextureFactory {
  constructor(renderer) {
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.cache = new Map(); this.noiseCache = new Map();
    this.size = 1024;
  }
  setQuality(q) { this.size = q === 'ultra' ? 1024 : 512; } // 512² keeps GPU memory ~4× lower

  _canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
  _tex(canvas, srgb, repeat = true) {
    const t = new THREE.CanvasTexture(canvas);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  }

  // Tileable value-noise fbm, grayscale canvas.
  noise(size, cells, oct, seed) {
    const key = `${size}|${cells}|${oct}|${seed}`;
    if (this.noiseCache.has(key)) return this.noiseCache.get(key);
    const rnd = mulberry32(seed), acc = new Float32Array(size * size);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const n = cells << o, g = new Float32Array(n * n);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * n, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        const y0 = (iy % n) * n, y1 = ((iy + 1) % n) * n;
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * n, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
          const x0 = ix % n, x1 = (ix + 1) % n;
          const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx, b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx;
          acc[y * size + x] += (a + (b - a) * sy) * amp;
        }
      }
      tot += amp; amp *= 0.5;
    }
    const [c, ctx] = this._canvas(size), img = ctx.createImageData(size, size), d = img.data;
    for (let i = 0; i < acc.length; i++) { const v = (acc[i] / tot) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    this.noiseCache.set(key, c);
    return c;
  }

  // Draw tileable noise over a context with a composite mode.
  N(ctx, S, cells, oct, seed, op = 'overlay', alpha = 0.5, nsize = 256) {
    ctx.save(); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.noise(nsize, cells, oct, seed), 0, 0, S, S);
    ctx.restore();
  }
  speckle(ctx, S, amount, prob = 1, rnd = Math.random) {
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (prob < 1 && rnd() > prob) continue;
      const n = (rnd() - 0.5) * amount; d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  blobs(ctx, S, n, color, r0, r1, a, rnd = Math.random) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color.replace('A', (rnd() * a).toFixed(3))); g.addColorStop(1, color.replace('A', '0'));
        ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  crack(ctxs, S, x, y, steps, len, width, rnd) {
    const pts = [[x, y]];
    let a = rnd() * Math.PI * 2;
    for (let k = 0; k < steps; k++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * len; y += Math.sin(a) * len; pts.push([x, y]); }
    for (const [ctx, style, w] of ctxs) {
      ctx.strokeStyle = style; ctx.lineWidth = w * width; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
  }

  heightToNormal(hctx, S, strength) {
    const src = hctx.getImageData(0, 0, S, S).data, h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = src[i * 4] / 255;
    const [c, ctx] = this._canvas(S), img = ctx.createImageData(S, S), d = img.data;
    const k = strength * (S / 256);
    for (let y = 0; y < S; y++) {
      const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, y0 = y * S;
      for (let x = 0; x < S; x++) {
        const xm = (x - 1 + S) % S, xp = (x + 1) % S;
        const dx = (h[y0 + xp] - h[y0 + xm]) * k, dy = (h[yp + x] - h[ym + x]) * k;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y0 + x) * 4;
        d[i] = (-dx * inv * 0.5 + 0.5) * 255; d[i + 1] = (dy * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Build a PBR set: draw(A, H, R, S, rnd) paints albedo, height and roughness canvases.
  pbr(key, draw, o = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const S = o.size || this.size, rnd = mulberry32(o.seed || key.length * 7919 + 17);
    const [ca, A] = this._canvas(S), [ch, H] = this._canvas(S), [cr, R] = this._canvas(S);
    H.fillStyle = '#808080'; H.fillRect(0, 0, S, S);
    R.fillStyle = '#c0c0c0'; R.fillRect(0, 0, S, S);
    draw(A, H, R, S, rnd);
    const set = { map: this._tex(ca, true), normalMap: this._tex(this.heightToNormal(H, S, o.normal ?? 2), false), roughnessMap: this._tex(cr, false) };
    this.cache.set(key, set);
    return set;
  }

  simple(key, S, draw, srgb = true, repeat = false) {
    if (this.cache.has(key)) return this.cache.get(key);
    const [c, ctx] = this._canvas(S); draw(ctx, S);
    const t = this._tex(c, srgb, repeat); this.cache.set(key, t); return t;
  }

  /* ------------------------- surface generators ------------------------- */
  surface(name, arg) {
    const G = this.generators || (this.generators = this._generators());
    const gen = G[name];
    if (!gen) throw new Error('unknown surface ' + name);
    return this.pbr(name + (arg !== undefined ? ':' + arg : ''), (A, H, R, S, rnd) => gen(A, H, R, S, rnd, arg), { normal: gen.normal, seed: gen.seed });
  }

  _generators() {
    const T = this;
    const fill = (ctx, c, S) => { ctx.fillStyle = c; ctx.fillRect(0, 0, S, S); };
    const g = {
      polished(A, H, R, S, rnd) { // warehouse polished concrete
        fill(A, '#77746e', S); T.N(A, S, 3, 5, 11, 'overlay', 0.55); T.N(A, S, 12, 3, 12, 'multiply', 0.18);
        T.blobs(A, S, 16, 'rgba(35,32,28,A)', S * 0.04, S * 0.16, 0.35, rnd);
        T.blobs(A, S, 10, 'rgba(160,156,146,A)', S * 0.05, S * 0.14, 0.2, rnd);
        for (let i = 0; i < 5; i++) T.crack([[A, 'rgba(30,28,25,.45)', 1.2], [H, '#555', 2]], S, rnd() * S, rnd() * S, 9, S * 0.025, S / 1024, rnd);
        for (const ctx of [A, H]) { ctx.strokeStyle = ctx === A ? 'rgba(25,24,22,.7)' : '#3a3a3a'; ctx.lineWidth = S / 300; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(S, 1); ctx.moveTo(1, 0); ctx.lineTo(1, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke(); }
        T.speckle(A, S, 22, 1, rnd); T.N(H, S, 6, 3, 13, 'overlay', 0.2);
        fill(R, '#8a8a8a', S); T.N(R, S, 3, 3, 14, 'overlay', 0.6); T.blobs(R, S, 10, 'rgba(40,40,40,A)', S * 0.08, S * 0.22, 0.35, rnd);
      },
      concrete(A, H, R, S, rnd) {
        fill(A, '#807d77', S); T.N(A, S, 3, 5, 21, 'overlay', 0.6); T.N(A, S, 16, 3, 22, 'multiply', 0.25);
        T.blobs(A, S, 20, 'rgba(40,38,34,A)', S * 0.03, S * 0.14, 0.3, rnd);
        for (let i = 0; i < 6; i++) T.crack([[A, 'rgba(30,30,28,.4)', 1], [H, '#505050', 2]], S, rnd() * S, rnd() * S, 8, S * 0.02, S / 1024, rnd);
        T.speckle(A, S, 30, 1, rnd); T.N(H, S, 32, 3, 23, 'overlay', 0.7); T.speckle(H, S, 40, 0.5, rnd);
        fill(R, '#d8d8d8', S); T.N(R, S, 6, 3, 24, 'overlay', 0.5);
      },
      concreteWall(A, H, R, S, rnd) {
        fill(A, '#8f8c86', S); T.N(A, S, 4, 5, 31, 'overlay', 0.5); T.N(A, S, 20, 2, 32, 'multiply', 0.2);
        for (let x = 0; x < S; x += S / 2) for (let y = 0; y < S; y += S / 4) {
          A.strokeStyle = 'rgba(40,40,38,.45)'; A.lineWidth = 2; A.strokeRect(x, y, S / 2, S / 4);
          H.strokeStyle = '#606060'; H.lineWidth = 3; H.strokeRect(x, y, S / 2, S / 4);
          for (const [tx, ty] of [[0.12, 0.25], [0.88, 0.25], [0.12, 0.75], [0.88, 0.75]]) {
            const cx = x + tx * S / 2, cy = y + ty * S / 4; A.fillStyle = 'rgba(30,30,30,.55)'; A.beginPath(); A.arc(cx, cy, S / 180, 0, 7); A.fill();
            H.fillStyle = '#303030'; H.beginPath(); H.arc(cx, cy, S / 160, 0, 7); H.fill();
          }
        }
        for (let i = 0; i < 26; i++) { const x = rnd() * S, gr = A.createLinearGradient(0, 0, 0, S * rand(0.2, 0.6)); gr.addColorStop(0, 'rgba(50,45,40,.35)'); gr.addColorStop(1, 'rgba(50,45,40,0)'); A.fillStyle = gr; A.fillRect(x, 0, rnd() * 6 + 2, S); }
        T.speckle(A, S, 20, 1, rnd); T.N(H, S, 24, 3, 33, 'overlay', 0.6);
        fill(R, '#d0d0d0', S); T.N(R, S, 8, 3, 34, 'overlay', 0.4);
      },
      siding(A, H, R, S, rnd, color = '#6f7a80') { // corrugated painted metal wall
        fill(A, color, S); T.N(A, S, 3, 4, 41, 'overlay', 0.4);
        const n = 8, w = S / n;
        for (let i = 0; i < n; i++) {
          const gr = H.createLinearGradient(i * w, 0, (i + 1) * w, 0);
          gr.addColorStop(0, '#404040'); gr.addColorStop(0.25, '#d0d0d0'); gr.addColorStop(0.5, '#d0d0d0'); gr.addColorStop(0.75, '#404040'); gr.addColorStop(1, '#404040');
          H.fillStyle = gr; H.fillRect(i * w, 0, w, S);
          const ga = A.createLinearGradient(i * w, 0, (i + 1) * w, 0);
          ga.addColorStop(0, 'rgba(0,0,0,.18)'); ga.addColorStop(0.35, 'rgba(255,255,255,.07)'); ga.addColorStop(0.7, 'rgba(0,0,0,.12)'); ga.addColorStop(1, 'rgba(0,0,0,.18)');
          A.fillStyle = ga; A.fillRect(i * w, 0, w, S);
        }
        for (let i = 0; i < 40; i++) { const x = rnd() * S, l = rand(0.1, 0.5) * S, gr = A.createLinearGradient(0, S - l, 0, S); gr.addColorStop(0, 'rgba(110,55,20,0)'); gr.addColorStop(1, 'rgba(110,55,20,.5)'); A.fillStyle = gr; A.fillRect(x, S - l, rand(2, 7), l); }
        T.blobs(A, S, 10, 'rgba(95,50,22,A)', S * 0.01, S * 0.05, 0.6, rnd); T.speckle(A, S, 14, 1, rnd);
        fill(R, '#8a8a8a', S); T.N(R, S, 5, 4, 42, 'overlay', 0.6);
      },
      container(A, H, R, S, rnd, color = '#8e3b2c') {
        fill(A, color, S); T.N(A, S, 3, 5, 51 + color.length, 'overlay', 0.45);
        const n = 10, w = S / n;
        for (let i = 0; i < n; i++) {
          H.fillStyle = '#4a4a4a'; H.fillRect(i * w, 0, w, S);
          H.fillStyle = '#c8c8c8'; H.fillRect(i * w + w * 0.18, 0, w * 0.5, S);
          const ga = A.createLinearGradient(i * w, 0, (i + 1) * w, 0);
          ga.addColorStop(0, 'rgba(0,0,0,.25)'); ga.addColorStop(0.18, 'rgba(255,255,255,.1)'); ga.addColorStop(0.68, 'rgba(255,255,255,.04)'); ga.addColorStop(0.8, 'rgba(0,0,0,.28)'); ga.addColorStop(1, 'rgba(0,0,0,.2)');
          A.fillStyle = ga; A.fillRect(i * w, 0, w, S);
        }
        for (const ctx of [A, H]) { ctx.fillStyle = ctx === A ? 'rgba(20,20,20,.55)' : '#e0e0e0'; ctx.fillRect(0, 0, S, S * 0.035); ctx.fillRect(0, S * 0.965, S, S * 0.035); }
        for (let i = 0; i < 50; i++) { const x = rnd() * S, l = rand(0.05, 0.45) * S, gr = A.createLinearGradient(0, S * 0.04, 0, S * 0.04 + l); gr.addColorStop(0, 'rgba(90,40,15,.55)'); gr.addColorStop(1, 'rgba(90,40,15,0)'); A.fillStyle = gr; A.fillRect(x, S * 0.04, rand(1, 5), l); }
        T.blobs(A, S, 18, 'rgba(85,42,18,A)', S * 0.006, S * 0.04, 0.8, rnd);
        T.blobs(R, S, 18, 'rgba(255,255,255,A)', S * 0.01, S * 0.05, 0.6, rnd);
        A.save(); A.globalAlpha = 0.55; A.fillStyle = '#e9e6dc'; A.font = `bold ${S * 0.06}px Arial`; A.fillText('SFXU ' + (1000 + Math.floor(rnd() * 8999)) + ' 2', S * 0.06, S * 0.14);
        A.font = `${S * 0.03}px Arial`; A.fillText('MAX GR 30480 KG · TARE 2200 KG', S * 0.06, S * 0.19); A.restore();
        T.speckle(A, S, 14, 1, rnd);
        fill(R, '#8c8c8c', S); T.N(R, S, 5, 4, 52, 'overlay', 0.6);
      },
      plate(A, H, R, S, rnd) { // diamond tread plate
        fill(A, '#6b7075', S); T.N(A, S, 3, 4, 61, 'overlay', 0.5); T.blobs(A, S, 12, 'rgba(25,25,25,A)', S * 0.04, S * 0.15, 0.4, rnd);
        const step = S / 16;
        for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) {
          const ox = ((y / step) % 2) * step / 2;
          for (const [cx, cy, rot] of [[x + ox + step * 0.25, y + step * 0.25, 0.7], [x + ox + step * 0.75, y + step * 0.75, -0.7]]) {
            for (const ctx of [A, H]) {
              ctx.save(); ctx.translate(cx % S, cy % S); ctx.rotate(rot);
              ctx.fillStyle = ctx === A ? 'rgba(210,215,220,.35)' : '#f0f0f0'; ctx.beginPath(); ctx.ellipse(0, 0, step * 0.26, step * 0.06, 0, 0, 7); ctx.fill(); ctx.restore();
            }
          }
        }
        T.speckle(A, S, 12, 1, rnd); fill(R, '#707070', S); T.N(R, S, 4, 4, 62, 'overlay', 0.7);
      },
      wood(A, H, R, S, rnd) {
        fill(A, '#9a7447', S);
        const pl = S / 8;
        for (let y = 0; y < S; y += pl) {
          A.fillStyle = `rgba(${randInt(0, 50)},${randInt(0, 25)},0,${rand(0.05, 0.22).toFixed(2)})`; A.fillRect(0, y, S, pl);
          for (let k = 0; k < 14; k++) { const gy = y + rnd() * pl; A.strokeStyle = 'rgba(60,38,15,.22)'; A.lineWidth = rand(0.6, 1.6); A.beginPath(); A.moveTo(0, gy); A.bezierCurveTo(S * 0.3, gy + rand(-4, 4), S * 0.7, gy + rand(-4, 4), S, gy); A.stroke(); }
          for (const ctx of [A, H]) { ctx.fillStyle = ctx === A ? 'rgba(40,24,8,.6)' : '#404040'; ctx.fillRect(0, y, S, S / 256); }
          for (let k = 0; k < 3; k++) { const nx = rnd() * S, ny = y + pl * 0.5; A.fillStyle = 'rgba(30,20,10,.8)'; A.beginPath(); A.arc(nx, ny, S / 256, 0, 7); A.fill(); }
        }
        T.N(H, S, 64, 2, 71, 'overlay', 0.4); T.speckle(A, S, 16, 1, rnd);
        fill(R, '#d4d4d4', S); T.N(R, S, 8, 3, 72, 'overlay', 0.4);
      },
      roof(A, H, R, S, rnd) {
        fill(A, '#3b3f43', S);
        for (let x = 0; x < S; x += S / 16) { A.fillStyle = 'rgba(0,0,0,.25)'; A.fillRect(x, 0, S / 32, S); H.fillStyle = '#b0b0b0'; H.fillRect(x, 0, S / 32, S); }
        T.N(A, S, 3, 4, 81, 'overlay', 0.4); fill(R, '#9a9a9a', S);
      },
      asphalt(A, H, R, S, rnd) {
        fill(A, '#3c3d3f', S); T.N(A, S, 4, 5, 91, 'overlay', 0.5); T.speckle(A, S, 55, 1, rnd);
        T.blobs(A, S, 12, 'rgba(10,10,12,A)', S * 0.03, S * 0.12, 0.5, rnd);
        for (let i = 0; i < 6; i++) T.crack([[A, 'rgba(15,15,15,.6)', 1.5], [H, '#404040', 2.5]], S, rnd() * S, rnd() * S, 10, S * 0.03, S / 1024, rnd);
        T.speckle(H, S, 60, 0.5, rnd); fill(R, '#e6e6e6', S); T.N(R, S, 6, 3, 92, 'overlay', 0.25);
      },
      sand(A, H, R, S, rnd) {
        fill(A, '#c7a676', S); T.N(A, S, 3, 5, 101, 'overlay', 0.5); T.N(A, S, 24, 2, 102, 'multiply', 0.12); T.speckle(A, S, 26, 1, rnd);
        for (let y = 0; y < S; y += S / 40) { H.strokeStyle = 'rgba(200,200,200,.35)'; H.lineWidth = S / 180; H.beginPath(); H.moveTo(0, y); for (let x = 0; x <= S; x += S / 16) H.lineTo(x, y + Math.sin(x / S * Math.PI * 6 + y) * S * 0.006); H.stroke(); }
        for (let i = 0; i < 120; i++) { const x = rnd() * S, y = rnd() * S, r = rand(1, 3) * S / 1024; A.fillStyle = `rgba(${randInt(90, 140)},${randInt(80, 110)},${randInt(60, 90)},.8)`; A.beginPath(); A.arc(x, y, r, 0, 7); A.fill(); H.fillStyle = '#e8e8e8'; H.beginPath(); H.arc(x, y, r, 0, 7); H.fill(); }
        T.speckle(H, S, 50, 0.8, rnd); fill(R, '#f0f0f0', S);
      },
      plaster(A, H, R, S, rnd) {
        fill(A, '#cdb28a', S); T.N(A, S, 3, 5, 111, 'overlay', 0.55); T.N(A, S, 12, 3, 112, 'multiply', 0.2);
        const gr = A.createLinearGradient(0, S * 0.65, 0, S); gr.addColorStop(0, 'rgba(90,70,45,0)'); gr.addColorStop(1, 'rgba(90,70,45,.45)'); A.fillStyle = gr; A.fillRect(0, 0, S, S);
        for (let i = 0; i < 4; i++) { // exposed brick patches
          const x = rnd() * S * 0.8, y = rnd() * S * 0.8, w = rand(0.08, 0.2) * S, h = rand(0.05, 0.12) * S;
          for (let by = y; by < y + h; by += S / 60) for (let bx = x + ((by / (S / 60)) % 2) * S / 60; bx < x + w; bx += S / 30) {
            A.fillStyle = `rgb(${randInt(130, 160)},${randInt(80, 100)},${randInt(55, 70)})`; A.fillRect(bx, by, S / 32, S / 64);
            H.fillStyle = '#5a5a5a'; H.fillRect(bx, by, S / 32, S / 64);
          }
        }
        for (let i = 0; i < 6; i++) T.crack([[A, 'rgba(70,55,35,.5)', 1], [H, '#555', 2]], S, rnd() * S, rnd() * S, 8, S * 0.02, S / 1024, rnd);
        T.N(H, S, 48, 3, 113, 'overlay', 0.8); T.speckle(H, S, 60, 0.6, rnd); T.speckle(A, S, 16, 1, rnd);
        fill(R, '#ececec', S);
      },
      pavers(A, H, R, S, rnd) {
        fill(A, '#8f8578', S); fill(H, '#b0b0b0', S);
        const n = 8, w = S / n;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const ox = (y % 2) * w / 2, px = x * w + ox, py = y * w / 2 * 2;
          const v = randInt(128, 172); A.fillStyle = `rgb(${v},${v - 9},${v - 26})`;
          for (const dx of [0, -S]) { A.fillRect(px + dx + 2, py + 2, w - 4, w - 4); }
          H.fillStyle = '#d0d0d0'; for (const dx of [0, -S]) H.fillRect(px + dx + 3, py + 3, w - 6, w - 6);
        }
        T.N(A, S, 6, 4, 121, 'overlay', 0.45); T.speckle(A, S, 20, 1, rnd); T.N(H, S, 30, 2, 122, 'overlay', 0.4);
        fill(R, '#d6d6d6', S); T.N(R, S, 6, 3, 123, 'overlay', 0.4);
      },
      snow(A, H, R, S, rnd) {
        fill(A, '#e9eef4', S); T.N(A, S, 3, 5, 131, 'overlay', 0.18); T.N(A, S, 8, 3, 132, 'multiply', 0.06);
        T.N(H, S, 4, 5, 133, 'source-over', 0.9); T.N(H, S, 24, 3, 134, 'overlay', 0.5);
        fill(R, '#b8b8b8', S); T.speckle(R, S, 120, 0.25, rnd);
      },
      carpet(A, H, R, S, rnd) {
        fill(A, '#4d5663', S); T.N(A, S, 4, 4, 141, 'overlay', 0.3); T.speckle(A, S, 36, 1, rnd);
        for (const ctx of [A, H]) { ctx.strokeStyle = ctx === A ? 'rgba(20,24,30,.5)' : '#606060'; ctx.lineWidth = S / 400; for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * S / 4, 0); ctx.lineTo(i * S / 4, S); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke(); } }
        T.speckle(H, S, 90, 1, rnd); fill(R, '#fafafa', S);
      },
      officeWall(A, H, R, S, rnd) {
        fill(A, '#cfd0ca', S); T.N(A, S, 3, 4, 151, 'overlay', 0.18); T.N(H, S, 40, 2, 152, 'overlay', 0.25);
        const gr = A.createLinearGradient(0, S * 0.8, 0, S); gr.addColorStop(0, 'rgba(60,60,55,0)'); gr.addColorStop(1, 'rgba(60,60,55,.18)'); A.fillStyle = gr; A.fillRect(0, 0, S, S);
        fill(R, '#b4b4b4', S);
      },
      ceiling(A, H, R, S, rnd) {
        fill(A, '#d8d8d2', S); T.speckle(A, S, 18, 1, rnd);
        for (const ctx of [A, H]) { ctx.strokeStyle = ctx === A ? '#9a9a94' : '#404040'; ctx.lineWidth = S / 120; for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * S / 2, 0); ctx.lineTo(i * S / 2, S); ctx.moveTo(0, i * S / 2); ctx.lineTo(S, i * S / 2); ctx.stroke(); } }
        T.speckle(H, S, 70, 0.3, rnd); fill(R, '#f0f0f0', S);
      },
      tileFloor(A, H, R, S, rnd) {
        fill(A, '#a9a59c', S); fill(H, '#c0c0c0', S);
        const n = 4, w = S / n;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = randInt(150, 182); A.fillStyle = `rgb(${v},${v - 3},${v - 10})`; A.fillRect(x * w + 2, y * w + 2, w - 4, w - 4); }
        for (let i = 0; i <= n; i++) for (const ctx of [A, H]) { ctx.fillStyle = ctx === A ? '#5f5c56' : '#404040'; ctx.fillRect(i * w - 2, 0, 4, S); ctx.fillRect(0, i * w - 2, S, 4); }
        T.N(A, S, 8, 4, 161, 'overlay', 0.35); fill(R, '#3a3a3a', S); T.N(R, S, 4, 3, 162, 'overlay', 0.5);
      },
      sandbag(A, H, R, S, rnd) {
        fill(A, '#9c8a62', S); T.N(A, S, 3, 4, 171, 'overlay', 0.5);
        for (let i = 0; i < S; i += 4) { A.fillStyle = 'rgba(0,0,0,.07)'; A.fillRect(i, 0, 1, S); A.fillRect(0, i, S, 1); H.fillStyle = 'rgba(0,0,0,.25)'; H.fillRect(i, 0, 2, S); H.fillRect(0, i + 2, S, 2); }
        T.blobs(A, S, 10, 'rgba(60,50,30,A)', S * 0.05, S * 0.2, 0.4, rnd); fill(R, '#f4f4f4', S);
      },
      fabric(A, H, R, S, rnd) { // white base, tinted by vertex colors
        fill(A, '#ffffff', S); T.N(A, S, 6, 4, 181, 'multiply', 0.35);
        for (let i = 0; i < S; i += 3) { H.fillStyle = 'rgba(0,0,0,.18)'; H.fillRect(i, 0, 1, S); H.fillRect(0, (i + 1) % S, S, 1); }
        T.N(H, S, 16, 3, 182, 'overlay', 0.4); fill(R, '#e6e6e6', S);
      },
      gunWear(A, H, R, S, rnd) { // micro scratches for guns (albedo is multiplied by material color)
        fill(A, '#ffffff', S); T.N(A, S, 8, 4, 191, 'multiply', 0.12);
        fill(R, '#8a8a8a', S); T.N(R, S, 6, 4, 192, 'overlay', 0.5);
        for (let i = 0; i < 260; i++) {
          const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = rand(4, 40) * S / 512;
          R.strokeStyle = `rgba(${rnd() > 0.5 ? '40,40,40' : '220,220,220'},${rand(0.2, 0.6).toFixed(2)})`; R.lineWidth = 0.7;
          R.beginPath(); R.moveTo(x, y); R.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); R.stroke();
          H.strokeStyle = 'rgba(0,0,0,.2)'; H.beginPath(); H.moveTo(x, y); H.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); H.stroke();
        }
        T.N(H, S, 64, 2, 193, 'overlay', 0.2);
      },
      rust(A, H, R, S, rnd) {
        fill(A, '#6d4a33', S); T.N(A, S, 4, 5, 201, 'overlay', 0.7); T.blobs(A, S, 30, 'rgba(140,70,25,A)', S * 0.02, S * 0.1, 0.6, rnd);
        T.blobs(A, S, 16, 'rgba(70,80,85,A)', S * 0.05, S * 0.18, 0.55, rnd); T.speckle(A, S, 30, 1, rnd);
        T.N(H, S, 20, 4, 202, 'overlay', 0.8); fill(R, '#d0d0d0', S); T.blobs(R, S, 14, 'rgba(90,90,90,A)', S * 0.05, S * 0.16, 0.7, rnd);
      },
      brick(A, H, R, S, rnd) {
        fill(A, '#6e6660', S); fill(H, '#404040', S);
        const bh = S / 16, bw = S / 4;
        for (let r = 0; r < 16; r++) for (let c = -1; c < 5; c++) {
          const x = c * bw + (r % 2) * bw / 2, y = r * bh;
          A.fillStyle = `rgb(${randInt(120, 160)},${randInt(55, 75)},${randInt(40, 55)})`; A.fillRect(x + 2, y + 2, bw - 4, bh - 4);
          H.fillStyle = '#c8c8c8'; H.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        }
        T.N(A, S, 6, 4, 211, 'overlay', 0.4); T.speckle(A, S, 24, 1, rnd); T.N(H, S, 40, 2, 212, 'overlay', 0.4);
        fill(R, '#e0e0e0', S);
      },
      metal(A, H, R, S, rnd) { // brushed / painted steel (tintable)
        fill(A, '#ffffff', S); T.N(A, S, 4, 4, 221, 'multiply', 0.2);
        for (let y = 0; y < S; y++) { if (rnd() < 0.3) { R.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},.05)`; R.fillRect(0, y, S, 1); } }
        fill(R, 'rgba(120,120,120,.6)', S); T.N(R, S, 6, 4, 222, 'overlay', 0.5); T.blobs(A, S, 8, 'rgba(60,50,40,A)', S * 0.05, S * 0.2, 0.3, rnd);
      },
      grass(A, H, R, S, rnd) { // meadow grass with dry patches and blades
        fill(A, '#56662f', S); T.N(A, S, 3, 5, 401, 'overlay', 0.6); T.N(A, S, 12, 3, 402, 'multiply', 0.22);
        T.blobs(A, S, 14, 'rgba(110,92,52,A)', S * 0.04, S * 0.13, 0.5, rnd); T.blobs(A, S, 10, 'rgba(130,150,62,A)', S * 0.05, S * 0.16, 0.35, rnd);
        T.N(H, S, 10, 4, 403, 'overlay', 0.7);
        const n = Math.round(S * S / 90), k = S / 1024;
        for (let i = 0; i < n; i++) {
          const x = rnd() * S, y = rnd() * S, len = (3 + rnd() * 8) * k * 1.6, a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
          A.strokeStyle = `rgb(${50 + rnd() * 60 | 0},${72 + rnd() * 62 | 0},${24 + rnd() * 26 | 0})`; A.lineWidth = Math.max(1, 1.4 * k); A.beginPath(); A.moveTo(x, y); A.lineTo(ex, ey); A.stroke();
          if (i % 2 === 0) { H.strokeStyle = `rgba(230,230,230,${0.35 + rnd() * 0.4})`; H.lineWidth = Math.max(1, 1.2 * k); H.beginPath(); H.moveTo(x, y); H.lineTo(ex, ey); H.stroke(); }
        }
        fill(R, '#ececec', S);
      },
      dirt(A, H, R, S, rnd) { // packed trail dirt with pebbles
        fill(A, '#7a6446', S); T.N(A, S, 3, 5, 411, 'overlay', 0.55); T.N(A, S, 16, 3, 412, 'multiply', 0.2); T.speckle(A, S, 22, 1, rnd);
        T.blobs(A, S, 10, 'rgba(60,48,32,A)', S * 0.03, S * 0.1, 0.4, rnd);
        for (let i = 0; i < 260; i++) { const x = rnd() * S, y = rnd() * S, r = (1.5 + rnd() * 4) * S / 1024, v = 90 + rnd() * 70 | 0; A.fillStyle = `rgb(${v},${v - 8},${v - 22})`; A.beginPath(); A.arc(x, y, r, 0, 7); A.fill(); H.fillStyle = '#e0e0e0'; H.beginPath(); H.arc(x, y, r, 0, 7); H.fill(); }
        for (let i = 0; i < 4; i++) T.crack([[A, 'rgba(40,30,20,.4)', 1], [H, '#505050', 2]], S, rnd() * S, rnd() * S, 8, S * 0.03, S / 1024, rnd);
        T.N(H, S, 20, 3, 413, 'overlay', 0.6); fill(R, '#f2f2f2', S);
      },
      rock(A, H, R, S, rnd) { // weathered cliff rock: strata, cracks, lichen
        fill(A, '#7b766c', S); T.N(A, S, 2, 5, 421, 'overlay', 0.7); T.N(A, S, 8, 4, 422, 'multiply', 0.3);
        fill(H, '#7a7a7a', S); T.N(H, S, 2, 6, 423, 'overlay', 0.95); T.N(H, S, 9, 4, 424, 'overlay', 0.6);
        for (let y = 0; y < S; y += S / (7 + rnd() * 3)) { // horizontal strata
          const pts = []; for (let x = 0; x <= S; x += S / 12) pts.push([x, y + (rnd() - 0.5) * S * 0.04]);
          for (const [ctx, st, w] of [[A, 'rgba(45,42,38,.45)', 2.2], [H, '#3c3c3c', 4]]) { ctx.strokeStyle = st; ctx.lineWidth = w * S / 1024; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        }
        for (let i = 0; i < 12; i++) T.crack([[A, 'rgba(30,28,25,.5)', 1.4], [H, '#2e2e2e', 3]], S, rnd() * S, rnd() * S, 7, S * 0.035, S / 1024, rnd);
        T.blobs(A, S, 12, 'rgba(118,126,72,A)', S * 0.02, S * 0.08, 0.45, rnd); T.blobs(A, S, 8, 'rgba(160,150,130,A)', S * 0.05, S * 0.15, 0.25, rnd);
        T.speckle(A, S, 26, 1, rnd); fill(R, '#dcdcdc', S); T.N(R, S, 6, 3, 425, 'overlay', 0.4);
      },
      ruinStone(A, H, R, S, rnd, base = '#b8a47f') { // ancient sandstone ashlar blocks
        fill(A, '#6c604c', S); fill(H, '#303030', S);
        const rows = 6, rh = S / rows;
        for (let r = 0; r < rows; r++) {
          let x = -rnd() * S * 0.2;
          while (x < S) {
            const w = S * (0.2 + rnd() * 0.24), c = new THREE.Color(base).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.12);
            const g = 3 * S / 1024;
            for (const ox of [0, S, -S]) { A.fillStyle = '#' + c.getHexString(); A.fillRect(x + ox + g, r * rh + g, w - g * 2, rh - g * 2); H.fillStyle = `rgb(${190 + rnd() * 40 | 0},${190},${190})`; H.fillRect(x + ox + g * 2, r * rh + g * 2, w - g * 4, rh - g * 4); }
            if (rnd() < 0.22) { // chipped block corner (weathered, not a hole)
              const cx = x + (rnd() < 0.5 ? g * 3 : w - g * 3), cy = r * rh + (rnd() < 0.5 ? g * 3 : rh - g * 3), cr = rh * (0.06 + rnd() * 0.08);
              A.fillStyle = 'rgba(95,82,62,.45)'; A.beginPath(); A.ellipse(cx, cy, cr * 1.6, cr, rnd() * 3, 0, 7); A.fill();
              H.fillStyle = 'rgba(90,90,90,.7)'; H.beginPath(); H.ellipse(cx, cy, cr * 1.6, cr, 0, 0, 7); H.fill();
            }
            x += w;
          }
        }
        T.N(A, S, 4, 5, 431, 'overlay', 0.5); T.N(A, S, 18, 3, 432, 'multiply', 0.2); T.N(H, S, 16, 4, 433, 'overlay', 0.55);
        T.blobs(A, S, 10, 'rgba(70,84,40,A)', S * 0.02, S * 0.07, 0.4, rnd);
        const gr = A.createLinearGradient(0, S * 0.7, 0, S); gr.addColorStop(0, 'rgba(60,50,35,0)'); gr.addColorStop(1, 'rgba(60,50,35,.35)'); A.fillStyle = gr; A.fillRect(0, 0, S, S);
        T.speckle(A, S, 18, 1, rnd); fill(R, '#e6e6e6', S); T.N(R, S, 8, 3, 434, 'overlay', 0.35);
      },
    };
    g.grass.normal = 2.2; g.dirt.normal = 2.6; g.rock.normal = 4.5; g.ruinStone.normal = 3.4;
    g.polished.normal = 0.6; g.concrete.normal = 2.2; g.concreteWall.normal = 2; g.siding.normal = 2.2; g.container.normal = 4; g.plate.normal = 4;
    g.wood.normal = 2.5; g.roof.normal = 3; g.asphalt.normal = 2.5; g.sand.normal = 2.5; g.plaster.normal = 3; g.pavers.normal = 3.5;
    g.snow.normal = 1.8; g.carpet.normal = 1.5; g.officeWall.normal = 0.6; g.ceiling.normal = 1.5; g.tileFloor.normal = 2; g.sandbag.normal = 3;
    g.fabric.normal = 1.6; g.gunWear.normal = 0.8; g.rust.normal = 3; g.brick.normal = 4; g.metal.normal = 0.8;
    return g;
  }

  /* ------------------------------ decals & sprites ------------------------------ */
  bulletHole(kind) {
    return this.simple('hole:' + kind, 64, (ctx, S) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      if (kind === 'metal') { g.addColorStop(0, 'rgba(10,10,10,1)'); g.addColorStop(0.18, 'rgba(30,30,32,1)'); g.addColorStop(0.3, 'rgba(190,190,195,.8)'); g.addColorStop(0.45, 'rgba(60,60,60,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      else if (kind === 'wood') { g.addColorStop(0, 'rgba(15,8,2,1)'); g.addColorStop(0.25, 'rgba(60,35,12,.95)'); g.addColorStop(0.5, 'rgba(200,160,110,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      else if (kind === 'glass') { g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.15, 'rgba(200,220,230,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.22, 'rgba(15,15,15,.95)'); g.addColorStop(0.36, 'rgba(45,42,38,.7)'); g.addColorStop(0.7, 'rgba(60,55,50,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      if (kind === 'glass') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { const a = Math.random() * 7; ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); ctx.stroke(); } }
    });
  }
  scorch() { return this.simple('scorch', 256, (ctx, S) => { const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 126); g.addColorStop(0, 'rgba(8,6,5,.95)'); g.addColorStop(0.4, 'rgba(20,16,12,.75)'); g.addColorStop(0.75, 'rgba(30,25,20,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { ctx.strokeStyle = 'rgba(10,8,6,.35)'; ctx.lineWidth = 2; const a = Math.random() * 7; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.cos(a) * rand(60, 125), 128 + Math.sin(a) * rand(60, 125)); ctx.stroke(); } }); }
  puddle() { return this.simple('puddle', 256, (ctx, S) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); const img = this.noise(256, 3, 4, 991); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, S, S); for (let i = 0; i < d.data.length; i += 4) { const x = (i / 4) % S, y = Math.floor(i / 4 / S), r = Math.hypot(x - 128, y - 128) / 128; const v = d.data[i] / 255 - r * 0.7; const a = clamp((v - 0.12) * 6, 0, 1); d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a * 255; } ctx.putImageData(d, 0, 0); }, false); }
  grime() { return this.simple('grime', 256, (ctx, S) => { const img = this.noise(256, 4, 5, 881); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, S, S); for (let i = 0; i < d.data.length; i += 4) { const x = (i / 4) % S, y = Math.floor(i / 4 / S), r = Math.hypot(x - 128, y - 128) / 128; const a = clamp((d.data[i] / 255 - 0.35 - r * 0.5) * 2.5, 0, 0.8); d.data[i] = 30; d.data[i + 1] = 26; d.data[i + 2] = 20; d.data[i + 3] = a * 255; } ctx.putImageData(d, 0, 0); }); }
  flash() { return this.simple('flash', 128, (ctx, S) => { ctx.translate(64, 64); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 7; i++) { ctx.save(); ctx.rotate((i / 7) * Math.PI * 2 + rand(-0.2, 0.2)); const len = rand(40, 62), g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.4, 'rgba(255,170,60,.7)'); g.addColorStop(1, 'rgba(255,100,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(len, 0); ctx.lineTo(0, 6); ctx.fill(); ctx.restore(); } const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 34); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.3, 'rgba(255,210,120,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill(); }); }
  dot() { return this.simple('dot', 32, (ctx, S) => { const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); }); }
  smoke() {
    return this.simple('smoke', 128, (ctx, S) => {
      const n = this.noise(128, 4, 4, 771); ctx.drawImage(n, 0, 0);
      const d = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < d.data.length; i += 4) { const x = (i / 4) % S, y = Math.floor(i / 4 / S), r = Math.hypot(x - 64, y - 64) / 64; const a = clamp((1 - r) * 1.6, 0, 1) * clamp(d.data[i] / 255 * 1.4, 0, 1); d.data[i] = d.data[i + 1] = d.data[i + 2] = 235; d.data[i + 3] = a * 255; }
      ctx.putImageData(d, 0, 0);
    });
  }
  fire() { return this.simple('fire', 128, (ctx, S) => { const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,190,80,.95)'); g.addColorStop(0.55, 'rgba(230,90,20,.6)'); g.addColorStop(1, 'rgba(120,30,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); }); }
  reticle() { // holographic sight reticle: 65 MOA ring + 1 MOA dot
    return this.simple('reticle', 256, (ctx, S) => {
      ctx.clearRect(0, 0, S, S); ctx.shadowColor = 'rgba(255,60,40,1)'; ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,70,50,1)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(128, 128, 104, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,80,60,1)'; for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.save(); ctx.translate(128, 128); ctx.rotate(a); ctx.fillRect(-3, -122, 6, 20); ctx.restore(); }
      ctx.beginPath(); ctx.arc(128, 128, 7, 0, 7); ctx.fill();
    });
  }
  letter(ch, color) {
    return this.simple('letter:' + ch, 256, (ctx, S) => {
      ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.strokeRect(14, 14, S - 28, S - 28);
      ctx.fillStyle = color; ctx.font = 'bold 190px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, S / 2, S / 2 + 8);
      const img = ctx.getImageData(0, 0, S, S), d = img.data; for (let i = 3; i < d.length; i += 4) if (Math.random() < 0.28) d[i] *= Math.random() * 0.5; ctx.putImageData(img, 0, 0);
    });
  }
  sign(text, color, bg = 'rgba(15,18,20,.9)') {
    return this.simple('sign:' + text + color, 512, (ctx) => {
      const c = ctx.canvas; c.width = 1024; c.height = 256;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256); ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.strokeRect(14, 14, 996, 228);
      ctx.fillStyle = color; ctx.font = 'bold 130px Arial, "Microsoft JhengHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 136);
    });
  }
  suppressorText() {
    return this.simple('supText', 512, (ctx) => {
      const c = ctx.canvas; c.width = 512; c.height = 128;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#9a9a9a'; ctx.font = 'bold 30px Arial'; ctx.fillText('SF-2 TACTICAL  ·  5.56 NATO  ·  SUPPRESSOR', 18, 76);
    }, true, true);
  }
}

/* =====================================================================
   MATERIAL LIBRARY — MeshPhysicalMaterial presets (cached).
   tile = metres covered by one texture repeat (drives world UVs).
   ===================================================================== */
const MAT_PRESETS = {
  polished:     { s: 'polished', rough: 0.82, metal: 0, tile: 6, clearcoat: 0.06, clearcoatRoughness: 0.5, env: 0.6 }, // v17: matte sealed concrete (was a wet-looking clearcoat)
  concrete:     { s: 'concrete', rough: 1, metal: 0, tile: 4 },
  concreteWall: { s: 'concreteWall', rough: 1, metal: 0, tile: 4 },
  siding:       { s: 'siding', arg: '#6b7276', rough: 0.75, metal: 0.2, tile: 3.5 },
  sidingTan:    { s: 'siding', arg: '#90846f', rough: 0.75, metal: 0.2, tile: 3.5 },
  plate:        { s: 'plate', rough: 0.65, metal: 0.85, tile: 1.6, env: 1.1 },
  wood:         { s: 'wood', rough: 1, metal: 0, tile: 1.3 },
  roof:         { s: 'roof', rough: 0.8, metal: 0.25, tile: 4, side: THREE.DoubleSide },
  asphalt:      { s: 'asphalt', rough: 1, metal: 0, tile: 5 },
  sand:         { s: 'sand', rough: 1, metal: 0, tile: 4 },
  plaster:      { s: 'plaster', rough: 1, metal: 0, tile: 3.5 },
  plasterRed:   { s: 'plaster', rough: 1, metal: 0, tile: 3.5, color: 0xd99a80 },
  plasterWhite: { s: 'plaster', rough: 1, metal: 0, tile: 3.5, color: 0xf2eee6 },
  pavers:       { s: 'pavers', rough: 1, metal: 0, tile: 3 },
  snow:         { s: 'snow', rough: 0.85, metal: 0, tile: 5, sheen: 0.3 },
  carpet:       { s: 'carpet', rough: 1, metal: 0, tile: 2 },
  officeWall:   { s: 'officeWall', rough: 0.9, metal: 0, tile: 3, color: 0xcbc9c2 },
  ceiling:      { s: 'ceiling', rough: 1, metal: 0, tile: 1.2 },
  tileFloor:    { s: 'tileFloor', rough: 0.6, metal: 0, tile: 2.4, clearcoat: 0.2, clearcoatRoughness: 0.3, color: 0xd8d6d0 },
  sandbag:      { s: 'sandbag', rough: 1, metal: 0, tile: 1 },
  rust:         { s: 'rust', rough: 1, metal: 0.25, tile: 2 },
  brick:        { s: 'brick', rough: 1, metal: 0, tile: 2.5 },
  steel:        { s: 'metal', rough: 0.55, metal: 0.85, tile: 2, color: 0x5a6068, env: 1.1 },
  darkSteel:    { s: 'metal', rough: 0.58, metal: 0.3, tile: 2, color: 0x363a3e }, // v17: painted dark steel (a 0x2a2e33 metal has F0 ≈ 0.02 → rendered pitch black)
  yellowSteel:  { s: 'metal', rough: 0.6, metal: 0.2, tile: 2, color: 0xa68f45 }, // painted safety yellow: paint is a dielectric
  whiteSteel:   { s: 'metal', rough: 0.55, metal: 0.2, tile: 2, color: 0xcfd0cf },
  barrelBlue:   { s: 'metal', rough: 0.6, metal: 0.2, tile: 1, color: 0x34506a },
  barrelRed:    { s: 'metal', rough: 0.6, metal: 0.2, tile: 1, color: 0x7a3b31 },
  desk:         { s: 'wood', rough: 0.6, metal: 0, tile: 1.6, color: 0xb8a58a },
  partition:    { s: 'fabric', rough: 1, metal: 0, tile: 1.2, color: 0x6b7480 },
  canvasRed:    { s: 'fabric', rough: 1, metal: 0, tile: 1.5, color: 0x8c4c3e, side: THREE.DoubleSide },
  canvasBlue:   { s: 'fabric', rough: 1, metal: 0, tile: 1.5, color: 0x3e5872, side: THREE.DoubleSide },
  foliage:      { s: 'fabric', rough: 0.9, metal: 0, tile: 1, color: 0x4f6b2e, side: THREE.DoubleSide },
  bark:         { s: 'wood', rough: 1, metal: 0, tile: 1, color: 0x7a6248 },
  grass:        { s: 'grass', rough: 1, metal: 0, tile: 4.5 },
  dirt:         { s: 'dirt', rough: 1, metal: 0, tile: 4 },
  rock:         { s: 'rock', rough: 0.95, metal: 0, tile: 5 },
  ruinStone:    { s: 'ruinStone', rough: 0.95, metal: 0, tile: 3 },
  ruinDark:     { s: 'ruinStone', arg: '#8f8470', rough: 0.95, metal: 0, tile: 3 },
  olive:        { s: 'fabric', rough: 0.85, metal: 0, tile: 1, color: 0x7d9148 },
  foliageDark:  { s: 'fabric', rough: 0.92, metal: 0, tile: 1, color: 0x34492a, side: THREE.DoubleSide },
  relicGold:    { s: 'metal', rough: 0.25, metal: 1, tile: 1, color: 0xe2b24c, env: 1.4 },
};
const CONTAINER_COLORS = ['#7a4a3f', '#3f5669', '#4a5c45', '#8f6d48', '#666a6d', '#6a4450', '#9c8d52', '#3f6363']; // v17: weathered, sun-faded paint

/* v17: baked contact AO + wall-base grime + top-face dust ("lightmap-lite"). MapBuilder.bakeContactAO() rasterises the
   static collision boxes into a top-down texture (R = floor occlusion, G = ground height); every world material samples
   it by world XZ. The uniform objects are shared, so cached materials pick up each map's bake without recompiling. */
const CAO = {
  uCAOMap: { value: (() => { const t = new THREE.DataTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(1), THREE.DataUtils.toHalfFloat(-999), 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType); t.needsUpdate = true; return t; })() },
  uCAOBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uCAOOn: { value: 0 }, uCAODust: { value: 1 },
};
function applyContactAO(m, key, noWall = false) { // noWall: terrain (its own cliffs must not get wall-base grime)
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, CAO);
    sh.vertexShader = 'varying vec3 vCaoW;\nvarying vec3 vCaoN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCaoW = (modelMatrix * vec4(transformed, 1.0)).xyz; vCaoN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D uCAOMap;\nuniform vec4 uCAOBox;\nuniform float uCAOOn;\nuniform float uCAODust;\nvarying vec3 vCaoW;\nvarying vec3 vCaoN;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 caoUV = (vCaoW.xz - uCAOBox.xy) * uCAOBox.zw;
        vec4 caoT = texture2D(uCAOMap, caoUV);
        float caoIn = uCAOOn * step(0.0, caoUV.x) * step(caoUV.x, 1.0) * step(0.0, caoUV.y) * step(caoUV.y, 1.0);
        float caoH = vCaoW.y - caoT.g;
        vec3 caoN = normalize(vCaoN);
        float caoUp = smoothstep(0.55, 0.9, caoN.y), caoVert = ${noWall ? '0.0' : '1.0 - smoothstep(0.35, 0.7, abs(caoN.y))'};
        float caoK = mix(1.0, caoT.r, caoUp * (1.0 - smoothstep(0.06, 0.24, caoH))); // floor only: occluders are >= 0.3 m tall, so their own tops stay clean
        caoK *= mix(1.0, mix(0.58, 1.0, smoothstep(0.0, 1.1, caoH)), caoVert * step(-0.25, caoH));
        caoK = mix(1.0, caoK, caoIn);
        float caoGrime = caoIn * caoVert * step(-0.25, caoH) * (1.0 - smoothstep(0.0, 0.8, caoH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.56, 0.5), caoGrime * 0.6);
        float caoDust = caoIn * uCAODust * smoothstep(0.8, 0.97, caoN.y) * smoothstep(0.35, 0.6, caoH);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * 1.08 + vec3(0.018, 0.016, 0.012), caoDust * 0.4);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= caoK; reflectedLight.indirectSpecular *= caoK;
        reflectedLight.directDiffuse *= mix(1.0, caoK, 0.4); reflectedLight.directSpecular *= mix(1.0, caoK, 0.4);`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

class MaterialLib {
  constructor(tf) { this.tf = tf; this.cache = new Map(); }
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    let p = MAT_PRESETS[name];
    let s;
    if (name.startsWith('container:')) {
      const c = CONTAINER_COLORS[parseInt(name.split(':')[1], 10) % CONTAINER_COLORS.length];
      p = { s: 'container', arg: c, rough: 0.72, metal: 0.12, tile: 2.6 }; // painted corrugated steel (metal 0.6 tinted every reflection with the paint colour)
    }
    if (!p) throw new Error('unknown material ' + name);
    s = this.tf.surface(p.s, p.arg);
    const m = new THREE.MeshPhysicalMaterial({
      map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap,
      roughness: p.rough, metalness: p.metal, color: p.color ?? 0xffffff, side: p.side ?? THREE.FrontSide,
      clearcoat: p.clearcoat || 0, clearcoatRoughness: p.clearcoatRoughness ?? 0.3, sheen: p.sheen || 0, envMapIntensity: p.env ?? 1,
    });
    m.normalScale.set(1, 1);
    applyContactAO(m, 'cao1');
    m.userData.keep = true; m.userData.tile = p.tile; m.userData.env = p.env ?? 1;
    this.cache.set(name, m);
    return m;
  }
  tile(name) { return (MAT_PRESETS[name] || { tile: 2.6 }).tile; }
  basic(key, make) { if (!this.cache.has(key)) { const m = make(); m.userData.keep = true; this.cache.set(key, m); } return this.cache.get(key); }
}

// BoxGeometry with UVs scaled to world size (constant texel density).
function worldBox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  uv.needsUpdate = true;
  return g;
}


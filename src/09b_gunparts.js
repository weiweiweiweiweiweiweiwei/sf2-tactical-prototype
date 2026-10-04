/* =====================================================================
   GUN PARTS LIBRARY (v5) — parametric receivers, stocks, grips,
   magazines, handguards, barrels, muzzle devices, iron sights, scopes
   and bipods. The 22 new weapons are assembled from these parts, each
   with its own signature silhouette (AK dust cover + banana mag, SCAR
   monolithic rail, FAMAS carry handle, AUG optic, MG42 cooling jacket,
   Barrett arrow brake, Kar98k full wood stock, ...).
   Gun space: forward = -Z, up = +Y, bore on y = 0, u = distance forward.
   ===================================================================== */
const GP = {
  m(gb, n) { return (n && gb.M[n]) || gb.M.black; },

  recv(gb, o = {}) {
    const u0 = o.u0 ?? -0.13, u1 = o.u1 ?? 0.1, vb = o.vb ?? -0.032, vt = o.vt ?? 0.034, w = o.w ?? 0.04, m = GP.m(gb, o.mat), M = gb.M, st = o.style || 'ar';
    if (st === 'ak') {
      gb.prof([[u0, vb + 0.004], [u0 + 0.01, vb], [u1, vb], [u1, vt - 0.012], [u0 + 0.03, vt - 0.012], [u0, vt - 0.022]], w, m, 'body', { bevel: 0.003 });
      gb.cyl(w * 0.48, w * 0.48, (u1 - u0) * 0.8, 0, vt - 0.012, u0 + (u1 - u0) * 0.45, m, 'body', 18); // rounded dust cover
      for (let i = 0; i < 4; i++) gb.box(w * 0.7, 0.002, 0.005, 0, vt - 0.012 + w * 0.48, -(u0 + 0.03 + i * 0.012), m);
      gb.box(0.004, 0.012, 0.06, w / 2 + 0.002, vt - 0.02, -(u0 + (u1 - u0) * 0.6), m); // charging handle rail
      gb.box(0.01, 0.01, 0.014, w / 2 + 0.008, vt - 0.018, -(u0 + (u1 - u0) * 0.72), M.steel, gb.nodes.charge ? 'charge' : 'body', 0.002);
      gb.box(0.004, 0.02, 0.05, w / 2 + 0.001, 0.0, -(u0 + (u1 - u0) * 0.35), M.steel, 'body', 0, 0, 0, 0.2); // safety lever
    } else if (st === 'lmg') {
      gb.prof([[u0, vb], [u1, vb], [u1, vt], [u0 + 0.02, vt], [u0, vt - 0.015]], w, m, 'body', { bevel: 0.005 });
      gb.prof([[u0 + 0.02, vt], [u1 - 0.03, vt], [u1 - 0.03, vt + 0.014], [u1 - 0.05, vt + 0.024], [u0 + 0.05, vt + 0.024], [u0 + 0.02, vt + 0.014]], w * 0.92, m, o.coverNode ? 'cover' : 'body', { bevel: 0.004 });
      for (let i = 0; i < 5; i++) gb.box(w + 0.002, 0.004, 0.006, 0, vb * 0.4 - i * 0.01, -(u0 + 0.02 + i * 0.014), M.polymer);
    } else if (st === 'bolt') {
      gb.cyl(w * 0.5, w * 0.5, u1 - u0, 0, 0.004, (u0 + u1) / 2, m, 'body', 22);
      gb.prof([[u0 + 0.02, -0.02], [u1 - 0.02, -0.02], [u1 - 0.02, -0.03], [u0 + 0.02, -0.03]], w * 0.9, m); // magazine well / floorplate seat
    } else if (st === 'smg') {
      gb.prof([[u0, vb], [u1, vb], [u1 + 0.01, vt - 0.006], [u1, vt], [u0 + 0.015, vt], [u0, vt - 0.01]], w, m, 'body', { bevel: 0.005 });
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.012, 0.012, sx * (w / 2 + 0.0005), (vt + vb) / 2, -(u0 + 0.03 + i * 0.03), M.polymer);
    } else {
      gb.prof([[u0, vb + 0.004], [u0 + 0.01, vb], [u1, vb], [u1, vt], [u0 + 0.02, vt], [u0, vt - 0.008]], w, m, 'body', { bevel: 0.004 });
      gb.box(0.002, (vt - vb) * 0.35, (u1 - u0) * 0.22, w / 2 + 0.0005, (vt + vb) * 0.5 + 0.004, -(u0 + (u1 - u0) * 0.55), M.rubber); // ejection port
      gb.cylAxis(0.006, 0.012, w / 2 + 0.002, 0.012, -(u0 + 0.03), 'x', m); // forward assist / pin
    }
  },

  stock(gb, type, o = {}) {
    const u = o.u ?? -0.13, L = o.len ?? 0.28, m = GP.m(gb, o.mat || 'polymer'), M = gb.M, vt = o.vt ?? 0.022;
    if (type === 'none') return;
    if (type === 'ar') {
      gb.cyl(0.014, 0.014, L * 0.7, 0, 0.004, u - L * 0.35, M.black, 'body', 14);
      gb.prof([[u - L * 0.3, vt], [u - L, vt - 0.002], [u - L - 0.012, -0.018], [u - L - 0.01, -0.075], [u - L + 0.03, -0.08], [u - L * 0.45, -0.03], [u - L * 0.3, -0.018]], 0.036, m, 'body', { bevel: 0.004 });
      gb.box(0.036, 0.1, 0.012, 0, -0.026, -(u - L - 0.01), M.rubber, 'body', 0.003);
    } else if (type === 'akwood' || type === 'wood' || type === 'clubfoot') {
      const drop = type === 'wood' ? 0.07 : 0.1, toe = type === 'clubfoot' ? -0.13 : -0.11;
      gb.prof([[u, vt], [u - L, vt - 0.018], [u - L - 0.006, toe + 0.012], [u - L + 0.025, toe], [u - L * 0.45, -0.052], [u - 0.02, -0.036], [u, -0.03]], 0.038, m, 'body', { bevel: 0.006 });
      gb.box(0.04, Math.abs(toe) + vt - 0.02, 0.01, 0, (toe + vt) / 2 - 0.004, -(u - L - 0.004), M.steel, 'body', 0.003);
      void drop;
    } else if (type === 'skeleton') {
      gb.prof([[u, vt], [u - L, vt - 0.004], [u - L - 0.01, -0.08], [u - L + 0.02, -0.09], [u - 0.02, -0.03], [u, -0.024]], 0.03, m, 'body', {
        bevel: 0.004, holes: [[[u - 0.04, vt - 0.01], [u - L + 0.02, vt - 0.012], [u - L + 0.01, -0.06], [u - L + 0.035, -0.07], [u - 0.035, -0.02]]] });
      gb.box(0.032, 0.105, 0.012, 0, -0.03, -(u - L - 0.008), M.rubber, 'body', 0.003);
    } else if (type === 'thumbhole') {
      gb.prof([[u + 0.02, vt + 0.004], [u - L, vt + 0.01], [u - L - 0.01, -0.105], [u - L + 0.03, -0.115], [u - 0.02, -0.12], [u + 0.04, -0.06], [u + 0.08, -0.04], [u + 0.08, -0.028]], 0.042, m, 'body', {
        bevel: 0.006, holes: [[[u - 0.03, -0.02], [u - 0.1, -0.02], [u - 0.11, -0.08], [u - 0.035, -0.09]]] });
      gb.box(0.034, 0.02, 0.1, 0, vt + 0.018, -(u - L + 0.08), m, 'body', 0.006); // cheek riser
      gb.box(0.044, 0.13, 0.014, 0, -0.045, -(u - L - 0.006), M.rubber, 'body', 0.004);
    } else if (type === 'wire') {
      for (const sx of [-1, 1]) gb.cyl(0.004, 0.004, L, sx * 0.012, 0.0, u - L / 2, M.steel, 'body', 8);
      gb.box(0.03, 0.09, 0.008, 0, -0.03, -(u - L), M.steel, 'body', 0.003);
    } else if (type === 'folded') { // side-folded stock lying along the receiver's left side
      gb.box(0.012, 0.05, L * 0.8, -0.026, -0.012, -(u + L * 0.3), m, 'body', 0.003);
    }
  },

  grip(gb, o = {}) {
    const u = o.u ?? -0.078, vb = o.vb ?? -0.032, m = GP.m(gb, o.mat || 'polymer'), slant = o.slant ?? 1, len = o.len ?? 0.095;
    gb.prof([[u - 0.004, vb], [u + 0.038, vb], [u + 0.038 - 0.025 * slant, vb - len], [u + 0.008 - 0.03 * slant, vb - len - 0.003], [u - 0.004 - 0.022 * slant, vb - len + 0.012]], 0.03, m, 'body', { bevel: 0.005 });
    for (let i = 0; i < 3; i++) gb.box(0.032, 0.004, 0.012, 0, vb - 0.03 - i * 0.02, -(u + 0.02 - 0.008 * slant * i), gb.M.rubber);
  },
  trigger(gb, o = {}) {
    const u = o.u ?? -0.035, vb = o.vb ?? -0.032, m = GP.m(gb, o.mat);
    gb.prof([[u - 0.035, vb], [u + 0.05, vb], [u + 0.05, vb - 0.006], [u - 0.02, vb - 0.006], [u - 0.038, vb - 0.02], [u - 0.046, vb - 0.02], [u - 0.043, vb]], 0.018, m, 'body', { bevel: 0.0015 });
    gb.box(0.004, 0.016, 0.004, 0, vb - 0.01, -(u + 0.012), gb.M.bright);
  },

  mag(gb, type, o = {}) {
    const u = o.u ?? 0.0, vb = o.vb ?? -0.032, L = o.len ?? 0.17, m = GP.m(gb, o.mat), node = o.node || 'mag', w = o.w ?? 0.024;
    if (type === 'stanag') gb.prof([[u, vb + 0.01], [u + 0.056, vb + 0.01], [u + 0.07, vb - L * 0.5], [u + 0.066, vb - L], [u + 0.034, vb - L - 0.004], [u + 0.036, vb - L * 0.5], [u + 0.012, vb + 0.01]], w, m, node, { bevel: 0.002 });
    else if (type === 'ak') { // strongly curved "banana"
      const pts = [], back = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, a = t * 0.62, cx = u + 0.03 + Math.sin(a) * L * 0.62, cy = vb + 0.01 - Math.sin(a + 0.9) * L * 0.02 - t * L; pts.push([cx + 0.028, cy]); back.unshift([cx - 0.024, cy - 0.004]); }
      gb.prof([...pts, ...back], w + 0.002, m, node, { bevel: 0.002 });
      for (let i = 1; i < 5; i++) { const t = i / 6, a = t * 0.62; gb.box(w + 0.004, 0.003, 0.05, 0, vb + 0.01 - t * L, -(u + 0.03 + Math.sin(a) * L * 0.62), m, node, 0, -a * 0.9); }
    } else if (type === 'straight') gb.box(w, L, 0.036, 0, vb - L / 2 + 0.01, -(u + 0.02), m, node, 0.003, o.tilt ?? 0.08);
    else if (type === 'box') { gb.box(0.07, 0.1, 0.11, o.x ?? -0.035, vb - 0.06, -(u + 0.02), m, node, 0.008); gb.box(0.074, 0.01, 0.114, o.x ?? -0.035, vb - 0.012, -(u + 0.02), gb.M.black, node, 0.003); }
    else if (type === 'drum') { gb.cylAxis(o.r ?? 0.068, 0.055, 0, vb - (o.r ?? 0.068) - 0.005, -(u + 0.03), 'x', m, node, 26); gb.cylAxis((o.r ?? 0.068) * 0.3, 0.06, 0, vb - (o.r ?? 0.068) - 0.005, -(u + 0.03), 'x', gb.M.steel, node, 12); }
    else if (type === 'sidedrum') { gb.cylAxis(0.07, 0.06, -0.06, -0.02, -(u + 0.02), 'y', m, node, 24); }
    else if (type === 'belt') { gb.box(0.075, 0.11, 0.1, -0.042, vb - 0.06, -(u + 0.02), m, node, 0.006); for (let i = 0; i < 6; i++) gb.box(0.03, 0.008, 0.008, -0.01 + i * 0.001, vb - 0.005 - i * 0.004, -(u + 0.045 - i * 0.004), gb.M.gold, node); }
    else if (type === 'shotbox') gb.box(0.04, L, 0.07, 0, vb - L / 2 + 0.01, -(u + 0.035), m, node, 0.006, 0.12);
  },

  handguard(gb, type, o = {}) {
    const u0 = o.u0 ?? 0.1, u1 = o.u1 ?? 0.3, r = o.r ?? 0.024, m = GP.m(gb, o.mat), M = gb.M, len = u1 - u0, c = (u0 + u1) / 2;
    if (type === 'quad') {
      gb.box(r * 1.8, r * 1.8, len, 0, 0.002, -c, m, 'body', 0.004);
      gb.rail(u0 + 0.005, u1 - 0.005, 0.002 + r * 0.9, m, 'body', 0.021);
      for (const sx of [-1, 1]) for (let u = u0 + 0.01; u < u1 - 0.005; u += 0.01) gb.box(0.004, 0.02, 0.005, sx * (r * 0.9 + 0.002), 0.002, -u, m);
      for (let u = u0 + 0.01; u < u1 - 0.005; u += 0.01) gb.box(0.02, 0.004, 0.005, 0, 0.002 - r * 0.9 - 0.002, -u, m);
    } else if (type === 'mlok') {
      gb.box(r * 1.7, r * 1.75, len, 0, 0.003, -c, m, 'body', 0.006);
      for (let i = 0; i < Math.floor(len / 0.04); i++) for (const sx of [-1, 1]) gb.box(0.002, 0.008, 0.024, sx * (r * 0.85 + 0.0005), -0.004, -(u0 + 0.025 + i * 0.04), M.rubber);
      gb.rail(u0, u1, 0.003 + r * 0.875, m, 'body', 0.021);
    } else if (type === 'akwood') {
      gb.box(r * 1.9, r * 1.4, len, 0, -0.006, -c, m, 'body', 0.008);
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.006, 0.02, sx * (r * 0.95 + 0.0005), -0.004, -(u0 + 0.03 + i * 0.045), M.woodDark);
      gb.cyl(r * 0.62, r * 0.62, len * 0.85, 0, 0.026, c - len * 0.05, m, 'body', 14); // upper gas-tube cover
    } else if (type === 'round') {
      gb.cyl(r, r * 0.94, len, 0, 0.0, c, m, 'body', 22);
      for (let i = 0; i < 5; i++) gb.torus(r + 0.0005, 0.0018, 0, 0, u0 + 0.02 + i * (len - 0.04) / 4, 'z', M.rubber);
    } else if (type === 'shroud') { // MG42 cooling jacket: perforated tube
      gb.cyl(r, r, len, 0, 0.0, c, m, 'body', 20, true);
      gb.cyl(r * 0.96, r * 0.96, len, 0, 0.0, c, M.rubber, 'body', 20, true);
      for (let i = 0; i < Math.floor(len / 0.035); i++) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; gb.box(0.012, 0.012, 0.018, Math.cos(a) * r, Math.sin(a) * r, -(u0 + 0.02 + i * 0.035), M.rubber, 'body', 0.004, 0, 0, a); }
    } else if (type === 'svd') {
      gb.box(r * 1.9, r * 1.5, len, 0, -0.004, -c, m, 'body', 0.008);
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.01, 0.018, sx * (r * 0.95 + 0.0005), 0.0, -(u0 + 0.03 + i * (len - 0.06) / 4), M.rubber);
    } else if (type === 'lmg') {
      gb.box(r * 2, r * 1.9, len, 0, -0.006, -c, m, 'body', 0.008);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.016, 0.02, sx * (r + 0.0005), -0.004, -(u0 + 0.03 + i * 0.035), M.black);
    }
  },

  barrel(gb, u0, u1, r = 0.0095, mat = 'steel', y = 0.0) { gb.cyl(r, r * 0.96, u1 - u0, 0, y, (u0 + u1) / 2, GP.m(gb, mat), 'body', 16); },
  gasTube(gb, u0, u1, y = 0.024, r = 0.007) { gb.cyl(r, r, u1 - u0, 0, y, (u0 + u1) / 2, gb.M.steel, 'body', 10); gb.box(0.018, 0.03, 0.02, 0, y * 0.5, -u1, gb.M.black, 'body', 0.004); },

  muzzle(gb, type, u, r = 0.012, y = 0.0) {
    const M = gb.M;
    if (type === 'bird') { gb.cyl(r, r, 0.045, 0, y, u + 0.0225, M.black, 'body', 14); for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k / 4) * Math.PI * 2; gb.box(0.003, 0.008, 0.028, Math.cos(a) * r, y + Math.sin(a) * r, -(u + 0.026), M.rubber, 'body', 0, 0, 0, a); } return u + 0.045; }
    if (type === 'ak') { gb.cyl(r, r * 0.95, 0.04, 0, y, u + 0.02, M.black, 'body', 14); gb.box(r * 1.6, 0.008, 0.016, 0, y + r * 0.7, -(u + 0.034), M.black, 'body', 0, 0.35); return u + 0.04; }
    if (type === 'brake') { gb.box(r * 2.6, r * 1.9, 0.06, 0, y, -(u + 0.03), M.black, 'body', 0.004); for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) gb.box(0.003, r * 1.3, 0.012, sx * r * 1.31, y, -(u + 0.015 + i * 0.024), M.rubber); return u + 0.06; }
    if (type === 'arrow') { // Barrett double-chamber arrow brake
      gb.box(0.052, 0.034, 0.1, 0, y, -(u + 0.05), M.black, 'body', 0.006);
      for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) gb.box(0.004, 0.026, 0.024, sx * 0.0265, y, -(u + 0.024 + i * 0.048), M.rubber);
      gb.lathe([[0, u + 0.1], [0.022, u + 0.1], [0.012, u + 0.13], [0, u + 0.13]], 0, y, M.black); return u + 0.13;
    }
    if (type === 'supp') { gb.cyl(r * 1.45, r * 1.45, 0.17, 0, y, u + 0.085, M.suppressor, 'body', 24); return u + 0.17; }
    if (type === 'cone') { gb.lathe([[0, u], [r * 0.9, u], [r * 1.35, u + 0.06], [r * 1.1, u + 0.064], [0, u + 0.064]], 0, y, M.black); return u + 0.064; }
    if (type === 'slots') { gb.cyl(r, r, 0.07, 0, y, u + 0.035, M.black, 'body', 14); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; gb.box(0.003, 0.006, 0.05, Math.cos(a) * r, y + Math.sin(a) * r, -(u + 0.036), M.rubber, 'body', 0, 0, 0, a); } return u + 0.07; }
    if (type === 'booster') { gb.cyl(r * 1.6, r * 1.6, 0.05, 0, y, u + 0.025, M.black, 'body', 18); gb.lathe([[0, u + 0.05], [r * 1.6, u + 0.05], [r * 0.8, u + 0.08], [0, u + 0.08]], 0, y, M.black); return u + 0.08; }
    gb.cyl(r * 0.9, r * 0.9, 0.02, 0, y, u + 0.01, M.black, 'body', 12); return u + 0.02;
  },

  // Iron sights: rear notch at rearU and a hooded post at frontU, both aligned on sightY. Returns sightY.
  iron(gb, rearU, frontU, sightY, o = {}) {
    const M = gb.M, m = GP.m(gb, o.mat), base = o.base ?? 0.03;
    gb.box(0.022, sightY - base, 0.018, 0, (sightY + base) / 2 - 0.002, -rearU, m, 'body', 0.002);
    for (const sx of [-1, 1]) gb.box(0.008, 0.008, 0.01, sx * 0.0065, sightY + 0.002, -rearU, m);
    const fb = o.frontBase ?? 0.012;
    gb.box(0.014, sightY - fb, 0.016, 0, (sightY + fb) / 2, -frontU, m, 'body', 0.002);
    gb.box(0.0024, 0.012, 0.004, 0, sightY - 0.004, -frontU, M.black);
    if (o.hood !== false) for (const sx of [-1, 1]) gb.box(0.003, 0.018, 0.012, sx * 0.009, sightY, -frontU, m);
    const dot = new THREE.SphereGeometry(0.0016, 8, 6); dot.translate(0, sightY + 0.0015, -frontU); gb.add(dot, M.dotW);
    return sightY + 0.002;
  },
  // Round rifle scope on two rings; returns the optical axis height.
  scope(gb, u0, len, r, baseY, o = {}) {
    const M = gb.M, m = GP.m(gb, o.mat), y = baseY + r + (o.lift ?? 0.012), x = o.x ?? 0;
    if (!o.open) gb.cyl(r * 0.78, r * 0.78, len, x, y, u0 + len / 2, m, 'body', 24);
    else for (const f of [0, 0.5, 1]) gb.torus(r * 0.8, 0.003, x, y, u0 + len * f, 'z', m); // open tube: just rings
    if (o.open) { // v34: a see-through optic (AUG 1.5×): rings only, no solid end caps / dark lens — you look THROUGH it when aiming
      gb.lathe([[r * 0.78, u0 + len], [r * 1.25, u0 + len + 0.05], [r * 1.25, u0 + len + 0.08], [r * 1.12, u0 + len + 0.08]], x, y, m);
      gb.lathe([[r * 0.9, u0 - 0.06], [r * 1.05, u0 - 0.06], [r * 1.05, u0 - 0.03], [r * 0.78, u0]], x, y, m);
    } else {
      gb.lathe([[0, u0 + len], [r * 0.78, u0 + len], [r * 1.25, u0 + len + 0.05], [r * 1.25, u0 + len + 0.08], [0, u0 + len + 0.08]], x, y, m);
      gb.lathe([[0, u0 - 0.06], [r * 1.05, u0 - 0.06], [r * 1.05, u0 - 0.03], [r * 0.78, u0], [0, u0]], x, y, m);
      const lens = new THREE.CircleGeometry(r * 1.2, 24); lens.translate(x, y, -(u0 + len + 0.0805)); gb.add(lens, M.lensDark);
    }
    gb.cylAxis(r * 0.5, 0.03, x, y + r * 0.9, -(u0 + len * 0.45), 'y', m); gb.cylAxis(r * 0.45, 0.03, x + r * 0.9, y, -(u0 + len * 0.45), 'x', m);
    for (const f of [0.18, 0.72]) { gb.torus(r * 0.8, 0.0035, x, y, u0 + len * f, 'z', m); gb.box(0.02, y - baseY - r * 0.7, 0.016, x, (baseY + y - r * 0.7) / 2, -(u0 + len * f), m, 'body', 0.002); }
    return y;
  },
  bipod(gb, u, y = -0.028, len = 0.2, folded = true) {
    const M = gb.M;
    gb.box(0.03, 0.014, 0.024, 0, y + 0.006, -u, M.black, 'body', 0.004);
    for (const sx of [-1, 1]) folded ? gb.cyl(0.0045, 0.0045, len, sx * 0.012, y, u - len / 2, M.steel, 'body', 8) : gb.box(0.008, len, 0.008, sx * 0.03, y - len / 2, -u, M.steel, 'body', 0, 0, 0, sx * 0.3);
  },
  hands(self, gb, o = {}) { // trigger hand on the pistol grip + support hand under the handguard
    const g = o.grip ?? -0.078, s = o.support ?? 0.24, sy = o.sy ?? 0.002, sw = o.sw ?? 0.046, gy = o.gy ?? -0.085;
    self.arm(gb, [0.02, gy - 0.035, -g + 0.022], [0.19, -0.3, 0.42], 0.034); self.gripHand(gb, 0.001, gy, g, o.tilt ?? -0.36);
    self.arm(gb, [-0.036, sy - 0.054, -s + 0.02], [-0.3, -0.3, 0.06], 0.033); self.supportHand(gb, 0, sy, s, sw);
  },
};

Object.assign(WeaponModels.prototype, {
  _fin(gb, o) { const b = gb.build(); return this._finish(b, Object.assign({ hipPos: [0.13, -0.14, -0.33], flash: 0.2 }, o, { adsPos: o.adsPos || [0, -o.sightY, o.adsZ ?? -0.2] })); },

  /* ------------------------------ assault rifles ------------------------------ */
  ak47() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0.03, 0.02, -0.1));
    GP.recv(gb, { style: 'ak', mat: 'steelBlue', u0: -0.14, u1: 0.12, vt: 0.038 });
    GP.stock(gb, 'akwood', { mat: 'wood', u: -0.14, len: 0.27 });
    GP.grip(gb, { mat: 'woodDark', u: -0.085, slant: 1.3 });
    GP.trigger(gb, { u: -0.04, mat: 'steelBlue' });
    GP.mag(gb, 'ak', { mat: 'bakelite', u: 0.0, len: 0.19 });
    GP.handguard(gb, 'akwood', { mat: 'wood', u0: 0.12, u1: 0.3, r: 0.022 });
    GP.barrel(gb, 0.3, 0.5, 0.0092); GP.gasTube(gb, 0.3, 0.36, 0.026, 0.0065);
    const mz = GP.muzzle(gb, 'ak', 0.5, 0.011);
    const sightY = GP.iron(gb, 0.11, 0.47, 0.052, { mat: 'steelBlue', base: 0.036, frontBase: 0.01 });
    GP.hands(this, gb, { support: 0.22, sw: 0.044 });
    return this._fin(gb, { muzzleU: mz, sightY, flash: 0.22 });
  },
  scarl() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(-0.026, 0.02, -0.1));
    GP.recv(gb, { mat: 'tan', u0: -0.12, u1: 0.12, vt: 0.036, w: 0.044 });
    gb.prof([[-0.12, 0.036], [0.3, 0.036], [0.3, 0.046], [-0.12, 0.046]], 0.034, M.tan, 'body', { bevel: 0.003 }); // monolithic upper
    gb.rail(-0.11, 0.29, 0.046, M.black, 'body', 0.022);
    gb.box(0.05, 0.05, 0.18, 0, 0.012, -0.21, M.tan, 'body', 0.008);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.012, 0.022, sx * 0.0255, 0.004, -(0.15 + i * 0.035), M.black);
    gb.box(0.008, 0.01, 0.03, -0.028, 0.03, 0.1, M.black, 'charge', 0.003); // left charging handle
    GP.stock(gb, 'skeleton', { mat: 'tan', u: -0.12, len: 0.26 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 });
    GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'stanag', { mat: 'black', u: 0.0, len: 0.17 });
    GP.barrel(gb, 0.3, 0.42, 0.0095);
    const mz = GP.muzzle(gb, 'bird', 0.42, 0.011);
    const sightY = gb.holo(-0.04, 0.046, M.black);
    gb.box(0.008, 0.022, 0.01, 0, 0.056, -0.27, M.black); // folded front sight
    GP.hands(this, gb, { support: 0.22, sw: 0.05 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: true, flash: 0.2 });
  },
  famas() { // bullpup "clairon": long carry handle with the sights inside it, folded bipod legs
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, 0.12)).node('charge', new THREE.Vector3(0, 0.07, -0.1));
    gb.prof([[-0.38, 0.024], [-0.38, -0.08], [-0.34, -0.1], [-0.26, -0.1], [-0.2, -0.04], [0.06, -0.04], [0.18, -0.03], [0.2, -0.016], [0.2, 0.02], [0.1, 0.034], [-0.3, 0.034]], 0.05, M.black, 'body', { bevel: 0.006 });
    gb.prof([[-0.25, 0.034], [0.12, 0.034], [0.12, 0.05], [0.09, 0.09], [0.07, 0.096], [-0.22, 0.096], [-0.24, 0.088], [-0.25, 0.05]], 0.024, M.black, 'body', {
      bevel: 0.004, holes: [[[-0.22, 0.046], [0.08, 0.046], [0.065, 0.08], [-0.21, 0.08]]] }); // carry handle
    gb.box(0.014, 0.012, 0.03, 0, 0.068, -0.02, M.polymer, 'charge', 0.003);
    gb.box(0.05, 0.1, 0.012, 0, -0.03, 0.385, M.rubber, 'body', 0.004);
    GP.grip(gb, { mat: 'polymer', u: 0.02, vb: -0.04 });
    gb.prof([[-0.03, -0.04], [0.08, -0.04], [0.08, -0.12], [0.06, -0.12], [0.06, -0.05], [-0.01, -0.05]], 0.016, M.black); // full-length trigger guard
    GP.mag(gb, 'stanag', { mat: 'black', u: -0.19, len: 0.15, vb: -0.04 });
    GP.barrel(gb, 0.2, 0.3, 0.009); const mz = GP.muzzle(gb, 'bird', 0.3, 0.011);
    for (const sx of [-1, 1]) gb.cyl(0.004, 0.004, 0.2, sx * 0.03, 0.01, 0.12, M.steel, 'body', 8); // folded bipod legs
    const sightY = GP.iron(gb, -0.2, 0.1, 0.066, { base: 0.05, frontBase: 0.05, hood: false });
    this.arm(gb, [0.02, -0.12, 0.0], [0.19, -0.3, 0.36], 0.034); this.gripHand(gb, 0.001, -0.09, 0.028, -0.36);
    this.arm(gb, [-0.036, -0.06, -0.18], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.012, 0.16, 0.05);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.12, -0.15, -0.31], adsPos: [0, -(sightY + 0.052), -0.32], flash: 0.18, magMove: [0, -0.26, 0.04] }); // v34: eye further back so the handle does not fill the view
  },
  aug() { // olive bullpup shell, integrated 1.5× optic handle, folding vertical grip, translucent mag
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, 0.12));
    gb.prof([[-0.36, 0.02], [-0.37, -0.06], [-0.33, -0.1], [-0.2, -0.1], [-0.16, -0.045], [0.08, -0.045], [0.14, -0.03], [0.16, 0.0], [0.14, 0.03], [-0.34, 0.03]], 0.058, M.odGreen, 'body', { bevel: 0.012 });
    gb.box(0.054, 0.1, 0.012, 0, -0.03, 0.372, M.rubber, 'body', 0.004);
    gb.prof([[-0.08, -0.045], [0.14, -0.045], [0.12, -0.14], [0.09, -0.14], [0.1, -0.06], [-0.05, -0.06]], 0.03, M.odGreen, 'body', { bevel: 0.006, holes: [[[-0.03, -0.055], [0.08, -0.055], [0.08, -0.12], [0.05, -0.12]]] });
    GP.mag(gb, 'stanag', { mat: 'magClear', u: -0.18, len: 0.14, vb: -0.045 });
    gb.box(0.03, 0.06, 0.03, 0, 0.055, -0.0, M.odGreen, 'body', 0.006); gb.box(0.03, 0.06, 0.03, 0, 0.055, -0.14, M.odGreen, 'body', 0.006);
    const sightY = GP.scope(gb, -0.07, 0.19, 0.017, 0.08, { mat: 'black', lift: 0.0, open: true });
    GP.barrel(gb, 0.16, 0.34, 0.0095); const mz = GP.muzzle(gb, 'bird', 0.34, 0.011);
    gb.box(0.022, 0.07, 0.028, 0, -0.06, -0.22, M.polymer, 'body', 0.008); // vertical foregrip
    this.arm(gb, [0.02, -0.12, 0.02], [0.19, -0.3, 0.36], 0.034); this.gripHand(gb, 0.001, -0.1, 0.01, -0.3);
    this.arm(gb, [-0.03, -0.12, -0.2], [-0.3, -0.34, 0.05], 0.033); this.gripHand(gb, -0.004, -0.085, 0.215, -0.08, false);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.125, -0.15, -0.31], adsZ: -0.2, flash: 0.18, reticle: 'dot', magMove: [0, -0.24, 0.04] });
  },

  /* ------------------------------ SMGs ------------------------------ */
  ump45() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'smg', mat: 'polymer', u0: -0.12, u1: 0.2, vt: 0.036, vb: -0.034, w: 0.046 });
    gb.rail(-0.1, 0.14, 0.036, M.black, 'body', 0.021);
    GP.stock(gb, 'skeleton', { mat: 'polymer', u: -0.12, len: 0.22 });
    GP.grip(gb, { mat: 'polymer', u: -0.07, vb: -0.034 });
    GP.trigger(gb, { u: -0.03, vb: -0.034, mat: 'polymer' });
    GP.mag(gb, 'straight', { mat: 'polymer', u: 0.03, len: 0.15, tilt: 0.1, w: 0.03 });
    GP.barrel(gb, 0.2, 0.25, 0.009); const mz = GP.muzzle(gb, 'cone', 0.25, 0.01);
    const sightY = gb.redDot(-0.02, 0.036, M.black);
    GP.hands(this, gb, { support: 0.14, sw: 0.05, sy: -0.004 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.125, -0.13, -0.32], flash: 0.15, reticle: 'dot' });
  },
  vector() { // angular Super-V housing hanging below the bore, mag in front of the trigger
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.06, -0.06));
    gb.prof([[-0.12, 0.03], [0.14, 0.03], [0.17, 0.0], [0.15, -0.03], [0.08, -0.06], [0.02, -0.11], [-0.03, -0.11], [-0.07, -0.04], [-0.12, -0.03]], 0.05, M.black, 'body', { bevel: 0.008 });
    gb.box(0.052, 0.012, 0.28, 0, 0.034, -0.01, M.black, 'body', 0.003); gb.rail(-0.11, 0.14, 0.04, M.black, 'body', 0.021);
    GP.grip(gb, { mat: 'polymer', u: -0.1, vb: -0.035, slant: 0.8 });
    gb.box(0.03, 0.2, 0.034, 0, -0.17, -0.055, M.polymer, 'mag', 0.004, 0.05); // Glock mag in the front well
    GP.stock(gb, 'folded', { mat: 'polymer', u: -0.12, len: 0.2 });
    GP.barrel(gb, 0.16, 0.2, 0.0085); const mz = GP.muzzle(gb, 'bird', 0.2, 0.01);
    const sightY = gb.redDot(-0.04, 0.04, M.black);
    this.arm(gb, [0.02, -0.14, 0.12], [0.19, -0.3, 0.42], 0.034); this.gripHand(gb, 0.001, -0.09, -0.098, -0.3);
    this.arm(gb, [-0.036, -0.1, -0.12], [-0.3, -0.32, 0.08], 0.033); this.gripHand(gb, -0.004, -0.11, 0.12, -0.1, false);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.125, -0.12, -0.31], flash: 0.14, reticle: 'dot', magMove: [0, -0.28, 0.02] });
  },
  mp7() { // compact PDW: magazine inside the pistol grip, folding foregrip, sliding stock
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.1, 0.06));
    gb.prof([[-0.1, 0.028], [0.12, 0.028], [0.14, 0.01], [0.14, -0.02], [0.1, -0.035], [-0.02, -0.035], [-0.1, -0.025]], 0.044, M.black, 'body', { bevel: 0.006 });
    gb.rail(-0.09, 0.12, 0.028, M.black, 'body', 0.021);
    gb.prof([[-0.085, -0.03], [-0.035, -0.03], [-0.055, -0.14], [-0.085, -0.14], [-0.095, -0.13]], 0.03, M.polymer, 'body', { bevel: 0.005 });
    gb.box(0.026, 0.05, 0.03, 0, -0.16, 0.065, M.black, 'mag', 0.004, -0.2); // mag base protruding
    GP.trigger(gb, { u: -0.02, vb: -0.035 });
    gb.box(0.022, 0.06, 0.024, 0, -0.066, -0.1, M.polymer, 'body', 0.006); // foregrip
    for (const sx of [-1, 1]) gb.cyl(0.004, 0.004, 0.18, sx * 0.016, -0.01, -0.19, M.steel, 'body', 8); // sliding stock rods
    gb.box(0.04, 0.05, 0.01, 0, -0.01, 0.28, M.polymer, 'body', 0.003);
    GP.barrel(gb, 0.14, 0.19, 0.0075); const mz = GP.muzzle(gb, 'cone', 0.19, 0.008);
    const sightY = gb.redDot(-0.03, 0.03, M.black);
    this.arm(gb, [0.02, -0.14, 0.09], [0.19, -0.3, 0.4], 0.034); this.gripHand(gb, 0.001, -0.09, -0.06, -0.3);
    this.arm(gb, [-0.036, -0.1, -0.08], [-0.3, -0.32, 0.1], 0.033); this.gripHand(gb, -0.004, -0.08, 0.1, -0.08, false);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.12, -0.12, -0.3], flash: 0.12, reticle: 'dot', magMove: [0, -0.25, 0.0] });
  },

  /* ------------------------------ LMGs ------------------------------ */
  rpk() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'ak', mat: 'steelBlue', u0: -0.14, u1: 0.12, vt: 0.038 });
    GP.stock(gb, 'clubfoot', { mat: 'wood', u: -0.14, len: 0.28 });
    GP.grip(gb, { mat: 'woodDark', u: -0.085, slant: 1.3 }); GP.trigger(gb, { u: -0.04, mat: 'steelBlue' });
    GP.mag(gb, 'drum', { mat: 'steelBlue', u: 0.0, r: 0.066 });
    GP.handguard(gb, 'akwood', { mat: 'wood', u0: 0.12, u1: 0.3, r: 0.023 });
    GP.barrel(gb, 0.3, 0.66, 0.011); GP.gasTube(gb, 0.3, 0.36, 0.026, 0.0065);
    GP.bipod(gb, 0.6, -0.018, 0.22);
    const mz = GP.muzzle(gb, 'ak', 0.66, 0.012);
    const sightY = GP.iron(gb, 0.11, 0.62, 0.052, { mat: 'steelBlue', base: 0.036, frontBase: 0.012 });
    GP.hands(this, gb, { support: 0.22, sw: 0.046 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.15, -0.34], flash: 0.24, magMove: [0, -0.22, 0.02] });
  },
  negev() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.04, -0.09, -0.03)).node('cover', new THREE.Vector3(0, 0.05, 0.1));
    GP.recv(gb, { style: 'lmg', mat: 'black', u0: -0.13, u1: 0.18, vt: 0.036, vb: -0.045, w: 0.056, coverNode: true });
    gb.rail(-0.09, 0.13, 0.06, M.black, 'cover', 0.022);
    GP.stock(gb, 'skeleton', { mat: 'polymer', u: -0.13, len: 0.28 });
    GP.grip(gb, { mat: 'polymer', u: -0.078, vb: -0.045 }); GP.trigger(gb, { u: -0.035, vb: -0.045 });
    GP.mag(gb, 'belt', { mat: 'odGreen', u: 0.0, vb: -0.045 });
    GP.handguard(gb, 'lmg', { mat: 'black', u0: 0.18, u1: 0.34, r: 0.028 });
    gb.box(0.022, 0.07, 0.026, 0, -0.07, -0.3, M.polymer, 'body', 0.006); // vertical grip
    GP.barrel(gb, 0.34, 0.66, 0.011); GP.bipod(gb, 0.6, -0.022, 0.22);
    const mz = GP.muzzle(gb, 'cone', 0.66, 0.012);
    const sightY = gb.redDot(-0.03, 0.066, M.black);
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.098, -0.075, -0.36);
    this.arm(gb, [-0.03, -0.12, -0.28], [-0.3, -0.34, 0.04], 0.033); this.gripHand(gb, -0.004, -0.085, 0.3, -0.08, false);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.15, -0.35], flash: 0.26, reticle: 'dot', cover: true, magMove: [-0.04, -0.26, 0.02] });
  },
  pkm() {
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.04, -0.09, -0.03)).node('cover', new THREE.Vector3(0, 0.05, 0.12));
    GP.recv(gb, { style: 'lmg', mat: 'steelBlue', u0: -0.14, u1: 0.16, vt: 0.034, vb: -0.042, w: 0.048, coverNode: true });
    GP.stock(gb, 'skeleton', { mat: 'wood', u: -0.14, len: 0.3 });
    GP.grip(gb, { mat: 'bakelite', u: -0.08, vb: -0.042 }); GP.trigger(gb, { u: -0.035, vb: -0.042, mat: 'steelBlue' });
    GP.mag(gb, 'belt', { mat: 'greenPaint', u: 0.02, vb: -0.042 });
    GP.barrel(gb, 0.16, 0.74, 0.012); GP.gasTube(gb, 0.16, 0.5, -0.02, 0.008);
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.004, 0.05, sx * 0.012, 0.0, -(0.22 + i * 0.06), M.black); // fluted barrel
    gb.box(0.012, 0.03, 0.1, 0, 0.034, -0.3, M.steelBlue, 'body', 0.004); gb.box(0.03, 0.012, 0.012, 0, 0.022, -0.26, M.steelBlue); // carry handle
    GP.bipod(gb, 0.66, -0.022, 0.24);
    const mz = GP.muzzle(gb, 'cone', 0.74, 0.013);
    const sightY = GP.iron(gb, 0.12, 0.7, 0.05, { mat: 'steelBlue', base: 0.04 });
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.095, -0.078, -0.36);
    this.arm(gb, [-0.036, -0.06, -0.2], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.01, 0.22, 0.05);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.155, -0.35], adsPos: [0, -(sightY + 0.03), -0.3], flash: 0.28, cover: true, magMove: [-0.04, -0.26, 0.02] });
  },
  mg42() { // stamped receiver, perforated cooling jacket, muzzle booster, 50-round drum on the left, wood stock
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.06, -0.02, -0.03)).node('cover', new THREE.Vector3(0, 0.05, 0.1));
    GP.recv(gb, { style: 'lmg', mat: 'black', u0: -0.14, u1: 0.12, vt: 0.034, vb: -0.04, w: 0.05, coverNode: true });
    GP.stock(gb, 'wood', { mat: 'wood', u: -0.14, len: 0.3 });
    GP.grip(gb, { mat: 'bakelite', u: -0.08, vb: -0.04, slant: 1.4 }); GP.trigger(gb, { u: -0.035, vb: -0.04 });
    GP.mag(gb, 'sidedrum', { mat: 'black', u: 0.0 });
    GP.handguard(gb, 'shroud', { mat: 'black', u0: 0.12, u1: 0.6, r: 0.026 });
    GP.barrel(gb, 0.12, 0.62, 0.009);
    GP.bipod(gb, 0.5, -0.03, 0.22);
    const mz = GP.muzzle(gb, 'booster', 0.62, 0.013);
    const sightY = GP.iron(gb, 0.1, 0.56, 0.056, { base: 0.036, frontBase: 0.028 });
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.093, -0.078, -0.4);
    this.arm(gb, [-0.036, -0.07, -0.18], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.012, 0.2, 0.056);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.15, -0.35], adsPos: [0, -(sightY + 0.028), -0.3], flash: 0.3, cover: true, magMove: [-0.08, -0.12, 0.02] });
  },

  /* ------------------------------ shotguns ------------------------------ */
  _benelliBase(gb, o) { // receiver + tube magazine + barrel with a vent rib + ghost-ring sights
    const M = this.M, m = GP.m(gb, o.mat);
    gb.prof([[-0.11, -0.032], [0.14, -0.032], [0.14, 0.026], [0.12, 0.034], [-0.09, 0.034], [-0.11, 0.024]], 0.04, m, 'body', { bevel: 0.004 });
    gb.rail(-0.08, 0.12, 0.034, M.black, 'body', 0.021);
    gb.box(0.003, 0.022, 0.07, 0.0205, 0.006, -0.03, M.rubber);
    gb.cyl(0.0135, 0.0135, 0.52, 0, 0.012, 0.4, M.steel, 'body', 18);
    gb.box(0.008, 0.004, 0.46, 0, 0.027, -0.39, M.black); // vent rib
    gb.cyl(0.013, 0.013, o.tube ?? 0.4, 0, -0.018, 0.14 + (o.tube ?? 0.4) / 2, M.black, 'body', 16);
    gb.box(0.046, 0.05, 0.2, 0, -0.012, -0.25, m, 'body', 0.012);
    for (let i = 0; i < 6; i++) gb.box(0.048, 0.004, 0.006, 0, -0.037, -(0.17 + i * 0.03), M.rubber);
    gb.torus(0.009, 0.003, 0, 0.05, -0.08, 'z', M.black); for (const sx of [-1, 1]) gb.box(0.004, 0.02, 0.012, sx * 0.012, 0.042, 0.08, M.black);
    gb.box(0.004, 0.02, 0.008, 0, 0.038, -0.62, M.black); const d = new THREE.SphereGeometry(0.0022, 8, 6); d.translate(0, 0.049, -0.62); gb.add(d, M.dotW);
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.hands(this, gb, { support: 0.25, sw: 0.05, sy: -0.012 });
    return 0.05;
  },
  benelli_m4() {
    const M = this.M, gb = new GunBuilder(M);
    const sightY = this._benelliBase(gb, { mat: 'black', tube: 0.36 });
    GP.stock(gb, 'ar', { mat: 'polymer', u: -0.11, len: 0.3 });
    const mz = GP.muzzle(gb, 'none', 0.66, 0.0135, 0.012);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.13, -0.14, -0.34], adsZ: -0.17, flash: 0.28 });
  },
  m1014() {
    const M = this.M, gb = new GunBuilder(M);
    const sightY = this._benelliBase(gb, { mat: 'tan', tube: 0.44 });
    gb.prof([[-0.11, 0.024], [-0.43, 0.012], [-0.46, 0.0], [-0.47, -0.105], [-0.43, -0.115], [-0.22, -0.066], [-0.14, -0.05], [-0.11, -0.03]], 0.04, M.tan, 'body', { bevel: 0.006 }); // fixed stock
    gb.box(0.042, 0.125, 0.016, 0, -0.05, 0.47, M.rubber, 'body', 0.005);
    const mz = GP.muzzle(gb, 'none', 0.66, 0.0135, 0.012);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.13, -0.14, -0.34], adsZ: -0.17, flash: 0.28 });
  },
  saiga12() { // AK-pattern magazine-fed shotgun
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'ak', mat: 'black', u0: -0.14, u1: 0.12, vt: 0.04, w: 0.046 });
    gb.rail(-0.06, 0.1, 0.05, M.black, 'body', 0.021);
    GP.stock(gb, 'skeleton', { mat: 'polymer', u: -0.14, len: 0.26 });
    GP.grip(gb, { mat: 'polymer', u: -0.085, slant: 1.2 }); GP.trigger(gb, { u: -0.04 });
    GP.mag(gb, 'shotbox', { mat: 'polymer', u: 0.0, len: 0.13 });
    GP.handguard(gb, 'quad', { mat: 'black', u0: 0.12, u1: 0.3, r: 0.026 });
    GP.barrel(gb, 0.3, 0.52, 0.013); const mz = GP.muzzle(gb, 'brake', 0.52, 0.014);
    const sightY = gb.redDot(-0.02, 0.05, M.black);
    GP.hands(this, gb, { support: 0.22, sw: 0.05 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.13, -0.15, -0.33], flash: 0.28, reticle: 'dot', magMove: [0, -0.22, 0.04] });
  },
  ksg() { // bullpup pump: twin magazine tubes, pump slide with a vertical grip, top rail + red dot
    const M = this.M, gb = new GunBuilder(M);
    gb.node('pump', new THREE.Vector3(0, -0.03, -0.24));
    gb.prof([[-0.36, 0.024], [-0.37, -0.08], [-0.33, -0.1], [-0.2, -0.1], [-0.16, -0.04], [0.1, -0.04], [0.12, -0.02], [0.12, 0.03], [-0.34, 0.034]], 0.056, M.black, 'body', { bevel: 0.008 });
    gb.box(0.05, 0.1, 0.012, 0, -0.03, 0.375, M.rubber, 'body', 0.004);
    gb.rail(-0.3, 0.1, 0.034, M.black, 'body', 0.022);
    GP.grip(gb, { mat: 'polymer', u: 0.0, vb: -0.04 });
    for (const sx of [-1, 1]) gb.cyl(0.013, 0.013, 0.3, sx * 0.016, -0.034, 0.26, M.black, 'body', 14);
    gb.cyl(0.0125, 0.0125, 0.38, 0, 0.004, 0.28, M.steel, 'body', 16);
    gb.box(0.07, 0.036, 0.14, 0, -0.03, -0.24, M.polymer, 'pump', 0.008);
    gb.box(0.022, 0.07, 0.026, 0, -0.08, -0.24, M.polymer, 'pump', 0.006);
    const sightY = gb.redDot(-0.08, 0.034, M.black);
    this.arm(gb, [0.02, -0.12, 0.02], [0.19, -0.3, 0.36], 0.034); this.gripHand(gb, 0.001, -0.09, 0.01, -0.3);
    this.arm(gb, [-0.03, -0.14, -0.22], [-0.3, -0.34, 0.04], 0.033, 'pump');
    gb.box(0.05, 0.075, 0.07, -0.004, -0.085, -0.244, M.glove, 'pump', 0.018); for (let i = 0; i < 3; i++) gb.box(0.056, 0.017, 0.028, -0.004, -0.058 - i * 0.019, -0.28, M.glove, 'pump', 0.007);
    return this._fin(gb, { muzzleU: 0.47, sightY, hipPos: [0.125, -0.14, -0.31], adsZ: -0.14, flash: 0.28, reticle: 'dot', pump: true });
  },

  /* ------------------------------ snipers ------------------------------ */
  awp() { // Arctic Warfare: green thumbhole stock, 10-rd box mag, big scope, muzzle brake, folded bipod
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, -0.04)).node('bolt', new THREE.Vector3(0.03, 0.02, 0.1));
    GP.recv(gb, { style: 'bolt', mat: 'black', u0: -0.12, u1: 0.18, w: 0.046 });
    gb.rail(-0.1, 0.16, 0.026, M.black, 'body', 0.022);
    gb.prof([[-0.16, 0.012], [0.3, 0.012], [0.32, -0.02], [0.3, -0.04], [0.04, -0.045], [-0.02, -0.04], [-0.16, -0.03]], 0.05, M.odGreen, 'body', { bevel: 0.008 }); // chassis
    GP.stock(gb, 'thumbhole', { mat: 'odGreen', u: -0.16, len: 0.3, vt: 0.012 });
    gb.box(0.04, 0.09, 0.07, 0, -0.08, -0.06, M.black, 'mag', 0.004);
    GP.trigger(gb, { u: -0.05, vb: -0.04 });
    GP.barrel(gb, 0.3, 0.86, 0.0125); const mz = GP.muzzle(gb, 'brake', 0.86, 0.013);
    GP.bipod(gb, 0.28, -0.04, 0.2);
    gb.cylAxis(0.006, 0.05, 0.055, 0.004, -0.1, 'x', M.bright, 'bolt'); const k = new THREE.SphereGeometry(0.012, 12, 10); k.translate(0.082, 0.004, 0.1); gb.add(k, M.black, 'bolt');
    const sightY = GP.scope(gb, -0.1, 0.26, 0.02, 0.026, { mat: 'black' });
    this.arm(gb, [0.02, -0.12, 0.12], [0.19, -0.3, 0.44], 0.034); this.gripHand(gb, 0.001, -0.092, -0.1, -0.3);
    this.arm(gb, [-0.04, -0.07, -0.26], [-0.32, -0.3, 0.02], 0.033); this.supportHand(gb, 0, -0.016, 0.26, 0.052);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.32, bolt: true });
  },
  barrett() { // M82: massive receiver, arrow muzzle brake, carry handle, bipod, big box mag
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.06, -0.02)).node('charge', new THREE.Vector3(0.036, 0.0, -0.1));
    gb.prof([[-0.2, 0.03], [0.34, 0.03], [0.36, 0.0], [0.34, -0.045], [0.08, -0.05], [-0.04, -0.05], [-0.2, -0.04]], 0.062, M.parkerized, 'body', { bevel: 0.006 });
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.03, 0.012, sx * 0.0315, -0.008, -(0.14 + i * 0.022), M.black);
    gb.rail(-0.16, 0.2, 0.03, M.black, 'body', 0.024);
    gb.box(0.014, 0.04, 0.12, 0, 0.05, -0.24, M.parkerized, 'body', 0.005); gb.box(0.03, 0.012, 0.012, 0, 0.036, -0.2, M.parkerized); // carry handle
    gb.prof([[-0.2, 0.02], [-0.42, 0.024], [-0.46, 0.01], [-0.47, -0.1], [-0.43, -0.11], [-0.3, -0.07], [-0.2, -0.04]], 0.05, M.parkerized, 'body', { bevel: 0.006 });
    gb.box(0.05, 0.13, 0.03, 0, -0.045, 0.475, M.rubber, 'body', 0.006); gb.box(0.03, 0.02, 0.1, 0, 0.034, 0.38, M.parkerized, 'body', 0.005);
    GP.grip(gb, { mat: 'polymer', u: -0.09, vb: -0.045 }); GP.trigger(gb, { u: -0.05, vb: -0.045 });
    gb.box(0.05, 0.11, 0.08, 0, -0.1, -0.03, M.black, 'mag', 0.005);
    gb.box(0.012, 0.018, 0.02, 0.04, 0.0, 0.1, M.black, 'charge', 0.003);
    GP.barrel(gb, 0.36, 0.86, 0.016); const mz = GP.muzzle(gb, 'arrow', 0.86, 0.016);
    GP.bipod(gb, 0.34, -0.05, 0.26);
    const sightY = GP.scope(gb, -0.12, 0.26, 0.022, 0.03, { mat: 'black' });
    this.arm(gb, [0.02, -0.13, 0.12], [0.19, -0.31, 0.44], 0.034); this.gripHand(gb, 0.001, -0.1, -0.09, -0.33);
    this.arm(gb, [-0.04, -0.08, -0.28], [-0.32, -0.3, 0.02], 0.033); this.supportHand(gb, 0, -0.02, 0.28, 0.064);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.15, -0.16, -0.38], adsZ: -0.12, flash: 0.42, magMove: [0, -0.24, 0.02] });
  },
  kar98k() { // full-length walnut stock, turned-down bolt, low-power scope, hooded front sight
    const M = this.M, gb = new GunBuilder(M);
    gb.node('bolt', new THREE.Vector3(0.028, 0.02, 0.09));
    GP.recv(gb, { style: 'bolt', mat: 'steelBlue', u0: -0.1, u1: 0.14, w: 0.038 });
    gb.prof([[-0.1, 0.006], [0.56, 0.006], [0.6, -0.004], [0.58, -0.028], [0.1, -0.04], [-0.02, -0.04], [-0.06, -0.06], [-0.1, -0.06]], 0.042, M.wood, 'body', { bevel: 0.008 });
    GP.stock(gb, 'wood', { mat: 'wood', u: -0.1, len: 0.34, vt: 0.012 });
    for (const u of [0.3, 0.5]) gb.torus(0.022, 0.003, 0, -0.006, u, 'z', M.steelBlue);
    GP.trigger(gb, { u: -0.05, vb: -0.04, mat: 'steelBlue' });
    GP.barrel(gb, 0.14, 0.76, 0.0095, 'steelBlue');
    gb.box(0.016, 0.02, 0.02, 0, 0.012, -0.74, M.steelBlue, 'body', 0.003); gb.cyl(0.011, 0.011, 0.024, 0, 0.022, 0.74, M.steelBlue, 'body', 12, true);
    gb.cylAxis(0.005, 0.05, 0.05, -0.012, -0.09, 'x', M.steelBlue, 'bolt'); const k = new THREE.SphereGeometry(0.01, 12, 10); k.translate(0.075, -0.022, 0.09); gb.add(k, M.steelBlue, 'bolt');
    const sightY = GP.scope(gb, -0.06, 0.2, 0.016, 0.02, { mat: 'black' });
    this.arm(gb, [0.02, -0.12, 0.12], [0.19, -0.3, 0.44], 0.034); this.gripHand(gb, 0.001, -0.085, -0.09, -0.46);
    this.arm(gb, [-0.036, -0.06, -0.3], [-0.32, -0.3, 0.02], 0.033); this.supportHand(gb, 0, -0.012, 0.3, 0.046);
    return this._fin(gb, { muzzleU: 0.77, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.3, bolt: true });
  },
  svd() { // skeletonised wood thumbhole stock, slotted wood handguard, PSO-1 on the left side rail
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'ak', mat: 'steelBlue', u0: -0.14, u1: 0.12, vt: 0.038 });
    GP.stock(gb, 'thumbhole', { mat: 'wood', u: -0.12, len: 0.3, vt: 0.02 });
    GP.trigger(gb, { u: -0.04, mat: 'steelBlue' });
    gb.box(0.03, 0.12, 0.06, 0, -0.09, -0.03, M.bakelite, 'mag', 0.004, 0.12);
    GP.handguard(gb, 'svd', { mat: 'wood', u0: 0.12, u1: 0.34, r: 0.024 });
    GP.barrel(gb, 0.34, 0.86, 0.0095); GP.gasTube(gb, 0.34, 0.44, 0.024, 0.007);
    const mz = GP.muzzle(gb, 'slots', 0.86, 0.011);
    gb.box(0.008, 0.05, 0.12, -0.026, 0.02, -0.02, M.steelBlue, 'body', 0.003);
    const sightY = GP.scope(gb, -0.1, 0.22, 0.017, 0.05, { mat: 'black', x: -0.01 });
    GP.iron(gb, 0.11, 0.82, 0.05, { mat: 'steelBlue', base: 0.036 });
    GP.hands(this, gb, { support: 0.24, sw: 0.046, grip: -0.09 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.26, magMove: [0, -0.22, 0.02] });
  },

  /* ------------------------------ pistols ------------------------------ */
  _pistol(gb, o) { // common frame + two-handed grip; returns sight height
    const M = this.M, sm = GP.m(gb, o.slide), fm = GP.m(gb, o.frame);
    gb.node('slide', new THREE.Vector3(0, 0, 0)).node('mag', new THREE.Vector3(0, -0.1, 0.06));
    const L = o.len ?? 0.2, top = o.top ?? 0.032, u0 = -0.085, u1 = u0 + L;
    gb.prof([[u0, 0.004], [u1, 0.004], [u1 + 0.004, 0.014], [u1, top], [u0 + 0.004, top], [u0, top - 0.006]], o.w ?? 0.03, sm, 'slide', { bevel: 0.003 });
    for (let i = 0; i < 7; i++) gb.box((o.w ?? 0.03) + 0.002, 0.018, 0.0025, 0, 0.018, -(u0 + 0.01 + i * 0.006), M.polymer, 'slide');
    gb.box(0.008, 0.007, 0.008, 0, top + 0.0035, -(u0 + 0.008), M.black, 'slide'); gb.box(0.0035, 0.007, 0.008, 0, top + 0.0035, -(u1 - 0.006), M.black, 'slide');
    const d1 = new THREE.SphereGeometry(0.0017, 8, 6); d1.translate(0, top + 0.006, -(u1 - 0.01)); gb.add(d1, M.dotW, 'slide');
    gb.cyl(0.0075, 0.0075, 0.012, 0, 0.018, u1 + 0.004, M.steel, 'slide', 12);
    gb.prof([[u0 + 0.01, -0.018], [u1 - 0.01, -0.018], [u1 - 0.01, 0.004], [u0 + 0.01, 0.004]], (o.w ?? 0.03) - 0.003, fm, 'body', { bevel: 0.002 });
    gb.prof([[-0.012, -0.018], [0.05, -0.018], [0.056, -0.028], [0.046, -0.05], [-0.006, -0.054], [-0.022, -0.034]], 0.02, fm, 'body', { bevel: 0.002, holes: [[[0.0, -0.024], [0.042, -0.024], [0.038, -0.042], [0.002, -0.045]]] });
    gb.box(0.004, 0.018, 0.005, 0, -0.03, -0.02, M.bright);
    gb.prof([[-0.075, -0.018], [-0.02, -0.018], [-0.04, -0.108], [-0.076, -0.112], [-0.09, -0.098], [-0.086, -0.03]], (o.w ?? 0.03) + 0.002, GP.m(gb, o.grip || 'rubber'), 'body', { bevel: 0.005 });
    gb.box(0.05, 0.07, 0.078, 0.006, -0.058, 0.057, M.glove, 'body', 0.02, -0.28); gb.box(0.04, 0.066, 0.078, -0.028, -0.064, 0.045, M.glove, 'body', 0.02, -0.28, 0.2);
    this.arm(gb, [0.012, -0.1, 0.1], [0.14, -0.24, 0.42], 0.036); this.arm(gb, [-0.03, -0.1, 0.09], [-0.16, -0.25, 0.4], 0.036);
    return top + 0.0045;
  },
  glock18() {
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'black', frame: 'polymer', grip: 'polymer', len: 0.19, top: 0.03, w: 0.029 });
    gb.box(0.03, 0.07, 0.04, 0, -0.14, 0.064, M.polymer, 'mag', 0.004, -0.28); // extended 33-round mag
    gb.box(0.006, 0.008, 0.01, 0.016, 0.024, 0.075, M.bright, 'slide'); // auto selector
    return this._fin(gb, { muzzleU: 0.11, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.13, slide: true });
  },
  usp() {
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'black', frame: 'polymer', grip: 'polymer', len: 0.2, top: 0.034, w: 0.031 });
    gb.rail(0.06, 0.1, -0.022, M.polymer, 'body', 0.02);
    gb.cyl(0.015, 0.015, 0.15, 0, 0.018, 0.195, M.suppressor, 'slide', 24);
    return this._fin(gb, { muzzleU: 0.27, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.08, slide: true });
  },
  m1911() {
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'parkerized', frame: 'parkerized', grip: 'wood', len: 0.21, top: 0.03, w: 0.028 });
    gb.box(0.008, 0.016, 0.012, 0, 0.012, 0.09, M.black, 'body', 0.002, 0.4); // hammer
    gb.box(0.03, 0.02, 0.012, 0, -0.02, 0.082, M.parkerized, 'body', 0.003); // grip safety
    for (const sx of [-1, 1]) gb.cylAxis(0.003, 0.004, sx * 0.016, -0.05, 0.06, 'x', M.bright);
    return this._fin(gb, { muzzleU: 0.13, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.15, slide: true });
  },
});

/* =====================================================================
   v41 SF2 ARSENAL MODELS — dedicated first-person builders for the 27 guns added in v40 (previously shared models),
   assembled from the GP part library. Silhouettes follow each real gun.
   ===================================================================== */
Object.assign(WeaponModels.prototype, {
  _ar15(gb, o) { // AR-15 family core: receiver, buffer-tube stock, grip, trigger, STANAG mag
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0, 0.03, -0.1));
    GP.recv(gb, { style: 'ar', mat: o.recv || 'black', u0: -0.12, u1: 0.12, vt: 0.036 });
    GP.stock(gb, o.stock || 'ar', { mat: o.stockMat || 'polymer', u: -0.12, len: o.stockLen ?? 0.26 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'stanag', { mat: o.magMat || 'black', u: 0.0, len: 0.17 });
  },
  m16a3() { // full-length rifle: round handguard, carry handle with rear aperture, A2 front sight post, bird-cage
    const M = this.M, gb = new GunBuilder(M);
    this._ar15(gb, { stock: 'wood', stockMat: 'polymer', stockLen: 0.3 });
    GP.handguard(gb, 'round', { mat: 'polymer', u0: 0.12, u1: 0.42, r: 0.026 });
    GP.barrel(gb, 0.42, 0.62, 0.0085); const mz = GP.muzzle(gb, 'bird', 0.62, 0.0105);
    gb.prof([[-0.08, 0.036], [0.1, 0.036], [0.09, 0.07], [-0.07, 0.07]], 0.016, M.black, 'body', { bevel: 0.003, holes: [[[-0.05, 0.042], [0.07, 0.042], [0.065, 0.062], [-0.045, 0.062]]] }); // carry handle
    const sightY = GP.iron(gb, -0.06, 0.5, 0.074, { base: 0.07, frontBase: 0.012 });
    GP.hands(this, gb, { support: 0.28, sw: 0.052 });
    return this._fin(gb, { muzzleU: mz, sightY, adsPos: [0, -(sightY + 0.012), -0.28], flash: 0.22 });
  },
  k2() { // Korean K2: AR-like upper, side-folding polymer stock, ribbed handguard, holo
    const M = this.M, gb = new GunBuilder(M);
    this._ar15(gb, { stock: 'skeleton', stockMat: 'polymer', stockLen: 0.24 });
    gb.rail(-0.11, 0.1, 0.036, M.black, 'body', 0.022);
    GP.handguard(gb, 'akwood', { mat: 'polymer', u0: 0.12, u1: 0.32, r: 0.024 });
    GP.barrel(gb, 0.32, 0.5, 0.009); const mz = GP.muzzle(gb, 'slots', 0.5, 0.011);
    const sightY = gb.holo(-0.04, 0.036, M.black);
    GP.hands(this, gb, { support: 0.23, sw: 0.048 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: true, flash: 0.2 });
  },
  type89() { // Howa Type 89: black AR-pattern, slim handguard, folded bipod, iron sights
    const M = this.M, gb = new GunBuilder(M);
    this._ar15(gb, { stock: 'ar', stockLen: 0.27 });
    GP.handguard(gb, 'round', { mat: 'polymer', u0: 0.12, u1: 0.34, r: 0.023 });
    GP.barrel(gb, 0.34, 0.54, 0.0085); const mz = GP.muzzle(gb, 'cone', 0.54, 0.0105);
    GP.bipod(gb, 0.33, -0.026, 0.18);
    const sightY = GP.iron(gb, -0.03, 0.46, 0.06, { base: 0.036 });
    GP.hands(this, gb, { support: 0.24, sw: 0.048 });
    return this._fin(gb, { muzzleU: mz, sightY, adsPos: [0, -(sightY + 0.008), -0.24], flash: 0.2 });
  },
  xm8() { // XM8: one-piece rounded polymer shell, integrated carry-handle optic, curved mag
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.02));
    gb.prof([[-0.13, -0.034], [0.28, -0.034], [0.32, -0.01], [0.3, 0.03], [0.1, 0.04], [-0.12, 0.04], [-0.13, 0.02]], 0.05, M.tan, 'body', { bevel: 0.012 }); // shell
    GP.stock(gb, 'skeleton', { mat: 'tan', u: -0.13, len: 0.24 });
    GP.grip(gb, { mat: 'tan', u: -0.08, vb: -0.034 }); GP.trigger(gb, { u: -0.036, vb: -0.034 });
    GP.mag(gb, 'stanag', { mat: 'magClear', u: 0.0, len: 0.17, vb: -0.034 });
    gb.prof([[-0.06, 0.04], [0.12, 0.04], [0.11, 0.066], [-0.05, 0.066]], 0.03, M.tan, 'body', { bevel: 0.006, holes: [[[-0.03, 0.044], [0.08, 0.044], [0.08, 0.06], [-0.03, 0.06]]] });
    GP.barrel(gb, 0.32, 0.44, 0.0085); const mz = GP.muzzle(gb, 'bird', 0.44, 0.0105);
    const sightY = gb.redDot(0.0, 0.066, M.black);
    GP.hands(this, gb, { support: 0.22, sw: 0.054, sy: -0.006 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', flash: 0.18 });
  },
  galil() { // Galil ARM: AK action, wooden handguard, folding skeleton stock, carry handle bar, 35-rd curved mag
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0.03, 0.02, -0.1));
    GP.recv(gb, { style: 'ak', mat: 'parkerized', u0: -0.14, u1: 0.12, vt: 0.038 });
    GP.stock(gb, 'skeleton', { mat: 'parkerized', u: -0.14, len: 0.25 });
    GP.grip(gb, { mat: 'polymer', u: -0.085, slant: 1.2 }); GP.trigger(gb, { u: -0.04 });
    GP.mag(gb, 'ak', { mat: 'black', u: 0.0, len: 0.2 });
    GP.handguard(gb, 'akwood', { mat: 'wood', u0: 0.12, u1: 0.3, r: 0.023 });
    GP.barrel(gb, 0.3, 0.5, 0.009); GP.gasTube(gb, 0.3, 0.36, 0.026, 0.0065);
    gb.box(0.012, 0.012, 0.09, 0, 0.06, -0.06, M.parkerized, 'body', 0.003); // carry handle bar
    const mz = GP.muzzle(gb, 'slots', 0.5, 0.011);
    const sightY = GP.iron(gb, 0.1, 0.46, 0.054, { base: 0.036, frontBase: 0.012 });
    GP.hands(this, gb, { support: 0.22, sw: 0.046 });
    return this._fin(gb, { muzzleU: mz, sightY, flash: 0.22 });
  },
  sg551() { // SIG SG 551: translucent orange-brown mag, folding skeleton stock, slotted handguard, diopter + red dot
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'ar', mat: 'black', u0: -0.12, u1: 0.12, vt: 0.036, w: 0.042 });
    GP.stock(gb, 'skeleton', { mat: 'polymer', u: -0.12, len: 0.25 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'stanag', { mat: 'magClear', u: 0.0, len: 0.16 });
    GP.handguard(gb, 'svd', { mat: 'polymer', u0: 0.12, u1: 0.3, r: 0.025 });
    GP.barrel(gb, 0.3, 0.44, 0.009); const mz = GP.muzzle(gb, 'bird', 0.44, 0.0105);
    gb.rail(-0.1, 0.1, 0.036, M.black, 'body', 0.022);
    const sightY = gb.redDot(-0.03, 0.036, M.black);
    GP.hands(this, gb, { support: 0.22, sw: 0.052 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', flash: 0.2 });
  },
  hk417() { // 7.62 AR-10: thick receiver, quad-rail handguard, 20-rd straight mag, holo
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(0, 0.03, -0.1));
    GP.recv(gb, { style: 'ar', mat: 'black', u0: -0.12, u1: 0.13, vt: 0.04, w: 0.046 });
    GP.stock(gb, 'ar', { mat: 'polymer', u: -0.12, len: 0.27 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'straight', { mat: 'black', u: 0.0, len: 0.13, w: 0.03, tilt: 0.04 });
    GP.handguard(gb, 'quad', { mat: 'black', u0: 0.13, u1: 0.36, r: 0.026 });
    gb.rail(-0.11, 0.13, 0.04, M.black, 'body', 0.022);
    GP.barrel(gb, 0.36, 0.54, 0.0105); const mz = GP.muzzle(gb, 'brake', 0.54, 0.0115);
    const sightY = gb.holo(-0.04, 0.04, M.black);
    GP.hands(this, gb, { support: 0.25, sw: 0.054 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: true, flash: 0.24 });
  },
  scarh() { // SCAR-H: SCAR-L shell in black, 20-rd 7.62 mag, longer barrel, brake
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03)).node('charge', new THREE.Vector3(-0.026, 0.02, -0.1));
    GP.recv(gb, { mat: 'black', u0: -0.12, u1: 0.12, vt: 0.036, w: 0.046 });
    gb.prof([[-0.12, 0.036], [0.32, 0.036], [0.32, 0.048], [-0.12, 0.048]], 0.036, M.black, 'body', { bevel: 0.003 });
    gb.rail(-0.11, 0.31, 0.048, M.black, 'body', 0.022);
    gb.box(0.052, 0.052, 0.2, 0, 0.012, -0.22, M.black, 'body', 0.008);
    GP.stock(gb, 'skeleton', { mat: 'black', u: -0.12, len: 0.27 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'straight', { mat: 'black', u: 0.0, len: 0.13, w: 0.032, tilt: 0.05 });
    GP.barrel(gb, 0.32, 0.48, 0.0105); const mz = GP.muzzle(gb, 'brake', 0.48, 0.0115);
    const sightY = gb.holo(-0.04, 0.048, M.black);
    GP.hands(this, gb, { support: 0.23, sw: 0.054 });
    return this._fin(gb, { muzzleU: mz, sightY, reticle: true, flash: 0.22 });
  },
  qbz97() { // QBZ-97: bullpup with the mag behind the grip, carry-handle sight rail, short handguard
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, 0.12));
    gb.prof([[-0.38, 0.03], [-0.38, -0.08], [-0.33, -0.1], [-0.22, -0.1], [-0.18, -0.04], [0.12, -0.04], [0.2, -0.02], [0.2, 0.02], [0.08, 0.03]], 0.05, M.black, 'body', { bevel: 0.008 });
    gb.box(0.05, 0.1, 0.012, 0, -0.03, 0.385, M.rubber, 'body', 0.004);
    GP.grip(gb, { mat: 'polymer', u: 0.02, vb: -0.04 });
    GP.mag(gb, 'stanag', { mat: 'black', u: -0.2, len: 0.15, vb: -0.04 });
    gb.prof([[-0.18, 0.03], [0.04, 0.03], [0.04, 0.06], [-0.18, 0.06]], 0.022, M.black, 'body', { bevel: 0.004 }); // sight bridge
    GP.barrel(gb, 0.2, 0.34, 0.009); const mz = GP.muzzle(gb, 'bird', 0.34, 0.0105);
    const sightY = gb.redDot(-0.12, 0.06, M.black);
    this.arm(gb, [0.02, -0.12, 0.0], [0.19, -0.3, 0.36], 0.034); this.gripHand(gb, 0.001, -0.09, 0.028, -0.36);
    this.arm(gb, [-0.036, -0.06, -0.16], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.012, 0.15, 0.05);
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', hipPos: [0.12, -0.15, -0.31], flash: 0.18, magMove: [0, -0.26, 0.04] });
  },

  /* ---------------- SMGs ---------------- */
  pp2000() { // PP-2000: slab-sided polymer frame with the trigger-guard grip cut-out, mag in the grip, extended 44-rd mag
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.1, 0.04));
    gb.prof([[-0.08, 0.034], [0.16, 0.034], [0.17, 0.0], [0.15, -0.03], [0.04, -0.03], [0.03, -0.1], [-0.01, -0.1], [-0.03, -0.03], [-0.08, -0.025]], 0.036, M.polymer, 'body', {
      bevel: 0.006, holes: [[[0.06, -0.012], [0.13, -0.012], [0.13, 0.016], [0.06, 0.016]]] });
    gb.box(0.026, 0.2, 0.034, 0, -0.17, -0.0, M.black, 'mag', 0.003, 0.08);
    gb.rail(-0.06, 0.12, 0.034, M.black, 'body', 0.02);
    GP.trigger(gb, { u: -0.02, vb: -0.03 });
    GP.barrel(gb, 0.17, 0.21, 0.009); const mz = GP.muzzle(gb, 'none', 0.21, 0.009);
    const sightY = gb.redDot(-0.02, 0.034, M.black);
    this.arm(gb, [0.02, -0.12, 0.02], [0.18, -0.3, 0.38], 0.034); this.gripHand(gb, 0.001, -0.07, 0.01, -0.3);
    this.arm(gb, [-0.036, -0.03, -0.1], [-0.28, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.008, 0.1, 0.044);
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', hipPos: [0.12, -0.13, -0.3], flash: 0.13 });
  },
  vz61() { // Scorpion: tiny receiver, wire stock folded over the top, curved 20-rd mag ahead of the trigger, iron sights
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.04));
    GP.recv(gb, { style: 'smg', mat: 'parkerized', u0: -0.1, u1: 0.12, vt: 0.03, vb: -0.03, w: 0.034 });
    GP.stock(gb, 'wire', { u: -0.1, len: 0.2 });
    GP.grip(gb, { mat: 'woodDark', u: -0.08, vb: -0.03, len: 0.08 }); GP.trigger(gb, { u: -0.04, vb: -0.03 });
    GP.mag(gb, 'ak', { mat: 'parkerized', u: 0.0, len: 0.13, w: 0.02, vb: -0.03 });
    GP.barrel(gb, 0.12, 0.2, 0.0075); const mz = GP.muzzle(gb, 'none', 0.2, 0.0085);
    const sightY = GP.iron(gb, -0.06, 0.11, 0.046, { base: 0.03, frontBase: 0.03 });
    GP.hands(this, gb, { support: 0.1, sw: 0.04, grip: -0.085 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.12, -0.13, -0.3], adsPos: [0, -(sightY + 0.004), -0.26], flash: 0.12 });
  },

  /* ---------------- snipers / DMRs ---------------- */
  _boltSniper(gb, o) { // bolt-action chassis on a stock; returns sightY
    const M = this.M;
    gb.node('mag', new THREE.Vector3(0, -0.04, -0.04)).node('bolt', new THREE.Vector3(0.03, 0.02, 0.1));
    GP.recv(gb, { style: 'bolt', mat: o.recv || 'black', u0: -0.12, u1: 0.18, w: 0.044 });
    gb.prof(o.stockPts || [[-0.14, 0.01], [0.42, 0.01], [0.44, -0.012], [0.42, -0.034], [0.05, -0.04], [-0.02, -0.04], [-0.14, -0.03]], 0.046, GP.m(gb, o.stockMat), 'body', { bevel: 0.008 });
    GP.stock(gb, o.stock || 'thumbhole', { mat: o.stockMat, u: -0.14, len: 0.3, vt: 0.01 });
    if (o.mag !== false) gb.box(0.036, 0.07, 0.06, 0, -0.07, -0.06, M.black, 'mag', 0.004);
    GP.trigger(gb, { u: -0.05, vb: -0.04 });
    GP.barrel(gb, 0.3, o.barrel || 0.84, o.r || 0.0115);
    gb.cylAxis(0.006, 0.05, 0.055, 0.004, -0.1, 'x', M.bright, 'bolt'); const k = new THREE.SphereGeometry(0.011, 12, 10); k.translate(0.082, 0.004, 0.1); gb.add(k, M.black, 'bolt');
    if (o.bipod) GP.bipod(gb, 0.38, -0.034, 0.2);
    const sightY = GP.scope(gb, -0.1, o.scopeLen || 0.26, o.scopeR || 0.019, 0.024, { mat: 'black' });
    this.arm(gb, [0.02, -0.12, 0.12], [0.19, -0.3, 0.44], 0.034); this.gripHand(gb, 0.001, -0.092, -0.1, -0.3);
    this.arm(gb, [-0.04, -0.06, -0.26], [-0.32, -0.3, 0.02], 0.033); this.supportHand(gb, 0, -0.01, 0.26, 0.05);
    return sightY;
  },
  m40a1() { // USMC M40A1: olive McMillan stock, heavy barrel, internal mag (no box)
    const gb = new GunBuilder(this.M), sightY = this._boltSniper(gb, { stockMat: 'odGreen', stock: 'wood', mag: false, barrel: 0.8 });
    const mz = GP.muzzle(gb, 'none', 0.8, 0.012);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.3, bolt: true });
  },
  frf2() { // French FR-F2: black, thermal sleeve over the barrel, bipod, brake
    const M = this.M, gb = new GunBuilder(M), sightY = this._boltSniper(gb, { stockMat: 'polymer', stock: 'wood', barrel: 0.82, bipod: true });
    gb.cyl(0.018, 0.018, 0.36, 0, 0.0, 0.58, M.polymer, 'body', 16); // thermal sleeve
    const mz = GP.muzzle(gb, 'brake', 0.82, 0.013);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.3, bolt: true });
  },
  cz700() { // CZ 700: grey laminated thumbhole stock, fluted barrel, 10-rd mag
    const M = this.M, gb = new GunBuilder(M), sightY = this._boltSniper(gb, { stockMat: 'grayPaint', stock: 'thumbhole', barrel: 0.8 });
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) gb.box(0.002, 0.004, 0.06, sx * 0.0115, 0, -(0.36 + i * 0.07), M.black);
    const mz = GP.muzzle(gb, 'cone', 0.8, 0.012);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.3, bolt: true });
  },
  _dmr(gb, o) { // semi-auto AR-10 / M14 style marksman rifle with a scope; returns sightY
    const M = this.M;
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: o.style || 'ar', mat: o.recv || 'black', u0: -0.12, u1: 0.13, vt: 0.04, w: 0.046 });
    GP.stock(gb, o.stock || 'ar', { mat: o.stockMat || 'polymer', u: -0.12, len: 0.28 });
    GP.grip(gb, { mat: 'polymer', u: -0.078 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'straight', { mat: 'black', u: 0.0, len: o.magLen || 0.12, w: 0.032, tilt: 0.04 });
    GP.handguard(gb, o.hg || 'quad', { mat: o.hgMat || 'black', u0: 0.13, u1: 0.38, r: 0.026 });
    gb.rail(-0.11, 0.13, 0.04, M.black, 'body', 0.022);
    GP.barrel(gb, 0.38, o.barrel || 0.74, 0.011);
    if (o.bipod) GP.bipod(gb, 0.36, -0.028, 0.18);
    const sightY = GP.scope(gb, -0.1, 0.22, 0.017, 0.04, { mat: 'black' });
    GP.hands(this, gb, { support: 0.26, sw: 0.054 });
    return sightY;
  },
  sr25() { const gb = new GunBuilder(this.M), sightY = this._dmr(gb, { barrel: 0.76, magLen: 0.14 }); const mz = GP.muzzle(gb, 'brake', 0.76, 0.012); return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.26, magMove: [0, -0.22, 0.02] }); },
  psg1() { // PSG1: G3-style receiver, adjustable thumbhole stock, big scope, no iron sights
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.035, -0.03));
    GP.recv(gb, { style: 'ak', mat: 'black', u0: -0.13, u1: 0.14, vt: 0.04, w: 0.044 });
    GP.stock(gb, 'thumbhole', { mat: 'polymer', u: -0.12, len: 0.32, vt: 0.02 });
    GP.trigger(gb, { u: -0.04 });
    GP.mag(gb, 'straight', { mat: 'black', u: 0.0, len: 0.12, w: 0.03, tilt: 0.04 });
    GP.handguard(gb, 'lmg', { mat: 'polymer', u0: 0.14, u1: 0.36, r: 0.026 });
    GP.barrel(gb, 0.36, 0.8, 0.011); const mz = GP.muzzle(gb, 'none', 0.8, 0.012);
    const sightY = GP.scope(gb, -0.1, 0.28, 0.021, 0.045, { mat: 'black' });
    GP.hands(this, gb, { support: 0.26, sw: 0.054, grip: -0.09 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.26, magMove: [0, -0.22, 0.02] });
  },
  m14ebr() { // M14 EBR: tan chassis with rails, telescoping stock, 20-rd mag, bipod
    const gb = new GunBuilder(this.M), sightY = this._dmr(gb, { style: 'ak', recv: 'parkerized', stock: 'skeleton', stockMat: 'tan', hg: 'quad', hgMat: 'tan', barrel: 0.7, bipod: true });
    const mz = GP.muzzle(gb, 'slots', 0.7, 0.012);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.14, -0.15, -0.36], adsZ: -0.12, flash: 0.26, magMove: [0, -0.22, 0.02] });
  },

  /* ---------------- LMGs ---------------- */
  mg4() { // MG4: polymer LMG, feed cover, red dot on the cover rail, box mag on the left, bipod
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.04, -0.09, -0.03)).node('cover', new THREE.Vector3(0, 0.05, 0.12));
    GP.recv(gb, { style: 'lmg', mat: 'polymer', u0: -0.14, u1: 0.16, vt: 0.034, vb: -0.042, w: 0.05, coverNode: true });
    GP.stock(gb, 'skeleton', { mat: 'polymer', u: -0.14, len: 0.28 });
    GP.grip(gb, { mat: 'polymer', u: -0.08, vb: -0.042 }); GP.trigger(gb, { u: -0.035, vb: -0.042 });
    GP.mag(gb, 'belt', { mat: 'polymer', u: 0.02, vb: -0.042 });
    GP.handguard(gb, 'lmg', { mat: 'polymer', u0: 0.16, u1: 0.36, r: 0.026 });
    GP.barrel(gb, 0.36, 0.7, 0.011); GP.bipod(gb, 0.6, -0.022, 0.24);
    const mz = GP.muzzle(gb, 'bird', 0.7, 0.012);
    const sightY = gb.redDot(-0.02, 0.058, M.black, 'cover');
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.095, -0.078, -0.36);
    this.arm(gb, [-0.036, -0.06, -0.24], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.01, 0.26, 0.054);
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', hipPos: [0.135, -0.155, -0.35], flash: 0.28, cover: true, magMove: [-0.04, -0.26, 0.02] });
  },
  k3() { // K3: Minimi-like, ribbed handguard, carry handle, 100-rd box, iron sights
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.04, -0.09, -0.03)).node('cover', new THREE.Vector3(0, 0.05, 0.12));
    GP.recv(gb, { style: 'lmg', mat: 'black', u0: -0.14, u1: 0.16, vt: 0.034, vb: -0.042, w: 0.05, coverNode: true });
    GP.stock(gb, 'ar', { mat: 'polymer', u: -0.14, len: 0.3 });
    GP.grip(gb, { mat: 'polymer', u: -0.08, vb: -0.042 }); GP.trigger(gb, { u: -0.035, vb: -0.042 });
    GP.mag(gb, 'belt', { mat: 'greenPaint', u: 0.02, vb: -0.042 });
    GP.handguard(gb, 'lmg', { mat: 'polymer', u0: 0.16, u1: 0.38, r: 0.026 });
    gb.box(0.012, 0.03, 0.1, 0, 0.034, -0.32, M.black, 'body', 0.004);
    GP.barrel(gb, 0.38, 0.72, 0.011); GP.bipod(gb, 0.62, -0.022, 0.24);
    const mz = GP.muzzle(gb, 'bird', 0.72, 0.012);
    const sightY = GP.iron(gb, 0.12, 0.68, 0.054, { base: 0.04 });
    this.arm(gb, [0.02, -0.13, 0.1], [0.19, -0.31, 0.42], 0.034); this.gripHand(gb, 0.001, -0.095, -0.078, -0.36);
    this.arm(gb, [-0.036, -0.06, -0.24], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.01, 0.26, 0.054);
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.155, -0.35], adsPos: [0, -(sightY + 0.046), -0.32], flash: 0.28, cover: true, magMove: [-0.04, -0.26, 0.02] });
  },
  hk23e() { // HK23E: G3-family belt-fed, slotted handguard, drum-like belt box, rear drum sight
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(-0.04, -0.09, -0.03));
    GP.recv(gb, { style: 'ak', mat: 'black', u0: -0.14, u1: 0.16, vt: 0.04, w: 0.048 });
    GP.stock(gb, 'wood', { mat: 'polymer', u: -0.14, len: 0.3 });
    GP.grip(gb, { mat: 'polymer', u: -0.08 }); GP.trigger(gb, { u: -0.035 });
    GP.mag(gb, 'belt', { mat: 'black', u: 0.02 });
    GP.handguard(gb, 'svd', { mat: 'black', u0: 0.16, u1: 0.4, r: 0.026 });
    GP.barrel(gb, 0.4, 0.72, 0.011); GP.bipod(gb, 0.38, -0.028, 0.22);
    const mz = GP.muzzle(gb, 'cone', 0.72, 0.012);
    const sightY = GP.iron(gb, 0.1, 0.68, 0.06, { base: 0.04 });
    GP.hands(this, gb, { support: 0.28, sw: 0.054 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.135, -0.155, -0.35], adsPos: [0, -(sightY + 0.03), -0.3], flash: 0.28, magMove: [-0.04, -0.26, 0.02] });
  },
  l86a1() { // L86A1 LSW: SA80 bullpup, long heavy barrel, SUSAT-style optic, bipod
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.04, 0.12));
    gb.prof([[-0.38, 0.026], [-0.38, -0.08], [-0.33, -0.1], [-0.2, -0.1], [-0.16, -0.04], [0.1, -0.04], [0.16, -0.02], [0.16, 0.026]], 0.052, M.black, 'body', { bevel: 0.008 });
    gb.box(0.052, 0.1, 0.012, 0, -0.03, 0.385, M.rubber, 'body', 0.004);
    GP.grip(gb, { mat: 'polymer', u: 0.02, vb: -0.04 });
    GP.mag(gb, 'stanag', { mat: 'black', u: -0.19, len: 0.15, vb: -0.04 });
    GP.handguard(gb, 'round', { mat: 'polymer', u0: 0.16, u1: 0.32, r: 0.024 });
    GP.barrel(gb, 0.32, 0.62, 0.0105); GP.bipod(gb, 0.5, -0.024, 0.22);
    const mz = GP.muzzle(gb, 'bird', 0.62, 0.0115);
    const sightY = GP.scope(gb, -0.12, 0.16, 0.017, 0.026, { mat: 'black', open: true });
    this.arm(gb, [0.02, -0.12, 0.02], [0.19, -0.3, 0.36], 0.034); this.gripHand(gb, 0.001, -0.1, 0.01, -0.3);
    this.arm(gb, [-0.036, -0.06, -0.22], [-0.3, -0.3, 0.06], 0.033); this.supportHand(gb, 0, -0.006, 0.24, 0.05);
    return this._fin(gb, { muzzleU: mz, sightY, reticle: 'dot', hipPos: [0.125, -0.15, -0.31], adsZ: -0.2, flash: 0.22, magMove: [0, -0.24, 0.04] });
  },

  /* ---------------- shotgun ---------------- */
  aa12() { // AA-12: boxy receiver with the carry handle, 20-rd drum, straight stock in line
    const M = this.M, gb = new GunBuilder(M);
    gb.node('mag', new THREE.Vector3(0, -0.06, -0.06));
    gb.prof([[-0.16, 0.05], [0.3, 0.05], [0.32, 0.02], [0.3, -0.04], [-0.16, -0.04]], 0.056, M.black, 'body', { bevel: 0.008 });
    gb.prof([[-0.1, 0.05], [0.2, 0.05], [0.18, 0.09], [-0.08, 0.09]], 0.02, M.black, 'body', { bevel: 0.004, holes: [[[-0.06, 0.056], [0.16, 0.056], [0.15, 0.08], [-0.05, 0.08]]] });
    gb.box(0.05, 0.06, 0.16, 0, 0.02, 0.24, M.polymer, 'body', 0.01); // straight stock
    GP.grip(gb, { mat: 'polymer', u: -0.06, vb: -0.04 }); GP.trigger(gb, { u: -0.02, vb: -0.04 });
    GP.mag(gb, 'drum', { mat: 'black', u: 0.04, vb: -0.04, r: 0.075 });
    GP.barrel(gb, 0.32, 0.46, 0.013); const mz = GP.muzzle(gb, 'none', 0.46, 0.0145);
    const sightY = GP.iron(gb, 0.0, 0.3, 0.098, { base: 0.09, frontBase: 0.05 });
    GP.hands(this, gb, { support: 0.22, sw: 0.06, grip: -0.07, gy: -0.09 });
    return this._fin(gb, { muzzleU: mz, sightY, hipPos: [0.13, -0.15, -0.34], adsPos: [0, -(sightY + 0.008), -0.24], flash: 0.28 });
  },

  /* ---------------- pistols ---------------- */
  m92fs() { // Beretta 92: open-top slide (two-tone), wood grips
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'black', frame: 'black', grip: 'wood', len: 0.21, top: 0.03, w: 0.029 });
    gb.box(0.016, 0.012, 0.05, 0, 0.022, 0.07, M.steel, 'slide', 0.002); // exposed barrel window
    return this._fin(gb, { muzzleU: 0.13, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.14, slide: true });
  },
  cz75() { // CZ 75: slide rides inside the frame, two-tone silver slide
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'steel', frame: 'black', grip: 'rubber', len: 0.2, top: 0.029, w: 0.028 });
    return this._fin(gb, { muzzleU: 0.12, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.14, slide: true });
  },
  jericho() { // Jericho 941: full steel, polygonal, slightly taller slide
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'parkerized', frame: 'parkerized', grip: 'rubber', len: 0.205, top: 0.034, w: 0.031 });
    return this._fin(gb, { muzzleU: 0.125, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.14, slide: true });
  },
  infinity() { // Infinity race gun: compensator, two-tone gold barrel, extended mag
    const M = this.M, gb = new GunBuilder(M);
    const sy = this._pistol(gb, { slide: 'steel', frame: 'black', grip: 'polymer', len: 0.21, top: 0.031, w: 0.029 });
    gb.box(0.032, 0.028, 0.05, 0, 0.011, 0.155, M.black, 'slide', 0.006); // compensator (top stays under the sight line)
    gb.box(0.03, 0.05, 0.04, 0, -0.13, 0.062, M.polymer, 'mag', 0.004, -0.28);
    return this._fin(gb, { muzzleU: 0.18, sightY: sy, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.14, slide: true });
  },
  sw60() { // S&W Model 60: snub-nose revolver — cylinder, short barrel with ejector shroud, round butt
    const M = this.M, gb = new GunBuilder(M);
    gb.node('slide', new THREE.Vector3(0, 0, 0)).node('mag', new THREE.Vector3(0, 0, 0));
    gb.cyl(0.022, 0.022, 0.05, 0, 0.012, 0.0, M.steel, 'body', 18); // cylinder
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; gb.box(0.003, 0.003, 0.05, Math.cos(a) * 0.022, 0.012 + Math.sin(a) * 0.022, 0, M.black); }
    gb.prof([[-0.05, 0.03], [0.02, 0.03], [0.02, -0.01], [-0.05, -0.012]], 0.024, M.steel, 'body', { bevel: 0.003 }); // frame
    gb.cyl(0.008, 0.008, 0.06, 0, 0.022, 0.06, M.steel, 'body', 14); gb.box(0.014, 0.012, 0.05, 0, 0.012, -0.065, M.steel, 'body', 0.003); // barrel + shroud
    gb.box(0.003, 0.008, 0.005, 0, 0.034, -0.088, M.steel); // ramp front sight
    gb.prof([[-0.075, -0.012], [-0.03, -0.012], [-0.045, -0.09], [-0.08, -0.095], [-0.092, -0.06]], 0.03, M.wood, 'body', { bevel: 0.006 }); // round-butt grip
    gb.box(0.008, 0.016, 0.012, 0, 0.032, 0.05, M.black, 'body', 0.002, 0.4); // hammer
    gb.box(0.05, 0.07, 0.078, 0.006, -0.058, 0.057, M.glove, 'body', 0.02, -0.28); gb.box(0.04, 0.066, 0.078, -0.028, -0.064, 0.045, M.glove, 'body', 0.02, -0.28, 0.2);
    this.arm(gb, [0.012, -0.1, 0.1], [0.14, -0.24, 0.42], 0.036); this.arm(gb, [-0.03, -0.1, 0.09], [-0.16, -0.25, 0.4], 0.036);
    return this._fin(gb, { muzzleU: 0.09, sightY: 0.04, hipPos: [0.095, -0.1, -0.27], adsZ: -0.25, flash: 0.15 });
  },
});

// Generic low-poly third-person model from a database `tp` spec (used by soldiers, drops and grenades).
WeaponModels.prototype.tpGeneric = function (spec) {
  const list = [], C = (hex) => new THREE.Color(hex);
  const bx = (w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push([g, col]); };
  const cy = (r, len, x, y, z, col) => { const g = new THREE.CylinderGeometry(r, r, len, 8); g.rotateX(Math.PI / 2); g.translate(x, y, z); list.push([g, col]); };
  const body = C({ dark: 0x1c1d1f, wood: 0x2a2624, tan: 0x9a8566, green: 0x4a5236, steel: 0x6a6e72 }[spec.body] || 0x1c1d1f), wood = C(0x6b4428), poly = C(0x151515);
  const L = spec.len || 0.9;
  if (spec.pistol) { bx(0.03, 0.045, L * 0.9, 0, 0, -L * 0.3, body); bx(0.03, 0.11, 0.045, 0, -0.07, 0.05, poly); if (L > 0.25) cy(0.016, 0.14, 0, 0.01, -0.3, poly); }
  else {
    const rear = spec.bull ? 0.28 : 0.2;
    bx(0.046, 0.07, L * 0.42, 0, 0, -L * 0.12 + (spec.bull ? 0.08 : 0), body);
    bx(0.04, 0.085, rear, 0, -0.012, rear / 2 + 0.06, spec.body === 'wood' ? wood : body);
    cy(0.011, L * 0.42, 0, 0.008, -L * 0.52, C(0x2a2c30));
    bx(0.03, 0.12, 0.04, 0, -0.07, spec.bull ? 0.1 : 0.02, poly);
    if (spec.mag === 'curve') { const g = new THREE.BoxGeometry(0.028, 0.16, 0.05); g.rotateX(0.35); g.translate(0, -0.1, -0.1); list.push([g, C(0x5a2a18)]); }
    else if (spec.mag === 'box') bx(0.03, 0.13, 0.05, 0, -0.08, spec.bull ? 0.14 : -0.08, poly);
    else if (spec.mag === 'drum') { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12); g.rotateZ(Math.PI / 2); g.translate(0, -0.08, -0.08); list.push([g, poly]); }
    else if (spec.mag === 'belt') bx(0.07, 0.1, 0.1, -0.04, -0.09, -0.06, C(0x3e4a2c));
    if (spec.body === 'wood') bx(0.042, 0.05, L * 0.25, 0, -0.01, -L * 0.36, wood);
    if (spec.scope) cy(0.022, 0.28, 0, 0.07, -0.08, poly);
  }
  const geos = list.map(([g, col]) => { const ng = g.index ? g.toNonIndexed() : g; const n = ng.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); ng.deleteAttribute('uv'); return ng; });
  return mergeGeometries(geos, false);
};

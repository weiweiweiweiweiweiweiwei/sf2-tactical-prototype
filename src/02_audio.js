/* =====================================================================
   AUDIO ENGINE — 100% procedural.
   Gunshots/explosions are pre-rendered with OfflineAudioContext into
   layered stereo banks (supersonic crack · driven blast body · sub
   thump · mechanical action · baked early reflections · room tail),
   then played with HRTF panning, distance low-pass, speed-of-sound
   delay, per-map convolution reverb and outdoor slap-back echo.
   ===================================================================== */
const GUN_PROFILES = {
  m4:   { dur: 1.0, crack: { g: 1.0, hp: 2200, tau: 0.004 }, body: { g: 1.0, f: 950, q: 0.7, tau: 0.05, drive: 3.5 },
          low: { g: 1.0, f0: 150, f1: 48, sweep: 0.08, tau: 0.085, drive: 2.2 }, punch: { g: 0.55, f0: 600, f1: 170, tau: 0.028 },
          mech: { g: 0.22, t: 0.02, f: [3400, 2100], q: 9 }, refl: 1.0, tail: { g: 0.35, lp: 700, tau: 0.22 } },
  g36s: { dur: 0.7, crack: { g: 0.07, hp: 3000, tau: 0.002 }, body: { g: 0.38, f: 650, q: 0.9, tau: 0.028, drive: 1.5 },
          low: { g: 0.45, f0: 110, f1: 50, sweep: 0.05, tau: 0.05, drive: 1.2 }, punch: { g: 0.3, f0: 380, f1: 150, tau: 0.02 },
          pfft: { g: 0.75, lp: 1400, tau: 0.026 }, mech: { g: 0.6, t: 0.012, f: [3000, 1800, 4200], q: 10 }, refl: 0.35, tail: { g: 0.12, lp: 500, tau: 0.12 } },
  mp5:  { dur: 0.9, crack: { g: 0.85, hp: 2800, tau: 0.003 }, body: { g: 0.85, f: 1250, q: 0.8, tau: 0.035, drive: 3 },
          low: { g: 0.75, f0: 170, f1: 60, sweep: 0.06, tau: 0.06, drive: 2 }, punch: { g: 0.45, f0: 700, f1: 220, tau: 0.022 },
          mech: { g: 0.3, t: 0.016, f: [3800, 2400], q: 9 }, refl: 0.8, tail: { g: 0.28, lp: 800, tau: 0.16 } },
  m200: { dur: 1.8, crack: { g: 1.75, hp: 2600, tau: 0.0045 }, body: { g: 1.35, f: 650, q: 0.6, tau: 0.1, drive: 4.5 },
          low: { g: 1.7, f0: 120, f1: 30, sweep: 0.22, tau: 0.22, drive: 3 }, punch: { g: 0.8, f0: 420, f1: 110, tau: 0.05 },
          mech: { g: 0.15, t: 0.03, f: [2600], q: 6 }, refl: 1.4, tail: { g: 0.7, lp: 420, tau: 0.6 } },
  p226: { dur: 0.8, crack: { g: 1.0, hp: 3200, tau: 0.003 }, body: { g: 0.8, f: 1500, q: 0.8, tau: 0.03, drive: 2.6 },
          low: { g: 0.65, f0: 200, f1: 70, sweep: 0.05, tau: 0.05, drive: 1.8 }, punch: { g: 0.5, f0: 800, f1: 260, tau: 0.018 },
          mech: { g: 0.34, t: 0.022, f: [4200, 2600], q: 10 }, refl: 0.8, tail: { g: 0.22, lp: 900, tau: 0.14 } },
  // high-pitched rapid SMG snap
  p90:  { dur: 0.7, crack: { g: 0.9, hp: 3600, tau: 0.0025 }, body: { g: 0.75, f: 1700, q: 0.9, tau: 0.026, drive: 2.8 },
          low: { g: 0.5, f0: 230, f1: 85, sweep: 0.04, tau: 0.04, drive: 1.6 }, punch: { g: 0.4, f0: 900, f1: 300, tau: 0.016 },
          mech: { g: 0.34, t: 0.012, f: [4600, 3000], q: 11 }, refl: 0.7, tail: { g: 0.2, lp: 1000, tau: 0.11 } },
  // heavy 12-gauge boom: wide low body, long sub thump, big room tail
  m870: { dur: 1.7, crack: { g: 0.8, hp: 1300, tau: 0.007 }, body: { g: 1.6, f: 480, q: 0.45, tau: 0.1, drive: 5.5 },
          low: { g: 2.1, f0: 100, f1: 28, sweep: 0.2, tau: 0.18, drive: 3.6 }, punch: { g: 1.05, f0: 320, f1: 70, tau: 0.065 },
          refl: 1.5, tail: { g: 0.8, lp: 360, tau: 0.55 } },
  // belt-fed 5.56: rifle crack with a heavier, longer body
  m249: { dur: 1.1, crack: { g: 1.05, hp: 2000, tau: 0.004 }, body: { g: 1.15, f: 820, q: 0.65, tau: 0.06, drive: 4 },
          low: { g: 1.2, f0: 140, f1: 44, sweep: 0.09, tau: 0.1, drive: 2.6 }, punch: { g: 0.65, f0: 520, f1: 150, tau: 0.032 },
          mech: { g: 0.28, t: 0.018, f: [2600, 1700, 3600], q: 8 }, refl: 1.1, tail: { g: 0.42, lp: 620, tau: 0.28 } },
  // .50 AE hand cannon
  deagle: { dur: 1.2, crack: { g: 1.25, hp: 2500, tau: 0.004 }, body: { g: 1.15, f: 980, q: 0.7, tau: 0.05, drive: 3.8 },
          low: { g: 1.25, f0: 150, f1: 42, sweep: 0.1, tau: 0.1, drive: 2.6 }, punch: { g: 0.75, f0: 620, f1: 160, tau: 0.03 },
          mech: { g: 0.3, t: 0.024, f: [3600, 2200], q: 10 }, refl: 1.1, tail: { g: 0.36, lp: 700, tau: 0.26 } },
  // ---- v5 arsenal ----
  ak:   { dur: 1.1, crack: { g: 1.05, hp: 1900, tau: 0.004 }, body: { g: 1.15, f: 780, q: 0.6, tau: 0.06, drive: 4.2 },
          low: { g: 1.3, f0: 125, f1: 40, sweep: 0.1, tau: 0.1, drive: 2.8 }, punch: { g: 0.7, f0: 480, f1: 130, tau: 0.035 },
          mech: { g: 0.26, t: 0.02, f: [2800, 1700], q: 8 }, refl: 1.0, tail: { g: 0.4, lp: 600, tau: 0.26 } },
  scar: { dur: 1.0, crack: { g: 1.0, hp: 2100, tau: 0.004 }, body: { g: 1.05, f: 880, q: 0.7, tau: 0.05, drive: 3.6 },
          low: { g: 1.05, f0: 140, f1: 46, sweep: 0.08, tau: 0.085, drive: 2.3 }, punch: { g: 0.6, f0: 560, f1: 150, tau: 0.03 },
          mech: { g: 0.24, t: 0.018, f: [3200, 2000], q: 9 }, refl: 1.0, tail: { g: 0.35, lp: 680, tau: 0.22 } },
  ump:  { dur: 0.9, crack: { g: 0.7, hp: 2300, tau: 0.003 }, body: { g: 0.95, f: 900, q: 0.7, tau: 0.045, drive: 3.2 },
          low: { g: 0.95, f0: 150, f1: 50, sweep: 0.07, tau: 0.075, drive: 2.2 }, punch: { g: 0.55, f0: 600, f1: 180, tau: 0.026 },
          mech: { g: 0.3, t: 0.016, f: [3300, 2100], q: 9 }, refl: 0.8, tail: { g: 0.28, lp: 750, tau: 0.16 } },
  vector: { dur: 0.7, crack: { g: 0.75, hp: 2600, tau: 0.0025 }, body: { g: 0.8, f: 1100, q: 0.8, tau: 0.03, drive: 2.8 },
          low: { g: 0.7, f0: 170, f1: 60, sweep: 0.05, tau: 0.05, drive: 1.8 }, punch: { g: 0.45, f0: 700, f1: 220, tau: 0.02 },
          mech: { g: 0.38, t: 0.012, f: [3900, 2500, 5000], q: 11 }, refl: 0.7, tail: { g: 0.22, lp: 900, tau: 0.12 } },
  mp7:  { dur: 0.65, crack: { g: 1.0, hp: 3800, tau: 0.0022 }, body: { g: 0.7, f: 1900, q: 0.9, tau: 0.024, drive: 2.6 },
          low: { g: 0.45, f0: 240, f1: 90, sweep: 0.035, tau: 0.035, drive: 1.5 }, punch: { g: 0.35, f0: 950, f1: 320, tau: 0.014 },
          mech: { g: 0.34, t: 0.01, f: [5000, 3200], q: 12 }, refl: 0.6, tail: { g: 0.18, lp: 1100, tau: 0.1 } },
  pkm:  { dur: 1.3, crack: { g: 1.2, hp: 1800, tau: 0.005 }, body: { g: 1.3, f: 700, q: 0.6, tau: 0.07, drive: 4.6 },
          low: { g: 1.5, f0: 115, f1: 36, sweep: 0.12, tau: 0.12, drive: 3 }, punch: { g: 0.8, f0: 440, f1: 120, tau: 0.04 },
          mech: { g: 0.24, t: 0.02, f: [2400, 1500, 3200], q: 8 }, refl: 1.2, tail: { g: 0.5, lp: 540, tau: 0.32 } },
  mg42: { dur: 0.8, crack: { g: 1.1, hp: 2000, tau: 0.003 }, body: { g: 1.2, f: 850, q: 0.55, tau: 0.035, drive: 4.8 },
          low: { g: 1.1, f0: 130, f1: 50, sweep: 0.05, tau: 0.06, drive: 3 }, punch: { g: 0.6, f0: 520, f1: 170, tau: 0.02 },
          mech: { g: 0.2, t: 0.012, f: [2600], q: 7 }, refl: 0.9, tail: { g: 0.3, lp: 600, tau: 0.14 } },
  saiga: { dur: 1.4, crack: { g: 0.8, hp: 1500, tau: 0.006 }, body: { g: 1.45, f: 560, q: 0.5, tau: 0.085, drive: 5.2 },
          low: { g: 1.8, f0: 110, f1: 32, sweep: 0.16, tau: 0.14, drive: 3.4 }, punch: { g: 0.95, f0: 360, f1: 80, tau: 0.055 },
          mech: { g: 0.22, t: 0.02, f: [2400, 1500], q: 7 }, refl: 1.3, tail: { g: 0.65, lp: 400, tau: 0.42 } },
  awp:  { dur: 1.9, crack: { g: 1.8, hp: 2300, tau: 0.005 }, body: { g: 1.4, f: 620, q: 0.55, tau: 0.11, drive: 4.8 },
          low: { g: 1.8, f0: 115, f1: 28, sweep: 0.24, tau: 0.24, drive: 3.2 }, punch: { g: 0.85, f0: 400, f1: 100, tau: 0.055 },
          mech: { g: 0.12, t: 0.03, f: [2400], q: 6 }, refl: 1.5, tail: { g: 0.75, lp: 400, tau: 0.65 } },
  barrett: { dur: 2.4, crack: { g: 2.0, hp: 1500, tau: 0.008 }, body: { g: 1.8, f: 420, q: 0.45, tau: 0.16, drive: 6 },
          low: { g: 2.4, f0: 90, f1: 22, sweep: 0.35, tau: 0.35, drive: 4 }, punch: { g: 1.1, f0: 300, f1: 60, tau: 0.08 }, refl: 1.7, tail: { g: 1.0, lp: 320, tau: 0.9 } },
  kar98: { dur: 1.6, crack: { g: 1.5, hp: 2200, tau: 0.005 }, body: { g: 1.2, f: 700, q: 0.6, tau: 0.09, drive: 4 },
          low: { g: 1.5, f0: 125, f1: 34, sweep: 0.2, tau: 0.2, drive: 2.8 }, punch: { g: 0.75, f0: 440, f1: 110, tau: 0.05 },
          mech: { g: 0.12, t: 0.03, f: [2300], q: 6 }, refl: 1.4, tail: { g: 0.65, lp: 440, tau: 0.55 } },
  svd:  { dur: 1.4, crack: { g: 1.5, hp: 2400, tau: 0.004 }, body: { g: 1.15, f: 760, q: 0.6, tau: 0.075, drive: 4 },
          low: { g: 1.3, f0: 130, f1: 38, sweep: 0.14, tau: 0.14, drive: 2.8 }, punch: { g: 0.7, f0: 480, f1: 130, tau: 0.04 },
          mech: { g: 0.2, t: 0.02, f: [2800, 1800], q: 8 }, refl: 1.3, tail: { g: 0.55, lp: 480, tau: 0.45 } },
  usp:  { dur: 0.5, crack: { g: 0.05, hp: 3200, tau: 0.002 }, body: { g: 0.35, f: 800, q: 0.9, tau: 0.02, drive: 1.4 },
          low: { g: 0.4, f0: 150, f1: 60, sweep: 0.04, tau: 0.04, drive: 1.2 }, punch: { g: 0.28, f0: 450, f1: 170, tau: 0.016 },
          pfft: { g: 0.8, lp: 1600, tau: 0.022 }, mech: { g: 0.7, t: 0.01, f: [3400, 2100, 4600], q: 11 }, refl: 0.3, tail: { g: 0.1, lp: 500, tau: 0.1 } },
  m1911: { dur: 1.0, crack: { g: 1.1, hp: 2700, tau: 0.0035 }, body: { g: 1.0, f: 1100, q: 0.75, tau: 0.045, drive: 3.2 },
          low: { g: 1.0, f0: 160, f1: 48, sweep: 0.08, tau: 0.08, drive: 2.2 }, punch: { g: 0.62, f0: 640, f1: 180, tau: 0.028 },
          mech: { g: 0.32, t: 0.022, f: [3800, 2400], q: 10 }, refl: 1.0, tail: { g: 0.3, lp: 760, tau: 0.2 } },
  he:   { dur: 3.0, crack: { g: 1.5, hp: 900, tau: 0.01 }, body: { g: 1.6, f: 380, q: 0.5, tau: 0.28, drive: 6 },
          low: { g: 2.2, f0: 95, f1: 22, sweep: 0.5, tau: 0.6, drive: 4 }, punch: { g: 1.0, f0: 260, f1: 60, tau: 0.12 },
          debris: { g: 0.35, n: 26, t0: 0.08, t1: 1.6 }, refl: 1.6, tail: { g: 0.9, lp: 300, tau: 1.2 } },
  flash:{ dur: 2.2, crack: { g: 1.8, hp: 1400, tau: 0.012 }, body: { g: 1.3, f: 1800, q: 0.6, tau: 0.1, drive: 6 },
          low: { g: 1.2, f0: 160, f1: 40, sweep: 0.2, tau: 0.2, drive: 3 }, ring: { g: 0.3, f: 4100, tau: 0.5 }, refl: 1.4, tail: { g: 0.6, lp: 500, tau: 0.7 } },
};

const ACOUSTICS = {
  warehouse: { reverb: 1.6, decay: 3.6, wet: 0.17, echo: 0, echoDelay: [0.2, 0.45] },
  office:    { reverb: 0.8, decay: 3.0, wet: 0.11, echo: 0, echoDelay: [0.2, 0.45] },
  outdoor:   { reverb: 0.9, decay: 4.8, wet: 0.06, echo: 0.12, echoDelay: [0.19, 0.47] },
  canyon:    { reverb: 1.2, decay: 4.4, wet: 0.07, echo: 0.16, echoDelay: [0.27, 0.62] },
};

class AudioEngine {
  static banks = {};
  static banksReady = false;

  static tanhCurve(k) {
    const n = 2048, c = new Float32Array(n), d = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / d; }
    return c;
  }

  // Offline render of one gun/explosion variant.
  static async renderProfile(p, seed) {
    const sr = 48000, len = Math.ceil(sr * (p.dur || 1));
    const oc = new OfflineAudioContext(2, len, sr), rnd = mulberry32(seed);
    const nb = oc.createBuffer(2, sr * 2, sr);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const sum = oc.createGain(), master = oc.createGain();
    const shaper = oc.createWaveShaper(); shaper.curve = AudioEngine.tanhCurve(1.4); shaper.oversample = '4x';
    sum.connect(shaper); shaper.connect(master); master.connect(oc.destination);
    const t0 = 0.003, v = 0.94 + rnd() * 0.12, DRY = p.dry ?? 0.5; // DRY scales the baked room tail / early reflections
    const noise = (t, dur) => { const s = oc.createBufferSource(); s.buffer = nb; s.start(t, rnd() * 1.5, dur + 0.05); return s; };
    const filt = (type, f, q) => { const b = oc.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const env = (t, peak, a, tau, hold = 0) => {
      const g = oc.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold) g.gain.setValueAtTime(peak, t + a + hold); g.gain.setTargetAtTime(0, t + a + hold, tau); return g;
    };
    const drive = (k) => { const w = oc.createWaveShaper(); w.curve = AudioEngine.tanhCurve(k); w.oversample = '2x'; return w; };
    const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    const dur = p.dur || 1;
    if (p.crack) {
      chain(noise(t0, 0.05), filt('highpass', p.crack.hp * v, 0.7), env(t0, p.crack.g, 0.0003, p.crack.tau), sum);
      const click = oc.createBuffer(1, 64, sr), cd = click.getChannelData(0);
      for (let i = 0; i < 64; i++) cd[i] = (i < 3 ? 1 : 0) * (1 - i / 3) * (rnd() > 0.5 ? 1 : -1);
      const cs = oc.createBufferSource(); cs.buffer = click; const cg = oc.createGain(); cg.gain.value = p.crack.g * 0.8; cs.connect(cg); cg.connect(sum); cs.start(t0);
    }
    if (p.body) chain(noise(t0, dur), filt('bandpass', p.body.f * v, p.body.q), drive(p.body.drive), env(t0, p.body.g, 0.0006, p.body.tau), sum);
    if (p.low) {
      const o = oc.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(p.low.f0 * v, t0); o.frequency.exponentialRampToValueAtTime(p.low.f1 * v, t0 + p.low.sweep);
      chain(o, drive(p.low.drive), env(t0, p.low.g, 0.001, p.low.tau), sum); o.start(t0); o.stop(dur);
      const sub = oc.createOscillator(); sub.type = 'triangle'; sub.frequency.setValueAtTime(p.low.f1 * 0.9, t0);
      chain(sub, env(t0 + 0.004, p.low.g * 0.35, 0.004, p.low.tau * 1.3), sum); sub.start(t0); sub.stop(dur);
    }
    if (p.punch) {
      const o = oc.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(p.punch.f0 * v, t0); o.frequency.exponentialRampToValueAtTime(p.punch.f1 * v, t0 + p.punch.tau * 2);
      chain(o, env(t0, p.punch.g, 0.0008, p.punch.tau), sum); o.start(t0); o.stop(dur);
    }
    if (p.pfft) chain(noise(t0, 0.3), filt('lowpass', p.pfft.lp, 0.8), env(t0, p.pfft.g, 0.002, p.pfft.tau), sum);
    if (p.mech) p.mech.f.forEach((f, k) => chain(noise(t0 + p.mech.t + k * 0.009, 0.08), filt('bandpass', f * (0.95 + rnd() * 0.1), p.mech.q), env(t0 + p.mech.t + k * 0.009, p.mech.g, 0.0005, 0.012), sum));
    if (p.ring) {
      const o = oc.createOscillator(); o.type = 'sine'; o.frequency.value = p.ring.f;
      chain(o, env(t0 + 0.01, p.ring.g, 0.004, p.ring.tau), sum); o.start(t0); o.stop(dur);
    }
    if (p.debris) for (let i = 0; i < p.debris.n; i++) {
      const t = t0 + p.debris.t0 + Math.pow(rnd(), 1.6) * (p.debris.t1 - p.debris.t0);
      chain(noise(t, 0.06), filt('bandpass', 1500 + rnd() * 4000, 4 + rnd() * 6), env(t, p.debris.g * (0.3 + rnd()), 0.0005, 0.008 + rnd() * 0.02), sum);
    }
    if (p.tail) chain(noise(t0 + 0.008, dur), filt('lowpass', p.tail.lp, 0.6), env(t0 + 0.008, p.tail.g * DRY, 0.012, p.tail.tau * (0.55 + DRY * 0.45)), sum);
    if (p.punch) { const o = oc.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(p.punch.f0 * 0.5 * v, t0); o.frequency.exponentialRampToValueAtTime(p.punch.f1 * 0.45 * v, t0 + p.punch.tau * 2.5); chain(o, drive(2.5), env(t0, p.punch.g * 0.6, 0.0006, p.punch.tau * 1.4), sum); o.start(t0); o.stop(dur); } // chest-thump body
    if (p.refl) [[0.011, 0.5, 5000], [0.019, 0.38, 3500], [0.033, 0.28, 2600], [0.052, 0.2, 1800], [0.078, 0.13, 1200]].forEach(([d, g, f], i) => {
      const dl = oc.createDelay(0.2); dl.delayTime.value = d * (0.9 + rnd() * 0.2);
      const gg = oc.createGain(); gg.gain.value = g * p.refl * DRY;
      const pan = oc.createStereoPanner(); pan.pan.value = i % 2 ? 0.5 : -0.5;
      chain(sum, dl, filt('lowpass', f, 0.5), gg, pan, master);
    });
    const buf = await oc.startRendering();
    let peak = 0;
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
    const k = peak > 0 ? 0.92 / peak : 1;
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }

  static async prepareBanks() {
    if (AudioEngine.banksReady || !window.OfflineAudioContext) return;
    let seed = 1337;
    for (const [name, p] of Object.entries(GUN_PROFILES)) {
      const n = name === 'he' || name === 'flash' ? 2 : 3;
      AudioEngine.banks[name] = [];
      for (let i = 0; i < n; i++) AudioEngine.banks[name].push(await AudioEngine.renderProfile(p, seed++));
    }
    AudioEngine.banksReady = true;
  }

  constructor() {
    this.ctx = null; this.volume = Settings.data.volume; this.voiceList = []; this.lastCasing = 0; this.lastBounce = 0; // v24: active bank voices {src, g, end} in start order (voice stealing)
    this.listener = new THREE.Vector3(); this.acoustics = ACOUSTICS.warehouse; this.ambNodes = [];
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.nodesMade = 0; this.busResets = 0;
    if (/[?&]check=/.test(location.search)) // tools/check.mjs --audio: count node churn (every SFX builds a small graph)
      for (const f of ['createGain', 'createBiquadFilter', 'createPanner', 'createOscillator', 'createBufferSource', 'createDelay', 'createWaveShaper', 'createStereoPanner']) { const o = ctx[f].bind(ctx); ctx[f] = (...a) => { this.nodesMade++; return o(...a); }; }
    // v23: never stay silent — resume whenever the browser suspends / interrupts the context (device switch, tab restore)
    ctx.onstatechange = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') setTimeout(() => ctx.resume().catch(() => {}), 120); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.state !== 'running') ctx.resume().catch(() => {}); });
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.noise = this._makeNoise(3);
    this.tinn = ctx.createOscillator(); this.tinn.frequency.value = 3900; this.tinn.start();
    this._buildBus();
    this.setAcoustics(this.acoustics);
    setInterval(() => this._watchdog(), 500);
  }

  // Shared output stages. The muffle / echo low-passes and the compressor are recursive: ONE non-finite sample (an unstable
  // per-voice filter, a degenerate panner) leaves them outputting NaN forever = the game goes permanently silent. v24: the
  // watchdog rebuilds all of them (and cuts every voice still wired to the old inputs) when the output is ever non-finite.
  _buildBus() {
    const ctx = this.ctx;
    for (const n of [this.master, this.tinn, this.dry, this.reverbIn, this.wet, this.echoIn, this.muffle, this.comp, this.tinnG, ...(this.echoTaps || []).map((e) => e.g)])
      if (n) try { n.disconnect(); } catch (e) { /* was not connected */ }
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 22000; this.muffle.Q.value = 0.5;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.2;
    this.probe = ctx.createAnalyser(); this.probe.fftSize = 2048; this.probeIn = ctx.createAnalyser(); this.probeIn.fftSize = 2048; this.probeBuf = new Float32Array(2048);
    this.master.connect(this.muffle); this.muffle.connect(this.comp); this.comp.connect(ctx.destination); this.comp.connect(this.probe); this.master.connect(this.probeIn);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    this.reverbIn = ctx.createGain(); this.convolver = ctx.createConvolver(); this.wet = ctx.createGain(); this.wet.gain.value = 1;
    this.reverbIn.connect(this.convolver); this.convolver.connect(this.wet); this.wet.connect(this.master);
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 1;
    this.echoTaps = [0, 1].map((i) => {
      const d = ctx.createDelay(1.5), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = i ? 1100 : 1800; g.gain.value = 0;
      this.echoIn.connect(d); d.connect(lp); lp.connect(g); g.connect(this.master);
      return { d, g };
    });
    this.tinnG = ctx.createGain(); this.tinnG.gain.value = 0; this.tinn.connect(this.tinnG); this.tinnG.connect(this.comp);
    this.voiceList = [];
  }

  // Poisoned stages show up either as NaN at the output or (Chrome resets a bad biquad itself, the compressor then stays mute
  // for seconds) as silence while the bus input clearly carries sound — measured with an injected NaN sample in tools/_audiowd.mjs.
  _peak(an) { const a = this.probeBuf; an.getFloatTimeDomainData(a); let pk = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (!Number.isFinite(v)) return Infinity; if (v > pk) pk = v; else if (-v > pk) pk = -v; } return pk; }
  _watchdog() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const out = this._peak(this.probe), inp = this.master.gain.value > 0.01 ? this._peak(this.probeIn) : 0;
    this.muteTicks = out < 1e-5 && inp > 0.02 && Number.isFinite(inp) ? (this.muteTicks || 0) + 1 : 0;
    if (out === Infinity || this.muteTicks >= 2) {
      this.busResets++; this.muteTicks = 0; console.warn(`[audio] output bus ${out === Infinity ? 'non-finite' : 'mute'} — rebuilt`);
      this._buildBus(); this.setAcoustics(this.acoustics);
    }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

  setAcoustics(a) {
    this.acoustics = a;
    if (!this.ctx) return;
    this.convolver.buffer = this._makeImpulse(a.reverb, a.decay);
    const t = this.ctx.currentTime;
    this.echoTaps[0].d.delayTime.setValueAtTime(a.echoDelay[0], t); this.echoTaps[1].d.delayTime.setValueAtTime(a.echoDelay[1], t);
    this.echoTaps[0].g.gain.setValueAtTime(a.echo * 0.55, t); this.echoTaps[1].g.gain.setValueAtTime(a.echo * 0.32, t);
  }

  _makeNoise(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * dur), buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < rate * 0.005 ? 0 : 1);
        lp += (n - lp) * (0.25 + 0.7 * (1 - t)); // darker tail over time
        d[i] = lp;
      }
      for (let k = 0; k < 9; k++) {
        const at = Math.floor(rate * (0.009 + k * 0.013 + Math.random() * 0.008));
        if (at < len) d[at] += (Math.random() > 0.5 ? 1 : -1) * (0.7 - k * 0.06);
      }
    }
    return buf;
  }

  // Active bank voices, from their scheduled end times (does not depend on `onended` ever firing).
  _voices() { const now = this.ctx.currentTime; if (this.voiceList.some((v) => v.end <= now)) this.voiceList = this.voiceList.filter((v) => v.end > now); return this.voiceList.length; }
  // v24 voice stealing: when the pool is full the OLDEST sound fades out (10 ms) instead of the new one being dropped —
  // in a big firefight the old rule silenced every new gunshot, footstep and impact until earlier reverb tails ended.
  _steal(max) { while (this._voices() >= max) { const v = this.voiceList.shift(), t = this.ctx.currentTime; try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.01); v.src.stop(t + 0.06); } catch (e) { /* already stopped */ } } }

  setListener(pos, fwd) {
    if (!this.ctx || !Number.isFinite(pos.x + pos.y + pos.z + fwd.x + fwd.y + fwd.z)) return; // a NaN reaching the graph silences the compressor for good
    this.listener.copy(pos);
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const turn = Math.abs(fwd.y) < 0.995; // v24: looking straight up / down makes forward ∥ up (orientation undefined) → keep the last one
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      if (turn) { l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t); }
      if (!this.upSet) { this.upSet = true; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; } // constant: once, not 3 automation events per frame
    } else { l.setPosition(pos.x, pos.y, pos.z); if (turn) l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  // v23: HRTF (costly convolution per voice) only near the listener or when asked (footsteps); distant sources pan cheaply.
  _panner(pos, ref = 4, roll = 1.1, hrtf = false) {
    if (!Number.isFinite(pos.x + pos.y + pos.z)) pos = this.listener;
    const p = this.ctx.createPanner();
    p.panningModel = hrtf || this.listener.distanceTo(pos) < 14 ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 250;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  // Generic output bus for live-synth SFX.
  _bus(pos, send = 0.3, ref = 4, lowpass = 0, roll = 1.1, hrtf = false) {
    const g = this.ctx.createGain();
    let node = g;
    if (lowpass) { const f = this._filter('lowpass', lowpass, 0.7); node.connect(f); node = f; }
    if (pos) { const p = this._panner(pos, ref, roll, hrtf); node.connect(p); node = p; }
    node.connect(this.dry);
    if (send > 0) { const s = this.ctx.createGain(); s.gain.value = send * this.acoustics.wet * 2.6; node.connect(s); s.connect(this.reverbIn); }
    return g;
  }

  // Pre-rendered layered bank playback with distance modelling.
  playBank(name, pos = null, o = {}) {
    if (!this.ctx || !AudioEngine.banksReady) return;
    const bank = AudioEngine.banks[name];
    if (!bank) return;
    this._steal(40);
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = pick(bank); src.playbackRate.value = rand(0.965, 1.035) * (o.rate || 1);
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    src.connect(g);
    let node = g, delay = 0, send = this.acoustics.wet * (o.send ?? 1), echo = this.acoustics.echo * 0.8;
    if (pos) {
      const d = this.listener.distanceTo(pos);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(20000 * Math.exp(-d / (o.lpDist || 42)), o.lpMin || 1200, 20000);
      g.connect(lp);
      const pn = this._panner(pos, o.ref || 6, o.roll ?? 1.0); lp.connect(pn); node = pn;
      send *= 1 + clamp(d / 45, 0, 1.4); echo *= 1 + clamp(d / 60, 0, 1.0);
      if (d > 18) delay = Math.min(d / 343, 0.3);
    }
    node.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(this.reverbIn);
    if (echo > 0) { const e = ctx.createGain(); e.gain.value = echo; node.connect(e); e.connect(this.echoIn); }
    src.start(t + delay);
    this.voiceList.push({ src, g, end: t + delay + src.buffer.duration / src.playbackRate.value });
  }

  gunshot(sound, pos = null, rate = 1) { this.playBank(sound, pos, { gain: pos ? 1.1 : 0.95, rate }); }

  // Explosions carry across the whole map: large refDistance + an extra sub-bass rumble that barely attenuates.
  explosion(kind, pos) {
    this.playBank(kind === 'flash' ? 'flash' : 'he', pos, { gain: kind === 'flash' ? 1.5 : 2.0, ref: kind === 'flash' ? 14 : 26, roll: 0.8, send: 0.9, lpDist: 90, lpMin: 500 });
    if (!this.ctx || kind === 'flash') return;
    const d = this.listener.distanceTo(pos), t = this.ctx.currentTime + Math.min(d / 343, 0.4), out = this._bus(pos, 0.2, 60);
    this._osc('sine', t, 62, 26, 1.3, out, 0.9, 0.004); this._nb(t, out, 'lowpass', 180, 0.7, 0.8, 0.01, 1.1);
  }

  // Flashbang / blast deafening: tinnitus tone + master low-pass that slowly recovers.
  deafen(strength, dur) {
    if (!this.ctx || strength <= 0.02) return;
    const t = this.ctx.currentTime, f = this.muffle.frequency, g = this.tinnG.gain;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(380, 3000 * (1 - strength)), t); f.setTargetAtTime(22000, t + dur * 0.5, dur * 0.35);
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(0.09 * strength, t + 0.05); g.setTargetAtTime(0, t + dur * 0.4, dur * 0.3);
  }

  _env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  _noiseSrc(t, dur, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate; s.start(t, Math.random() * 2, dur + 0.05); return s; }
  _filter(type, freq, q = 0.7) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  _osc(type, t, f0, f1, dur, out, peak, attack = 0.002) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this._env(g.gain, t, peak, attack, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }
  _nb(t, out, type, freq, q, peak, attack, decay, rate = 1) {
    const s = this._noiseSrc(t, attack + decay, rate), f = this._filter(type, freq, q), g = this.ctx.createGain();
    this._env(g.gain, t, peak, attack, decay); s.connect(f); f.connect(g); g.connect(out);
    return f;
  }

  // COD-style hit confirmation — dry, crisp and WIDE: every layer is doubled into a left and a right voice
  // (slightly detuned and 4 ms apart) so the tick / ding sits across the whole stereo field.
  hit(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const side = (pan, dt, fn) => { const p = ctx.createStereoPanner(), g = ctx.createGain(); p.pan.value = pan; g.connect(p); p.connect(this.dry); fn(t + dt, g); };
    for (const [pan, dt, det] of [[-0.55, 0, 0.994], [0.55, 0.004, 1.006]]) side(pan, dt, (tt, out) => {
      if (kind === 'body') { this._nb(tt, out, 'highpass', 4200, 0.7, 0.3, 0.0005, 0.012); this._osc('triangle', tt, 1850 * det, 1500, 0.045, out, 0.26, 0.001); }
      if (kind === 'head' || kind === 'kill') { this._osc('sine', tt, 2650 * det, 2620, 0.26, out, 0.3, 0.001); this._osc('sine', tt, 3980 * det, 3950, 0.18, out, 0.16, 0.001); this._osc('sine', tt, 5310 * det, 5300, 0.1, out, 0.07, 0.001); this._nb(tt, out, 'highpass', 5000, 0.7, 0.22, 0.0005, 0.01); }
      if (kind === 'kill') { this._osc('sine', tt, 190, 70, 0.16, out, 0.45, 0.002); this._nb(tt, out, 'bandpass', 1400, 1.2, 0.35, 0.002, 0.05); this._osc('sine', tt + 0.07, 3200 * det, 3180, 0.22, out, 0.18, 0.002); }
      if (kind === 'shield') { this._osc('sine', tt, 1200 * det, 1800, 0.12, out, 0.16); this._osc('sine', tt, 2400 * det, 3000, 0.1, out, 0.07); }
    });
  }

  // Footsteps: dry, strictly positional (HRTF + inverse distance); o.pitch = per-soldier timbre, o.occluded = heard through a wall.
  footstep(pos, surface = 'concrete', loud = 1, o = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = o.pitch || 1, out = this._bus(pos, 0.03, 3, o.occluded ? 720 : 0, 1.1, true);
    if (o.occluded) loud *= 0.6;
    const rand = (a, b) => (a + Math.random() * (b - a)) * k;
    switch (surface) {
      case 'metal': this._nb(t, out, 'bandpass', rand(1800, 2400), 5, 0.35 * loud, 0.002, 0.09); this._osc('triangle', t, rand(420, 520), 300, 0.12, out, 0.12 * loud); break;
      case 'wood': this._nb(t, out, 'bandpass', rand(500, 700), 2, 0.4 * loud, 0.002, 0.06); this._osc('sine', t, 180, 110, 0.06, out, 0.25 * loud); break;
      case 'sand': this._nb(t, out, 'bandpass', rand(1400, 2200), 0.8, 0.3 * loud, 0.01, 0.08); break;
      case 'snow': this._nb(t, out, 'bandpass', rand(900, 1500), 1.1, 0.34 * loud, 0.015, 0.1); this._nb(t + 0.03, out, 'highpass', 3000, 0.7, 0.08 * loud, 0.01, 0.05); break;
      case 'carpet': this._nb(t, out, 'lowpass', 500, 0.7, 0.3 * loud, 0.006, 0.05); break;
      case 'grass': this._nb(t, out, 'bandpass', rand(1600, 2600), 0.6, 0.22 * loud, 0.012, 0.09); this._nb(t, out, 'lowpass', 380, 0.7, 0.25 * loud, 0.004, 0.05); break;
      case 'ladder': this._nb(t, out, 'bandpass', rand(1100, 1500), 6, 0.4 * loud, 0.001, 0.07); this._osc('triangle', t, rand(300, 360), 240, 0.16, out, 0.16 * loud); break;
      default: this._nb(t, out, 'bandpass', rand(700, 1100), 1.4, 0.38 * loud, 0.003, 0.05); this._osc('sine', t, 120, 70, 0.05, out, 0.22 * loud);
    }
  }

  land(pos, surface, strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.15, 3), s = clamp(strength, 0.3, 1.4);
    this._nb(t, out, 'lowpass', surface === 'metal' ? 1500 : 700, 0.8, 0.5 * s, 0.003, 0.12);
    this._osc('sine', t, 110, 50, 0.12, out, 0.5 * s);
    if (surface === 'metal') this._nb(t, out, 'bandpass', 2200, 6, 0.3 * s, 0.002, 0.25);
  }

  mech(type, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.06, 2);
    const click = (dt, f, q, pk, dec) => this._nb(t + dt, out, 'bandpass', f, q, pk, 0.001, dec);
    switch (type) {
      case 'magout': // release button → magazine slides out of the well
        click(0, 3400, 9, 0.28, 0.012); this._nb(t + 0.025, out, 'bandpass', 1500, 1.6, 0.26, 0.004, 0.07); click(0.1, 800, 2, 0.3, 0.05); break;
      case 'magin': // scrape into the well → hard seat
        this._nb(t, out, 'bandpass', 2000, 2, 0.24, 0.004, 0.05); click(0.07, 1150, 3, 0.75, 0.03); click(0.075, 3000, 6, 0.3, 0.015); this._osc('sine', t + 0.07, 250, 130, 0.06, out, 0.32); break;
      case 'charge': // pull the handle back (spring) → let it slam home
        click(0, 2300, 5, 0.45, 0.025); this._nb(t + 0.01, out, 'bandpass', 3400, 9, 0.14, 0.01, 0.07); click(0.12, 1500, 3, 0.8, 0.03); this._osc('sine', t + 0.12, 210, 105, 0.07, out, 0.3); break;
      case 'slide': click(0, 2900, 6, 0.45, 0.02); this._nb(t + 0.01, out, 'bandpass', 3600, 8, 0.12, 0.01, 0.05); click(0.08, 1900, 4, 0.7, 0.025); this._osc('sine', t + 0.08, 260, 150, 0.05, out, 0.22); break;
      case 'boltback': click(0, 1300, 3, 0.45, 0.04); click(0.05, 2400, 6, 0.3, 0.03); break;
      case 'boltfwd': click(0, 2100, 4, 0.5, 0.03); click(0.06, 1500, 5, 0.45, 0.035); break;
      case 'dry': this._osc('square', t, 3200, 2800, 0.015, out, 0.12); click(0, 3500, 8, 0.3, 0.02); break;
      case 'draw': this._nb(t, out, 'bandpass', 1200, 1, 0.12, 0.02, 0.08); click(0.06, 2400, 6, 0.2, 0.02); break;
      case 'zoom': click(0, 3000, 6, 0.12, 0.02); break;
      case 'pin': click(0, 3600, 7, 0.35, 0.02); this._osc('sine', t + 0.02, 5200, 4800, 0.12, out, 0.08); click(0.12, 2500, 5, 0.25, 0.03); break;
      case 'pump': click(0, 900, 2, 0.5, 0.05); this._nb(t + 0.02, out, 'bandpass', 1800, 1.5, 0.25, 0.01, 0.08); click(0.17, 1300, 3, 0.65, 0.04); this._osc('sine', t + 0.17, 220, 120, 0.07, out, 0.3); break;
      case 'shell': click(0, 2400, 5, 0.3, 0.02); click(0.05, 700, 2, 0.45, 0.04); this._osc('sine', t + 0.05, 180, 110, 0.05, out, 0.25); break;
      case 'boxopen': click(0, 1900, 4, 0.4, 0.03); click(0.06, 1200, 3, 0.35, 0.05); break;
      case 'boxclose': click(0, 1500, 4, 0.55, 0.03); this._osc('sine', t, 260, 140, 0.06, out, 0.25); break;
      case 'queue': this._osc('sine', t, 1300, 1300, 0.05, out, 0.1); this._osc('sine', t + 0.06, 1750, 1750, 0.07, out, 0.1); break;
      case 'throw': { const f = this._nb(t, out, 'bandpass', 500, 1.2, 0.35, 0.03, 0.2); f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.2); break; }
    }
  }

  // Objective cues: capture / lost / pickup / drop / extract / tick.
  objective(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(null, 0.15), tone = (dt, f, d, pk, type = 'sine') => this._osc(type, t + dt, f, f, d, out, pk, 0.006);
    switch (kind) {
      case 'capture': this._radio(t, [[0.05, 1250, 0.075], [0.16, 1250, 0.075], [0.27, 1680, 0.2]]); break; // tactical radio: squelch · beep-beep · confirm
      case 'lost': this._radio(t, [[0.05, 1180, 0.11], [0.2, 880, 0.11], [0.35, 620, 0.24]]); break;
      case 'pickup': tone(0, 523, 0.1, 0.16); tone(0.08, 784, 0.1, 0.16); tone(0.16, 1046, 0.35, 0.2); tone(0.16, 1568, 0.35, 0.06); break;
      case 'drop': tone(0, 700, 0.12, 0.16, 'square'); tone(0.13, 470, 0.25, 0.14, 'square'); break;
      case 'extract': [523, 659, 784, 1046].forEach((f, i) => tone(i * 0.1, f, 0.3, 0.16)); break;
      case 'tick': this._radio(t, [[0, 1900, 0.03]], 0.35, false); break;
    }
  }
  // Military radio voice-band chain (band-pass 350 Hz–3.2 kHz + light saturation) with squelch clicks and square beeps.
  _radio(t, beeps, gain = 1, squelch = true) {
    const ctx = this.ctx, hp = this._filter('highpass', 350, 0.7), lp = this._filter('lowpass', 3200, 0.9), sh = ctx.createWaveShaper(), g = ctx.createGain();
    sh.curve = AudioEngine.tanhCurve(2.2); g.gain.value = 0.55 * gain;
    hp.connect(lp); lp.connect(sh); sh.connect(g); g.connect(this._bus(null, 0.04));
    if (squelch) { this._nb(t, hp, 'bandpass', 2200, 0.6, 0.5, 0.002, 0.045); const end = beeps[beeps.length - 1]; this._nb(t + end[0] + end[2] + 0.02, hp, 'bandpass', 1800, 0.6, 0.35, 0.002, 0.07); }
    for (const [dt, f, d] of beeps) { this._osc('square', t + dt, f, f, d, hp, 0.28, 0.003); this._osc('sine', t + dt, f * 2, f * 2, d * 0.8, hp, 0.06, 0.003); }
  }

  nadeBounce(pos, strength) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime; if (now - this.lastBounce < 0.05) return; this.lastBounce = now;
    const out = this._bus(pos, 0.1, 2), s = clamp(strength, 0.2, 1);
    this._nb(now, out, 'bandpass', rand(2600, 3600), 8, 0.45 * s, 0.001, 0.05);
    this._osc('triangle', now, rand(900, 1300), 700, 0.08, out, 0.12 * s);
  }

  smokeHiss(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.1, 3);
    const s = this._noiseSrc(t, 3.5), f = this._filter('bandpass', 2600, 0.6), g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.15); g.gain.setTargetAtTime(0, t + 1.2, 0.8);
    s.connect(f); f.connect(g); g.connect(out);
    this._nb(t, out, 'lowpass', 400, 0.8, 0.5, 0.002, 0.1);
  }

  knifeSwing() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(null, 0.08);
    const f = this._nb(t, out, 'bandpass', 500, 1.5, 0.45, 0.03, 0.16);
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.16);
  }
  knifeHit(flesh, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.08);
    if (flesh) { this._nb(t, out, 'lowpass', 600, 1, 0.8, 0.002, 0.1); this._osc('sine', t, 160, 60, 0.1, out, 0.6); }
    else { this._nb(t, out, 'bandpass', 3200, 8, 0.5, 0.001, 0.12); this._osc('triangle', t, 2400, 2100, 0.15, out, 0.15); }
  }

  impact(pos, material) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.2, 2);
    if (material === 'metal') {
      this._nb(t, out, 'bandpass', rand(2500, 4000), 6, 0.35, 0.001, 0.06);
      if (Math.random() < 0.2) this._osc('sine', t + 0.01, rand(3200, 4200), rand(1200, 1800), 0.35, out, 0.08, 0.01);
    } else if (material === 'wood') this._nb(t, out, 'bandpass', 800, 2, 0.4, 0.001, 0.05);
    else if (material === 'glass') { this._nb(t, out, 'highpass', 5000, 1, 0.3, 0.001, 0.12); this._osc('sine', t, 6200, 5800, 0.12, out, 0.06); }
    else if (material === 'sand' || material === 'snow' || material === 'sandbag' || material === 'grass') this._nb(t, out, 'lowpass', 900, 0.7, 0.35, 0.002, 0.06);
    else this._nb(t, out, 'bandpass', 1500, 1.2, 0.3, 0.001, 0.04);
  }

  flyby(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._bus(pos, 0.04, 1.5);
    const f = this._nb(t, out, 'bandpass', 3000, 3, 0.3, 0.01, 0.12);
    f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.13);
    this._nb(t, out, 'highpass', 6000, 0.7, 0.12, 0.002, 0.02);
  }

  casing(pos) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime; if (now - this.lastCasing < 0.03) return; this.lastCasing = now;
    const out = this._bus(pos, 0.05, 1);
    this._osc('sine', now, rand(4200, 5600), rand(4000, 5200), 0.08, out, 0.06);
    this._osc('sine', now, rand(6800, 7600), 6500, 0.05, out, 0.03);
  }

  hurt() { if (!this.ctx) return; const t = this.ctx.currentTime, out = this._bus(null, 0.04); this._osc('sine', t, 140, 55, 0.2, out, 0.7); this._nb(t, out, 'lowpass', 500, 0.7, 0.5, 0.003, 0.12); }
  death() { if (!this.ctx) return; const t = this.ctx.currentTime, out = this._bus(null, 0.3); this._osc('sawtooth', t, 180, 40, 0.9, out, 0.25, 0.01); this._osc('sine', t, 90, 30, 1.2, out, 0.6, 0.01); }
  uiClick() { if (!this.ctx) return; const t = this.ctx.currentTime, out = this._bus(null, 0); this._osc('square', t, 1400, 1300, 0.03, out, 0.05); }

  setAmbience(kind) {
    if (!this.ctx) return;
    for (const n of this.ambNodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
    this.ambNodes = [];
    const ctx = this.ctx;
    const noiseLoop = (type, freq, gain, lfoF, lfoA) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = this._filter(type, freq, 0.5), g = ctx.createGain(); g.gain.value = gain;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = lfoF; lg.gain.value = lfoA; lfo.connect(lg); lg.connect(g.gain);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(); lfo.start(); this.ambNodes.push(s, lfo);
    };
    const hum = (f, gain) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = gain; o.connect(g); g.connect(this.master); o.start(); this.ambNodes.push(o); };
    if (kind === 'warehouse') { noiseLoop('lowpass', 140, 0.05, 0.07, 0.02); hum(60, 0.006); }
    else if (kind === 'office') { noiseLoop('lowpass', 260, 0.035, 0.05, 0.01); hum(120, 0.004); }
    else if (kind === 'harbor') { noiseLoop('bandpass', 420, 0.06, 0.12, 0.04); noiseLoop('lowpass', 200, 0.05, 0.05, 0.02); }
    else if (kind === 'hill') { noiseLoop('bandpass', 600, 0.045, 0.07, 0.03); noiseLoop('lowpass', 170, 0.045, 0.04, 0.02); noiseLoop('highpass', 5200, 0.006, 0.3, 0.004); }
    else if (kind === 'snow') { noiseLoop('bandpass', 700, 0.05, 0.09, 0.035); noiseLoop('lowpass', 180, 0.05, 0.04, 0.02); }
    else { noiseLoop('bandpass', 900, 0.03, 0.08, 0.02); noiseLoop('lowpass', 160, 0.04, 0.05, 0.02); }
  }
}


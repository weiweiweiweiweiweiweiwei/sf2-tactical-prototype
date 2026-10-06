// v46 research helper: one frame per STEP seconds of a YouTube video → OUT/f0001.jpg …   node tools/_ytframes.mjs OUT URL [STEP]
import { chromium } from 'playwright'; import fs from 'node:fs';
const OUT = process.argv[2], URL_ = process.argv[3], STEP = +(process.argv[4] || 1);
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1400,900'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_); await p.waitForSelector('video', { timeout: 30000 }); await p.waitForTimeout(4000);
const dur = await p.evaluate(async () => {
  const v = document.querySelector('video'), pl = document.querySelector('#movie_player');
  try { pl.setPlaybackQualityRange && pl.setPlaybackQualityRange('hd720', 'hd720'); pl.setPlaybackQuality && pl.setPlaybackQuality('hd720'); } catch (e) { /* */ }
  v.muted = true; await v.play().catch(() => 0); await new Promise((r) => setTimeout(r, 4000)); v.pause();
  window.__cv = document.createElement('canvas'); return v.duration;
});
console.log('duration', dur);
for (let t = 1, n = 1; t < dur; t += STEP, n++) {
  const f = `${OUT}/f${String(n).padStart(4, '0')}.jpg`;
  if (fs.existsSync(f)) continue;
  const data = await p.evaluate(async (t) => {
    const v = document.querySelector('video'); v.currentTime = t;
    await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 8000); });
    for (let k = 0; k < 40 && v.readyState < 3; k++) await new Promise((r) => setTimeout(r, 150));
    await new Promise((r) => setTimeout(r, 120));
    const c = window.__cv; c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    return [c.toDataURL('image/jpeg', 0.85), v.videoWidth];
  }, t);
  fs.writeFileSync(f, Buffer.from(data[0].split(',')[1], 'base64'));
  if (n % 60 === 1) console.log(t, 's', data[1], 'px');
}
await b.close();

// top-down view of a map (Tab-board overview, all soldiers drawn) after N s of bot play: node tools/_mapview.mjs <mapIndex> [seconds]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, MAP = +(process.argv[2] || 0);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'dom', allies: 1, enemies: 1 }); await app.startMatch();
  const m = app.match, T = m.collision.terrain, B = m.def.bounds, PX = 900, cv = document.createElement('canvas'); cv.width = PX; cv.height = Math.round(PX * (B.maxZ - B.minZ) / (B.maxX - B.minX));
  const ctx = cv.getContext('2d'), img = ctx.createImageData(cv.width, cv.height), d = img.data, sx = (B.maxX - B.minX) / cv.width, sz = (B.maxZ - B.minZ) / cv.height;
  for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) {
    const x = B.minX + (i + 0.5) * sx, z = B.minZ + (j + 0.5) * sz, h = T.heightAt(x, z), sl = T.slopeAt(x, z), g = T.gradAt(x, z), lam = Math.max(0, Math.min(1, (0.6 * g.x + 0.8 + 0.4 * g.z) / Math.hypot(g.x, 1, g.z)));
    const walk = sl < 1.08, base = walk ? [150 + h * 6, 140 + h * 5, 110 + h * 3] : [70, 66, 62], k = 0.45 + 0.7 * lam, o = (i + j * cv.width) * 4;
    d[o] = Math.min(255, base[0] * k); d[o + 1] = Math.min(255, base[1] * k); d[o + 2] = Math.min(255, base[2] * k); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const P = (x, z) => [(x - B.minX) / sx, (z - B.minZ) / sz];
  for (const [t, c] of [['alpha', '#3d7bff'], ['bravo', '#ff4a3d']]) { const zn = m.builder.zones[t]; const [a, b2] = P(zn.x0, zn.z0), [c2, e] = P(zn.x1, zn.z1); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.strokeRect(a, b2, c2 - a, e - b2); }
  ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#ffd23a';
  m.def.objectives.dom.forEach(([x, , z], i) => { const [a, b2] = P(x, z); ctx.beginPath(); ctx.arc(a, b2, 8, 0, 7); ctx.fill(); ctx.fillText('ABC'[i], a + 10, b2 - 6); });
  return { url: cv.toDataURL(), h00: T.heightAt(0, 0) };
}, MAP);
fs.writeFileSync(`tools/out/terrain_${MAP}.png`, Buffer.from(r.url.split(',')[1], 'base64')); console.log('h(0,0)', r.h00); await b.close(); srv.close();

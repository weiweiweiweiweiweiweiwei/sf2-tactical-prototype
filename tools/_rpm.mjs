// v53 measured fire rate and reload time per weapon (real input path, fixed 1/120 s steps): node tools/_rpm.mjs ak47,famas,...
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, IDS = (process.argv[2] || 'm4a1').split(',');
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const rows = await p.evaluate(async (ids) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.loop = () => {};
  const M = app.match, A = M.weapons, inp = app.input, P = M.player; for (const bt of M.bots) { bt.alive = false; bt.respawnT = 1e9; }
  app.state = 'playing'; inp.locked = true; M.phase = 'live'; M.freezeT = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { M.tick(1 / 120 + 1e-9, { x: 0, y: 0 }); inp.endFrame(); } };
  let shots = []; const fb = M.fireBullet.bind(M); M.fireBullet = (sh, o, d, def, opts) => { if (sh === P && !(opts && opts.pellet > 0)) shots.push(A.clock); return fb(sh, o, d, def, opts); };
  const out = [];
  for (const id of ids) {
    A.rebuild([SF2.WEAPON_DEFS[id]]); step(60); shots = []; const w = A.current;
    inp.buttons[0] = true; inp.onButton(0, true); step(Math.min(240, Math.round((w.mag - 1) * w.def.interval * 120) + 2)); inp.buttons[0] = false; inp.onButton(0, false); step(30);
    const rpm = shots.length > 1 ? Math.round((shots.length - 1) / (shots[shots.length - 1] - shots[0]) * 60) : null;
    inp.onKey('KeyR'); step(1); let t = 0; while (w.reloading && t < 10) { step(1); t += 1 / 120; }
    out.push({ id, rpm, reload: +t.toFixed(2), adsSpeed: w.def.adsSpeed });
  }
  return out;
}, IDS);
for (const r of rows) console.log(r.id.padEnd(8), 'RPM', String(r.rpm).padStart(4), ' reload', r.reload, 's  adsSpeed', r.adsSpeed);
await b.close(); srv.close();

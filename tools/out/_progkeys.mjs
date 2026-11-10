// scratch v67l: after a match has loaded — which output state were its shader programs compiled for? (canvas: srgb + tone mapping; the game renders into a target: srgb-linear, none)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), H = await ctx.newPage();
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
for (const q of (process.env.Q || 'low,high').split(',')) {
  const r = await H.evaluate(async (q) => { const S = SF2.Settings.data; S.quality = q; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3, loadout: 0 });
    if (app.match && app.leaveMatch) app.leaveMatch(); await app.startMatch(); app.state = 'playing'; app.input.locked = true; await new Promise((r) => setTimeout(r, 2500));
    const R = app.renderer, h = {}; const used = new Map(); app.match.scene.traverse((o) => { for (const m of o.material ? [].concat(o.material) : []) { const pr = R.properties.get(m); if (pr && pr.currentProgram) used.set(pr.currentProgram, (used.get(pr.currentProgram) || 0) + 1); } });
    for (const p of R.info.programs) { const k = ',' + p.cacheKey + ','; const key = (k.includes(',srgb-linear,') ? 'linear' : k.includes(',srgb,') ? 'srgb(canvas)' : 'other') + (used.has(p) ? ' current' : ' not-current'); h[key] = (h[key] || 0) + 1; }
    return { n: R.info.programs.length, h }; }, q);
  console.log('PROGKEYS', q, JSON.stringify(r));
}
await b.close(); srv.close();

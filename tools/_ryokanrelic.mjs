// v44 Sakura Inn: relic (seizure) mode placement + domination zones → console
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const out = {};
for (const rule of ['relic', 'dom']) {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
  out[rule] = await p.evaluate(async (rule) => {
    const S = SF2.Settings.data, map = SF2.MAPS.findIndex((d) => d.id === 'ryokan'); S.quality = 'low'; Object.assign(S.lobby, { map, rule, allies: 3, enemies: 3 });
    await app.startMatch(); const R = app.match.rules, f = (v) => v && [+v.x.toFixed(1), +v.y.toFixed(2), +v.z.toFixed(1)];
    return rule === 'relic' ? { home: f(R.home), extract: f(R.extract) } : { zones: (R.zones || []).map((z) => [z.name || z.id, f(z.pos), +z.base?.toFixed?.(2)]) };
  }, rule);
  out[rule].errs = errs.slice(0, 3); await p.close();
}
console.log(JSON.stringify(out)); await b.close(); srv.close();

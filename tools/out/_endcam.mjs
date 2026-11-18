// scratch v67o: the end flyover (shot at 2 / 5 s) and the results after it
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const H = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage(); const errs = []; H.on('pageerror', (e) => errs.push(e.message));
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async (map) => { const S = SF2.Settings.data; S.quality = 'medium'; Object.assign(S.lobby, { map: Math.max(0, SF2.MAPS.findIndex((m) => m.id === map)), rule: 'tdm', allies: 2, enemies: 2 });
  app.audio.init(); await app.startMatch(); app.state = 'playing'; app.input.locked = true; await new Promise((r) => setTimeout(r, 6000)); app.match.endMatch(app.match.player.team); }, process.env.MAP || 'warehouse');
for (const s of [2, 5]) { await H.waitForTimeout(s === 2 ? 2000 : 3000); await H.screenshot({ path: `tools/out/endcam_${s}.jpg`, type: 'jpeg', quality: 75 }); }
await H.waitForTimeout(4000); const on = await H.evaluate(() => document.getElementById('endscreen').classList.contains('on'));
console.log('ENDCAM results shown after 9 s:', on, errs.slice(0, 3)); await b.close(); srv.close();

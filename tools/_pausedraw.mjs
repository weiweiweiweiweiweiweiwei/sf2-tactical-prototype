// how many frames does a paused match still draw per second, and why
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
for (const f of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/${encodeURI(f)}`); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async () => {
    const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 6, enemies: 6 });
    if (app.createRoom) { app.createRoom(); await new Promise((r) => setTimeout(r, 3000)); }
    await app.startMatch(); app.state = 'playing'; app.input.locked = true; await new Promise((r) => setTimeout(r, 3000));
    let draws = 0, ticks = 0; const pr = app.post.render.bind(app.post), tk = app.match.tick.bind(app.match);
    app.post.render = (...a) => { draws++; return pr(...a); }; app.match.tick = (...a) => { ticks++; return tk(...a); };
    app.input.locked = false; app.input.onLockChange(false); // what pressing ESC does
    await new Promise((r) => setTimeout(r, 3000));
    return { state: app.state, drawsPerSec: +(draws / 3).toFixed(1), ticksPerSec: +(ticks / 3).toFixed(1), net: !!app.match.net, peers: app.match.net && app.match.net.peers ? app.match.net.peers.size : null };
  });
  console.log(f.slice(0, 30).padEnd(32), JSON.stringify(r));
  await p.close();
}
await b.close(); srv.close();

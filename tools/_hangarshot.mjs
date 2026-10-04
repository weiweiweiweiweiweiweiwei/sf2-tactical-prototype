// v37 enemy-visibility shots: player at the map centre looking at the enemy spawn (bots frozen there) → tools/out/vis_<map>_<tag>.jpg
// node tools/_visshot.mjs <file> <tag> <map,map,...>
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, [FILE, TAG, MAPS] = process.argv.slice(2);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
for (const map of MAPS.split(',').map(Number)) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/${FILE}`); await p.waitForFunction(() => window.app && window.SF2);
  await p.evaluate(async (map) => {
    const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 5 });
    await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(5500);
    const P = m.player, foes = m.bots.filter((x) => x.team !== P.team), z = m.builder.zones[P.team === 'alpha' ? 'bravo' : 'alpha'];
    for (const f of foes) f.ai.update = () => {};
    foes.forEach((f, i) => { const dir = Math.sign((z.x0 + z.x1) / 2), x = (z.x0 + z.x1) / 2 * 0.8 + (i % 2) * 1.5 * dir, zz = -6 + i * 3; f.motor.pos.set(x, f.motor.pos.y, zz); f.motor.prevPos.copy(f.motor.pos); f.yaw = P.team === 'alpha' ? -Math.PI / 2 : Math.PI / 2; });
    P.motor.pos.set(-14, 0.05, -7); P.motor.prevPos.copy(P.motor.pos); P.yaw = Math.atan2(-14, -7); P.pitch = 0.15; await sleep(1500);
  }, map);
  await p.screenshot({ path: `tools/out/vis_${map}_${TAG}.jpg`, type: 'jpeg', quality: 85 }); await p.close();
}
await b.close(); srv.close(); console.log('ok');

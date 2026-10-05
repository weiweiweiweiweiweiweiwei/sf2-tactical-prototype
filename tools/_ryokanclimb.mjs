// v44 Sakura Inn: can a player get from each climbing aid (crates / barrels / tub) onto the jumpable eaves?
// A fresh CharacterMotor stands on the aid, jumps and runs toward the eave for 1.6 s → final height.
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data, map = SF2.MAPS.findIndex((d) => d.id === 'ryokan'); S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); const m = app.match, Motor = m.player.motor.constructor, CFG = SF2.CFG, V = SF2.THREE.Vector3;
  const U = (u) => (u - 112) * 0.4, Z = (v) => (v - 166) * 0.3;
  const tests = [['e1n crates', U(146), Z(52.8), 0, 1], ['e1e barrels', U(176.1), Z(66), -1, 0], ['e2e tub', U(177), Z(118), -1, 0], ['e3w crates', U(163), Z(186), 1, 0]];
  const out = {};
  for (const [name, x, z, dx, dz] of tests) {
    const mo = new Motor(m.collision, { radius: CFG.player.radius, height: CFG.player.height, crouchHeight: CFG.player.crouchHeight });
    mo.teleport(new V(x, 2.5, z)); const y0 = mo.pos.y; let maxY = y0;
    for (let i = 0; i < 240; i++) { if (i === 6) mo.requestJump(); mo.step(1 / 120, dx, dz, i > 4 ? 7.6 : 0); maxY = Math.max(maxY, mo.pos.y); }
    out[name] = { start: +y0.toFixed(2), end: +mo.pos.y.toFixed(2), maxY: +maxY.toFixed(2), onEave: Math.abs(mo.pos.y - 2.25) < 0.08 };
  }
  return out;
});
console.log(r); await b.close(); srv.close();

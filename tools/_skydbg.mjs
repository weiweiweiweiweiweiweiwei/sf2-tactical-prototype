import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); p.on('requestfailed', (r) => errs.push('FAIL ' + r.url())); p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data; Object.assign(S.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'skycity'), rule: 'tdm', allies: 1, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; await new Promise((r) => setTimeout(r, 1500)); const out = [];
  const m = app.match, P = m.player; P.motor.teleport(new SF2.THREE.Vector3(-20, 0.2, 0)); P.yaw = -Math.PI / 2; P.pitch = -0.5; P.updateCamera(1); m.camera.updateMatrixWorld();
  const rc = new SF2.THREE.Raycaster(); rc.setFromCamera({ x: 0, y: 0 }, m.camera); const hits = rc.intersectObjects(m.scene.children, true).slice(0, 5);
  out.push(hits.map((h) => [h.object.name, h.object.type, h.object.material && (h.object.material.name || h.object.material.type), h.object.material && h.object.material.color && h.object.material.color.getHexString(), h.distance.toFixed(2)]));
  app.match.scene.traverse((o) => { if (o.isMesh && /floor|whiteBrick|clock/.test(o.name)) out.push([o.name, o.material.name || o.material.type, o.material.map ? 'map' : '-', o.material.color && o.material.color.getHexString(), o.visible]); });
  return out.slice(0, 12);
});
console.log(r, errs.slice(0, 8)); await b.close(); srv.close();

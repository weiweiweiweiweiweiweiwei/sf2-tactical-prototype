// v34: both teams' camouflage (front + back, bright + dim light) → tools/out/camo.png
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const shots = await p.evaluate(async () => {
  const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'paused';
  const M = app.match, THREE = SF2.THREE, sc = new THREE.Scene(); sc.background = new THREE.Color(0x6d7378); sc.environment = M.scene.environment;
  sc.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3630, 1.2)); const sun = new THREE.DirectionalLight(0xfff0dd, 2.2); sun.position.set(3, 6, 4); sc.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
  const A = app.soldiers.create('alpha', 'm4'), B = app.soldiers.create('bravo', 'm4'); A.root.position.x = -0.6; B.root.position.x = 0.6; sc.add(A.root, B.root); sc.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200), out = [], R = app.renderer; R.setRenderTarget(null);
  for (const [dim, back] of [[1, 0], [1, 1], [0.25, 0], [0.25, 1]]) {
    sc.children.forEach((o) => { if (o.isLight) o.intensity = (o.isDirectionalLight ? 2.2 : 1.2) * dim; });
    cam.position.set(0, 1.4, back ? -3.6 : 3.6); cam.lookAt(0, 1.0, 0); cam.updateMatrixWorld();
    R.render(sc, cam); out.push({ d: dim, l: back, url: R.domElement.toDataURL('image/jpeg', 0.92) });
  }
  return out;
});
fs.mkdirSync('tools/out', { recursive: true });
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:1fr 1fr">${shots.map((s) => `<div style="position:relative"><img src="${s.url}" style="width:100%"><b style="position:absolute;left:8px;top:6px;color:#fff;font:16px sans-serif">${s.d} m${s.d === 16 ? ' (zoom ×2.9)' : ''} · ${s.l ? 'LOD 1.1k' : 'full 11k'}</b></div>`).join('')}</body>`;
const p2 = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p2.setContent(html); await p2.waitForTimeout(300); await p2.screenshot({ path: 'tools/out/camo.png' });
await b.close(); srv.close(); console.log('saved');

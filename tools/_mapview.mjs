// top-down view of a map (Tab-board overview, all soldiers drawn) after N s of bot play: node tools/_mapview.mjs <mapIndex> [seconds]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, MAP = +(process.argv[2] || 0), SEC = +(process.argv[3] || 20);
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async ([map, sec]) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 5, enemies: 5 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match;
  await new Promise((r) => setTimeout(r, sec * 1000));
  const cv = document.createElement('canvas'); cv.width = cv.height = 900; const H = app.hud, team = m.player.team;
  H._overview(m, cv); const ctx = cv.getContext('2d'); // add enemies too
  const B = m.def.bounds, w = B.maxX - B.minX, d = B.maxZ - B.minZ, k = (900 - 16) / Math.max(w, d);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(450, 450); ctx.scale(k, k); ctx.translate(-(B.minX + w / 2), -(B.minZ + d / 2));
  for (const c of m.combatants) if (c.alive && c.team !== team) { const q = c.model.root.position; ctx.fillStyle = '#ff5d52'; ctx.beginPath(); ctx.arc(q.x, q.z, 3.5 / k, 0, 7); ctx.fill(); }
  for (const z of m.rules.zones || []) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2 / k; ctx.beginPath(); ctx.arc(z.pos.x, z.pos.z, z.r, 0, 7); ctx.stroke(); }
  const kills = m.combatants.reduce((n, c) => n + c.kills, 0);
  return { url: cv.toDataURL(), kills, nav: m.nav ? m.nav.nodes.length : 0 };
}, [MAP, SEC]);
fs.writeFileSync(`tools/out/mapview_${MAP}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
console.log({ kills: r.kills, nav: r.nav, errs: errs.slice(0, 3) }); await b.close(); srv.close();

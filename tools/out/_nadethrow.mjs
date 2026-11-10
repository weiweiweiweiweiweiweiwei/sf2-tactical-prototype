// scratch v67n: where a thrown grenade first lands (pitch 0 / 15 / 30 / 45°) — SF2: 17 / 37 / 52 / 54 m
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome' }); const H = await (await b.newContext()).newPage(); const errs = []; H.on('pageerror', (e) => errs.push(e.message));
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
const r = await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: SF2.MAPS.findIndex((m) => m.id === 'snow'), rule: 'tdm', mode: 'general', allies: 0, enemies: 1 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match; m.phase = 'live'; m.freezeT = 0; for (const bt of m.bots) bt.ai.update = () => {};
  const p = m.player, out = {}, eye = p.eyePos(new SF2.THREE.Vector3()); out.eyeY = +(eye.y - p.motor.pos.y).toFixed(2);
  for (const deg of [0, 15, 30, 45]) {
    p.pitch = deg * Math.PI / 180; const n0 = m.grenades.length; const def = SF2.WEAPON_DEFS.smoke; const W = m.weapons.weapons.find((w) => w.kind === 'grenade') || null;
    const ray = m.weapons.current.aimRay(); const vel = ray.d.clone().multiplyScalar(SF2.CFG.nade.speed); vel.y += SF2.CFG.nade.tossZ; // (the same velocity _throw builds, standing still)
    const o = ray.o.clone(); m.throwGrenade(p, def, o, vel); const n = m.grenades[m.grenades.length - 1]; n.def = Object.assign({}, def, { fuse: 99 });
    const t0 = m.time; await new Promise((res) => { const w = () => { const v = n.body.velocity; if (m.time - t0 > 0.15 && (Math.abs(v.y) < 0.5 && Math.hypot(v.x, v.z) < 17 || n.body.position.y < o.y - 3) || m.time - t0 > 8) res(); else setTimeout(w, 5); }; w(); });
    out[deg] = { d: +Math.hypot(n.body.position.x - o.x, n.body.position.z - o.z).toFixed(1), t: +(m.time - t0).toFixed(2) };
  } return out; });
console.log('NADE', JSON.stringify(r), errs.slice(0, 2)); await b.close(); srv.close();

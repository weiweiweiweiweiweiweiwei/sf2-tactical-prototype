// scratch v67m: one gun's hip / ADS view in a match → tools/out/gunview_<id>_<hip|ads>.jpg   GUNS=p90,m4a1
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const H = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; H.on('pageerror', (e) => errs.push(e.message)); H.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await H.goto(`http://127.0.0.1:${srv.address().port}/${process.env.PAGE || 'index.html'}`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'high'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 0, enemies: 1, loadout: 0 });
  await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match; for (const bt of m.bots) { bt.ai.update = () => {}; bt.motor.teleport(new SF2.THREE.Vector3(500, -200, 500)); } await new Promise((r) => setTimeout(r, 7000)); m.paused = false; });
const info = {};
for (const id of (process.env.GUNS || 'p90').split(',')) {
  info[id] = await H.evaluate(async (id) => { const def = SF2.WEAPON_DEFS[id]; await SF2.ensureGunModels([def]); const ws = app.match.weapons; ws.rebuild([def]); ws.setAds(false, true); const vm = ws.current.vm;
    let n = 0, vis = 0; vm.group.traverse((o) => { if (o.isMesh) { n++; if (o.visible) vis++; } }); return { rig: !!vm.rig, sf2Rig: def.sf2Rig || null, model: def.model, meshes: n, visible: vis, ready: SF2.ensureGunModels && true }; }, id);
  await H.waitForTimeout(1500); await H.screenshot({ path: `tools/out/gunview_${id}_hip${process.env.TAG || ''}.jpg`, type: 'jpeg', quality: 80 });
  await H.evaluate(() => app.match.weapons.setAds(true, true)); await H.waitForTimeout(1500); await H.screenshot({ path: `tools/out/gunview_${id}_ads${process.env.TAG || ''}.jpg`, type: 'jpeg', quality: 80 });
  await H.evaluate(() => app.match.weapons.setAds(false, true));
}
console.log(JSON.stringify(info), errs.slice(0, 6)); await b.close(); srv.close();

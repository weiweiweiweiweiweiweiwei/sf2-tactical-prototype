// Damage-model screenshots (v58) → tools/out/dmg_room.png (room 設置 with 扣血機制), dmg_apex_hud.png (shield bar),
// dmg_helmet.png (a SF2 headshot knocking a bot's helmet off).   node tools/_dmgshots.mjs
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); fs.mkdirSync('tools/out', { recursive: true });
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
// room 設置
await page.evaluate(() => { const L = SF2.Settings.data.lobby; L.opts = Object.assign({}, L.opts, { dmg: 'apex' }); app.showLobby ? app.showLobby() : null; });
await page.evaluate(() => { for (const id of ['hub']) document.getElementById(id).classList.remove('on'); document.getElementById('lobby').classList.add('on'); app.state = 'lobby'; app.refreshLobby(); document.getElementById('lbOptModal').classList.add('on'); });
await page.waitForTimeout(400); await page.screenshot({ path: 'tools/out/dmg_room.png' });
// Apex HUD: a damaged shield and some health missing
await page.evaluate(async () => { document.getElementById('lbOptModal').classList.remove('on'); Object.assign(SF2.Settings.data.lobby, { map: 0, rule: 'tdm', allies: 1, enemies: 1 }); await app.startMatch(); app.state = 'playing'; const m = app.match; m.phase = 'live'; m.player.spawnProtect = 0; m.player.evo = 600; m.refit(m.player); m.player.shield = 62; m.player.hp = 81; m.player.hurtT = m.time; });
await page.waitForTimeout(600); await page.screenshot({ path: 'tools/out/dmg_apex_hud.png' });
// SF2 helmet: a bot 4 m in front of the camera takes a non-lethal headshot
await page.evaluate(async () => {
  app._teardownMatch(); const L = SF2.Settings.data.lobby; L.opts = Object.assign({}, L.opts, { dmg: 'sf2' }); await app.startMatch(); app.state = 'playing';
  const m = app.match, p = m.player, bot = m.bots.find((x) => x.team !== p.team), V = SF2.THREE.Vector3; m.phase = 'live';
  for (const c of m.bots) if (c !== bot) { c.alive = false; c.model.root.visible = false; }
  const f = p.forward(new V()); bot.motor.teleport(p.motor.pos.clone().addScaledVector(f, 3.2)); bot.yaw = p.yaw + Math.PI; bot.spawnProtect = 0; bot.ai.update = () => {};
  window.__shoot = () => { const def = SF2.WEAPON_DEFS.m4a1; m.applyDamage(bot, SF2.calcDamage(def, 'head', 4), 'head', p, def, f.clone(), bot.eyePos(new V())); return { helmet: bot.helmet, hp: bot.hp }; };
});
await page.waitForTimeout(800);
console.log('hit', await page.evaluate(() => window.__shoot()));
await page.waitForTimeout(260); await page.screenshot({ path: 'tools/out/dmg_helmet.png' });
await b.close(); srv.close(); console.log('tools/out/dmg_room.png dmg_apex_hud.png dmg_helmet.png');

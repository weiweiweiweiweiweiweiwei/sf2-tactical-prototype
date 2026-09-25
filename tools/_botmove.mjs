// v24 probe: how jittery is bot movement? lateral reversals / min, acceleration p95 / max, kills. usage: node tools/_botmove.mjs [file] [map]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const [file = 'index.html', map = '0'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/${file}`); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async (map) => {
  const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map, rule: 'tdm', allies: 6, enemies: 6 });
  await app.startMatch(); app.state = 'paused'; const M = app.match; M.player.spawnProtect = 1e9; M.player.motor.pos.y -= 0; 
  const dt = 1 / 60, N = 60 * 90, prev = new Map(), stats = { rev: 0, samples: 0, acc: [], engageT: 0, dodge: 0 };
  for (let i = 0; i < N; i++) {
    M.score.alpha = M.score.bravo = 0; M.timeLeft = 900; M.tick(dt, { x: 0, y: 0 });
    for (const bot of M.bots) {
      if (!bot.alive) { prev.delete(bot); continue; }
      const v = bot.motor.vel, rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw), lat = v.x * rx + v.z * rz, o = prev.get(bot);
      if (o) {
        const a = Math.hypot(v.x - o.vx, v.z - o.vz) / dt; stats.acc.push(a);
        if (bot.ai.state === 'ENGAGE') { stats.engageT += dt; if (Math.abs(lat) > 0.6 && o.lastLat && Math.sign(lat) !== Math.sign(o.lastLat)) stats.rev++; }
      }
      const lastLat = Math.abs(lat) > 0.6 ? lat : o ? o.lastLat : 0;
      prev.set(bot, { vx: v.x, vz: v.z, lat, lastLat });
    }
  }
  stats.acc.sort((a, b) => a - b);
  return { engageSec: +stats.engageT.toFixed(0), reversalsPerEngageMin: +(stats.rev / Math.max(1, stats.engageT) * 60).toFixed(1), accP50: +stats.acc[stats.acc.length >> 1].toFixed(1), accP95: +stats.acc[Math.floor(stats.acc.length * 0.95)].toFixed(1), accP99: +stats.acc[Math.floor(stats.acc.length * 0.99)].toFixed(1), kills: M.combatants.reduce((a, c) => a + c.kills, 0) };
}, +map);
console.log(file, 'map', map, JSON.stringify(r));
await b.close(); srv.close();

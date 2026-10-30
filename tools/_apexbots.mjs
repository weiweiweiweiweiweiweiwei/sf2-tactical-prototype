// Full-range bot probe: a real-time 5v5 on apex_full; counts kills, bot slides and double jumps, how far bots roam, and bots
// that stand still for 10 s outside combat.   node tools/_apexbots.mjs [seconds=150] [rule=tdm] [map=apex_full]
import { chromiumAny as chromium } from './pw.mjs'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), SECONDS = +(process.argv[2] || 150), RULE = process.argv[3] || 'tdm', MAP = process.argv[4] || 'apex_full';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; page.setDefaultTimeout(0);
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
const r = await page.evaluate(async ({ SECONDS, RULE, MAP }) => {
  Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === MAP), rule: RULE, allies: 5, enemies: 5 });
  await app.startMatch(); app.state = 'playing';
  const m = app.match, st = { slides: 0, airJumps: 0, stuck: 0, maxRoam: 0, samples: 0 }, prev = new Map(), still = new Map(), spawn = new Map();
  const tiles = new Set();
  for (let t = 0; t < SECONDS * 10; t++) {
    await new Promise((res) => setTimeout(res, 100));
    for (const bot of m.bots) {
      const p = prev.get(bot) || { slide: 0, air: false };
      if (bot.slideT > 0 && !(p.slide > 0)) st.slides++;
      if (bot.airJumpUsed && !p.air) st.airJumps++;
      prev.set(bot, { slide: bot.slideT, air: bot.airJumpUsed });
      if (!bot.alive) { spawn.delete(bot); still.delete(bot); continue; }
      const pos = bot.motor.pos; if (!spawn.has(bot)) spawn.set(bot, pos.clone());
      st.maxRoam = Math.max(st.maxRoam, Math.round(pos.distanceTo(spawn.get(bot))));
      tiles.add(Math.floor(pos.x / 20) + ',' + Math.floor(pos.z / 20));
      const s = still.get(bot);
      if (!s || pos.distanceTo(s.p) > 1) still.set(bot, { p: pos.clone(), t }); else if (t - s.t === 100 && !['ENGAGE', 'COVER', 'HOLD', 'MELEE', 'OBJECTIVE', 'SEARCH'].includes(bot.ai.state)) { st.stuck++; (st.stuckAt = st.stuckAt || []).push([Math.round(pos.x), Math.round(pos.y), Math.round(pos.z), bot.ai.state]); }
    }
    if (m.phase === 'over') break;
  }
  return { ...st, areaCells20m: tiles.size, kills: m.combatants.reduce((a, c) => a + c.kills, 0), score: m.score || m.teamScore || null, fps: window.__stats && window.__stats.avgFps };
}, { SECONDS, RULE, MAP });
console.log(r, errs.slice(0, 5)); await b.close(); srv.close();

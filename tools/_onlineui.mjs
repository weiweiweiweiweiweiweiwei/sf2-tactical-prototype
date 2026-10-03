// v26/v27: public room list + pause menu screenshots, and the host's background ticking (hidden tab keeps the match alive).
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, log = (...a) => console.log(...a), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const H = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage(), C = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const errs = []; for (const p of [H, C]) p.on('pageerror', (e) => errs.push(e.message));
await H.goto(base); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(() => { const S = SF2.Settings.data; S.nick = 'Wei'; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 3, enemies: 3 }); app.createRoom(); });
await H.waitForFunction(() => app.room && app.room.online, null, { timeout: 30000 });
await H.evaluate(() => { document.getElementById('lbPub').checked = true; app.room.setPublic(true); }); // listed in the hub
const code = await H.evaluate(() => app.room.code); log('room', code);
// client hub with the public room in the list
await C.goto(base); await C.waitForFunction(() => window.app && app.dir);
await C.evaluate(() => { SF2.Settings.data.nick = 'Ming'; document.getElementById('hubNick').value = 'Ming'; SF2.Settings.data.quality = 'low'; });
await C.waitForFunction((code) => app.dir.rooms.some((r) => r.code === code), code, { timeout: 20000 }).catch(() => log('room not listed'));
await sleep(400); await C.screenshot({ path: 'tools/out/online_lobby.png' });
// join via the list button, then the host starts
await C.evaluate((code) => document.querySelector(`#hubRooms button[data-code="${code}"]`).click(), code);
await C.waitForFunction(() => app.state === 'lobby' && app.room && app.room.entered, null, { timeout: 30000 }).catch(() => log('client not in the room'));
await H.evaluate(() => app.startMatch().then(() => { app.state = 'playing'; }));
await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 40000 }).catch(() => log('client not ready'));
await C.evaluate(() => { app.input.locked = true; });
for (let i = 0; i < 4; i++) { await sleep(1500); log('client rtt', await C.evaluate(() => Math.round(app.match.net.rtt))); }
// host pause menu (online: the match keeps running)
await H.evaluate(() => { app.input.locked = false; app.input.onLockChange(false); });
await sleep(500); await H.screenshot({ path: 'tools/out/online_pause.png' });
const t0 = await H.evaluate(() => app.match.time);
await sleep(1500);
log('host paused, match time advanced', (await H.evaluate(() => app.match.time) - t0).toFixed(2), 's in 1.5 s');
// background: rAF loop stopped + document.hidden → the worker keeps ticking; the client must keep receiving snapshots
await H.evaluate(() => { app.loop = () => {}; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
const h0 = await H.evaluate(() => app.match.time), s0 = await C.evaluate(() => app.match.net.lastTick);
await sleep(4000);
const h1 = await H.evaluate(() => app.match.time), s1 = await C.evaluate(() => app.match.net.lastTick);
log(`hidden host: match time +${(h1 - h0).toFixed(2)} s in 4 s · client received ${s1 - s0} snapshots · worker running: ${await H.evaluate(() => !!app.bgTick.worker)}`);
log('client still connected:', await C.evaluate(() => ({ phase: app.match.phase, rtt: Math.round(app.match.net.rtt) })), 'host peers:', await H.evaluate(() => app.match.net.players));
if (errs.length) log('ERRORS', errs.slice(0, 6));
await b.close(); srv.close();

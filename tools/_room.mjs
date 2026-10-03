// v27 rooms, end to end over real Supabase + WebRTC: two browser profiles (= two computers).
// hub → create room → friend joins by code → team switch / settings sync → both start together → back to the room
// → second match → host leaves mid-match → drop-in → host leaves the room (friend takes it over) → the room goes public
// → old host rejoins it from the hub's list
// node tools/_room.mjs [shots]   (shots → screenshots in tools/out/room_*.png)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, SHOTS = process.argv[2] === 'shots';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const mk = async () => (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const H = await mk(), C = await mk(), errs = [];
for (const [p, k] of [[H, 'H'], [C, 'C']]) { p.on('pageerror', (e) => errs.push(k + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(k + ' ' + m.text()); }); }
let fails = 0; const ok = (cond, what, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${extra ? '  · ' + extra : ''}`); if (!cond) fails++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `tools/out/room_${name}.png` }); };
const wait = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const st = (p) => p.evaluate(() => ({ state: app.state, role: app.room && app.room.role, code: app.room && app.room.code, online: !!(app.room && app.room.online), phase: app.room && app.room.phase, members: app.room ? app.room.members.map((m) => `${m.name}/${m.team}/${m.st}${m.host ? '/H' : ''}`) : [] }));

for (const [p, nick] of [[H, 'Wei'], [C, 'Ming']]) {
  await p.goto(base); await p.waitForFunction(() => window.app && window.SF2 && app.dir);
  await p.evaluate((nick) => { const S = SF2.Settings.data; S.nick = nick; S.quality = 'low'; S.hdri = false; document.getElementById('hubNick').value = nick; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 3, enemies: 3 }); }, nick);
}
ok(await H.evaluate(() => app.state === 'hub' && document.getElementById('hub').classList.contains('on')), 'starts in the hub (大廳)');
await shot(H, 'hub');

// 1. create a room: it has a 6-digit code before any match
await H.click('#hubCreate');
const created = await wait(H, () => app.room && app.room.online, null, 20000);
const code = await H.evaluate(() => app.room.code);
ok(created && /^\d{6}$/.test(code), 'room created with a 6-digit code', code);
await H.click('#lbInvite'); await sleep(300);
ok(await H.evaluate(() => document.getElementById('lbInvPop').classList.contains('on') && document.getElementById('lbInvLinkTxt').value.endsWith('?room=' + app.room.code)), 'invite pop-up: link + code');
await shot(H, 'host_invite');
await H.mouse.click(300, 600); await sleep(200);
ok(await H.evaluate(() => !document.getElementById('lbInvPop').classList.contains('on')), 'pop-up closes on an outside click');

// 2. friend joins by typing the code in the hub
await C.click('#hubJoinOpen'); await sleep(300);
await C.type('#hubCode', code.slice(0, 3) + code.slice(3), { delay: 30 });
ok(await C.evaluate(() => document.getElementById('hubCode').value), 'code box formats as you type', await C.evaluate(() => document.getElementById('hubCode').value));
await shot(C, 'hub_join');
const t0 = Date.now(); await C.click('#hubJoinGo');
const inRoom = await wait(C, () => app.state === 'lobby' && app.room && app.room.entered, null, 30000);
ok(inRoom, 'friend is in the room', `${Date.now() - t0} ms`);
await sleep(500);
const h1 = await st(H), c1 = await st(C);
ok(h1.members.length === 2 && c1.members.length === 2, 'both see 2 members', JSON.stringify(h1.members));
ok(await H.evaluate(() => [...document.querySelectorAll('#lbListA li.human .nm, #lbListB li.human .nm')].map((e) => e.textContent).join(',').includes('Ming')), "host's team list shows the friend");
await shot(H, 'host_with_friend'); await shot(C, 'guest_room');

// 3. team switch (guest) + settings sync (host)
await C.click('#lbJoinB'); await sleep(800);
ok((await st(H)).members.some((m) => m.startsWith('Ming/bravo')), 'friend switched to bravo (host sees it)');
await H.evaluate(() => { document.querySelectorAll('#lbMaps button')[1].click(); }); await sleep(600);
const syncMap = await C.evaluate(() => app.roomCfg().map); ok(syncMap === 1, 'host picks map 2 → friend sees it', String(syncMap));
await H.evaluate(() => { document.querySelectorAll('#lbMaps button')[0].click(); }); await sleep(400);
ok(await C.evaluate(() => document.getElementById('lbStart').disabled && document.getElementById('lobby').classList.contains('guest')), 'friend: settings read-only, start button waits for the host');

// 4. match 1: host presses GO → countdown on both → both play
await H.click('#lbStart'); await sleep(700);
ok(await C.evaluate(() => app.state === 'countdown' && document.getElementById('lbCount').classList.contains('on')), 'friend sees the countdown too');
const t1 = Date.now();
const both = (await wait(H, () => app.state === 'playing' && app.match && app.match.net, null, 60000)) && (await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000));
ok(both, 'match 1: both in the match', `${Date.now() - t1} ms after the countdown`);
await sleep(1500);
const m1 = { h: await H.evaluate(() => ({ humans: app.match.humans.map((x) => x.name + '/' + x.team), bots: app.match.bots.length })), c: await C.evaluate(() => ({ team: app.match.player.team, ghosts: app.match.net.ghosts.size })) };
ok(m1.h.humans.length === 1 && m1.c.team === 'bravo', 'host runs the friend (bravo) in the match', JSON.stringify(m1));
await shot(C, 'guest_match');

// 5. match ends → both back in the same room
await H.evaluate(() => app.match.endMatch('alpha'));
ok(await wait(C, () => app.state === 'ended', null, 8000), 'friend gets the end screen');
await H.click('#endBack'); await C.click('#endBack');
const back = (await wait(H, () => app.state === 'lobby', null, 10000)) && (await wait(C, () => app.state === 'lobby', null, 10000));
await sleep(600);
const h2 = await st(H), c2 = await st(C);
ok(back && h2.phase === 'room' && h2.members.length === 2 && h2.members.every((m) => m.includes('/room') || m.endsWith('/H')), 'both back in the same room', JSON.stringify(h2.members));

// 6. match 2 on the same connection; the host leaves it mid-way → everyone back in the room
await H.click('#lbStart');
const both2 = (await wait(H, () => app.state === 'playing' && app.match && app.match.humans.length === 1, null, 60000)) && (await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000));
ok(both2, 'match 2 on the same room connection');
await H.evaluate(() => app.returnToLobby());
ok(await wait(C, () => app.state === 'ended', null, 8000), 'host left the match → it ends for the friend');
await C.click('#endBack');
ok((await wait(H, () => app.state === 'lobby', null, 10000)) && (await wait(C, () => app.state === 'lobby', null, 10000)), 'both back in the room again');

// 7. friend drops into a running match (leaves it, then 加入對戰)
await H.click('#lbStart');
await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000);
await C.evaluate(() => app.returnToLobby()); await wait(C, () => app.state === 'lobby', null, 10000); await sleep(500);
ok(await C.evaluate(() => document.getElementById('lbStart').textContent.includes('加入對戰')), 'friend left the match: room offers 加入對戰');
await C.click('#lbStart');
ok(await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000), 'friend dropped back into the running match');
await H.evaluate(() => app.returnToLobby()); await wait(C, () => app.state === 'ended', null, 8000); await C.click('#endBack');
await wait(H, () => app.state === 'lobby', null, 10000); await wait(C, () => app.state === 'lobby', null, 10000); await sleep(500);

// 8. host leaves the room → the friend takes it over (same code)
await H.click('#lbLeave');
ok(await H.evaluate(() => app.state === 'hub' && !app.room), 'host is back in the hub');
const took = await wait(C, () => app.room && app.room.role === 'host' && app.room.online, null, 30000);
const c3 = await st(C);
ok(took && c3.code === code, 'friend became the host of the same room', JSON.stringify(c3));
await shot(C, 'guest_took_over');

// 9. the old host joins the same code again (now as a guest)
await C.click('#lbInvite'); await C.click('#lbPub'); await C.mouse.click(300, 600); // the new host makes the room public
const listed = await wait(H, (code) => !!document.querySelector(`#hubRooms button[data-code="${code}"]`), code, 20000);
ok(listed, 'public room shows in the hub list');
await shot(H, 'hub_public');
if (listed) await H.click(`#hubRooms button[data-code="${code}"]`); else { await H.click('#hubJoinOpen'); await H.fill('#hubCode', code); await H.click('#hubJoinGo'); }
ok(await wait(H, () => app.state === 'lobby' && app.room && app.room.entered && app.room.role === 'guest', null, 30000), 'old host rejoins the room as a guest (from the list)');
await sleep(600); ok((await st(C)).members.length === 2, 'new host sees 2 members', JSON.stringify((await st(C)).members));

if (errs.length) console.log('ERRORS', errs.slice(0, 10));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); srv.close();

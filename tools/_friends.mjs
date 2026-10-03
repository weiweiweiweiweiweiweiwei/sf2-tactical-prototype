// v28 friends, end to end against the real Supabase project: two browser profiles (= two players / computers).
// friend code → request → accept → online status → room invite pop-up → join → follow a friend's room → remove
// node tools/_friends.mjs [shots]   — prints the two test player ids (delete them afterwards: supabase sf2_players)
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, SHOTS = process.argv[2] === 'shots';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const mk = async () => (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const A = await mk(), B = await mk(), errs = [];
for (const [p, k] of [[A, 'A'], [B, 'B']]) { p.on('pageerror', (e) => errs.push(k + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(k + ' ' + m.text()); }); }
let fails = 0; const ok = (c, what, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${extra ? '  · ' + extra : ''}`); if (!c) fails++; };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `tools/out/friends_${n}.png` }); };
const wait = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
for (const [p, nick] of [[A, 'zzWei'], [B, 'zzMing']]) {
  await p.goto(base); await p.waitForFunction(() => window.app && app.friends);
  await p.evaluate((nick) => { const S = SF2.Settings.data; S.nick = nick; S.quality = 'low'; document.getElementById('hubNick').value = nick; }, nick);
}
ok(await A.evaluate(() => !app.friends.hasId && !app.friends.me), 'no server identity until the friends panel is opened');

// 1. both open the panel → each gets an 8-digit friend code
await A.click('#hubFriends'); await B.click('#hubFriends');
await wait(A, () => app.friends.me && app.friends.ok); await wait(B, () => app.friends.me && app.friends.ok);
const ida = await A.evaluate(() => app.friends.me), idb = await B.evaluate(() => app.friends.me);
ok(/^\d{8}$/.test(ida.code) && /^\d{8}$/.test(idb.code), 'friend codes', `${ida.code} / ${idb.code}`);
console.log('test players (delete afterwards):', ida.id, idb.id);

// 2. B adds A by code → A gets the request (poke → seconds, not the 5 s poll)
await B.fill('#frCode', ida.code); await B.evaluate(() => document.getElementById('frCode').dispatchEvent(new Event('input')));
const t0 = Date.now(); await B.click('#frAdd');
ok(await wait(B, () => /已送出/.test(document.getElementById('frMsg').textContent)), 'B sent a friend request');
const gotReq = await wait(A, () => app.friends.incoming.length === 1, null, 12000);
ok(gotReq, 'A sees the request', `${Date.now() - t0} ms`);
await shot(A, 'request');
await A.click('#frList button[data-act="acc"]');
ok(await wait(A, () => app.friends.friends.length === 1 && app.friends.friends[0].online), 'A: B is a friend, online');
ok(await wait(B, () => app.friends.friends.length === 1 && app.friends.friends[0].online, null, 12000), 'B: A is a friend, online');

// 3. A opens a room: B sees "在房間 …" with a 加入 button
await A.click('#frClose'); await A.click('#hubCreate'); await wait(A, () => app.room && app.room.online);
const code = await A.evaluate(() => app.room.code);
ok(await wait(B, (c) => app.friends.friends[0].room === c, code, 15000), "B sees A's room in the friend list", code);
await shot(B, 'list');

// 4. A invites B from the room's invite pop-up → B's screen pops up the invite
await B.click('#frClose');
await A.click('#lbInvite'); await sleep(300);
ok(await A.evaluate(() => !!document.querySelector('#lbInvFriends button[data-act="inv"]')), 'invite pop-up lists the online friend');
await shot(A, 'invite_popup');
const t1 = Date.now(); await A.click('#lbInvFriends button[data-act="inv"]');
const popped = await wait(B, () => document.getElementById('invCard').classList.contains('on'), null, 12000);
ok(popped, 'B gets the invite card', `${Date.now() - t1} ms`);
await shot(B, 'invite_card');
await B.click('#invCardGo');
ok(await wait(B, () => app.state === 'lobby' && app.room && app.room.entered, null, 30000), "B accepted → in A's room");
ok((await A.evaluate(() => app.room.members.length)) === 2, 'A sees 2 members');

// 5. B leaves, then follows A from the friend list (加入)
await B.click('#lbLeave'); await wait(B, () => app.state === 'hub');
await B.click('#hubFriends'); await sleep(500);
ok(await wait(B, () => !!document.querySelector('#frList button[data-act="join"]'), null, 12000), 'friend list offers 加入');
await B.click('#frList button[data-act="join"]');
ok(await wait(B, () => app.state === 'lobby' && app.room && app.room.entered, null, 30000), "B joined A's room from the friend list");

// 6. remove: two clicks; both lists empty
await A.click('#lbFriends'); await sleep(300);
await A.click('#frList button[data-act="rm"]'); await A.click('#frList button[data-act="rm"]');
ok(await wait(A, () => app.friends.friends.length === 0), 'A removed B');
ok(await wait(B, () => app.friends.friends.length === 0, null, 12000), "B's list updated");

if (errs.length) console.log('ERRORS', errs.slice(0, 10));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); srv.close();

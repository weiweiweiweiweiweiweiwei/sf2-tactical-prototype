// v31 chat over a real room (Supabase + WebRTC, two browser profiles): room chat both ways, team-only lines, markup
// shown as text, in-match chat with Enter (the soldier stands still while typing).  node tools/_chat.mjs [shots]
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }, SHOTS = process.argv[2] === 'shots';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/index.html`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const mk = async () => (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const H = await mk(), C = await mk(), errs = [];
for (const [p, k] of [[H, 'H'], [C, 'C']]) { p.on('pageerror', (e) => errs.push(k + ' ' + e.message)); p.on('dialog', (d) => { errs.push(k + ' DIALOG ' + d.message()); d.dismiss(); }); }
let fails = 0; const ok = (c, what, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${extra ? '  · ' + extra : ''}`); if (!c) fails++; };
const wait = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const logText = (p, id) => p.evaluate((id) => document.getElementById(id).textContent, id);
for (const [p, nick] of [[H, 'Wei'], [C, 'Ming']]) {
  await p.goto(base); await p.waitForFunction(() => window.app && app.dir);
  await p.evaluate((nick) => { const S = SF2.Settings.data; S.nick = nick; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 3, enemies: 3 }); }, nick);
}
await H.click('#hubCreate'); await wait(H, () => app.room && app.room.online, null, 20000);
const code = await H.evaluate(() => app.room.code);
await H.fill('#lbChatIn', '早安，先講一句'); await H.press('#lbChatIn', 'Enter');
await C.evaluate((c) => app.joinRoom(c), code); await wait(C, () => app.state === 'lobby' && app.room && app.room.entered, null, 30000);
ok(/早安，先講一句/.test(await logText(C, 'lbChatLog')), 'a friend who joins later sees the earlier lines');
ok(/Ming 進入了房間/.test(await logText(H, 'lbChatLog')), 'host log: "Ming 進入了房間"');

// room chat both ways
await C.fill('#lbChatIn', '哈囉 Wei'); await C.press('#lbChatIn', 'Enter');
ok(await wait(H, () => /Ming：哈囉 Wei/.test(document.getElementById('lbChatLog').textContent)), 'host gets the friend\'s line');
ok(/Ming：哈囉 Wei/.test(await logText(C, 'lbChatLog')) && (await C.evaluate(() => document.getElementById('lbChatIn').value)) === '', 'friend sees his own line, box cleared');
await H.fill('#lbChatIn', '<img src=x onerror=alert(1)> 要開打了'); await H.press('#lbChatIn', 'Enter');
ok(await wait(C, () => /要開打了/.test(document.getElementById('lbChatLog').textContent)), 'friend gets the host\'s line');
ok(await C.evaluate(() => !document.querySelector('#lbChatLog img') && /<img src=x/.test(document.getElementById('lbChatLog').textContent)), 'markup shows as plain text (no element, no script)');

// team-only: Ming on bravo, Wei (alpha) sends a team line → Ming must not get it; Ming's team line → Wei must not get it
await C.click('#lbJoinB'); await sleep(800);
await H.click('#lbChatMode'); await H.fill('#lbChatIn', '藍隊悄悄話'); await H.press('#lbChatIn', 'Enter'); await H.click('#lbChatMode');
await C.click('#lbChatMode'); await C.fill('#lbChatIn', '紅隊悄悄話'); await C.press('#lbChatIn', 'Enter'); await C.click('#lbChatMode');
await sleep(1500);
ok(!/藍隊悄悄話/.test(await logText(C, 'lbChatLog')) && /\[隊伍\] Wei：藍隊悄悄話/.test(await logText(H, 'lbChatLog')), "alpha's team line stays in alpha");
ok(!/紅隊悄悄話/.test(await logText(H, 'lbChatLog')) && /\[隊伍\] Ming：紅隊悄悄話/.test(await logText(C, 'lbChatLog')), "bravo's team line stays in bravo");
if (SHOTS) await C.screenshot({ path: 'tools/out/chat_room.png' });

// in the match: Enter opens the box, typing does not move the soldier, Enter sends
await H.click('#lbStart');
await wait(H, () => app.state === 'playing' && app.match && app.match.net, null, 60000);
ok(await wait(C, () => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, 60000), 'both in the match');
await C.evaluate(() => { app.input.locked = true; });
await wait(C, () => app.match.phase === 'live', null, 15000); await sleep(500);
const before = await C.evaluate(() => app.match.player.motor.pos.toArray());
await C.evaluate(() => app.input.onKey('Enter'));
ok(await C.evaluate(() => app.chatOpen && document.getElementById('chatbox').classList.contains('open')), 'Enter opens the chat box');
await C.type('#chatInput', 'wwwww 往前衝', { delay: 40 }); await sleep(300);
const after = await C.evaluate(() => app.match.player.motor.pos.toArray());
ok(Math.hypot(after[0] - before[0], after[2] - before[2]) < 0.05, 'typing W in the box does not move the soldier');
if (SHOTS) await C.screenshot({ path: 'tools/out/chat_match.png' });
await C.press('#chatInput', 'Enter');
ok(await wait(H, () => /Ming：wwwww 往前衝/.test(document.getElementById('chatlog').textContent)), "host's in-match chat shows the line");
ok(await C.evaluate(() => !app.chatOpen), 'the box closes after sending');
if (SHOTS) await H.screenshot({ path: 'tools/out/chat_match_host.png' });
if (errs.length) console.log('ERRORS', errs.slice(0, 8));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); srv.close();

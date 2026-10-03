// v26/v27: can one person test online play alone — two tabs of the SAME browser profile, host opened from the local file?
// node tools/_samebrowser.mjs        → tab 2 = local file + ?room=CODE
// node tools/_samebrowser.mjs link   → tab 2 = the copied invite link (GitHub Pages copy — must be pushed first)
// node tools/_samebrowser.mjs relay  → tab 2 = local file + ?room=CODE&relay=1: only the TURN relay is allowed (v32)
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), file = pathToFileURL(path.resolve('index.html')).href, errs = [];
const H = await ctx.newPage(); H.on('pageerror', (e) => errs.push('H ' + e.message));
await H.goto(file); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(() => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 3, enemies: 3 }); app.createRoom(); });
await H.waitForFunction(() => app.room && app.room.online, null, { timeout: 30000 });
const code = await H.evaluate(() => app.room.code);
console.log('room', code, '· copied link would be', await H.evaluate((c) => SF2net.inviteLink(c), code));
// second tab, same profile (shared localStorage, onlineHost still ticked), local file + ?room=
const C = await ctx.newPage(); C.on('pageerror', (e) => errs.push('C ' + e.message));
const url = process.argv[2] === 'link' ? await H.evaluate((c) => SF2net.inviteLink(c), code) : file + '?room=' + code + (process.argv[2] === 'relay' ? '&relay=1' : '');
console.log('tab 2 opens', url);
const t0 = Date.now(); await C.goto(url); await C.waitForFunction(() => window.app && window.SF2);
console.log('tab 2 page loaded in', Date.now() - t0, 'ms');
const inRoom = await C.waitForFunction(() => app.state === 'lobby' && app.room && app.room.entered, null, { timeout: 30000 }).then(() => true, () => false);
console.log(inRoom ? `tab 2 is in the room after ${Date.now() - t0} ms · host sees ${await H.evaluate(() => app.room.members.length)} members` : 'tab 2 did NOT reach the room: ' + await C.evaluate(() => document.getElementById('hubMsg').textContent));
const t1 = Date.now(); await H.evaluate(() => app.startMatch().then(() => { app.state = 'playing'; }));
const ok = await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 40000 }).then(() => true, () => false);
console.log(ok ? `both in the match ${Date.now() - t1} ms after the host started` : 'tab 2 did NOT get into the match');
if (ok) console.log('host sees players:', await H.evaluate(() => app.match.net.players), '· tab 2 is a guest?', await C.evaluate(() => app.room.role === 'guest'));
console.log('connection path · tab 2:', await C.evaluate(() => app.room && app.room.t && app.room.t.via), '· host relayed peers:', await H.evaluate(() => app.room && app.room.t && app.room.t.relayed), '· TURN configured:', await C.evaluate(() => SF2net.ONLINE.turn));
if (errs.length) console.log('ERRORS', errs.slice(0, 6));
await b.close();

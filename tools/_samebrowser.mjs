// v26: can one person test online play alone — two tabs of the SAME browser profile, host opened from the local file?
// node tools/_samebrowser.mjs        → tab 2 = local file + ?room=CODE
// node tools/_samebrowser.mjs link   → tab 2 = the copied invite link (GitHub Pages copy — must be pushed first)
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), file = pathToFileURL(path.resolve('index.html')).href, errs = [];
const H = await ctx.newPage(); H.on('pageerror', (e) => errs.push('H ' + e.message));
await H.goto(file); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.onlineHost = true; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 3, enemies: 3 }); await app.startMatch(); app.state = 'playing'; });
await H.waitForFunction(() => app.match && app.match.onlineCode, null, { timeout: 30000 });
const code = await H.evaluate(() => app.match.onlineCode);
console.log('room', code, '· copied link would be', await H.evaluate((c) => SF2net.inviteLink(c), code));
// second tab, same profile (shared localStorage, onlineHost still ticked), local file + ?room=
const C = await ctx.newPage(); C.on('pageerror', (e) => errs.push('C ' + e.message));
const url = process.argv[2] === 'link' ? await H.evaluate((c) => SF2net.inviteLink(c), code) : file + '?room=' + code;
console.log('tab 2 opens', url);
const t0 = Date.now(); await C.goto(url); await C.waitForFunction(() => window.app && window.SF2);
console.log('tab 2 page loaded in', Date.now() - t0, 'ms');
const t1 = Date.now(); await C.waitForFunction(() => app.match, null, { timeout: 40000 }).catch(() => {}); console.log('tab 2 match built after +', Date.now() - t1, 'ms');
const ok = await C.waitForFunction(() => app.state === 'playing' && app.match && app.match.net && app.match.net.ready, null, { timeout: 40000 }).then(() => true, () => false);
console.log(ok ? `tab 2 joined in ${Date.now() - t0} ms` : 'tab 2 did NOT join: ' + await C.evaluate(() => document.getElementById('lbNetMsg').textContent));
if (ok) console.log('host sees players:', await H.evaluate(() => app.match.net.players), '· tab 2 hosting its own room?', await C.evaluate(() => !!app.match.onlineCode));
if (errs.length) console.log('ERRORS', errs.slice(0, 6));
await b.close();

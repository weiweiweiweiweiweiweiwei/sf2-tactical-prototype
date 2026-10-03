// v26: does the background ticker's blob Worker start on a double-clicked (file://) page, and do the online module load there?
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage(), errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(pathToFileURL(path.resolve('index.html')).href); await p.waitForFunction(() => window.app && app.bgTick);
const r = await p.evaluate(async () => {
  let n = 0; const t = new SF2net.BackgroundTicker(() => n++); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); t.set(true);
  await new Promise((res) => setTimeout(res, 500)); t.set(false);
  let dir = 'n/a'; try { await app.dir.open(); dir = 'ok, rooms: ' + app.dir.rooms.length; } catch (e) { dir = 'failed: ' + e.message; }
  return { ticks: n, dir, link: SF2net.inviteLink('ABCDE') };
});
console.log(JSON.stringify(r), errs.length ? errs : '');
await b.close();

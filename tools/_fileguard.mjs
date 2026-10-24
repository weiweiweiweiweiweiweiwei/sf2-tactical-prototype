// file:// guard probe: a double-clicked index.html must explain the Apex maps need 開始遊戲.bat and fall back to the hub.
// node tools/_fileguard.mjs
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage();
await p.goto(pathToFileURL(path.resolve('index.html')).href); await p.waitForFunction(() => window.app && window.SF2);
const r = await p.evaluate(async () => {
  const i = SF2.MAPS.findIndex((m) => m.id === 'apex_test'); Object.assign(SF2.Settings.data.lobby, { map: i, rule: 'tdm', allies: 1, enemies: 1 });
  const label = [...document.querySelectorAll('#lbMaps button')][i].textContent;
  const run = app.startMatch(); await new Promise((r) => setTimeout(r, 1500));
  const shown = document.getElementById('ldStep').textContent; await run;
  return { label, shown, state: app.state, hub: document.getElementById('hub').classList.contains('on'), loader: document.getElementById('loader').classList.contains('on') };
});
console.log(r); await b.close();
if (!/開始遊戲\.bat/.test(r.shown) || r.state !== 'hub' || r.loader || !/需本機伺服器/.test(r.label)) { console.error('FILE_GUARD_FAIL'); process.exit(1); }
console.log('FILE_GUARD_OK');

// Loads the published GitHub Pages build in headless Chrome and starts a short match: node tools/_pagescheck.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://weiweiweiweiweiweiweiwei.github.io/sf2-tactical-prototype/';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
p.on('pageerror', (e) => errs.push('uncaught: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto(url + '?t=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.app && window.SF2, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const S = SF2.Settings.data; Object.assign(S.lobby, { map: 0, rule: 'tdm', allies: 4, enemies: 4 });
  await app.startMatch(); app.state = 'playing'; await new Promise((res) => setTimeout(res, 8000));
  return { title: document.title, running: !!(app.match && app.match.running), map: app.match && app.match.def.id, fps: window.__stats && window.__stats.avgFps, gpu: app.gpuName };
});
await p.screenshot({ path: 'tools/out/pages.png' });
console.log(JSON.stringify({ ...r, errors: errs })); await b.close();

// file:// play probe: a double-clicked index.html must start the Apex maps (script-chunk packs) with their textures.
// node tools/_fileplay.mjs [apex_skulltown,apex_full]   → tools/out/fileplay_<id>.png
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const IDS = (process.argv[2] || 'apex_skulltown,apex_full').split(','), url = pathToFileURL(path.resolve('index.html')).href;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = false; fs.mkdirSync('tools/out', { recursive: true });
for (const id of IDS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url); await p.waitForFunction(() => window.app && window.SF2);
  const r = await p.evaluate(async (id) => {
    Object.assign(SF2.Settings.data.lobby, { map: SF2.MAPS.findIndex((m) => m.id === id), rule: 'tdm', allies: 1, enemies: 1 });
    const t = performance.now(); await app.startMatch();
    const m = app.match, maps = new Set();
    if (m) m.scene.traverse((o) => { for (const mt of [].concat(o.material || [])) if (mt.map && mt.map.image) maps.add(mt.map.image); });
    const sized = [...maps].filter((im) => (im.width || 0) > 0).length;
    return { ms: Math.round(performance.now() - t), running: !!(m && m.running), textures: maps.size, decoded: sized };
  }, id);
  await p.waitForTimeout(2500); await p.screenshot({ path: `tools/out/fileplay_${id}.png` });
  const ok = r.running && r.textures > 20 && r.decoded === r.textures && !errs.length;
  if (!ok) failed = true;
  console.log(id, ok ? 'OK' : 'FAIL', r, errs.slice(0, 5)); await p.close();
}
await b.close(); console.log(failed ? 'FILE_PLAY_FAIL' : 'FILE_PLAY_OK'); process.exit(failed ? 1 : 0);

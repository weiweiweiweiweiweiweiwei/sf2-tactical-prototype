// v33: does the recorded sound pack load from a double-clicked file:// page (script tag, not fetch)?
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage();
await p.goto(pathToFileURL(path.resolve('index.html')).href); await p.waitForFunction(() => window.app && window.SF2);
const t0 = Date.now();
const r = await p.evaluate(async () => { const AE = app.audio.constructor, t = performance.now(); const ok = await AE.loadSamples(); return { ok, groups: Object.keys(AE.samples).length, decodeMs: Math.round(performance.now() - t) }; });
console.log('file:// sound pack', JSON.stringify(r), `${Date.now() - t0} ms`);
await b.close();

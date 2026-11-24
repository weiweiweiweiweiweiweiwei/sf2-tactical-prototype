// favicon PNGs from assets/favicon.svg (transparent): 32 px, 180 px (apple-touch), 512 px
import { chromium } from 'playwright'; import fs from 'node:fs';
const svg = fs.readFileSync('assets/favicon.svg', 'utf8'), b = await chromium.launch({ channel: 'chrome' });
for (const n of [32, 180, 512]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="1000" height="1000"', `width="${n}" height="${n}"`)}</body></html>`);
  await p.screenshot({ path: `assets/favicon-${n}.png`, omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } }); await p.close();
}
await b.close(); console.log('png ok');

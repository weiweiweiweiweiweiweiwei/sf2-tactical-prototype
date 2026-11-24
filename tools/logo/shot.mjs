// screenshot assets/logo/concepts/sheet.html -> assets/logo/concepts/sheet.png
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 1352, height: 1140 } });
await p.goto(pathToFileURL(path.resolve('assets/logo/concepts/sheet.html')).href); await p.waitForTimeout(500);
await p.screenshot({ path: 'assets/logo/concepts/sheet.png', fullPage: true }); await b.close(); console.log('shot');

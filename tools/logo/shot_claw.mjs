// screenshot assets/logo/claw/sheet.html -> assets/logo/claw/sheet.png
import { chromium } from 'playwright'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 1720, height: 1100 } });
await p.goto(pathToFileURL(path.resolve('assets/logo/claw/sheet.html')).href); await p.waitForTimeout(500);
await p.screenshot({ path: 'assets/logo/claw/sheet.png', fullPage: true }); await b.close(); console.log('shot');

// Shared Playwright helpers for the check tools (v62u): a browser that works on the user's laptop (Chrome / Edge) and on the cloud
// box (Playwright's Chromium, or the preinstalled /opt/pw-browsers/chromium / PW_CHROMIUM), and the jsDelivr CDN served from a
// matching node_modules copy when the network blocks it (npm install --no-save three@0.170.0 cannon-es@0.20.0).
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';

const CHROMIUM = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export async function launchBrowser(opts = {}) {
  for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, {}, ...(CHROMIUM ? [{ executablePath: CHROMIUM }] : [])]) {
    try { return await chromium.launch({ ...opts, ...o }); } catch (e) { /* try next */ }
  }
  return null;
}

export function routeCdn(page, root = process.cwd()) {
  return page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
    const m = /\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.*)$/.exec(new URL(route.request().url()).pathname), dir = m && path.join(root, 'node_modules', m[1]);
    const ok = dir && fs.existsSync(dir + '/package.json') && JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')).version === m[2] && fs.existsSync(path.join(dir, m[3]));
    return ok ? route.fulfill({ path: path.join(dir, m[3]), contentType: /\.m?js$/.test(m[3]) ? 'text/javascript' : 'application/octet-stream' }) : route.continue();
  });
}

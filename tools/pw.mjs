// Shared Playwright helpers for the check tools (v62u): a browser that works on the user's laptop (Chrome / Edge) and on the cloud
// box (Playwright's Chromium, or the preinstalled /opt/pw-browsers/chromium / PW_CHROMIUM), and the jsDelivr CDN served from a
// matching node_modules copy when the network blocks it (npm install --no-save three@0.170.0 cannon-es@0.20.0).
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';

const CHROMIUM = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export async function launchBrowser(opts = {}) {
  for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, {}, ...(CHROMIUM ? [{ executablePath: CHROMIUM }] : [])]) {
    try { return wrap(await chromium.launch({ ...opts, ...o })); } catch (e) { /* try next */ }
  }
  return null;
}

// v66c5 every page of the browser gets the CDN fallback, and a goto with no waitUntil waits for the DOM only (the lobby streams
// every gun for the armory cards, so 'load' can take minutes on a slow box) — so a tool only has to swap chromium.launch for this
function wrapPage(p) {
  const goto = p.goto.bind(p); p.goto = (url, o = {}) => goto(url, { waitUntil: 'domcontentloaded', timeout: 90000, ...o });
  return p;
}
function wrap(b) {
  const np = b.newPage.bind(b), nc = b.newContext.bind(b);
  b.newPage = async (...a) => { const p = wrapPage(await np(...a)); await routeCdn(p); return p; };
  b.newContext = async (...a) => {
    const c = await nc(...a), cp = c.newPage.bind(c);
    c.newPage = async (...x) => { const p = wrapPage(await cp(...x)); await routeCdn(p); return p; };
    return c;
  };
  return b;
}
// a tool's `import { chromium } from 'playwright'` → `import { chromium } from './pw.mjs'`: launch() picks a browser that exists here
export const chromiumAny = { launch: (o = {}) => { const { channel, ...rest } = o; return launchBrowser(rest); } };

export function routeCdn(page, root = process.cwd()) {
  return page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
    const m = /\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.*)$/.exec(new URL(route.request().url()).pathname), dir = m && path.join(root, 'node_modules', m[1]);
    const ok = dir && fs.existsSync(dir + '/package.json') && JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')).version === m[2] && fs.existsSync(path.join(dir, m[3]));
    return ok ? route.fulfill({ path: path.join(dir, m[3]), contentType: /\.m?js$/.test(m[3]) ? 'text/javascript' : 'application/octet-stream' }) : route.continue();
  });
}

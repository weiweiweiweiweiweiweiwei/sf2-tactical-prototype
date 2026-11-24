// the favicon at tab size on Chrome's dark tab strip: old (argv[2]) vs new → tools/out/favicon_tab.png
import { chromium } from 'playwright'; import fs from 'node:fs';
const o = fs.readFileSync(process.argv[2], 'utf8'), n = fs.readFileSync('assets/favicon.svg', 'utf8'), sz = (s, k) => s.replace(/width="1000" height="1000"/, `width="${k}" height="${k}"`);
const tab = (s, label) => `<div style="display:flex;align-items:center;gap:8px;background:#35363a;color:#e8eaed;font:13px Segoe UI;padding:8px 12px;width:230px;margin:10px">${sz(s, 16)}<span>${label}</span></div>`;
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage({ viewport: { width: 520, height: 150 }, deviceScaleFactor: 2 });
await p.setContent(`<body style="margin:0;background:#202124">${tab(o, '原本')}${tab(n, '放大後')}</body>`);
await p.screenshot({ path: 'tools/out/favicon_tab.png' }); await b.close(); console.log('ok');

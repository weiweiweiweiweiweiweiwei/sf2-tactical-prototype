import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', ...process.argv.slice(2)] });
const p = await b.newPage(); await p.goto('chrome://gpu', { timeout: 20000 }).catch((e) => console.log('goto', e.message)); await p.waitForTimeout(3000);
const t = await p.evaluate(() => { const iv = document.querySelector('info-view'); return (iv && iv.shadowRoot ? iv.shadowRoot.textContent : document.body.innerText); }).catch((e) => 'ERR ' + e.message);
for (const key of ['GPU0', 'GPU1', 'GL_RENDERER']) { const i = t.indexOf(key); if (i >= 0) console.log(t.slice(i, i + 260).replace(/\s+/g, ' ')); }
await b.close(); process.exit(0);

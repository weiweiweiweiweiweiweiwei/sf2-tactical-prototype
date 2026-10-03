// v26 probe: two browser pages on the sf2-tactical Supabase project — presence (room list) + broadcast (signalling) round trip.
import { chromium } from 'playwright'; import http from 'node:http';
const srv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end('<!doctype html><title>probe</title>'); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL_ = 'https://xdacaaxopfntdwpvrdky.supabase.co', KEY = process.argv[2] || 'sb_publishable_MSc9txrWU-lZSOvIFpcyXw_gJns4kXO';
const b = await chromium.launch({ channel: 'chrome' }), A = await (await b.newContext()).newPage(), B = await (await b.newContext()).newPage();
for (const p of [A, B]) { p.on('console', (m) => console.log('  [page]', m.text())); await p.goto(`http://127.0.0.1:${srv.address().port}/`); }
const setup = async (p, who) => p.evaluate(async ({ URL_, KEY, who }) => {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
  const sb = createClient(URL_, KEY, { realtime: { params: { eventsPerSecond: 20 } } });
  window.__got = []; const ch = sb.channel('sf2:probe', { config: { presence: { key: who }, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'sig' }, (m) => window.__got.push(m.payload));
  ch.on('presence', { event: 'sync' }, () => { window.__pres = Object.keys(ch.presenceState()); });
  const st = await new Promise((res) => { const t0 = performance.now(); ch.subscribe((s, e) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res({ s, ms: Math.round(performance.now() - t0), e: e && String(e) }); }); });
  if (st.s === 'SUBSCRIBED') await ch.track({ room: 'TEST1', who, t: Date.now() });
  window.__ch = ch; return st;
}, { URL_, KEY, who });
console.log('A subscribe', await setup(A, 'host')); console.log('B subscribe', await setup(B, 'client'));
await A.waitForTimeout(1500);
const t0 = Date.now(); await B.evaluate(() => window.__ch.send({ type: 'broadcast', event: 'sig', payload: { hello: 1, at: Date.now() } }));
await A.waitForFunction(() => window.__got.length > 0, null, { timeout: 8000 }).catch(() => {});
console.log('A got broadcast', await A.evaluate(() => window.__got), 'after', Date.now() - t0, 'ms');
console.log('presence seen by B', await B.evaluate(() => window.__pres), '| by A', await A.evaluate(() => window.__pres));
await b.close(); srv.close();

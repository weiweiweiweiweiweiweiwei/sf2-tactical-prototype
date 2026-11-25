// Self-test: starts the server on a free port with a temporary data folder and checks everything the game uses.
// npm test   (prints TEST_OK, or the first failure)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url)), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2-test-'));
const PORT = 20000 + Math.floor(Math.random() * 20000), BASE = `http://127.0.0.1:${PORT}`, ORIGIN = 'http://localhost:5555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null, n = 0;
const ok = (c, what) => { if (!c) throw new Error('FAIL: ' + what); n++; console.log('  ok', what); };
async function start() {
  srv = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, TURN_URLS: 'turn:127.0.0.1:3478', TURN_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv.stdout.on('data', (d) => { if (/SF2 backend on/.test(d)) res(); }));
}
const stop = () => new Promise((res) => { srv.on('exit', res); srv.kill('SIGTERM'); if (process.platform === 'win32') setTimeout(res, 300); });
const rpc = async (fn, body, origin = ORIGIN) => { const r = await fetch(`${BASE}/api/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json() }; };
function client(origin = ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: origin } }), got = [];
  const c = { ws, got, send: (o) => ws.send(JSON.stringify(o)), wait: async (f, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = got.find(f); if (m) return m; await sleep(20); } return null; } };
  ws.on('message', (d) => got.push(JSON.parse(d)));
  c.ready = new Promise((res, rej) => { ws.on('open', () => res(c)); ws.on('error', rej); ws.on('unexpected-response', (q, r) => rej(new Error('HTTP ' + r.statusCode))); });
  return c;
}
try {
  await start();
  ok((await (await fetch(BASE + '/healthz')).json()).ok, 'healthz');

  // 1. room list (presence on sf2:lobby)
  const host = await client().ready, browser = await client().ready;
  host.send({ op: 'join', ch: 'sf2:lobby', ref: 1 }); browser.send({ op: 'join', ch: 'sf2:lobby', ref: 1 });
  ok(await host.wait((m) => m.op === 'joined' && m.ref === 1), 'join lobby');
  host.send({ op: 'track', ch: 'sf2:lobby', key: 'abc', data: { v: 33, code: '482913', name: 'Wei' }, ref: 2 });
  const seen = await browser.wait((m) => m.op === 'presence' && m.state.abc && m.state.abc[0].code === '482913');
  ok(seen, 'another browser sees the open room');
  host.ws.close();
  ok(await browser.wait((m) => m.op === 'presence' && !m.state.abc, 2000), 'room disappears when the host leaves');

  // 2. WebRTC handshake relay (broadcast on sf2:room:<code>, never echoed to the sender)
  const a = await client().ready, b = await client().ready;
  for (const c of [a, b]) c.send({ op: 'join', ch: 'sf2:room:482913' });
  await a.wait((m) => m.op === 'joined'); await b.wait((m) => m.op === 'joined');
  a.send({ op: 'send', ch: 'sf2:room:482913', ev: 'sig', payload: { t: 'hello', from: 'x', to: 'host' } });
  ok(await b.wait((m) => m.op === 'msg' && m.ev === 'sig' && m.payload.t === 'hello'), 'signal reaches the other side');
  await sleep(200); ok(!a.got.some((m) => m.op === 'msg'), 'sender gets no echo');
  a.send({ op: 'join', ch: 'evil:channel', ref: 9 }); ok(await a.wait((m) => m.op === 'error' && m.ref === 9), 'unknown channel names refused');

  // 3. origin check
  let refused = false; try { await client('https://evil.example').ready; } catch (e) { refused = true; }
  ok(refused, 'websocket from a foreign site refused');
  ok((await rpc('sf2_register', { p_name: 'x' }, 'https://evil.example')).status === 403, 'api from a foreign site refused');

  // 4. friends
  const P = (await rpc('sf2_register', { p_name: '小明<script>' })).d, Q = (await rpc('sf2_register', { p_name: 'Amy' })).d;
  ok(P.id && P.secret && /^\d{8}$/.test(P.code), 'register gives id, secret, 8-digit code');
  ok((await rpc('sf2_poll', { p_id: P.id, p_secret: 'wrong', p_status: 'hub' })).d.message === 'sf2 auth', 'wrong secret refused');
  ok((await rpc('sf2_add_friend', { p_id: P.id, p_secret: P.secret, p_code: P.code })).d.why === '這是你自己的好友代碼', 'cannot add yourself');
  ok((await rpc('sf2_add_friend', { p_id: P.id, p_secret: P.secret, p_code: Q.code })).d.result === 'sent', 'friend request sent');
  let q = (await rpc('sf2_poll', { p_id: Q.id, p_secret: Q.secret, p_status: 'hub', p_name: 'Amy' })).d;
  ok(q.friends[0].state === 'incoming' && q.friends[0].name === '小明script', 'request arrives (name cleaned)');
  ok((await rpc('sf2_invite', { p_id: P.id, p_secret: P.secret, p_to: Q.id, p_room: '482913' })).d.why === '只能邀請好友', 'no invites before accepted');
  await rpc('sf2_respond', { p_id: Q.id, p_secret: Q.secret, p_other: P.id, p_accept: true });
  await rpc('sf2_poll', { p_id: P.id, p_secret: P.secret, p_status: 'room', p_room: '482913' });
  ok((await rpc('sf2_invite', { p_id: P.id, p_secret: P.secret, p_to: Q.id, p_room: '482913' })).d.ok, 'invite a friend');
  q = (await rpc('sf2_poll', { p_id: Q.id, p_secret: Q.secret, p_status: 'hub' })).d;
  ok(q.friends[0].state === 'friend' && q.friends[0].online && q.friends[0].st === 'room' && q.friends[0].room === '482913', 'friend shows online, in room 482913');
  ok(q.invites.length === 1 && q.invites[0].room === '482913', 'invite delivered');
  ok((await rpc('sf2_poll', { p_id: Q.id, p_secret: Q.secret, p_status: 'hub' })).d.invites.length === 0, 'invite delivered only once');
  await rpc('sf2_bye', { p_id: P.id, p_secret: P.secret });
  ok(!(await rpc('sf2_poll', { p_id: Q.id, p_secret: Q.secret, p_status: 'hub' })).d.friends[0].online, 'bye shows offline at once');

  // 5. TURN (coturn shared secret)
  const t = await (await fetch(BASE + '/api/turn', { method: 'POST', headers: { Origin: ORIGIN } })).json();
  ok(t.configured && t.iceServers[0].urls[0] === 'turn:127.0.0.1:3478' && /^\d+:sf2$/.test(t.iceServers[0].username), 'turn credentials');

  // 6. friends survive a restart
  for (const c of [browser, a, b]) c.ws.close();
  await sleep(1300); // past the 1 s save delay (Windows has no SIGTERM: the kill is hard, so no save on shutdown)
  await stop(); await start();
  q = (await rpc('sf2_poll', { p_id: Q.id, p_secret: Q.secret, p_status: 'hub' })).d;
  ok(q.friends && q.friends[0].state === 'friend', 'friends kept after restart');
  await stop();
  console.log(`TEST_OK (${n} checks)`);
} catch (e) {
  console.error(e.message); if (srv) srv.kill(); process.exitCode = 1;
} finally { fs.rmSync(DATA, { recursive: true, force: true }); }

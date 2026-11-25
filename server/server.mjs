// SF2 Tactical self-hosted backend (replaces Supabase). Node.js 18+, runs on Linux / Windows / macOS.
//  · WebSocket /ws — "channels" with presence (the lobby's room list) and broadcast (the WebRTC handshake, friend pokes).
//    The game itself still flows peer-to-peer over WebRTC; this server only introduces players to each other.
//  · POST /api/rpc/<fn> — friends (codes, requests, invites, online status), stored in DATA_DIR/friends.json.
//  · POST /api/turn — ICE servers for players who cannot connect directly (coturn shared secret, Metered or Cloudflare).
//  · Optional: STATIC_DIR serves the game too, so one address is the whole thing.
// Settings come from environment variables — see .env.example and README.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { FriendStore, RPC } from './friends.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(HERE, '.env'));
const E = process.env;
const PORT = +(E.PORT || 8787), HOST = E.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(HERE, E.DATA_DIR || 'data');
const STATIC_DIR = E.STATIC_DIR ? path.resolve(HERE, E.STATIC_DIR) : null;
const TRUST_PROXY = E.TRUST_PROXY === '1';
const ORIGINS = (E.ALLOWED_ORIGINS || 'https://weiweiweiweiweiweiweiwei.github.io,http://localhost,http://127.0.0.1,null').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = { channelsPerConn: 16, msgPerSec: 120, burst: 400, presenceBytes: 2048, lobbySize: 1000, connsPerIp: +(E.CONNS_PER_IP || 50), rpcPerMin: +(E.RPC_PER_MIN || 600), registerPerMin: 20 };
const CHANNEL = /^sf2:(lobby|room:\d{6}|inbox:[0-9a-f-]{36})$/;

function loadEnvFile(f) { // tiny .env reader (KEY=value lines), so no extra package is needed
  try { for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch (e) { /* no .env: environment only */ }
}
const log = (...a) => console.log(new Date().toISOString(), ...a);
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
// an origin is allowed if listed (http://localhost and http://127.0.0.1 match any port), '*' is listed, or it is this server itself
function originOk(req) {
  const o = req.headers.origin; if (!o) return true; // not a browser (curl, health checks)
  if (ORIGINS.includes('*') || ORIGINS.includes(o)) return true;
  if (ORIGINS.some((a) => /^http:\/\/(localhost|127\.0\.0\.1)$/.test(a) && o.startsWith(a + ':'))) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}
const cors = (req) => ({ 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' });

// ---- per-IP rate windows (one minute) -------------------------------------------------------------------------
const windows = new Map();
function allow(kind, ip, max) {
  const k = kind + ' ' + ip, now = Date.now(); let w = windows.get(k);
  if (!w || now - w.at > 60e3) { w = { at: now, n: 0 }; windows.set(k, w); }
  return ++w.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, w] of windows) if (now - w.at > 60e3) windows.delete(k); }, 60e3).unref();

// ---- friends ----------------------------------------------------------------------------------------------------
const friends = new FriendStore(path.join(DATA_DIR, 'friends.json'));

// ---- TURN ---------------------------------------------------------------------------------------------------------
let turnCache = null;
async function turnServers() {
  if (E.TURN_URLS && E.TURN_SECRET) { // coturn "use-auth-secret": credentials anyone can check, valid for TURN_TTL seconds
    const user = Math.floor(Date.now() / 1000) + +(E.TURN_TTL || 7200) + ':sf2';
    const credential = crypto.createHmac('sha1', E.TURN_SECRET).update(user).digest('base64');
    return { configured: true, iceServers: [{ urls: E.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean), username: user, credential }] };
  }
  const cfg = (E.METERED_APP && E.METERED_API_KEY) || (E.CF_TURN_KEY_ID && E.CF_TURN_TOKEN);
  if (!cfg) return { configured: false, iceServers: [] };
  if (turnCache && Date.now() - turnCache.at < 30 * 60e3) return turnCache.body;
  let list;
  if (E.METERED_APP && E.METERED_API_KEY) {
    const host = E.METERED_APP.replace(/^https?:\/\//, '').replace(/\.metered\.live.*$/, '');
    const r = await fetch(`https://${encodeURIComponent(host)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(E.METERED_API_KEY)}`);
    if (!r.ok) throw new Error('metered ' + r.status); list = await r.json();
  } else {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(E.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, { method: 'POST', headers: { Authorization: `Bearer ${E.CF_TURN_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 7200 }) });
    if (!r.ok) throw new Error('cloudflare ' + r.status); list = (await r.json()).iceServers;
  }
  const iceServers = (Array.isArray(list) ? list : [list]).filter(Boolean).map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) })); // browsers refuse port 53
  const body = { configured: true, iceServers }; turnCache = { at: Date.now(), body }; return body;
}

// ---- HTTP ---------------------------------------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
function readBody(req, max = 16384) {
  return new Promise((res, rej) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { rej(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { res(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { rej(new Error('bad json')); } });
    req.on('error', rej);
  });
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(STATIC_DIR, rel);
  if (!file.startsWith(STATIC_DIR + path.sep) || /(^|[\\/])\.(?!well-known)/.test(path.relative(STATIC_DIR, file))) { res.writeHead(404); res.end(); return; } // no ../, no dot-files (.git, .env)
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), ip = clientIp(req), json = (o, status = 200) => { res.writeHead(status, { ...cors(req), 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (url.pathname === '/healthz') return json({ ok: true, conns: wss.clients.size, rooms: lobbyCount(), players: friends.players.size });
    if (url.pathname.startsWith('/api/')) {
      if (!originOk(req)) return json({ message: 'origin not allowed' }, 403);
      if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); res.end(); return; }
      if (req.method !== 'POST') return json({ message: 'POST only' }, 405);
      if (!allow('rpc', ip, LIMIT.rpcPerMin)) return json({ message: 'too many requests' }, 429);
      if (url.pathname === '/api/turn') { try { return json(await turnServers()); } catch (e) { return json({ configured: true, iceServers: [], error: String(e.message).slice(0, 80) }, 502); } }
      const m = /^\/api\/rpc\/(\w+)$/.exec(url.pathname), fn = m && RPC[m[1]];
      if (!fn) return json({ message: 'unknown function' }, 404);
      if (fn === 'register' && !allow('register', ip, LIMIT.registerPerMin)) return json({ message: 'too many requests' }, 429);
      const body = await readBody(req);
      try { return json(friends[fn](body)); } catch (e) { return json({ message: e.message }, 400); }
    }
    if (STATIC_DIR && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, url.pathname);
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('SF2 backend: /ws, /api/rpc/*, /api/turn, /healthz');
  } catch (e) { if (!res.headersSent) json({ message: e.message }, 400); }
});

// ---- WebSocket channels -------------------------------------------------------------------------------------------
// channel name → { members: Set<conn>, presence: Map<conn, { key, data }>, pushT }
const channels = new Map();
const lobbyCount = () => { const c = channels.get('sf2:lobby'); return c ? c.presence.size : 0; };
function presenceState(c) { const st = {}; for (const { key, data } of c.presence.values()) (st[key] ||= []).push(data); return st; }
function pushPresence(name) { // coalesce bursts (many hosts updating at once) into one message per channel every 100 ms
  const c = channels.get(name); if (!c || c.pushT) return;
  c.pushT = setTimeout(() => { c.pushT = null; const msg = JSON.stringify({ op: 'presence', ch: name, state: presenceState(c) }); for (const m of c.members) m.sendRaw(msg); }, 100);
}
function leave(conn, name) {
  const c = channels.get(name); if (!c) return;
  c.members.delete(conn); conn.chans.delete(name);
  if (c.presence.delete(conn)) pushPresence(name);
  if (!c.members.size) { clearTimeout(c.pushT); channels.delete(name); }
}
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
const ipConns = new Map();
server.on('upgrade', (req, socket, head) => {
  const ip = clientIp(req), url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws' || !originOk(req) || (ipConns.get(ip) || 0) >= LIMIT.connsPerIp) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, ip));
});
wss.on('connection', (ws, req, ip) => {
  ipConns.set(ip, (ipConns.get(ip) || 0) + 1);
  const conn = { id: crypto.randomUUID(), chans: new Set(), tokens: LIMIT.burst, last: Date.now(), alive: true,
    sendRaw: (s) => { if (ws.readyState === 1 && ws.bufferedAmount < 1 << 20) ws.send(s); } };
  const send = (o) => conn.sendRaw(JSON.stringify(o));
  ws.on('pong', () => { conn.alive = true; });
  ws.on('message', (raw) => {
    const now = Date.now(); conn.tokens = Math.min(LIMIT.burst, conn.tokens + (now - conn.last) / 1000 * LIMIT.msgPerSec); conn.last = now;
    if (--conn.tokens < 0) return; // flooding: drop
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m.ch !== 'string') { if (m && m.op === 'ping') send({ op: 'pong' }); return; }
    const name = m.ch;
    if (m.op === 'join') {
      if (!CHANNEL.test(name)) return send({ op: 'error', ch: name, ref: m.ref, why: 'bad channel' });
      if (!conn.chans.has(name) && conn.chans.size >= LIMIT.channelsPerConn) return send({ op: 'error', ch: name, ref: m.ref, why: 'too many channels' });
      let c = channels.get(name); if (!c) channels.set(name, c = { members: new Set(), presence: new Map(), pushT: null });
      c.members.add(conn); conn.chans.add(name);
      send({ op: 'joined', ch: name, ref: m.ref });
      if (name === 'sf2:lobby') send({ op: 'presence', ch: name, state: presenceState(c) });
      return;
    }
    const c = channels.get(name); if (!c || !c.members.has(conn)) return;
    if (m.op === 'leave') leave(conn, name);
    else if (m.op === 'send') { // broadcast to everyone else in the channel (the sender never gets its own copy)
      if (typeof m.ev !== 'string') return;
      const msg = JSON.stringify({ op: 'msg', ch: name, ev: m.ev.slice(0, 32), payload: m.payload ?? null });
      for (const o of c.members) if (o !== conn) o.sendRaw(msg);
    } else if (m.op === 'track') {
      if (name !== 'sf2:lobby') return; // presence is only used for the room list
      const data = m.data, size = JSON.stringify(data ?? null).length;
      if (!data || typeof data !== 'object' || size > LIMIT.presenceBytes) return send({ op: 'error', ch: name, ref: m.ref, why: 'presence too large' });
      if (!c.presence.has(conn) && c.presence.size >= LIMIT.lobbySize) return send({ op: 'error', ch: name, ref: m.ref, why: 'lobby full' });
      const key = typeof m.key === 'string' && /^[\w-]{1,40}$/.test(m.key) ? m.key : conn.id;
      c.presence.set(conn, { key, data }); pushPresence(name);
      if (m.ref) send({ op: 'ok', ref: m.ref });
    } else if (m.op === 'untrack') {
      if (c.presence.delete(conn)) pushPresence(name);
      if (m.ref) send({ op: 'ok', ref: m.ref });
    }
  });
  ws.on('close', () => {
    for (const name of [...conn.chans]) leave(conn, name); // a host that closes the tab leaves the room list at once
    const n = (ipConns.get(ip) || 1) - 1; if (n) ipConns.set(ip, n); else ipConns.delete(ip);
  });
  ws._conn = conn;
});
// dead connections (laptop lid closed, Wi-Fi gone): ping every 25 s, drop if no pong by the next round
setInterval(() => { for (const ws of wss.clients) { if (!ws._conn.alive) { ws.terminate(); continue; } ws._conn.alive = false; ws.ping(); } }, 25e3).unref();

server.listen(PORT, HOST, () => log(`SF2 backend on http://${HOST}:${PORT}  (ws /ws · data ${DATA_DIR}${STATIC_DIR ? ' · static ' + STATIC_DIR : ''} · origins ${ORIGINS.join(' ')})`));
const stop = () => { log('shutting down'); friends.flush(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

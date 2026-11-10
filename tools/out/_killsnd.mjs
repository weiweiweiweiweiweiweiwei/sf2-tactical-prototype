// scratch v67m: what plays (and how loud, after the compressor) when you hit / kill a bot with a rifle vs a sniper rifle
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const H = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; H.on('pageerror', (e) => errs.push(e.message));
await H.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await H.waitForFunction(() => window.app && window.SF2);
await H.evaluate(async () => { const S = SF2.Settings.data; S.quality = 'low'; Object.assign(S.lobby, { map: 0, rule: 'tdm', mode: 'general', allies: 1, enemies: 3, loadout: 0 });
  app.audio.init(); await app.startMatch(); app.state = 'playing'; app.input.locked = true; const m = app.match; m.phase = 'live'; m.freezeT = 0; m.paused = false;
  for (const bt of m.bots) bt.ai.update = () => {};
  await new Promise((r) => { const w = () => (SF2.AudioEngine.samplesReady ? r() : setTimeout(w, 200)); w(); }); });
const out = {};
for (const gun of (process.env.GUNS || 'm4a1,awp,barrett,svd,m40a1').split(',')) {
  out[gun] = await H.evaluate(async (gun) => {
    const m = app.match, A = m.audio, p = m.player, log = []; const t0 = A.ctx.currentTime;
    const o1 = A._one.bind(A), opb = A._playBuf.bind(A), ok = A.killFeedback.bind(A), oh = A.hit.bind(A), og = A.gunshot.bind(A);
    const nm = (buf) => { for (const [k, l] of Object.entries(SF2.AudioEngine.samples)) if (l.includes(buf)) return k; return A._hitCut && A._hitCut.buf === buf ? 'sf2_hit(cut)' : '?'; };
    A._one = (buf, outN, gain, rate, delay) => { log.push(['one', nm(buf), +gain.toFixed(2), +(A.ctx.currentTime - t0).toFixed(3)]); return o1(buf, outN, gain, rate, delay); };
    A._playBuf = (buf, pos, o) => { log.push(['buf', nm(buf), o && o.gain]); return opb(buf, pos, o); };
    A.killFeedback = (t) => { log.push(['killFeedback', t]); return ok(t); };
    A.hit = (k) => { log.push(['hit', k]); return oh(k); };
    A.gunshot = (...a) => { log.push(['gunshot', a[0], a[3]]); return og(...a); };
    const def = SF2.WEAPON_DEFS[gun]; await SF2.ensureGunModels([def]); m.weapons.rebuild([def, SF2.WEAPON_DEFS.p226]);
    const bot = m.bots.find((x) => x.team !== p.team && x.alive); const V = SF2.THREE.Vector3;
    const e = p.eyePos(new V()), d = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); bot.motor.teleport(e.clone().addScaledVector(d, 8).setY(p.motor.pos.y)); bot.spawnProtect = 0; bot.hp = 100; bot.helmet = false; bot.model.helmet.visible = false;
    await new Promise((r) => setTimeout(r, 300));
    // aim at his chest, fire one shot through the real weapon path
    const c = bot.chestPos(new V()); p.yaw = Math.atan2(-(c.x - e.x), -(c.z - e.z)); p.pitch = Math.atan2(c.y - e.y, Math.hypot(c.x - e.x, c.z - e.z));
    const w = m.weapons.current; w.cooldown = 0; m.weapons.drawT = 9; const pk = []; let peakIn = 0, peakOut = 0; const sample = setInterval(() => { peakIn = Math.max(peakIn, A._peak(A.probeIn)); peakOut = Math.max(peakOut, A._peak(A.probe)); pk.push(+A.comp.reduction.toFixed(1)); }, 10);
    for (let i = 0; i < 4 && bot.alive; i++) { w.cooldown = 0; w.reloading = false; m.weapons._fire(); await new Promise((r) => setTimeout(r, 450)); }
    await new Promise((r) => setTimeout(r, 400)); clearInterval(sample);
    A._one = o1; A._playBuf = opb; A.killFeedback = ok; A.hit = oh; A.gunshot = og;
    return { kind: def.kind, botAlive: bot.alive, log, compReductionMin: Math.min(...pk), peakIn: +peakIn.toFixed(2), peakOut: +peakOut.toFixed(2), hitSound: SF2.Settings.data.hitSound };
  }, gun);
}
console.log(JSON.stringify(out, null, 0).replace(/\],\[/g, '],\n ['), errs.slice(0, 3)); await b.close(); srv.close();

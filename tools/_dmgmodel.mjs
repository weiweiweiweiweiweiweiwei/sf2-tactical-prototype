// Damage-model probe (v58): the SF2 helmet and the Apex shield, rule by rule, through Match.applyDamage / calcDamage.
// node tools/_dmgmodel.mjs   → prints every check, exits 1 on a failure
import { launchBrowser, routeCdn } from './pw.mjs'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await launchBrowser(), page = await b.newPage(), errs = [];
await routeCdn(page, ROOT);
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForFunction(() => window.app && window.SF2);
const out = [];
for (const dmg of ['sf2', 'apex']) {
  out.push(...await page.evaluate(async (dmg) => {
    const L = SF2.Settings.data.lobby; Object.assign(L, { map: 0, rule: 'tdm', allies: 1, enemies: 1 }); L.opts = Object.assign({}, L.opts, { dmg });
    if (app.match) app._teardownMatch();
    await app.startMatch(); app.state = 'playing';
    const m = app.match, W = SF2.WEAPON_DEFS, V = SF2.THREE.Vector3, p = m.player, bot = m.bots.find((x) => x.team !== p.team), R = [];
    m.phase = 'live'; bot.spawnProtect = 0;
    const ok = (name, cond, info = '') => R.push(`${cond ? 'PASS' : 'FAIL'} [${dmg}] ${name} ${info}`);
    const reset = () => { bot.alive = true; bot.hp = 100; bot.spawnProtect = 0; m.refit(bot); };
    const hit = (def, part, dist, opts) => m.applyDamage(bot, SF2.calcDamage(def, part, dist, 1, m.apex), part, p, def, new V(0, 0, -1), bot.eyePos(new V()), opts);
    const rifle = Object.values(W).find((d) => d.type === 'assault' && !d.headKill), smg = Object.values(W).find((d) => d.type === 'smg'), shotgun = Object.values(W).find((d) => d.type === 'shotgun'), sniper = Object.values(W).find((d) => d.type === 'sniper' && d.headKill);
    ok('mode flag', m.apex === (dmg === 'apex'));
    if (dmg === 'sf2') {
      reset(); const head = SF2.calcDamage(rifle, 'head', 10), body = head / (rifle.headMult ?? 2.5);
      hit(rifle, 'head', 10);
      ok('1st non-lethal headshot knocks the helmet off', !bot.helmet && !bot.model.helmet.visible, `helmet=${bot.helmet}`);
      ok('…and counts as a body hit', Math.abs(bot.hp - (100 - body)) < 0.01, `hp=${bot.hp.toFixed(1)} expect ${(100 - body).toFixed(1)} (${rifle.name})`);
      const hp1 = bot.hp; hit(rifle, 'head', 10);
      ok('2nd headshot on the bare head is ×2.5', !bot.alive || Math.abs(bot.hp - (hp1 - head)) < 0.01, `hp=${bot.hp.toFixed(1)}`);
      reset(); bot.hp = head - 1; hit(rifle, 'head', 10); ok('a headshot that would kill still kills through the helmet', !bot.alive);
      reset(); hit(sniper, 'head', 50); ok('sniper headshot always kills', !bot.alive, sniper.name);
      reset(); hit(rifle, 'chest', 10); ok('no shield in SF2', bot.maxShield === 0 && Math.abs(bot.hp - (100 - SF2.calcDamage(rifle, 'chest', 10))) < 0.01);
      reset(); ok('respawn puts the helmet back', bot.helmet && bot.model.helmet.visible);
      ok('range falloff kept', SF2.calcDamage(rifle, 'chest', 200) < SF2.calcDamage(rifle, 'chest', 5));
    } else {
      bot.evo = 0; p.evo = 0; reset(); p.maxShield = 0; m.refit(p);
      ok('spawn with a white shield (50)', bot.maxShield === 50 && bot.shield === 50, `${bot.shield}/${bot.maxShield}`);
      const d = SF2.calcDamage(rifle, 'chest', 10, 1, true);
      hit(rifle, 'chest', 10); ok('shield takes the damage first', bot.hp === 100 && Math.abs(bot.shield - (50 - d)) < 0.01, `shield ${bot.shield.toFixed(1)} hp ${bot.hp}`);
      while (bot.shield > 0) hit(rifle, 'chest', 10);
      ok('the rest of the breaking bullet goes into health', bot.hp < 100 && bot.hp > 100 - d, `hp ${bot.hp.toFixed(1)}`);
      // v62u each gun takes its Apex counterpart's (def.apex) per-shot damage, head / leg ratios and headshot range
      const ratio = (g, part, dist) => SF2.calcDamage(g, part, dist, 1, true) / SF2.calcDamage(g, 'chest', dist, 1, true), A = rifle.apex;
      ok('per-shot damage, head and leg ratios are the Apex counterpart\'s, no sniper one-shot rule',
        Math.abs(d - A.body * A.pellets / rifle.pellets) < 1e-6 && Math.abs(ratio(rifle, 'head', 10) - A.head / A.body) < 1e-6 && Math.abs(ratio(smg, 'head', 10) - smg.apex.head / smg.apex.body) < 1e-6
        && Math.abs(ratio(shotgun, 'head', 3) - shotgun.apex.head / shotgun.apex.body) < 1e-6 && Math.abs(ratio(rifle, 'shin', 10) - A.leg / A.body) < 1e-6
        && SF2.calcDamage(sniper, 'head', 50, 1, true) < 999, `${rifle.name} → ${A.name} ${d} / head ×${ratio(rifle, 'head', 10).toFixed(3)}`);
      ok('past the headshot range a head hit counts as a body hit', Math.abs(ratio(smg, 'head', smg.apex.headMax + 1) - 1) < 1e-6, `${smg.name} → ${smg.apex.name} ${smg.apex.headMax} m`);
      ok('no range falloff (shotguns still fall off)', SF2.calcDamage(rifle, 'chest', 200, 1, true) === SF2.calcDamage(rifle, 'chest', 5, 1, true) && SF2.calcDamage(shotgun, 'chest', 30, 1, true) < SF2.calcDamage(shotgun, 'chest', 3, 1, true));
      ok('damage dealt is Evo', p.evo > 50, `evo ${p.evo.toFixed(0)}`);
      p.evo = 0; p.maxShield = 50; m._evo(p, 160); ok('150 Evo → blue 75, filled', p.maxShield === 75 && p.shield === 75);
      m._evo(p, 400); ok('500 Evo → purple 100', p.maxShield === 100);
      reset(); bot.hp = 40; bot.shield = 0; bot.hurtT = m.time; m._regen(1); ok('no regen within 4 s of damage', bot.hp === 40);
      bot.hurtT = m.time - 5; m._regen(1); ok('after 4 s health comes back first (v60: 5 a second)', bot.hp === 45 && bot.shield === 0, `hp ${bot.hp}`);
      bot.hp = 100; m._regen(1); ok('…then the shield', bot.shield === 5, `shield ${bot.shield}`);
      reset(); m.applyDamage(bot, 999, 'legs', bot, W.fall, null, null, { fall: true }); ok('falling off the map ignores the shield', !bot.alive);
      reset(); hit(rifle, 'head', 10); ok('no helmet rule in Apex', bot.helmet);
    }
    return R;
  }, dmg));
}
console.log(out.join('\n')); if (errs.length) console.log('errors:', errs.slice(0, 5));
await b.close(); srv.close();
const failed = out.some((l) => l.startsWith('FAIL')) || errs.length; console.log(failed ? 'DMG_MODEL_FAIL' : 'DMG_MODEL_OK'); process.exit(failed ? 1 : 0);

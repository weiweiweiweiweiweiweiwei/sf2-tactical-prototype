/* =====================================================================
   HUD — cached DOM writes (unchanged values never touch the DOM).
   ===================================================================== */
class HUD {
  constructor(app) {
    this.app = app;
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'), ch: $('crosshair'), hm: $('hitmarker'), scope: $('scope'), zoomLbl: $('zoomLbl'), vig: $('vignette'), lowhp: $('lowhp'), white: $('flashWhite'),
      dmgdir: $('dmgdir'), nade: $('nadeind'), radar: $('radar'), compass: $('compass'), kf: $('killfeed'), scoreA: $('scoreA'), scoreB: $('scoreB'), barA: $('barA'), barB: $('barB'),
      timer: $('matchTimer'), target: $('matchTarget'), mode: $('matchMode'), ann: $('announce'), annMain: $('annMain'), annSub: $('annSub'), points: $('points'),
      reload: $('reload'), reloadFill: $('reloadFill'), protect: $('protect'), hint: $('hint'), hpbox: $('hpbox'), hpNum: $('hpNum'), hpFill: $('hpFill'), kda: $('kda'),
      wname: $('weaponName'), mag: $('ammoMag'), res: $('ammoRes'), slots: $('slots'), fps: $('fps'),
      death: $('death'), deathKiller: $('deathKiller'), deathTimer: $('deathTimer'), deathH: document.querySelector('#death h1'),
      sb: $('scoreboard'), sbA: $('sbA'), sbB: $('sbB'), sbScoreA: $('sbScoreA'), sbScoreB: $('sbScoreB'), sbInfo: $('sbInfo'),
      freeze: $('freeze'), fzNum: $('fzNum'), fzRound: $('fzRound'), fzHint: $('fzHint'), fzSub: $('fzSub'),
      rb: $('roundBanner'), rbTitle: $('rbTitle'), rbScore: $('rbScore'), rbSub: $('rbSub'), spec: $('spectate'),
      obj: $('objBar'), lock: $('lockout'), cap: $('capture'), capLbl: $('capLbl'), capRing: $('capRing'), capLetter: $('capLetter'), interact: $('interact'),
      markers: $('markers'), toast: $('toast'), aim: $('aimName'), charge: $('charge'), chargeFill: $('chargeFill'),
    };
    this.mk = []; this.toastT = 0; this._pv = new THREE.Vector3();
    this.el.wIcon = $('wIcon'); this.el.fireMode = $('fireMode'); this.el.ammoFill = $('ammoFill'); this.el.timerBot = $('timerBotT');
    this.applyStyle();
    this.segs = []; for (let i = 0; i < 10; i++) { const s = document.createElement('i'); $('hpSegs').appendChild(s); this.segs.push(s); }
    this.cache = {}; this.vignette = 0; this.white = 0; this.feed = []; this.radarT = 0; this.sbT = 0;
    this.dd = [];
    for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = 'dd'; this.el.dmgdir.appendChild(d); this.dd.push({ el: d, t: 0 }); }
    this.ddIdx = 0;
    this.nis = [];
    for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'ni'; d.textContent = '!'; this.el.nade.appendChild(d); this.nis.push(d); }
    this.rctx = this.el.radar.getContext('2d'); this.cctx = this.el.compass.getContext('2d');
  }

  _set(key, el, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'text') el.textContent = val; else el.style[prop] = val;
  }
  _cls(key, el, cls, on) { if (this.cache[key] === on) return; this.cache[key] = on; el.classList.toggle(cls, on); }

  applyStyle() { this.el.root.classList.toggle('minimal', Settings.data.hudStyle !== 'panel'); } // v19: SF2 minimal HUD (default) or the v5 panel HUD

  show(on) { this.el.root.classList.toggle('hidden', !on); if (!on) { this.showDeath(false); this.scoreboard(null); } }
  reset() {
    this.el.kf.innerHTML = ''; this.feed.length = 0; this.cache = {}; this.vignette = 0; this.white = 0;
    this.emblemClear(); this.embQ = []; this.setScope(false, 0); this.showDeath(false); this.freeze(false); this.roundBanner(null); this.spectate(null); this.killcam(false); this.el.root.classList.remove('kcHide');
    this.el.obj.innerHTML = ''; this.setAimName('', false); this.setCharge(-1); this.interact(''); for (const m of this.mk) m.el.style.display = 'none';
    for (const d of this.dd) { d.t = 0; d.el.style.opacity = 0; }
  }

  setCrosshair(gap, visible) {
    const g = Math.round(clamp(gap, 3, 170) * 2) / 2;
    this._set('chv', this.el.ch, 'display', visible ? 'block' : 'none');
    if (visible && this.cache.chg !== g) { this.el.ch.style.setProperty('--gap', g + 'px'); this.cache.chg = g; }
  }
  setScope(on, level) {
    this._cls('scope', this.el.scope, 'on', on);
    this._set('zl', this.el.zoomLbl, 'text', on ? (level === 2 ? '×10' : '×4') : '');
  }
  // The scope overlay stays perfectly crisp (no blur / line thickening); moving-scope inaccuracy is still simulated in the ballistics.
  setScopeSpread() {}

  hitmarker(kind) {
    const el = this.el.hm; el.classList.remove('show', 'head', 'kill', 'shield'); void el.offsetWidth;
    if (kind !== 'body') el.classList.add(kind); el.classList.add('show');
  }
  points(text) { const el = this.el.points; el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

  damage(amount, angle) {
    this.vignette = Math.min(1, this.vignette + 0.35 + amount / 60);
    const d = this.dd[this.ddIdx]; this.ddIdx = (this.ddIdx + 1) % this.dd.length; d.t = 1.2; d.el.style.transform = `rotate(${angle}rad)`;
  }
  flashWhite(v) { this.white = Math.max(this.white, v); }

  setReload(phase) { const on = phase >= 0; this._set('rl', this.el.reload, 'display', on ? 'block' : 'none'); if (on) this._set('rlf', this.el.reloadFill, 'width', Math.round(phase * 100) + '%'); }

  iconsReady() { delete this.cache.wicon; delete this.cache.slotsSig; }
  setWeapon(ws) {
    const w = ws.current;
    this._set('wn', this.el.wname, 'text', w.name);
    const ic = WEAPON_ICONS[w.def.id] || '';
    if (this.cache.wicon !== ic) { this.cache.wicon = ic; this.el.wIcon.src = ic || ''; this.el.wIcon.style.display = ic ? 'block' : 'none'; }
    const fm = w.def.fireMode || (w.kind === 'knife' ? 'MELEE' : w.kind === 'grenade' ? 'THROW' : '');
    this._set('fm', this.el.fireMode, 'text', fm); this._set('fmD', this.el.fireMode, 'display', fm ? 'inline-block' : 'none');
    if (w.kind === 'knife') { this._set('mag', this.el.mag, 'text', '∞'); this._set('res', this.el.res, 'text', ''); }
    else if (w.kind === 'grenade') { this._set('mag', this.el.mag, 'text', String(w.count)); this._set('res', this.el.res, 'text', ''); }
    else { this._set('mag', this.el.mag, 'text', String(w.ammo)); this._set('res', this.el.res, 'text', this.el.root.classList.contains('minimal') ? String(w.reserveAmmo) : '/ ' + w.reserveAmmo); }
    this._set('amf', this.el.ammoFill, 'width', (w.mag ? clamp(w.ammo / w.mag, 0, 1) * 100 : 100).toFixed(1) + '%');
    const low = w.mag && w.ammo <= Math.ceil(w.mag * 0.25);
    this._cls('magLow', this.el.mag, 'low', !!low);
    const sig = ws.weapons.map((x, i) => `${i}${x.def.id}${x.kind === 'grenade' ? x.count : ''}${i === ws.index ? '*' : ''}`).join('|');
    if (this.cache.slotsSig !== sig) {
      this.cache.slotsSig = sig;
      const short = { knife: '刀', he: '手榴彈', flash: '閃光', smoke: '煙霧' };
      const nm = (x) => short[x.def.id] || x.name.replace(/ .*/, '').replace('Remington', 'M870').slice(0, 9);
      this.el.slots.innerHTML = ws.weapons.map((x, i) => `<div class="${i === ws.index ? 'on' : ''}${x.kind === 'grenade' && x.count <= 0 ? ' empty' : ''}">${i + 1} ${nm(x)}${x.kind === 'grenade' ? ' ×' + x.count : ''}</div>`).join('') + '<div>F 擒拿</div>';
    }
  }

  setHealth(hp, p) {
    const v = Math.max(0, Math.ceil(hp));
    this._set('hp', this.el.hpNum, 'text', String(v)); this._set('hpw', this.el.hpFill, 'width', v + '%');
    const on = Math.ceil(v / 10); if (this.cache.segs !== on) { this.cache.segs = on; this.segs.forEach((s, i) => s.classList.toggle('off', i >= on)); }
    this._cls('hpLow', this.el.hpbox, 'low', v <= 30);
    this._set('kda', this.el.kda, 'text', `K ${p.kills} · A ${p.assists} · D ${p.deaths}`);
  }

  setScore(m) {
    const rounds = m.rules.roundBased;
    const a = rounds ? m.roundWins.alpha : m.score.alpha, b = rounds ? m.roundWins.bravo : m.score.bravo;
    this._set('sa', this.el.scoreA, 'text', String(a)); this._set('sb', this.el.scoreB, 'text', String(b));
    const s = Math.max(0, Math.ceil(m.timeLeft));
    const tt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; this._set('tm', this.el.timer, 'text', tt); this._set('tmB', this.el.timerBot, 'text', tt.padStart(5, '0'));
    this._set('tg', this.el.target, 'text', rounds ? `第 ${m.round} 回合 · 搶 ${m.target} 勝` : `${RULES[m.rule].name} · 目標 ${m.target} 分`);
    this._set('md', this.el.mode, 'text', rounds ? `存活 ${m.aliveCount('alpha')} vs ${m.aliveCount('bravo')}${m.rule === 'relic' ? (m.player.team === 'alpha' ? ' · 進攻' : ' · 防守') : ''}` : MODES[m.mode].name);
    this._set('ba', this.el.barA, 'width', clamp(a / m.target, 0, 1) * 50 + '%'); this._set('bb', this.el.barB, 'width', clamp(b / m.target, 0, 1) * 50 + '%');
  }

  hint(text) { this._set('hintT', this.el.hint, 'text', text || ''); this._set('hintO', this.el.hint, 'opacity', text ? '1' : '0'); }
  protect(t) { this._set('pd', this.el.protect, 'display', t > 0 ? 'block' : 'none'); if (t > 0) this._set('pt', this.el.protect, 'text', `SPAWN PROTECTION · 無敵 ${t.toFixed(1)}s`); }

  killfeed(killer, killerTeam, weapon, victim, victimTeam, headshot, mine, collateral = false) {
    const row = document.createElement('div'); row.className = 'kf' + (mine ? ' me' : '');
    const span = (cls, txt) => { const s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; };
    if (killer) row.append(span(killerTeam === 'alpha' ? 'a' : 'b', killer));
    const icon = weapon && typeof weapon === 'object' ? WEAPON_ICONS[weapon.id] : null;
    if (icon) { const im = document.createElement('img'); im.src = icon; im.alt = weapon.name; row.append(im); }
    else row.append(span('w', typeof weapon === 'object' ? (weapon.kind === 'grenade' ? `💣 ${weapon.name}` : `[${weapon.name}]`) : `[${weapon}]`));
    if (headshot) row.append(span('hs', 'HEADSHOT'));
    if (collateral) row.append(span('hs', '穿透'));
    if (victim) row.append(span(victimTeam === 'alpha' ? 'a' : 'b', victim));
    this.el.kf.prepend(row); this.feed.push({ row, t: 6 });
    while (this.el.kf.children.length > 7) this.el.kf.lastChild.remove();
  }
  // v34 kill emblems: queued big medal (top centre) + a small one appended to the bottom row for this life
  emblem(id) {
    const q = this.embQ || (this.embQ = []); if (q.length < 4) q.push(id);
    const row = document.getElementById('embRow'), s = document.createElement('span'); s.innerHTML = emblemSVG(id); row.append(s.firstChild);
    const icons = row.querySelectorAll('svg'); if (icons.length > 12) icons[0].remove();
    if (!this.embBusy) this._embNext();
  }
  _embNext() {
    const id = this.embQ.shift(); if (!id) { this.embBusy = false; return; }
    this.embBusy = true; const E = EMBLEMS[id], el = document.getElementById('emb');
    el.querySelector('.ei').innerHTML = emblemSVG(id); el.querySelector('.t').textContent = el.querySelector('.gh').textContent = E.name; el.querySelector('.ez').textContent = E.zh;
    // SF2 entrances (frame-stepped from gameplay video): the name slams in from 3× with a ghost trail, the medal flashes white
    // for a frame, or the medal snaps in from the side; the next emblem cuts in instantly
    el.classList.remove('show', 'slam', 'flash', 'side'); void el.offsetWidth; el.classList.add('show', E.anim || 'flash');
    if (this.app && this.app.audio) this.app.audio.emblem(E.tier || 0); // every emblem has its own sting (SF2)
    clearTimeout(this.embT); this.embT = setTimeout(() => this._embNext(), EMB_HOLD); // SF2: ~1.8 s per emblem, the next one cuts in
  }
  // SF2 centre line: 擊殺 [medal] victim name
  killNote(name, id) {
    const el = document.getElementById('killNote'); el.innerHTML = `<span class="k">擊殺</span>${emblemSVG(id)}<span class="n"></span>`; el.querySelector('.n').textContent = name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  lucky(n) {
    const el = document.getElementById('emb');
    el.querySelector('.ei').innerHTML = '<svg viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" rx="8" fill="#3a3220" stroke="#e8b84a" stroke-width="3"/><g fill="#ffd23a" transform="translate(50 50)"><circle cx="0" cy="-11" r="11"/><circle cx="11" cy="0" r="11"/><circle cx="0" cy="11" r="11"/><circle cx="-11" cy="0" r="11"/></g><circle cx="50" cy="50" r="4" fill="#b8892c"/></svg>';
    el.querySelector('.t').textContent = el.querySelector('.gh').textContent = '幸運！'; el.querySelector('.ez').textContent = `獲得額外積分 +${n}`;
    el.classList.remove('show', 'slam', 'flash', 'side'); void el.offsetWidth; el.classList.add('show', 'side'); if (this.app && this.app.audio) this.app.audio.emblem(5);
  }
  emblemClear() { const row = document.getElementById('embRow'); if (row) row.innerHTML = ''; }
  announce(main, sub = '') { const a = this.el.ann; this.el.annMain.textContent = main; this.el.annSub.textContent = sub; a.classList.remove('show'); void a.offsetWidth; a.classList.add('show'); }

  showDeath(on, killer = '', weapon = '', headshot = false, rounds = false) {
    this._cls('death', this.el.death, 'on', on);
    if (on) {
      this.el.deathH.textContent = rounds ? 'YOU DIED - 本回合陣亡' : 'YOU DIED - RESPAWNING';
      this.el.deathKiller.textContent = killer ? `被 ${killer} 擊殺 [${weapon}]${headshot ? ' · HEADSHOT' : ''}` : '';
    }
  }
  // v13 killcam overlay (letterbox, KILLCAM tag, killer + weapon icon)
  killcam(on, name = '', def = null) {
    const el = this._kc || (this._kc = { root: document.getElementById('killcam'), name: document.getElementById('kcName'), icon: document.getElementById('kcIcon'), gun: document.getElementById('kcGun') });
    el.root.classList.toggle('on', on);
    if (!on) return;
    el.name.textContent = name; el.gun.textContent = def ? def.name : '';
    const ic = def && WEAPON_ICONS[def.id]; el.icon.style.display = ic ? '' : 'none'; if (ic) el.icon.src = ic;
    this.showDeath(false); this.el.root.classList.add('kcHide');
  }
  setDeathTimer(text) { this._set('dt', this.el.deathTimer, 'text', text); }

  freeze(on, n = 0, roundLabel = '', locked = true) {
    this._cls('fz', this.el.freeze, 'on', on);
    if (!on) return;
    const txt = n > 0 ? String(n) : 'GO!';
    if (this.cache.fzn !== txt) { this.cache.fzn = txt; this.el.fzNum.textContent = txt; this.el.fzNum.classList.remove('pop'); void this.el.fzNum.offsetWidth; this.el.fzNum.classList.add('pop'); }
    this._set('fzr', this.el.fzRound, 'text', roundLabel);
    this._set('fzh', this.el.fzHint, 'display', locked ? 'none' : 'block');
  }
  roundBanner(info) {
    this._cls('rbOn', this.el.rb, 'on', !!info);
    if (!info) return;
    this.el.rbTitle.textContent = info.title; this.el.rbTitle.style.color = info.color;
    this.el.rbScore.innerHTML = `<span style="color:var(--blue)">${info.a}</span> : <span style="color:var(--red)">${info.b}</span>`;
    this.el.rbSub.textContent = info.sub || '';
  }
  spectate(text) { this._cls('spOn', this.el.spec, 'on', !!text); if (text) this._set('spT', this.el.spec, 'text', text); }

  // v34 SF2-style Tab board: objective + whole-map overview | own team on top, enemy below (score, K/A/D, ping) | my damage per enemy + this match's emblems
  scoreboard(m) {
    const on = !!m; this._cls('sbOn', this.el.sb, 'on', on);
    if (!on) return;
    const p = m.player, net = m.net, $ = (id) => document.getElementById(id), esc = (t) => String(t).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`); // names are player-chosen
    const ping = (c) => c.isBot ? '<small>BOT</small>' : c.isPlayer && net && net.role === 'client' ? `${Math.round(net.rtt || 0)}` : '<span class="dot"></span>';
    const rows = (team) => m.combatants.filter((c) => c.team === team).sort((a, b) => b.score - a.score || b.kills - a.kills)
      .map((c) => `<tr class="${c.isPlayer ? 'me' : ''}${c.alive ? '' : ' dead'}"><td>${esc(c.name)}</td><td>${c.score}</td><td>${c.kills} / ${c.assists} / ${c.deaths}</td><td>${ping(c)}</td></tr>`).join('');
    this.el.sbA.innerHTML = rows('alpha'); this.el.sbB.innerHTML = rows('bravo');
    $('sbC').classList.toggle('rev', p.team === 'bravo');
    const rounds = m.rules.roundBased;
    this.el.sbScoreA.textContent = rounds ? m.roundWins.alpha : m.score.alpha; this.el.sbScoreB.textContent = rounds ? m.roundWins.bravo : m.score.bravo;
    this.el.sbInfo.textContent = `${MODES[m.mode].name} · ${RULES[m.rule].name} · ${DIFFICULTY[m.config.difficulty].name}`;
    $('sbObj').textContent = this.el.target.textContent || RULES[m.rule].name; $('sbMap').textContent = m.def.name;
    $('sbKad').innerHTML = `擊殺 <b>${p.kills}</b> / 助攻 <b>${p.assists}</b> / 死亡 <b>${p.deaths}</b>`;
    const dm = p.dmgDone || new Map(); let tot = 0, h = '';
    for (const [c, v] of [...dm].sort((a, b) => b[1] - a[1])) { tot += v; h += `<div class="${c.team === 'alpha' ? 'a' : 'b'}"><span>${esc(c.name)}</span><b>${Math.round(v)}</b></div>`; }
    $('sbDmg').innerHTML = h || '<div><span style="opacity:.5">—</span></div>'; $('sbDmgT').textContent = Math.round(tot);
    const em = p.emblems || {}; $('sbEmb').innerHTML = Object.keys(EMBLEMS).filter((k) => em[k]).map((k) => `<span title="${EMBLEMS[k].name}">${emblemSVG(k)}<i>${em[k]}</i></span>`).join('') || '<span style="opacity:.5">—</span>';
    this._overview(m, $('sbMini'));
  }
  // whole map, north up, fitted to the canvas: walls / buildings, spawn zones, teammates, me
  _overview(m, cv) {
    const ctx = cv.getContext('2d'), S = cv.width, B = m.def.bounds, w = B.maxX - B.minX, d = B.maxZ - B.minZ, k = (S - 16) / Math.max(w, d), p = m.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2); ctx.scale(k, k); ctx.translate(-(B.minX + w / 2), -(B.minZ + d / 2));
    ctx.fillStyle = 'rgba(60,110,80,.25)'; ctx.fillRect(B.minX, B.minZ, w, d);
    for (const [team, cc] of [['alpha', 'rgba(99,179,255,.3)'], ['bravo', 'rgba(255,93,82,.3)']]) { const z = m.builder.zones[team]; if (z) { ctx.fillStyle = cc; ctx.fillRect(z.x0, z.z0, z.x1 - z.x0, z.z1 - z.z0); } }
    ctx.fillStyle = 'rgba(190,225,205,.55)';
    for (const r of m.builder.radar) if (r.kind !== 'ladder' && r.kind !== 'ramp') ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    for (const c of m.combatants) {
      if (!c.alive || c.team !== p.team) continue;
      const pos = c.isPlayer ? c.renderPos : c.model ? c.model.root.position : c.motor.pos;
      ctx.fillStyle = c.isPlayer ? '#ffd27a' : '#63b3ff'; ctx.beginPath(); ctx.arc(pos.x, pos.z, (c.isPlayer ? 5 : 3.5) / k, 0, Math.PI * 2); ctx.fill();
    }
  }

  nadeWarnings(list) {
    for (let i = 0; i < this.nis.length; i++) {
      const w = list[i], el = this.nis[i];
      if (!w) { if (el.style.opacity !== '0') el.style.opacity = '0'; continue; }
      const r = 110; el.style.opacity = (0.5 + 0.5 * Math.sin(performance.now() / 90)).toFixed(2);
      el.style.transform = `translate(${Math.sin(w.angle) * r}px, ${-Math.cos(w.angle) * r}px)`;
    }
  }

  update(dt, m) {
    const p = m.player;
    this.vignette = Math.max(0, this.vignette - dt * 1.6); this._set('vig', this.el.vig, 'opacity', this.vignette.toFixed(2));
    this.white = Math.max(0, this.white - dt * 0.45); this._set('wh', this.el.white, 'opacity', this.white.toFixed(2));
    const lowF = p.alive ? clamp((40 - p.hp) / 40, 0, 1) * (0.55 + 0.15 * Math.sin(m.time * 5)) : 0;
    this._set('low', this.el.lowhp, 'opacity', lowF.toFixed(2));
    for (const d of this.dd) if (d.t > 0) { d.t -= dt; d.el.style.opacity = clamp(d.t / 0.8, 0, 1).toFixed(2); }
    for (let i = this.feed.length - 1; i >= 0; i--) { const f = this.feed[i]; f.t -= dt; if (f.t < 0.5) f.row.style.opacity = Math.max(0, f.t / 0.5).toFixed(2); if (f.t <= 0) { f.row.remove(); this.feed.splice(i, 1); } }
    this.radarT -= dt; if (this.radarT <= 0) { this.radarT = 1 / 30; this.drawRadar(m); this.drawCompass(m); this._alive(m); }
    if (this.el.sb.classList.contains('on')) { this.sbT -= dt; if (this.sbT <= 0) { this.sbT = 0.25; this.scoreboard(m); } }
  }

  // v36 top-right: my team / enemy team soldiers still alive (SF2 hearts)
  _alive(m) {
    const me = m.player.team; let a = 0, b = 0;
    for (const c of m.combatants) if (c.alive) { if (c.team === me) a++; else b++; }
    this._set('alA', document.getElementById('aliveA'), 'text', String(a)); this._set('alB', document.getElementById('aliveB'), 'text', String(b));
  }
  // v36 SF2 map (minimal HUD): square, north up, no frame — walkable floor as a light translucent plate, walls left dark,
  // the player as a pin pointing where he looks, teammates as dots
  _sfMap(m) {
    const ctx = this.rctx, S = 368, p = m.player, B = m.def.bounds, range = 26, scale = S / 2 / range; // ≈ 26 m from the centre to the edge, like SF2
    const center = p.alive ? p.renderPos : (p.spectating && p.spectating.alive ? p.spectating.motor.pos : p.renderPos);
    const yaw = p.alive ? p.yaw : (p.spectating ? p.spectating.yaw : p.yaw);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
    const fade = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72); fade.addColorStop(0, 'rgba(0,0,0,.18)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = fade; ctx.fillRect(0, 0, S, S);
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.scale(scale, scale); ctx.translate(-center.x, -center.z);
    ctx.fillStyle = 'rgba(225,228,224,.30)'; ctx.fillRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.8)';
    for (const r of m.builder.radar) if (r.kind === 'wall' || r.kind === 'building' || r.kind === 'solid' || r.kind === 'container' || r.kind === 'container2') ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(30,34,36,.35)';
    for (const r of m.builder.radar) if (r.kind === 'crate' || r.kind === 'sandbag') ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    ctx.strokeStyle = 'rgba(235,238,232,.55)'; ctx.lineWidth = 1.2 / scale;
    for (const r of m.builder.radar) if (r.kind === 'wall' || r.kind === 'building') ctx.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    for (const [team, cc] of [['alpha', 'rgba(70,130,255,.25)'], ['bravo', 'rgba(255,80,70,.25)']]) { const z = m.builder.zones[team]; if (z) { ctx.fillStyle = cc; ctx.fillRect(z.x0, z.z0, z.x1 - z.x0, z.z1 - z.z0); } }
    for (const b of m.combatants) {
      if (!b.alive || !b.model || b === p) continue;
      const pos = b.model.root.position;
      if (b.team === p.team) ctx.fillStyle = '#4f8dff'; else { if (m.time - b.spottedT > 1.6) continue; ctx.fillStyle = '#ff3b30'; }
      ctx.beginPath(); ctx.arc(pos.x, pos.z, 5 / scale, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
    }
    const RU = m.rules;
    if (RU.zones) for (const z of RU.zones) { ctx.strokeStyle = TEAM_CSS[z.owner || 'none']; ctx.lineWidth = 2.5 / scale; ctx.beginPath(); ctx.arc(z.pos.x, z.pos.z, z.r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // me: white ring + direction wedge (north up, so the wedge turns with the view)
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-yaw);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(8, -6); ctx.lineTo(-8, -6); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#2b2f33'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.font = '600 20px sans-serif'; ctx.fillStyle = 'rgba(230,232,228,.75)'; ctx.textBaseline = 'top'; ctx.fillText(m.def.name, 6, 6);
  }
  drawRadar(m) {
    if (this.el.root.classList.contains('minimal')) { this._sfMap(m); return; }
    const range = m.def.radarRange || 28, rk = range / 28, ctx = this.rctx, S = 368, c = S / 2, R = c - 2, scale = R / range, p = m.player;
    const center = p.alive ? p.renderPos : (p.spectating && p.spectating.alive ? p.spectating.motor.pos : p.renderPos);
    const yaw = p.alive ? p.yaw : (p.spectating ? p.spectating.yaw : p.yaw);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();
    const bg = ctx.createRadialGradient(c, c, 0, c, c, R); bg.addColorStop(0, 'rgba(20,40,28,.85)'); bg.addColorStop(1, 'rgba(5,12,8,.92)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
    ctx.translate(c, c); ctx.rotate(yaw); ctx.scale(scale, scale); ctx.translate(-center.x, -center.z);
    const B = m.def.bounds;
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
    const T = m.builder.T;
    if (T) { ctx.globalAlpha = 0.5; ctx.drawImage(terrainShade(T, B, 512), B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ); ctx.globalAlpha = 1; }
    ctx.strokeStyle = 'rgba(160,255,190,.5)'; ctx.lineWidth = 0.35; ctx.strokeRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
    const col = { wall: 'rgba(200,220,210,.5)', solid: 'rgba(190,205,198,.4)', building: 'rgba(220,210,185,.5)', container: 'rgba(190,210,195,.42)', container2: 'rgba(225,240,228,.62)', crate: 'rgba(200,165,110,.45)',
      catwalk: 'rgba(110,170,255,.22)', ramp: 'rgba(255,205,80,.35)', sandbag: 'rgba(200,185,140,.45)', fence: 'rgba(170,180,190,.3)', glass: 'rgba(140,210,240,.35)', ladder: 'rgba(255,150,40,.85)' };
    for (const r of m.builder.radar) { const cc = col[r.kind]; if (!cc) continue; ctx.fillStyle = cc; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
    for (const [team, cc] of [['alpha', 'rgba(99,179,255,.16)'], ['bravo', 'rgba(255,93,82,.16)']]) { const z = m.builder.zones[team]; if (z) { ctx.fillStyle = cc; ctx.fillRect(z.x0, z.z0, z.x1 - z.x0, z.z1 - z.z0); } }
    for (const b of m.combatants) { // bots, friends (host) and ghosts (client)
      if (!b.alive || !b.model || b === p) continue;
      const pos = b.model.root.position;
      if (b.team === p.team) { ctx.fillStyle = 'rgba(99,179,255,.95)'; }
      else { if (m.time - b.spottedT > 1.6) continue; ctx.fillStyle = `rgba(255,70,55,${clamp(1 - (m.time - b.spottedT) / 1.6, 0.2, 1).toFixed(2)})`; }
      ctx.beginPath(); ctx.arc(pos.x, pos.z, 0.8 * rk, 0, Math.PI * 2); ctx.fill();
      if (pos.y - (T ? T.heightAt(pos.x, pos.z) : 0) > 2) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.2; ctx.stroke(); }
    }
    for (const n of m.grenades) { if (n.def.gtype !== 'he') continue; ctx.fillStyle = 'rgba(255,200,60,.9)'; ctx.fillRect(n.body.position.x - 0.4 * rk, n.body.position.z - 0.4 * rk, 0.8 * rk, 0.8 * rk); }
    const RU = m.rules;
    if (RU.zones) for (const z of RU.zones) {
      ctx.strokeStyle = TEAM_CSS[z.owner || 'none']; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(z.pos.x, z.pos.z, z.r, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(z.pos.x, z.pos.z); ctx.rotate(-yaw); ctx.fillStyle = TEAM_CSS[z.owner || 'none']; ctx.font = `bold ${4 * rk}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(z.id, 0, 0); ctx.restore();
    }
    if (RU.home) {
      const rp = RU.state === 'carried' && RU.carrier ? RU.carrier.motor.pos : RU.pos;
      ctx.fillStyle = '#ffc860'; ctx.save(); ctx.translate(rp.x, rp.z); ctx.rotate(Math.PI / 4); ctx.fillRect(-1.1, -1.1, 2.2, 2.2); ctx.restore();
      if (RU.state === 'carried') { ctx.strokeStyle = 'rgba(99,179,255,.9)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(RU.extract.x, RU.extract.z, RU.extractR, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
    ctx.save(); ctx.translate(c, c);
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8); cone.addColorStop(0, 'rgba(160,255,190,.18)'); cone.addColorStop(1, 'rgba(160,255,190,0)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.8, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.alive ? '#7dffa6' : '#8fd8ff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // v6 COD-style compass: bearing tape (north = -Z), cardinal labels, objective / relic / extraction markers by bearing.
  drawCompass(m) {
    const ctx = this.cctx, W = 880, H = 60, p = m.player, span = 150, k = W / span;
    const who = p.alive ? p : p.spectating && p.spectating.alive ? p.spectating : p, yaw = who.yaw, pp = who === p ? p.renderPos : who.motor.pos;
    const head = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, 0); bg.addColorStop(0, 'rgba(6,10,8,0)'); bg.addColorStop(0.18, 'rgba(6,10,8,.5)'); bg.addColorStop(0.82, 'rgba(6,10,8,.5)'); bg.addColorStop(1, 'rgba(6,10,8,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 16, W, 30);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.ceil((head - span / 2) / 5) * 5; d <= head + span / 2; d += 5) {
      const x = W / 2 + (d - head) * k, dd = ((d % 360) + 360) % 360;
      ctx.globalAlpha = clamp((1 - Math.abs(x - W / 2) / (W / 2)) * 1.7, 0, 1);
      if (dd % 45 === 0) { ctx.fillStyle = dd === 0 ? '#ffcf5a' : '#eef5f0'; ctx.font = '600 30px Teko, Rajdhani, sans-serif'; ctx.fillText(lab[dd], x, 33); }
      else if (dd % 15 === 0) { ctx.fillStyle = 'rgba(225,238,230,.85)'; ctx.font = '600 18px Rajdhani, sans-serif'; ctx.fillText(String(dd), x, 32); }
      else { ctx.fillStyle = 'rgba(225,238,230,.5)'; ctx.fillRect(x - 1, 25, 2, 14); }
    }
    const marks = [], RU = m.rules;
    if (RU.zones) for (const z of RU.zones) marks.push([z.pos, z.id, TEAM_CSS[z.owner || 'none']]);
    if (RU.home) { marks.push([RU.state === 'carried' && RU.carrier ? RU.carrier.motor.pos : RU.pos, '◆', '#ffc860']); if (RU.state === 'carried') marks.push([RU.extract, '⬆', '#63b3ff']); }
    for (const [pos, txt, col] of marks) {
      const b = (Math.atan2(pos.x - pp.x, -(pos.z - pp.z)) * 180) / Math.PI, rel = ((b - head + 540) % 360) - 180, edge = Math.abs(rel) > span / 2 - 6;
      const x = W / 2 + clamp(rel, -span / 2 + 6, span / 2 - 6) * k;
      ctx.globalAlpha = edge ? 0.6 : 1; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - 13, 0, 26, 18);
      ctx.fillStyle = col; ctx.fillRect(x - 13, 16, 26, 2); ctx.font = 'bold 17px Rajdhani, sans-serif'; ctx.fillText(txt, x, 9);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#7dffa6';
    ctx.beginPath(); ctx.moveTo(W / 2 - 8, H); ctx.lineTo(W / 2 + 8, H); ctx.lineTo(W / 2, H - 11); ctx.closePath(); ctx.fill();
  }

  /* ----------------------------- v3 objective HUD ----------------------------- */
  objective(st, m) {
    const e = this.el;
    if (!st) { this._set('objD', e.obj, 'display', 'none'); this._set('lkD', e.lock, 'display', 'none'); this._set('capD', e.cap, 'display', 'none'); this.interact(''); return; }
    this._set('objD', e.obj, 'display', 'flex');
    if (st.kind === 'dom') {
      const sig = st.zones.map((z) => `${z.id}${z.owner || '-'}${z.contested ? 'x' : ''}${z.capTeam || ''}${Math.round(z.k * 20)}`).join('|');
      if (this.cache.objSig !== sig) {
        this.cache.objSig = sig;
        e.obj.innerHTML = st.zones.map((z) => `<div class="zb ${z.owner || 'none'}${z.contested ? ' contested' : ''}"><b>${z.id}</b>${z.capTeam && !z.contested ? `<i class="${z.capTeam}" style="width:${Math.round(z.k * 100)}%"></i>` : ''}</div>`).join('');
      }
      this._set('lkD', e.lock, 'display', st.lock ? 'block' : 'none');
      if (st.lock) { this._set('lkT', e.lock, 'text', st.lock); this._cls('lkM', e.lock, 'mine', !st.lockMine); }
    } else {
      this._set('lkD', e.lock, 'display', 'none');
      const html = `<div class="relic"><span class="role">${st.role}</span>◆ ${st.text}</div>`;
      if (this.cache.objSig !== html) { this.cache.objSig = html; e.obj.innerHTML = html; }
    }
    const cap = st.cap;
    this._set('capD', e.cap, 'display', cap ? 'block' : 'none');
    if (cap) {
      this._set('capL', e.capLbl, 'text', cap.contested ? `${cap.label}（敵人在圈內 · 暫停）` : cap.label);
      this._set('capI', e.capLetter, 'text', cap.id || '');
      const k = clamp(cap.k, 0, 1).toFixed(3); if (this.cache.capK !== k) { this.cache.capK = k; e.capRing.style.setProperty('--p', k); }
      this._set('capRC', e.capRing, 'color', cap.contested ? '#ffd040' : cap.color || '#7dffa6'); this._cls('capC', e.cap, 'contested', !!cap.contested);
    }
    this.interact(cap ? '' : st.prompt);
  }
  interact(text) {
    text = text || '';
    if (this.cache.itT !== text) { this.cache.itT = text; const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); this.el.interact.innerHTML = esc.replace(/\[E\]/g, '<kbd>E</kbd>'); }
    this._set('itO', this.el.interact, 'opacity', text ? '1' : '0');
  }

  // 3D objective markers projected to the screen (clamped to the edges when off-screen).
  markers(list, cam) {
    const host = this.el.markers, W = innerWidth, H = innerHeight;
    while (this.mk.length < list.length) {
      const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<div class="ic"><i class="ring"></i><b></b></div><small></small>'; host.appendChild(d);
      this.mk.push({ el: d, ic: d.firstChild, ring: d.firstChild.firstChild, b: d.firstChild.lastChild, s: d.lastChild, sig: '', k: -1 });
    }
    for (let i = 0; i < this.mk.length; i++) {
      const m = this.mk[i], it = list[i];
      if (!it) { if (m.el.style.display !== 'none') m.el.style.display = 'none'; continue; }
      const v = this._pv.copy(it.pos).project(cam), behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - 40; }
      const edge = behind || x < 30 || x > W - 30 || y < 60 || y > H - 60;
      x = clamp(x, 30, W - 30); y = clamp(y, 60, H - 60);
      const dist = Math.round(it.pos.distanceTo(cam.position)), sig = `${it.label}|${it.sub}|${dist}|${it.color}`;
      if (m.sig !== sig) { m.sig = sig; m.b.textContent = it.label; m.s.textContent = `${it.sub} ${dist}m`; m.el.style.color = it.color; m.el.classList.toggle('zone', !!it.zone); }
      const k = it.ring ? +it.ring.toFixed(3) : 0;
      if (m.k !== k) { m.k = k; m.el.classList.toggle('cap', k > 0); m.ring.style.setProperty('--p', k); }
      if (k > 0 && m.rc !== it.ringColor) { m.rc = it.ringColor; m.ring.style.setProperty('--rc', it.ringColor); }
      m.el.style.display = 'block'; m.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%,-50%)`; m.el.style.opacity = edge ? '0.75' : '1';
    }
  }
  toast(text) { const t = this.el.toast; t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
  // SF2 crosshair ID: name under the crosshair, red for enemies (blue for teammates).
  setAimName(name, enemy) { this._set('anT', this.el.aim, 'text', name); this._set('anO', this.el.aim, 'opacity', name ? '1' : '0'); this._cls('anE', this.el.aim, 'enemy', !!enemy); this._cls('chE', this.el.ch, 'enemy', !!(name && enemy)); }
  setCharge(k) { const on = k >= 0; this._set('cgD', this.el.charge, 'display', on ? 'block' : 'none'); if (on) { this._set('cgW', this.el.chargeFill, 'width', Math.round(k * 100) + '%'); this._cls('cgM', this.el.charge, 'max', k >= 0.999); } }

  setFps(v, show) { this._set('fpsD', this.el.fps, 'display', show ? 'block' : 'none'); if (show) this._set('fpsV', this.el.fps, 'text', v); }
}


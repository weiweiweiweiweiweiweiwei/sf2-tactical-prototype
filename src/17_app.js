/* =====================================================================
   APP — renderer, shared resources, room/lobby, loading flow, pause,
   settings, end screen and the main loop.
   States: lobby → countdown → loading → shot → playing ⇄ paused → ended → returning → lobby
   ===================================================================== */
class App {
  constructor() {
    this.canvas = document.getElementById('game');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    this.pmrem = new THREE.PMREMGenerator(r);
    if (!Settings.data.qDetected) { // first run: pick a safe default from the GPU name
      let name = '';
      try { const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* hidden */ }
      const integrated = /Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Basic Render|Radeon\(TM\) Graphics|Radeon Graphics|Vega/i.test(name) && !/NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc/i.test(name);
      Settings.data.quality = integrated ? 'medium' : 'high'; Settings.data.qDetected = true; Settings.data.gpu = name; Settings.save();
    }
    this.frameMs = 16; this.dynT = 0;
    this.tex = new TextureFactory(r); this.tex.setQuality(Settings.data.quality);
    this.mats = new MaterialLib(this.tex);
    this.models = new WeaponModels(this.tex);
    this.soldiers = new SoldierFactory(this.tex, this.models);
    this.audio = new AudioEngine(); this.input = new InputManager(this.canvas); this.hud = new HUD(this); this.post = new PostFX(r);
    this.hdrCache = new Map(); this.match = null; this.state = 'lobby';
    this.last = performance.now(); this._mouse = { x: 0, y: 0 }; this._extra = { x: 0, y: 0 };
    this.fpsAcc = 0; this.fpsFrames = 0; this.fpsText = '';
    this.$ = (id) => document.getElementById(id);
    this.buildLobby(); this.bindInput(); this.bindMenus(); this.onResize();
    this.grading = new GradePanel(this);
    addEventListener('resize', () => this.onResize());
    addEventListener('beforeunload', (e) => { if (this.match && (this.state === 'playing' || this.state === 'paused')) { e.preventDefault(); e.returnValue = ''; } });
    AudioEngine.prepareBanks().catch((e) => console.warn('audio banks', e));
    setTimeout(() => { try { this.makeIcons(); } catch (e) { console.warn('weapon icons', e); } }, 400);
    requestAnimationFrame((t) => this.loop(t));
  }

  /* ------------------------------ lobby ------------------------------ */
  buildLobby() {
    const L = Settings.data.lobby, $ = this.$;
    this.dry = MAPS.map((def) => { const b = new MapBuilder(null, def, true); def.build(b); return b; });
    const maps = $('lbMaps');
    MAPS.forEach((def, i) => {
      const bt = document.createElement('button'); const cv = document.createElement('canvas'); cv.width = 176; cv.height = 88;
      drawMapPreview(cv, def, this.dry[i], { labels: false }); bt.append(cv, document.createTextNode(`${i + 1}. ${def.name}`));
      bt.onclick = () => { L.map = i; this.audio.init(); this.audio.uiClick(); this.refreshLobby(); this.warm(i); };
      maps.appendChild(bt);
    });
    const pills = (id, items, key, after) => {
      const el = $(id); el.innerHTML = '';
      for (const [val, label] of items) { const b = document.createElement('button'); b.textContent = label; b.dataset.v = val; b.onclick = () => { L[key] = typeof L[key] === 'number' ? Number(val) : val; if (after) after(); this.audio.init(); this.audio.uiClick(); this.refreshLobby(); }; el.appendChild(b); }
    };
    pills('lbModes', Object.entries(MODES).map(([k, m]) => [k, m.name]), 'mode');
    pills('lbRule', Object.entries(RULES).map(([k, r]) => [k, r.name]), 'rule', () => { if (!L.ruleCfg[L.rule]) L.ruleCfg[L.rule] = Object.assign({}, RULES[L.rule].def); });
    pills('lbDiff', DIFFICULTY.map((d, i) => [i, d.name]), 'difficulty');
    pills('lbLoadout', Settings.data.loadouts.map((l, i) => [i, `${i + 1}`]), 'loadout');
    $('lbWarehouse').onclick = () => this.openWarehouse(); $('lbWh').onclick = () => this.openWarehouse();
    $('whClose').onclick = () => this.closeWarehouse();
    document.querySelectorAll('.stepper button').forEach((b) => b.onclick = () => {
      const k = b.dataset.step; L[k] = clamp(L[k] + Number(b.dataset.d), 1, 12); this.audio.init(); this.audio.uiClick(); this.refreshLobby();
    });
    $('lbStart').onclick = () => this.beginCountdown();
    $('lbCancel').onclick = () => this.cancelCountdown();
    $('lbSettings').onclick = () => this.openSettings();
    $('lbFull').onclick = () => this.toggleFullscreen();
    this.refreshLobby();
    setTimeout(() => this.warm(L.map), 600);
  }

  // Background warm-up while the player is in the room: prefetch the HDRI and pre-generate the map's PBR materials.
  async warm(i) {
    const token = this.warmToken = (this.warmToken || 0) + 1, def = MAPS[i];
    if (Settings.data.hdri && def.hdri) this.loadHDR(def.hdri);
    for (const name of this.dry[i].used) {
      if (this.warmToken !== token || this.state !== 'lobby') return;
      if (!this.mats.cache.has(name)) { this.mats.get(name); await sleep(40); }
    }
  }

  refreshLobby() {
    const L = Settings.data.lobby, $ = this.$, R = RULES[L.rule];
    const def = MAPS[L.map];
    drawMapPreview($('lbMapBig'), def, this.dry[L.map]);
    $('lbMapName').textContent = `${def.name} · ${def.en}`; $('lbMapDesc').textContent = def.desc;
    [...$('lbMaps').children].forEach((b, i) => b.classList.toggle('on', i === L.map));
    const mark = (id, val) => [...$(id).children].forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(val)));
    mark('lbModes', L.mode); mark('lbRule', L.rule); mark('lbDiff', L.difficulty); mark('lbLoadout', L.loadout);
    $('lbModeDesc').textContent = MODES[L.mode].desc + ' · ' + R.desc;
    const rc = L.ruleCfg[L.rule] || (L.ruleCfg[L.rule] = Object.assign({}, R.def)), roundsLike = R.timeUnit === 'sec';
    $('lbTargetLbl').textContent = roundsLike ? '勝利回合數' : '勝利分數';
    $('lbTimeLbl').textContent = roundsLike ? '每回合時間' : '時間限制';
    const tg = $('lbTarget'); tg.innerHTML = '';
    for (const v of R.targets) { const b = document.createElement('button'); b.textContent = roundsLike ? `搶 ${v} 勝` : `${v}`; b.classList.toggle('on', rc.target === v); b.onclick = () => { rc.target = v; this.audio.uiClick(); this.refreshLobby(); }; tg.appendChild(b); }
    const tm = $('lbTime'); tm.innerHTML = '';
    for (const v of R.times) { const b = document.createElement('button'); b.textContent = roundsLike ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} 分`; b.classList.toggle('on', rc.time === v); b.onclick = () => { rc.time = v; this.audio.uiClick(); this.refreshLobby(); }; tm.appendChild(b); }
    const lo = Settings.data.loadouts[L.loadout];
    $('lbLoadoutInfo').textContent = `${lo.name}：${WEAPON_DEFS[lo.primary].name} + ${WEAPON_DEFS[lo.secondary].name}`;
    [...$('lbLoadout').children].forEach((b, i) => { b.title = Settings.data.loadouts[i].name; });
    $('lbAllies').textContent = L.allies; $('lbEnemies').textContent = L.enemies;
    $('lbAllyLbl').textContent = L.allies === 1 ? '只有你 · 單人奮戰' : `我方（含你）`;
    const list = (id, team, n, youFirst) => {
      const ol = $(id); ol.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const li = document.createElement('li');
        if (i < n) {
          const isYou = youFirst && i === 0, name = isYou ? 'YOU（你）' : BOT_NAMES[team][(youFirst ? i - 1 : i) % BOT_NAMES[team].length];
          li.className = isYou ? 'you' : '';
          li.innerHTML = `<span class="n">${i + 1}</span><span class="rank">${isYou ? '★' : 'AI'}</span><span class="nm">${name}</span><span class="st">${isYou ? 'HOST' : 'READY'}</span>`;
        } else { li.className = 'empty'; li.innerHTML = `<span class="n">${i + 1}</span><span class="nm">— 空位 —</span>`; }
        ol.appendChild(li);
      }
    };
    list('lbListA', 'alpha', L.allies, true); list('lbListB', 'bravo', L.enemies, false);
    Settings.save();
  }

  beginCountdown() {
    if (this.state !== 'lobby') return;
    this.audio.init(); this.audio.uiClick();
    this.state = 'countdown'; this.countT = 3;
    const def = MAPS[Settings.data.lobby.map];
    this.$('lbCountMap').textContent = `${def.name} · ${MODES[Settings.data.lobby.mode].name} · ${RULES[Settings.data.lobby.rule].name}`;
    this.$('lbCount').classList.add('on'); this.$('lbStatus').textContent = '準備出發';
    this._showCount(3);
  }
  _showCount(n) { const el = this.$('lbCountNum'); el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.audio.uiClick(); }
  cancelCountdown() { if (this.state !== 'countdown') return; this.state = 'lobby'; this.$('lbCount').classList.remove('on'); this.$('lbStatus').textContent = '等待中'; this.audio.uiClick(); }

  /* ------------------------------ loading ------------------------------ */
  async startMatch() {
    const $ = this.$, L = Settings.data.lobby, def = MAPS[L.map];
    this.state = 'loading';
    $('lbCount').classList.remove('on'); $('lobby').classList.remove('on');
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = def.en; $('ldSub').textContent = `${def.name} · ${MODES[L.mode].name} · ${RULES[L.rule].name} · ${L.allies} vs ${L.enemies}${L.rule === 'relic' ? ' · 藍隊進攻 / 紅隊防守' : ''}`;
    $('ldTip').textContent = '提示：' + pick(TIPS); $('ldSlogan').textContent = def.slogan;
    drawMapPreview($('ldMap'), def, this.dry[L.map]);
    this.loadShown = 0; this.loadTarget = 0; this.loadLabel = '初始化';
    await nextFrame();
    const cfg = Object.assign({}, L, { ruleCfg: JSON.parse(JSON.stringify(L.ruleCfg)) });
    const m = this.match = new Match(this, cfg);
    try {
      await m.build((p, label) => { this.loadTarget = p * 0.85; this.loadLabel = label; });
    } catch (e) {
      console.error(e); $('ldStep').textContent = '載入失敗：' + e.message; return;
    }
    this.audio.setAcoustics(ACOUSTICS[def.acoustics] || ACOUSTICS.outdoor); this.audio.setAmbience(def.ambience);
    // cinematic "screenshot" of the real map behind the loading text
    this.state = 'shot'; this.shotT = 0; ld.classList.add('shot'); this.loadTarget = 1; this.loadLabel = '即將部署';
    await sleep(1700);
    if (this.state !== 'shot') return;
    ld.classList.remove('on', 'shot');
    this.hud.reset(); this.hud.show(true); this.hud.setWeapon(m.weapons);
    this.state = 'playing'; this.last = performance.now();
    this.input.lock();
  }

  async returnToLobby() {
    const $ = this.$;
    if (this.state === 'returning') return;
    this.state = 'returning'; this.grading.close();
    clearInterval(this.endTimer);
    $('endscreen').classList.remove('on'); $('pause').classList.remove('on'); $('settings').classList.remove('on');
    this.input.unlock(); this.hud.show(false);
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'RETURNING'; $('ldSub').textContent = '返回房間中…'; $('ldTip').textContent = '提示：' + pick(TIPS); $('ldSlogan').textContent = 'ROOM #0427';
    this.loadShown = 0; this.loadTarget = 1; this.loadLabel = '結算戰績';
    await sleep(900);
    if (this.match) { this.match.dispose(); this.match = null; }
    this.audio.setAmbience('none');
    await sleep(700);
    ld.classList.remove('on'); $('lobby').classList.add('on'); $('lbStatus').textContent = '等待中';
    this.state = 'lobby'; this.refreshLobby();
  }

  async loadHDR(name) {
    if (this.hdrCache.has(name)) return this.hdrCache.get(name);
    try {
      const loader = new RGBELoader();
      const tex = await Promise.race([loader.loadAsync(HDRI_BASE + name + '_1k.hdr'), sleep(9000).then(() => { throw new Error('HDRI timeout'); })]);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const sunDir = this.hdrSunDir(tex);
      this.clampHDR(tex);
      const env = this.pmrem.fromEquirectangular(tex).texture;
      const res = { tex, env, sunDir, vmEnv: this.greyEnv(tex) };
      this.hdrCache.set(name, res);
      return res;
    } catch (e) { console.warn('HDRI unavailable, using procedural environment:', e.message); return null; }
  }

  // v17: viewmodel reflections use a 75 %-desaturated copy of the HDRI — same bright-sky / dark-ground structure (metal still
  // reads as metal) without mirroring a blue sky onto the gun (COD viewmodels use neutral reflection probes).
  greyEnv(tex, keep = 0.25) {
    const src = tex.image.data, half = src instanceof Uint16Array, d = new src.constructor(src.length);
    const f = half ? THREE.DataUtils.fromHalfFloat : (v) => v, t = half ? THREE.DataUtils.toHalfFloat : (v) => v, ch = src.length / (tex.image.width * tex.image.height);
    for (let i = 0; i < src.length; i += ch) {
      const r = f(src[i]), g = f(src[i + 1]), b = f(src[i + 2]), y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      d[i] = t(y + (r - y) * keep); d[i + 1] = t(y + (g - y) * keep); d[i + 2] = t(y + (b - y) * keep); if (ch === 4) d[i + 3] = src[i + 3];
    }
    const g = new THREE.DataTexture(d, tex.image.width, tex.image.height, tex.format, tex.type);
    g.mapping = THREE.EquirectangularReflectionMapping; g.colorSpace = tex.colorSpace; g.minFilter = g.magFilter = THREE.LinearFilter; g.needsUpdate = true;
    const env = this.pmrem.fromEquirectangular(g).texture; g.dispose();
    return env;
  }

  // The HDRI sun disc can exceed half-float range (→ Inf → black blocks). Clamp every texel to a safe maximum.
  clampHDR(tex) {
    const d = tex.image.data, max = 2000;
    if (d instanceof Uint16Array) { const hMax = THREE.DataUtils.toHalfFloat(max); for (let i = 0; i < d.length; i++) { if ((d[i] & 0x7c00) === 0x7c00 || (!(d[i] & 0x8000) && d[i] > hMax)) d[i] = hMax; } }
    else for (let i = 0; i < d.length; i++) if (!(d[i] <= max)) d[i] = max;
    tex.needsUpdate = true;
  }

  // Brightest texel of the upper hemisphere → sun direction (so shadows match the sky).
  hdrSunDir(tex) {
    const img = tex.image, data = img.data, W = img.width, H = img.height, half = data instanceof Uint16Array;
    const f = (k) => half ? THREE.DataUtils.fromHalfFloat(data[k]) : data[k];
    let best = -1, bi = 0, bj = 0;
    for (let j = 1; j < H * 0.48; j += 2) for (let i = 0; i < W; i += 2) {
      const k = (j * W + i) * 4, l = f(k) * 0.2126 + f(k + 1) * 0.7152 + f(k + 2) * 0.0722;
      if (l > best) { best = l; bi = i; bj = j; }
    }
    const u = (bi + 0.5) / W, v = 1 - (bj + 0.5) / H, phi = (u - 0.5) * Math.PI * 2, th = (v - 0.5) * Math.PI;
    return new THREE.Vector3(Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th)).normalize();
  }

  /* ------------------------------ input ------------------------------ */
  bindInput() {
    const inp = this.input;
    inp.onButton = (btn, down) => {
      const m = this.match;
      if (this.state !== 'playing' || !m) return;
      this.audio.init();
      if (!m.player.alive) { if (down && btn === 0 && m.rules.roundBased) m.nextSpectate(); return; }
      const mm = inp.consumeMouse(TMP_V1); m.player.look(mm.x, mm.y); this._extra.x += mm.x; this._extra.y += mm.y; m.player.applyView();
      m.weapons.onButton(btn, down);
    };
    inp.onKey = (code) => {
      const m = this.match;
      if (this.state === 'countdown' && code === 'Escape') { this.cancelCountdown(); return; }
      if (this.state === 'lobby' && code === 'Escape' && this.$('warehouse').classList.contains('on')) { this.closeWarehouse(); return; }
      const fk = /^F([1-5])$/.exec(code);
      if (fk && m && (this.state === 'playing' || this.state === 'paused')) { m.queueLoadout(parseInt(fk[1], 10) - 1); return; } // works while dead too
      if (this.state !== 'playing' || !m || !m.player.alive) return;
      if (code === 'Space') { if (m.canMove()) m.player.motor.requestJump(); }
      else if (code === 'KeyF') m.weapons.grab();
      else if (code === 'KeyE') { if (m.canMove()) m.onInteract(); }
      else m.weapons.onKey(code);
    };
    inp.onLockChange = (locked, error) => {
      if (error) return; // failed lock request (no user gesture) — the freeze overlay asks for a click instead
      if (locked) { if (this.state === 'paused') { this.$('pause').classList.remove('on'); this.state = 'playing'; this.last = performance.now(); } }
      else if (this.state === 'playing' && this.match && this.match.phase !== 'over') { this.state = 'paused'; this.$('pause').classList.add('on'); if (this.match) this.match.weapons.trigger = false; }
    };
    this.canvas.addEventListener('click', () => { if (this.state === 'playing' && !inp.locked) inp.lock(); });
    document.getElementById('hud').addEventListener('click', () => { if (this.state === 'playing' && !inp.locked) inp.lock(); });
  }

  bindMenus() {
    const $ = this.$, S = Settings.data;
    $('pResume').onclick = () => { this.audio.uiClick(); this.input.lock(); setTimeout(() => { if (this.state === 'paused' && !this.input.locked) $('pMsg').textContent = '瀏覽器限制：請稍候一秒再按一次「繼續遊戲」'; }, 600); };
    $('pSettings').onclick = () => this.openSettings();
    $('pGrade').onclick = () => { this.audio.uiClick(); this.grading.show(); };
    $('pLeave').onclick = () => { this.audio.uiClick(); this.returnToLobby(); };
    $('endBack').onclick = () => this.returnToLobby();
    $('setClose').onclick = () => { $('settings').classList.remove('on'); Settings.save(); };
    const bindRange = (id, key, fmt, apply) => {
      const el = $(id), val = $(id + 'Val'); el.value = S[key]; val.textContent = fmt(S[key]);
      el.addEventListener('input', () => { S[key] = parseFloat(el.value); val.textContent = fmt(S[key]); if (apply) apply(S[key]); Settings.save(); });
    };
    bindRange('optSens', 'sens', (v) => v.toFixed(2));
    bindRange('optZoomSens', 'zoomSens', (v) => v.toFixed(2));
    bindRange('optVol', 'volume', (v) => Math.round(v * 100) + '%', (v) => this.audio.setVolume(v));
    bindRange('optFov', 'fov', (v) => String(Math.round(v)), (v) => { if (this.match) { this.match.weapons.baseFov = v; if (!this.match.weapons.ads) this.match.weapons.fov = v; } });
    const sel = (id, key, apply) => { const el = $(id); el.value = String(S[key]); el.addEventListener('change', () => { S[key] = el.value; if (apply) apply(el.value); Settings.save(); }); };
    sel('optQuality', 'quality', (q) => { this.tex.setQuality(q); if (this.match) this.post.configure(this.match, q); });
    sel('optAds', 'adsMode'); sel('optHip', 'hipMode');
    const chk = (id, key) => { const el = $(id); el.checked = !!S[key]; el.addEventListener('change', () => { S[key] = el.checked; Settings.save(); }); };
    chk('optHdri', 'hdri'); chk('optDof', 'dof'); chk('optAnn', 'announcer'); chk('optFps', 'showFps'); chk('optKc', 'killcam');
  }

  openSettings() { this.audio.init(); this.audio.uiClick(); this.$('settings').classList.add('on'); }
  toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().then(() => { try { navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(); } catch (e) { /* optional */ } }).catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen();
  }

  speak(text) {
    if (!Settings.data.announcer || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.toLowerCase()); u.rate = 1.05; u.pitch = 0.6; u.volume = Settings.data.volume; u.lang = 'en-US'; speechSynthesis.speak(u); } catch (e) { /* unavailable */ }
  }

  onMatchEnd(m) {
    const $ = this.$;
    this.state = 'ended'; this.grading.close(); this.input.unlock(); m.weapons.trigger = false;
    this.hud.scoreboard(null); this.hud.freeze(false); this.hud.showDeath(false); this.hud.spectate(null); this.hud.roundBanner(null);
    const mine = m.winner === m.player.team, draw = !m.winner, t = $('endTitle');
    t.textContent = draw ? 'DRAW' : mine ? 'VICTORY' : 'DEFEAT'; t.style.color = draw ? '#fff' : mine ? '#7dffa6' : '#ff5d52';
    $('endSub').textContent = `${m.def.name} · ${MODES[m.mode].name} · ${RULES[m.rule].name} · ${DIFFICULTY[m.config.difficulty].name}`;
    $('endScore').innerHTML = m.rules.roundBased
      ? `<span class="a">ALPHA ${m.roundWins.alpha}</span> : <span class="b">${m.roundWins.bravo} BRAVO</span><div style="font-size:16px;color:var(--dim);font-weight:600">回合勝場 · 總分 ${m.score.alpha} : ${m.score.bravo}</div>`
      : `<span class="a">ALPHA ${m.score.alpha}</span> : <span class="b">${m.score.bravo} BRAVO</span>`;
    const p = m.player, acc = m.stats.shots ? Math.round((m.stats.hits / m.stats.shots) * 100) : 0, hs = p.kills ? Math.round((p.headshots / p.kills) * 100) : 0;
    $('endStats').innerHTML = [['分數', p.score], ['擊殺', p.kills], ['助攻', p.assists], ['死亡', p.deaths], ['爆頭率 / 命中率', `${hs}% / ${acc}%`]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    const mvp = m.combatants.slice().sort((a, b) => b.score - a.score)[0];
    $('endMvp').textContent = mvp ? `★ MVP · ${mvp.isPlayer ? 'YOU' : mvp.name}（${mvp.team === 'alpha' ? '藍隊' : '紅隊'}）· ${mvp.score} 分 · ${mvp.kills} 殺` : '';
    $('endscreen').classList.add('on');
    this.speak(draw ? 'draw' : mine ? 'victory' : 'defeat');
    let n = 10; $('endCount').textContent = `${n} 秒後自動返回房間`;
    clearInterval(this.endTimer);
    this.endTimer = setInterval(() => { n--; $('endCount').textContent = `${n} 秒後自動返回房間`; if (n <= 0) { clearInterval(this.endTimer); this.returnToLobby(); } }, 1000);
  }

  onResize() {
    document.documentElement.style.setProperty('--ui', clamp(innerHeight / 1000, 0.55, 1.3).toFixed(3));
    document.documentElement.style.setProperty('--lz', clamp(Math.min(innerWidth / 1480, innerHeight / 880), 0.2, 1.4).toFixed(3));
    this.post.setSize();
    if (this.match && this.match.camera) { this.match.camera.aspect = innerWidth / innerHeight; this.match.camera.updateProjectionMatrix(); }
    if (this.match && this.match.weapons) this.match.weapons.onResize();
  }

  /* ------------------------------ line-art weapon icons ------------------------------ */
  // Each gun is rendered side-on with normal colours (orthographic), then edge-filtered on the CPU:
  // silhouette outline (alpha edges) + internal detail lines (normal discontinuities) → white line art on transparent.
  makeIcons() {
    const W = 384, H = 128, r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1.3, 1.3, 0.43, -0.43, 0.01, 20); cam.position.set(0, 0, 5);
    scene.overrideMaterial = new THREE.MeshNormalMaterial();
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const ctx = c2.getContext('2d', { willReadFrequently: true });
    for (const id of Object.keys(WEAPON_DATABASE)) {
      const piv = this.models.preview(WEAPON_DEFS[id]), old = piv.parent; scene.add(piv); piv.rotation.set(0, 0, 0);
      r.render(scene, cam); ctx.clearRect(0, 0, W, H); ctx.drawImage(r.domElement, 0, 0);
      const src = ctx.getImageData(0, 0, W, H), d = src.data, out = ctx.createImageData(W, H), o = out.data, A = (x, y) => d[(y * W + x) * 4 + 3];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4, a = d[i + 3];
        let edge = 0;
        if (a > 100 && (A(x - 1, y) < 100 || A(x + 1, y) < 100 || A(x, y - 1) < 100 || A(x, y + 1) < 100)) edge = 255; // outline
        else if (a > 100) { // normal discontinuity (Sobel on the normal colour)
          let gx = 0, gy = 0;
          for (let c = 0; c < 3; c++) {
            const p = (xx, yy) => d[(yy * W + xx) * 4 + c];
            gx += Math.abs(p(x + 1, y - 1) + 2 * p(x + 1, y) + p(x + 1, y + 1) - p(x - 1, y - 1) - 2 * p(x - 1, y) - p(x - 1, y + 1));
            gy += Math.abs(p(x - 1, y + 1) + 2 * p(x, y + 1) + p(x + 1, y + 1) - p(x - 1, y - 1) - 2 * p(x, y - 1) - p(x + 1, y - 1));
          }
          const g = (gx + gy) / 3; if (g > 150) edge = Math.min(210, g * 0.55);
        }
        if (edge) { o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = edge; } else if (a > 100) { o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = 26; } // faint fill
      }
      ctx.putImageData(out, 0, 0);
      WEAPON_ICONS[id] = c2.toDataURL();
      scene.remove(piv); if (old) old.add(piv);
    }
    r.dispose(); r.forceContextLoss();
    this.hud.iconsReady();
    if (this.$('warehouse').classList.contains('on')) this.renderWarehouse();
  }

  /* ------------------------------ warehouse (loadouts) ------------------------------ */
  openWarehouse() {
    const $ = this.$, L = Settings.data.lobby;
    this.audio.init(); this.audio.uiClick();
    this.wh = this.wh || { slot: L.loadout, cat: 'primary', sel: null };
    this.wh.slot = L.loadout; this.wh.sel = Settings.data.loadouts[this.wh.slot][this.wh.cat];
    $('warehouse').classList.add('on');
    if (!this.whR) this._initPreview();
    this.renderWarehouse();
  }
  closeWarehouse() { this.$('warehouse').classList.remove('on'); Settings.save(); this.audio.uiClick(); this.refreshLobby(); }
  _initPreview() {
    const cv = this.$('whCanvas');
    try {
      const r = this.whR = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
      r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.35; r.outputColorSpace = THREE.SRGBColorSpace;
      const sc = this.whScene = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
      sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
      const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(2, 3, 4); sc.add(key);
      const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(-3, 1, -2); sc.add(rim); sc.add(new THREE.HemisphereLight(0xe8eef5, 0x3a3630, 0.9));
      this.whCam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); this.whCam.position.set(0, 0.35, 3.1); this.whCam.lookAt(0, 0, 0);
      this.whPivot = new THREE.Group(); sc.add(this.whPivot); this.whT = 0;
    } catch (e) { console.warn('warehouse preview unavailable', e); this.whR = null; }
  }
  _renderPreview(dt) {
    if (!this.whR || !this.$('warehouse').classList.contains('on')) return;
    const cv = this.$('whCanvas'), w = cv.clientWidth, h = cv.clientHeight;
    if (w && h && (cv.width !== Math.round(w * this.whR.getPixelRatio()) || cv.height !== Math.round(h * this.whR.getPixelRatio()))) { this.whR.setSize(w, h, false); this.whCam.aspect = w / h; this.whCam.updateProjectionMatrix(); }
    this.whT += dt; this.whPivot.rotation.y = Math.sin(this.whT * 0.55) * 0.75 + 0.25; this.whPivot.rotation.x = Math.sin(this.whT * 0.35) * 0.08;
    this.whR.render(this.whScene, this.whCam);
  }
  renderWarehouse() {
    const $ = this.$, W = this.wh, LO = Settings.data.loadouts, L = Settings.data.lobby;
    // loadout cards
    const slots = $('whSlots'); slots.innerHTML = '';
    LO.forEach((l, i) => {
      const d = document.createElement('div'); d.className = 'whSlot' + (i === W.slot ? ' on' : '');
      d.innerHTML = `<div class="k">F${i + 1}</div><input value="${l.name.replace(/"/g, '')}" maxlength="10"><div class="w"><span>主</span>${WEAPON_DEFS[l.primary].name}</div><div class="w"><span>副</span>${WEAPON_DEFS[l.secondary].name}</div>`;
      d.onclick = (e) => { if (e.target.tagName === 'INPUT') return; W.slot = i; L.loadout = i; W.sel = LO[i][W.cat]; this.audio.uiClick(); this.renderWarehouse(); };
      d.querySelector('input').oninput = (e) => { l.name = e.target.value || `配裝 ${i + 1}`; Settings.save(); };
      slots.appendChild(d);
    });
    // category tabs + weapon cards grouped by type
    [...$('whTabs').children].forEach((b) => { b.classList.toggle('on', b.dataset.cat === W.cat); b.onclick = () => { W.cat = b.dataset.cat; W.sel = LO[W.slot][W.cat]; this.audio.uiClick(); this.renderWarehouse(); }; });
    const list = $('whList'); list.innerHTML = '';
    const ids = W.cat === 'primary' ? PRIMARY_IDS : SECONDARY_IDS, groups = {};
    for (const id of ids) (groups[WEAPON_DATABASE[id].type] = groups[WEAPON_DATABASE[id].type] || []).push(id);
    for (const [type, arr] of Object.entries(groups)) {
      const h = document.createElement('h4'); h.textContent = TYPE_LABEL[type]; list.appendChild(h);
      for (const id of arr) {
        const st = weaponStats(id), eq = LO[W.slot][W.cat] === id, c = document.createElement('button');
        c.className = 'whGun' + (eq ? ' eq' : '') + (W.sel === id ? ' sel' : '');
        c.innerHTML = `${WEAPON_ICONS[id] ? `<img class="ico" src="${WEAPON_ICONS[id]}">` : ''}<b>${WEAPON_DEFS[id].name}</b><small>${st.rpm} RPM · ${st.mag} 發 · ${WEAPON_DEFS[id].fireMode}${eq ? ' · 已裝備' : ''}</small><i style="width:${st.damage}%"></i>`;
        c.onmouseenter = () => { if (W.sel !== id) { W.sel = id; this._whInfo(); } };
        c.onclick = () => { LO[W.slot][W.cat] = id; W.sel = id; Settings.save(); this.audio.uiClick(); this.renderWarehouse(); };
        list.appendChild(c);
      }
    }
    this._whInfo();
  }
  _whInfo() {
    const $ = this.$, id = this.wh.sel, s = WEAPON_DATABASE[id], d = WEAPON_DEFS[id], st = weaponStats(id);
    $('whName').textContent = d.name; $('whType').textContent = `${TYPE_LABEL[s.type]} · ${s.slot === 'primary' ? '主武器' : '副武器'} · ${{ '3d_sight': '機械 / 全息瞄具', red_dot: '紅點瞄具', '2d_scope_overlay': '狙擊鏡', none: '無瞄具' }[s.adsType]}`;
    $('whDesc').textContent = d.desc;
    const bars = [['傷害', st.damage], ['射速', st.fireRate], ['精準', st.accuracy], ['後座控制', st.control], ['機動性', st.mobility]];
    $('whBars').innerHTML = bars.map(([k, v]) => `<div class="bar"><span>${k}</span><div><i style="width:${v}%"></i></div><b>${v}</b></div>`).join('');
    const body = Math.ceil(100 / s.damage), head = s.slot === 'primary' && s.type !== 'shotgun' ? '1（爆頭必殺）' : `${Math.ceil(100 / (s.damage * (d.headMult || 4)))}`;
    $('whNums').innerHTML = [['傷害', s.pellets ? `${s.damage} × ${s.pellets}` : s.damage], ['射速', `${st.rpm} RPM`], ['彈匣', s.maxAmmo], ['換彈', `${s.reloadTime}s`], ['身體擊殺', s.pellets ? '近距離 1' : `${body} 發`], ['爆頭擊殺', head], ['開鏡 FOV', s.adsFov], ['移動', `${Math.round(s.mobility * 100)}%`]]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    if (this.whPivot) { this.whPivot.clear(); try { this.whPivot.add(this.models.preview(d)); } catch (e) { console.warn(e); } }
  }

  /* ------------------------------ loop ------------------------------ */
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = clamp((now - this.last) / 1000, 0, 0.1); this.last = now;
    this.input.gameActive = this.state === 'playing' || this.state === 'paused';
    if (this.state === 'lobby') this._renderPreview(dt);
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fpsText = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`; this.fpsAcc = 0; this.fpsFrames = 0; }
    const mouse = this.input.consumeMouse(this._mouse);
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.countT); this.countT -= dt; const cur = Math.ceil(this.countT);
      if (cur !== prev && cur > 0) this._showCount(cur);
      if (this.countT <= 0) this.startMatch();
    }
    if (this.loadShown !== undefined) {
      this.loadShown = damp(this.loadShown, this.loadTarget, 5, dt);
      const pct = Math.round(this.loadShown * 100);
      this.$('ldFill').style.width = pct + '%'; this.$('ldPct').textContent = pct + '%'; this.$('ldStep').textContent = this.loadLabel;
    }
    const m = this.match;
    if (m && m.running) {
      if (this.state === 'playing') {
        mouse.x += this._extra.x; mouse.y += this._extra.y;
        m.tick(dt, mouse);
        this._extra.x = this._extra.y = 0;
        // dynamic resolution: keep the GPU out of overload (prevents hangs / TDR on weaker cards)
        this.frameMs = lerp(this.frameMs, dt * 1000, 0.05); this.dynT += dt;
        if (this.dynT > 2) { this.dynT = 0; if (this.frameMs > 24) this.post.setScale(this.post.scale * 0.85); else if (this.frameMs < 13 && this.post.scale < 1) this.post.setScale(this.post.scale + 0.08); }
        this.hud.setFps(this.fpsText, Settings.data.showFps);
        const st = window.__stats || (window.__stats = { frames: 0, seconds: 0 }); st.frames++; st.seconds += dt; st.avgFps = Math.round(st.frames / Math.max(1e-3, st.seconds)); st.frameMs = +this.frameMs.toFixed(2); st.fps = this.fpsText; // tools/check.mjs
      }
      if (this.state === 'shot') {
        this.shotT += dt;
        const s = m.def.shot, k = this.shotT * 0.12;
        m.camera.position.set(s.pos[0] + k * 2.2, s.pos[1] - k * 0.5, s.pos[2] - k * 1.2); m.camera.lookAt(s.target[0], s.target[1], s.target[2]);
        m.camera.fov = 62; m.camera.updateProjectionMatrix();
        m.effects.update(dt); for (const fn of m.builder.animated) fn(dt, this.shotT);
        this.post.render(dt, false);
      } else if (this.state === 'playing' || this.state === 'paused' || this.state === 'ended') {
        const showVM = m.player.alive && m.weapons.current.vm.group.visible && this.state !== 'ended';
        this.post.render(this.state === 'playing' ? dt : 0, showVM);
      }
    }
    this.input.endFrame();
  }
}

try {
  const app = new App();
  window.app = app;
  window.SF2 = { THREE, Settings, MAPS, WEAPON_DEFS, WEAPON_DATABASE, CFG, MODES, RULES, calcDamage, loadoutDefs, LOOK_DEFAULT, resolveLook, parseCube, scopeStats, CAO }; // debug handle for the console
  window.__gameReady = true;
  document.getElementById('boot').classList.add('done');
} catch (e) {
  console.error(e);
  window.__bootErr('初始化失敗: ' + (e && e.message ? e.message : e));
}
</script>
</body>
</html>

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
    // v23: read the GPU the browser actually uses on EVERY launch (a laptop browser can silently switch to the integrated GPU)
    let name = '';
    try { const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* hidden */ }
    const integrated = /Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Basic Render|Radeon\(TM\) Graphics|Radeon Graphics|Vega/i.test(name) && !/NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc/i.test(name);
    this.gpuName = name.replace(/^ANGLE \([^,]*, /, '').replace(/ \(0x[0-9A-Fa-f]+\).*$/, '').replace(/ Direct3D.*$/, '').replace(/, D3D.*$/, '') || '未知'; this.gpuIntegrated = integrated;
    this.gpuShort = this.gpuName.replace(/NVIDIA GeForce |AMD /g, '').replace(/Intel\(R\) /, 'Intel ').replace(/ Graphics$/, '');
    AUTO_Q = integrated ? 'low' : 'high'; this.autoCeil = AUTO_Q; // v24 auto quality: start point + ceiling for automatic step-ups
    if (!Settings.data.qV24) { Settings.data.quality = 'auto'; Settings.data.qV24 = true; Settings.data.qDetected = true; } // v24: everyone moves to auto once (manual choice still possible)
    Settings.data.gpu = name; Settings.save();
    this.frameMs = 16; this.dynT = 0; this.pacer = new GpuPacer(r.getContext()); this.busyN = 0; this.busyF = 0;
    this.tex = new TextureFactory(r); this.tex.setQuality(activeQuality());
    this.mats = new MaterialLib(this.tex);
    this.models = new WeaponModels(this.tex);
    this.soldiers = new SoldierFactory(this.tex, this.models);
    this.audio = new AudioEngine(); this.input = new InputManager(this.canvas); this.cmds = new CmdBuilder(this.input); this.hud = new HUD(this); this.post = new PostFX(r);
    this.hdrCache = new Map(); this.match = null; this.state = 'lobby';
    this.last = performance.now(); this._mouse = { x: 0, y: 0 };
    this.fpsAcc = 0; this.fpsFrames = 0; this.fpsText = '';
    this.$ = (id) => document.getElementById(id);
    this.buildLobby(); this.bindInput(); this.bindMenus(); this.onResize();
    this.$('optGpu').textContent = this.gpuName + (this.gpuIntegrated ? '（內顯）' : '');
    addEventListener('resize', () => this.onResize());
    addEventListener('beforeunload', (e) => { if (this.match && (this.state === 'playing' || this.state === 'paused')) { e.preventDefault(); e.returnValue = ''; } });
    AudioEngine.prepareBanks().catch((e) => console.warn('audio banks', e));
    setTimeout(() => { try { this.makeIcons(); } catch (e) { console.warn('weapon icons', e); } }, 400);
    this.thumbStart = performance.now() + 1500; this._queueThumbs([...PRIMARY_IDS, ...SECONDARY_IDS]); // v20 armory card renders, built in the lobby's idle frames
    requestAnimationFrame((t) => this.loop(t));
    this.netBoot();
  }

  /* ------------------------------ v25 network test entry ------------------------------ */
  // ?host=ROOM — matches started from this tab accept friends · ?join=ROOM — join the match hosted in another tab of this
  // browser · &lag=80&jitter=20&loss=0.05 simulate a real connection (ms / ms / fraction of lost packets) · &name=Wei
  netBoot() {
    const q = new URLSearchParams(location.search), o = { lag: q.get('lag'), jitter: q.get('jitter'), loss: q.get('loss'), name: q.get('name') };
    this.netOpts = o;
    if (q.get('host')) { this.netHostRoom = q.get('host'); this.$('lbStatus').textContent = `連線房間「${this.netHostRoom}」已開放`; }
    if (q.get('join')) setTimeout(() => this.netJoin(q.get('join'), { ...o, name: q.get('name'), team: q.get('team') }), 300);
  }
  netJoin(room, o = {}) {
    if (this.netClient) this.netClient.close();
    const $ = this.$, c = this.netClient = new NetClient(this, new LoopbackTransport(room, o), { name: o.name || 'Player' + Math.floor(Math.random() * 900 + 100), team: o.team });
    $('lobby').classList.remove('on'); const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'JOINING'; $('ldSub').textContent = `尋找房間「${room}」的房主…`; $('ldTip').textContent = '提示：房主需要用 ?host=' + room + ' 開啟遊戲並開始對戰'; $('ldSlogan').textContent = 'ONLINE';
    this.loadShown = 0; this.loadTarget = 0.1; this.loadLabel = '等待房主回應';
    c.start();
    return c;
  }
  async startNetMatch(client) { await this.startMatch(client); }
  netError(why) {
    const $ = this.$; $('ldSub').textContent = '無法加入：' + why; this.loadLabel = '已取消';
    setTimeout(() => { if (this.state === 'lobby' || this.state === 'loading') { $('loader').classList.remove('on'); $('lobby').classList.add('on'); this.state = 'lobby'; } }, 2500);
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
    pills('lbLoadout', Settings.data.loadouts.map((l, i) => [i, LOADOUT_KEYS[i]]), 'loadout');
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
    $('lbLoadoutInfo').textContent = `配裝 ${LOADOUT_KEYS[L.loadout]}：${WEAPON_DEFS[lo.primary].name} + ${WEAPON_DEFS[lo.secondary].name}`;
    [...$('lbLoadout').children].forEach((b, i) => { b.title = `配裝 ${LOADOUT_KEYS[i]} · 對戰中按 F${i + 1}`; });
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
  async startMatch(net = null) {
    const $ = this.$, L = net ? Object.assign({}, Settings.data.lobby, net.welcome.cfg) : Settings.data.lobby, def = MAPS[L.map];
    this.state = 'loading';
    this.cmds.reset();
    $('lbCount').classList.remove('on'); $('lobby').classList.remove('on');
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = def.en; $('ldSub').textContent = `${def.name} · ${MODES[L.mode].name} · ${RULES[L.rule].name} · ${L.allies} vs ${L.enemies}${L.rule === 'relic' ? ' · 藍隊進攻 / 紅隊防守' : ''}`;
    $('ldTip').textContent = '提示：' + pick(TIPS); $('ldSlogan').textContent = def.slogan;
    drawMapPreview($('ldMap'), def, this.dry[L.map]);
    this.loadShown = 0; this.loadTarget = 0; this.loadLabel = '初始化';
    await nextFrame();
    const cfg = Object.assign({}, L, { ruleCfg: JSON.parse(JSON.stringify(L.ruleCfg)) });
    const m = this.match = new Match(this, cfg);
    if (net) m.net = net; // client: built from the host's roster, no bots of its own
    try {
      await m.build((p, label) => { this.loadTarget = p * 0.85; this.loadLabel = label; });
    } catch (e) {
      console.error(e); $('ldStep').textContent = '載入失敗：' + e.message; return;
    }
    if (!net && this.netHostRoom) new NetHost(this, m, new LoopbackTransport(this.netHostRoom, this.netOpts)); // v25: friends in the same browser can join this match
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
    this.state = 'returning';
    clearInterval(this.endTimer);
    $('endscreen').classList.remove('on'); $('pause').classList.remove('on'); $('settings').classList.remove('on');
    this.input.unlock(); this.hud.show(false);
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'RETURNING'; $('ldSub').textContent = '返回房間中…'; $('ldTip').textContent = '提示：' + pick(TIPS); $('ldSlogan').textContent = 'ROOM #0427';
    this.loadShown = 0; this.loadTarget = 1; this.loadLabel = '結算戰績';
    await sleep(900);
    if (this.match) { if (this.match.net) this.match.net.close(); this.match.dispose(); this.match = null; }
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
    let s = 0, ws = 0; const H = tex.image.height, W = tex.image.width; // solid-angle weighted mean luminance → normalises viewmodel reflections per map
    for (let j = 0; j < H; j += 2) { const w = Math.cos((0.5 - (j + 0.5) / H) * Math.PI); for (let i = 0; i < W; i += 2) { const k = (j * W + i) * ch; s += (0.2126 * f(d[k]) + 0.7152 * f(d[k + 1]) + 0.0722 * f(d[k + 2])) * w; ws += w; } }
    env.userData.meanLum = s / ws;
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
      if (down) this.cmds.press(btn === 0 ? BTN.FIRE : btn === 2 ? BTN.ALT : 0); // v25: fired in the next fixed step (a sub-tick click is never lost)
      m.weapons.onButton(btn, down); // ADS toggle / hold stays an instant local decision
    };
    inp.onKey = (code) => {
      const m = this.match;
      if (this.state === 'countdown' && code === 'Escape') { this.cancelCountdown(); return; }
      if (this.state === 'lobby' && code === 'Escape' && this.$('warehouse').classList.contains('on')) { this.closeWarehouse(); return; }
      const fk = /^F([1-5])$/.exec(code);
      if (fk && m && (this.state === 'playing' || this.state === 'paused')) { m.queueLoadout(parseInt(fk[1], 10) - 1); return; } // works while dead too
      if (this.state !== 'playing' || !m || !m.player.alive) return;
      const C = this.cmds, dg = /^Digit([1-9])$/.exec(code);
      if (code === 'Space') C.press(BTN.JUMP);
      else if (code === 'KeyF') C.press(BTN.GRAB);
      else if (code === 'KeyE') C.press(BTN.INTERACT);
      else if (code === 'KeyQ') C.press(BTN.QUICK);
      else if (code === 'KeyR') C.press(BTN.RELOAD);
      else if (dg) { const i = parseInt(dg[1], 10) - 1; if (i < m.weapons.weapons.length) C.switchTo(i); }
    };
    inp.onLockChange = (locked, error) => {
      if (error) return; // failed lock request (no user gesture) — the freeze overlay asks for a click instead
      if (locked) { if (this.state === 'paused') { this.$('pause').classList.remove('on'); this.state = 'playing'; this.last = performance.now(); } }
      else if (this.state === 'playing' && this.match && this.match.phase !== 'over') { this.state = 'paused'; this.$('pause').classList.add('on'); if (this.match) this.match.weapons.trigger = false; this.cmds.reset(); }
    };
    this.canvas.addEventListener('click', () => { if (this.state === 'playing' && !inp.locked) inp.lock(); });
    document.getElementById('hud').addEventListener('click', () => { if (this.state === 'playing' && !inp.locked) inp.lock(); });
  }

  bindMenus() {
    const $ = this.$, S = Settings.data;
    $('pResume').onclick = () => { this.audio.uiClick(); this.input.lock(); setTimeout(() => { if (this.state === 'paused' && !this.input.locked) $('pMsg').textContent = '瀏覽器限制：請稍候一秒再按一次「繼續遊戲」'; }, 600); };
    $('pSettings').onclick = () => this.openSettings();
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
    sel('optQuality', 'quality', (q) => { if (q === 'auto') AUTO_Q = this.autoCeil; this.tex.setQuality(activeQuality()); if (this.match) this.post.configure(this.match, activeQuality()); });
    sel('optAds', 'adsMode'); sel('optHip', 'hipMode'); sel('optHud', 'hudStyle', () => this.hud.applyStyle());
    const chk = (id, key) => { const el = $(id); el.checked = !!S[key]; el.addEventListener('change', () => { S[key] = el.checked; Settings.save(); }); };
    chk('optHdri', 'hdri'); chk('optAnn', 'announcer'); chk('optFps', 'showFps'); chk('optKc', 'killcam');
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
    this.state = 'ended'; this.input.unlock(); m.weapons.trigger = false;
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
  // v24: the armory is its own page — the room screen is hidden while it is open (it was a pop-up over the room).
  openWarehouse() {
    const $ = this.$, L = Settings.data.lobby;
    this.audio.init(); this.audio.uiClick();
    this.wh = this.wh || { slot: L.loadout, cat: 'primary', sel: null, filter: 'all', q: '', page: -1 };
    this.wh.slot = L.loadout; this.wh.sel = Settings.data.loadouts[this.wh.slot][this.wh.cat]; this.wh.page = -1; // -1 = the page showing the equipped gun
    $('lobby').classList.remove('on'); $('warehouse').classList.add('on');
    if (!this.whR) this._initPreview();
    this.renderWarehouse();
  }
  closeWarehouse() { this.$('warehouse').classList.remove('on'); this.$('lobby').classList.add('on'); Settings.save(); this.audio.uiClick(); this.refreshLobby(); }
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
  // v20: card thumbnails — each gun's real 3D model rendered once (side view, transparent background) into a data URL.
  // Uses the preview renderer at thumbnail size and restores it in the same task, so the live preview never flickers.
  _makeThumbs(ids) {
    this.thumbs = this.thumbs || {};
    const todo = ids.filter((id) => !this.thumbs[id]);
    if (!todo.length || !this.whR) return;
    const r = this.whR, cam = this.whCam, cv = r.domElement, pr = r.getPixelRatio(), TW = 360, TH = 150, P = this.whPivot;
    const keep = { pos: cam.position.clone(), aspect: cam.aspect, rx: P.rotation.x, ry: P.rotation.y, kids: [...P.children] }, sol = this.whSoldier && this.whSoldier.root;
    if (sol) sol.visible = false;
    r.setPixelRatio(1); r.setSize(TW * 2, TH * 2, false); cam.aspect = TW / TH; cam.position.set(0, 0.1, 2.05); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    const out = document.createElement('canvas'); out.width = TW; out.height = TH; const ctx = out.getContext('2d');
    P.rotation.set(0.04, 0.16, 0); const expo = r.toneMappingExposure; r.toneMappingExposure = 1.9; // brighter studio exposure: dark guns read on the card
    for (const id of todo) {
      P.clear();
      try { P.add(this.models.preview(WEAPON_DEFS[id])); } catch (e) { console.warn('thumb', id, e); continue; }
      r.setClearColor(0x000000, 0); r.clear(); r.render(this.whScene, cam);
      ctx.clearRect(0, 0, TW, TH); ctx.drawImage(cv, 0, 0, TW, TH); this.thumbs[id] = out.toDataURL('image/webp', 0.92);
    }
    r.toneMappingExposure = expo; P.clear(); keep.kids.forEach((k) => P.add(k)); P.rotation.set(keep.rx, keep.ry, 0); if (sol) sol.visible = true;
    cam.position.copy(keep.pos); cam.lookAt(0, 0, 0); cam.aspect = keep.aspect; cam.updateProjectionMatrix(); r.setPixelRatio(pr);
    const w = cv.clientWidth, h = cv.clientHeight; if (w && h) r.setSize(w, h, false);
  }
  // Thumbnails render one per frame in the background (building a procedural gun model takes ~20–80 ms), newest request first;
  // cards show the line icon until their render is ready and swap it in place.
  _queueThumbs(ids, front = false) {
    this.thumbs = this.thumbs || {};
    const need = ids.filter((id) => !this.thumbs[id]), q = (this.thumbQ || []).filter((id) => !need.includes(id));
    this.thumbQ = front ? [...need, ...q] : [...q, ...need];
  }
  _pumpThumb() {
    if (!this.whR) this._initPreview();
    const id = this.thumbQ.shift(); if (!id || !this.whR) return;
    this._makeThumbs([id]);
    const img = document.querySelector(`#whList .whGun[data-id="${id}"] .th img`);
    if (img && this.thumbs[id]) { img.src = this.thumbs[id]; img.classList.remove('ln'); }
    if (this.wh && this.wh.sel === id && this.thumbs[id]) this.$('whPic').src = this.thumbs[id];
  }
  // Stage: the soldier (same model as in a match) holding the selected set's primary weapon, turning slowly.
  _whStage() {
    if (!this.whR) return;
    const id = Settings.data.loadouts[this.wh.slot].primary, model = WEAPON_DEFS[id].model || id;
    if (!this.whSoldier) { this.whSoldier = this.soldiers.create('alpha', model); this.whScene.add(this.whSoldier.root); }
    else if (this.whSoldierGun !== model) this.soldiers.setWeapon(this.whSoldier, model);
    this.whSoldierGun = model;
  }
  _renderPreview(dt) {
    if (!this.whR || !this.$('warehouse').classList.contains('on')) return;
    const r = this.whR, cam = this.whCam, cv = this.$('whCanvas'), w = cv.clientWidth, h = cv.clientHeight;
    if (w && h && (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio()))) r.setSize(w, h, false);
    if (w && h) cam.aspect = w / h;
    cam.fov = 30; cam.position.set(0, 1.08, 4.9); cam.lookAt(0, 0.93, 0); cam.updateProjectionMatrix(); // thumbnails move the camera: set it every frame
    this.whT += dt; if (this.whSoldier) this.whSoldier.root.rotation.y = Math.PI + 0.8 + Math.sin(this.whT * 0.45) * 0.4;
    r.render(this.whScene, cam);
  }
  renderWarehouse() {
    const $ = this.$, W = this.wh, LO = Settings.data.loadouts, L = Settings.data.lobby, lo = LO[W.slot];
    // loadout sets A–E (no names)
    $('whSets').innerHTML = LO.map((_, i) => `<button data-i="${i}" class="${i === W.slot ? 'on' : ''}" title="對戰中按 F${i + 1}">${LOADOUT_KEYS[i]}</button>`).join('');
    [...$('whSets').children].forEach((b) => { b.onclick = () => { W.slot = +b.dataset.i; L.loadout = W.slot; W.sel = LO[W.slot][W.cat]; W.page = -1; Settings.save(); this.audio.uiClick(); this.renderWarehouse(); }; });
    $('whSetBig').textContent = LOADOUT_KEYS[W.slot]; $('whSetLine').textContent = `${WEAPON_DEFS[lo.primary].name} + ${WEAPON_DEFS[lo.secondary].name}`;
    // slot row: primary / secondary choose what the grid lists; knife and grenades come with every set
    const pic = (id) => (this.thumbs && this.thumbs[id]) || WEAPON_ICONS[id] || '';
    const slots = [['primary', lo.primary, '主武器'], ['secondary', lo.secondary, '副武器'], [null, 'knife', '近戰'], [null, 'he', '手榴彈'], [null, 'flash', '閃光彈'], [null, 'smoke', '煙霧彈']];
    $('whSlots').innerHTML = slots.map(([cat, id, lbl]) => `<button class="whSlot${cat ? ' pick' : ''}${cat === W.cat ? ' on' : ''}" ${cat ? `data-cat="${cat}"` : 'disabled'}>${pic(id) ? `<img src="${pic(id)}" alt="">` : ''}<em>${WEAPON_DEFS[id] ? WEAPON_DEFS[id].name : lbl}</em>${WEAPON_DEFS[id] && WEAPON_DEFS[id].name !== lbl ? `<small>${lbl}</small>` : ''}</button>`).join('');
    $('whSlots').querySelectorAll('.pick').forEach((b) => { b.onclick = () => { if (W.cat === b.dataset.cat) return; W.cat = b.dataset.cat; W.sel = LO[W.slot][W.cat]; W.filter = 'all'; W.page = -1; this.audio.uiClick(); this.renderWarehouse(); }; });
    // filter + search
    const types = [...new Set((W.cat === 'primary' ? PRIMARY_IDS : SECONDARY_IDS).map((id) => WEAPON_DATABASE[id].type))];
    if (W.filter !== 'all' && !types.includes(W.filter)) W.filter = 'all';
    const f = $('whFilter'); f.innerHTML = '<option value="all">全部</option>' + types.map((t) => `<option value="${t}">${TYPE_LABEL[t]}</option>`).join(''); f.value = W.filter;
    f.onchange = () => { W.filter = f.value; W.page = 0; this.audio.uiClick(); this._whList(); };
    const q = $('whSearch'); q.value = W.q; q.oninput = () => { W.q = q.value.trim().toLowerCase(); W.page = 0; this._whList(); };
    this._whList(); this._whInfo(); this._whStage();
  }
  // Paged 3×3 grid like SF2 (wheel or the pager turns pages); hovering a card previews it, clicking equips it.
  _whList() {
    const $ = this.$, W = this.wh, LO = Settings.data.loadouts, PER = 9;
    const ids = (W.cat === 'primary' ? PRIMARY_IDS : SECONDARY_IDS).filter((id) => (W.filter === 'all' || WEAPON_DATABASE[id].type === W.filter) && (!W.q || `${WEAPON_DEFS[id].name} ${id}`.toLowerCase().includes(W.q)));
    const pages = Math.max(1, Math.ceil(ids.length / PER));
    if (W.page < 0) W.page = Math.max(0, Math.floor(ids.indexOf(LO[W.slot][W.cat]) / PER));
    W.page = clamp(W.page, 0, pages - 1);
    const list = $('whList'), page = ids.slice(W.page * PER, W.page * PER + PER); list.innerHTML = '';
    this._queueThumbs(page, true);
    for (let k = 0; k < PER; k++) {
      const id = page[k], c = document.createElement('button');
      if (!id) { c.className = 'whGun empty'; c.disabled = true; list.appendChild(c); continue; }
      c.className = 'whGun' + (LO[W.slot][W.cat] === id ? ' eq' : '') + (W.sel === id ? ' sel' : ''); c.dataset.id = id;
      const th = this.thumbs && this.thumbs[id] ? `<img src="${this.thumbs[id]}" alt="">` : WEAPON_ICONS[id] ? `<img class="ln" src="${WEAPON_ICONS[id]}" alt="">` : '';
      c.innerHTML = `<div class="nm">${WEAPON_DEFS[id].name}</div><div class="th">${th}</div><span class="cls">${TYPE_LABEL[WEAPON_DATABASE[id].type]}</span>`;
      c.onmouseenter = () => { if (W.sel !== id) { W.sel = id; this._whInfo(); } };
      c.onclick = () => { LO[W.slot][W.cat] = id; W.sel = id; Settings.save(); this.audio.uiClick(); this.renderWarehouse(); };
      list.appendChild(c);
    }
    list.onmouseleave = () => { const eq = LO[W.slot][W.cat]; if (W.sel !== eq) { W.sel = eq; this._whInfo(); } };
    list.onwheel = (e) => { e.preventDefault(); const np = clamp(W.page + Math.sign(e.deltaY), 0, pages - 1); if (np !== W.page) { W.page = np; this._whList(); } };
    const btn = (p, label, on, off) => `<button data-p="${p}"${on ? ' class="on"' : ''}${off ? ' disabled' : ''}>${label}</button>`;
    $('whPager').innerHTML = btn(0, '«', false, W.page === 0) + btn(W.page - 1, '‹', false, W.page === 0) + Array.from({ length: pages }, (_, i) => btn(i, i + 1, i === W.page, false)).join('') + btn(W.page + 1, '›', false, W.page >= pages - 1) + btn(pages - 1, '»', false, W.page >= pages - 1);
    $('whPager').querySelectorAll('button').forEach((b) => { b.onclick = () => { W.page = +b.dataset.p; this.audio.uiClick(); this._whList(); }; });
  }
  _whInfo() {
    const $ = this.$, id = this.wh.sel, s = WEAPON_DATABASE[id], d = WEAPON_DEFS[id], st = weaponStats(id);
    $('whName').textContent = d.name;
    $('whType').textContent = `${TYPE_LABEL[s.type]} · ${s.slot === 'primary' ? '主武器' : '副武器'} · ${st.rpm} RPM · ${d.fireMode}`;
    $('whBlurb').textContent = WEAPON_BLURBS[id] || d.desc || '';
    const bars = [['傷害', st.damage], ['後座力', 100 - st.control], ['射速', st.fireRate], ['精準度', st.accuracy]];
    $('whBars').innerHTML = bars.map(([k, v]) => `<div class="bar"><span>${k}</span><div><i style="width:${v}%"></i></div><b>${v}</b></div>`).join('')
      + `<div class="bar"><span>彈容量</span><div class="txt"></div><b>${d.mag}/${d.reserve}</b></div>`;
    if (!(this.thumbs && this.thumbs[id]) && this.whR) this._makeThumbs([id]); // the big picture is the same 3D render as the card
    $('whPic').src = (this.thumbs && this.thumbs[id]) || WEAPON_ICONS[id] || '';
  }

  /* ------------------------------ loop ------------------------------ */
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    // v24: once the GPU is falling behind (busy, measured below), it may never run more than 2 frames behind the input — skip this
    // refresh instead (the next one gets the whole dt). Not while it keeps up: a GTX 1650 Ti occasionally shows 2 in flight at 60 FPS.
    const inFlight = this.pacer.inFlight();
    if (this.state === 'playing') { const h = this.pacer.hist || (this.pacer.hist = [0, 0, 0, 0, 0]); h[Math.min(4, inFlight)]++; }
    if (this.state === 'playing' && inFlight >= 2 && this.gpuBusy > 0.15 && this.pacer.skips < 3 && !window.__noPace) { this.pacer.skips++; this.busyN++; this.busyF++; return; }
    this.pacer.skips = 0;
    let dt = clamp((now - this.last) / 1000, 0, 0.1); this.last = now;
    this.input.gameActive = this.state === 'playing' || this.state === 'paused';
    if (this.state === 'lobby') { this._renderPreview(dt); if (this.thumbQ && this.thumbQ.length && performance.now() > this.thumbStart) this._pumpThumb(); }
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
        const tt0 = performance.now(); m.tick(dt, mouse); const tt1 = performance.now(); m.prof.add('tick', tt1 - tt0);
        // dynamic resolution: keep the GPU out of overload (prevents hangs / TDR on weaker cards)
        this.frameMs = lerp(this.frameMs, dt * 1000, 0.08); this.dynT += dt; this.busyF++; if (inFlight >= 2) this.busyN++;
        // v24 dynamic resolution: react within ~1 s (was 2 s / >24 ms), down to the preset's minScale. `busy` = share of frames
        // that started with 2+ earlier frames still unfinished on the GPU (queue building up → input lag, even at 55+ FPS).
        // 1 in flight is normal: the fence status reaches the page a little late (GTX 1650 Ti at 60 FPS: 0 → 75 %, 1 → 24 %, 2 → 0.8 %).
        if (this.dynT > 1) {
          this.dynT = 0; const busy = this.busyN / Math.max(1, this.busyF); this.busyN = this.busyF = 0; this.gpuBusy = busy;
          if (this.frameMs > 20 || busy > 0.2) this.post.setScale(this.post.scale * 0.88); else if (this.frameMs < 12 && busy < 0.03 && this.post.scale < 1) this.post.setScale(this.post.scale + 0.05);
          // auto quality: still slow at the lowest resolution for 3 s → one preset down; very fast at full resolution for 20 s → one up (never above the GPU's start preset)
          if (Settings.data.quality === 'auto') {
            const q = this.post.q || QUALITY.high, i = Q_ORDER.indexOf(activeQuality());
            this.autoSlow = (this.frameMs > 22 || busy > 0.3) && this.post.scale <= q.minScale + 0.01 ? (this.autoSlow || 0) + 1 : 0;
            this.autoFast = this.frameMs < 11 && busy < 0.02 && this.post.scale >= 0.999 ? (this.autoFast || 0) + 1 : 0;
            if (this.autoSlow >= 3 && i > 0) { AUTO_Q = Q_ORDER[i - 1]; this.autoSlow = 0; this.post.scale = 1; this.post.configure(m, AUTO_Q); this.hud.toast('畫質自動調整：' + Q_LABEL[AUTO_Q]); }
            else if (this.autoFast >= 20 && i < Q_ORDER.indexOf(this.autoCeil)) { AUTO_Q = Q_ORDER[i + 1]; this.autoFast = 0; this.post.configure(m, AUTO_Q); }
          }
        }
        this.hud.setFps(`${this.fpsText} · ${this.gpuShort}${this.gpuIntegrated ? '（內顯）' : ''}`, Settings.data.showFps);
        const st = window.__stats || (window.__stats = { frames: 0, seconds: 0 }); st.frames++; st.seconds += dt; st.avgFps = Math.round(st.frames / Math.max(1e-3, st.seconds)); st.frameMs = +this.frameMs.toFixed(2); st.fps = this.fpsText; st.gpuBusy = this.gpuBusy; st.inflight = this.pacer.hist; st.scale = this.post.scale; st.q = activeQuality(); // tools/check.mjs
        const ring = st.dts || (st.dts = []); ring.push(dt * 1000); if (ring.length > 900) ring.shift(); // frame-time distribution (stutter shows in p99 / max, not in the average)
      }
      if (this.state === 'shot') {
        this.shotT += dt;
        const s = m.def.shot, k = this.shotT * 0.12;
        m.camera.position.set(s.pos[0] + k * 2.2, s.pos[1] - k * 0.5, s.pos[2] - k * 1.2); m.camera.lookAt(s.target[0], s.target[1], s.target[2]);
        m.camera.fov = 62; m.camera.updateProjectionMatrix();
        m.effects.update(dt); for (const fn of m.builder.animated) fn(dt, this.shotT);
        this.post.render(dt, false);
      } else if (this.state === 'playing' || this.state === 'paused' || this.state === 'ended') {
        // v23: a paused / finished match only redraws ~10×/s — a forgotten paused tab no longer pins the GPU at 100 %
        const idle = this.state !== 'playing';
        if (!idle || now - (this.idleDrawT || 0) > 100) {
          this.idleDrawT = now;
          const showVM = m.player.alive && m.weapons.current.vm.group.visible && this.state !== 'ended';
          const rt0 = performance.now(); this.post.render(this.state === 'playing' ? dt : 0, showVM); if (m.prof) m.prof.add('render', performance.now() - rt0);
          if (this.state === 'playing') this.pacer.mark();
        }
      }
    }
    this.input.endFrame();
  }
}

try {
  const app = new App();
  window.app = app;
  window.SF2 = { THREE, Settings, MAPS, WEAPON_DEFS, WEAPON_DATABASE, CFG, MODES, RULES, calcDamage, loadoutDefs, LOOK_DEFAULT, resolveLook, CAO }; // debug handle for the console
  window.SF2net = { NetHost, NetClient, LoopbackTransport, NetCodec, host: (room, o = {}) => new NetHost(app, app.match, new LoopbackTransport(room, o)), join: (room, o = {}) => app.netJoin(room, o) }; // v25 tests
  window.__gameReady = true;
  document.getElementById('boot').classList.add('done');
} catch (e) {
  console.error(e);
  window.__bootErr('初始化失敗: ' + (e && e.message ? e.message : e));
}
</script>
</body>
</html>

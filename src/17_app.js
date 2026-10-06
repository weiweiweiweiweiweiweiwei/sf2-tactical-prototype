/* =====================================================================
   APP — renderer, shared resources, room/lobby, loading flow, pause,
   settings, end screen and the main loop.
   States: hub (大廳) → lobby (the room) → countdown → loading → shot → playing ⇄ paused → ended → returning → lobby
           hub → joining → lobby (a friend's room) · v27
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
    loadGunModels().then(() => this.models.previews.clear()); // armory previews rebuild with the Blender guns once parsed
    this.soldiers = new SoldierFactory(this.tex, this.models);
    this.audio = new AudioEngine(); this.input = new InputManager(this.canvas); this.cmds = new CmdBuilder(this.input); this.hud = new HUD(this); this.post = new PostFX(r);
    this.hdrCache = new Map(); this.match = null; this.room = null; this.state = 'hub';
    this.last = performance.now(); this._mouse = { x: 0, y: 0 };
    this.fpsAcc = 0; this.fpsFrames = 0; this.fpsText = '';
    this.$ = (id) => document.getElementById(id);
    this.buildLobby(); this.bindInput(); this.bindMenus(); this.onResize();
    this.$('optGpu').textContent = this.gpuName + (this.gpuIntegrated ? '（內顯）' : '');
    addEventListener('resize', () => this.onResize());
    addEventListener('beforeunload', (e) => { if (this.match && (this.state === 'playing' || this.state === 'paused')) { e.preventDefault(); e.returnValue = ''; } });
    AudioEngine.prepareBanks().catch((e) => console.warn('audio banks', e));
    // v33 recorded sounds load in the background (procedural ones play until then); a match already running swaps its ambience
    AudioEngine.onSamples = () => { if (this.audio.ambKind && this.audio.ambKind !== 'none') this.audio.setAmbience(this.audio.ambKind); };
    setTimeout(() => AudioEngine.loadSamples(), 1200);
    setTimeout(() => { try { this.makeIcons(); } catch (e) { console.warn('weapon icons', e); } }, 400);
    this.thumbStart = performance.now() + 1500; this._queueThumbs([...PRIMARY_IDS, ...SECONDARY_IDS]); // v20 armory card renders, built in the lobby's idle frames
    requestAnimationFrame((t) => this.loop(t));
    this.netBoot();
  }

  /* ------------------------------ v25 network test entry ------------------------------ */
  // ?host=ROOM — matches started from this tab accept friends · ?join=ROOM — join the match hosted in another tab of this
  // browser · &lag=80&jitter=20&loss=0.05 simulate a real connection (ms / ms / fraction of lost packets) · &name=Wei
  // v27: ?room=482913 — an invite link: join that room straight away
  netBoot() {
    const q = new URLSearchParams(location.search), o = { lag: q.get('lag'), jitter: q.get('jitter'), loss: q.get('loss'), name: q.get('name') };
    this.netOpts = o;
    this.dir = new RoomDirectory(); this.bgTick = new BackgroundTicker(() => this.hiddenTick());
    this.buildHub(); this.buildFriends(); this.buildChat();
    addEventListener('pagehide', () => this.closeRoom()); // best effort: tell the room right away
    const code = parseCode(q.get('room'));
    if (code) {
      try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u.href); } catch (e) { /* file:// may refuse */ }
      setTimeout(() => this.joinRoom(code), 300);
    }
    if (q.get('host')) this.netHostRoom = q.get('host');
    if (q.get('join')) setTimeout(() => this.netJoin(q.get('join'), { ...o, name: q.get('name'), team: q.get('team') }), 300);
  }
  netJoin(room, o = {}) {
    if (this.netClient) this.netClient.close();
    const $ = this.$, c = this.netClient = new NetClient(this, new LoopbackTransport(room, o), { name: o.name || 'Player' + Math.floor(Math.random() * 900 + 100), team: o.team });
    $('hub').classList.remove('on'); $('lobby').classList.remove('on'); const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'JOINING'; $('ldSub').textContent = `尋找房間「${room}」的房主…`; $('ldTip').textContent = '提示：房主需要用 ?host=' + room + ' 開啟遊戲並開始對戰'; $('ldSlogan').textContent = 'ONLINE';
    this.loadShown = 0; this.loadTarget = 0.1; this.loadLabel = '等待房主回應';
    c.start();
    return c;
  }
  async startNetMatch(client) { await this.startMatch(client); }
  netError(why) {
    const $ = this.$; $('ldSub').textContent = '無法加入：' + why; this.loadLabel = '已取消';
    setTimeout(() => { if (this.state === 'hub' || this.state === 'loading' || this.state === 'joining') this.showHub('無法加入：' + why); }, 2500);
  }

  /* ------------------------------ v27 hub (大廳): create a room, or join one ------------------------------ */
  buildHub() {
    const $ = this.$, S = Settings.data;
    if (!S.nick) { S.nick = '玩家' + Math.floor(Math.random() * 900 + 100); Settings.save(); }
    const nick = $('hubNick'); nick.value = S.nick;
    nick.oninput = () => { S.nick = safeName(nick.value, ''); Settings.save(); };
    nick.onblur = () => { if (!S.nick) { S.nick = '玩家' + Math.floor(Math.random() * 900 + 100); Settings.save(); } nick.value = S.nick; };
    nick.onkeydown = (e) => e.stopPropagation();
    $('hubCreate').onclick = () => this.createRoom();
    $('hubJoinOpen').onclick = () => {
      this.audio.init(); this.audio.uiClick();
      const card = $('hubJoinCard'), on = !card.classList.contains('open'); card.classList.toggle('open', on);
      if (on) setTimeout(() => $('hubCode').focus(), 60);
    };
    const code = $('hubCode');
    code.oninput = () => { // digits only, shown "482 913"; a pasted invite link becomes its code
      const d = parseCode(code.value) || code.value.replace(/\D/g, '').slice(0, 6);
      code.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d; $('hubJoinGo').disabled = d.length !== 6; $('hubMsg').textContent = '';
    };
    code.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') this.joinRoom(code.value); };
    $('hubJoinGo').onclick = () => this.joinRoom(code.value); $('hubJoinGo').disabled = true;
    $('hubWh').onclick = () => this.openWarehouse(); $('hubSettings').onclick = () => this.openSettings(); $('hubFull').onclick = () => this.toggleFullscreen();
    this.dir.onChange = (rooms) => this.renderRooms(rooms);
    this.dir.open().then(() => { $('hubNet').textContent = '已連線'; $('hubNet').className = 'ok'; this.renderRooms(this.dir.rooms); })
      .catch(() => { $('hubNet').textContent = '離線'; $('hubNet').className = 'off'; this.dirOffline = true; this.renderRooms([]); });
  }
  renderRooms(rooms) {
    const el = this.$('hubRooms'); this.$('hubRoomsN').textContent = rooms.length ? `${rooms.length} 間開放中` : '';
    const list = rooms.map((r) => [parseCode(r.code), r]).filter(([c]) => c);
    if (this.dirOffline) { el.innerHTML = '<div class="empty"><b>連不上配對伺服器</b>需要網路才能和朋友連線。建立房間後仍然可以單機遊玩。</div>'; return; }
    if (!list.length) { el.innerHTML = '<div class="empty"><b>目前沒有公開的房間</b>朋友的房間預設不公開：請他按房間裡的「＋ 邀請朋友」，把連結或 6 位數代碼傳給你。</div>'; return; }
    el.innerHTML = '<div class="rhead"><span>房間代碼</span><span>房主</span><span>地圖 · 賽制</span><span>人數</span><span>狀態</span><span></span></div>'
      + list.map(([code, r]) => `<div class="room"><b>${fmtCode(code)}</b><span>${esc(safeName(r.host, '房主'))} 的房間</span><span>${esc(String(r.map).slice(0, 12))} · ${esc(String(r.mode).slice(0, 8))}</span><span>${r.players | 0} / ${r.max | 0}</span><span class="ph${r.phase === 'playing' ? ' on' : ''}">${r.phase === 'playing' ? '對戰中' : '等待中'}</span><button class="btn ghost" data-code="${code}">加入</button></div>`).join('');
    el.querySelectorAll('button[data-code]').forEach((b) => { b.onclick = () => this.joinRoom(b.dataset.code); });
  }
  showHub(msg = '') {
    const $ = this.$;
    for (const id of ['lobby', 'loader', 'warehouse']) $(id).classList.remove('on');
    $('lbCount').classList.remove('on'); $('hub').classList.add('on'); this.state = 'hub'; this.countGuest = false;
    $('hubMsg').textContent = msg; if (msg) { $('hubJoinCard').classList.add('open'); this.roomToast(msg); }
    this.renderRooms(this.dir.rooms);
  }
  roomToast(msg) {
    if (this.match && (this.state === 'playing' || this.state === 'paused')) { this.hud.toast(msg); return; }
    const t = this.$('roomToast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }
  copyText(text, done) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* blocked */ } ta.remove(); return ok; };
    try { navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback())); } catch (e) { done(fallback()); }
  }

  /* ------------------------------ v27 rooms ------------------------------ */
  createRoom() {
    if (this.state !== 'hub') return;
    this.audio.init(); this.audio.uiClick();
    this.closeRoom();
    const r = this.room = new RoomHost(this);
    r.ready.then(() => { if (this.room === r) { this.onRoomChange(r); this.attachHost(); } })
      .catch(() => { if (this.room === r) { r.failed = true; this.onRoomChange(r); } });
    this.bgTick.set(true);
    this.enterRoomScreen();
  }
  joinRoom(raw) {
    const $ = this.$, code = parseCode(raw);
    if (!code) { $('hubMsg').textContent = '房間代碼是 6 位數字'; return; }
    if (this.state !== 'hub' && this.state !== 'lobby') return;
    this.audio.init(); this.audio.uiClick();
    this.closeRoom();
    const r = this.room = new RoomGuest(this, code);
    for (const id of ['hub', 'lobby', 'warehouse']) $(id).classList.remove('on');
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'JOINING'; $('ldSub').textContent = `加入房間 ${fmtCode(code)}`; $('ldSlogan').textContent = 'ROOM ' + fmtCode(code);
    $('ldTip').textContent = '提示：遊戲資料是你和房主的電腦直接連線傳送，不經過伺服器';
    this.loadShown = 0; this.loadTarget = 0.1; this.loadLabel = '連線中'; this.state = 'joining';
    r.onStatus = (s) => { if (this.state === 'joining' && this.room === r) { $('ldSub').textContent = s; this.loadLabel = s; this.loadTarget = Math.min(0.8, this.loadTarget + 0.2); } };
    r.start(); this.bgTick.set(true);
  }
  enterRoomScreen() {
    const $ = this.$;
    for (const id of ['hub', 'loader', 'warehouse']) $(id).classList.remove('on');
    $('lobby').classList.add('on'); this.state = 'lobby'; this.invite(false); this.refreshLobby(); this.warm(this.roomCfg().map);
  }
  closeRoom() { const r = this.room; if (!r) return; this.room = null; if (r.role === 'host') r.close(); else r.leave(); }
  leaveRoom() {
    if (this.state === 'countdown') this.cancelCountdown();
    if (this.state !== 'lobby') return;
    this.audio.uiClick(); this.closeRoom(); this.bgTick.set(false); this.showHub();
  }
  // a guest got into the room (first join, or reconnected to a new host)
  onRoomEnter(r) {
    if (this.room !== r) return;
    if (this.state === 'joining') { this.loadTarget = 1; this.enterRoomScreen(); const h = r.members.find((m) => m.host); this.roomToast(`已進入${h ? ' ' + h.name + ' 的' : ''}房間`); }
    else this.onRoomChange(r);
    if (r.phase === 'playing' && r.mcfg && !r.rejoin) this.startGuestMatch(); // the match is already on: drop straight in
  }
  onRoomChange(r) {
    if (r && this.room !== r) return;
    if (this.state === 'lobby' || this.state === 'countdown') this.refreshLobby();
  }
  onRoomFail(r, why) {
    if (this.room !== r) return;
    this.room = null; this.bgTick.set(false);
    if (['joining', 'lobby', 'countdown', 'hub'].includes(this.state)) { this.showHub(why); this.$('hubCode').value = fmtCode(r.code); this.$('hubJoinGo').disabled = false; }
    else this.pendingMsg = why; // in a match: shown when it ends
  }
  // the host left: the member who joined first becomes the host of the same code, the others reconnect to him
  onRoomHostLost(old) {
    if (this.room !== old) return;
    const next = old.successor();
    if (next && next.id === old.myId) {
      const c = old.cfg, L = Settings.data.lobby;
      if (c) { Object.assign(L, { map: c.map, mode: c.mode, rule: c.rule, difficulty: c.difficulty, allies: c.allies, enemies: c.enemies }); L.ruleCfg[c.rule] = Object.assign({}, c.ruleCfg[c.rule]); Settings.save(); }
      const r = this.room = new RoomHost(this, { code: old.code, migrate: true, pub: old.pub }); r.chat = old.chat;
      this.roomToast('房主離開了 · 你成為新的房主');
      r.ready.then(() => { if (this.room === r) this.onRoomChange(r); })
        .catch((e) => { if (this.room !== r) return; if (e.message === 'TAKEN') this._rejoinRoom(old, '連線中斷 · 正在重新連回房間…'); else { r.failed = true; this.onRoomChange(r); } });
    } else this._rejoinRoom(old, '房主離開了 · 正在連到新房主…');
    this.onRoomChange(this.room);
  }
  _rejoinRoom(old, msg) {
    const r = this.room = new RoomGuest(this, old.code, { team: old.team, rejoin: true });
    r.members = old.members.filter((m) => !m.host); r.myId = old.myId; r.cfg = old.cfg; r.chat = old.chat; // shown while reconnecting
    this.roomToast(msg); r.start();
  }
  // room settings as this player sees them: his own (host / no room) or the host's (guest; his loadout stays his)
  roomCfg() {
    const r = this.room, S = Settings.data.lobby;
    if (!r || r.role !== 'guest' || !r.cfg) return S;
    return Object.assign({}, S, r.cfg, { ruleCfg: Object.assign({}, S.ruleCfg, r.cfg.ruleCfg), loadout: S.loadout });
  }
  isGuest() { return !!this.room && this.room.role === 'guest'; }
  invite(on) { const pop = this.$('lbInvPop'); pop.classList.toggle('on', on ?? !pop.classList.contains('on')); this.$('lbInvMsg').textContent = ''; }
  guestCountdown(on) {
    const $ = this.$;
    if (on) {
      if (this.state !== 'lobby') return;
      $('warehouse').classList.remove('on'); $('settings').classList.remove('on'); $('lobby').classList.add('on'); this.invite(false);
      const L = this.roomCfg(); this.state = 'countdown'; this.countGuest = true; this.countT = 3;
      $('lbCountMap').textContent = `${MAPS[L.map].name} · ${MODES[L.mode].name} · ${RULES[L.rule].name}`; $('lbCount').classList.add('on'); this._showCount(3); this.renderRoomBar();
    } else if (this.state === 'countdown' && this.countGuest) { this.state = 'lobby'; this.countGuest = false; $('lbCount').classList.remove('on'); this.refreshLobby(); }
  }
  // a guest goes into the room's match: builds the map while the host does, then the host's match takes him in
  startGuestMatch() {
    const r = this.room; if (!r || r.role !== 'guest' || !r.mcfg) return;
    if (this.state === 'returning') { this.goPending = true; return; } // finish going back to the room first
    if (['loading', 'shot', 'joining'].includes(this.state)) return;
    if (this.match && (this.state === 'playing' || this.state === 'paused') && this.match.phase !== 'over') return;
    this.countGuest = false; this._teardownMatch();
    const c = this.netClient = new NetClient(this, r.newLink(), { name: Settings.data.nick, team: r.team || 'alpha', cfg: r.mcfg, room: true });
    c.start(); r.status('loading');
    this.startMatch(c);
  }
  // host: the room's connection serves the running match (also when the room came online after the match started)
  attachHost() {
    const m = this.match, r = this.room;
    if (m && m.running && !m.net && r && r.role === 'host' && r.online && m.phase !== 'over' && this.state !== 'returning') new NetHost(this, m, r.newLink());
  }
  abortNetMatch(why) {
    this._teardownMatch();
    if (this.room) { this.room.status('room'); this.enterRoomScreen(); this.roomToast(why); } else this.netError(why);
  }
  // shared = someone else is in this match with you (then it never pauses, and a hidden tab keeps simulating it)
  netShared(m) { return !!(m && m.net && (m.net.role === 'client' || m.net.peers.size > 0)); }
  // hidden tab during an online match: keep simulating (no rendering) so nobody else freezes
  hiddenTick() {
    const m = this.match; if (!m || !m.running || !this.netShared(m) || !document.hidden) return;
    const now = performance.now(), dt = clamp((now - this.last) / 1000, 0, 0.1); this.last = now;
    if (this.state === 'playing' || this.state === 'paused') { m.tick(dt, { x: 0, y: 0 }); this.input.endFrame(); }
  }
  updatePauseOnline() {
    const $ = this.$, el = $('pOnline'), m = this.match, r = this.room, shared = this.netShared(m), host = !!(m && m.net && m.net.role === 'host');
    $('pLeave').textContent = host && shared ? '結束對戰 → 所有人回到房間' : r ? '離開對戰 → 回到房間' : '離開對戰 → 回到大廳';
    if (!r || !r.online) { el.innerHTML = ''; return; }
    const via = r.role === 'host' ? (r.t && r.t.relayed ? `${r.t.relayed} 人經中繼伺服器` : '') : r.t && r.t.via === 'relay' ? '經中繼伺服器' : r.t && r.t.via === 'direct' ? '直連' : '';
    el.innerHTML = `<b>${r.role === 'host' ? '你是房主' : '連線中'}</b><span>房間 <code>${fmtCode(r.code)}</code></span><span>${host ? m.net.players + ' 人在對戰中' : m && m.net && m.net.rtt ? 'Ping ' + Math.round(m.net.rtt) + ' ms' : ''}</span>${via ? `<span>${via}</span>` : ''}${shared ? '<span style="color:var(--dim)">連線對戰不會暫停</span>' : ''}<button class="btn ghost" id="pCopy">複製邀請連結</button>`;
    $('pCopy').onclick = () => { const link = inviteLink(r.code); this.copyText(link, (ok) => { $('pMsg').textContent = ok ? '已複製邀請連結：' + link : link; }); };
  }

  /* ------------------------------ v31 chat: room panel + in-match (Enter) ------------------------------ */
  buildChat() {
    const $ = this.$;
    this.chatTeam = true; this.chatOpen = false; // v45: team chat by default
    const send = (inp, team) => { const r = this.room; if (r && inp.value.trim() && r.say(inp.value, team)) inp.value = ''; };
    const li = $('lbChatIn');
    li.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(li, this.chatTeam); else if (e.key === 'Tab') { e.preventDefault(); this.setChatTeam(!this.chatTeam); } };
    $('lbChatMode').onclick = () => { this.setChatTeam(!this.chatTeam); li.focus(); };
    $('lbChatSend').onclick = () => send(li, this.chatTeam);
    const gi = $('chatInput');
    gi.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { send(gi, this.chatTeam); this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
      else if (e.key === 'Tab') { e.preventDefault(); this.setChatTeam(!this.chatTeam); }
    };
    gi.onkeyup = (e) => e.stopPropagation();
    li.onkeyup = (e) => e.stopPropagation();
    this.setChatTeam(true);
  }
  setChatTeam(on) { this.chatTeam = !!on; for (const id of ['lbChatMode', 'chatMode']) { const b = this.$(id); b.textContent = on ? '隊伍' : '全體'; b.classList.toggle('team', on); } }
  _chatLine(m) {
    const d = document.createElement('div'); d.className = 'cl' + (m.sys ? ' sys' : '') + (m.tm ? ' tm' : '');
    if (m.sys) { d.textContent = m.t; return d; }
    const n = document.createElement('b'); n.className = (m.me ? 'me ' : '') + (m.c || ''); n.textContent = (m.tm ? '[隊伍] ' : '') + m.n + '：';
    const t = document.createElement('span'); t.textContent = m.t; d.append(n, t); return d;
  }
  renderChat() {
    const r = this.room, log = this.$('lbChatLog'), on = !!(r && r.online);
    log.replaceChildren(...(r ? r.chat : []).slice(-40).map((m) => this._chatLine(m)));
    if (false && !log.children.length) { /* v45: no grey helper line in the chat */ const e = document.createElement('div'); e.className = 'cl sys'; e.textContent = on ? '房間裡的人都看得到這裡的訊息 · 對戰中按 Enter 聊天' : '朋友進房後就能在這裡聊天'; log.append(e); }
    log.scrollTop = log.scrollHeight; this.$('lbChatIn').disabled = !on;
  }
  onChat(r, m) {
    if (r !== this.room) return;
    if (this.state === 'lobby' || this.state === 'countdown') { this.renderChat(); if (!m.me && !m.sys) try { this.audio.uiClick(); } catch (e) { /* audio locked */ } }
    const box = this.$('chatlog'), el = this._chatLine(m); el.dataset.t = performance.now(); box.append(el);
    while (box.children.length > 8) box.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 9000); // in a match a line fades after 9 s (all of them show while typing)
  }
  openChat(team = false) {
    if (!this.room || !this.room.online || this.chatOpen) return;
    this.chatOpen = true; this.setChatTeam(team); this.input.keys.clear(); this.cmds.reset();
    this.$('chatbox').classList.add('open'); const gi = this.$('chatInput'); gi.value = ''; setTimeout(() => gi.focus(), 0);
  }
  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false; this.input.keys.clear(); const gi = this.$('chatInput'); gi.blur(); this.$('chatbox').classList.remove('open');
  }

  /* ------------------------------ v28 friends: panel, invites, join a friend ------------------------------ */
  buildFriends() {
    const $ = this.$, F = this.friends = new Friends(this);
    this.frInvited = new Map(); this.frArm = null;
    F.onChange = () => this.renderFriends();
    if (F.hasId) F.start().catch(() => {}); // only players who already have a friend code go online for friends
    for (const id of ['hubFriends', 'lbFriends']) $(id).onclick = (e) => { e.stopPropagation(); this.audio.init(); this.audio.uiClick(); this.friendsPanel(); };
    $('frClose').onclick = () => { this.audio.uiClick(); this.friendsPanel(false); };
    $('friends').onclick = (e) => e.stopPropagation();
    document.addEventListener('click', () => { if ($('friends').classList.contains('on')) this.friendsPanel(false); });
    $('frCopy').onclick = () => { if (F.me) this.copyText(F.me.code, (ok) => this.frMsg(ok ? '✓ 好友代碼已複製，傳給朋友' : '無法自動複製：請直接把代碼告訴朋友')); };
    const inp = $('frCode');
    inp.oninput = () => { const d = inp.value.replace(/\D/g, '').slice(0, 8); inp.value = d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d; $('frAdd').disabled = d.length !== 8; this.frMsg(''); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') this.friendAdd(); };
    $('frAdd').onclick = () => this.friendAdd(); $('frAdd').disabled = true;
    const act = (e) => { const b = e.target.closest('button[data-act]'); if (b) { e.stopPropagation(); this.friendAct(b.dataset.act, b.dataset.id, b.dataset.room, b); } };
    $('frList').onclick = act; $('lbInvFriends').onclick = act;
    $('invCardGo').onclick = () => { const c = this.invCard; this.hideInvite(); if (c) this.goJoin(c.room); };
    $('invCardNo').onclick = () => this.hideInvite();
    this.renderFriends();
  }
  friendsPanel(on) {
    const el = this.$('friends'); on = on ?? !el.classList.contains('on'); el.classList.toggle('on', on);
    if (on) { this.invite(false); this.friends.start().then(() => this.friends.pollSoon()).catch(() => {}); this.renderFriends(); }
  }
  frMsg(t, bad = false) { const m = this.$('frMsg'); m.textContent = t; m.className = bad ? 'bad' : ''; }
  async friendAdd() {
    const $ = this.$, code = $('frCode').value.replace(/\D/g, '');
    if (code.length !== 8) return;
    $('frAdd').disabled = true; this.frMsg('送出中…');
    try {
      await this.friends.start(); const r = await this.friends.add(code);
      if (r.ok) { $('frCode').value = ''; this.frMsg(r.result === 'accepted' ? '✓ 你們成為好友了' : '✓ 已送出好友邀請，等對方接受'); } else { this.frMsg(r.why || '失敗', true); $('frAdd').disabled = false; }
    } catch (e) { this.frMsg('連不上好友伺服器', true); $('frAdd').disabled = false; }
  }
  async friendAct(act, id, room, btn) {
    const F = this.friends, f = F.list.find((x) => x.id === id), r = this.room;
    try {
      if (act === 'open') { this.friendsPanel(true); return; }
      if (act === 'join') { this.goJoin(room); return; }
      if (act === 'inv') {
        if (!r || !r.online || !f) return;
        btn.disabled = true; const res = await F.invite(id, r.code);
        if (res.ok) { this.frInvited.set(id, performance.now()); this.roomToast(`已邀請 ${f.name} · 對方畫面會跳出邀請`); } else this.roomToast(res.why || '邀請失敗');
        this.renderFriends(); return;
      }
      if (act === 'acc' || act === 'dec') { btn.disabled = true; await F.respond(id, act === 'acc'); if (act === 'acc' && f) this.roomToast(`你和 ${f.name} 成為好友了`); return; }
      if (act === 'rm') { // two clicks: the first one asks
        if (this.frArm !== id) { this.frArm = id; clearTimeout(this.frArmT); this.frArmT = setTimeout(() => { this.frArm = null; this.renderFriends(); }, 3000); this.renderFriends(); return; }
        this.frArm = null; btn.disabled = true; await F.remove(id); return;
      }
    } catch (e) { this.frMsg('連不上好友伺服器', true); this.renderFriends(); }
  }
  // what a friend is doing, seen from here
  _friendStatus(f, myRoom) {
    if (!f.online) return '離線';
    if (f.room && f.room === myRoom) return '在你的房間';
    if (f.st === 'playing') return `對戰中${f.room ? ' · 房間 ' + fmtCode(f.room) : ''}`;
    if (f.st === 'room') return f.room ? `在房間 ${fmtCode(f.room)}` : '在房間（單機）';
    return '在大廳';
  }
  _friendRow(f, myRoom, compact) {
    const now = performance.now(), invited = now - (this.frInvited.get(f.id) || -1e9) < 15000, b = [];
    if (f.online && myRoom && f.room !== myRoom) b.push(invited ? '<button class="btn ghost" disabled>已邀請</button>' : `<button class="btn" data-act="inv" data-id="${esc(f.id)}">邀請</button>`);
    if (!compact && f.online && f.room && f.room !== myRoom) b.push(`<button class="btn ghost" data-act="join" data-room="${f.room}">加入</button>`);
    if (!compact) b.push(this.frArm === f.id ? `<button class="btn danger" data-act="rm" data-id="${esc(f.id)}">確定刪除？</button>` : `<button class="btn ghost x" data-act="rm" data-id="${esc(f.id)}" title="刪除好友">✕</button>`);
    return `<div class="fr${f.online ? ' on' : ''}"><span class="dot"></span><div class="who"><b>${esc(f.name)}</b><small>${this._friendStatus(f, myRoom)}</small></div>${b.join('')}</div>`;
  }
  renderFriends() {
    const $ = this.$, F = this.friends; if (!F) return;
    const fr = F.friends, inc = F.incoming, out = F.outgoing, online = fr.filter((f) => f.online).length, r = this.room, myRoom = r && r.online ? r.code : null;
    const badge = (inc.length ? `<span class="bdg red">${inc.length}</span>` : '') + (online ? `<span class="bdg">${online}</span>` : '');
    for (const id of ['hubFriends', 'lbFriends']) $(id).innerHTML = `👥 好友${badge}`;
    $('frMe').textContent = F.me ? fmtFriend(F.me.code) : F.err ? '— — —' : '取得中…'; $('frCopy').disabled = !F.me;
    let h = '';
    if (!F.me && F.err) h = `<div class="fr-empty">${esc(F.err)}</div>`;
    if (inc.length) h += `<h3>好友邀請 · ${inc.length}</h3>` + inc.map((f) => `<div class="fr"><span class="dot"></span><div class="who"><b>${esc(f.name)}</b><small>想加你為好友 · ${fmtFriend(f.code)}</small></div><button class="btn" data-act="acc" data-id="${esc(f.id)}">接受</button><button class="btn ghost" data-act="dec" data-id="${esc(f.id)}">拒絕</button></div>`).join('');
    h += `<h3>好友 · ${online} 人在線上 / 共 ${fr.length} 人</h3>`;
    h += fr.length ? fr.map((f) => this._friendRow(f, myRoom, false)).join('') : '<div class="fr-empty">還沒有好友。把上面的好友代碼傳給朋友，或輸入朋友的代碼。</div>';
    if (out.length) h += `<h3>等待對方接受</h3>` + out.map((f) => `<div class="fr"><span class="dot"></span><div class="who"><b>${esc(f.name)}</b><small>已送出邀請 · ${fmtFriend(f.code)}</small></div><button class="btn ghost" data-act="rm" data-id="${esc(f.id)}">取消</button></div>`).join('');
    $('frList').innerHTML = h;
    // the room's ＋ 邀請朋友 pop-up: online friends who are not here yet
    const cand = fr.filter((f) => f.online && f.room !== myRoom);
    $('lbInvFriends').innerHTML = `<h4><i>👥</i>邀請好友</h4>` + (!F.me ? '<div class="fr-empty">還沒有好友 · <button class="btn ghost" data-act="open">加好友</button></div>'
      : cand.length ? cand.slice(0, 6).map((f) => this._friendRow(f, myRoom, true)).join('') : `<div class="fr-empty">${fr.length ? '沒有在線上的好友' : '還沒有好友'} · <button class="btn ghost" data-act="open">好友名單</button></div>`);
  }
  // a friend's invite pops up wherever you are (room, hub, even in a match — press ESC to click it)
  onFriendInvite(inv) {
    if (this.room && this.room.code === inv.room) return;
    const $ = this.$, inMatch = !!this.match && ['playing', 'paused', 'ended'].includes(this.state);
    this.invCard = inv;
    $('invCardTxt').innerHTML = `<b>${esc(inv.name)}</b> 邀請你加入房間 <code>${fmtCode(inv.room)}</code>`;
    $('invCardSub').textContent = inMatch ? '對戰中：按 ESC 再點「加入」（會離開目前的對戰）' : this.room ? '加入後會離開目前的房間' : '45 秒後自動關閉';
    $('invCard').classList.add('on');
    try { this.audio.init(); this.audio.uiClick(); setTimeout(() => this.audio.uiClick(), 150); } catch (e) { /* audio locked until a click */ }
    clearTimeout(this.invT); this.invT = setTimeout(() => this.hideInvite(), 45000);
    if (document.hidden) { this._title = this._title || document.title; document.title = `📨 ${inv.name} 邀請你 · ${this._title}`; }
  }
  hideInvite() { this.$('invCard').classList.remove('on'); this.invCard = null; clearTimeout(this.invT); if (this._title) { document.title = this._title; this._title = null; } }
  // go to a friend's room from anywhere (accepting an invite, or 加入 in the friends list)
  goJoin(code) {
    code = parseCode(code); if (!code) return;
    if (this.room && this.room.code === code && (this.room.role === 'host' || this.room.entered)) { this.roomToast('你已經在這個房間了'); return; }
    if (['loading', 'shot', 'joining', 'returning'].includes(this.state)) { this.roomToast('載入中，請稍後再按一次'); return; }
    if (this.state === 'countdown') { if (this.countGuest) this.guestCountdown(false); else this.cancelCountdown(); }
    this.friendsPanel(false);
    if (this.match) { this._teardownMatch(); this.audio.setAmbience('none'); }
    this.closeRoom(); this.$('lobby').classList.remove('on'); this.state = 'hub';
    this.joinRoom(code);
  }

  /* ------------------------------ lobby ------------------------------ */
  // (STAR_BADGE: the host's five-point star medal, inline SVG)
  buildLobby() {
    const L = Settings.data.lobby, $ = this.$;
    this.dry = MAPS.map((def) => { const b = new MapBuilder(null, def, true); def.build(b); return b; });
    const maps = $('lbMaps');
    MAPS.forEach((def, i) => {
      // v46: the real scene from the map's best angle (assets/maps/thumbs, made by tools/_mapthumbs.mjs); the floor plan if it is missing
      const bt = document.createElement('button'), img = document.createElement('img'); img.className = 'th'; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { const cv = document.createElement('canvas'); cv.width = 176; cv.height = 88; drawMapPreview(cv, def, this.dry[i], { labels: false }); img.replaceWith(cv); };
      img.src = mapThumb(def); bt.append(img, document.createTextNode(`${i + 1}. ${def.name}`));
      bt.onclick = () => { if (this.isGuest()) return; L.map = i; this.audio.init(); this.audio.uiClick(); $('lbMapModal').classList.remove('on'); this.refreshLobby(); this.warm(i); };
      maps.appendChild(bt);
    });
    const pills = (id, items, key, after) => {
      const el = $(id); el.innerHTML = '';
      for (const [val, label] of items) { const b = document.createElement('button'); b.textContent = label; b.dataset.v = val; b.onclick = () => { if (key !== 'loadout' && this.isGuest()) return; L[key] = typeof L[key] === 'number' ? Number(val) : val; if (after) after(); this.audio.init(); this.audio.uiClick(); this.refreshLobby(); }; el.appendChild(b); }
    };
    document.querySelectorAll('#lobby .stepper button').forEach((b) => b.onclick = (e) => {
      e.stopPropagation(); if (this.isGuest()) return;
      const k = b.dataset.step; L[k] = clamp(L[k] + Number(b.dataset.d), 1, 12); this.audio.init(); this.audio.uiClick(); this.refreshLobby();
    });
    // v45 SF2 待機室: map picker pop-up, room 設置 pop-up (pickup / killcam / friendly fire / bot difficulty), dropdowns close on any outside click
    const modal = (id, on) => { $(id).classList.toggle('on', on); if (on) { this.audio.init(); this.audio.uiClick(); } };
    $('lbMapOpen').onclick = () => { if (!this.isGuest()) modal('lbMapModal', true); };
    $('lbMapClose').onclick = () => modal('lbMapModal', false); $('lbOptClose').onclick = () => modal('lbOptModal', false);
    for (const id of ['lbMapModal', 'lbOptModal']) $(id).onclick = (e) => { if (e.target === $(id)) modal(id, false); };
    for (const [id, k] of [['optPickup', 'pickup'], ['optKillcam', 'killcam'], ['optFF', 'ff']]) $(id).onchange = () => { if (this.isGuest()) return; L.opts[k] = $(id).checked; this.audio.uiClick(); this.refreshLobby(); };
    document.addEventListener('click', () => document.querySelectorAll('#lobby .dd.open').forEach((d) => d.classList.remove('open')));
    // F5 = 開始 (the browser refresh is swallowed while the room is open)
    addEventListener('keydown', (e) => { if (e.code === 'F5' && (this.state === 'lobby' || this.state === 'countdown')) { e.preventDefault(); if (e.repeat) return; if (this.state === 'countdown') this.cancelCountdown(); else if (!$('lbMapModal').classList.contains('on')) this.beginCountdown(); } });
    pills('lbLoadout', Settings.data.loadouts.map((l, i) => [i, LOADOUT_KEYS[i]]), 'loadout');
    $('lbWarehouse').onclick = () => this.openWarehouse(); $('lbWh').onclick = () => this.openWarehouse();
    $('whClose').onclick = () => this.closeWarehouse();
    // v27 room bar: ＋ 邀請朋友 opens the invite pop-up (link / code / public), 離開房間 goes back to the hub
    $('lbInvite').onclick = (e) => { e.stopPropagation(); this.audio.init(); this.audio.uiClick(); this.invite(); };
    $('lbInvPop').onclick = (e) => e.stopPropagation();
    document.addEventListener('click', () => { if ($('lbInvPop').classList.contains('on')) this.invite(false); });
    const msg = (t) => { $('lbInvMsg').textContent = t; };
    $('lbInvLink').onclick = () => { if (this.room) this.copyText(inviteLink(this.room.code), (ok) => msg(ok ? '✓ 邀請連結已複製，貼給朋友，對方點開就會進到這個房間' : '無法自動複製：請手動選取上面的連結')); };
    $('lbInvCopy').onclick = () => { if (this.room) this.copyText(this.room.code, (ok) => msg(ok ? '✓ 房間代碼已複製：朋友在大廳按「加入房間」輸入這 6 個數字' : '無法自動複製：請直接把這 6 個數字告訴朋友')); };
    $('lbInvLinkTxt').onfocus = () => $('lbInvLinkTxt').select();
    $('lbPub').onchange = () => { if (this.room && this.room.role === 'host') this.room.setPublic($('lbPub').checked); };
    $('lbLeave').onclick = () => this.leaveRoom();
    $('lbJoinA').onclick = () => { if (this.isGuest()) { this.audio.uiClick(); this.room.setTeam('alpha'); } };
    $('lbJoinB').onclick = () => { if (this.isGuest()) { this.audio.uiClick(); this.room.setTeam('bravo'); } };
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
    const $ = this.$, r = this.room, guest = this.isGuest(), L = this.roomCfg(), R = RULES[L.rule];
    const def = MAPS[L.map];
    $('lobby').classList.toggle('guest', guest);
    const big = $('lbMapImg'); if (big.dataset.id !== def.id) { big.dataset.id = def.id; big.classList.remove('miss'); big.src = mapThumb(def); }
    if (big.classList.contains('miss')) drawMapPreview($('lbMapBig'), def, this.dry[L.map]);
    if (guest && this.warmMap !== L.map) { this.warmMap = L.map; this.warm(L.map); } // the host picked another map: prefetch it
    $('lbMapName').textContent = `${def.name} · ${def.en}`;
    [...$('lbMaps').children].forEach((b, i) => b.classList.toggle('on', i === L.map));
    const mark = (id, val) => [...$(id).children].forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(val)));
    mark('lbLoadout', L.loadout);
    const rc = L.ruleCfg[L.rule] || (L.ruleCfg[L.rule] = Object.assign({}, R.def)), roundsLike = R.timeUnit === 'sec';
    if (!R.targets.includes(rc.target)) rc.target = R.def.target;
    rc.time = R.def.time; // v45: no time option — score modes are untimed, round modes cap each round at 10 minutes
    $('lbTitle').textContent = `${R.name} - ${def.name}`;
    const opts = L.opts || (L.opts = { pickup: true, killcam: true, ff: false });
    $('optPickup').checked = opts.pickup !== false; $('optKillcam').checked = opts.killcam !== false; $('optFF').checked = !!opts.ff;
    // the six SF2 room settings: map · win condition · weapon mode | game mode · N vs N · 設置
    const host = () => !this.isGuest();
    this._dd('ddMap', '地圖', def.name, null, () => { if (host()) { $('lbMapModal').classList.add('on'); this.audio.uiClick(); } });
    this._dd('ddTarget', roundsLike ? '勝負局數' : '勝利分數', roundsLike ? `${rc.target}先勝` : `${rc.target} 分`,
      R.targets.map((v) => [v, roundsLike ? `${v}先勝` : `${v} 分`]), (v) => { if (host()) { rc.target = +v; this.refreshLobby(); } }, rc.target);
    this._dd('ddMode', '武器限制', MODES[L.mode].name, Object.entries(MODES).map(([k, m]) => [k, m.name]), (v) => { if (host()) { L.mode = v; this.refreshLobby(); } }, L.mode);
    this._dd('ddRule', '模式', R.name, Object.entries(RULES).map(([k, r]) => [k, r.name]), (v) => {
      if (!host()) return; L.rule = v; if (!L.ruleCfg[v]) L.ruleCfg[v] = Object.assign({}, RULES[v].def); this.refreshLobby();
    }, L.rule);
    this._dd('ddDiff', '難易度', DIFFICULTY[L.difficulty].name, DIFFICULTY.map((d, i) => [i, d.name]), (v) => { if (host()) { L.difficulty = +v; this.refreshLobby(); } }, L.difficulty);
    $('lbAllies').textContent = L.allies; $('lbEnemies').textContent = L.enemies;
    this._dd('ddOpts', '進階', '設置', null, () => { if (host()) { $('lbOptModal').classList.add('on'); this.audio.uiClick(); } });
    const lo = Settings.data.loadouts[L.loadout];
    $('lbLoadoutInfo').textContent = `配裝 ${LOADOUT_KEYS[L.loadout]}：${WEAPON_DEFS[lo.primary].name} + ${WEAPON_DEFS[lo.secondary].name}`;
    [...$('lbLoadout').children].forEach((b, i) => { b.title = `配裝 ${LOADOUT_KEYS[i]} · 對戰中按 F${i + 1}`; });
    $('lbMeName').textContent = Settings.data.nick || 'YOU'; $('lbMeGun').textContent = `配裝 ${LOADOUT_KEYS[L.loadout]} · ${WEAPON_DEFS[lo.primary].name}`;
    this._lbStage();
    this.renderTeams(L); this.renderRoomBar(L); this.renderChat();
    if (!guest) Settings.save();
    if (r && r.role === 'host') r.broadcast();
  }
  // v45 SF2-style dropdown: a labelled button with ▲; items = [[value, label]] (null = the button opens a pop-up instead)
  _dd(id, label, value, items, pick, cur) {
    const el = this.$(id);
    el.innerHTML = `<button><small>${label}</small><span>${esc(String(value))}</span><i>▲</i></button>${items ? `<div class="ddl">${items.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${esc(String(t))}</button>`).join('')}</div>` : ''}`;
    el.firstChild.onclick = (e) => {
      e.stopPropagation(); this.audio.init(); this.audio.uiClick();
      if (!items) { pick(); return; }
      if (this.isGuest()) return;
      const was = el.classList.contains('open'); document.querySelectorAll('#lobby .dd.open').forEach((d) => d.classList.remove('open')); el.classList.toggle('open', !was);
    };
    if (items) el.querySelectorAll('.ddl button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); el.classList.remove('open'); this.audio.uiClick(); pick(b.dataset.v); }; });
  }
  // v45 left panel: your soldier (same model as in a match) holding the chosen set's primary, slowly turning
  _lbStage() {
    const cv = this.$('lbCharCv');
    if (!this.lbR) {
      try {
        const r = this.lbR = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
        r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3; r.outputColorSpace = THREE.SRGBColorSpace;
        const sc = this.lbScene = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
        sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
        const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(2, 3, 4); sc.add(key);
        const rim = new THREE.DirectionalLight(0x9fc4ff, 2.0); rim.position.set(-3, 2, -3); sc.add(rim); sc.add(new THREE.HemisphereLight(0xdfe8f2, 0x302c28, 0.8));
        this.lbCam = new THREE.PerspectiveCamera(26, 1, 0.05, 30); this.lbT = 0;
      } catch (e) { console.warn('room preview unavailable', e); this.lbR = false; }
    }
    if (!this.lbR) return;
    const L = Settings.data.lobby, id = Settings.data.loadouts[L.loadout].primary, model = WEAPON_DEFS[id].model || id;
    const team = this.room && this.room.team === 'bravo' ? 'bravo' : 'alpha';
    if (!this.lbSoldier || this.lbTeam !== team) { if (this.lbSoldier) this.lbScene.remove(this.lbSoldier.root); this.lbSoldier = this.soldiers.create(team, model); this.lbScene.add(this.lbSoldier.root); this.lbTeam = team; this.lbGun = model; }
    else if (this.lbGun !== model) { this.soldiers.setWeapon(this.lbSoldier, model); this.lbGun = model; }
  }
  _renderLobbyStage(dt) {
    if (!this.lbR || !this.lbSoldier || !this.$('lobby').classList.contains('on')) return;
    const r = this.lbR, cam = this.lbCam, cv = this.$('lbCharCv'), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) r.setSize(w, h, false);
    cam.aspect = w / h; cam.position.set(0, 1.0, 5.3); cam.lookAt(0, 0.86, 0); cam.updateProjectionMatrix(); // full figure; the translucent chat covers the legs
    this.lbT += dt; this.lbSoldier.root.rotation.y = Math.PI + 0.55 + Math.sin(this.lbT * 0.4) * 0.35;
    r.render(this.lbScene, cam);
  }
  // v27: real players first (their room status on the right), bots fill each team up to its size, then empty slots
  renderTeams(L) {
    const $ = this.$, r = this.room, myId = r ? r.myId : 'me';
    const members = r ? r.members : [{ id: 'me', name: Settings.data.nick || 'YOU', team: 'alpha', host: true, st: 'room', order: 0 }];
    const canSwitch = !!r && r.role === 'guest' && r.entered && r.phase === 'room';
    for (const [team, list, size, lbl, sw] of [['alpha', 'lbListA', L.allies, 'lbAllyLbl', 'lbJoinA'], ['bravo', 'lbListB', L.enemies, 'lbEnemyLbl', 'lbJoinB']]) {
      const hs = members.filter((m) => m.team === team).sort((a, b) => a.order - b.order), n = Math.max(size, hs.length), ol = $(list), names = BOT_NAMES[team];
      ol.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const li = document.createElement('li'), h = hs[i];
        if (h) {
          const me = h.id === myId; li.className = 'human' + (me ? ' you' : '');
          li.innerHTML = `<span class="n">${i + 1}</span><span class="rank">${h.host ? STAR_BADGE : 'P'}</span><span class="nm">${esc(h.name)}</span>${h.host || !ROOM_ST[h.st] ? '' : `<span class="st ${h.st}">${ROOM_ST[h.st]}</span>`}`;
        } else if (i < n) { li.className = 'bot'; li.innerHTML = `<span class="n">${i + 1}</span><span class="rank">AI</span><span class="nm">${names[(i - hs.length) % names.length]}</span>`; }
        else { li.className = 'empty'; li.innerHTML = `<span class="n">${i + 1}</span>`; }
        ol.appendChild(li);
      }
      void lbl;
      $(sw).style.display = canSwitch && r.team !== team ? '' : 'none';
    }
  }
  renderRoomBar(L = this.roomCfg()) {
    const $ = this.$, r = this.room, guest = this.isGuest();
    let code = '', name = '單機練習房', st = '等待中';
    if (r) {
      const h = r.members.find((m) => m.host); name = `${h ? h.name : '房主'} 的房間`;
      if (r.online || guest) code = fmtCode(r.code);
      if (r.role === 'host' && !r.online) st = r.failed ? '離線房間 · 連不上配對伺服器，只能單機' : '房間建立中…';
      else if (guest && !r.entered) st = '重新連線中…';
      else st = r.phase === 'playing' ? '對戰進行中' : r.members.length > 1 ? `${r.members.length} 人在房間` : '等待朋友加入';
    }
    if (this.state === 'countdown') st = '準備出發';
    $('lbCodeTxt').textContent = code || '——— ———'; void name; void st;
    $('lbInvite').disabled = !(r && r.online && code);
    $('lbInvCode').textContent = code; $('lbInvLinkTxt').value = r ? inviteLink(r.code) : '';
    $('lbPub').checked = !!(r && r.pub); $('lbPubRow').style.display = r && r.role === 'host' ? '' : 'none';
    const sb = $('lbStart'); let txt = '開始 (F5)', off = false, msg = '';
    if (guest) { if (r.phase === 'playing' && r.mcfg) txt = '加入對戰 (F5)'; else { txt = '等待房主開始'; off = true; msg = r.entered ? '地圖和模式由房主設定 · 你可以選擇隊伍和配裝' : ''; } }
    sb.textContent = txt; sb.disabled = off; sb.classList.toggle('wait', off); void msg;
    this.renderFriends(); // invite buttons depend on our room
  }

  beginCountdown() {
    if (this.state !== 'lobby') return;
    const r = this.room;
    if (r && r.role === 'guest') { if (r.phase === 'playing' && r.mcfg) { this.audio.init(); this.audio.uiClick(); this.startGuestMatch(); } return; } // drop into the running match
    if (this.$('lbStart').disabled) return;
    this.audio.init(); this.audio.uiClick(); this.invite(false);
    if (r && r.role === 'host') r.countdown(); // everyone in the room sees the same 3-2-1
    this.state = 'countdown'; this.countT = 3;
    const def = MAPS[Settings.data.lobby.map];
    this.$('lbCountMap').textContent = `${def.name} · ${MODES[Settings.data.lobby.mode].name} · ${RULES[Settings.data.lobby.rule].name}`;
    this.$('lbCount').classList.add('on');
    this._showCount(3);
  }
  _showCount(n) { const el = this.$('lbCountNum'); el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.audio.uiClick(); }
  cancelCountdown() {
    if (this.state !== 'countdown' || this.countGuest) return;
    this.state = 'lobby'; this.$('lbCount').classList.remove('on'); this.audio.uiClick();
    if (this.room && this.room.role === 'host') this.room.cancel();
    this.renderRoomBar();
  }

  /* ------------------------------ loading ------------------------------ */
  async startMatch(net = null) {
    const $ = this.$, L = net ? Object.assign({}, Settings.data.lobby, net.cfg) : Settings.data.lobby, def = MAPS[L.map];
    if (!net && this.room && this.room.role === 'host') this.room.go(roomCfgOut()); // v27: everyone in the room starts loading this match now
    this.state = 'loading'; this.countGuest = false;
    this.cmds.reset();
    $('lbCount').classList.remove('on'); $('lobby').classList.remove('on'); $('hub').classList.remove('on'); $('warehouse').classList.remove('on'); $('settings').classList.remove('on');
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
    if (net) { // v27: wait until the host's match takes us in (it may still be building its map)
      this.loadTarget = Math.max(this.loadTarget, 0.88); this.loadLabel = '等待房主進入戰場';
      const w = await Promise.race([net.welcomed, sleep(45000).then(() => ({ reject: '房主沒有回應' }))]);
      if (this.match !== m) return;
      if (w.reject) { this.abortNetMatch(w.reject); return; }
      net.attach(m);
    } else if (this.netHostRoom) new NetHost(this, m, new LoopbackTransport(this.netHostRoom, this.netOpts)); // v25: friends in the same browser can join this match
    else this.attachHost(); // v27: the room's friends join this match
    this.audio.setAcoustics(ACOUSTICS[def.acoustics] || ACOUSTICS.outdoor); this.audio.setAmbience(def.ambience);
    // cinematic "screenshot" of the real map behind the loading text
    this.state = 'shot'; this.shotT = 0; ld.classList.add('shot'); this.loadTarget = 1; this.loadLabel = '即將部署';
    await sleep(1700);
    if (this.state !== 'shot') return;
    ld.classList.remove('on', 'shot');
    this.hud.reset(); this.hud.show(true); this.hud.setWeapon(m.weapons);
    this.state = 'playing'; this.last = performance.now();
    if (this.room) this.room.status('playing');
    this.input.lock();
  }

  // after a match: back to the room (v27: the room and its friends are still there), or to the hub without one
  async returnToLobby() {
    const $ = this.$, r = this.room;
    if (this.state === 'returning') return;
    this.state = 'returning';
    clearInterval(this.endTimer);
    $('endscreen').classList.remove('on'); $('pause').classList.remove('on'); $('settings').classList.remove('on');
    this.input.unlock(); this.hud.show(false);
    const ld = $('loader'); ld.classList.add('on'); ld.classList.remove('shot');
    $('ldTitle').firstChild.textContent = 'RETURNING'; $('ldSub').textContent = r ? '返回房間中…' : '返回大廳中…'; $('ldTip').textContent = '提示：' + pick(TIPS); $('ldSlogan').textContent = r ? 'ROOM ' + fmtCode(r.code) : 'LOBBY';
    this.loadShown = 0; this.loadTarget = 1; this.loadLabel = '結算戰績';
    await sleep(900);
    this._teardownMatch();
    if (this.room) { if (this.room.role === 'host') this.room.matchOver(); this.room.status('room'); } else this.bgTick.set(false);
    this.audio.setAmbience('none');
    await sleep(700);
    ld.classList.remove('on');
    if (this.room) { this.enterRoomScreen(); if (this.goPending) { this.goPending = false; this.startGuestMatch(); } }
    else { this.showHub(this.pendingMsg || ''); this.pendingMsg = ''; }
  }
  _teardownMatch() {
    const $ = this.$; clearInterval(this.endTimer); this.closeChat(); $('chatlog').replaceChildren();
    for (const id of ['endscreen', 'pause', 'settings', 'lbCount']) $(id).classList.remove('on');
    this.input.unlock(); this.hud.show(false);
    if (this.match) { if (this.match.net) this.match.net.close(); this.match.dispose(); this.match = null; }
    this.netClient = null; if (this.room) this.room.dropLink();
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
      if ((this.state === 'lobby' || this.state === 'hub') && code === 'Escape') {
        if (this.$('warehouse').classList.contains('on')) { this.closeWarehouse(); return; }
        if (this.$('lbInvPop').classList.contains('on')) { this.invite(false); return; }
        if (this.$('friends').classList.contains('on')) { this.friendsPanel(false); return; }
      }
      const fk = /^F([1-3])$/.exec(code);
      if (fk && m && (this.state === 'playing' || this.state === 'paused')) { m.queueLoadout(parseInt(fk[1], 10) - 1); return; } // works while dead too
      if (this.state === 'playing' && m && (code === 'Enter' || code === 'NumpadEnter') && this.room && this.room.online) { this.openChat(false); return; } // v31: chat (Tab in the box: team only)
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
      else if (this.state === 'playing' && this.match && this.match.phase !== 'over') { this.closeChat(); this.state = 'paused'; this.$('pause').classList.add('on'); if (this.match) this.match.weapons.trigger = false; this.cmds.reset(); this.updatePauseOnline(); }
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
    { const hs = $('optHit'); for (const [k, v] of Object.entries(HIT_SOUNDS)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; hs.append(o); }
      if (!HIT_SOUNDS[S.hitSound]) S.hitSound = 'flesh';
      const demo = () => { this.audio.init(); AudioEngine.loadSamples(); [0, 260, 520].forEach((d, i) => setTimeout(() => this.audio.hit(['body', 'head', 'kill'][i]), d)); };
      sel('optHit', 'hitSound', demo); $('optHitPlay').addEventListener('click', demo); } // v38: preview body → head → kill on change
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
    if (this.room) { if (this.room.role === 'host') { this.room.phase = 'room'; this.room.mcfg = null; } this.room.status('ended'); } // nobody can join an ended match
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
    document.documentElement.style.setProperty('--lz', clamp(Math.min(innerWidth / 1480, innerHeight / 910), 0.2, 1.4).toFixed(3));
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

  // v45 F1–F3: the three sets as cards in the middle of the screen (SF2), the picked one lit; fades out after ~2 s
  showLoadoutPicker(pick, cur) {
    const el = this.$('loPick'), LO = Settings.data.loadouts;
    if (!this.whR) this._initPreview();
    this._makeThumbs([...LO.flatMap((l) => [l.primary, l.secondary]), 'he', 'smoke', 'flash']);
    const img = (id) => { const src = (this.thumbs && this.thumbs[id]) || WEAPON_ICONS[id] || ''; return src ? `<img src="${src}" alt="">` : ''; };
    el.innerHTML = LO.map((l, i) => `<div class="lp${i === pick ? ' on' : ''}${i === cur ? ' cur' : ''}">
      <div class="g p">${img(l.primary)}<span>${WEAPON_DEFS[l.primary].name}</span></div>
      <div class="g s">${img(l.secondary)}<span>${WEAPON_DEFS[l.secondary].name}</span></div>
      <div class="n">${['he', 'smoke', 'flash'].map((g) => `<div>${img(g)}<span>${WEAPON_DEFS[g].name}</span></div>`).join('')}</div>
      <b>${LOADOUT_KEYS[i]} TYPE</b><small>${i === cur ? '使用中' : i === pick ? '下次重生換上' : `F${i + 1}`}</small></div>`).join('');
    el.classList.remove('fade'); el.classList.add('on'); void el.offsetWidth;
    clearTimeout(this.loPickT); this.loPickT = setTimeout(() => el.classList.add('fade'), 1700);
  }

  /* ------------------------------ warehouse (loadouts) ------------------------------ */
  // v24: the armory is its own page — the room screen is hidden while it is open (it was a pop-up over the room).
  openWarehouse() {
    const $ = this.$, L = Settings.data.lobby;
    this.audio.init(); this.audio.uiClick();
    this.wh = this.wh || { slot: L.loadout, cat: 'primary', sel: null, filter: 'all', q: '', page: -1 };
    this.wh.slot = L.loadout; this.wh.sel = Settings.data.loadouts[this.wh.slot][this.wh.cat]; this.wh.page = -1; // -1 = the page showing the equipped gun
    this.whFrom = this.state === 'hub' ? 'hub' : 'lobby'; this.invite(false);
    $('lobby').classList.remove('on'); $('hub').classList.remove('on'); $('warehouse').classList.add('on');
    if (!this.whR) this._initPreview();
    this.renderWarehouse();
  }
  closeWarehouse() {
    const back = this.whFrom === 'hub' && this.state === 'hub' ? 'hub' : 'lobby';
    this.$('warehouse').classList.remove('on'); this.$(back).classList.add('on'); Settings.save(); this.audio.uiClick();
    if (back === 'lobby') this.refreshLobby();
  }
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
    // loadout sets A–C (no names)
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
      const inSet = LO.findIndex((l) => l[W.cat] === id); // v45: a primary shows 裝備中 whichever set (A–C) carries it
      c.className = 'whGun' + (inSet >= 0 && (W.cat === 'primary' || inSet === W.slot) ? ' eq' : '') + (W.sel === id ? ' sel' : ''); c.dataset.id = id;
      if (inSet >= 0) c.dataset.eq = LOADOUT_KEYS[inSet];
      const th = this.thumbs && this.thumbs[id] ? `<img src="${this.thumbs[id]}" alt="">` : WEAPON_ICONS[id] ? `<img class="ln" src="${WEAPON_ICONS[id]}" alt="">` : '';
      c.innerHTML = `<div class="nm">${WEAPON_DEFS[id].name}</div><div class="th">${th}</div><span class="cls">${TYPE_LABEL[WEAPON_DATABASE[id].type]}</span>`;
      c.onmouseenter = () => { if (W.sel !== id) { W.sel = id; this._whInfo(); } };
      c.onclick = () => {
        const other = W.cat === 'primary' ? LO.findIndex((l, i) => i !== W.slot && l.primary === id) : -1; // one primary belongs to one set only
        if (other >= 0) { this.roomToast(`${WEAPON_DEFS[id].name} 已裝備在 ${LOADOUT_KEYS[other]} 配裝`); this.audio.uiClick(); return; }
        LO[W.slot][W.cat] = id; W.sel = id; Settings.save(); this.audio.uiClick(); this.renderWarehouse();
      };
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
    if (this.state === 'lobby' || this.state === 'hub') { this._renderPreview(dt); if (this.state === "lobby") this._renderLobbyStage(dt); if (this.thumbQ && this.thumbQ.length && performance.now() > this.thumbStart) this._pumpThumb(); }
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fpsText = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`; this.fpsAcc = 0; this.fpsFrames = 0; }
    const mouse = this.input.consumeMouse(this._mouse);
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.countT); this.countT -= dt; const cur = Math.ceil(this.countT);
      if (cur !== prev && cur > 0) this._showCount(cur);
      if (this.countGuest) { if (this.countT < -6) this.guestCountdown(false); } // a guest waits for the host's start (rgo)
      else if (this.countT <= 0) this.startMatch();
    }
    if (this.loadShown !== undefined) {
      this.loadShown = damp(this.loadShown, this.loadTarget, 5, dt);
      const pct = Math.round(this.loadShown * 100);
      this.$('ldFill').style.width = pct + '%'; this.$('ldPct').textContent = pct + '%'; this.$('ldStep').textContent = this.loadLabel;
    }
    const m = this.match;
    if (m && m.running) {
      const netLive = this.netShared(m) && this.state === 'paused' && m.phase !== 'over'; // v26: an online match never pauses — your soldier just stands still
      if (this.state === 'playing' || netLive) {
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
        const rm = this.room, nt = rm && rm.online && this.netShared(m) ? ` · 房間 ${fmtCode(rm.code)} · ${m.net.role === 'host' ? m.net.players + ' 人' : m.net.rttWin && m.net.rttWin.length >= 3 ? Math.round(m.net.rtt) + ' ms' : '測量延遲中'}${rm.t && rm.t.via === 'relay' ? ' · 中繼' : ''}` : '';
        this.hud.setFps(`${this.fpsText} · ${this.gpuShort}${this.gpuIntegrated ? '（內顯）' : ''}${nt}`, Settings.data.showFps || !!nt);
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
        const idle = this.state !== 'playing' && !netLive;
        if (!idle || now - (this.idleDrawT || 0) > 100) {
          this.idleDrawT = now;
          const showVM = m.player.alive && m.weapons.current.vm.group.visible && this.state !== 'ended';
          const rt0 = performance.now(); this.post.render(this.state === 'playing' || netLive ? dt : 0, showVM); if (m.prof) m.prof.add('render', performance.now() - rt0);
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
  window.SF2net = { Friends, NetHost, NetClient, LoopbackTransport, NetCodec, RoomDirectory, RtcHostTransport, RtcClientTransport, BackgroundTicker, RoomHost, RoomGuest, RoomLink, inviteLink, parseCode, fmtCode, roomCode, roomCfgSafe, ONLINE, host: (room, o = {}) => new NetHost(app, app.match, new LoopbackTransport(room, o)), join: (room, o = {}) => app.netJoin(room, o) }; // v25 tests
  window.__gameReady = true;
  document.getElementById('boot').classList.add('done');
} catch (e) {
  console.error(e);
  window.__bootErr('初始化失敗: ' + (e && e.message ? e.message : e));
}
</script>
</body>
</html>

/* =====================================================================
   GAME RULES — state machine per mode. The Match drives the phases
   (freeze → live → roundEnd → over) and delegates every mode-specific
   decision to one Rule object:
     TDMRule        team deathmatch, 3 s respawn, first to N points
     RoundsRule     elimination rounds, no respawn inside a round
     RelicRule      Capture the Relic (Blue attacks / Red defends)
     DomRule        Tactical Domination A/B/C, hold E for 6 s
   ===================================================================== */
const TEAM_HEX = { alpha: 0x3f8cff, bravo: 0xff4a3d, none: 0xdedede };
const TEAM_CSS = { alpha: '#63b3ff', bravo: '#ff5d52', none: '#d8d8d8' };
const CAPTURE_TIME = 6;

class Rule {
  constructor(m) { this.m = m; }
  get roundBased() { return false; }
  get respawns() { return !this.roundBased; }
  init() {}
  startRound() {}
  canScore(team) { return true; }
  killTeamPoints(pts) { return pts; }
  onDeath(c) {}
  tick(dt) {}
  check() {}
  timeUp() {}
  botGoal(bot) { return null; }
  markers(out) { return out; }
  hudState() { return null; }
  interactPressed(c) {}
  dispose() {}
  // Designer point → ground position (moved to the nearest open nav node if it sits inside geometry).
  place(p) {
    const m = this.m, v = new THREE.Vector3(p[0], p[1], p[2]);
    if (m.collision.terrain) v.y = Math.max(v.y, m.collision.terrain.heightAt(v.x, v.z)); // designer y may sit under a slope
    const g = m.collision.groundBelow(v.x, v.y + 0.7, v.z, 0.25, 1.6);
    const gy = g ? g.y : v.y;
    if (m.collision.fits(v.x, gy + 0.05, v.z, 0.35, 1.7)) return { pos: v, base: gy }; // open spot (base may be a pedestal)
    const s = m.nav.snap(v); return { pos: s, base: s.y };
  }
}

class TDMRule extends Rule {
  check() {
    const m = this.m;
    if (m.score.alpha >= m.target || m.score.bravo >= m.target) m.endMatch(m.score.alpha >= m.target ? 'alpha' : 'bravo');
  }
  timeUp() { const m = this.m; m.endMatch(m.score.alpha === m.score.bravo ? null : m.score.alpha > m.score.bravo ? 'alpha' : 'bravo'); }
}

class RoundsRule extends Rule {
  get roundBased() { return true; }
  check() {
    const m = this.m, a = m.aliveCount('alpha'), b = m.aliveCount('bravo');
    if (a === 0 || b === 0) m.endRound(a === 0 && b === 0 ? null : a === 0 ? 'bravo' : 'alpha', a === 0 && b === 0 ? '雙方同歸於盡' : '全員殲滅');
  }
  timeUp() {
    const m = this.m, a = m.aliveCount('alpha'), b = m.aliveCount('bravo');
    let w = a > b ? 'alpha' : b > a ? 'bravo' : null;
    if (!w) { let ha = 0, hb = 0; for (const c of m.combatants) if (c.alive) { if (c.team === 'alpha') ha += c.hp; else hb += c.hp; } w = ha > hb ? 'alpha' : hb > ha ? 'bravo' : null; }
    m.endRound(w, '時間到 · 存活人數判定');
  }
}

/* ------------------------------------------------------------------
   CAPTURE THE RELIC — Red (bravo) defends the relic in the ruins,
   Blue (alpha) must pick it up (E) and carry it to the extraction
   zone that appears at the Blue spawn. Carrier dies → relic drops;
   defenders touching a dropped relic return it (auto-return 25 s).
   ------------------------------------------------------------------ */
class RelicRule extends RoundsRule {
  constructor(m) { super(m); this.attack = 'alpha'; this.defend = 'bravo'; }
  init() {
    const m = this.m, o = m.def.objectives || {}, z = m.builder.zones.alpha;
    const r = this.place(o.relic || [0, 0, 0]);
    this.home = new THREE.Vector3(r.pos.x, r.base + 0.55, r.pos.z);
    const ex = this.place([(z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2]);
    this.extract = ex.pos.clone(); this.extract.y = ex.base; this.extractR = 4.5;
    this._buildVisuals();
    this.startRound();
  }
  _buildVisuals() {
    const m = this.m, g = this.group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa630, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.25 });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), gold); core.scale.set(1, 1.45, 1); core.castShadow = true;
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.45).multiplyScalar(1.6) });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 40), ringMat), r2 = r1.clone(); r2.rotation.x = Math.PI / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.app.tex.dot(), color: new THREE.Color(1, 0.75, 0.35).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.8, 1.8, 1);
    g.add(core, r1, r2, glow); this.core = core; this.r1 = r1; this.r2 = r2;
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 60, 16, 1, true), beamMat); this.beam.userData.noAO = true;
    const ex = this.exGroup = new THREE.Group(); ex.position.copy(this.extract);
    const exMat = new THREE.MeshBasicMaterial({ color: 0x46a8ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.extractR - 0.3, this.extractR, 72), exMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(this.extractR, this.extractR, 7, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x3f9cff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    col.position.y = 3.5; ex.add(ring, col); ex.visible = false; this.exRing = ring;
    for (const o of [g, this.beam, ex]) { o.traverse((c) => { c.userData.noAO = true; }); m.scene.add(o); }
  }
  startRound() {
    this.state = 'home'; this.carrier = null; this.pos = this.home.clone(); this.dropT = 0; this.ping = null; this.pingT = 0; this.pressed = new Set();
    for (const c of this.m.combatants) c.carrying = false;
  }
  interactPressed(c) { this.pressed.add(c); }
  _pickup(c) {
    const m = this.m;
    this.state = 'carried'; this.carrier = c; c.carrying = true; this.pingT = 0;
    m.audio.objective('pickup');
    const mine = c.team === m.player.team;
    m.app.hud.announce(c.isPlayer ? '你拿到聖物了！' : mine ? '我方奪得聖物' : '敵方奪走了聖物！', c.isPlayer ? '衝回藍色撤離點' : `${c.name} 正在撤離`);
    c.score += POINTS.relic / 2;
    if (c.isPlayer) m.app.hud.points(`+${POINTS.relic / 2}  奪取聖物`);
  }
  _drop(at) {
    const m = this.m, g = m.collision.groundBelow(at.x, at.y + 1, at.z, 0.2, 30);
    if (this.carrier) this.carrier.carrying = false;
    this.state = 'dropped'; this.carrier = null; this.dropT = 25;
    this.pos.set(at.x, (g ? g.y : at.y) + 0.55, at.z);
    m.audio.objective('drop'); m.app.hud.announce('聖物掉落！', '防守方觸碰即可歸位 · 25 秒後自動歸位');
  }
  _return(by) {
    const m = this.m;
    this.state = 'home'; this.pos.copy(this.home); this.carrier = null;
    m.audio.objective(by && by.team === m.player.team ? 'capture' : 'lost');
    m.app.hud.announce('聖物已歸位', by ? `${by.isPlayer ? '你' : by.name} 奪回了聖物` : '自動歸位');
    if (by) { by.score += 100; if (by.isPlayer) m.app.hud.points('+100  奪回聖物'); }
  }
  onDeath(c) { if (this.carrier === c) this._drop(c.motor.pos.clone()); }
  tick(dt) {
    const m = this.m, t = m.time;
    // visuals
    this.core.rotation.y += dt * 1.6; this.r1.rotation.z += dt * 1.1; this.r2.rotation.y += dt * 0.8;
    let vis = this.pos;
    if (this.state === 'carried' && this.carrier) {
      const c = this.carrier; vis = TMP_V1.set(c.motor.pos.x, c.motor.pos.y + 2.25, c.motor.pos.z);
      this.group.visible = !c.isPlayer; this.pos.copy(c.motor.pos);
    } else this.group.visible = true;
    this.group.position.set(vis.x, vis.y + Math.sin(t * 2.2) * 0.07, vis.z);
    this.beam.visible = this.state !== 'carried'; this.beam.position.set(this.pos.x, this.pos.y + 30, this.pos.z);
    this.exGroup.visible = this.state === 'carried'; this.exRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
    if (m.phase !== 'live') { this.pressed.clear(); return; }
    // carrier reached the extraction zone
    if (this.state === 'carried') {
      const c = this.carrier;
      this.pingT -= dt; if (this.pingT <= 0) { this.pingT = 2.5; this.ping = c.motor.pos.clone(); } // relic beacon: everybody sees where it is every 2.5 s
      if (Math.hypot(c.motor.pos.x - this.extract.x, c.motor.pos.z - this.extract.z) < this.extractR && Math.abs(c.motor.pos.y - this.extract.y) < 3) {
        c.score += POINTS.relic; if (c.isPlayer) m.app.hud.points(`+${POINTS.relic}  聖物撤離`);
        m.score[c.team] += POINTS.relic; m.audio.objective('extract'); c.carrying = false;
        this.state = 'extracted'; m.endRound(this.attack, '聖物成功撤離'); return;
      }
    } else if (this.state === 'dropped') { this.dropT -= dt; if (this.dropT <= 0) { this._return(null); } }
    // pickup / return
    if (this.state === 'home' || this.state === 'dropped') {
      for (const c of m.combatants) {
        if (!c.alive) continue;
        const d = Math.hypot(c.motor.pos.x - this.pos.x, c.motor.pos.z - this.pos.z), dy = Math.abs(c.motor.pos.y + 0.9 - this.pos.y);
        if (d > 1.8 || dy > 2.2) continue;
        if (c.team === this.attack && (this.pressed.has(c) || c.holdE)) { this._pickup(c); break; }
        if (c.team === this.defend && this.state === 'dropped') { this._return(c); break; }
      }
    }
    this.pressed.clear();
  }
  check() { super.check(); }
  timeUp() { this.m.endRound(this.defend, '時間到 · 防守成功'); }
  botGoal(bot) {
    const st = this.state, i = bot.idx;
    if (bot.team === this.attack) {
      if (st === 'carried' && this.carrier === bot) return { pos: this.extract, radius: this.extractR, action: 'extract', urgent: true };
      if (st === 'carried') return i % 2 ? { pos: this.carrier.motor.pos, radius: 7, action: 'guard', urgent: true } : { pos: this.extract, radius: 6, action: 'guard' };
      return { pos: this.pos, radius: 1.5, action: 'pickup', urgent: st === 'dropped' };
    }
    if (st === 'dropped') return { pos: this.pos, radius: 1.3, action: 'pickup', urgent: true };
    if (st === 'carried') return this.ping ? { pos: this.ping, radius: 5, action: 'chase', urgent: true } : null;
    return i % 3 === 2 ? null : { pos: this.home, radius: 11, action: 'guard' }; // most defenders guard the ruins, some roam the lanes
  }
  markers(out) {
    const m = this.m, p = m.player, carried = this.state === 'carried';
    if (!(carried && this.carrier === p)) out.push({ pos: carried ? this.carrier.motor.pos.clone().setY(this.carrier.motor.pos.y + 2.4) : this.pos.clone(), label: '◆', sub: carried ? (this.carrier.team === p.team ? '護送' : '攔截') : this.state === 'dropped' ? `掉落 ${Math.ceil(this.dropT)}s` : '聖物', color: '#ffc860' });
    if (carried) out.push({ pos: this.extract, label: '⬆', sub: '撤離點', color: '#63b3ff' });
    return out;
  }
  hudState() {
    const m = this.m, p = m.player, st = this.state, atk = p.team === this.attack;
    let text = '';
    if (st === 'home') text = atk ? '進攻：前往山丘遺跡奪取聖物（按 E 拿起）' : '防守：守住山丘遺跡的聖物';
    else if (st === 'carried') text = this.carrier === p ? '你持有聖物 · 衝回藍色撤離點！' : this.carrier.team === p.team ? `${this.carrier.name} 持有聖物 · 掩護撤離` : `${this.carrier.name} 奪走聖物 · 攔截他！`;
    else if (st === 'dropped') text = `聖物掉落 · ${Math.ceil(this.dropT)} 秒後歸位`;
    let prompt = '';
    if (p.alive && p.team === this.attack && (st === 'home' || st === 'dropped') && Math.hypot(p.motor.pos.x - this.pos.x, p.motor.pos.z - this.pos.z) < 1.8) prompt = '按 [E] 拿起聖物';
    return { kind: 'relic', text, prompt, role: atk ? '進攻方' : '防守方' };
  }
  dispose() { this.carrier = null; }
}

/* ------------------------------------------------------------------
   TACTICAL DOMINATION — three zones. Stand inside a zone and HOLD E
   for exactly 6 s; leaving, dying or releasing E resets progress
   (an enemy inside pauses it). Owned zones tick team points every
   2 s. If one team owns ALL THREE zones the other team is locked out
   of scoring ANY points (kills included) until it retakes one.
   ------------------------------------------------------------------ */
class DomZone {
  constructor(rule, id, pos, base, radius) {
    this.rule = rule; this.id = id; this.pos = pos; this.base = base; this.r = radius; this.owner = null; this.contested = false; this.capTeam = null; this.capK = 0;
    const m = rule.m, g = this.group = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z);
    const pOff = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false, transparent: true };
    this.ringMat = new THREE.MeshBasicMaterial(Object.assign({ color: TEAM_HEX.none, opacity: 0.9, side: THREE.DoubleSide }, pOff));
    this.discMat = new THREE.MeshBasicMaterial(Object.assign({ color: TEAM_HEX.none, opacity: 0.1 }, pOff));
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.25, radius, 80), this.ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.25, 64), this.discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03;
    const tick = new THREE.Mesh(new THREE.RingGeometry(radius - 0.7, radius - 0.55, 80, 1, 0, Math.PI * 2), this.ringMat); tick.rotation.x = -Math.PI / 2; tick.position.y = 0.035;
    // flag pole + cloth (letter painted on the flag; cloth tint = owner colour). Indoors the pole shortens to fit under the ceiling.
    const poleY = base - pos.y, up = m.collision.raycast(new THREE.Vector3(pos.x, base + 0.2, pos.z), new THREE.Vector3(0, 1, 0), 6);
    const PH = clamp((up ? up.t + 0.2 : 6) - 0.3, 1.9, 3.6); this.poleH = PH;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, PH, 10), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }));
    pole.position.y = poleY + PH / 2; pole.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), pole.material); knob.position.y = poleY + PH + 0.02;
    const c = document.createElement('canvas'); c.width = 128; c.height = 84; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 84); ctx.fillStyle = '#111'; ctx.font = 'bold 70px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(id, 60, 46);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.flagMat = new THREE.MeshStandardMaterial({ map: tex, color: TEAM_HEX.none, side: THREE.DoubleSide, roughness: 0.85, emissive: 0x222222 });
    const fg = new THREE.PlaneGeometry(1.25, 0.82, 10, 4); fg.translate(0.64, 0, 0);
    this.flag = new THREE.Mesh(fg, this.flagMat); this.flag.position.y = poleY + PH - 0.48; this.flag.castShadow = true;
    this.flagBase = fg.attributes.position.array.slice();
    g.add(ring, disc, tick, pole, knob, this.flag);
    g.traverse((o) => { o.userData.noAO = true; });
    m.scene.add(g);
  }
  setOwner(team) {
    this.owner = team; const col = TEAM_HEX[team || 'none'];
    this.ringMat.color.setHex(col); this.discMat.color.setHex(col); this.flagMat.color.setHex(col);
  }
  inside(c) { return c.alive && Math.hypot(c.motor.pos.x - this.pos.x, c.motor.pos.z - this.pos.z) <= this.r && Math.abs(c.motor.pos.y - this.pos.y) < 2.5; }
  animate(t) {
    const p = this.flag.geometry.attributes.position, a = p.array, b = this.flagBase;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3]; a[i * 3 + 2] = Math.sin(x * 4.2 - t * 5.5 + this.id.charCodeAt(0)) * 0.09 * x; }
    p.needsUpdate = true;
    if (this.capTeam || this.contested) { // pulse toward the capturing team's colour
      const k = 0.5 + 0.5 * Math.sin(t * 9), from = new THREE.Color(TEAM_HEX[this.owner || 'none']), to = new THREE.Color(this.contested ? 0xffd040 : TEAM_HEX[this.capTeam]);
      this.ringMat.color.copy(from).lerp(to, k * (this.contested ? 1 : 0.4 + this.capK * 0.6));
    } else this.ringMat.color.setHex(TEAM_HEX[this.owner || 'none']);
  }
}

class DomRule extends Rule {
  init() {
    const m = this.m, o = m.def.objectives || {}, B = m.def.bounds;
    const pts = o.dom || [[B.minX * 0.55, 0, 0], [0, 0, 0], [B.maxX * 0.55, 0, 0]];
    this.zones = pts.map((p, i) => { const r = this.place(p); return new DomZone(this, 'ABC'[i], new THREE.Vector3(r.pos.x, p[1], r.pos.z), r.base, o.domRadius || 4); });
    this.prog = new Map(); // combatant → { zone, t }
    this.tickT = 2; this.goals = new Map();
  }
  owned(team) { let n = 0; for (const z of this.zones) if (z.owner === team) n++; return n; }
  canScore(team) { const other = team === 'alpha' ? 'bravo' : 'alpha'; return this.owned(other) < this.zones.length; }
  killTeamPoints() { return 5; }
  onDeath(c) { this.prog.delete(c); }
  _capture(z, c) {
    const m = this.m, prev = z.owner; z.setOwner(c.team);
    for (const [k, v] of this.prog) if (v.zone === z) this.prog.delete(k);
    c.score += POINTS.capture; m.addTeam(c.team, 10);
    const mine = c.team === m.player.team;
    m.audio.objective(mine ? 'capture' : 'lost');
    if (c.isPlayer) m.app.hud.points(`+${POINTS.capture}  佔領 ${z.id} 點`);
    const all = this.owned(c.team) === this.zones.length;
    m.app.hud.announce(mine ? `${z.id} 點已被我方佔領` : `敵方佔領了 ${z.id} 點`, all ? (mine ? '三點全佔！敵方無法得分' : '敵方三點全佔！我方被封鎖得分') : prev ? '據點易手' : '');
    m.app.hud.killfeed(c.name, c.team, `佔領 ${z.id}`, '', c.team, false, c.isPlayer);
  }
  tick(dt) {
    const m = this.m, t = m.time;
    for (const z of this.zones) z.animate(t);
    if (m.phase !== 'live') return;
    for (const z of this.zones) {
      let a = 0, b = 0; for (const c of m.combatants) if (z.inside(c)) { if (c.team === 'alpha') a++; else b++; }
      z.contested = a > 0 && b > 0; z.capTeam = null; z.capK = 0;
    }
    for (const c of m.combatants) {
      let z = null; for (const q of this.zones) if (q.inside(c)) { z = q; break; }
      const holding = c.alive && c.holdE && z && z.owner !== c.team;
      const pr = this.prog.get(c);
      if (!holding) { if (pr) this.prog.delete(c); continue; } // left the radius / released E / died → reset
      const cur = pr && pr.zone === z ? pr : { zone: z, t: 0 };
      const before = cur.t;
      if (!z.contested) cur.t += dt;
      if (c.isPlayer && Math.floor(cur.t) > Math.floor(before) && cur.t < CAPTURE_TIME) m.audio.objective('tick'); // one radio tick per second held
      this.prog.set(c, cur);
      if (cur.t / CAPTURE_TIME > z.capK) { z.capK = cur.t / CAPTURE_TIME; z.capTeam = c.team; }
      if (cur.t >= CAPTURE_TIME) this._capture(z, c);
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 2;
      for (const team of ['alpha', 'bravo']) { const n = this.owned(team); if (n) m.addTeam(team, n); }
      this.check();
    }
  }
  check() { const m = this.m; if (m.score.alpha >= m.target || m.score.bravo >= m.target) m.endMatch(m.score.alpha >= m.target ? 'alpha' : 'bravo'); }
  timeUp() { const m = this.m; m.endMatch(m.score.alpha === m.score.bravo ? null : m.score.alpha > m.score.bravo ? 'alpha' : 'bravo'); }
  // Bots spread over the zones: prefer zones not owned by their team, nearby, and not already crowded by teammates.
  botGoal(bot) {
    const m = this.m; let g = this.goals.get(bot);
    if (!g || m.time > g.until || (g.zone && !g.guard && g.zone.owner === bot.team)) g = this._pick(bot);
    if (!g.zone) return null;
    const z = g.zone, action = z.owner === bot.team ? 'guard' : 'capture';
    return { pos: z.pos, radius: z.r, action, urgent: action === 'capture' && z.owner !== null };
  }
  _pick(bot) {
    const m = this.m; let best = null, bs = Infinity;
    const heading = (z) => { let n = 0; for (const [b, g] of this.goals) if (b !== bot && b.alive && b.team === bot.team && g.zone === z && m.time < g.until) n++; return n; };
    for (const z of this.zones) {
      const d = bot.motor.pos.distanceTo(z.pos), mine = z.owner === bot.team;
      const sc = d / 12 + heading(z) * 2.2 + (mine ? 6 : 0) + ((bot.idx * 7 + z.id.charCodeAt(0)) % 5) * 0.4;
      if (sc < bs) { bs = sc; best = z; }
    }
    let zone = best, guard = false;
    if (best && best.owner === bot.team) { if (Math.random() < 0.55) zone = null; else guard = true; } // all ours: half guard, half go hunting
    const g = { zone, guard, until: m.time + rand(4, 7) }; this.goals.set(bot, g);
    return g;
  }
  markers(out) {
    const p = this.m.player;
    // X-ray waypoints: always drawn (walls do not hide them); the ring fills clockwise over the 6 s capture.
    for (const z of this.zones) out.push({ pos: new THREE.Vector3(z.pos.x, z.base + z.poleH + 0.4, z.pos.z), label: z.id, color: TEAM_CSS[z.owner || 'none'], sub: z.contested ? '爭奪中' : z.owner === p.team ? '我方' : z.owner ? '敵方' : '中立', zone: true,
      ring: z.capTeam ? z.capK : 0, ringColor: z.contested ? '#ffd040' : TEAM_CSS[z.capTeam || 'none'] });
    return out;
  }
  hudState() {
    const m = this.m, p = m.player, pr = this.prog.get(p);
    let prompt = '', cap = null;
    const zin = p.alive ? this.zones.find((z) => z.inside(p)) : null;
    if (zin && zin.owner !== p.team) {
      if (pr && pr.zone === zin) cap = { k: pr.t / CAPTURE_TIME, label: `佔領 ${zin.id} 點中 · ${Math.max(0, CAPTURE_TIME - pr.t).toFixed(1)}s`, contested: zin.contested, id: zin.id, color: TEAM_CSS[p.team] };
      else prompt = `按住 [E] 佔領 ${zin.id} 點（6 秒）`;
    }
    const mineAll = this.owned(p.team) === this.zones.length, theirAll = this.owned(p.enemyTeam) === this.zones.length;
    return { kind: 'dom', zones: this.zones.map((z) => ({ id: z.id, owner: z.owner, contested: z.contested, k: z.capK, capTeam: z.capTeam })), prompt, cap,
      lock: theirAll ? '敵方佔領全部據點 · 我方無法得分！' : mineAll ? '我方佔領全部據點 · 敵方得分封鎖' : '', lockMine: theirAll };
  }
}

function createRule(kind, m) {
  if (kind === 'rounds') return new RoundsRule(m);
  if (kind === 'relic') return new RelicRule(m);
  if (kind === 'dom') return new DomRule(m);
  return new TDMRule(m);
}

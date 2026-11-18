import { POINTS, THREE, TMP_V1, WEAPON_DEFS, clamp, loadoutDefs, rand } from './01_core.js';
import { ensureGunModels } from './09_models.js';
import { ZOMBIE, ZombieAI, zombieLook } from './13c_zombies.js';
import { v3arr } from './12c_netutil.js';
import { TEAM_CSS } from './14b_emblems.js';
/* =====================================================================
   GAME RULES — state machine per mode. The Match drives the phases
   (freeze → live → roundEnd → over) and delegates every mode-specific
   decision to one Rule object. Online (v29) only the host runs a rule's
   logic; it sends netState() ~10×/s and each client applies it (applyNet)
   and only animates (netTick), announcing what changed from its own view:
     TDMRule        team deathmatch, 3 s respawn, first to N points
     RoundsRule     elimination rounds, no respawn inside a round
     RelicRule      Capture the Relic (Blue attacks / Red defends)
     DomRule        Tactical Domination A/B/C, hold E for 6 s
   ===================================================================== */
const TEAM_HEX = { alpha: 0x3f8cff, bravo: 0xff4a3d, none: 0xdedede };
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
    this.returnedBy = 0;
    this.state = 'home'; this.carrier = null; this.pos = this.home.clone(); this.dropT = 0; this.ping = null; this.pingT = 0; this.pressed = new Set();
    for (const c of this.m.combatants) c.carrying = false;
  }
  interactPressed(c) { this.pressed.add(c); }
  _pickup(c) {
    this.state = 'carried'; this.carrier = c; c.carrying = true; this.pingT = 0;
    this._sayPickup(c);
    c.score += POINTS.relic / 2;
    if (c.isPlayer) this.m.app.hud.points(`+${POINTS.relic / 2}  奪取聖物`);
  }
  _sayPickup(c) {
    const m = this.m, mine = c.team === m.player.team; m.audio.objective('pickup');
    m.app.hud.announce(c.isPlayer ? '你拿到聖物了！' : mine ? '我方奪得聖物' : '敵方奪走了聖物！', c.isPlayer ? '衝回藍色撤離點' : `${c.name} 正在撤離`);
  }
  _drop(at) {
    const m = this.m, g = m.collision.groundBelow(at.x, at.y + 1, at.z, 0.2, 30);
    if (this.carrier) this.carrier.carrying = false;
    this.state = 'dropped'; this.carrier = null; this.dropT = 25;
    this.pos.set(at.x, (g ? g.y : at.y) + 0.55, at.z);
    this._sayDrop();
  }
  _sayDrop() { this.m.audio.objective('drop'); this.m.app.hud.announce('聖物掉落！', '防守方觸碰即可歸位 · 25 秒後自動歸位'); }
  _return(by) {
    this.state = 'home'; this.pos.copy(this.home); this.carrier = null;
    this._sayReturn(by);
    if (by) { by.score += 100; if (by.isPlayer) this.m.app.hud.points('+100  奪回聖物'); }
  }
  _sayReturn(by) {
    const m = this.m; m.audio.objective(by && by.team === m.player.team ? 'capture' : 'lost');
    m.app.hud.announce('聖物已歸位', by ? `${by.isPlayer ? '你' : by.name} 奪回了聖物` : '自動歸位');
  }
  // v29 online: where the relic is and who has it (the last defender to touch a dropped relic = who returned it)
  netState() { return { st: this.state, car: this.carrier ? this.carrier.netId : 0, p: v3arr(this.pos), dt: +this.dropT.toFixed(1), by: this.returnedBy || 0 }; }
  applyNet(s) {
    const m = this.m, prev = this.state, st = ['home', 'carried', 'dropped', 'extracted'].includes(s.st) ? s.st : 'home';
    const car = st === 'carried' ? m.net.byId(s.car | 0) : null;
    if (this.carrier && this.carrier !== car) this.carrier.carrying = false;
    this.state = st; this.carrier = car; if (car) car.carrying = true;
    if (st !== 'carried' && Array.isArray(s.p)) this.pos.set(+s.p[0] || 0, +s.p[1] || 0, +s.p[2] || 0);
    this.dropT = Math.max(0, +s.dt || 0);
    if (prev === st || m.phase !== 'live') return;
    if (st === 'carried' && car) this._sayPickup(car);
    else if (st === 'dropped') this._sayDrop();
    else if (st === 'home' && prev !== 'extracted') this._sayReturn(s.by ? m.net.byId(s.by | 0) : null);
  }
  netTick(dt) { this._visuals(dt); }
  onDeath(c) { if (this.carrier === c) this._drop(c.motor.pos.clone()); }
  _visuals(dt) {
    const m = this.m, t = m.time;
    this.core.rotation.y += dt * 1.6; this.r1.rotation.z += dt * 1.1; this.r2.rotation.y += dt * 0.8;
    let vis = this.pos;
    if (this.state === 'carried' && this.carrier) {
      const c = this.carrier; vis = TMP_V1.set(c.motor.pos.x, c.motor.pos.y + 2.25, c.motor.pos.z);
      this.group.visible = !c.isPlayer; this.pos.copy(c.motor.pos);
    } else this.group.visible = true;
    this.group.position.set(vis.x, vis.y + Math.sin(t * 2.2) * 0.07, vis.z);
    this.beam.visible = this.state !== 'carried'; this.beam.position.set(this.pos.x, this.pos.y + 30, this.pos.z);
    this.exGroup.visible = this.state === 'carried'; this.exRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
  }
  tick(dt) {
    const m = this.m;
    this._visuals(dt);
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
    } else if (this.state === 'dropped') { this.dropT -= dt; if (this.dropT <= 0) { this.returnedBy = 0; this._return(null); } }
    // pickup / return
    if (this.state === 'home' || this.state === 'dropped') {
      for (const c of m.combatants) {
        if (!c.alive) continue;
        const d = Math.hypot(c.motor.pos.x - this.pos.x, c.motor.pos.z - this.pos.z), dy = Math.abs(c.motor.pos.y + 0.9 - this.pos.y);
        if (d > 1.8 || dy > 2.2) continue;
        if (c.team === this.attack && (this.pressed.has(c) || c.holdE)) { this._pickup(c); break; }
        if (c.team === this.defend && this.state === 'dropped') { this.returnedBy = c.netId; this._return(c); break; }
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
    const m = this.m, prev = z.owner; z.setOwner(c.team); z.by = c.netId;
    for (const [k, v] of this.prog) if (v.zone === z) this.prog.delete(k);
    c.score += POINTS.capture; m.addTeam(c.team, 10);
    if (c.isPlayer) m.app.hud.points(`+${POINTS.capture}  佔領 ${z.id} 點`);
    this._sayCapture(z, c.team, prev, c);
  }
  _sayCapture(z, team, prev, c) {
    const m = this.m, mine = team === m.player.team, all = this.owned(team) === this.zones.length;
    m.audio.objective(mine ? 'capture' : 'lost');
    m.app.hud.announce(mine ? `${z.id} 點已被我方佔領` : `敵方佔領了 ${z.id} 點`, all ? (mine ? '三點全佔！敵方無法得分' : '敵方三點全佔！我方被封鎖得分') : prev ? '據點易手' : '');
    if (c) m.app.hud.killfeed(c.name, team, `佔領 ${z.id}`, '', team, false, c.isPlayer);
  }
  // v29 online: every zone [owner, contested, capturing team, progress, captured by] + this friend's own capture progress
  netState(np) {
    const T = (t) => (t === 'alpha' ? 1 : t === 'bravo' ? 2 : 0), pr = np ? this.prog.get(np) : null;
    return { z: this.zones.map((z) => [T(z.owner), z.contested ? 1 : 0, T(z.capTeam), +z.capK.toFixed(3), z.by || 0]), me: pr ? [this.zones.indexOf(pr.zone), +pr.t.toFixed(2)] : null };
  }
  applyNet(s) {
    const m = this.m, T = [null, 'alpha', 'bravo'], p = m.player;
    if (Array.isArray(s.z)) s.z.forEach((a, i) => {
      const z = this.zones[i]; if (!z || !Array.isArray(a)) return;
      const own = T[a[0]] || null;
      if (own !== z.owner) { const prev = z.owner; z.setOwner(own); if (own && m.phase === 'live') this._sayCapture(z, own, prev, m.net.byId(a[4] | 0)); }
      z.contested = !!a[1]; z.capTeam = T[a[2]] || null; z.capK = clamp(+a[3] || 0, 0, 1);
    });
    const me = Array.isArray(s.me) ? this.zones[s.me[0] | 0] : null;
    if (me) { const t = clamp(+s.me[1] || 0, 0, CAPTURE_TIME), before = this.prog.get(p); if (before && Math.floor(t) > Math.floor(before.t) && t < CAPTURE_TIME) m.audio.objective('tick'); this.prog.set(p, { zone: me, t }); }
    else this.prog.delete(p);
  }
  netTick() { for (const z of this.zones) z.animate(this.m.time); }
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

/* ------------------------------------------------------------------
   v65z CAPTURE (SF2's 佔領模式, SFCaptureGame — user 10-30, map Cannon / 邊境要塞 = SF2's `tower`): ONE capture point, closed
   for the first DelayTimeToEnableCaptureVolume = 120 s. A team takes it by standing in it with no enemy inside (1 s); the holder's
   CompleteCaptureTime = 60 s countdown then runs and starts again from 60 whenever the point changes hands — the team holding it when
   the countdown ends wins. At the 10 min limit the team holding it wins (nobody: a draw). Kills score as in TDM; respawns are on.
   ------------------------------------------------------------------ */
const CAP_OPEN = 120, CAP_HOLD = 60, CAP_TAKE = 1;
class CaptureRule extends Rule {
  init() {
    const m = this.m, o = m.def.objectives || {}, B = m.def.bounds;
    const r = this.place(o.cap || [(B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2]);
    this.pos = new THREE.Vector3(r.pos.x, r.base, r.pos.z); this.r = o.capRadius || 2.2;
    this.owner = null; this.left = CAP_HOLD; this.takeT = 0; this.taker = null; this.contested = false; this.warned = 0;
    const g = this.group = new THREE.Group(); g.position.copy(this.pos);
    const pOff = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false, transparent: true };
    this.ringMat = new THREE.MeshBasicMaterial(Object.assign({ color: TEAM_HEX.none, opacity: 0.9, side: THREE.DoubleSide }, pOff));
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.r - 0.2, this.r, 64), this.ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    this.beamMat = new THREE.MeshBasicMaterial({ color: TEAM_HEX.none, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(this.r, this.r, 40, 32, 1, true), this.beamMat); beam.position.y = 20;
    g.add(ring, beam); g.traverse((c) => { c.userData.noAO = true; }); m.scene.add(g);
  }
  get open() { return this.openAt !== undefined && this.m.time >= this.openAt; }
  startRound() {}
  inside(c) { return c.alive && Math.hypot(c.motor.pos.x - this.pos.x, c.motor.pos.z - this.pos.z) <= this.r && Math.abs(c.motor.pos.y - this.pos.y) < 1.6; }
  _setOwner(team, by) {
    const m = this.m, prev = this.owner; this.owner = team; this.left = CAP_HOLD; this.warned = 0;
    const col = TEAM_HEX[team || 'none']; this.ringMat.color.setHex(col); this.beamMat.color.setHex(col);
    if (!team || m.phase !== 'live') return;
    const mine = team === m.player.team; m.audio.objective(mine ? 'capture' : 'lost');
    m.app.hud.announce(mine ? '我方佔領了據點' : '敵方佔領了據點！', `${CAP_HOLD} 秒倒數結束時，佔領的一方獲勝`);
    if (by) { by.score += POINTS.capture; m.addTeam(team, 10); if (by.isPlayer) m.app.hud.points(`+${POINTS.capture}  佔領據點`); m.app.hud.killfeed(by.name, team, '佔領據點', '', team, false, by.isPlayer); }
    else if (prev !== team) m.app.hud.killfeed(mine ? '我方' : '敵方', team, '佔領據點', '', team, false, false);
  }
  netState() { const T = (t) => (t === 'alpha' ? 1 : t === 'bravo' ? 2 : 0); return { o: T(this.owner), l: +this.left.toFixed(1), c: this.contested ? 1 : 0 }; }
  applyNet(s) {
    const own = [null, 'alpha', 'bravo'][s.o | 0] || null;
    if (own !== this.owner) this._setOwner(own, null);
    this.left = clamp(+s.l || 0, 0, CAP_HOLD); this.contested = !!s.c;
  }
  tick(dt) {
    const m = this.m;
    if (this.openAt === undefined && m.phase === 'live') this.openAt = m.time + CAP_OPEN; // (counted from the start of play, after the freeze)
    this.group.visible = this.open; this.ringMat.opacity = this.contested ? 0.55 + 0.4 * Math.sin(m.time * 9) : 0.9;
    if (m.phase !== 'live' || !this.open) return;
    let a = 0, b = 0, first = null; for (const c of m.combatants) if (this.inside(c)) { if (c.team === 'alpha') a++; else b++; if (!first) first = c; }
    this.contested = a > 0 && b > 0;
    const team = !this.contested && (a || b) ? (a ? 'alpha' : 'bravo') : null;
    if (team && team !== this.owner) { this.takeT += dt; if (this.takeT >= CAP_TAKE) { this.takeT = 0; this._setOwner(team, first); } } else this.takeT = 0;
    if (!this.owner) return;
    this.left -= dt;
    for (const w of [20, 5]) if (this.left <= w && this.warned < w && this.warned !== 5) { // (SF2: CaptureWarningTime 20, the timer's last warning at 5)
      this.warned = w; const mine = this.owner === m.player.team; m.audio.objective('tick');
      m.app.hud.announce(`剩 ${w} 秒！`, mine ? '守住據點' : '快奪回據點！');
    }
    if (this.left <= 0) { this.left = 0; m.endMatch(this.owner); }
  }
  timeUp() { this.m.endMatch(this.owner); }
  botGoal(bot) {
    if (!this.open) return { pos: this.pos, radius: 14, action: 'guard' }; // gather near the point before it opens
    if (this.owner !== bot.team) return { pos: this.pos, radius: this.r * 0.6, action: 'capture', urgent: true };
    return bot.idx % 2 ? { pos: this.pos, radius: this.r * 0.8, action: 'guard' } : { pos: this.pos, radius: 10, action: 'guard' };
  }
  markers(out) {
    const p = this.m.player;
    out.push({ pos: this.pos.clone().setY(this.pos.y + 2.6), label: '◎', color: TEAM_CSS[this.owner || 'none'], zone: true,
      sub: !this.open ? `${Math.ceil((this.openAt ?? this.m.time + CAP_OPEN) - this.m.time)}s 後開放` : this.contested ? '爭奪中' : this.owner ? `${this.owner === p.team ? '我方' : '敵方'} ${Math.ceil(this.left)}s` : '中立' });
    return out;
  }
  hudState() {
    const m = this.m, p = m.player, mine = this.owner === p.team, s = (n) => { const t = Math.ceil(n); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    let text;
    if (this.openAt === undefined || !this.open) text = `據點 ${s(Math.max(0, (this.openAt ?? m.time + CAP_OPEN) - m.time))} 後開放`;
    else if (!this.owner) text = '據點已開放 · 站上據點佔領';
    else text = `${mine ? '我方佔領中 · 守住' : '敵方佔領中 · 奪回據點'} · 倒數 ${Math.ceil(this.left)} 秒${this.contested ? '（爭奪中）' : ''}`;
    return { kind: 'tower', text, prompt: '', role: '佔領模式' };
  }
}

/* ------------------------------------------------------------------
   v67p ZOMBIE SURVIVAL (co-op; user 11-18 B: the full version). Every human is on Blue (alpha); Red (bravo) is a pool of
   infected (src/13c_zombies.js) the rule wakes wave by wave. Designed after SF2's survival modes
   (docs/research/sf2/modes-endcam.md §2) with our own numbers:
     · waves: a 12 s break (the shop is open all the time), then 6 + 4n infected (×0.75 + 0.25 a human), at most 6 + 2n
       up at once, tougher and faster every wave, two brutes from wave 5; survive the room's target number of waves to win
     · downed, not dead: a human at 0 HP goes down for 30 s; a teammate who holds E beside them for 3 s brings them back at
       50 HP; bleed out = dead until the next wave starts; everyone down or dead = the match is lost
     · money: start $500; a kill $100 (+$50 head, brute $500), a revive $150, a cleared wave $300 each
     · shop (B): ammo, a heal, a grenade, or a gun of the room's gun set (it replaces the primary; lost on death)
   Online the host runs it all: each friend's own view (wave, his cash, downed state) goes out in netState; his shop
   orders come in as { k: 'rule', t: 'buy' } and a purchase goes back as { k: 'rule', t: 'bought' } (src/18_net.js).
   ------------------------------------------------------------------ */
const Z = { breakT: 12, bleedT: 30, reviveT: 3, reviveR: 1.8, pool: 16, cash0: 500, kill: 100, head: 50, brute: 500, revive: 150, wave: 300 };
const SHOP_GUNS = { sf2: ['mp5', 'ump45', 'p90', 'm4a1', 'ak47', 'g36c', 'scarh', 'm249', 'remington870', 'awp'],
  apex: ['apex_r99', 'apex_prowler', 'apex_r301', 'apex_flatline', 'apex_hemlok', 'apex_spitfire', 'apex_eva8', 'apex_peacekeeper', 'apex_longbow'] };
const GUN_PRICE = { smg: 800, assault: 1200, rifle: 1200, lmg: 1800, shotgun: 1000, sniper: 1500 };
const SHOP_ITEMS = [['ammo', '彈藥補滿', 200], ['heal', '回復滿血', 250], ['nade', '手榴彈 +1', 300]];

class ZombieRule extends Rule {
  constructor(m) { super(m); this.wave = 0; this.ph = 'break'; this.breakLeft = Z.breakT; this.toSpawn = 0; this.left = 0; this.cash = Z.cash0; this.shop = null; this.page = 0; this.downIds = []; }
  get coop() { return true; }
  get respawns() { return false; }
  get humansList() { const m = this.m, H = [m.player, ...(m.humans || [])].filter((c) => !c.removed); for (const c of H) if (c.cash === undefined) c.cash = Z.cash0; return H; } // (a friend who joins later starts with the same money)
  init() {
    const m = this.m;
    this.pool = m.bots.filter((b) => b.team === 'bravo');
    this.pool.forEach((b, i) => {
      zombieLook(b, i >= this.pool.length - ZOMBIE.brutes); b.ai = new ZombieAI(b, m); if (b.tag) b.tag.visible = false;
      b.alive = false; b.respawnT = Infinity; b.model.root.visible = false;
    });
    for (const c of this.humansList) c.cash = Z.cash0;
    this.keyFn = null;
  }
  startRound() { this.ph = 'break'; this.breakLeft = Z.breakT; }
  canScore() { return true; }
  timeUp() {}
  // a human at 0 HP goes down instead of dying (not twice, not from bleeding out)
  onLethal(c, opts) {
    if (c.team !== 'alpha' || c.isBot || c.downed || opts.bleed) return false;
    c.downed = true; c.bleedT = Z.bleedT; c.reviveT = 0; c.hp = 1;
    this.m.app.hud.toast(`${c.isPlayer ? '你' : c.name} 倒地了！`);
    return true;
  }
  onDeath(c, killer, head) {
    c.downed = false;
    if (c.zombie) { c.respawnT = Infinity; if (killer && killer.team === 'alpha') this._pay(killer, c.brute ? Z.brute : Z.kill + (head ? Z.head : 0)); }
  }
  _pay(c, n) { if (c.cash === undefined) return; c.cash += n; if (c.isPlayer) this.cash = c.cash; }
  _wavePlan(n) {
    const hum = Math.max(1, this.humansList.length), total = Math.round((6 + 4 * n) * (0.75 + 0.25 * hum));
    return { total, maxAlive: Math.min(this.pool.length, 6 + 2 * n), hp: 60 + 20 * n, speed: Math.min(1.35, 0.92 + 0.03 * n), dmg: 12 + 2 * n, brutes: n >= 5 ? 2 : 0 };
  }
  _startWave() {
    const m = this.m; this.wave++; this.ph = 'wave'; this.plan = this._wavePlan(this.wave); this.toSpawn = this.plan.total; this.brutesLeft = this.plan.brutes; this.spawnT = 0;
    // everyone dead since the last wave is back
    for (const c of [...this.humansList, ...m.bots.filter((b) => b.team === 'alpha')]) if (!c.alive) {
      const sp = m.pickSpawn('alpha'); c.respawn(sp, sp.spawnYaw ?? m.spawns.alpha.yaw); if (c.isPlayer) { m.app.hud.showDeath(false); m.player.setSpectate(null); }
    }
    m.app.hud.announce(`第 ${this.wave} 波`, this.wave >= 5 && this.plan.brutes ? '巨型感染者出現' : '感染者來襲'); m.audio.zombie(null, 'wave');
  }
  _spawnPoint() {
    const m = this.m, N = m.nav.groundNodes || [], H = m.combatants.filter((c) => c.team === 'alpha' && c.alive);
    const ok = []; for (let i = 0; i < 40 && N.length; i++) { const n = N[(Math.random() * N.length) | 0]; let near = Infinity; for (const c of H) near = Math.min(near, c.motor.pos.distanceTo(n.p)); if (near > 20 && near < 80) ok.push(n.p); if (ok.length >= 4) break; }
    if (ok.length) return ok[(Math.random() * ok.length) | 0].clone();
    return m.pickSpawn('bravo');
  }
  tick(dt) {
    const m = this.m; if (m.phase !== 'live') return;
    if (this.ph === 'break') { this.breakLeft -= dt; if (this.breakLeft <= 0) this._startWave(); }
    else if (this.ph === 'wave') {
      const alive = this.pool.filter((b) => b.alive).length; this.spawnT -= dt;
      if (this.toSpawn > 0 && alive < this.plan.maxAlive && this.spawnT <= 0) {
        this.spawnT = 0.35;
        const P = this.plan, wantBrute = this.brutesLeft > 0, b = this.pool.find((x) => !x.alive && x.brute === wantBrute) || this.pool.find((x) => !x.alive && !x.brute);
        if (b) {
          const sp = this._spawnPoint(); b.respawn(sp, rand(-3, 3)); b.spawnProtect = 0; b.hp = P.hp * (b.brute ? 5 : 1); b.helmet = false; b.model.helmet.visible = false;
          b.zSpeed = (b.brute ? 0.7 : 1) * P.speed * rand(0.9, 1.1); b.zDmg = P.dmg * (b.brute ? 2.5 : 1); this.toSpawn--; if (b.brute) this.brutesLeft--;
        }
      }
      this.left = this.toSpawn + this.pool.filter((b) => b.alive).length;
      if (this.left === 0) { // wave cleared
        for (const c of this.humansList) if (c.alive) this._pay(c, Z.wave);
        if (this.wave >= m.target) { m.endMatch('alpha'); return; }
        this.ph = 'break'; this.breakLeft = Z.breakT; m.app.hud.announce(`第 ${this.wave} 波 清除`, `+$${Z.wave} · ${Z.breakT} 秒後下一波 · B 商店`); m.audio.uxCue('challenge');
      }
    }
    // downed: bleeding out, or a teammate holding E beside them
    for (const d of this.humansList) {
      if (!d.alive || !d.downed) continue;
      const r = this.humansList.find((c) => c !== d && c.alive && !c.downed && c.holdE && c.motor.pos.distanceTo(d.motor.pos) < Z.reviveR);
      if (r) { d.reviveT += dt; d.reviver = r; if (d.reviveT >= Z.reviveT) { d.downed = false; d.hp = 50; d.reviveT = 0; d.reviver = null; this._pay(r, Z.revive); m.app.hud.toast(`${r.isPlayer ? '你' : r.name} 救起了 ${d.isPlayer ? '你' : d.name}（+$${Z.revive}）`); } }
      else { d.reviveT = 0; d.reviver = null; d.bleedT -= dt; if (d.bleedT <= 0) { d.spawnProtect = 0; m.applyDamage(d, 999, 'chest', null, WEAPON_DEFS.knife, new THREE.Vector3(0, 0, 1), null, { bleed: true }); } }
    }
    this.downIds = this.humansList.filter((c) => c.alive && c.downed).map((c) => c.netId);
    this.check();
  }
  check() {
    const m = this.m, H = this.humansList;
    if (m.phase === 'live' && H.length && H.every((c) => !c.alive || c.downed)) m.endMatch('bravo');
  }
  // friendly bots hunt the infected (no objective)
  botGoal() { return null; }

  /* ---------------- shop ---------------- */
  _guns() { return (SHOP_GUNS[this.m.gunSet] || SHOP_GUNS.sf2).filter((id) => WEAPON_DEFS[id]); }
  _price(item) { const d = WEAPON_DEFS[item]; if (d) return GUN_PRICE[d.type] || GUN_PRICE[d.kind] || 1000; const s = SHOP_ITEMS.find((x) => x[0] === item); return s ? s[2] : Infinity; }
  // on the host, for anyone: take the money, give the goods; true if bought
  buyFor(c, item) {
    const price = this._price(item);
    if (!c.alive || c.cash === undefined || c.cash < price || (item === 'heal' && (c.downed || c.hp >= 100))) return false;
    c.cash -= price; if (c.isPlayer) this.cash = c.cash;
    if (c.isPlayer) this._apply(item); else { this._applyRemote(c, item); if (this.m.net) this.m.net.t.send(c.peer, { k: 'rule', t: 'bought', item }); }
    return true;
  }
  // the goods on the soldier this computer plays (the host's own, or a friend's own once the host confirms)
  async _apply(item) {
    const m = this.m, p = m.player, ws = m.weapons;
    if (item === 'ammo') ws.resetLoadout();
    else if (item === 'heal') p.hp = 100;
    else if (item === 'nade') { const g = ws.weapons.find((w) => w.kind === 'grenade' && w.def.gtype === 'he'); if (g) g.count++; }
    else if (WEAPON_DEFS[item]) {
      const sec = (ws.weapons.find((w) => w.def.slot === 'secondary') || {}).def, defs = loadoutDefs(m.mode, { primary: item, secondary: sec ? sec.id : 'p226' });
      await ensureGunModels(defs); ws.rebuild(defs); ws.setEnvironment && ws.setEnvironment(m.vmEnv || m.scene.environment);
    }
    m.audio.uxCue('buy');
  }
  _applyRemote(c, item) {
    const m = this.m, A = c.arsenal;
    if (item === 'ammo') A.resetLoadout();
    else if (item === 'heal') c.hp = 100;
    else if (item === 'nade') { const g = A.weapons.find((w) => w.kind === 'grenade' && w.def.gtype === 'he'); if (g) g.count++; }
    else if (WEAPON_DEFS[item]) { const sec = (A.weapons.find((w) => w.def.slot === 'secondary') || {}).def; c.loadout = { primary: item, secondary: sec ? sec.id : 'p226' }; A.rebuild(loadoutDefs(m.mode, c.loadout)); }
  }
  netMsg(np, d) { if (d.t === 'buy' && typeof d.item === 'string') this.buyFor(np, d.item.slice(0, 32)); }
  clientMsg(d) { if (d.t === 'bought' && typeof d.item === 'string') this._apply(d.item.slice(0, 32)); }
  _order(item) {
    const m = this.m; if (!m.player.alive) return;
    if (this._price(item) > this.cash) { m.app.hud.toast('金錢不足'); m.audio.mech('dry'); return; }
    if (m.isClient) m.net.t.send(m.net.hostId, { k: 'rule', t: 'buy', item }); else if (!this.buyFor(m.player, item)) m.audio.mech('dry');
  }
  onKey(code) {
    if (code === 'KeyB') { this.shop = !this.shop; this.page = 0; this._drawShop(); return true; }
    if (!this.shop) return false;
    if (code === 'Escape') { this.shop = false; this._drawShop(); return true; }
    const dg = /^Digit([0-9])$/.exec(code); if (!dg) return false;
    const k = +dg[1];
    if (this.page === 0) { if (k >= 1 && k <= 3) this._order(SHOP_ITEMS[k - 1][0]); else if (k === 4) { this.page = 1; this._drawShop(); } }
    else { const G = this._guns(); if (k === 0) { this.page = 0; this._drawShop(); } else if (G[k - 1]) { this._order(G[k - 1]); this.shop = false; this._drawShop(); } }
    return true;
  }
  _drawShop() {
    let el = document.getElementById('zshop');
    if (!this.shop) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'zshop'; document.body.appendChild(el); }
    const row = (k, name, price) => `<div class="zr${price > this.cash ? ' no' : ''}"><b>${k}</b><span>${name}</span><i>$${price}</i></div>`;
    el.innerHTML = `<h3>商店 · $${this.cash}</h3>` + (this.page === 0
      ? SHOP_ITEMS.map(([id, n, p], i) => row(i + 1, n, p)).join('') + `<div class="zr"><b>4</b><span>武器 ▸</span><i></i></div>`
      : this._guns().map((id, i) => row(i + 1, WEAPON_DEFS[id].name, this._price(id))).join('') + `<div class="zr"><b>0</b><span>◂ 返回</span><i></i></div>`) + `<p>數字鍵購買 · B／Esc 關閉</p>`;
  }

  /* ---------------- network + HUD ---------------- */
  netState(np) { return { w: this.wave, ph: this.ph === 'break' ? 0 : 1, t: +this.breakLeft.toFixed(1), l: this.left, c: np.cash | 0, dn: np.downed ? 1 : 0, bl: +(np.bleedT || 0).toFixed(1), rv: +(np.reviveT || 0).toFixed(2), dd: this.downIds.slice(0, 8) }; }
  applyNet(s) {
    const m = this.m, p = m.player; this.wave = s.w | 0; this.ph = s.ph ? 'wave' : 'break'; this.breakLeft = +s.t || 0; this.left = s.l | 0; this.downIds = Array.isArray(s.dd) ? s.dd : [];
    if (this.cash !== (s.c | 0)) { this.cash = s.c | 0; if (this.shop) this._drawShop(); }
    const was = p.downed; p.downed = !!s.dn; p.bleedT = +s.bl || 0; p.reviveT = +s.rv || 0; if (p.downed && !was) m.app.hud.toast('你倒地了！');
  }
  netTick() { if (this.ph === 'break') this.breakLeft = Math.max(0, this.breakLeft - 1 / 60); }
  markers(out) {
    const m = this.m;
    for (const id of this.downIds) { const c = m.net && m.net.byId ? m.net.byId(id) : m.combatants.find((x) => x.netId === id); if (c && c !== m.player) out.push({ pos: c.motor.pos.clone().setY(c.motor.pos.y + 1.2), color: 0xffc23a, label: '救援', team: 'alpha' }); }
    return out;
  }
  hudState() {
    const m = this.m, p = m.player, cash = `$${this.cash}`; let text;
    if (p.downed) text = `你倒地了 · ${Math.ceil(p.bleedT || 0)} 秒內等隊友救援${p.reviveT > 0 ? `（救援中 ${Math.round(p.reviveT / Z.reviveT * 100)}%）` : ''}`;
    else if (this.ph === 'break') text = `第 ${this.wave + 1} 波 ${Math.ceil(this.breakLeft)} 秒後開始 · ${cash} · B 商店`;
    else text = `第 ${this.wave} 波 · 剩餘 ${this.left} 隻 · ${cash} · B 商店`;
    // a downed teammate beside you: the revive prompt
    let prompt = '';
    if (p.alive && !p.downed) for (const id of this.downIds) { const c = m.net && m.net.byId ? m.net.byId(id) : m.combatants.find((x) => x.netId === id); if (c && c !== p && c.motor.pos.distanceTo(p.motor.pos) < Z.reviveR) { prompt = `按住 E 救援 ${c.name}`; break; } }
    if (prompt) m.app.hud.interact(prompt);
    return { kind: 'zombie', text, prompt, role: '殭屍生存' };
  }
  dispose() { this.shop = false; this._drawShop(); }
}

function createRule(kind, m) {
  if (kind === 'zombie') return new ZombieRule(m);
  if (kind === 'tower') return new CaptureRule(m);
  if (kind === 'rounds') return new RoundsRule(m);
  if (kind === 'relic') return new RelicRule(m);
  if (kind === 'dom') return new DomRule(m);
  return new TDMRule(m);
}

export { createRule };

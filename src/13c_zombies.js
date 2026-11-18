import { CFG, THREE, clamp, rand } from './01_core.js';
/* =====================================================================
   v67p ZOMBIES (user 11-18: a co-op mode — you and your friends against waves of the infected; the rule is ZombieRule in
   15b_rules.js, the design notes in docs/research/sf2/modes-endcam.md §2). Our own creatures: the soldier model, its gun
   taken away, a sickly skin and a hunched forward lean; the last two of the pool are "brutes" — bigger, slower, much tougher.
   ZombieAI replaces a Bot's BotAI (same surface: update / reset / hear / onDamaged / onSuppressed / blind): it picks the
   nearest teammate who is still up (the downed are left for the others to fight over), runs at them along the nav graph
   and claws them in reach. Never shoots.
   ===================================================================== */
const ZOMBIE = { reach: 1.45, hitCd: 1.0, repath: 0.5, brutes: 2 };

// the look (a Bot on the host, a Ghost on a client): no gun, grey-green skin and cloth, brutes 1.3× the size
function zombieLook(c, brute) {
  const M = c.model; if (!M) return;
  if (M.gun) M.gun.visible = false;
  M.root.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.zMat) return;
    const z = (m) => { const n = m.clone(); if (n.color) n.color.multiply(new THREE.Color(0.62, 0.78, 0.55)); if (n.emissive) n.emissive.setRGB(0.02, 0.05, 0.01); return n; };
    o.material = Array.isArray(o.material) ? o.material.map(z) : z(o.material); o.userData.zMat = true;
  });
  if (brute) M.root.scale.multiplyScalar(1.3);
  c.zombie = true; c.brute = !!brute; c.name = brute ? '巨型感染者' : '感染者';
}

class ZombieAI {
  constructor(bot, game) { this.bot = bot; this.game = game; this.reset(); }
  reset() {
    this.wishX = this.wishZ = this.wishSpeed = 0; this.wantJump = false; this.wantAirJump = false; this.crouchT = 0;
    this.path = []; this.pathIdx = 0; this.target = null; this.repathT = 0; this.hitCd = rand(0.2, 0.8); this.growlT = rand(1, 4);
    this.stuckT = 0; this.lastPos = this.bot.motor.pos.clone(); this.state = 'HUNT'; this.blindT = 0;
  }
  hear() {} onDamaged() {} onSuppressed() {}
  blind(d) { this.blindT = Math.max(this.blindT, d * 0.5); } // (a flashbang slows them, briefly)
  _pick() {
    const g = this.game, me = this.bot.motor.pos; let best = null, bd = Infinity;
    for (const c of g.combatants) {
      if (!c.alive || c.downed || c.team === this.bot.team || c.removed) continue;
      const d = c.motor.pos.distanceToSquared(me); if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt) {
    const g = this.game, bot = this.bot, m = bot.motor;
    this.wishX = this.wishZ = this.wishSpeed = 0;
    if (!g.canMove()) return;
    this.hitCd -= dt; this.repathT -= dt; this.growlT -= dt;
    if (this.blindT > 0) { this.blindT -= dt; return; }
    if (this.growlT <= 0) { this.growlT = rand(3, 7); g.audio.zombie(m.pos, 'idle', bot.brute); }
    if (!this.target || !this.target.alive || this.target.downed || this.repathT <= 0) {
      const t = this._pick(); if (t !== this.target) this.path = [];
      this.target = t; if (!t) return;
    }
    const t = this.target, tp = t.motor.pos, dx = tp.x - m.pos.x, dz = tp.z - m.pos.z, dy = tp.y - m.pos.y, d = Math.hypot(dx, dz);
    const speed = CFG.bot.runSpeed * (bot.zSpeed || 1);
    bot.yaw = Math.atan2(-dx, -dz); bot.aimPitch = clamp(Math.atan2(dy + 0.4, d), -0.6, 0.6);
    if (d < ZOMBIE.reach && Math.abs(dy) < 1.3) { // in reach: claw
      if (this.hitCd <= 0) { this.hitCd = ZOMBIE.hitCd * (bot.brute ? 1.4 : 1); g.zombieHit(bot, t); }
      if (d > 0.7) { this.wishX = dx / d; this.wishZ = dz / d; this.wishSpeed = speed * 0.4; }
      return;
    }
    // close and in the open: straight at them; else along the nav graph (re-planned twice a second)
    const direct = d < 6 && Math.abs(dy) < 1 && g.collision.segmentClear(m.pos.clone().setY(m.pos.y + 0.9), tp.clone().setY(tp.y + 0.9));
    if (direct) { this.wishX = dx / d; this.wishZ = dz / d; this.wishSpeed = speed; }
    else {
      if (this.repathT <= 0 || this.pathIdx >= this.path.length) { this.repathT = ZOMBIE.repath; this.path = g.nav.findPath(m.pos, tp, 0); this.pathIdx = 0; }
      while (this.pathIdx < this.path.length) {
        const w = this.path[this.pathIdx], wx = w.x - m.pos.x, wz = w.z - m.pos.z, wy = w.y - m.pos.y;
        if (wx * wx + wz * wz < 0.4 && Math.abs(wy) < 1.6) { this.pathIdx++; continue; }
        const l = Math.hypot(wx, wz) || 1; this.wishX = wx / l; this.wishZ = wz / l; this.wishSpeed = speed;
        m.climbInput = w.ladder ? (wy > 0.02 ? 1 : -1) : 0; break;
      }
      if (this.pathIdx >= this.path.length && d > 0.1) { this.wishX = dx / d; this.wishZ = dz / d; this.wishSpeed = speed; }
    }
    // stuck against something: hop
    this.stuckT += dt; if (this.stuckT > 0.8) { if (m.pos.distanceTo(this.lastPos) < 0.3 && this.wishSpeed > 0) this.wantJump = true; this.stuckT = 0; this.lastPos.copy(m.pos); }
    if (this.repathT <= 0) this.repathT = ZOMBIE.repath;
  }
}

export { ZOMBIE, ZombieAI, zombieLook };

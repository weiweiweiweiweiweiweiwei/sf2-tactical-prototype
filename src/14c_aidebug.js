import { THREE } from './01_core.js';

/* v63a AI debug overlay (F4, offline / host only): a label over every living bot with its state, goal, target and health, so the
   state machine (13_bots.js BotAI) can be watched in a match. Labels are plain DOM over the canvas, refreshed 10 times a second. */
const TEAM_COL = { alpha: '#7fc4ff', bravo: '#ff8a7a' };
const _v = new THREE.Vector3();

class AIDebug {
  constructor() {
    this.on = false; this.t = 0; this.labels = [];
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;font:600 11px/1.25 Rajdhani,system-ui,sans-serif';
    document.body.appendChild(this.el);
    // v65y the player's own position (map fixes: the user reads it off the screen to say where a problem is)
    this.posEl = document.createElement('div'); this.posEl.style.cssText = 'position:absolute;left:50%;top:92px;transform:translateX(-50%);padding:2px 8px;border-radius:3px;background:rgba(0,0,0,.6);color:#ffe28a;font-size:14px';
    this.el.appendChild(this.posEl);
  }
  toggle() { this.on = !this.on; this.el.style.display = this.on ? '' : 'none'; return this.on; }
  label(i) {
    while (this.labels.length <= i) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;transform:translate(-50%,-100%);white-space:nowrap;padding:1px 5px;border-radius:3px;background:rgba(0,0,0,.55);text-shadow:0 1px 1px #000';
      this.el.appendChild(d); this.labels.push(d);
    }
    return this.labels[i];
  }
  update(dt, match, camera) {
    if (!this.on) return;
    this.t -= dt; const text = this.t <= 0; if (text) this.t = 0.1;
    const w = innerWidth, h = innerHeight; let n = 0;
    const pl = match.player;
    if (text && pl && pl.motor) { const q = pl.motor.pos, deg = ((-pl.yaw * 180 / Math.PI) % 360 + 360) % 360; this.posEl.textContent = `座標 x ${q.x.toFixed(1)}  y ${q.y.toFixed(1)}  z ${q.z.toFixed(1)} · 朝向 ${deg.toFixed(0)}°`; }
    for (const b of match.bots) {
      if (!b.alive) continue;
      _v.copy(b.motor.pos); _v.y += 2.1; _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue; // behind the camera or off screen
      const d = this.label(n++), ai = b.ai;
      d.style.display = ''; d.style.left = ((_v.x + 1) / 2 * w).toFixed(0) + 'px'; d.style.top = ((1 - _v.y) / 2 * h).toFixed(0) + 'px';
      if (text) {
        const tg = ai.target ? ` → ${ai.target.name}${ai.seeTarget ? ' 👁' : ''}` : '';
        d.textContent = `${b.name} · ${ai.state}${ai.goalKind ? ' (' + ai.goalKind + ')' : ''}${tg} · ${Math.ceil(b.hp)} HP`;
        d.style.color = TEAM_COL[b.team] || '#fff';
      }
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].style.display = 'none';
  }
  dispose() { this.el.remove(); }
}

export { AIDebug };

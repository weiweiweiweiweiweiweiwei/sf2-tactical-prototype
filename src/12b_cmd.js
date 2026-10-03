/* =====================================================================
   v25 USER COMMANDS — everything a human does in one fixed tick (1/120 s), as plain data: movement axes, view angles,
   held buttons and one-tick edges. The local player is simulated from these, and a remote player on the host from the
   same commands received over the network — so both run the exact same movement and weapon rules.
   ===================================================================== */
// held: CROUCH SPRINT FIRE ALT USE · edges (set only in the first command after the press): JUMP RELOAD GRAB INTERACT QUICK
const BTN = { JUMP: 1, CROUCH: 2, SPRINT: 4, FIRE: 8, ALT: 16, USE: 32, RELOAD: 64, GRAB: 128, INTERACT: 256, QUICK: 512 };
const BTN_EDGES = BTN.JUMP | BTN.RELOAD | BTN.GRAB | BTN.INTERACT | BTN.QUICK;

class UserCmd {
  constructor() { this.seq = 0; this.f = 0; this.r = 0; this.yaw = 0; this.pitch = 0; this.btn = 0; this.sw = 0; this.zoom = 0; }
  // f / r: −1, 0, 1 · yaw / pitch: aim angles in radians · sw: weapon index + 1 requested this tick (0 = none) · zoom: ADS level
  copy(o) { this.seq = o.seq; this.f = o.f; this.r = o.r; this.yaw = o.yaw; this.pitch = o.pitch; this.btn = o.btn; this.sw = o.sw; this.zoom = o.zoom; return this; }
}

// Samples the keyboard / mouse into one UserCmd per fixed tick. Presses that start and end between two ticks (a quick
// click, a tap of Space) are latched so they are never lost.
class CmdBuilder {
  constructor(input) { this.input = input; this.seq = 0; this.latched = 0; this.sw = 0; this.cmd = new UserCmd(); }
  reset() { this.latched = 0; this.sw = 0; }
  press(bit) { this.latched |= bit; }
  switchTo(i) { this.sw = i + 1; }
  build(player, ws, active) {
    const inp = this.input, c = this.cmd, k = (code) => inp.down(code);
    c.seq = ++this.seq; c.sw = 0; c.btn = 0; c.f = 0; c.r = 0;
    c.yaw = player.yaw; c.pitch = player.pitch; c.zoom = ws ? ws.zoomLevel : 0;
    if (active) {
      c.f = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      c.r = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      if (k('KeyC') || k('ControlLeft') || k('ControlRight')) c.btn |= BTN.CROUCH;
      if (k('ShiftLeft') || k('ShiftRight')) c.btn |= BTN.SPRINT;
      if (k('KeyE')) c.btn |= BTN.USE;
      if (inp.buttons[0]) c.btn |= BTN.FIRE;
      if (inp.buttons[2]) c.btn |= BTN.ALT;
      c.btn |= this.latched; c.sw = this.sw;
    }
    this.latched = 0; this.sw = 0;
    return c;
  }
}

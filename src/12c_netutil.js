import { THREE, WEAPON_DEFS } from './01_core.js';
/* =====================================================================
   v62s NETWORK HELPERS — the weapon index of the wire format, vector packing and the sanitising of other players' text,
   moved out of 18_net.js so the parts before it (net players, HUD, rules, match) import them without a cycle.
   ===================================================================== */
const NET_WEAPONS = Object.keys(WEAPON_DEFS), NET_WI = Object.fromEntries(NET_WEAPONS.map((k, i) => [k, i]));
const v3arr = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const netV3 = (a) => (Array.isArray(a) && a.length === 3 && a.every((x) => Number.isFinite(+x) && Math.abs(+x) < 1e4) ? new THREE.Vector3(+a[0], +a[1], +a[2]) : null);
// names and room fields come from other people's browsers: never let them carry markup into the page
const safeName = (s, d = 'Player') => String(s ?? '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 14) || d;
const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => `&#${c.charCodeAt(0)};`);

export { NET_WEAPONS, NET_WI, esc, netV3, safeName, v3arr };

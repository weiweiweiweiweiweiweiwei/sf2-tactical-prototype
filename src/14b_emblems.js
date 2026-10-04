/* =====================================================================
   v34 KILL EMBLEMS (SF2 style) — a silver star-burst medal pops up top-centre with its name, and a row of small medals
   collects along the bottom for the current life. Art is drawn here as SVG (no game assets); conditions follow the
   SF2 emblem list in docs/SF2_RESEARCH.md.
   ===================================================================== */
const EMB_HOLD = 1800; // ms each emblem stays (measured from SF2 gameplay video)
const EMBLEMS = {
  kill:        { name: 'Kill',          zh: '擊殺',     ray: '#9fb4c8', icon: 'cross' },
  headshot:    { name: 'Headshot',      zh: '爆頭',     ray: '#e04838', icon: 'skull' },
  first:       { name: 'First Kill',    zh: '首殺',     ray: '#f0b23a', icon: 'one', anim: 'slam' },
  revenge:     { name: 'Revenge',       zh: '復仇',     ray: '#e04838', icon: 'fist', anim: 'slam' },
  lastshot:    { name: 'Last One Shot', zh: '最後一發', ray: '#f0b23a', icon: 'bullet', anim: 'slam' },
  longshot:    { name: 'Long Shot',     zh: '遠距擊殺', ray: '#4aa3ff', icon: 'scope', anim: 'slam' },
  grenade:     { name: 'Grenade',       zh: '手榴彈',   ray: '#e07a2a', icon: 'nade', anim: 'slam' },
  wall:        { name: 'Wall Shot',     zh: '穿牆',     ray: '#4aa3ff', icon: 'wall', anim: 'slam' },
  pierce:      { name: 'Piercing Shot', zh: '貫穿',     ray: '#4aa3ff', icon: 'pierce', anim: 'slam' },
  slash:       { name: 'Slash',         zh: '背刺',     ray: '#e04838', icon: 'knife', anim: 'slam' },
  knife:       { name: 'Knife',         zh: '刀殺',     ray: '#9fb4c8', icon: 'knife' },
  grab:        { name: 'Takedown',      zh: '擒拿',     ray: '#9fb4c8', icon: 'fist' },
  fastzoom:    { name: 'Fast Zoom',     zh: '瞬G',      ray: '#4aa3ff', icon: 'zoom', anim: 'slam' },
  welcome:     { name: 'Welcome Back',  zh: '重返戰場', ray: '#5fd17a', icon: 'up', anim: 'slam' },
  love:        { name: 'Love Shot',     zh: '同歸於盡', ray: '#ff6fa8', icon: 'heart', anim: 'slam' },
  assist:      { name: 'Assist',        zh: '助攻',     ray: '#9fb4c8', icon: 'plus' },
  double:      { name: 'Double Kill',   zh: '雙殺',     ray: '#f0b23a', icon: 'n2', anim: 'slam', tier: 1 },
  multi:       { name: 'Multi Kill',    zh: '三殺',     ray: '#f0b23a', icon: 'n3', anim: 'slam', tier: 2 },
  specialist:  { name: 'Specialist',    zh: '四殺',     ray: '#e04838', icon: 'n4', anim: 'slam', tier: 3 },
  specialforce:{ name: 'Special Force', zh: '五殺',     ray: '#ffd23a', icon: 'n5', anim: 'slam', gold: true, tier: 4 },
};
const EMB_ICON = {
  cross: '<circle cx="50" cy="50" r="15" fill="none" stroke="#fff" stroke-width="4"/><path d="M50 28v14M50 58v14M28 50h14M58 50h14" stroke="#fff" stroke-width="4"/><circle cx="50" cy="50" r="3" fill="#e04838"/>',
  skull: '<path d="M50 30c-12 0-20 8-20 18 0 6 3 10 7 12v8h26v-8c4-2 7-6 7-12 0-10-8-18-20-18z" fill="#fff"/><circle cx="42" cy="49" r="5" fill="#111"/><circle cx="58" cy="49" r="5" fill="#111"/><path d="M47 58h6l-3 4z" fill="#111"/><path d="M43 64v4M50 64v4M57 64v4" stroke="#111" stroke-width="2"/><circle cx="62" cy="36" r="3.5" fill="#e04838"/>',
  one: '<text x="50" y="64" text-anchor="middle" font-size="40" font-weight="900" font-family="Arial Black,Arial" fill="#fff">1</text>',
  fist: '<path d="M36 46c0-4 3-6 6-6h18c5 0 8 3 8 7v9c0 8-6 14-14 14h-6c-7 0-12-5-12-12z" fill="#fff"/><path d="M42 40v10M49 40v10M56 40v10M62 42v9" stroke="#333" stroke-width="2"/><path d="M36 52h10" stroke="#333" stroke-width="2"/>',
  bullet: '<path d="M44 70V44c0-8 3-14 6-17 3 3 6 9 6 17v26z" fill="#f0c860"/><rect x="43" y="66" width="14" height="6" fill="#b8892c"/><text x="66" y="44" font-size="14" font-weight="900" fill="#fff" font-family="Arial">1</text>',
  scope: '<circle cx="50" cy="50" r="18" fill="none" stroke="#fff" stroke-width="3"/><path d="M50 32v36M32 50h36" stroke="#fff" stroke-width="1.5"/><path d="M50 38v6M50 56v6M38 50h6M56 50h6" stroke="#fff" stroke-width="4"/><circle cx="50" cy="50" r="2.5" fill="#e04838"/>',
  nade: '<ellipse cx="48" cy="55" rx="12" ry="15" fill="#6f7d4a" stroke="#fff" stroke-width="2"/><path d="M38 52h20M38 60h20M48 40v30" stroke="#465030" stroke-width="2"/><rect x="44" y="35" width="10" height="6" fill="#ccc"/><path d="M54 37q10-2 10 10" fill="none" stroke="#ccc" stroke-width="3"/><circle cx="40" cy="36" r="4" fill="none" stroke="#ccc" stroke-width="2"/>',
  wall: '<path d="M30 34h18v10H30zM50 34h18v10H50zM30 46h9v10h-9zM41 46h18v10H41zM61 46h7v10h-7zM30 58h18v10H30zM50 58h18v10H50z" fill="#b06a48" stroke="#fff" stroke-width="1.2"/><path d="M22 52h56" stroke="#ffd23a" stroke-width="3"/><path d="M74 48l6 4-6 4z" fill="#ffd23a"/>',
  pierce: '<circle cx="40" cy="44" r="7" fill="#fff"/><path d="M32 54h16v16H32z" fill="#fff"/><circle cx="60" cy="44" r="7" fill="#ccc"/><path d="M52 54h16v16H52z" fill="#ccc"/><path d="M20 58h60" stroke="#ffd23a" stroke-width="3"/>',
  knife: '<path d="M30 68l26-30c4-4 10-6 14-6-1 5-3 10-7 14L36 72z" fill="#e8eef4" stroke="#fff" stroke-width="1"/><path d="M30 68l-6 6 4 4 6-6z" fill="#333" stroke="#fff" stroke-width="1.5"/><path d="M28 62l10 10" stroke="#888" stroke-width="3"/>',
  zoom: '<circle cx="50" cy="50" r="18" fill="none" stroke="#fff" stroke-width="3"/><path d="M54 30L42 52h9l-5 18 14-24h-9z" fill="#ffd23a"/>',
  up: '<path d="M50 28l18 20H58v22H42V48H32z" fill="#5fd17a" stroke="#fff" stroke-width="2"/>',
  heart: '<path d="M50 70C30 56 30 38 40 36c5-1 8 2 10 6 2-4 5-7 10-6 10 2 10 20-10 34z" fill="#ff6fa8" stroke="#fff" stroke-width="2"/><path d="M26 64l48-28" stroke="#ffd23a" stroke-width="2.5"/>',
  plus: '<path d="M44 30h12v14h14v12H56v14H44V56H30V44h14z" fill="#fff"/>',
  n2: '', n3: '', n4: '', n5: '',
};
function emblemSVG(id) {
  const E = EMBLEMS[id] || EMBLEMS.kill, gold = !!E.gold, g = 'eg' + id;
  let star = '';
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 37 : 47; star += `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)} `; }
  let rays = '';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8; rays += `<path d="M50 50L${(50 + Math.cos(a - 0.1) * 46).toFixed(1)} ${(50 + Math.sin(a - 0.1) * 46).toFixed(1)}L${(50 + Math.cos(a + 0.1) * 46).toFixed(1)} ${(50 + Math.sin(a + 0.1) * 46).toFixed(1)}z" fill="${E.ray}" opacity=".85"/>`; }
  let icon = EMB_ICON[E.icon] || '';
  if (/^n\d$/.test(E.icon)) { const n = +E.icon[1];
    icon = `<text x="50" y="61" text-anchor="middle" font-size="30" font-weight="900" font-family="Arial Black,Arial" fill="#fff">×${n}</text>`;
    for (let i = 0; i < n; i++) icon += `<path transform="translate(${50 + (i - (n - 1) / 2) * 9 - 4} 30) scale(.4)" d="M10 0l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7z" fill="#ffd23a"/>`;
  }
  const c1 = gold ? '#fff3b8' : '#f4f7fa', c2 = gold ? '#c8901c' : '#7d8894';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<polygon points="${star}" fill="url(#${g})" stroke="#2a2f36" stroke-width="1.2"/>${rays}<circle cx="50" cy="50" r="27" fill="url(#${g})" stroke="#2a2f36" stroke-width="1.5"/>` +
    `<circle cx="50" cy="50" r="23" fill="#1c232c"/>${icon}</svg>`;
}

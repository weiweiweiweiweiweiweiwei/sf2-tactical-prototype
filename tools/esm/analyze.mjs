// v62s module check: in every src module, a name that is used but neither declared anywhere in the module nor imported nor a
// browser / JS global is a missing import (esbuild takes it for a global and it fails only when that line runs).
// Also: an import from a LATER part (src/main.js order) would let the modules run in another order than the old concatenation.
//   node tools/esm/analyze.mjs        → MODULES_OK or the list
import * as acorn from 'acorn'; import * as walk from 'acorn-walk'; import fs from 'node:fs';
const PARTS = [...fs.readFileSync('src/main.js', 'utf8').matchAll(/import '\.\/([^']+)'/g)].map((m) => m[1]);
const idx = Object.fromEntries(PARTS.map((f, i) => [f, i]));
const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat(['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'screen', 'history', 'Image', 'Audio', 'AudioContext',
  'OfflineAudioContext', 'webkitAudioContext', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent',
  'CustomEvent', 'DOMParser', 'XMLSerializer', 'FileReader', 'Blob', 'File', 'URL', 'URLSearchParams', 'Worker', 'OffscreenCanvas', 'ImageData',
  'ImageBitmap', 'createImageBitmap', 'getComputedStyle', 'matchMedia', 'alert', 'confirm', 'prompt', 'open', 'close', 'addEventListener',
  'removeEventListener', 'dispatchEvent', 'BroadcastChannel', 'RTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'WebSocket',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'DecompressionStream', 'CompressionStream', 'Response', 'Request', 'Headers',
  'fetch', 'crypto', 'indexedDB', 'Notification', 'speechSynthesis', 'SpeechSynthesisUtterance', 'Gamepad', 'getSelection', 'scrollTo', 'print',
  'GPUBufferUsage', 'queueMicrotask', 'structuredClone', 'atob', 'btoa', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'arguments', 'undefined', 'NaN', 'Infinity', 'globalThis', 'console', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'TextDecoder', 'TextEncoder',
  'AbortController', 'PointerEvent', 'WheelEvent', 'TouchEvent', 'Touch', 'DOMRect', 'Path2D', 'CanvasRenderingContext2D', 'visualViewport', 'origin', 'isSecureContext']));
function collect(p, out) { if (!p) return; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => collect(q.value || q.argument, out)); else if (p.type === 'ArrayPattern') p.elements.forEach((q) => collect(q, out)); else if (p.type === 'AssignmentPattern') collect(p.left, out); else if (p.type === 'RestElement') collect(p.argument, out); }
let bad = 0;
for (const f of PARTS) {
  const ast = acorn.parse(fs.readFileSync('src/' + f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }), declared = new Set(), missing = new Set();
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator') { const o = []; collect(n.id, o); o.forEach((x) => declared.add(x)); }
    else if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id) declared.add(n.id.name);
    if (n.params) for (const q of n.params) { const o = []; collect(q, o); o.forEach((x) => declared.add(x)); }
    if (n.type === 'CatchClause' && n.param) { const o = []; collect(n.param, o); o.forEach((x) => declared.add(x)); }
    if (n.type === 'ImportDeclaration') {
      for (const s of n.specifiers) declared.add(s.local.name);
      const m = n.source.value.match(/^\.\/(.+)$/); if (m && idx[m[1]] >= idx[f]) { console.log('LATER IMPORT', f, '←', m[1]); bad++; }
    }
  });
  walk.fullAncestor(ast, (n, _s, anc) => {
    if (n.type !== 'Identifier') return; const par = anc[anc.length - 2];
    if (par && par.type === 'MemberExpression' && par.property === n && !par.computed) return;
    if (par && (par.type === 'Property' || par.type === 'MethodDefinition' || par.type === 'PropertyDefinition') && par.key === n && !par.computed && !par.shorthand) return;
    if (par && (par.type === 'LabeledStatement' || par.type === 'BreakStatement' || par.type === 'ContinueStatement' || par.type === 'ExportSpecifier' && par.exported === n)) return;
    if (!declared.has(n.name) && !GLOBALS.has(n.name)) missing.add(n.name);
  });
  if (missing.size) { console.log('MISSING', f, [...missing].join(' ')); bad++; }
}
console.log(bad ? `MODULES_BAD ${bad}` : `MODULES_OK ${PARTS.length} parts`);

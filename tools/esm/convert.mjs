// v62s one-off: the concatenated src parts → ES modules. Each part imports, by name, what it uses from EARLIER parts (the build
// order has no forward references left — tools/esm/analyze.mjs) and exports what later parts use; src/main.js imports every part
// in the old order, so the modules run exactly as the concatenation did. 17_app.js's HTML tail moves to src/99_tail.html.
import * as acorn from 'acorn'; import * as walk from 'acorn-walk'; import fs from 'node:fs';
const PARTS = fs.readFileSync('src/build.sh', 'utf8').match(/PARTS="([^"]+)"/)[1].split(/\s+/).concat('17_app.js');
const raw = Object.fromEntries(PARTS.map((f) => [f, fs.readFileSync('src/' + f, 'utf8')]));
const cutAt = raw['17_app.js'].search(/^<\/script>/m), tail = raw['17_app.js'].slice(cutAt); raw['17_app.js'] = raw['17_app.js'].slice(0, cutAt);
function collect(p, out) { if (!p) return; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => collect(q.value || q.argument, out)); else if (p.type === 'ArrayPattern') p.elements.forEach((q) => collect(q, out)); else if (p.type === 'AssignmentPattern') collect(p.left, out); else if (p.type === 'RestElement') collect(p.argument, out); }
const decl = {}, own = {}, ast = {};
for (const f of PARTS) {
  ast[f] = acorn.parse(raw[f], { ecmaVersion: 'latest', sourceType: 'module' }); own[f] = [];
  for (const n of ast[f].body) {
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) collect(d.id, own[f]);
    else if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) own[f].push(n.id.name);
    else if (n.type === 'ImportDeclaration') for (const s of n.specifiers) own[f].push(s.local.name);
  }
  for (const nm of own[f]) decl[nm] = f;
}
const idx = Object.fromEntries(PARTS.map((f, i) => [f, i])), uses = {}, exported = {};
for (const f of PARTS) {
  const u = uses[f] = {};
  walk.fullAncestor(ast[f], (node, _s, anc) => {
    if (node.type !== 'Identifier') return;
    const par = anc[anc.length - 2];
    if (par && par.type === 'MemberExpression' && par.property === node && !par.computed) return;
    if (par && (par.type === 'Property' || par.type === 'MethodDefinition' || par.type === 'PropertyDefinition') && par.key === node && !par.computed && !par.shorthand) return;
    if (par && par.type === 'LabeledStatement' || par && (par.type === 'BreakStatement' || par.type === 'ContinueStatement')) return;
    const d = decl[node.name]; if (!d || d === f) return;
    if (idx[d] > idx[f]) throw new Error(`forward reference ${f} → ${node.name} (${d})`);
    (u[d] = u[d] || new Set()).add(node.name); (exported[d] = exported[d] || new Set()).add(node.name);
  });
}
for (const f of PARTS) {
  let s = raw[f];
  const imp = Object.entries(uses[f]).sort((a, b) => idx[a[0]] - idx[b[0]]).map(([d, set]) => `import { ${[...set].sort().join(', ')} } from './${d}';`).join('\n');
  const exp = exported[f] ? `\nexport { ${[...exported[f]].sort().join(', ')} };\n` : '';
  // imports after the part's opening block comment (01_core keeps its own package imports first)
  const m = s.match(/^\/\*[\s\S]*?\*\/\n/);
  if (imp) s = m && f !== '01_core.js' ? s.slice(0, m[0].length) + imp + '\n' + s.slice(m[0].length) : f === '01_core.js' ? s : imp + '\n' + s;
  s = s.replace(/\n*$/, '\n') + exp;
  fs.writeFileSync('src/' + f, s);
}
fs.writeFileSync('src/99_tail.html', tail);
fs.writeFileSync('src/main.js', '// v62s the entry: every part in the old concatenation order (tools/build.mjs bundles it into index.html)\n' + PARTS.map((f) => `import './${f}';`).join('\n') + '\n');
console.log('converted', PARTS.length, 'parts;', Object.values(exported).reduce((a, s) => a + s.size, 0), 'exports');

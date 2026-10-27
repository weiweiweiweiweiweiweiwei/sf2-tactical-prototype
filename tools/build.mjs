// v62s the build: src/ is ES modules (src/main.js imports every part in order); esbuild bundles them into ONE inline module
// script — 00_head.html + bundle + 99_tail.html → index.html, so the game still opens by double-click (file://) and on Pages.
// three / cannon-es stay external: the importmap in 00_head.html loads them from the CDN as before.
//   node tools/build.mjs [out.html]     (src/build.sh calls this)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), src = path.join(root, 'src');
const out = path.resolve(root, process.argv[2] || 'index.html');
let res;
try {
  res = await esbuild.build({
    entryPoints: [path.join(src, 'main.js')], bundle: true, write: false, format: 'esm', target: 'es2022', charset: 'utf8',
    external: ['three', 'three/addons/*', 'cannon-es'], keepNames: true, legalComments: 'none', logLevel: 'silent',
  });
} catch (e) { for (const m of e.errors || [e]) console.error(m.location ? `${m.location.file}:${m.location.line}: ${m.text}` : m.text || m); process.exit(1); }
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'); // (never end the inline script early)
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
fs.writeFileSync(out, read('00_head.html').replace(/\n*$/, '\n') + js + read('99_tail.html'));
console.log('BUILD_OK', path.relative(root, out), (fs.statSync(out).size / 1024).toFixed(0) + ' KB');

// Both Apex maps ship as script chunks (tools/pack-apex-js.mjs): a double-clicked index.html (file://) blocks fetch, not
// <script>. pack/index.js gives the bundle layout, each chunk decodes straight into one buffer, the parts come back as ArrayBuffers.
const APEX_PACK = window.APEX_PACK = {
  maps: {},
  layout(id, L) { this.maps[id] = Object.assign(L, { buf: new Uint8Array(L.bytes), got: 0 }); },
  chunk(id, i, b64) {
    const L = this.maps[id], at = i * L.chunk;
    if (Uint8Array.fromBase64) L.buf.set(Uint8Array.fromBase64(b64), at);
    else { const s = atob(b64); for (let j = 0; j < s.length; j++) L.buf[at + j] = s.charCodeAt(j); }
    L.got++;
  },
};
const apexScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.async = true;
  s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('Apex map data missing: ' + src)); };
  document.head.appendChild(s);
});
async function apexPack(id, dir) {
  await apexScript(dir + 'pack/index.js');
  const L = APEX_PACK.maps[id];
  await Promise.all(Array.from({ length: L.chunks }, (_, i) => apexScript(dir + 'pack/' + i + '.js')));
  delete APEX_PACK.maps[id];
  if (L.got !== L.chunks) throw new Error('Apex map data incomplete: ' + id);
  const parts = {}; for (const [k, [o, n]] of Object.entries(L.parts)) parts[k] = L.buf.buffer.slice(o, o + n);
  return parts;
}
// the packed GLBs carry Draco geometry; the decoder comes from the same three.js CDN as the other Blender maps
async function apexGLTF(buf) {
  const L = new GLTFLoader(), D = new DRACOLoader();
  D.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'); L.setDRACOLoader(D);
  try { return await L.parseAsync(buf, ''); } finally { D.dispose(); }
}

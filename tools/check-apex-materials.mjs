// Compare the new material pass against the shipped GLB; geometry must stay identical.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file='assets/maps/apex-test/region.glb';
function inspect(b){
 const len=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+len)),bin=b.subarray(28+len);
 const hash=createHash('sha256');
 for(const mesh of j.meshes) for(const p of mesh.primitives){
  for(const key of ['POSITION','NORMAL','TEXCOORD_0','indices']){
   const id=key==='indices'?p.indices:p.attributes[key];if(id===undefined)continue;
   const a=j.accessors[id],v=j.bufferViews[a.bufferView];
   hash.update(key+JSON.stringify([a.componentType,a.count,a.type,a.byteOffset||0,v.byteStride||0]));
   hash.update(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
  }
 }
 hash.update(JSON.stringify(j.nodes.map(n=>({name:n.name,mesh:n.mesh,children:n.children,matrix:n.matrix,translation:n.translation,rotation:n.rotation,scale:n.scale}))));
 const mats=j.materials;
 return {bytes:b.length,geometry:hash.digest('hex'),meshes:j.meshes.length,materials:mats.length,textured:mats.filter(m=>m.pbrMetallicRoughness?.baseColorTexture).length,alpha:mats.filter(m=>m.alphaMode&&m.alphaMode!=='OPAQUE').length};
}
const old=spawnSync('git',['show','0188f87:'+file],{maxBuffer:100*1024*1024});
assert.equal(old.status,0);
const before=inspect(old.stdout),after=inspect(fs.readFileSync(file));
assert.equal(after.geometry,before.geometry,'Geometry or placement changed');
assert.ok(after.textured>before.textured,'No color texture improvement');
assert.ok(after.bytes<100*1024*1024,'Exceeds regular GitHub file size');
const report={before,after,status:'passed'};
fs.writeFileSync('tools/out/apex/preview/material-artifact-check.json',JSON.stringify(report,null,2));
console.log(report);

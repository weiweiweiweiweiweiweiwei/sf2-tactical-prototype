// Full-range Apex collision: the 1 m raster (tools/out/apex/preview/full-boxes.bin) plus the verified 0.5 m village boxes,
// merged along x/z, written as assets/maps/apex-full/collision.bin — read by apexCollision() in src/07u_apex.js.
// Format: 'APXC', u32 version 1, u32 header length, JSON header, pad to 4, then Int16 boxes x0 y0 z0 x1 y1 z1
// (x/z in 1/header.xz m — the raster is 0.5 m aligned, so exact; y in 1/header.y m, rounded outward).
import fs from 'node:fs';
const root='assets/maps/apex-full/',fine=JSON.parse(fs.readFileSync('assets/maps/apex-test/collision.json'));
const bin=fs.readFileSync('tools/out/apex/preview/full-boxes.bin');
if(!bin.length||bin.length%24)throw Error('Incomplete collision raster');
let boxes=[];
for(let i=0;i<bin.length;i+=24)boxes.push(Array.from({length:6},(_,j)=>Math.round(bin.readFloatLE(i+j*4)*1000)/1000));
boxes.push(...fine.boxes);const before=boxes.length;
for(const axis of [0,2,0]){
 const groups=new Map(),other=[0,1,2,3,4,5].filter(i=>i!==axis&&i!==axis+3);
 for(const b of boxes){const key=other.map(i=>b[i]).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);}
 const result=[];for(const list of groups.values()){list.sort((a,b)=>a[axis]-b[axis]);let prev=null;for(const b of list){if(prev&&Math.abs(prev[axis+3]-b[axis])<1e-6)prev[axis+3]=b[axis+3];else{prev=b.slice();result.push(prev);}}}boxes=result;
}
const manifest=JSON.parse(fs.readFileSync(root+'manifest.json')),XZ=2,Y=50;
const header=Buffer.from(JSON.stringify({count:boxes.length,xz:XZ,y:Y,step:1,visualYOffset:-1,nav:fine.nav,bounds:manifest.bounds,
 limitations:'Conservative full-map 1m collision from simplified meshes; original village uses 0.5m collision. AI navigation remains in village.'}));
const start=(12+header.length+3)&~3,out=Buffer.alloc(start+boxes.length*12);
out.write('APXC',0,'latin1');out.writeUInt32LE(1,4);out.writeUInt32LE(header.length,8);header.copy(out,12);
const q=(v,s,round)=>{const n=round(v*s);if(n<-32768||n>32767)throw Error('Collision coordinate out of Int16 range: '+v);return n;};
boxes.forEach((b,i)=>{
 const o=start+i*12;
 for(const k of [0,2,3,5]){if(Math.abs(b[k]*XZ-Math.round(b[k]*XZ))>1e-6)throw Error('Box not on the 0.5 m grid: '+b);out.writeInt16LE(q(b[k],XZ,Math.round),o+k*2);}
 out.writeInt16LE(q(b[1],Y,v=>Math.floor(v+1e-6)),o+2);out.writeInt16LE(q(b[4],Y,v=>Math.ceil(v-1e-6)),o+8);
});
fs.writeFileSync(root+'collision.bin',out);
console.log({before,after:boxes.length,bytes:out.length});

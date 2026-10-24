import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root=process.cwd(),out=path.join(root,'tools/out/apex/preview');
const server=http.createServer((req,res)=>{
 if(new URL(req.url,'http://localhost').pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
 const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'};
 res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForFunction(()=>window.app&&window.SF2,null,{timeout:60000});
 await page.evaluate(async()=>{
  const S=SF2.Settings.data;S.quality='high';S.hdri=false;
  Object.assign(S.lobby,{map:SF2.MAPS.findIndex(m=>m.id==='apex_full'),rule:'tdm',allies:1,enemies:1});
  await app.startMatch();app.state='playing';
 });
 await page.waitForTimeout(1500);
 const report=await page.evaluate(()=>{
  const g=app.match,V=SF2.THREE.Vector3,w=g.collision,doors=g.builder.mechs[0],assert=(v,s)=>{if(!v)throw Error(s)};
  const result={visual:window.__apexFull,doors:[],floorSamples:[]};assert(doors.doors.length===27,'Door entity count mismatch');
  const human=g.player,saved=human.motor.pos.clone(),savedCombatants=g.combatants;g.combatants=[human];g.phase='live';g.app.hud.freeze(false);
  for(const d of doors.doors){
   const yaw=d.pivot.rotation.y,n=new V(Math.cos(yaw),0,-Math.sin(yaw));
   for(const angle of [0,1,2,3,4,5,6,7]){
    const pos=d.center.clone().add(new V(Math.cos(angle*Math.PI/4)*1.5,0,Math.sin(angle*Math.PI/4)*1.5));const ground=w.groundBelow(pos.x,d.base+2,pos.z,.3,5,.03);pos.y=(ground?ground.y:d.base)+.03;
    if(!w.fits(pos.x,pos.y,pos.z,human.motor.radius,human.motor.height))continue;
    human.motor.pos.copy(pos);
    if(doors.nearest(human)!==d)continue;
    const y=d.col.min.y,bodyY=d.body.position.y;
    assert(doors.interact(human),'E interaction failed');for(let i=0;i<100;i++)doors.tick(1/120);
    assert(d.k===1&&d.col.min.y>y+2.8,'Door failed to open collision');assert(d.body.position.y>bodyY+2.8,'Door physics did not follow');
    human.motor.pos.copy(d.center);human.motor.pos.y=d.base+.03;d.target=0;doors.tick(1/120);assert(d.target===1,'Door crushed occupant');
    human.motor.pos.copy(d.center).addScaledVector(n,4);d.target=0;for(let i=0;i<100;i++)doors.tick(1/120);assert(d.k===0&&Math.abs(d.col.min.y-y)<.001,'Door failed to close');
    result.doors.push({id:result.doors.length,position:d.center.toArray(),openClose:true,antiCrush:true});break;
   }
   if(result.doors.length>=5)break;
  }
  g.combatants=savedCombatants;assert(result.doors.length>=1,'No accessible interactive door verified');
  const Motor=human.motor.constructor;
  const P=w.packed.arr,packed=function*(){for(let j=0;j<P.length;j+=6)yield {min:{x:P[j],y:P[j+1],z:P[j+2]},max:{x:P[j+3],y:P[j+4],z:P[j+5]}};};
  for(const b of packed()){
   const x=(b.min.x+b.max.x)/2,z=(b.min.z+b.max.z)/2,y=b.max.y;
   if(Math.abs(x)<45&&Math.abs(z)<45||b.max.y-b.min.y>1||b.max.x-b.min.x<1||b.max.z-b.min.z<1)continue;
   if(result.floorSamples.some(p=>Math.hypot(p.x-x,p.z-z)<40)||!w.fits(x,y+.03,z,.4,5))continue;
   const m=new Motor(w);m.pos.set(x,y+2,z);m.prevPos.copy(m.pos);for(let i=0;i<200;i++)m.step(1/120,0,0,0);
   assert(m.grounded&&Math.abs(m.pos.y-y)<.1,'Outside floor unsupported');result.floorSamples.push({x,y,z});if(result.floorSamples.length>=12)break;
  }
  assert(result.floorSamples.length>=3,'Insufficient outside floor checks');
  human.motor.pos.copy(saved);result.spawnLOS=g.spawnLOS;
  return result;
 });
 await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'full-gameplay.png')});
 await page.evaluate(()=>{app.state='shot';app.shotT=0;app.match.scene.traverse(o=>{if(o.isMesh)o.visible=true;});});
 await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'full-overview.png')});
 await page.evaluate(()=>{const g=app.match;app.state='playing';g.player.motor.pos.set(g.def.bounds.maxX+5,10,0);g.player.spawnProtect=10;});
 await page.waitForTimeout(250);report.boundsDeath=await page.evaluate(()=>!app.match.player.alive);if(!report.boundsDeath)throw Error('Boundary death failed');
 report.errors=errors;if(errors.length)throw Error(errors.join('\n'));report.status='passed';fs.writeFileSync(path.join(out,'full-runtime-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({doors:report.doors.length,floors:report.floorSamples.length,boundsDeath:report.boundsDeath,visual:report.visual},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}

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
  Object.assign(S.lobby,{map:SF2.MAPS.findIndex(m=>m.id==='apex_test'),rule:'tdm',allies:1,enemies:1});
  await app.startMatch();app.state='playing';
 });
 await page.waitForTimeout(1500);
 const report=await page.evaluate(()=>{
  const g=app.match,p=g.player,V=SF2.THREE.Vector3,World=g.collision.constructor,Motor=p.motor.constructor;
  const saved={col:g.collision,m:p.motor};const assert=(v,s)=>{if(!v)throw Error(s)};
  const world=new World();world.addBox(new V(-100,-1,-100),new V(100,0,100));g.collision=world;p.motor=new Motor(world);g.phase='live';p.yaw=0;p.alive=true;
  const reset=()=>{p.motor.teleport(new V(0,.02,0));p.slideT=0;p.slideCd=0;p.crouchHeld=false;p.mantleT=0;p.airJumpUsed=false;};
  const step=(btn=0,f=0)=>p.fixedUpdate(1/120,{btn,f,r:0});
  reset();step(1);for(let i=0;i<30;i++)step();const first=p.motor.pos.y;step(1);const secondVelocity=p.motor.vel.y;for(let i=0;i<8;i++)step();step(1);assert(p.motor.vel.y<secondVelocity-.5,'Third jump must not refresh velocity');assert(p.airJumpUsed,'Second jump not consumed');
  reset();for(let i=0;i<100;i++)step(4,1);for(let i=0;i<360;i++)step(2|4,1);assert(p.slideT>0,'Held slide stopped early');const slideDistance=-p.motor.pos.z;assert(slideDistance>15,'Slide did not move');step(0);assert(p.slideT===0,'Slide did not release');
  reset();world.addBox(new V(-2,0,-2),new V(2,2.1,-.5));step(1,1);assert(p.mantleT>0,'High mantle failed');for(let i=0;i<45;i++)step();assert(p.motor.pos.y>=2,'Mantle did not reach ledge');
  reset();world.addBox(new V(-2,2.4,-1),new V(2,2.7,1));assert(!p._ledge(.5,2.3),'Mantle passed through low ceiling');
  g.collision=saved.col;p.motor=saved.m;p.motor.pos.y=g.def.killY-2;p.motor.vel.set(0,0,0);p.spawnProtect=10;
  return {firstJumpHeight:first,secondVelocity,slideDistance,highMantle:true,ceilingBlocked:true};
 });
 await page.waitForTimeout(200);
 report.voidDeath=await page.evaluate(()=>!app.match.player.alive&&app.match.player.hp<=0);
 if(!report.voidDeath)throw Error('Void death failed');if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(out,'traversal-report.json'),JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();await new Promise(r=>server.close(r));}

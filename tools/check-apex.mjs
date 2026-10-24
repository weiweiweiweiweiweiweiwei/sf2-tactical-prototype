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
  const g=app.match,w=g.collision,V=SF2.THREE.Vector3,Motor=g.player.motor.constructor;
  const assert=(v,s)=>{if(!v)throw Error(s);};
  const result={visual:window.__apexImport,spawns:{},drops:[],walks:[],wallChecks:[]};
  assert(result.visual.visualBatches<result.visual.sourceMeshObjects*.25,'Visual batching ineffective');
  for(const team of ['alpha','bravo']){
   const pts=g.spawns[team].pts;assert(pts.length>0,'Empty spawn '+team);result.spawns[team]=pts.map(p=>p.toArray());
   for(const p of pts){assert(w.fits(p.x,p.y+.05,p.z,.42,1.8),'Spawn intersects collision');assert(w.groundBelow(p.x,p.y+.1,p.z,.3,.3),'Spawn has no support');}
   const p=g.nav.valid.map(n=>n.p).filter(p=>w.fits(p.x,p.y+.03,p.z,.35,5)).sort((a,b)=>a.distanceTo(pts[0])-b.distanceTo(pts[0]))[0];
   assert(p,'No open headroom for controlled drop');
   const m=new Motor(w);m.pos.copy(p).add(new V(0,3,0));m.prevPos.copy(m.pos);
   for(let i=0;i<180;i++)m.step(1/60,0,0,0);
   assert(m.grounded&&Math.abs(m.pos.y-p.y)<.2,'Drop test failed '+team+' '+JSON.stringify({expected:p.y,actual:m.pos.y,grounded:m.grounded}));result.drops.push({team,deltaY:m.pos.y-p.y,grounded:m.grounded});
   const sphere=new SF2.THREE.Mesh(new SF2.THREE.SphereGeometry(.05),new SF2.THREE.MeshBasicMaterial());
   const dyn=g.physics.grenadeBody(sphere,new V(p.x,p.y+1,p.z),new V());
   for(let i=0;i<180;i++)g.physics.world.step(1/60);
   const sphereHeight=dyn.body.position.y-p.y;
   assert(sphereHeight>-.05&&sphereHeight<.3,'Physics sphere fell through imported floor');
   result.drops[result.drops.length-1].physicsSphereHeight=sphereHeight;
   g.physics.remove(dyn);
  }
  assert(g.spawnLOS.visible===0,'Enemy spawn line of sight');
  for(const a of g.nav.valid){
   for(const edge of a.edges){const b=g.nav.nodes[edge.to];if(!b.ok||a.p.distanceTo(b.p)>2.9||Math.abs(a.p.y-b.p.y)>.15)continue;
    const m=new Motor(w);m.teleport(a.p);const d=b.p.clone().sub(a.p);d.y=0;const distance=d.length();d.normalize();
    for(let i=0;i<Math.ceil((distance/3+.3)*60);i++){const remain=b.p.clone().sub(m.pos);remain.y=0;if(remain.length()<.12)break;remain.normalize();m.step(1/60,remain.x,remain.z,3);}
    const remaining=Math.hypot(m.pos.x-b.p.x,m.pos.z-b.p.z);
    assert(remaining<.5&&Math.abs(m.pos.y-b.p.y)<.5,'Navigation movement blocked');result.walks.push({distance,remaining});break;
   }if(result.walks.length>=20)break;
  }
  assert(result.walks.length>=10,'Too few walkable movement checks');
  for(const b of w.boxes){
   if(b.max.y-b.min.y<2||b.max.z-b.min.z<.45)continue;
   const x=b.min.x-.5,z=(b.min.z+b.max.z)/2;
   const ground=w.groundBelow(x,b.min.y+.5,z,.3,2);
   if(!ground||ground.y+1.7>b.max.y||!w.fits(x,ground.y+.03,z,.35,1.8))continue;
   const m=new Motor(w);m.teleport(new V(x,ground.y,z));
   for(let i=0;i<90;i++)m.step(1/60,1,0,3);
   assert(m.pos.x<=b.min.x-m.radius+.03,'Character passed through wall');
   result.wallChecks.push({wallX:b.min.x,stoppedX:m.pos.x});if(result.wallChecks.length>=10)break;
  }
  assert(result.wallChecks.length>=5,'Too few wall tests');
  result.navNodes=g.nav.valid.length;result.spawnLOS=g.spawnLOS;return result;
 });
 await page.waitForTimeout(3000);
 await page.screenshot({path:path.join(out,'gameplay-verified.png')});
 report.errors=errors;report.status=errors.length?'failed':'passed';
 fs.writeFileSync(path.join(out,'abc-runtime-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r));}

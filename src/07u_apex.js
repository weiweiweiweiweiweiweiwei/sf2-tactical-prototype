// Local imported test region: visual batches and separately baked collision columns.
async function apexPreload(def) {
  if (def._apex) return;
  const root = 'assets/maps/apex-test/';
  const [data, gltf] = await Promise.all([
    fetch(root + 'collision.json').then(r => { if (!r.ok) throw new Error('Apex collision data unavailable'); return r.json(); }),
    new GLTFLoader().loadAsync(root + 'region.glb?v=materials2'),
  ]);
  def._apex = { data, gltf };
}
function apexSpawns(team, game) {
  if (!game._apexSpawns) {
    const nodes = game.nav.valid.map(n => n.p).filter(p => game.collision.fits(p.x,p.y+.05,p.z,.42,1.8));
    if (nodes.length < 2) throw new Error('Apex test region has no connected safe spawn points');
    const eye = p => new THREE.Vector3(p.x,p.y+1.6,p.z);
    let pair = null, best = 0;
    for (const a of nodes) for (const b of nodes) {
      const d = a.distanceTo(b);
      if (d < 20 || d <= best || game.collision.segmentClear(eye(a),eye(b))) continue;
      pair = [a,b]; best = d;
    }
    if (!pair) throw new Error('Apex test region has no occluded spawn pair');
    const groups = pair.map(p => [p.clone()]);
    for (let t=0;t<2;t++) for (const p of nodes) {
      if (groups[t].length >= 8 || p.distanceTo(pair[t])>7 || groups[t].some(q=>q.distanceTo(p)<1.1)) continue;
      if (groups[1-t].some(q=>game.collision.segmentClear(eye(p),eye(q)))) continue;
      groups[t].push(p.clone());
    }
    game._apexSpawns = groups.map((pts,t)=>({pts,yaw:Math.atan2(pair[t].x-pair[1-t].x,pair[t].z-pair[1-t].z)}));
  }
  return game._apexSpawns[team==='alpha'?0:1];
}
MAPS.push({
  id:'apex_test',name:'Apex 訓練場・測試區',en:'APEX IMPORT TEST',
  desc:'本機測試 · 部分材質 · 近似碰撞 · 80×80',slogan:'匯入驗證 · 建築與地形移動測試',
  bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},indoor:false,navLevels:[],
  background:0x9daeb9,envIntensity:.6,exposure:.8,
  sun:{pos:[-20,70,25],color:0xfff0d5,intensity:2},hemi:[0xdce8f2,0x665b49,1.2],
  fog:{color:0x9daeb9,near:100,far:220},acoustics:'outdoor',ambience:'wind',
  shot:{pos:[-20,35,30],target:[0,2,0]},
  objectives:{dom:[[-20,0,0],[0,0,0],[20,0,0]],relic:[0,0,0],domRadius:3.6},
  preload(){return apexPreload(this);},spawnPoints:apexSpawns,
  build(b){
    b.spawnZone('alpha',-30,-30,-24,-24,0); b.spawnZone('bravo',24,24,30,30,Math.PI);
    if(b.dry) return;
    const {data,gltf}=this._apex;
    for(const a of data.boxes) b.col.addBox(new THREE.Vector3(a[0],a[1],a[2]),new THREE.Vector3(a[3],a[4],a[5]),{material:'concrete'});
    // Spatially grouped compound bodies keep grenades and dropped objects on the same surfaces.
    const compounds=new Map();
    for(const a of data.boxes){
      const x=(a[0]+a[3])/2,y=(a[1]+a[4])/2,z=(a[2]+a[5])/2;
      const key=Math.floor(x/4)+','+Math.floor(z/4);
      let body=compounds.get(key);
      if(!body){body=new CANNON.Body({mass:0,type:CANNON.Body.STATIC,material:b.phys.matDefault});body.position.set(Math.floor(x/4)*4,0,Math.floor(z/4)*4);compounds.set(key,body);}
      body.addShape(new CANNON.Box(new CANNON.Vec3((a[3]-a[0])/2,(a[4]-a[1])/2,(a[5]-a[2])/2)),new CANNON.Vec3(x-body.position.x,y,z-body.position.z));
    }
    for(const body of compounds.values())b.phys.world.addBody(body);
    // Visible perimeter marks the cropped region and prevents stepping into missing geometry.
    for(const a of [[-41,-20,-41,-40,65,41],[40,-20,-41,41,65,41],[-40,-20,-41,40,65,-40],[-40,-20,40,40,65,41]]){
      b.col.addBox(new THREE.Vector3(...a.slice(0,3)),new THREE.Vector3(...a.slice(3)),{material:'metal'});
      b.box(a[0],-2,a[2],a[3],3,a[5],'darkSteel',{radar:'wall'});
    }
    for(const p of data.nav) b.navExtra.push(new THREE.Vector3(...p));
    for(const p of data.nav.filter((_,i)=>i%12===0)) b.waypoints.push(new THREE.Vector3(...p));
    gltf.scene.updateMatrixWorld(true);
    let before=0;
    gltf.scene.traverse(o=>{
      if(!o.isMesh)return;
      before++;
      const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);geo.translate(0,data.visualYOffset,0);
      const mats=Array.isArray(o.material)?o.material:[o.material];
      // Keep authored fallback colors and alpha from the material restoration pass.
      const groups=Array.isArray(o.material)?geo.groups:[{start:0,count:geo.attributes.position.count,materialIndex:0}];
      for(const group of groups){
        const part=new THREE.BufferGeometry();
        for(const key of ['position','normal','uv']){
          const a=geo.getAttribute(key);if(!a)continue;
          part.setAttribute(key,new THREE.BufferAttribute(a.array.slice(group.start*a.itemSize,(group.start+group.count)*a.itemSize),a.itemSize));
        }
        if(!part.getAttribute('normal'))part.computeVertexNormals();
        if(!part.getAttribute('uv'))part.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(group.count*2),2));
        b._batch(mats[group.materialIndex],part,true);
      }
      geo.dispose();
    });
    window.__apexImport={sourceMeshObjects:before,visualBatches:b.batches.size,collisionBoxes:data.boxes.length,navCandidates:data.nav.length};
  }
});

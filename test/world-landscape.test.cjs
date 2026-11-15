'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const map=require('../remote/world-model'),g=require('../remote/world-generators'),preset=require('../world-presets');
const empty=()=>({chunks:{},objects:[],generators:[]});
const recipe=(biome,orientation=0)=>({id:'plot-a',kind:'forest',version:1,seed:71,params:{biome,orientation,density:80,
  points:[{x:-12,y:-9},{x:8,y:-9},{x:8,y:5},{x:-12,y:5}]}});
function apply(draft,change,back=false){
  for(const tile of change.tiles || [])map.set(draft.chunks,tile.x,tile.y,back?tile.before:tile.after);
  if(change.objects)draft.objects=change.objects[back?'before':'after'];
  if(change.generators)draft.generators=change.generators[back?'before':'after'];
}
const count=chunks=>Object.values(chunks).reduce((n,c)=>n+Object.keys(c).length,0);

test('seven polygon landscapes are deterministic and keep roads, water, obstacles and out-of-polygon cells intact',()=>{
  for(const biome of Object.keys(g.plotBiomes)){
    const draft=empty();map.set(draft.chunks,-3,0,'path');map.set(draft.chunks,-4,0,'water');
    draft.objects.push({id:'manual',kind:'barrel',x:0,y:0,turn:0});
    const r=recipe(biome);r.params.points=[{x:-12,y:-9},{x:8,y:-9},{x:8,y:0},{x:0,y:0},{x:0,y:5},{x:-12,y:5}];
    const before=structuredClone(draft),change=g.generationChange(r,draft),again=g.generationChange(r,draft);
    assert.deepEqual(change,again);assert.deepEqual(draft,before);assert.ok(g.validGenerators(change.generators.after));
    assert.equal(map.get(change.chunks,-3,0),'path');assert.equal(map.get(change.chunks,-4,0),'water');
    assert.equal(map.get(change.chunks,6,4),undefined,'concave cutout is not filled');
    assert.equal(map.get(change.chunks,0,0),undefined,'manual object keeps its ground');
    const plants=change.objects.after.filter(p=>p.id!=='manual');assert.ok(plants.length>0);
    assert.ok(plants.every(p=>g.plotBiomes[biome].kinds.includes(p.kind)));
    assert.equal(new Set(plants.map(p=>p.x+','+p.y)).size,plants.length);
  }
});

test('crop rows rotate, orchard trees retain spacing and density changes preserve the seeded subset',()=>{
  for(const biome of ['field','garden','orchard','graveyard'])for(const orientation of [0,1]){
    const high={...recipe(biome,orientation),params:{...recipe(biome,orientation).params,density:100}};
    const low={...high,params:{...high.params,density:10}};
    const a=g.generateForest(high,empty()).plants,b=g.generateForest(low,empty()).plants;
    assert.ok(a.length>b.length);assert.ok(b.every(p=>a.some(q=>q.id===p.id)));
    for(const p of a){const row=orientation?p.x:p.y,col=orientation?p.y:p.x;
      if(['field','garden'].includes(biome)){assert.notEqual((row%3+3)%3,2);assert.equal(p.turn,orientation);}
      else{assert.equal((row%3+3)%3,0);assert.equal((col%3+3)%3,0);}
    }
  }
});

test('switching a field to a garden preserves manual moves, secrets and ground through history and serialization',()=>{
  let draft=empty();apply(draft,g.generationChange(recipe('field'),draft));
  const wheat=draft.objects[0],removed=draft.objects[1];
  apply(draft,g.protectManualChanges(draft,{objects:{before:draft.objects,after:draft.objects.filter(p=>p.id!==removed.id).map(p=>p.id===wheat.id?{...p,x:30,y:30,hidden:true}:p)},tiles:[{x:-10,y:-6,before:map.get(draft.chunks,-10,-6),after:'stone'}]}));
  draft=JSON.parse(JSON.stringify(draft));const before=structuredClone(draft),change=g.generationChange(recipe('garden',1),draft);
  apply(draft,change);const after=structuredClone(draft);
  assert.equal(draft.objects.find(p=>p.id===wheat.id).hidden,true);assert.equal(draft.objects.find(p=>p.id===wheat.id).x,30);
  assert.ok(!draft.objects.some(p=>p.id===removed.id));assert.equal(map.get(draft.chunks,-10,-6),'stone');
  assert.ok(draft.objects.some(p=>p.kind==='crops'));assert.ok(g.validGenerators(draft.generators));
  apply(draft,change,true);assert.deepEqual(draft,before);apply(draft,change);assert.deepEqual(draft,after);
});

test('landscape parameters and ownership are strict; village is independent, editable and within storage limits',()=>{
  for(const biome of [null,{},['pine'],'__proto__','bad',false])assert.equal(g.validGenerators([recipe(biome)]),false);
  for(const orientation of [-1,2,'0',null])assert.equal(g.validGenerators([recipe('field',orientation)]),false);
  const change=g.generationChange(recipe('field'),empty());change.generators.after[0].state.objects[0].kind='house';assert.equal(g.validGenerators(change.generators.after),false);
  const a=preset('village'),b=preset('village');assert.deepEqual(a,b);assert.ok(g.validGenerators(a.generators));
  assert.equal(a.generators.length,11);assert.ok(a.objects.length>400 && a.objects.length<map.objectLimit);assert.ok(count(a.chunks)<map.tileLimit);
  for(const kind of ['house','tavern','bridge','marketStall','stoneTower','wheat','crops','grave','pine','fountain'])assert.ok(a.objects.some(p=>p.kind===kind),kind);
  a.objects[0].hidden=true;assert.equal(b.objects[0].hidden,false);
});

test('legacy forest output matches the last released generator byte for byte',()=>{
  const r=recipe('forest');r.id='legacy-plot';delete r.params.biome;delete r.params.orientation;r.params.density=67;
  const hash=crypto.createHash('sha256').update(JSON.stringify(g.generateForest(r,empty()))).digest('hex');
  assert.equal(hash,'f7041a6ec28a3ecae80813bb971f7fbb111995fe24c2d754558047caa0b03f22');
});

test('export plans validate area, resolution and memory before creating a canvas',()=>{
  assert.deepEqual(map.exportPlan({left:-10,top:-5,right:10,bottom:5},64),{left:-10,top:-5,right:10,bottom:5,width:1280,height:640,pixelsPerCell:64});
  for(const area of [{left:0,top:0,right:0,bottom:5},{left:0,top:0,right:9000,bottom:5},{left:0.5,top:0,right:5,bottom:5},{left:0,top:0,right:100,bottom:100}])assert.throws(()=>map.exportPlan(area,128),RangeError);
  assert.throws(()=>map.exportPlan({left:0,top:0,right:5,bottom:5},63),RangeError);
});

test('PNG rendering clips to the chosen area, filters hidden props and never paints editor marks or tokens',async()=>{
  const painted=[],tiles=[],ctx=new Proxy({},{get:(obj,key)=>obj[key]||(()=>{}),set:(obj,key,v)=>(obj[key]=v,true)});
  const blob={type:'image/png'},canvas={getContext:()=>ctx,toBlob(fn,type){assert.equal(type,'image/png');fn(blob);}};
  const window={WorldMap:map,WorldArt:{paintTile(...args){tiles.push(args[5]);},paintProp(ctx,p,selected){painted.push(p);assert.equal(selected,false);}}};
  const globals={window,document:{createElement:()=>canvas}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),globals);
  const layout={chunks:{},objects:[{id:'visible',kind:'pine',x:-1,y:-1,turn:0},{id:'secret',kind:'crate',x:0,y:0,turn:0,hidden:true},{id:'outside',kind:'house',x:20,y:20,turn:0}],tokens:[{id:'hero',x:0,y:0}]};
  map.set(layout.chunks,-1,-1,'grass');
  assert.equal(await window.createWorldView.exportImage(layout,{area:{left:-2,top:-2,right:2,bottom:2},pixelsPerCell:64,grid:'square'}),blob);
  assert.equal(canvas.width,256);assert.equal(canvas.height,256);assert.deepEqual(painted.map(p=>p.id),['visible']);assert.deepEqual(Array.from(tiles[0]),[64,64,64,64]);
  painted.length=0;await window.createWorldView.exportImage(layout,{area:{left:-2,top:-2,right:2,bottom:2},pixelsPerCell:32,grid:'hex',includeHidden:true});
  assert.deepEqual(painted.map(p=>p.id),['visible','secret']);assert.equal(painted[1].hidden,false);assert.equal(layout.objects[1].hidden,true);
  await assert.rejects(window.createWorldView.exportImage(layout,{area:{left:0,top:0,right:1000,bottom:1000},pixelsPerCell:128,grid:'none'}),RangeError);
});

test('new tall scenery blocks its real footprint and sight while decorative crops and flowers stay walkable',t=>{
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-scenery-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=name=>path.join(dir,name),store=require('../world-store')(file),movement=require('../world-movement')(store,file);
  const layout={id:'73000000-0000-4000-8000-000000000001',name:'Scenery',revision:0,chunks:{},objects:[]};
  for(const kind of ['pine','appleTree','deadTree','stoneTower','fountain','marketStall','statue','wheat','crops','flowers','reeds','grave','hay'])for(let turn=0;turn<4;turn++){
    const prop={id:'prop',kind,x:0,y:0,turn},b=map.cellBounds(prop),decorative=['wheat','crops','flowers','reeds','grave','hay'].includes(kind);
    layout.objects=[prop];store.writeDraft(layout);
    assert.equal(movement.canStep({...map.sceneScope(layout),x:0,y:0},false),decorative,kind);
    const origin={...map.sceneScope(layout),x:b.left-1,y:b.top},target={x:b.right+1,y:b.top};
    assert.equal(movement.visibleCells(origin,[prop],new Set()).some(p=>p.x===target.x && p.y===target.y),decorative,kind+' sight');
  }
});

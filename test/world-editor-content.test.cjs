'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const map=require('../remote/world-model');
const g=require('../remote/world-generators');
const preset=require('../world-presets');
const empty=()=>({chunks:{},objects:[],generators:[]});
const points=coords=>coords.map(([x,y])=>({x,y}));
const room=(theme,seed=17)=>({id:'content-room',kind:'room',version:1,seed,
 params:{floor:'wood',furnishing:theme,points:points([[-10,-8],[10,-8],[10,8],[-10,8]]),entrance:{x:0,y:8}}});
function apply(draft,change,back=false){
 for(const c of change.tiles || [])map.set(draft.chunks,c.x,c.y,back?c.before:c.after);
 if(change.objects)draft.objects=back?change.objects.before:change.objects.after;
 if(change.generators)draft.generators=back?change.generators.before:change.generators.after;
}
const path=(kind,coords=[[-8,-3],[8,-3],[8,8]])=>({id:'content-path',kind:'path',version:1,seed:0,params:{terrain:kind,width:1,points:points(coords)}});
const propCells=prop=>{const b=map.cellBounds(prop),result=[];for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)result.push(x+','+y);return result;};

test('structural Path produces actual contiguous barriers in all directions without painting terrain',()=>{
 for(const kind of ['wall','fence','palisade'])for(const coords of [
  [[-8,-3],[8,-3],[8,8]],[[8,8],[8,-3],[-8,-3]],[[-5,-5],[7,8]],[[8190,8190],[8191,8191]],
  [[0,0],[5,0],[0,0],[0,5]]]){
  const recipe=path(kind,coords),out=g.generatePath(recipe),before=empty();
  assert.deepEqual(out,g.generatePath(recipe));assert.deepEqual(out.chunks,{});assert.ok(out.objects.length);
  const occupied=new Set();for(const prop of out.objects){assert.equal(prop.kind,kind);for(const [x,y] of map.wallCells(prop)){assert.ok(map.valid(x)&&map.valid(y));occupied.add(x+','+y);}}
  for(const p of recipe.params.points)assert.ok(occupied.has(p.x+','+p.y));
  const seen=new Set(),queue=[occupied.values().next().value];for(let i=0;i<queue.length;i++){
   const key=queue[i];if(seen.has(key)||!occupied.has(key))continue;seen.add(key);const [x,y]=key.split(',').map(Number);
   queue.push((x-1)+','+y,(x+1)+','+y,x+','+(y-1),x+','+(y+1));
  }assert.equal(seen.size,occupied.size);const change=g.generationChange(recipe,before);assert.ok(change.count>0);apply(before,change);assert.ok(g.validGenerators(before.generators));
 }
});

test('structural paths preserve water, obstacles and foreign/protected cells and enforce admission atomically',()=>{
 const draft=empty();map.set(draft.chunks,0,0,'water');draft.objects=[{id:'manual',kind:'crate',x:4,y:0,turn:0}];
 const source=structuredClone(draft),out=g.generatePath(path('fence',[[-5,0],[9,0]]),draft);
 assert.ok(out.objects.every(p=>!propCells(p).includes('0,0')&&!propCells(p).includes('4,0')));assert.deepEqual(draft,source);
 const crowded={...empty(),objects:Array.from({length:map.objectLimit},(_,i)=>({id:'barrel-'+i,kind:'barrel',x:100,y:100,turn:0}))};
 assert.throws(()=>g.generationChange(path('wall'),crowded),RangeError);assert.equal(crowded.objects.length,map.objectLimit);
 assert.equal(g.validGenerators([{...path('wall'),params:{...path('wall').params,width:3}}]),false);
 assert.equal(g.validGenerators([{...path('invalid')}]),false);
});

test('barrier regeneration preserves manual removals, hidden and moved pieces through save and history',()=>{
 let draft=empty();const recipe=path('wall');apply(draft,g.generationChange(recipe,draft));
 const [removed,moved,hidden]=draft.objects;
 const after=draft.objects.filter(p=>p.id!==removed.id).map(p=>p.id===moved.id?{...p,x:50,y:50}:p.id===hidden.id?{...p,hidden:true}:p);
 apply(draft,g.protectManualChanges(draft,{objects:{before:draft.objects,after}}));draft=JSON.parse(JSON.stringify(draft));
 const before=structuredClone(draft),change=g.generationChange(recipe,draft);apply(draft,change);
 assert.ok(!draft.objects.some(p=>p.id===removed.id));assert.equal(draft.objects.find(p=>p.id===moved.id).x,50);assert.equal(draft.objects.find(p=>p.id===hidden.id).hidden,true);
 const regenerated=structuredClone(draft);apply(draft,change,true);assert.deepEqual(draft,before);apply(draft,change);assert.deepEqual(draft,regenerated);
 const road=g.generationChange(path('path'),draft);apply(draft,road);assert.equal(map.get(draft.chunks,-8,-3),'path');assert.ok(g.validGenerators(draft.generators));
});

function assertWalkableInterior(output,recipe){
 const walls=new Set(output.objects.filter(p=>p.kind==='wall').flatMap(p=>map.wallCells(p).map(c=>c.join(','))));
 const blocked=new Set(output.objects.filter(p=>p.kind!=='wall'&&p.kind!=='door'&&p.kind!=='rug').flatMap(propCells));
 const floor=new Set();for(const [key,cells] of Object.entries(output.chunks)){const [cx,cy]=key.split(',').map(Number);for(const index of Object.keys(cells))floor.add((cx*32+Number(index)%32)+','+(cy*32+Math.floor(Number(index)/32)));}
 const free=new Set([...floor].filter(k=>!walls.has(k)&&!blocked.has(k)));const seen=new Set(),queue=[recipe.params.entrance];
 for(let i=0;i<queue.length;i++){const p=queue[i],key=p.x+','+p.y;if(seen.has(key)||!free.has(key))continue;seen.add(key);queue.push({x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1});}
 assert.equal(seen.size,free.size,'furniture cannot isolate floor cells from the entrance');
 const used=new Set();for(const prop of output.objects.filter(p=>p.kind!=='wall'&&p.kind!=='door'&&p.kind!=='rug'))for(const key of propCells(prop)){
  assert.ok(floor.has(key)&&!walls.has(key));assert.ok(!used.has(key),'furniture footprints cannot overlap');used.add(key);
 }
}

test('six room themes create deterministic distinct furnishings, clear entrances and connected passages',()=>{
 const expected={tavern:'bench',bedroom:'bed',library:'bookshelf',storeroom:'crate',crypt:'sarcophagus',workshop:'chair'};
 for(const [theme,kind] of Object.entries(expected))for(const seed of [0,17,4294967295]){
  const recipe=room(theme,seed),source=empty(),out=g.generateRoom(recipe,source);
  assert.ok(out.objects.some(p=>p.kind===kind),theme);assert.deepEqual(out,g.generateRoom(recipe,source));assert.deepEqual(source,empty());assertWalkableInterior(out,recipe);
  const reversed={...recipe,params:{...recipe.params,points:[...recipe.params.points].reverse()}};assert.deepEqual(out,g.generateRoom(reversed,source));
  const change=g.generationChange(recipe,source);assert.ok(g.validGenerators(change.generators.after));
  const rugCells=new Set();for(const rug of out.objects.filter(p=>p.kind==='rug'))for(const key of propCells(rug)){assert.ok(!rugCells.has(key),'rugs do not overlap one another');rugCells.add(key);}
 }
 assert.notDeepEqual(g.generateRoom(room('tavern',0),empty()).objects,g.generateRoom(room('tavern',17),empty()).objects);
});

test('furnishing supports concave and small rooms, legacy bare rooms and strict theme/state validation',()=>{
 for(const theme of Object.keys(g.roomThemes))for(const shape of [
  {points:points([[0,0],[8,0],[8,4],[4,4],[4,9],[0,9]]),entrance:{x:0,y:2}},
  {points:points([[0,0],[4,0],[4,4],[0,4]]),entrance:{x:2,y:0}}]){
  const recipe={...room(theme),params:{...room(theme).params,...shape}};assertWalkableInterior(g.generateRoom(recipe,empty()),recipe);
 }
 const legacy=room('none');delete legacy.params.furnishing;assert.deepEqual(g.generateRoom(legacy,empty()),g.generateRoom(room('none'),empty()));
 for(const theme of ['__proto__','bad',{},null])assert.equal(g.validGenerators([room(theme)]),false);
 const bare=g.generationChange(legacy,empty()).generators.after[0];bare.state.objects.push({id:'injected',kind:'bookshelf',x:0,y:0,turn:0,hidden:false});assert.equal(g.validGenerators([bare]),false);
});

test('theme regeneration keeps manually changed furniture, erasures and independent history without duplicates',()=>{
 let draft=empty();apply(draft,g.generationChange(room('bedroom'),draft));
 const bed=draft.objects.find(p=>p.kind==='bed'),chest=draft.objects.find(p=>p.kind==='chest');
 apply(draft,g.protectManualChanges(draft,{objects:{before:draft.objects,after:draft.objects.filter(p=>p.id!==chest.id).map(p=>p.id===bed.id?{...p,x:30,y:30,hidden:true}:p)},tiles:[{x:0,y:0,before:'wood',after:'stone'}]}));
 draft=JSON.parse(JSON.stringify(draft));const before=structuredClone(draft),change=g.generationChange(room('library'),draft);apply(draft,change);
 assert.ok(draft.objects.some(p=>p.kind==='bookshelf'));assert.ok(!draft.objects.some(p=>p.id===chest.id));assert.equal(draft.objects.find(p=>p.id===bed.id).x,30);assert.equal(map.get(draft.chunks,0,0),'stone');
 assert.equal(draft.generators.length,1);const after=structuredClone(draft);apply(draft,change,true);assert.deepEqual(draft,before);apply(draft,change);assert.deepEqual(draft,after);
 const noOp=g.generationChange(draft.generators[0],draft);assert.equal(noOp.objects,null);assert.equal(noOp.tiles.length,0);assert.equal(noOp.generators.before,noOp.generators.after);
});

test('ready room presets remain independent editable recipes with real new props',()=>{
 for(const theme of Object.keys(g.roomThemes).filter(x=>x!=='none')){
  const a=preset(theme),b=preset(theme);assert.deepEqual(a,b);assert.ok(g.validGenerators(a.generators));assert.ok(a.objects.length>30);
  a.objects[0].hidden=true;assert.equal(b.objects[0].hidden,false);assert.equal(b.generators[0].params.furnishing,theme);
 }
 assert.throws(()=>preset('__proto__'),RangeError);assert.throws(()=>preset('none'),RangeError);
});

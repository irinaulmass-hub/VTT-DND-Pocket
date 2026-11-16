'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const map=require('../remote/world-model'),g=require('../remote/world-generators');

test('mixed group rotation preserves integer footprints, relative geometry and four-turn identity',()=>{
  const objects=Object.keys(map.props).map((kind,i)=>({id:'p'+i,kind,x:(i%8)*8-30,y:Math.floor(i/8)*8-30,turn:i%4,hidden:i%2===0,groupId:'g',groupName:'Set'}));
  let after=objects;for(let i=0;i<4;i++){after=map.transformObjects(after,after.map(p=>p.id),{turns:1});assert.ok(after.every(p=>map.valid(p.x)&&map.valid(p.y)));}
  assert.deepEqual(after,objects);assert.deepEqual(objects[0],{id:'p0',kind:'house',x:-30,y:-30,turn:0,hidden:true,groupId:'g',groupName:'Set'});
  const moved=map.transformObjects(objects,objects.map(p=>p.id),{dx:7,dy:-4});assert.ok(moved.every((p,i)=>p.x===objects[i].x+7&&p.y===objects[i].y-4));
  assert.deepEqual(map.transformObjects(moved,moved.map(p=>p.id),{dx:-7,dy:4}),objects);
});

test('group transformations fail atomically at world boundaries and leave unselected objects untouched',()=>{
  const objects=[{id:'a',kind:'house',x:0,y:0,turn:0},{id:'edge',kind:'wall',x:8190,y:8190,turn:0}];
  const before=structuredClone(objects);assert.throws(()=>map.transformObjects(objects,['a','edge'],{dx:2}),RangeError);assert.deepEqual(objects,before);
  assert.throws(()=>map.transformObjects(objects,['a'],{dx:.5}),RangeError);
  const moved=map.transformObjects(objects,['a'],{dx:2});assert.equal(moved[1],objects[1]);assert.equal(moved[0].x,2);
});

test('grouping generator objects protects manual membership during regeneration and keeps state schema unchanged',()=>{
  const draft={chunks:{},objects:[],generators:[]};
  const recipe={id:'group-room',kind:'room',version:1,seed:3,params:{floor:'wood',furnishing:'tavern',points:[{x:-8,y:-6},{x:8,y:-6},{x:8,y:6},{x:-8,y:6}],entrance:{x:0,y:6}}};
  const initial=g.generationChange(recipe,draft);Object.assign(draft,{chunks:initial.chunks,objects:initial.objects.after,generators:initial.generators.after});
  const furniture=draft.objects.filter(p=>['table','bench'].includes(p.kind)).slice(0,3),ids=new Set(furniture.map(p=>p.id));
  const grouped=g.protectManualChanges(draft,{objects:{before:draft.objects,after:draft.objects.map(p=>ids.has(p.id)?{...p,groupId:'furniture-group',groupName:'Furniture'}:p)}});
  draft.objects=grouped.objects.after;draft.generators=grouped.generators.after;
  const next=g.generationChange({...recipe,seed:19},draft);assert.ok(g.validGenerators(next.generators.after));
  for(const p of furniture)assert.deepEqual(next.objects.after.find(q=>q.id===p.id),{...p,groupId:'furniture-group',groupName:'Furniture'});
});

test('district regeneration keeps grouped bound houses without injecting editor metadata into generator snapshots',()=>{
  const recipe={id:'district-group',kind:'district',version:1,seed:3,params:{count:4,points:[{x:-14,y:-14},{x:14,y:-14},{x:14,y:14},{x:-14,y:14}]}};
  const initial=g.generationChange(recipe,{chunks:{},objects:[],generators:[]}),house=initial.objects.after[0];
  const draft={chunks:initial.chunks,objects:initial.objects.after.map(p=>p.id===house.id?{...p,groupId:'houses',groupName:'Homes'}:p),generators:initial.generators.after};
  const next=g.generationChange({...recipe,seed:4},draft,{pinnedIds:[house.id],reservedCells:[]});
  assert.ok(g.validGenerators(next.generators.after));assert.equal(next.objects.after.find(p=>p.id===house.id).groupId,'houses');
});

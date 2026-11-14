'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { project,mask }=require('../world-exploration');
const map=require('../remote/world-model');
const prop=(id,kind='tavern',x=31,y=2,turn=0)=>({id,kind,x,y,turn});
const state=()=>({explored:{},openDoors:new Set(),memory:{chunks:{},objects:{}},visible:{},revealedSecrets:{}});
const data=(objects,fog=false)=>({map:{id:'map',chunks:{},objects},fog,seen:{}});
const ids=result=>result.objects.map(p=>p.id);

test('chunk object selection includes intersecting footprints across positive/negative edges and turns once',()=>{
  for(const [object,key,expected] of [
    [prop('west','tavern',32,2),'0,0',true],
    [prop('east','tavern',30,2),'1,0',true],
    [prop('outside','tavern',28,2),'1,0',false],
    [prop('turned','tavern',32,2,1),'0,0',true],
    [prop('negative','tavern',-1,-1),'0,0',true],
    [prop('negative-turned','barn',-32,-32,3),'-2,-2',true],
    [prop('wall-east','wall',31,2,0),'1,0',true],
    [prop('wall-west','wall',30,2,2),'1,0',false],
    [prop('wall-south','wall',2,31,1),'0,1',true],
  ]) assert.deepEqual(ids(project(data([object]),new Set([key]),state())),expected?[object.id]:[],object.id);
  const objects=[prop('crossing'),prop('far','barn',400,400)];
  assert.deepEqual(ids(project(data(objects),new Set(['0,0','1,0','1,0']),state())),['crossing']);
  assert.deepEqual(ids(project(data(objects),new Set(),state())),[]);
});

test('footprint overlap never replaces anchor authorization under fog, even when the anchor is outside the query',()=>{
  const object=prop('crossing'),d=data([object],true),s=state(),keys=new Set(['1,0']);
  s.visible=mask([{x:32,y:2}]);
  assert.deepEqual(ids(project(d,keys,s)),[],'visible edge alone does not reveal an unseen anchor');
  s.visible=mask([{x:31,y:2}]);
  const visible=project(d,keys,s);assert.deepEqual(ids(visible),['crossing']);
  assert.equal(visible.visible['0,0'],undefined,'selection does not add the anchor chunk to the payload');
  s.visible={};d.seen=mask([{x:31,y:2}]);
  assert.deepEqual(ids(project(d,keys,s)),['crossing'],'legacy/manual seen anchor works outside the query');
  map.set(s.explored,31,2,false);
  assert.deepEqual(ids(project(d,keys,s)),[],'later mask layers retain precedence');
  s.explored={};map.set(s.memory.chunks,31,2,'grass');
  assert.deepEqual(ids(project(d,keys,s)),[],'remembered terrain prevents fallback to a fresh unobserved object');
});

test('hidden boundary objects still require a matching reveal, with or without fog',()=>{
  const object={...prop('secret'),hidden:true,notes:'master only'},s=state(),keys=new Set(['1,0']);
  for(const fog of [false,true]) {
    const d=data([object],fog);s.visible=mask([{x:31,y:2}]);s.revealedSecrets={};
    assert.deepEqual(ids(project(d,keys,s)),[]);
    s.revealedSecrets[':secret']={kind:object.kind,x:object.x,y:object.y,turn:object.turn};
    assert.deepEqual(project(d,keys,s).objects,[prop('secret')],'only public object fields are returned');
    s.revealedSecrets[':secret'].turn=1;
    assert.deepEqual(ids(project(d,keys,s)),[],'old reveal geometry cannot authorize the object');
  }
});

test('remembered boundary geometry and door state remain snapshots, without duplicate IDs or live ghosts',()=>{
  const remembered={...prop('moved','tavern',31,2),notes:'not public'};
  const d=data([prop('moved','tavern',100,2)],true),s=state(),keys=new Set(['1,0']);
  s.memory.objects[':moved']=remembered;
  map.set(s.memory.chunks,31,2,'grass');
  const before=JSON.stringify({d,s:{...s,openDoors:[]}});
  assert.deepEqual(project(d,keys,s).objects,[prop('moved')],'old geometry intersects the requested chunk');
  s.visible=mask([{x:100,y:2}]);
  assert.deepEqual(ids(project(d,keys,s)),[],'visible live geometry outside the query suppresses the old snapshot');
  s.visible={};d.map.objects=[prop('moved','tavern',30,2)];d.seen=mask([{x:30,y:2}]);
  assert.deepEqual(project(d,keys,s).objects,[prop('moved','tavern',30,2)],'live fallback and old memory do not duplicate an ID');
  const door=prop('door','door',32,2);
  s.memory.objects[':door']={...door,open:true,notes:'private'};
  d.map.objects.push({...door,hidden:true});
  assert.deepEqual(project(d,keys,s).objects.find(p=>p.id==='door'),{...door,open:true},'past door state is not replaced by current doors');
  assert.equal(remembered.notes,'not public');
  const immutableData=data([prop('moved','tavern',100,2)],true),immutableState=state();
  immutableState.memory.objects[':moved']=remembered;map.set(immutableState.memory.chunks,31,2,'grass');
  project(immutableData,keys,immutableState);
  assert.equal(JSON.stringify({d:immutableData,s:{...immutableState,openDoors:[]}}),before,'projection does not mutate map or memory');
});

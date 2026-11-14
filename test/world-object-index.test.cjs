'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createCache=require('../world-object-index');
const {project,mask}=require('../world-exploration');
const linear=require('./fixtures/world-exploration-linear.cjs').project;
const model=require('../remote/world-model');
const prop=(id,kind='tavern',x=31,y=2,turn=0)=>({id,kind,x,y,turn});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const state=()=>({explored:{},visible:{},openDoors:new Set(),memory:{chunks:{},objects:{}},revealedSecrets:{}});
const data=(objects,fog=true)=>({map:{chunks:{},objects},seen:{},fog});
function same(d,s,keys) {
  const expected=linear(d,keys,s),actual=project(d,keys,s);
  assert.deepEqual(actual,expected);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected),'array and object order remain wire-compatible');
  assert.equal(JSON.stringify(actual).includes('PRIVATE'),false);
  return actual;
}

test('index selects visual/anchor overlaps in source order and retains one immutable collection',()=>{
  const cache=createCache(),objects=freeze([prop('crown','tree',-1,2),prop('roof','house',30,7),
    prop('bridge','bridge',29,12),prop('turned','barn',32,2,3),prop('unknown','legacy-kind',4,4)]);
  const index=cache.get(objects);assert.ok(index);assert.equal(cache.get(objects),index);
  assert.deepEqual(index.select(new Set(['1,0','0,0','1,0'])).map(p=>p.id),objects.map(p=>p.id));
  assert.deepEqual(index.select(new Set(['0,0'])).map(p=>p.id),['crown','roof','bridge','turned','unknown']);
  assert.deepEqual(index.select(new Set(['00,0','100,100'])),[],'request keys are not silently canonicalized');
  assert.deepEqual(index.select(new Set()),[]);
  assert.equal(index.find('roof'),objects[1]);assert.equal(index.find('absent'),undefined);
  const other=freeze([prop('different')]);cache.get(other);assert.notEqual(cache.get(objects),index);
  const reused=cache.get(objects);cache.clear();assert.notEqual(cache.get(objects),reused);
  assert.equal(cache.get([{...objects[0]}]),null);assert.notEqual(cache.get(objects),reused);
  const numeric=state();numeric.memory.objects=freeze({'10':prop('ten','tree',0,0),'2':prop('two','tree',1,0),':last':prop('last','tree',2,0)});
  assert.deepEqual(same(data(freeze([])),numeric,new Set(['0,0'])).objects.map(p=>p.id),['two','ten','last']);
});

test('indexed projection matches the independent linear reference across geometry, masks and hybrid fallbacks',()=>{
  const kinds=Object.keys(model.props),queries=[[],['0,0'],['1,0','0,0','-1,0','0,-1'],['-2,-2'],['2,2'],['100,100'],['00,0']];
  for(let seed=0;seed<16;seed++)for(let frozen=0;frozen<4;frozen++) {
    const objects=Array.from({length:160},(_,i)=>({...prop('p'+i,kinds[(i*17+seed)%kinds.length],
      (i*31+seed*7)%130-65,(i*43+seed*11)%130-65,(i+seed)%4),hidden:i%7===0,notes:'PRIVATE'}));
    const d=data(objects,seed%2===0),s=state();
    for(let i=0;i<objects.length;i++) {
      const p=objects[i],old={...p,x:p.x+(i%3-1)*32,open:p.kind==='door'&&i%2===0};
      delete old.hidden;s.memory.objects[':p'+i]=old;
      model.set(d.map.chunks,p.x,p.y,i%2?'path':'grass');
      if(i%3===0)model.set(d.seen,p.x,p.y,true);
      if(i%4===0)model.set(s.explored,p.x,p.y,i%8!==0);
      if(i%5===0)model.set(s.visible,p.x,p.y,i%10!==0);
      if(i%6===0)model.set(s.memory.chunks,p.x,p.y,'stone');
      if(i%11===0)s.revealedSecrets[':'+p.id]={kind:p.kind,x:p.x,y:p.y,turn:p.turn};
      if(p.kind==='door')s.openDoors.add(p.id);
    }
    s.memory.objects[':only-memory']={...prop('only-memory','door',32,1,1),open:true,notes:'PRIVATE'};
    if(frozen&1)freeze(d.map.objects);
    if(frozen&2)freeze(s.memory.objects);
    for(const keys of queries)same(d,s,new Set(keys));
  }
});

test('global live visibility suppresses old memory outside the query without bypassing secrets or mask priority',()=>{
  const d=data(freeze([prop('moved','tavern',100,2),{...prop('secret','chest',100,4),hidden:true},
    prop('fallback','barrel',31,5),prop('door','door',32,6)])),s=state(),keys=new Set(['1,0']);
  s.memory.objects=freeze({':moved':prop('moved'),':secret':prop('secret','chest',31,4),
    ':door':{...prop('door','door',32,6),open:true,notes:'PRIVATE'}});
  s.visible=mask([{x:100,y:2},{x:100,y:4}]);
  let result=same(d,s,keys);
  assert.equal(result.objects.some(p=>p.id==='moved'),false);
  assert.equal(result.objects.some(p=>p.id==='secret'),true,'unrevealed live secret does not suppress a legitimate old snapshot');
  assert.equal(result.objects.find(p=>p.id==='door').open,true,'memory retains old door state');
  s.revealedSecrets[':secret']={kind:'chest',x:100,y:4,turn:0};
  assert.equal(same(d,s,keys).objects.some(p=>p.id==='secret'),false);
  s.visible={};model.set(d.seen,31,5,true);model.set(s.explored,31,5,false);
  assert.equal(same(d,s,keys).objects.some(p=>p.id==='fallback'),false);
  model.set(s.explored,31,5,true);
  assert.equal(same(d,s,keys).objects.some(p=>p.id==='fallback'),true);
  model.set(s.memory.chunks,31,5,'grass');
  assert.equal(same(d,s,keys).objects.some(p=>p.id==='fallback'),false,'remembered terrain blocks fresh unseen fallback');
});

test('warm indexed projection visits only local candidates and rebuilds for a new snapshot',()=>{
  let reads=0;
  const watch=p=>new Proxy(Object.freeze(p),{get(target,key,receiver){if(key==='x')reads++;return Reflect.get(target,key,receiver);}});
  const objects=Array.from({length:model.objectLimit},(_,i)=>watch(prop('p'+i,'tree',i?100+i%50*64:0,i?100+Math.floor(i/50)*64:0)));
  const d=data(Object.freeze(objects)),s=state();
  s.memory.objects=Object.freeze(Object.fromEntries(objects.map(p=>[':'+p.id,p])));
  project(d,new Set(['0,0']),s);reads=0;
  const expected=linear(d,new Set(['0,0']),s),linearReads=reads;assert.ok(linearReads>=model.objectLimit*2);
  reads=0;assert.deepEqual(project(d,new Set(['0,0']),s),expected);assert.ok(reads<30,'warm source traversal is independent of remote object count');
  reads=0;assert.deepEqual(project(d,new Set(['100,100']),s).objects,[]);assert.equal(reads,0,'empty region visits no object fields');
  d.map.objects=freeze([{...prop('new','tree',0,0),hidden:true}]);s.memory.objects=freeze({});
  assert.deepEqual(same(d,s,new Set(['0,0'])).objects,[]);
  d.fog=false;s.revealedSecrets[':new']={kind:'tree',x:0,y:0,turn:0};
  assert.equal(same(d,s,new Set(['0,0'])).objects[0].id,'new');
});

test('unsupported collections and admission budgets retain the full fallback without stale geometry',()=>{
  const cache=createCache(),mutable=prop('mutable','tree',0,0),root=Object.freeze([mutable]);
  assert.equal(cache.get(root),null);mutable.x=100;
  same(data(root,false),state(),new Set(['0,0']));mutable.x=0;
  assert.equal(same(data(root,false),state(),new Set(['0,0'])).objects.length,1);
  const duplicate=freeze([prop('duplicate'),prop('duplicate','tree',32,2)]);
  assert.equal(cache.get(duplicate),null);same(data(duplicate,false),state(),new Set(['0,0','1,0']));
  let x=0;const accessor=Object.freeze({id:'getter',kind:'tree',get x(){return x;},y:0,turn:0});
  const getterRoot=Object.freeze([accessor]);assert.equal(cache.get(getterRoot),null);
  same(data(getterRoot,false),state(),new Set(['0,0']));x=100;same(data(getterRoot,false),state(),new Set(['0,0']));
  let remembered=prop('memory','tree',0,0);const dictionary=Object.freeze({get ':memory'(){return remembered;}});
  assert.equal(cache.get(dictionary),null);const mutableState=state();mutableState.memory.objects=dictionary;
  same(data(freeze([])),mutableState,new Set(['0,0']));remembered=prop('memory','tree',100,0);
  assert.deepEqual(same(data(freeze([])),mutableState,new Set(['0,0'])).objects,[]);
  const iterator=[freeze(prop('a','tree',0,0)),freeze(prop('b','tree',1,1))];
  Object.defineProperty(iterator,Symbol.iterator,{value:function*(){yield this[1];yield this[0];}});Object.freeze(iterator);
  assert.equal(cache.get(iterator),null);assert.deepEqual(same(data(iterator,false),state(),new Set(['0,0'])).objects.map(p=>p.id),['b','a']);
  const tooMany=freeze(Array.from({length:model.objectLimit+1},(_,i)=>prop('p'+i,'tree',0,0)));
  assert.equal(cache.get(tooMany),null);same(data(tooMany,false),state(),new Set(['0,0']));
  model.props.indexHuge=['Huge',3200,3200];model.props.indexWide=['Wide',96,64];
  try {
    const huge=freeze([prop('huge','indexHuge',0,0)]);assert.equal(cache.get(huge),null);same(data(huge,false),state(),new Set(['0,0']));
    const wide=freeze(Array.from({length:1000},(_,i)=>prop('w'+i,'indexWide',0,0)));
    assert.equal(cache.get(wide),null,'bucket membership has a separate admission bound');same(data(wide,false),state(),new Set(['0,0']));
  } finally {delete model.props.indexHuge;delete model.props.indexWide;}
});

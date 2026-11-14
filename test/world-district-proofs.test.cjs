'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const crypto=require('node:crypto');
const map=require('../remote/world-model');
const g=require('../remote/world-generators');
const key=Buffer.alloc(32,0x57), links='a'.repeat(64);

// The pre-optimization algorithm is deliberately kept as an independent byte oracle.
function oldInput(scope,id,snapshot) {
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const objects=snapshot.objects.map(({id,kind,x,y,turn,hidden})=>({id,kind,x,y,turn,hidden:hidden===true}));
  return JSON.stringify([scope,id,canonical({chunks:snapshot.chunks,objects,generators:snapshot.generators||[]})]);
}
const sign=input=>crypto.createHmac('sha256',key).update(input).digest('hex');

function auditedServer(scope) {
  const filename=require.resolve('../world-districts'), cached=require.cache[filename], load=Module._load;
  const audit={inputs:[],phase:0,sequence:0};let factory;
  try {
    Module._load=function(request,parent,...rest) {
      if(request==='node:crypto'&&parent?.filename===filename) return {...crypto,
        randomBytes:size=>{assert.equal(size,32);return key;},
        createHmac(...args) {
          const hmac=crypto.createHmac(...args),update=hmac.update,digest=hmac.digest;
          audit.phase=++audit.sequence;
          hmac.update=function(input,...args){audit.inputs.push(input);return update.call(this,input,...args);};
          hmac.digest=function(...args){try{return digest.apply(this,args);}finally{audit.phase=0;}};
          return hmac;
        }};
      return load.call(this,request,parent,...rest);
    };
    delete require.cache[filename];factory=require(filename);
  } finally {Module._load=load;if(cached)require.cache[filename]=cached;else delete require.cache[filename];}
  return {audit,server:factory({districtContext:()=>({linksRevision:links,pinnedIds:[],reservedCells:[],hasBindings:false})},scope)};
}

function fixture() {
  const recipe={id:'proof-district',kind:'district',version:1,seed:47,params:{count:8,
    points:[{x:-16,y:-12},{x:16,y:-12},{x:16,y:12},{x:-16,y:12}]}};
  let source={id:'10000000-0000-0000-0000-000000000007',revision:1,name:'Карта «雪»',chunks:{},objects:[]};
  for(const r of [recipe,{id:'foreign',kind:'path',version:1,seed:2,
    params:{terrain:'path',width:1,points:[{x:300,y:300},{x:310,y:300}]}}]) {
    const c=g.generationChange(r,source);
    source={...source,chunks:c.chunks,objects:c.objects?.after||source.objects,generators:c.generators.after};
  }
  map.set(source.chunks,1000,1000,'grass');
  source.objects.push({id:'manual-雪',kind:'tree',x:1000,y:1001,turn:1}); // legacy hidden omitted
  return {source,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}};
}

test('District preview/apply and both history formats keep the exact original signing bytes and HMAC',()=>{
  const {source,recipe}=fixture(),scope='/кампания/"雪"\n🗺',{server,audit}=auditedServer(()=>scope);
  const untouched=JSON.stringify(source);
  const preview=server.preview(source,{revision:1,recipe});
  const after={chunks:preview.change.chunks,objects:preview.change.objects?.after||source.objects,generators:preview.change.generators.after};
  const expected=[oldInput(scope,source.id,source),oldInput(scope,source.id,after)];
  assert.deepEqual(audit.inputs,expected);
  assert.deepEqual(preview.history,{before:sign(expected[0]),after:sign(expected[1])});
  const compact=server.preview(source,{revision:1,recipe,format:'delta-v1'});
  assert.deepEqual(audit.inputs.slice(-2),expected);assert.deepEqual(compact.history,preview.history);
  const applied=server.prepareApply(source,{districtGuard:preview.guard});
  assert.deepEqual(audit.inputs.slice(-2),expected);assert.deepEqual(applied.response.history,preview.history);
  const tiles=preview.change.tiles.map(c=>({x:c.x,y:c.y,before:c.after,after:c.before}));
  const guard={revision:2,linksRevision:links,historyProof:preview.history.before};
  const delta=g.compactGenerationChange({id:recipe.id,count:tiles.length,tiles,
    objects:{before:applied.next.objects,after:source.objects},generators:{before:applied.next.generators,after:source.generators}});
  const undo=server.prepareHistory(applied.next,JSON.parse(JSON.stringify({districtGuard:guard,change:delta})));
  assert.equal(audit.inputs.at(-1),expected[0]);
  server.verifySave(applied.next,undo.next,guard);assert.equal(audit.inputs.at(-1),expected[0]);
  assert.equal(JSON.stringify(source),untouched,'signing and generation do not mutate the source');
});

test('canonical nodes are reused only within a pair and in-place edits are visible to the next request',()=>{
  const {source,recipe}=fixture(),{server,audit}=auditedServer(()=> 'scope');
  const chunkKey=map.address(1000,1000)[0],index=String(map.address(1000,1000)[1]);
  const reads={},foreignReads={};let terrain='grass',seed=2;
  Object.defineProperty(source.chunks[chunkKey],index,{enumerable:true,configurable:true,
    get(){if(audit.phase)reads[audit.phase]=(reads[audit.phase]||0)+1;return terrain;},set(v){terrain=v;}});
  const foreign=source.generators.find(r=>r.id==='foreign');
  Object.defineProperty(foreign,'seed',{enumerable:true,configurable:true,
    get(){if(audit.phase)foreignReads[audit.phase]=(foreignReads[audit.phase]||0)+1;return seed;},set(v){seed=v;}});
  const first=server.preview(source,{revision:1,recipe});
  assert.equal(reads[1],1);assert.equal(reads[2]||0,0,'unchanged chunk not traversed for the after proof');
  assert.equal(foreignReads[1],1);assert.equal(foreignReads[2]||0,0,'foreign recipe canonical nodes reused');
  source.chunks[chunkKey][index]='stone';foreign.seed=7;
  source.objects.reverse();source.generators.reverse();
  const second=server.preview(source,{revision:1,recipe});
  assert.equal(reads[3],1);assert.equal(foreignReads[3],1,'same object identities are read afresh in a new request');
  assert.equal(audit.inputs[2],oldInput('scope',source.id,source));
  assert.notEqual(second.history.before,first.history.before);
  assert.equal(second.history.before,sign(audit.inputs[2]));
});

test('a fresh apply proof and history check cannot hide edits or scope changes from an earlier pair',()=>{
  const {source,recipe}=fixture();let scope='one';const {server,audit}=auditedServer(()=>scope);
  const preview=server.preview(source,{revision:1,recipe});
  map.set(source.chunks,1000,1000,'stone');source.objects.at(-1).hidden=true;
  source.generators.find(r=>r.id==='foreign').seed=9;
  const applied=server.prepareApply(source,{districtGuard:preview.guard});
  assert.equal(audit.inputs.at(-2),oldInput(scope,source.id,source));
  assert.notEqual(applied.response.history.before,preview.history.before,'apply signs the current snapshot');
  const target={...source,revision:3},guard={revision:2,linksRevision:links,historyProof:applied.response.history.before};
  server.verifySave(applied.next,target,guard);
  source.objects.reverse();assert.throws(()=>server.verifySave(applied.next,target,guard),{status:409});
  source.objects.reverse();scope='two';assert.throws(()=>server.verifySave(applied.next,target,guard),{status:409});
  scope='one';server.verifySave(applied.next,target,guard);
});

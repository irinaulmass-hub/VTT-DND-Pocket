'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const createStore=require('../world-store');
const model=require('../remote/world-model');
const ids=['60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002'];

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-store-view-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let campaign='a',reads=0,chunkReads=0;
  const file=name=>path.join(dir,campaign,name),store=createStore(file);
  function snapshot(id=ids[0],name='World A') {
    const chunks={};model.set(chunks,0,0,'grass');model.set(chunks,33,0,'stone');
    return {map:{id,name,revision:1,chunks,objects:[{id:'house',kind:'house',x:1,y:1,turn:0}]},
      fog:true,revision:1,frame:{x:0,y:0,scale:24,serial:0},tokens:[],seen:{}};
  }
  for(const name of ['a','b']) {
    campaign=name;
    for(const id of ids){const data=snapshot(id,name==='a'?'World A':'World B');store.writeDraft(data.map);store.writePublished(id,data);}
  }
  campaign='a';
  const read=fs.readFileSync;
  fs.readFileSync=function(name,...args){
    if(String(name).startsWith(dir)) {
      if(String(name).endsWith('-live-chunks.json'))reads++;
      if(/[a-f0-9]{64}\.json$/.test(String(name)))chunkReads++;
    }
    return read.call(this,name,...args);
  };
  t.after(()=>{fs.readFileSync=read;});
  // Before the new API exists this adapter exercises the old uncached projection source.
  const view=(id=ids[0],keys=[])=>store.readPublishedView?store.readPublishedView(id,keys):store.readPublished(id,keys);
  const manifest=(id=ids[0])=>file('worlds/'+id+'-live-chunks.json');
  return {dir,file,store,view,manifest,snapshot,reads:()=>reads,chunkReads:()=>chunkReads,switchTo:value=>{campaign=value;}};
}

test('published views reuse one immutable manifest but read the requested terrain afresh',t=>{
  const f=fixture(t),expected=f.store.readPublished(ids[0],['0,0']),before=f.reads();
  const first=f.view(ids[0],['0,0']);assert.deepEqual(first,expected);
  assert.deepEqual(f.view(ids[0],['0,0']),expected);
  assert.equal(f.reads()-before,1,'unchanged manifest is read and parsed once');
  assert.throws(()=>{first.map.objects[0].x=99;},TypeError);
  assert.throws(()=>{first.frame.x=99;},TypeError);
  assert.throws(()=>first.tokens.push({id:'fake'}),TypeError);
  assert.throws(()=>{first.seen['0,0']={0:true};},TypeError);
  model.set(first.map.chunks,0,0,'dirt');
  assert.equal(model.get(f.view(ids[0],['0,0']).map.chunks,0,0),'grass','terrain objects are independent');
  const other=f.view(ids[0],['1,0']);assert.deepEqual(Object.keys(other.map.chunks),['1,0']);
  assert.equal(model.get(other.map.chunks,33,0),'stone');
  const chunks=f.chunkReads();assert.deepEqual(f.view().map.chunks,{});assert.equal(f.chunkReads(),chunks,'metadata-only reads load no terrain');
  assert.equal(f.reads()-before,1);
  const writable=f.store.readPublished(ids[0],[]);writable.frame.x=88;writable.map.objects[0].x=88;
  assert.equal(f.view().frame.x,0,'the old API returns independent mutable snapshots');
});

test('state updates and publication invalidate views explicitly while failed commits preserve old data',t=>{
  const f=fixture(t),stat=fs.statSync,stamp=stat(f.manifest(),{bigint:true});
  fs.statSync=function(name,...args){return String(name)===f.manifest()&&args[0]?.bigint?stamp:stat.call(this,name,...args);};
  t.after(()=>{fs.statSync=stat;});
  const first=f.view();
  const changed=f.store.readPublished(ids[0],[]);
  Object.assign(changed,{fog:false,revision:2,frame:{...changed.frame,x:8,serial:1}});
  changed.tokens.push({id:'hero',name:'Hero',x:3,y:4});changed.seen['0,0']={0:true};
  f.store.updatePublishedState(ids[0],changed);
  const next=f.view();assert.equal(next.fog,false);assert.equal(next.revision,2);assert.equal(next.frame.x,8);
  assert.deepEqual(next.tokens,changed.tokens);assert.deepEqual(next.seen,changed.seen);assert.equal(first.frame.x,0);
  const published=f.snapshot();published.revision=3;published.map.objects[0].x=10;model.set(published.map.chunks,0,0,'wood');
  f.store.writePublished(ids[0],published);
  assert.equal(f.view(ids[0],['0,0']).map.objects[0].x,10);
  assert.equal(model.get(f.view(ids[0],['0,0']).map.chunks,0,0),'wood');
  const rename=fs.renameSync;
  fs.renameSync=function(from,...args){if(String(from)===f.manifest()+'.tmp')throw Error('expected commit failure');return rename.call(this,from,...args);};
  try {const bad=f.store.readPublished(ids[0],[]);bad.frame.x=90;assert.throws(()=>f.store.updatePublishedState(ids[0],bad),/expected commit failure/);}
  finally {fs.renameSync=rename;}
  assert.equal(f.view().frame.x,0,'failed state commit cannot poison the cached view');
});

test('view identity covers map/campaign, restart, same-size replacement and ctime updates',t=>{
  const f=fixture(t),before=f.reads();
  f.view();f.view(ids[1]);f.view();assert.equal(f.reads()-before,3,'only one map manifest is retained');
  f.switchTo('b');assert.equal(f.view().map.name,'World B');
  f.switchTo('a');assert.equal(f.view().map.name,'World A');assert.equal(f.reads()-before,5);
  const restarted=createStore(f.file);assert.equal(restarted.readPublishedView(ids[0],[]).map.name,'World A');
  const stat=fs.statSync;
  fs.statSync=function(name,...args){const value=stat.call(this,name,...args);if(String(name)===f.manifest()&&args[0]?.bigint)value.mtimeNs=1n;return value;};
  t.after(()=>{fs.statSync=stat;});
  f.view();const saved=fs.readFileSync(f.manifest(),'utf8');
  fs.writeFileSync(f.manifest()+'.replacement',saved.replace('World A','World C'));
  fs.renameSync(f.manifest()+'.replacement',f.manifest());
  assert.equal(f.view().map.name,'World C');
  fs.writeFileSync(f.manifest(),saved.replace('World A','World D'));
  assert.equal(f.view().map.name,'World D','restored/coarse mtime does not hide an in-place update');
});

test('views reject stale data after missing/corrupt manifests, failures, oversize and legacy selection',t=>{
  const f=fixture(t);f.view();const saved=fs.readFileSync(f.manifest(),'utf8');
  fs.unlinkSync(f.manifest());assert.equal(f.view(),null);
  fs.writeFileSync(f.manifest(),'{bad');assert.throws(()=>f.view(),SyntaxError);
  const invalid=JSON.parse(saved);invalid.storageVersion=2;fs.writeFileSync(f.manifest(),JSON.stringify(invalid));
  assert.throws(()=>f.view(),/Unsupported world storage version/);
  fs.writeFileSync(f.manifest(),saved);f.view();
  const stat=fs.statSync,read=fs.readFileSync,denied=Object.assign(Error('denied'),{code:'EACCES'});
  fs.statSync=function(name,...args){if(String(name)===f.manifest())throw denied;return stat.call(this,name,...args);};
  try {const before=f.reads();f.view();f.view();assert.equal(f.reads()-before,2,'metadata failure falls back without cache');
    fs.readFileSync=function(name,...args){if(String(name)===f.manifest())throw denied;return read.call(this,name,...args);};
    assert.throws(()=>f.view(),e=>e===denied);
  } finally {fs.statSync=stat;fs.readFileSync=read;}
  const large={...JSON.parse(saved),padding:'x'.repeat(8*1024*1024)};fs.writeFileSync(f.manifest(),JSON.stringify(large));
  const before=f.reads(),one=f.view(),two=f.view();assert.equal(f.reads()-before,2);
  one.frame.x=18;assert.equal(two.frame.x,0,'oversize snapshots remain independent');
  fs.writeFileSync(f.manifest(),saved);f.view();
  const draft=f.file('worlds/'+ids[0]+'-chunks.json'),draftBytes=fs.readFileSync(draft);
  fs.unlinkSync(draft);const legacy=f.snapshot();legacy.map.name='Legacy';
  fs.writeFileSync(f.file('worlds/'+ids[0]+'-live.json'),JSON.stringify(legacy));
  assert.equal(f.view().map.name,'Legacy','legacy selection overrides any staged chunk manifest');
  const first=f.view();first.map.objects[0].x=42;assert.equal(f.view().map.objects[0].x,1);
  fs.writeFileSync(draft,draftBytes);assert.equal(f.view().map.name,'World A','switching back cannot reuse legacy data');
});

test('terrain is never cached and unstable manifest reads are not admitted',t=>{
  const f=fixture(t);f.view(ids[0],['0,0']);
  const manifest=JSON.parse(fs.readFileSync(f.manifest(),'utf8'));
  const chunk=f.file('worlds/'+ids[0]+'-chunks/'+manifest.index['0,0'].hash+'.json');
  fs.writeFileSync(chunk,JSON.stringify({0:'wood'}));
  assert.equal(model.get(f.view(ids[0],['0,0']).map.chunks,0,0),'wood','selected terrain is re-read even with identical manifest');
  fs.unlinkSync(chunk);assert.throws(()=>f.view(ids[0],['0,0']),/Missing chunk/);
  assert.equal(model.get(f.view(ids[0],['1,0']).map.chunks,33,0),'stone','unrequested missing chunk is irrelevant');
  const restarted=createStore(f.file),read=fs.readFileSync;let swapped=false;
  fs.readFileSync=function(name,...args){const value=read.call(this,name,...args);if(String(name)===f.manifest()&&!swapped){swapped=true;const next=JSON.parse(value);next.snapshot.frame.x=12;fs.writeFileSync(name,JSON.stringify(next));}return value;};
  try {assert.equal(restarted.readPublishedView(ids[0],[]).frame.x,12,'a changed file triggers a fresh uncached read');}
  finally {fs.readFileSync=read;}
  const stat=fs.statSync;let checks=0;
  const another=createStore(f.file);
  fs.statSync=function(name,...args){if(String(name)===f.manifest()&&++checks===2)throw Error('post-read metadata failed');return stat.call(this,name,...args);};
  try {const before=f.reads();another.readPublishedView(ids[0],[]);assert.equal(f.reads()-before,2);another.readPublishedView(ids[0],[]);assert.equal(f.reads()-before,3);}
  finally {fs.statSync=stat;}
});

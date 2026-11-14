'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const register=require('../character-positions');
const model=require('../remote/world-model');

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-projection-cache-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let campaign='a',roster=[{id:'hero'}],reads=0;
  for(const name of ['a','b'])fs.mkdirSync(path.join(dir,name));
  const scope={worldId:'world',sceneId:'overworld',floorId:'ground'},key=JSON.stringify(Object.values(scope));
  const layout={id:'world',chunks:{},objects:[{id:'door',kind:'door',x:1,y:0,turn:0}]};
  model.set(layout.chunks,0,0,'grass');
  function state(marker='grass') {
    const chunks={};model.set(chunks,0,0,marker);
    return {formatVersion:1,positions:{hero:{...scope,characterId:'hero',x:0,y:0,revision:1}},
      observing:{hero:1},explored:{[key]:{'0,0':{0:true}}},memory:{[key]:{chunks,objects:{}}},
      revealedSecrets:{world:{}},projectionRevisions:{world:{objects:0,sight:1}}};
  }
  const file=()=>path.join(dir,campaign,'character-positions.json');
  const save=value=>fs.writeFileSync(file(),JSON.stringify(value));
  save(state());campaign='b';save(state('stone'));campaign='a';
  const routes=new Map(),app={};
  for(const method of ['get','put','post'])app[method]=(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1));
  const options={express:{json:()=>()=>{}},requireDm:()=>{},gameFile:name=>path.join(dir,campaign,name),
    loadCharacters:()=>({characters:roster}),assignedCharacter:()=> 'hero',locationExists:()=>true,movementLocked:()=>false,
    broadcast:()=>{},explorationNotice:()=>null,readPublishedMap:()=>layout,findTransition:()=>null,
    visibleCells:(position,objects,doors)=>[{x:position.x,y:position.y},...(doors.has('door')||objects.length===0?[{x:2,y:0}]:[])],
    stepVisibility:position=>[{x:position.x,y:position.y}],doorVisibility:()=>[{x:2,y:0}]};
  let api=register(app,options);
  const original=fs.readFileSync;
  fs.readFileSync=function(name,...args){if(String(name).startsWith(dir)&&String(name).endsWith('character-positions.json'))reads++;return original.call(this,name,...args);};
  t.after(()=>{fs.readFileSync=original;});
  function call(route,req) {
    let result,status=200;
    const res={setHeader(){},status(value){status=value;return this;},json(value){result=value;return this;}};
    routes.get(route)(req,res);assert.equal(status,200,JSON.stringify(result));return result;
  }
  return {layout,key,state,file,save,call,api:()=>api,reads:()=>reads,
    switchTo:name=>{campaign=name;},roster:value=>{roster=value;},restart:()=>{api=register(app,options);}};
}
const tile=s=>model.get(s.memory.chunks,0,0);

test('projection revisions reuse only the document and recompute fog/map versions after every change',t=>{
  const f=fixture(t),api=f.api();
  assert.equal(api.projectionRevision('world',true),1);
  assert.equal(api.projectionRevision('world',false),0);
  assert.equal(api.projectionRevision('other',true),0);
  api.mapState(f.layout,true);
  assert.equal(f.reads(),1,'version and map projection share a single unchanged document');
  const explicit={projectionRevisions:{world:{objects:9,sight:4}}};
  assert.equal(api.projectionRevision('world',true,explicit),13);
  assert.equal(f.reads(),1,'explicit state never performs an implicit disk read');
  assert.equal(api.setDoor(f.layout,f.layout.objects[0],true),true);
  assert.equal(api.projectionRevision('world',false),1);
  assert.equal(api.projectionRevision('world',true),2);
  f.call('post /api/player-position/move',{body:{direction:'east',revision:1}});
  assert.equal(api.projectionRevision('world',true),3);
  assert.equal(api.projectionRevision('world',false),1,'private sight revision is omitted without fog');
  assert.equal(api.revealSecret(f.layout,{id:'secret',kind:'chest',x:0,y:0,turn:0,hidden:true}),true);
  assert.equal(api.projectionRevision('world',true),4);
  assert.equal(api.projectionRevision('world',false),2);
  f.switchTo('b');const other=f.state();other.projectionRevisions.world={objects:8,sight:6};f.save(other);
  assert.equal(api.projectionRevision('world',true),14);
  f.switchTo('a');assert.equal(api.projectionRevision('world',true),4);
  const updated=f.state();updated.projectionRevisions.world={objects:5,sight:7};
  const replacement=f.file()+'.new';fs.writeFileSync(replacement,JSON.stringify(updated));fs.renameSync(replacement,f.file());
  assert.equal(api.projectionRevision('world',true),12,'external replacement is visible to status readers');
  assert.equal(api.mapState(f.layout,true).projectionRevision,12);
  fs.writeFileSync(f.file(),'{bad');assert.throws(()=>api.projectionRevision('world',true),SyntaxError);
  fs.unlinkSync(f.file());assert.equal(api.projectionRevision('world',true),0,'missing file cannot reuse an old version');
});

test('projection reuses one immutable document, recomputes visibility and evicts on campaign/restart',t=>{
  const f=fixture(t),first=f.api().mapState(f.layout,true);
  assert.equal(tile(first),'grass');assert.equal(f.reads(),1);
  for(let i=0;i<3;i++)assert.deepEqual(f.api().mapState(f.layout,true),first);
  assert.equal(f.reads(),1,'unchanged state is read and parsed once');
  assert.throws(()=>{first.memory.chunks['0,0'][0]='stone';},TypeError,'cached nested data is immutable');
  first.openDoors.add('door');model.set(first.visible,20,20,true);
  const fresh=f.api().mapState(f.layout,true);
  assert.equal(fresh.openDoors.has('door'),false);assert.equal(model.get(fresh.visible,20,20),undefined);
  f.layout.objects=[];assert.equal(model.get(f.api().mapState(f.layout,true).visible,2,0),true,'geometry is evaluated anew');
  f.roster([]);assert.deepEqual(f.api().mapState(f.layout,true).visible,{},'character roster is never cached');
  assert.equal(f.reads(),1);
  f.switchTo('b');assert.equal(tile(f.api().mapState(f.layout)),'stone');
  f.switchTo('a');assert.equal(tile(f.api().mapState(f.layout)),'grass');assert.equal(f.reads(),3,'one document, not a per-campaign map');
  f.restart();f.api().mapState(f.layout);assert.equal(f.reads(),4);
});

test('projection detects same-size replacements and in-place changes even when mtime is held constant',t=>{
  const f=fixture(t),stat=fs.statSync;
  // Simulate coarse/restored mtime while preserving real inode/ctime/size changes.
  fs.statSync=function(name,...args){const value=stat.call(this,name,...args);if(String(name)===f.file()&&args[0]?.bigint)value.mtimeNs=1n;return value;};
  t.after(()=>{fs.statSync=stat;});
  f.api().mapState(f.layout);const before=fs.statSync(f.file(),{bigint:true});
  const replacement=f.file()+'.replacement';fs.writeFileSync(replacement,JSON.stringify(f.state('stone')));fs.renameSync(replacement,f.file());
  const after=fs.statSync(f.file(),{bigint:true});assert.equal(before.size,after.size);assert.notEqual(before.ino,after.ino);
  assert.equal(tile(f.api().mapState(f.layout)),'stone');
  f.save(f.state('grass'));
  assert.equal(tile(f.api().mapState(f.layout)),'grass','ctime invalidates an in-place same-size update');
  assert.equal(f.reads(),3);
});

test('projection handles missing, corrupt, unreadable and oversized state without serving its old cache',t=>{
  const f=fixture(t);f.api().mapState(f.layout);
  fs.unlinkSync(f.file());assert.deepEqual(f.api().mapState(f.layout).memory,{chunks:{},objects:{}});
  fs.writeFileSync(f.file(),'{bad json');assert.throws(()=>f.api().mapState(f.layout),SyntaxError);
  f.save(f.state('stone'));assert.equal(tile(f.api().mapState(f.layout)),'stone');
  const stat=fs.statSync,read=fs.readFileSync,denied=Object.assign(Error('denied'),{code:'EACCES'});
  fs.statSync=function(name,...args){if(String(name)===f.file())throw denied;return stat.call(this,name,...args);};
  fs.readFileSync=function(name,...args){if(String(name)===f.file())throw denied;return read.call(this,name,...args);};
  try {assert.throws(()=>f.api().mapState(f.layout),error=>error===denied);}
  finally {fs.statSync=stat;fs.readFileSync=read;}
  assert.equal(tile(f.api().mapState(f.layout)),'stone');
  const large={...f.state(),padding:'x'.repeat(8*1024*1024)};f.save(large);
  const before=f.reads();const one=f.api().mapState(f.layout),two=f.api().mapState(f.layout);
  assert.equal(f.reads()-before,2,'oversize uses the original uncached path');
  one.memory.chunks['0,0'][0]='dirt';assert.equal(tile(two),'grass','fallback returns independent documents');
  f.save(f.state('stone'));const cold=f.reads();f.api().mapState(f.layout);f.api().mapState(f.layout);assert.equal(f.reads()-cold,1);
  fs.writeFileSync(f.file(),JSON.stringify({hero:{worldId:'world',sceneId:'overworld',floorId:'ground',x:0,y:0}}));
  assert.deepEqual(f.api().mapState(f.layout).memory,{chunks:{},objects:{}},'legacy position dictionaries still work');
});

test('projection refuses cache admission when the file changes during read or a metadata check fails',t=>{
  const f=fixture(t),read=fs.readFileSync;let swapped=false;
  fs.readFileSync=function(name,...args){const value=read.call(this,name,...args);if(String(name)===f.file()&&!swapped){swapped=true;f.save(f.state('stone'));}return value;};
  try {assert.equal(tile(f.api().mapState(f.layout)),'stone','a racing replacement triggers a fresh uncached read');}
  finally {fs.readFileSync=read;}
  const before=f.reads();f.api().mapState(f.layout);f.api().mapState(f.layout);assert.equal(f.reads()-before,1,'unstable first read was not admitted');
  const stat=fs.statSync;fs.statSync=function(name,...args){if(String(name)===f.file())throw Error('metadata unavailable');return stat.call(this,name,...args);};
  try {const reads=f.reads();f.api().mapState(f.layout);f.api().mapState(f.layout);assert.equal(f.reads()-reads,2,'stat failure falls back without caching');}
  finally {fs.statSync=stat;}
  let checks=0;fs.statSync=function(name,...args){if(String(name)===f.file()&&++checks===2)throw Error('post-read stat failed');return stat.call(this,name,...args);};
  try {
    const reads=f.reads();assert.equal(tile(f.api().mapState(f.layout)),'stone');
    assert.equal(f.reads()-reads,2,'failure of the second metadata check returns a fresh uncached read');
    f.api().mapState(f.layout);assert.equal(f.reads()-reads,3,'failed metadata never admitted a document');
  } finally {fs.statSync=stat;}
});

test('moves, doors, secrets and failed writes use independent mutable reads and invalidate projection state',t=>{
  const f=fixture(t),stat=fs.statSync,stamp=stat(f.file(),{bigint:true});
  // Local writes must invalidate explicitly, even if metadata checks collide.
  fs.statSync=function(name,...args){return String(name)===f.file()&&args[0]?.bigint?stamp:stat.call(this,name,...args);};
  t.after(()=>{fs.statSync=stat;});
  const initial=f.api().mapState(f.layout,true);
  const secret={id:'secret',kind:'chest',x:0,y:0,turn:0,hidden:true};f.layout.objects.push(secret);
  assert.equal(f.api().revealSecret(f.layout,secret),true);
  assert.equal(f.api().mapState(f.layout).revealedSecrets[':secret'].kind,'chest');
  assert.deepEqual(initial.revealedSecrets,{},'writers never mutate a previously returned cached tree');
  assert.equal(f.api().setDoor(f.layout,f.layout.objects[0],true),true);
  assert.equal(f.api().mapState(f.layout).openDoors.has('door'),true);
  f.call('post /api/player-position/move',{body:{direction:'east',revision:1}});
  const moved=f.api().mapState(f.layout,true);assert.equal(model.get(moved.visible,1,0),true);
  const rename=fs.renameSync;
  fs.renameSync=function(from,...rest){if(String(from)===f.file()+'.tmp')throw Error('expected rename failure');return rename.call(this,from,...rest);};
  try {assert.throws(()=>f.api().setDoor(f.layout,f.layout.objects[0],false),/expected rename failure/);}
  finally {fs.renameSync=rename;}
  assert.equal(f.api().mapState(f.layout).openDoors.has('door'),true,'uncommitted mutation cannot poison the cached snapshot');
  assert.equal(f.api().setDoor(f.layout,f.layout.objects[0],false),true);
  assert.equal(f.api().mapState(f.layout).openDoors.has('door'),false);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const createStore = require('../world-store');
const id = '10000000-0000-0000-0000-000000000004';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-store-changes-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const gameFile=name=>path.join(dir,name), store=createStore(gameFile);
  const source={id,name:'Original',revision:3,parentWorldId:'10000000-0000-0000-0000-000000000001',
    objects:[],generators:[],chunks:{'-1,-1':{1023:'grass'},'0,0':{0:'dirt'},'4,4':{17:'water'}}};
  store.writeDraft(source);
  const file=path.join(dir,'worlds',id+'-chunks.json');
  return {dir,gameFile,store,source,file};
}

function hashCounter(gameFile) {
  const filename=require.resolve('../world-store'), cached=require.cache[filename], original=crypto.createHash;
  let hashes=0, factory;
  try {
    crypto.createHash=function(...args){hashes++;return original.apply(this,args);};
    delete require.cache[filename];factory=require(filename);
  } finally {crypto.createHash=original;require.cache[filename]=cached;}
  return {store:factory(gameFile),count:()=>hashes};
}

test('bounded draft commit matches a full save while hashing only changed chunks', t => {
  const {dir,gameFile,store,source,file}=fixture(t), tracked=hashCounter(gameFile);
  const before=JSON.parse(fs.readFileSync(file));
  const untouched=path.join(dir,'worlds',id+'-chunks',before.index['4,4'].hash+'.json');
  const bytes=fs.readFileSync(untouched), stat=fs.statSync(untouched);
  const chunks={'-1,-1':{1023:'wood'},'2,0':{0:'path'},'4,4':source.chunks['4,4']};
  const next={...source,name:'Updated',revision:4,chunks,objects:[{id:'manual',kind:'stone',x:128,y:128,turn:0,hidden:false}]};
  const expected=structuredClone(next);
  // The unchanged chunk must not even be serialized; the manifest reuses its existing index.
  chunks['4,4']={toJSON(){throw Error('untouched chunk was serialized');}};
  const result=tracked.store.writeDraftChanges(next,3,{'-1,-1':chunks['-1,-1'],'0,0':null,'2,0':chunks['2,0']},150000);
  assert.deepEqual(result,{status:'saved',revision:4});assert.equal(tracked.count(),2);
  assert.deepEqual(store.readDraft(id),expected);
  const manifest=JSON.parse(fs.readFileSync(file));
  assert.deepEqual(manifest.index['4,4'],before.index['4,4']);assert.equal(manifest.index['0,0'],undefined);
  assert.deepEqual(fs.readFileSync(untouched),bytes);assert.equal(fs.statSync(untouched).mtimeMs,stat.mtimeMs);
  const reference=createStore(name=>path.join(dir,'reference',name));reference.writeDraft(expected);
  assert.deepEqual(createStore(gameFile).readDraft(id),reference.readDraft(id),'fresh store reopens the same full snapshot');
  assert.equal(source.chunks['-1,-1'][1023],'grass','source remains unchanged');
  // A metadata-only/no-op terrain commit hashes zero chunks; explicit empty chunks stay compatible with full saves.
  const metadataOnly={...expected,revision:5,name:'Metadata only'};
  tracked.store.writeDraftChanges(metadataOnly,4,{},150000);assert.equal(tracked.count(),2);
  const empty={...metadataOnly,revision:6,chunks:{...expected.chunks,'2,0':{}}};
  tracked.store.writeDraftChanges(empty,5,{'2,0':empty.chunks['2,0']},150000);
  assert.deepEqual(store.readDraft(id),empty);
});

test('bounded draft commit rejects stale revisions, bad changes and tile limits before writing', t => {
  const {dir,gameFile,source,file}=fixture(t), {store,count}=hashCounter(gameFile);
  const bytes=fs.readFileSync(file), files=fs.readdirSync(path.join(dir,'worlds',id+'-chunks')).sort();
  const next={...source,revision:4,chunks:{...source.chunks,'2,0':{0:'wood'}}}, changes={'2,0':next.chunks['2,0']};
  assert.deepEqual(store.writeDraftChanges({...next,revision:3},2,changes,150000),{status:'conflict'});
  assert.deepEqual(store.writeDraftChanges(next,3,changes,3),{status:'limit'});
  assert.deepEqual(store.writeDraftChanges({...next,id:'20000000-0000-0000-0000-000000000004'},3,changes,150000),{status:'missing'});
  assert.throws(()=>store.writeDraftChanges({...next,revision:5},3,changes,150000),/Invalid draft commit/);
  for(const invalid of [{'../x':{}},{'-01,0':{}},{'0,0':[]},{'0,0':false}]) {
    assert.throws(()=>store.writeDraftChanges(next,3,invalid,150000),/Invalid draft chunk changes/);
  }
  assert.equal(count(),0);assert.deepEqual(fs.readFileSync(file),bytes);
  assert.deepEqual(fs.readdirSync(path.join(dir,'worlds',id+'-chunks')).sort(),files);
});

for(const phase of ['chunk-write','manifest-write','manifest-rename']) {
  test('failed '+phase+' preserves the old manifest and permits retry', t => {
    const {dir,store,source,file}=fixture(t), old=fs.readFileSync(file);
    const changes={'-1,-1':{1023:'wood'},'2,0':{0:'path'}};
    const next={...source,revision:4,chunks:{...source.chunks,...changes}};
    const secondHash=crypto.createHash('sha256').update(JSON.stringify(changes['2,0'])).digest('hex');
    const secondFile=path.join(dir,'worlds',id+'-chunks',secondHash+'.json.tmp');
    const write=fs.writeFileSync, rename=fs.renameSync, failure=Error('injected '+phase);
    let injected=false;
    try {
      fs.writeFileSync=function(target,...args) {
        if((phase==='chunk-write'&&target===secondFile)||(phase==='manifest-write'&&target===file+'.tmp')) {
          injected=true;write.call(this,target,'partial temporary data');throw failure;
        }
        return write.call(this,target,...args);
      };
      fs.renameSync=function(from,to) {
        if(phase==='manifest-rename'&&to===file){injected=true;throw failure;}
        return rename.call(this,from,to);
      };
      assert.throws(()=>store.writeDraftChanges(next,3,changes,150000),error=>error===failure);
    } finally {fs.writeFileSync=write;fs.renameSync=rename;}
    assert.equal(injected,true);assert.deepEqual(fs.readFileSync(file),old);
    assert.deepEqual(store.readDraft(id),source,'new/orphan chunks are not made authoritative');
    assert.deepEqual(store.writeDraftChanges(next,3,changes,150000),{status:'saved',revision:4});
    assert.deepEqual(store.readDraft(id),next,'retry replaces partial temps and commits once');
    assert.deepEqual(store.writeDraftChanges(next,3,changes,150000),{status:'conflict'});
  });
}

test('bounded draft commit keeps legacy JSON on its full-save path without migration', t => {
  const {dir,gameFile,source,file}=fixture(t), legacy={...source,id:'20000000-0000-0000-0000-000000000004'};
  const legacyFile=path.join(dir,'worlds',legacy.id+'.json');fs.writeFileSync(legacyFile,JSON.stringify(legacy));
  const {store,count}=hashCounter(gameFile), next={...legacy,revision:4,chunks:{'-1,-1':{1023:'wood'}}};
  assert.deepEqual(store.writeDraftChanges(next,3,{'-1,-1':next.chunks['-1,-1'],'0,0':null,'4,4':null},150000),{status:'saved',revision:4});
  assert.equal(count(),0);assert.deepEqual(store.readDraft(legacy.id),next);
  assert.equal(fs.existsSync(path.join(dir,'worlds',legacy.id+'-chunks.json')),false);
  const saved=fs.readFileSync(legacyFile);
  assert.deepEqual(store.writeDraftChanges(next,3,{},150000),{status:'conflict'});
  assert.deepEqual(store.writeDraftChanges({...next,revision:5},4,{},0),{status:'limit'});
  assert.deepEqual(fs.readFileSync(legacyFile),saved);assert.equal(JSON.parse(fs.readFileSync(file)).map.revision,3);
});

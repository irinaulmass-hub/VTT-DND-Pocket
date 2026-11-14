'use strict';
// Diagnostics only: seeds a disposable campaign, then measures the real public HTTP route.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {fixture,profiles,aggregate,summary,freePort}=require('./world-benchmark.cjs');
const map=require('../remote/world-model');
const {project}=require('../world-exploration');
const root=path.resolve(__dirname,'..');
const queries={near:['0,0'],adjacent:['0,0','1,0','0,-1','1,-1'],
  distant:['-16,32','-15,32','-16,33','-15,33'],live:['31,-2'],empty:['100,100']};
const publicProp=({id,kind,x,y,turn})=>({id,kind,x,y,turn});

function optionsFor(args) {
  const options={profile:'small',samples:5,stages:'on',fog:'on',output:null,ref:null};
  for(let i=0;i<args.length;i+=2) {
    const key=args[i].slice(2),value=args[i+1];
    if(!args[i].startsWith('--')||!Object.hasOwn(options,key)||!value)throw Error('Unknown or missing argument');
    options[key]=value;
  }
  options.samples=Number(options.samples);
  if(!Object.hasOwn(profiles,options.profile)||!Number.isInteger(options.samples)||options.samples<1||options.samples>10||
    !['on','off'].includes(options.stages)||!['on','off'].includes(options.fog)||
    options.ref&&!/^[a-f0-9]{40}$/.test(options.ref))throw Error('Invalid table benchmark options');
  return options;
}

function tableFixture(config,file,fog) {
  const built=fixture(config,file), layout=built.layout;
  // Replace seven objects, preserving the existing per-profile count and object limit.
  const probes=[
    {id:'probe-crown',kind:'tree',x:-1,y:-6,turn:0},
    {id:'probe-door',kind:'door',x:32,y:4,turn:1},
    {id:'probe-moved',kind:'tavern',x:1000,y:-64,turn:0},
    {id:'probe-hidden',kind:'chest',x:2,y:8,turn:0,hidden:true},
    {id:'probe-unseen',kind:'barrel',x:1,y:8,turn:0},
    {id:'probe-fallback',kind:'barrel',x:3,y:8,turn:0},
    {id:'probe-revealed',kind:'chest',x:5,y:8,turn:0,hidden:true},
  ];
  const objects=[...layout.objects.slice(0,-probes.length),...probes].map(p=>({...p,notes:'BENCH_PRIVATE'}));
  const snapshot={map:{id:layout.id,name:layout.name,revision:layout.revision,chunks:layout.chunks,objects},
    fog,revision:1,seen:{},tokens:[],frame:{x:0,y:0,scale:24,serial:0},notes:'BENCH_PRIVATE'};
  const memory={chunks:structuredClone(layout.chunks),objects:{}};
  const explored=Object.fromEntries(Object.entries(layout.chunks).map(([key,cells])=>
    [key,Object.fromEntries(Object.keys(cells).map(offset=>[offset,true]))]));
  for(const p of objects.filter(p=>!p.hidden))memory.objects[':'+p.id]={...publicProp(p),notes:'BENCH_PRIVATE'};
  memory.objects[':probe-moved']={id:'probe-moved',kind:'tavern',x:31,y:2,turn:0};
  memory.objects[':probe-door'].open=true;
  memory.objects[':probe-old']={id:'probe-old',kind:'barrel',x:4,y:8,turn:0,notes:'BENCH_PRIVATE'};
  delete memory.objects[':probe-unseen'];delete memory.objects[':probe-fallback'];
  // The old terrain differs from the publication and includes an explicitly remembered empty cell.
  map.set(memory.chunks,0,0,'stone');map.set(memory.chunks,6,8,null);
  for(const [x,y] of [[1,8],[3,8]]) {
    const [key,offset]=map.address(x,y);delete (memory.chunks[key]||{})[offset];
  }
  map.set(explored,1,8,false);map.set(explored,3,8,true);
  for(const p of probes.filter(p=>p.id!=='probe-unseen'))map.set(explored,p.x,p.y,true);
  map.set(memory.chunks,-1,-6,'grass');map.set(memory.chunks,32,4,'path');
  const revealedSecrets={':probe-revealed':publicProp(probes.at(-1))};
  const scope={worldId:layout.id,sceneId:'overworld',floorId:'ground'};
  const scopeKey=JSON.stringify(Object.values(scope));
  const position={...scope,characterId:'bench-hero',x:1000,y:-64,revision:0};
  const positions={formatVersion:1,positions:{'bench-hero':position},observing:{'bench-hero':0},
    explored:{[scopeKey]:explored},memory:{[scopeKey]:memory},doors:{},revealedSecrets:{[layout.id]:revealedSecrets},
    projectionRevisions:{[layout.id]:{objects:2,sight:3}}};
  fs.writeFileSync(file('character-positions.json'),JSON.stringify(positions));
  fs.writeFileSync(file('characters.json'),JSON.stringify({characters:[{id:'bench-hero',name:'Benchmark'}]}));
  const store=require('../world-store')(file);store.writePublished(layout.id,snapshot);store.writeActiveId(layout.id);
  const movement=require('../world-movement')(store,file);
  const visible=fog?require('../world-exploration').mask(movement.visibleCells(position,objects,new Set())):{};
  const state={explored,memory,visible,openDoors:new Set(),revealedSecrets};
  const expected=Object.fromEntries(Object.entries(queries).map(([name,keys])=>[name,{
    id:layout.id,revision:1,frame:snapshot.frame,tokens:[],version:{generation:1,publication:1,exploration:fog?5:2},
    fog,...project(snapshot,new Set(keys),state),
  }]));
  return {expected,dimensions:{plots:config.plots,tiles:config.tiles,objects:objects.length,
    chunks:Object.keys(layout.chunks).length,memoryChunks:Object.keys(memory.chunks).length,
    memoryCells:Object.values(memory.chunks).reduce((n,c)=>n+Object.keys(c).length,0),
    memoryObjects:Object.keys(memory.objects).length,
    publishedManifestBytes:fs.statSync(file('worlds/'+layout.id+'-live-chunks.json')).size,
    positionsBytes:fs.statSync(file('character-positions.json')).size}};
}

function verify(name,value,expected,fog) {
  assert.deepEqual(value,expected,'HTTP agrees with the complete published snapshot and state: '+name);
  assert.equal(JSON.stringify(value).includes('BENCH_PRIVATE'),false);
  assert.equal(value.objects.some(p=>p.id==='probe-hidden'),false);
  assert.equal(new Set(value.objects.map(p=>p.id)).size,value.objects.length);
  if(name==='near') {
    assert.equal(value.objects.some(p=>p.id==='probe-moved'),false,'globally visible new location suppresses memory');
    assert.equal(value.objects.some(p=>p.id==='probe-revealed'),true,'matching reveal authorizes secret');
    if(fog) {
      assert.equal(value.chunks['0,0']['0'],'stone','old terrain is retained');
      assert.equal(value.objects.some(p=>p.id==='probe-unseen'),false);
      assert.equal(value.objects.some(p=>p.id==='probe-fallback'),true);
      assert.equal(value.objects.some(p=>p.id==='probe-old'),true);
      assert.equal(value.objects.find(p=>p.id==='probe-door')?.open,true);
    }
  }
  if(name==='adjacent')assert.equal(value.objects.some(p=>p.id==='probe-crown'),true,'visual overhang from negative chunk');
  if(name==='live')assert.equal(value.objects.some(p=>p.id==='probe-moved'),true);
  if(name==='empty')assert.deepEqual(value.objects,[]);
}

async function run(options) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-world-benchmark-'));
  let child;
  try {
    const fog=options.fog==='on',built=tableFixture(profiles[options.profile],name=>path.join(dir,name),fog);
    const port=await freePort(),base='http://127.0.0.1:'+port;
    child=spawn(process.execPath,['--require',path.join(__dirname,'world-benchmark-probe.cjs'),'server.js'],{
      cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dir,DM_PASSWORD:randomBytes(24).toString('hex'),
        VTT_WORLD_BENCHMARK:'1',VTT_WORLD_BENCHMARK_STAGES:options.stages},stdio:['ignore','ignore','pipe','ipc']});
    let error='';child.stderr.on('data',b=>{error=(error+b).slice(-2000);});
    const metrics=new Map(),pending=new Map();
    child.on('message',m=>{if(m.type==='world-benchmark'){
      if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else metrics.set(m.id,m);
    }});
    const metric=id=>metrics.has(id)?Promise.resolve(metrics.get(id)):new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('Probe timeout'));},10000);
      pending.set(id,m=>{clearTimeout(timer);resolve(m);});
    });
    let ready=false;
    for(let n=0;n<100;n++) {
      if(child.exitCode!==null||child.signalCode!==null)throw Error('Server exited: '+error);
      try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,50));
    }
    if(!ready)throw Error('Server startup timeout: '+error);
    const rows=[],responseSha256={};let seq=0;
    for(let sample=-1;sample<options.samples;sample++)for(const [name,keys] of Object.entries(queries)) {
      const id='table-'+(++seq),start=performance.now();
      const response=await fetch(base+'/api/worlds/table?chunks='+keys.join(';'),{
        headers:{'x-vtt-benchmark-id':id},signal:AbortSignal.timeout(30000)});
      const text=await response.text(),value=JSON.parse(text),wallMs=performance.now()-start;
      assert.equal(response.status,200);verify(name,value,built.expected[name],fog);
      const digest=createHash('sha256').update(text).digest('hex');
      if(responseSha256[name])assert.equal(digest,responseSha256[name]);else responseSha256[name]=digest;
      const measured=await metric(id);
      if(sample>=0)rows.push({...measured,operation:name,wallMs,responseBytes:Buffer.byteLength(text),requestBytes:0,serializeMs:0});
    }
    const summaries=aggregate(rows);
    for(const [name,item] of Object.entries(summaries))item.readCategories=Object.fromEntries(
      [...new Set(rows.filter(r=>r.operation===name).flatMap(r=>Object.keys(r.readCategories)))].map(category=>[category,
        Object.fromEntries(['calls','bytes','readMs'].map(key=>[key,summary(rows.filter(r=>r.operation===name).map(r=>r.readCategories[category]?.[key]||0))]))]));
    return {schemaVersion:1,applicationRef:options.ref,createdAt:new Date().toISOString(),
      environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,osRelease:os.release()},
      sourceSha256:Object.fromEntries(['worlds.js','world-store.js','world-exploration.js','character-positions.js',
        'world-movement.js','remote/world-model.js','scripts/world-benchmark.cjs','scripts/world-benchmark-probe.cjs',
        'scripts/world-benchmark-stages.cjs','scripts/world-table-benchmark.cjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),
      method:{...options,output:undefined,transport:'public loopback HTTP without DM cookie; includes download and JSON parse',
        cache:'one unrecorded warm-up per query; warm OS cache; no forced server GC',queries,
        stageTiming:'optional synchronous wrappers: inclusive totalMs, exclusive selfMs; do not sum inclusive times',
        io:'readFileSync only, categorized bytes/calls/readMs; JSON parsing stays in store/mapState selfMs',
        response:'response.json includes Express serialization, headers and send; not pure JSON.stringify',
        remainder:'server time outside exclusive spans; independent medians need not sum',
        fixture:'dense remembered terrain and objects; one observing hero; seeded via existing store in a temporary campaign',
        exclusions:'no browser/FPS, Wi-Fi, Windows or physical devices; diagnostic overhead is not production timing'},
      status:'verified',dimensions:built.dimensions,responseSha256,rows,summary:summaries};
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

async function main() {
  const options=optionsFor(process.argv.slice(2)),report=await run(options),json=JSON.stringify(report,null,2)+'\n';
  if(options.output){fs.mkdirSync(path.dirname(path.resolve(options.output)),{recursive:true});fs.writeFileSync(options.output,json,{flag:'wx'});}
  else process.stdout.write(json);
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={optionsFor,tableFixture,verify};

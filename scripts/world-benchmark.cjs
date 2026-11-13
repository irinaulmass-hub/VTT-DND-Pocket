'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const map = require('../remote/world-model');
const generators = require('../remote/world-generators');
const root = path.resolve(__dirname, '..');
const profiles = {
  small: { plots:1, houses:8, tiles:2048 },
  medium: { plots:25, houses:24, tiles:64000 },
  limit: { plots:125, houses:24, tiles:map.tileLimit },
};

function argumentsFor(args) {
  const options = { samples:5, profile:'all', output:null, ref:null, worker:null };
  for (let i=0;i<args.length;i+=2) {
    const name=args[i], value=args[i+1];
    if (!['--samples','--profile','--output','--ref','--worker'].includes(name) || !value) throw Error('Unknown or missing benchmark argument: '+name);
    options[name.slice(2)] = value;
  }
  options.samples=Number(options.samples);
  if (!Number.isInteger(options.samples) || options.samples<1 || options.samples>10) throw Error('Choose 1–10 samples');
  if (options.profile!=='all' && !profiles[options.profile] || options.worker && !profiles[options.worker]) throw Error('Unknown benchmark profile');
  if (options.ref && !/^[a-f0-9]{40}$/.test(options.ref)) throw Error('--ref must be the application commit SHA');
  return options;
}

function fixture(config, file) {
  const layout={id:'50000000-0000-0000-0000-000000000001',name:'Benchmark only',revision:1,chunks:{},objects:[],generators:[]};
  const columns=Math.ceil(Math.sqrt(config.plots));
  let first;
  for(let i=0;i<config.plots;i++) {
    const x=i%columns*72, y=Math.floor(i/columns)*72;
    const recipe={id:'bench-district-'+i,kind:'district',version:1,seed:47+i,params:{count:config.houses,
      points:[{x,y},{x:x+63,y},{x:x+63,y:y+63},{x,y:y+63}]}};
    const change=generators.generationChange(recipe,layout);
    Object.assign(layout,{chunks:change.chunks,objects:change.objects?.after||layout.objects,generators:change.generators.after});
    first ||= recipe;
  }
  let count=Object.values(layout.chunks).reduce((sum,chunk)=>sum+Object.keys(chunk).length,0);
  // Fill a separate distant area so the viewport and full-world read have different costs.
  for(let i=0;count<config.tiles;i++,count++) {
    const x=-512+i%512, y=1024+Math.floor(i/512);
    const hash=(Math.imul(x,374761393)^Math.imul(y,668265263))>>>0;
    map.set(layout.chunks,x,y,hash%23===0?'stone':hash%7===0?'dirt':'grass');
  }
  assert.equal(count,config.tiles);assert.ok(layout.objects.length<=map.objectLimit);
  assert.ok(generators.validGenerators(layout.generators));
  const store=require('../world-store')(file);store.writeDraft(layout);
  const target={id:'50000000-0000-0000-0000-000000000002',name:'Benchmark interior',parentWorldId:layout.id,
    revision:1,chunks:{},objects:[]};
  map.set(target.chunks,0,0,'wood');store.writeDraft(target);
  const house=layout.objects[0], b=map.cellBounds(house);
  const [x,y]=[[house.x,b.bottom+1],[b.left-1,house.y],[house.x,b.top-1],[b.right+1,house.y]][house.turn];
  const movement=require('../world-movement')(store,file);
  movement.saveBuildingLink(layout,target,{buildingId:house.id,sourceRevision:1,targetRevision:1,
    linksRevision:movement.linksRevision(),x,y,toX:0,toY:0});
  return { layout, first, house, links:movement.linksRevision() };
}

async function freePort() {
  const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
function summary(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return {min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};
}
function aggregate(rows) {
  return Object.fromEntries([...new Set(rows.map(row=>row.operation))].map(operation=>{
    const selected=rows.filter(row=>row.operation===operation);
    const fields=['wallMs','serverMs','cpuMs','responseBytes','requestBytes','serializeMs','reads','readBytes','writes','writeBytes','heapAfterBytes','rssBytes'];
    return [operation,{samples:selected.length,...Object.fromEntries(fields.map(key=>[key,summary(selected.map(row=>row[key]))]))}];
  }));
}

async function runProfile(name,samples) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-world-benchmark-'));
  let child;
  try {
    const config=profiles[name], built=fixture(config,name=>path.join(dir,name));
    const dimensions={plots:config.plots,objects:built.layout.objects.length,tiles:config.tiles,
      chunks:Object.keys(built.layout.chunks).length,
      draftJsonBytes:Buffer.byteLength(JSON.stringify(built.layout)),
      generatorStateJsonBytes:Buffer.byteLength(JSON.stringify(built.layout.generators))};
    // No fixture objects remain live in the measurement server: it starts in a new process.
    const port=await freePort(), base='http://127.0.0.1:'+port, password=randomBytes(24).toString('hex');
    child=spawn(process.execPath,['--require',path.join(__dirname,'world-benchmark-probe.cjs'),'server.js'],{
      cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dir,DM_PASSWORD:password,VTT_WORLD_BENCHMARK:'1'},
      stdio:['ignore','ignore','pipe','ipc']});
    let serverError='';child.stderr.on('data',chunk=>{serverError=(serverError+chunk).slice(-4000);});
    const metrics=new Map(), pending=new Map();
    child.on('message',message=>{
      if(message.type!=='world-benchmark')return;
      if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}else metrics.set(message.id,message);
    });
    const metric=id=>metrics.has(id)?Promise.resolve(metrics.get(id)):new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('Probe response timeout'));},10000);
      pending.set(id,value=>{clearTimeout(timer);resolve(value);});
    });
    let ready=false;
    for(let i=0;i<100;i++) {
      if(child.exitCode!==null||child.signalCode!==null)throw Error('Benchmark server exited: '+serverError);
      try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!ready)throw Error('Benchmark server startup timeout: '+serverError);
    const login=await fetch(base+'/dm-login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({password}).toString()});
    assert.equal(login.status,302);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const id=built.layout.id, rows=[];
    let sequence=0;
    async function call(endpoint,body,operation) {
      const serializeStart=performance.now(), payload=body===undefined?undefined:JSON.stringify(body);
      const serializeMs=performance.now()-serializeStart, probeId='request-'+(++sequence);
      const start=performance.now();
      const response=await fetch(base+endpoint,{method:body===undefined?'GET':endpoint.endsWith('/district-preview')||endpoint.endsWith('/publish')?'POST':'PUT',
        headers:{Cookie:cookie,'Content-Type':'application/json','x-vtt-benchmark-id':probeId},body:payload,signal:AbortSignal.timeout(30000)});
      const text=await response.text();
      let value;try{value=JSON.parse(text);}catch{value={error:text.slice(0,200)};}
      const wallMs=performance.now()-start, measured=await metric(probeId);
      if(operation)rows.push({...measured,operation,wallMs,serializeMs,requestBytes:payload?Buffer.byteLength(payload):0,responseBytes:Buffer.byteLength(text)});
      if(!response.ok && response.status!==413)throw Error('Benchmark HTTP '+response.status+': '+JSON.stringify(value));
      return {value,status:response.status,requestBytes:payload?Buffer.byteLength(payload):0};
    }
    await call('/api/worlds/'+id+'/publish',{revision:1,fog:false});
    let saved, maxSaveBytes=0;
    for(let sample=-1;sample<samples;sample++) {
      const label=name=>sample<0?undefined:name;
      saved=(await call('/api/worlds/'+id,undefined,label('full_load'))).value;
      assert.equal(saved.objects.length,dimensions.objects);
      const recipe={...built.first,seed:sample%2===0?0:47};
      const preview=(await call('/api/worlds/'+id+'/district-preview',{revision:saved.revision,recipe},label('district_preview'))).value;
      const next={...saved,chunks:preview.change.chunks,objects:preview.change.objects?.after||saved.objects,
        generators:preview.change.generators.after,districtGuard:preview.guard};
      const result=await call('/api/worlds/'+id,next,label('full_save'));maxSaveBytes=Math.max(maxSaveBytes,result.requestBytes);
      if(result.status===413)return {name,dimensions,status:'blocked_request_body_limit',maxSaveBytes,rows,summary:aggregate(rows)};
      saved=result.value;
      assert.equal(saved.objects.length,dimensions.objects);
      assert.deepEqual(saved.objects.find(prop=>prop.id===built.house.id),built.house,'bound house geometry stays intact');
      const viewport=(await call('/api/worlds/table?chunks=0,0;1,0;0,1;1,1',undefined,label('viewport_read'))).value;
      assert.equal(viewport.generators,undefined);assert.ok(Object.keys(viewport.chunks).length<=4);
    }
    const verification=(await call('/api/worlds/'+id)).value;
    assert.equal(verification.revision,saved.revision);assert.deepEqual(verification.generators,saved.generators);
    const movement=require('../world-movement')(require('../world-store')(file=>path.join(dir,file)),file=>path.join(dir,file));
    assert.equal(movement.linksRevision(),built.links,'measurement never changes the binding file');
    return {name,dimensions,status:'verified',maxSaveBytes,rows,summary:aggregate(rows)};
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

async function main() {
  const options=argumentsFor(process.argv.slice(2));
  if(options.worker){console.log(JSON.stringify(await runProfile(options.worker,options.samples)));return;}
  const results=[];
  for(const name of options.profile==='all'?Object.keys(profiles):[options.profile]) {
    console.error('Measuring '+name+' ('+options.samples+' samples after one warm-up)');
    const child=spawnSync(process.execPath,['--expose-gc',__filename,'--worker',name,'--samples',String(options.samples)],{
      cwd:root,encoding:'utf8',maxBuffer:10*1024*1024,timeout:180000});
    if(child.status!==0)throw Error(child.stderr||child.error?.message||'Benchmark worker failed');
    results.push(JSON.parse(child.stdout));
  }
  const report={schemaVersion:1,applicationRef:options.ref,createdAt:new Date().toISOString(),samples:options.samples,
    environment:{node:process.version,platform:process.platform,arch:process.arch,osRelease:os.release(),
      cpu:os.cpus()[0]?.model,availableParallelism:os.availableParallelism(),osReportedMemoryBytes:os.totalmem()},
    method:{transport:'loopback HTTP; response download and JSON parse included',requests:'sequential',
      cache:'warm filesystem/OS cache; one unrecorded warm-up; no forced server GC',
      memory:'server heap after each request; RSS and lifetime process peak; fixture built outside the server',
      viewport:'four published chunks; object metadata is not spatially filtered by the current store',
      p95:'nearest-rank; with 5 samples p95 equals the maximum',
      exclusions:'browser rendering/FPS, Wi-Fi latency, physical devices and Windows are not measured'},results};
  const json=JSON.stringify(report,null,2)+'\n';
  if(options.output){fs.mkdirSync(path.dirname(path.resolve(options.output)),{recursive:true});fs.writeFileSync(options.output,json,{flag:'wx'});
    console.error('Report created: '+path.resolve(options.output));}
  else process.stdout.write(json);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});

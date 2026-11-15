'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {freePort}=require('../scripts/world-benchmark.cjs');
const map=require('../remote/world-model'),g=require('../remote/world-generators');

test('room presets, generated furniture and structural paths persist through authenticated HTTP without leaking secrets',async t=>{
  const root=path.resolve(__dirname,'..'),upstreamPort=await freePort();
  const child=spawn(process.execPath,['scripts/browser-qa.cjs'],{cwd:root,
    env:{...process.env,QA_PORT:'0',QA_SERVER_PORT:String(upstreamPort),QA_RESUME_DATA_DIR:'',VTT_EDITOR_DEMO:'1',VTT_INSTANCE_ID:'editor-test-instance'},stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',resolve));let dataDir;
  t.after(async()=>{if(child.exitCode===null)child.kill();await exited;if(dataDir)fs.rmSync(dataDir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Disposable server startup timed out')),15000);let output='',errors='';
    child.stderr.on('data',bytes=>{errors+=bytes;});child.once('exit',()=>{clearTimeout(timer);reject(Error(errors||'Server exited'));});
    child.stdout.on('data',bytes=>{output+=bytes;const url=output.match(/http:\/\/127\.0\.0\.1:\d+/),dir=output.match(/Test DATA_DIR: (.+)\n/);
      if(url&&dir){dataDir=dir[1];clearTimeout(timer);resolve(url[0]);}});
  });
  async function request(url,method='GET',body,status=200) {
    const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
  }
  const health=await request(base+'/api/health');assert.equal(health.instanceId,'editor-test-instance');
  const demos=(await request(base+'/api/worlds')).worlds.filter(w=>w.id.startsWith('71000000-'));assert.equal(demos.length,6);
  const villageDemo=await request(base+'/api/worlds/72000000-0000-4000-8000-000000000000');assert.ok(villageDemo.objects.some(p=>p.kind==='marketStall'));
  let village=await request(base+'/api/worlds','POST',{name:'Landscape HTTP',preset:'village'},201);
  const villageUrl=base+'/api/worlds/'+village.id,market=village.objects.find(p=>p.kind==='marketStall');
  village.objects=village.objects.map(p=>p.id===market.id?{...p,hidden:true}:p);
  village=await request(villageUrl,'PUT',village);assert.ok(g.validGenerators(village.generators));
  assert.deepEqual((await request(villageUrl)).generators,village.generators);
  await request(villageUrl+'/publish','POST',{revision:village.revision,fog:false});
  const publicVillage=await request('http://127.0.0.1:'+upstreamPort+'/api/worlds/table?chunks='+Object.keys(village.chunks).join(';'));
  assert.ok(publicVillage.objects.some(p=>p.kind==='wheat'));assert.ok(!publicVillage.objects.some(p=>p.id===market.id));
  const plot=village.generators.find(p=>p.params.biome==='field');
  const plotRecipe={id:plot.id,kind:plot.kind,seed:plot.seed,version:plot.version,params:{...plot.params,biome:'garden',orientation:1}};
  const regen=g.generationChange(plotRecipe,village);
  village=await request(villageUrl,'PUT',{...village,chunks:regen.chunks,objects:regen.objects?.after || village.objects,generators:regen.generators.after});
  assert.equal((await request(villageUrl)).generators.find(p=>p.id===plot.id).params.orientation,1);
  for(const theme of Object.keys(g.roomThemes).filter(t=>t!=='none')) {
    const draft=await request(base+'/api/worlds','POST',{name:'Preset '+theme,preset:theme},201);
    assert.equal(draft.generators[0].params.furnishing,theme);assert.ok(draft.objects.length>30);
    assert.deepEqual((await request(base+'/api/worlds/'+draft.id)).generators,draft.generators);
  }
  const count=(await request(base+'/api/worlds')).worlds.length;
  for(const preset of ['__proto__','bad','none',null,{}])await request(base+'/api/worlds','POST',{name:'Invalid preset',preset},400);
  await request(base+'/api/worlds','POST',{name:'Conflicting preset',preset:'tavern',sample:true},400);
  assert.equal((await request(base+'/api/worlds')).worlds.length,count);
  let draft=await request(base+'/api/worlds','POST',{name:'Editable library',preset:'library'},201);
  const url=base+'/api/worlds/'+draft.id,source=draft.generators[0],shelf=draft.objects.find(p=>p.kind==='bookshelf');
  const manual=g.protectManualChanges(draft,{objects:{before:draft.objects,after:draft.objects.map(p=>p.id===shelf.id?{...p,x:30,y:30,hidden:true}:p)}});
  draft=await request(url,'PUT',{...draft,objects:manual.objects.after,generators:manual.generators.after});
  const change=g.generationChange({...source,params:{...source.params,furnishing:'crypt'}},draft);
  draft=await request(url,'PUT',{...draft,chunks:change.chunks,objects:change.objects.after,generators:change.generators.after});
  assert.equal(draft.generators[0].id,source.id);assert.equal(draft.objects.find(p=>p.id===shelf.id).hidden,true);
  assert.ok(draft.objects.some(p=>p.kind==='sarcophagus'));assert.deepEqual((await request(url)).objects,draft.objects);
  await request(url+'/publish','POST',{revision:draft.revision,fog:false});
  const keys=Object.keys(draft.chunks).join(';'),tableUrl='http://127.0.0.1:'+upstreamPort+'/api/worlds/table?chunks='+keys;
  const publicMap=await request(tableUrl);assert.ok(publicMap.objects.some(p=>p.kind==='sarcophagus'));
  assert.ok(!publicMap.objects.some(p=>p.id===shelf.id));assert.equal(publicMap.generators,undefined);
  const guest=await fetch('http://127.0.0.1:'+upstreamPort+'/api/worlds',{redirect:'manual'});assert.equal(guest.status,302);assert.match(guest.headers.get('location'),/dm-login/);
  const barrier={id:'http-fence',kind:'path',version:1,seed:0,params:{terrain:'fence',width:1,points:[{x:-16,y:-16},{x:16,y:-16}]}};
  const route=g.generationChange(barrier,draft);draft=await request(url,'PUT',{...draft,chunks:route.chunks,objects:route.objects.after,generators:route.generators.after});
  assert.ok(draft.objects.some(p=>p.kind==='fence'));assert.deepEqual((await request(tableUrl)).objects,publicMap.objects,'unpublished edits do not change TV');
  const bad=structuredClone(draft);bad.generators.at(-1).state.objects[0].kind='house';await request(url,'PUT',bad,400);
  assert.deepEqual((await request(url)).generators,draft.generators);
  await request(url+'/publish','POST',{revision:draft.revision,fog:true});
  const fog=await request(tableUrl);assert.deepEqual(fog.objects,[]);assert.equal(Object.values(fog.chunks).reduce((n,chunk)=>n+Object.keys(chunk).length,0),0);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {freePort}=require('../scripts/world-benchmark.cjs');
const map=require('../remote/world-model'),brush=require('../remote/world-brush');

test('manual brush and object-copy changes persist over HTTP with existing links, secret and fog protections',async t=>{
  const root=path.resolve(__dirname,'..'),upstreamPort=await freePort();
  const child=spawn(process.execPath,['scripts/browser-qa.cjs'],{cwd:root,
    env:{...process.env,QA_PORT:'0',QA_SERVER_PORT:String(upstreamPort),QA_RESUME_DATA_DIR:''},stdio:['ignore','pipe','pipe']});
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
  const html=await (await fetch(base+'/?view=maps')).text();assert.match(html,/remote\/world-brush\.js/);
  assert.equal((await fetch(base+'/remote/world-brush.js')).status,200);
  let draft=await request(base+'/api/worlds','POST',{name:'Brush HTTP'},201);
  const original=structuredClone(draft.chunks),stroke=brush.start(draft.chunks,{width:5,shape:'circle',type:'water'});
  stroke.add(-40,-1);stroke.add(40,1);const change=stroke.finish();assert.ok(change.tiles.length>350);
  const url=base+'/api/worlds/'+draft.id;
  draft=await request(url,'PUT',{revision:draft.revision,chunks:stroke.chunks,objects:[
    {id:'brush-secret',kind:'chest',x:0,y:0,turn:0,hidden:true}],generators:[]});
  const painted=structuredClone(draft.chunks);assert.deepEqual((await request(url)).chunks,painted);
  await request(url+'/publish','POST',{revision:draft.revision,fog:false});
  const tableUrl='http://127.0.0.1:'+upstreamPort+'/api/worlds/table?chunks='+Object.keys(painted).join(';');
  const table=await request(tableUrl);assert.deepEqual(table.chunks,painted);assert.deepEqual(table.objects,[]);
  for(const cell of change.tiles)map.set(draft.chunks,cell.x,cell.y,cell.before);
  assert.deepEqual(draft.chunks,original);draft=await request(url,'PUT',draft);
  assert.deepEqual((await request(tableUrl)).chunks,painted,'draft undo does not change the published map');
  for(const cell of change.tiles)map.set(draft.chunks,cell.x,cell.y,cell.after);
  draft=await request(url,'PUT',draft);assert.deepEqual(draft.chunks,painted);
  await request(url+'/publish','POST',{revision:draft.revision,fog:true});
  assert.equal(JSON.stringify((await request(tableUrl)).chunks).includes('water'),false,'unexplored terrain stays hidden');
  // Copy a bound building in the disposable exterior. The object gets no new transition pair.
  const exteriorId='20000000-0000-0000-0000-000000000001',interiorId='20000000-0000-0000-0000-000000000002';
  const exteriorUrl=base+'/api/worlds/'+exteriorId,exterior=await request(exteriorUrl),interior=await request(base+'/api/worlds/'+interiorId);
  const store=require('../world-store')(name=>path.join(dataDir,name)),movement=require('../world-movement')(store,name=>path.join(dataDir,name));
  const source=exterior.objects.find(p=>map.buildingKinds.has(p.kind)),bounds=map.cellBounds(source),adjacent=[];
  for(let x=bounds.left;x<=bounds.right;x++)adjacent.push({x,y:bounds.top-1},{x,y:bounds.bottom+1});
  for(let y=bounds.top;y<=bounds.bottom;y++)adjacent.push({x:bounds.left-1,y},{x:bounds.right+1,y});
  const entry=adjacent.find(p=>movement.canStep({...map.sceneScope(exterior),...p},false));assert.ok(entry);
  await request(exteriorUrl+'/building-links','POST',{buildingId:source.id,sourceRevision:exterior.revision,targetRevision:interior.revision,
    linksRevision:movement.linksRevision(),...entry,toMapId:interiorId,toX:3,toY:1},201);
  const linksFile=path.join(dataDir,'world-transitions.json'),linksBytes=fs.readFileSync(linksFile);
  const originalSource={...source,hidden:source.hidden===true};
  const duplicate={id:'http-building-copy',kind:source.kind,x:source.x+10,y:source.y+10,turn:source.turn,hidden:source.hidden===true};
  const saved=await request(exteriorUrl,'PUT',{...exterior,objects:[...exterior.objects,duplicate]});
  assert.deepEqual(saved.objects.find(p=>p.id===source.id),originalSource);
  assert.deepEqual(saved.objects.find(p=>p.id===duplicate.id),duplicate);
  assert.deepEqual(fs.readFileSync(linksFile),linksBytes);
  assert.deepEqual((await request(exteriorUrl)).objects.find(p=>p.id===duplicate.id),duplicate);
});

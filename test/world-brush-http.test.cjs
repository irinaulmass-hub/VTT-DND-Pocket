'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {freePort}=require('../scripts/world-benchmark.cjs');
const map=require('../remote/world-model'),brush=require('../remote/world-brush');

test('brush changes persist over real HTTP and publish with existing secret and fog protections',async t=>{
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
});

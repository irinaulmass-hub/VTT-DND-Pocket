const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const WebSocket=require('ws');
const root=path.resolve(__dirname,'..');
function message(ws,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handler);reject(Error('WebSocket update timeout'));},4000);function handler(raw){const msg=JSON.parse(raw);if(predicate(msg)){clearTimeout(timer);ws.off('message',handler);resolve(msg);}}ws.on('message',handler);});}
function open(cookie){return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:3098/ws',cookie?{headers:{Cookie:cookie}}:{});ws.once('open',()=>resolve(ws));ws.once('error',reject);});}
test('master authority, live updates, reconnect and persistence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-pocket-test-'));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3098',DATA_DIR:dir,DM_PASSWORD:'test-only'},stdio:'ignore'});
 const sockets=[];
 try{
  let ready=false;
  for(let i=0;i<60;i++){try{ready=(await fetch('http://127.0.0.1:3098/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'server starts');
  const base='http://127.0.0.1:3098';
  assert.match(await (await fetch(base+'/player')).text(),/sheet.js/);
  assert.match(await (await fetch(base+'/tv')).text(),/player.js/);
  assert.equal((await fetch(base+'/data/characters.json')).status,404);
  assert.equal((await fetch(base+'/api/characters',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:'{}'})).status,302);
  const login=await fetch(base+'/dm-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=test-only',redirect:'manual'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const ch=(await (await fetch(base+'/api/characters')).json()).characters[0];
  const player=await open();sockets.push(player);
  player.send(JSON.stringify({action:'update-character',characterId:ch.id,patch:{hp:1}}));
  // Roundtrip through the same connection ensures the rejected write was processed.
  let next=message(player,m=>m.type==='CHARACTERS_UPDATE');player.send(JSON.stringify({action:'request-characters'}));
  assert.equal((await next).characters[0].hp,ch.hp);
  next=message(player,m=>m.type==='CHARACTERS_UPDATE'&&m.characters[0].hp===24);
  const patch={hp:24,eclipse:3,conditions:['Отравление'],inventory:[{name:'Ключ',quantity:1}],abilities:[{name:'Второе дыхание',maxUses:1,used:0}],attacks:[{name:'Меч',attackBonus:6,damage:'1d8+4'}]};
  assert.equal((await fetch(base+'/api/characters/'+ch.id,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(patch)})).status,200);
  const update=(await next).characters[0];assert.equal(update.eclipse,3);assert.equal(update.inventory[0].name,'Ключ');
  const dm=await open(cookie);sockets.push(dm);next=message(player,m=>m.type==='CHARACTERS_UPDATE'&&m.characters[0].hp===23);dm.send(JSON.stringify({action:'update-character',characterId:ch.id,patch:{hp:23}}));await next;
  player.close();const reconnected=await open();sockets.push(reconnected);next=message(reconnected,m=>m.type==='CHARACTERS_UPDATE');reconnected.send(JSON.stringify({action:'request-characters'}));assert.equal((await next).characters[0].hp,23);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'characters.json'))).characters[0].hp,23);
 }finally{for(const ws of sockets)ws.terminate();child.kill();await new Promise(r=>child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
});

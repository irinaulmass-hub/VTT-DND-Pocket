const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const WebSocket=require('ws');
const root=path.resolve(__dirname,'..');
function message(ws,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handler);reject(Error('WebSocket update timeout'));},4000);function handler(raw){const msg=JSON.parse(raw);if(predicate(msg)){clearTimeout(timer);ws.off('message',handler);resolve(msg);}}ws.on('message',handler);});}
function open(cookie,game,view){return new Promise((resolve,reject)=>{const url=new URL('ws://127.0.0.1:3098/ws');if(game)url.searchParams.set('game',game);if(view)url.searchParams.set('view',view);const ws=new WebSocket(url,cookie?{headers:{Cookie:cookie}}:{});ws.once('open',()=>resolve(ws));ws.once('error',reject);});}
test('master authority, live updates, reconnect and persistence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-pocket-test-'));
 let assistantPayload;
 const ollama=require('node:http').createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/tags')res.end(JSON.stringify({models:[{name:'test-model'}]}));else{assistantPayload=JSON.parse(body);res.end(JSON.stringify({message:{content:'Три слуха для таверны'}}));}});});
 await new Promise(r=>ollama.listen(0,'127.0.0.1',r));
 const launch=()=>spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3098',DATA_DIR:dir,DM_PASSWORD:'test-only',OLLAMA_URL:'http://127.0.0.1:'+ollama.address().port},stdio:'ignore'});
 let child=launch();
 const stop=async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;};
 const sockets=[];
 const catalogImages=[];
 const base='http://127.0.0.1:3098';
 async function waitForServer() {
  let ready=false;
  for(let i=0;i<60;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'server starts');
 }
 try{
  await waitForServer();
  assert.match(await (await fetch(base+'/player')).text(),/sheet.js/);
  assert.match(await (await fetch(base+'/tv')).text(),/player.js/);
  assert.equal((await fetch(base+'/data/characters.json')).status,404);
  assert.equal((await fetch(base+'/api/characters',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:'{}'})).status,302);
  const login=await fetch(base+'/dm-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=test-only',redirect:'manual'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const ch=(await (await fetch(base+'/api/characters',{headers:{Cookie:cookie}})).json()).characters[0];
  const invitationResponse=await fetch(base+'/api/player-access',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({characterId:ch.id})});
  assert.equal(invitationResponse.status,201);
  const invitation=await invitationResponse.json();
  const invited=await open();sockets.push(invited);
  let invitedNext=message(invited,m=>m.type==='CHARACTERS_UPDATE');
  invited.send(JSON.stringify({action:'player-auth',token:invitation.token}));
  assert.deepEqual((await invitedNext).characters.map(c=>c.id),[ch.id]);
  invitedNext=message(invited,m=>m.type==='PLAYER_LOGIN_ERR');
  invited.send(JSON.stringify({action:'claim-character',characterId:'another',playerName:'Other'}));
  await invitedNext;
  const revoked=message(invited,m=>m.type==='ACCESS_REVOKED');
  assert.equal((await fetch(base+'/api/player-access/'+ch.id,{method:'DELETE',headers:{Cookie:cookie}})).status,200);
  await revoked;
  const rejected=await open();sockets.push(rejected);
  const rejection=message(rejected,m=>m.type==='ACCESS_REVOKED');
  rejected.send(JSON.stringify({action:'player-auth',token:invitation.token}));
  await rejection;
  const playerToken=(await (await fetch(base+'/api/player-access',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({characterId:ch.id})})).json()).token;
  assert.deepEqual((await (await fetch(base+'/api/characters')).json()).characters,[]);
  const guest=await open();sockets.push(guest);
  const emptyRoster=message(guest,m=>m.type==='CHARACTERS_UPDATE');
  guest.send(JSON.stringify({action:'request-characters'}));
  assert.deepEqual((await emptyRoster).characters,[]);
  const player=await open();sockets.push(player);
  const authenticated=message(player,m=>m.type==='CHARACTERS_UPDATE');
  player.send(JSON.stringify({action:'player-auth',token:playerToken}));
  assert.deepEqual((await authenticated).characters.map(c=>c.id),[ch.id]);
  const own=await fetch(base+'/api/characters',{headers:{Authorization:'Bearer '+playerToken}}).then(r=>r.json());
  assert.deepEqual(own.characters.map(c=>c.id),[ch.id]);
  player.send(JSON.stringify({action:'update-character',characterId:ch.id,patch:{hp:1}}));
  // Roundtrip through the same connection ensures the rejected write was processed.
  let next=message(player,m=>m.type==='CHARACTERS_UPDATE');player.send(JSON.stringify({action:'request-characters'}));
  assert.equal((await next).characters[0].hp,ch.hp);
  next=message(player,m=>m.type==='CHARACTERS_UPDATE'&&m.characters[0].hp===24);
  const patch={hp:24,eclipse:3,notes:'DM-only note',futurePrivateField:'DM-only future',conditions:['Отравление'],inventory:[{name:'Ключ',quantity:1}],abilities:[{name:'Второе дыхание',maxUses:1,used:0}],attacks:[{name:'Меч',attackBonus:6,damage:'1d8+4'}]};
  assert.equal((await fetch(base+'/api/characters/'+ch.id,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(patch)})).status,200);
  const update=(await next).characters[0];
  assert.equal(update.notes,undefined);assert.equal(update.futurePrivateField,undefined);
  const privateMaster=await fetch(base+'/api/characters',{headers:{Cookie:cookie}}).then(r=>r.json());
  assert.equal(privateMaster.characters.find(c=>c.id===ch.id).notes,'DM-only note');
  const personal=await fetch(base+'/api/characters',{headers:{Authorization:'Bearer '+playerToken}}).then(r=>r.json());
  assert.equal(personal.characters[0].notes,undefined);
  assert.equal(update.eclipse,3);assert.equal(update.inventory[0].name,'Ключ');
  const dm=await open(cookie);sockets.push(dm);next=message(player,m=>m.type==='CHARACTERS_UPDATE'&&m.characters[0].hp===23);dm.send(JSON.stringify({action:'update-character',characterId:ch.id,patch:{hp:23}}));await next;
  assert.deepEqual((await (await fetch(base+'/api/players')).json()).players, (await (await fetch(base+'/api/characters')).json()).characters);
  next=message(player,m=>m.type==='CHARACTERS_UPDATE' && m.characters[0].xp===125);
  dm.send(JSON.stringify({action:'update-player-data',playerName:ch.name,patch:{xp:125,tempHp:7}}));
  assert.equal((await next).characters[0].tempHp,7);
  let leaked=false;
  const observe=raw=>{if(JSON.parse(raw).type==='BLIND_ROLL_RESULT')leaked=true;};player.on('message',observe);
  next=message(dm,m=>m.type==='BLIND_ROLL_RESULT');
  dm.send(JSON.stringify({action:'dm-blind-roll',characterId:ch.id,skill:'Восприятие',modifier:3}));
  const blind=await next;assert.ok(blind.roll>=1 && blind.roll<=20);assert.equal(blind.total,blind.roll+3);
  player.send(JSON.stringify({action:'dm-blind-roll',characterId:ch.id,modifier:0}));
  next=message(player,m=>m.type==='CHARACTERS_UPDATE');player.send(JSON.stringify({action:'request-characters'}));await next;
  assert.equal(leaked,false);player.off('message',observe);
  assert.equal((await fetch(base+'/api/campaigns',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Forbidden'})})).status,302);
  const campaign=await (await fetch(base+'/api/campaigns',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Вторая игра'})})).json();
  assert.deepEqual((await (await fetch(base+'/api/characters?game='+campaign.id)).json()).characters,[]);
  assert.deepEqual((await (await fetch(base+'/api/scenes?game='+campaign.id,{headers:{Cookie:cookie}})).json()).scenes,[]);
  assert.equal((await fetch(base+'/api/characters?game=../bad')).status,404);
  const other=await open(cookie,campaign.id);sockets.push(other);
  let crossTalk=false;const crossObserve=raw=>{if(['CHARACTERS_UPDATE','UPDATE_TOKENS'].includes(JSON.parse(raw).type))crossTalk=true;};player.on('message',crossObserve);
  const otherChar=await (await fetch(base+'/api/characters?game='+campaign.id,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Другой герой',maxHp:15})})).json();
  next=message(other,m=>m.type==='CHARACTERS_UPDATE' && m.characters[0]?.hp===12);
  other.send(JSON.stringify({action:'update-character',characterId:otherChar.id,patch:{hp:12}}));await next;
  next=message(other,m=>m.type==='UPDATE_TOKENS');other.send(JSON.stringify({action:'update-tokens',mapKey:'other-map',tokens:[{id:'other-token',x:0.5,y:0.5}]}));await next;
  await new Promise(r=>setTimeout(r,50));assert.equal(crossTalk,false);
  next=message(player,m=>m.type==='CHARACTERS_UPDATE');player.send(JSON.stringify({action:'request-characters'}));const unchanged=await next;
  // The explicitly requested roster above is expected; other campaign broadcasts are not.
  player.off('message',crossObserve);
  assert.ok(unchanged.characters.every(c=>c.name!=='Другой герой'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'campaigns',campaign.id,'characters.json'))).characters[0].hp,12);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'campaigns',campaign.id,'state.json'))).currentTokens[0].id,'other-token');
  const otherToken=await fetch(base+'/api/player-access?game='+campaign.id,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({characterId:otherChar.id})}).then(r=>r.json());
  assert.deepEqual((await fetch(base+'/api/characters?game='+campaign.id,{headers:{Authorization:'Bearer '+playerToken}}).then(r=>r.json())).characters,[]);
  const otherReconnected=await open(undefined,campaign.id);sockets.push(otherReconnected);
  next=message(otherReconnected,m=>m.type==='CHARACTERS_UPDATE');otherReconnected.send(JSON.stringify({action:'player-auth',token:otherToken.token}));assert.equal((await next).characters[0].hp,12);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir,'campaigns.json'))).some(c=>c.id===campaign.id));

  // DM-only notes: separate campaign/scene scopes and optimistic concurrency.
  assert.equal((await fetch(base+'/api/notes')).status,401);
  assert.equal((await fetch(base+'/api/notes?game='+campaign.id)).status,401);
  assert.equal((await fetch(base+'/api/notes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Unauthorized',revision:0})})).status,401);
  const noteHeaders={Cookie:cookie,'Content-Type':'application/json'};
  const writeNote=(suffix,text,revision)=>fetch(base+'/api/notes'+suffix,{method:'PUT',headers:noteHeaders,body:JSON.stringify({text,revision})});
  const readNote=async suffix=>{const response=await fetch(base+'/api/notes'+suffix,{headers:{Cookie:cookie}});assert.match(response.headers.get('cache-control'),/no-store/);return response.json();};
  assert.equal((await readNote('')).text,'');
  assert.equal((await writeNote('','Секрет кампании',0)).status,200);
  assert.equal((await writeNote('','Потерянная правка',0)).status,409);
  assert.equal((await readNote('')).text,'Секрет кампании');
  assert.equal((await writeNote('?scene=forest','Засада в лесу',0)).status,200);
  assert.equal((await readNote('?scene=forest')).text,'Засада в лесу');
  assert.equal((await readNote('?scene=inn')).text,'');
  assert.equal((await readNote('?game='+campaign.id)).text,'');
  assert.equal((await writeNote('?game='+campaign.id,'Другой сюжет',0)).status,200);
  assert.equal((await readNote('')).text,'Секрет кампании');
  assert.equal((await writeNote('','',1)).status,200);
  assert.equal((await readNote('')).text,'');
  assert.equal((await writeNote('','Invalid',-1)).status,400);
  assert.equal((await writeNote('','x'.repeat(200001),2)).status,400);
  assert.equal((await fetch(base+'/data/notes.json')).status,404);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'notes.json'))).entries['scene:forest'].text,'Засада в лесу');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'campaigns',campaign.id,'notes.json'))).entries.campaign.text,'Другой сюжет');
  assert.equal((await fetch(base+'/api/assistant/models')).status,401);
  const ai=await fetch(base+'/api/assistant/chat?game='+campaign.id,{method:'POST',headers:noteHeaders,body:JSON.stringify({model:'test-model',question:'Слухи?',includeNotes:true})});
  assert.equal(ai.status,200);assert.equal((await ai.json()).answer,'Три слуха для таверны');
  assert.match(assistantPayload.messages[1].content,/Другой сюжет/);assert.doesNotMatch(assistantPayload.messages[1].content,/Засада в лесу/);
  // Loot is private until revealed; one snapshot contains both stock and inventory.
  const lootHeaders={Cookie:cookie,'Content-Type':'application/json'};
  const writeLoot=(url,method,body,asDm=true)=>fetch(base+url,{method,redirect:'manual',headers:asDm?lootHeaders:{'Content-Type':'application/json',Authorization:'Bearer '+playerToken},body:JSON.stringify(body)});
  const getLoot=async (suffix='',asDm=false)=>(await (await fetch(base+'/api/loot'+suffix,{headers:asDm?{Cookie:cookie}:{}})).json()).containers;
  assert.equal((await writeLoot('/api/loot','POST',{name:'Forbidden'},false)).status,302);
  const chest=await (await writeLoot('/api/loot','POST',{name:'Тайник',tokenId:'chest-one',mapKey:'forest'})).json();
  assert.ok(chest.id);assert.equal(chest.revealed,false);
  assert.equal((await writeLoot('/api/loot','POST',{name:'Duplicate',tokenId:'chest-one',mapKey:'forest'})).status,409);
  let filled=await (await writeLoot('/api/loot/'+chest.id,'PUT',{revision:0,name:'Тайник',revealed:false,items:[{name:'Секретное зелье',quantity:3,rarity:'rare',properties:'Лечение',description:'Синий флакон'}]})).json();
  assert.equal(filled.items.length,1);
  assert.deepEqual(await getLoot(),[]);
  assert.equal((await getLoot('',true))[0].items[0].name,'Секретное зелье');
  assert.equal(JSON.stringify(await (await fetch(base+'/api/characters')).json()).includes('Секретное зелье'),false);
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{revision:1,itemId:filled.items[0].id,quantity:1,characterId:ch.id},false)).status,404);
  filled=await (await writeLoot('/api/loot/'+chest.id,'PUT',{...filled,revealed:true})).json();
  assert.equal((await getLoot('?tokenId=chest-one&mapKey=forest')).length,1);
  assert.equal((await getLoot('?tokenId=chest-one&mapKey=other')).length,0);
  assert.equal((await getLoot('?game='+campaign.id)).length,0);
  assert.equal((await getLoot())[0].transfers,undefined);
  const take={revision:filled.revision,itemId:filled.items[0].id,quantity:1,characterId:ch.id};
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{...take,quantity:-1},false)).status,400);
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{...take,quantity:4},false)).status,409);
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{...take,characterId:otherChar.id},false)).status,403);
  const outcomes=await Promise.all([writeLoot('/api/loot/'+chest.id+'/take','POST',take,false),writeLoot('/api/loot/'+chest.id+'/take','POST',take,false)]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  assert.equal((await writeLoot('/api/loot/'+chest.id,'PUT',filled)).status,409,'stale editor cannot restore taken stock');
  let remaining=(await getLoot())[0];assert.equal(remaining.items[0].quantity,2);
  const receivedLoot=message=>message.characters.find(c=>c.id===ch.id).inventory.filter(i=>i.name===filled.items[0].name);
  next=message(player,m=>m.type==='CHARACTERS_UPDATE'&&receivedLoot(m).length===2);
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{...take,revision:remaining.revision,quantity:2},false)).status,200);
  const received=receivedLoot(await next);
  assert.equal(received.reduce((sum,i)=>sum+i.quantity,0),3);assert.equal(received[0].rarity,'rare');assert.equal(received[0].properties,'Лечение');
  assert.ok(received.every(item=>!Object.hasOwn(item,'sourceContainer')));
  remaining=(await getLoot())[0];assert.equal(remaining.items.length,0);
  assert.equal((await writeLoot('/api/loot/'+chest.id+'/take','POST',{...take,revision:remaining.revision},false)).status,409);
  const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'characters.json')));
  assert.equal(snapshot.lootContainers.find(c=>c.id===chest.id).items.length,0);
  assert.equal(snapshot.lootContainers.find(c=>c.id===chest.id).transfers.length,2);
  assert.equal(snapshot.characters.find(c=>c.id===ch.id).inventory.filter(i=>i.sourceContainer===chest.id).reduce((sum,i)=>sum+i.quantity,0),3);
  // Custom libraries remain DM-only and campaign-scoped.
  assert.equal((await fetch(base+'/api/library',{redirect:'manual'})).status,302);
  const templateBody={kind:'creature',name:'Страж шахты',hp:17,ac:13,description:'Тестовая карточка',notes:'Секретный проход'};
  const template=await (await fetch(base+'/api/library',{method:'POST',headers:noteHeaders,body:JSON.stringify(templateBody)})).json();
  assert.ok(template.id);
  assert.equal((await (await fetch(base+'/api/library?game='+campaign.id,{headers:{Cookie:cookie}})).json()).entries.length,0);
  // Shared entries are master-only snapshots. Imported copies belong to the destination campaign.
  assert.equal((await fetch(base+'/api/catalog',{redirect:'manual'})).status,302);
  const shared=(await (await fetch(base+'/api/catalog',{method:'POST',headers:noteHeaders,body:JSON.stringify({cardId:template.id,tags:['шахта']})})).json());
  const imported=(await (await fetch(base+'/api/catalog/'+shared.id+'/import?game='+campaign.id,{method:'POST',headers:noteHeaders})).json()).card;
  assert.notEqual(imported.id,template.id);assert.equal(imported.notes,'Секретный проход');
  const edited=await fetch(base+'/api/library/'+imported.id+'?game='+campaign.id,{method:'PUT',headers:noteHeaders,body:JSON.stringify({...imported,hp:4})});
  assert.equal(edited.status,200);
  const original=(await (await fetch(base+'/api/library',{headers:noteHeaders})).json()).entries.find(item=>item.id===template.id);
  assert.equal(original.hp,17);
  const mapImport=await fetch(base+'/api/catalog/starter-farm/import?game='+campaign.id,{method:'POST',headers:noteHeaders});
  assert.equal(mapImport.status,201);
  const mapCopy=await mapImport.json();
  assert.match(mapCopy.draft,/^[\da-f-]+-catalog-[\da-f-]+$/);
  catalogImages.push(path.join(root,'public','assets','maps',mapCopy.draft+'.png'));
  const draftUrl='/api/map-builder/state?name='+mapCopy.draft;
  assert.equal((await fetch(base+draftUrl,{headers:noteHeaders})).status,404);
  const copiedDraft=(await (await fetch(base+draftUrl+'&game='+campaign.id,{headers:noteHeaders})).json());
  assert.equal(copiedDraft.bgImage,'/api/catalog/starter-farm/image');
  assert.equal((await fetch(base+copiedDraft.bgImage,{redirect:'manual'})).status,302);
  const localScenes=(await (await fetch(base+'/api/scenes?game='+campaign.id,{headers:{Cookie:cookie}})).json()).scenes;
  assert.equal(localScenes[0].views[0].builderDraft,mapCopy.draft);
  assert.equal((await fetch(base+'/api/library/'+template.id,{method:'PUT',headers:noteHeaders,body:JSON.stringify({...templateBody,revision:99})})).status,409);
  const copy=await (await fetch(base+'/api/characters/'+ch.id+'/duplicate',{method:'POST',headers:{Cookie:cookie}})).json();assert.notEqual(copy.id,ch.id);assert.equal(copy.hp,23);assert.equal(copy.claimedBy,null);
  next=message(player,m=>m.type==='UPDATE_TOKENS');
  dm.send(JSON.stringify({action:'update-tokens',mapKey:'private-test',tokens:[{id:'secret-trap',label:'Секретная ловушка',hidden:true,x:0.1,y:0.2},{id:'visible-chest',label:'Сундук',x:0.3,y:0.3}]}));
  assert.deepEqual((await next).tokens.map(t=>t.id),['visible-chest']);
  next=message(dm,m=>m.type==='UPDATE_TOKENS');dm.send(JSON.stringify({action:'request-sync'}));assert.equal((await next).tokens.length,2);
  next=message(player,m=>m.type==='UPDATE_TOKENS');player.send(JSON.stringify({action:'request-sync'}));assert.equal((await next).tokens.length,1);
  // A table window shares the master's browser cookie, but its connection is read-only.
  const table=await open(cookie,campaign.id,'table');sockets.push(table);
  const tableQuery='?game='+campaign.id+'&view=table';
  const farmAsset='/assets/maps/winden-farm.png';
  const linkedAsset='/assets/maps/winden-mine.png';
  const publicAsset=(asset,query=tableQuery)=>base+'/presentation'+asset+query;
  for(const endpoint of ['/api/scenes','/api/maps','/api/audio','/api/tiles','/api/state']){
   assert.equal((await fetch(base+endpoint+tableQuery,{headers:{Cookie:cookie},redirect:'manual'})).status,302);
   assert.equal((await fetch(base+endpoint+'?game='+campaign.id,{redirect:'manual'})).status,302);
  }
  assert.equal((await fetch(base+farmAsset)).status,404);
  assert.equal((await fetch(base+'/assets/%6daps/winden-farm.png')).status,404);
  assert.equal((await fetch(base+farmAsset+tableQuery,{headers:{Cookie:cookie}})).status,404);
  assert.equal((await fetch(base+farmAsset,{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(publicAsset(farmAsset),{headers:{Cookie:cookie}})).status,404);
  const tableMessages=[];table.on('message',raw=>tableMessages.push(JSON.parse(raw)));
  const pendingTrap={id:'pending-trap',type:'trap',cells:[[2,3]],description:'Где находится засада'};
  const publicEffect={id:'public-effect',type:'effect',cells:[[1,1]],description:'Заметка мастера',linkedMap:linkedAsset};
  next=message(table,m=>m.type==='SHOW_SCENE_VIEW');
  other.send(JSON.stringify({action:'show-scene-view',image:'/assets/maps/winden-farm.png',mapKey:'table-map',fogKey:'table-map',features:[pendingTrap,publicEffect],mapMeta:{cols:4,rows:4}}));
  assert.deepEqual((await next).features,[]);
  const publishedMap=await fetch(publicAsset(farmAsset));
  assert.equal(publishedMap.status,200);
  assert.match(publishedMap.headers.get('cache-control'),/no-store/);
  assert.equal((await fetch(publicAsset(farmAsset,'?game=default'))).status,404);
  assert.equal((await fetch(publicAsset(linkedAsset))).status,404);
  const audioAsset='/assets/audio/'+campaign.id+'.wav';
  const audioFile=path.join(root,'public',audioAsset.slice(1));
  fs.mkdirSync(path.dirname(audioFile),{recursive:true});
  fs.writeFileSync(audioFile,'RIFF-test-audio');
  catalogImages.push(audioFile);
  assert.equal((await fetch(base+audioAsset)).status,404);
  assert.equal((await fetch(publicAsset(audioAsset))).status,404);
  next=message(table,m=>m.type==='PLAY_AUDIO');
  other.send(JSON.stringify({action:'play-audio',url:audioAsset}));
  await next;
  assert.equal((await fetch(publicAsset(audioAsset))).status,200);
  next=message(table,m=>m.type==='STOP_AUDIO');
  other.send(JSON.stringify({action:'stop-audio'}));
  await next;
  assert.equal((await fetch(publicAsset(audioAsset))).status,404);
  next=message(table,m=>m.type==='UPDATE_FOG'&&m.fogGrid?.[0]?.[0]===true);
  other.send(JSON.stringify({action:'update-fog',fogKey:'table-map',fogGrid:[[true,false],[false,false]]}));
  assert.deepEqual((await next).fogGrid,[[true,false],[false,false]]);
  next=message(table,m=>m.type==='UPDATE_TOKENS'&&m.tokens.length);
  other.send(JSON.stringify({action:'update-tokens',mapKey:'table-map',tokens:[{id:'hidden-test',hidden:true},{id:'party-test',x:0.2,y:0.2}]}));
  assert.deepEqual((await next).tokens.map(t=>t.id),['party-test']);
  next=message(table,m=>m.type==='TRIGGER_FEATURE');
  other.send(JSON.stringify({action:'trigger-feature',featureId:publicEffect.id,mapKey:'table-map'}));
  const triggered=(await next);assert.equal(triggered.feature.id,publicEffect.id);assert.equal(triggered.feature.description,undefined);assert.equal(triggered.allFeatures,undefined);
  assert.equal((await fetch(publicAsset(linkedAsset))).status,200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'campaigns',campaign.id,'state.json'))).currentFeatureStates[publicEffect.id],'triggered');
  const tableAgain=await open(cookie,campaign.id,'table');sockets.push(tableAgain);
  tableAgain.on('message',raw=>tableMessages.push(JSON.parse(raw)));
  next=message(tableAgain,m=>m.type==='UPDATE_TOKENS');tableAgain.send(JSON.stringify({action:'request-sync'}));
  assert.equal((await next).tokens.length,1);
  const beforeReadOnlyCheck=tableMessages.length;
  next=message(tableAgain,m=>m.type==='GRID_TOGGLE');tableAgain.send(JSON.stringify({action:'clear-scene'}));tableAgain.send(JSON.stringify({action:'request-sync'}));await next;
  assert.ok(tableMessages.some(m=>m.type==='SHOW_SCENE_VIEW'&&m.mapKey==='table-map'));
  assert.ok(tableMessages.every(m=>m.type!=='DM_STATE_RESTORE'));
  assert.ok(tableMessages.slice(beforeReadOnlyCheck).every(m=>m.type!=='CLEAR_SCENE'));
  assert.doesNotMatch(JSON.stringify(tableMessages),/hidden-test|pending-trap|Заметка мастера/);
  assert.equal((await fetch(base+'/api/adventure',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/api/adventure/source.pdf',{redirect:'manual'})).status,302);
  const adventure=await (await fetch(base+'/api/adventure',{headers:{Cookie:cookie}})).json();assert.equal(adventure.pages.length,36);assert.match(adventure.pages[1].text,/2024/);
  const storyState={...adventure.state,current:'road',done:['intro'],notes:{road:'Партия нашла фургон'}};
  assert.equal((await fetch(base+'/api/adventure/state',{method:'PUT',headers:noteHeaders,body:JSON.stringify(storyState)})).status,200);
  assert.equal((await fetch(base+'/api/adventure/state',{method:'PUT',headers:noteHeaders,body:JSON.stringify(storyState)})).status,409);
  const otherAdventure=await (await fetch(base+'/api/adventure?game='+campaign.id,{headers:{Cookie:cookie}})).json();
  assert.equal(otherAdventure.state,null);assert.deepEqual(otherAdventure.pages,[]);
  assert.equal((await fetch(base+'/api/adventure/source.pdf?game='+campaign.id,{headers:{Cookie:cookie}})).status,404);
  const packedCampaign=await (await fetch(base+'/api/campaigns',{method:'POST',headers:noteHeaders,body:JSON.stringify({name:'Винден из набора',pack:'goblin-wars'})})).json();
  const packedAdventure=await (await fetch(base+'/api/adventure?game='+packedCampaign.id,{headers:{Cookie:cookie}})).json();
  assert.equal(packedAdventure.state.current,'intro');assert.equal(packedAdventure.pages.length,36);
  assert.equal((await (await fetch(base+'/api/library?game='+packedCampaign.id,{headers:{Cookie:cookie}})).json()).entries.length,23);
  assert.equal((await (await fetch(base+'/api/scenes?game='+packedCampaign.id,{headers:{Cookie:cookie}})).json()).scenes.length,2);
  const draftDir=path.join(dir,'campaigns',campaign.id,'map-drafts');
  fs.mkdirSync(draftDir,{recursive:true});
  fs.writeFileSync(path.join(draftDir,'private.map.json'),JSON.stringify({features:[pendingTrap]}));
  assert.equal((await fetch(base+'/api/map-builder/state?game='+campaign.id+'&name=private',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/api/map-builder/state?name=private',{headers:{Cookie:cookie}})).status,404);
  assert.deepEqual((await (await fetch(base+'/api/map-builder/state?game='+campaign.id+'&name=private',{headers:{Cookie:cookie}})).json()).features,[pendingTrap]);
  const seededLibrary=(await (await fetch(base+'/api/library',{headers:{Cookie:cookie}})).json()).entries;assert.ok(seededLibrary.some(e=>e.name==='Харамах'&&e.hp===21));assert.ok(seededLibrary.some(e=>e.name==='Грум-Грум'&&e.sourcePage===35));
  const heroChoices={cls:'Barbarian',species:'elf',elfSkill:'perception',background:'soldier',level:1,skills:['nature','survival'],base:{str:15,dex:14,con:13,int:8,wis:12,cha:10},boost:{str:2,con:1}};
  const automatic=await fetch(base+'/api/characters/automatic',{method:'POST',headers:noteHeaders,body:JSON.stringify({name:'Эльф-варвар',choices:heroChoices})});assert.equal(automatic.status,201);const autoHero=await automatic.json();assert.equal(autoHero.hp,14);assert.equal(autoHero.xp,0);
  await fetch(base+'/api/characters/'+autoHero.id,{method:'PUT',headers:noteHeaders,body:JSON.stringify({hp:9,xp:125,resources:autoHero.resources.map(r=>({...r,used:2}))})});
  const advancedResponse=await fetch(base+'/api/characters/'+autoHero.id+'/advance',{method:'POST',headers:noteHeaders,body:JSON.stringify({fromLevel:1,level:2})});assert.equal(advancedResponse.status,200);const advanced=await advancedResponse.json();assert.equal(advanced.maxHp,23);assert.equal(advanced.hp,18);assert.equal(advanced.xp,125);assert.equal(advanced.resources[0].used,2);
  assert.equal((await fetch(base+'/api/characters/'+autoHero.id+'/advance',{method:'POST',headers:noteHeaders,body:JSON.stringify({fromLevel:1,level:2})})).status,409);
  const rested=await (await fetch(base+'/api/characters/'+autoHero.id+'/rest',{method:'POST',headers:noteHeaders,body:JSON.stringify({type:'short'})})).json();assert.equal(rested.resources[0].used,1);assert.equal(rested.hp,18);
  const longRest=await (await fetch(base+'/api/characters/'+autoHero.id+'/rest',{method:'POST',headers:noteHeaders,body:JSON.stringify({type:'long'})})).json();assert.equal(longRest.resources[0].used,0);assert.equal(longRest.hp,23);
  player.close();const reconnected=await open();sockets.push(reconnected);next=message(reconnected,m=>m.type==='CHARACTERS_UPDATE');reconnected.send(JSON.stringify({action:'player-auth',token:playerToken}));assert.equal((await next).characters[0].hp,23);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'characters.json'))).characters[0].hp,23);

  const linksPath='/api/locations/links?game='+packedCampaign.id;
  const farm='gw-farm-view', mine='gw-mine-view';
  assert.equal((await fetch(base+linksPath,{redirect:'manual'})).status,302);
  const linkBody={from:farm,to:mine,returnLink:true};
  const createLink=()=>fetch(base+linksPath,{method:'POST',headers:noteHeaders,body:JSON.stringify(linkBody)}).then(r=>r.json());
  assert.equal((await createLink()).links.length,2);
  assert.equal((await createLink()).links.length,2);
  assert.deepEqual((await (await fetch(base+'/api/locations/links',{headers:noteHeaders})).json()).links,[]);
  const routeMaster=await open(cookie,packedCampaign.id);sockets.push(routeMaster);
  function travel(socket,viewId) {
   const restored=message(socket,m=>m.type==='DM_STATE_RESTORE'&&m.sceneView?.mapKey===viewId);
   socket.send(JSON.stringify({action:'open-location',viewId}));
   return restored;
  }
  await travel(routeMaster,farm);
  const fog=[[true,false],[false,false]];
  for(const update of [
   {action:'update-fog',fogKey:farm,fogGrid:fog},
   {action:'update-tokens',mapKey:farm,tokens:[{id:'farm-hero',x:0.3,y:0.7}]},
   {action:'update-features',mapKey:farm,mapMeta:{cols:2,rows:2},features:[pendingTrap]},
   {action:'trigger-feature',mapKey:farm,featureId:pendingTrap.id},
   {action:'update-objects',objects:[{id:'farm-gate',row:0,col:0,interactive:true,clickAction:'rotate'}]},
   {action:'interact-object',objId:'farm-gate'},
  ]) routeMaster.send(JSON.stringify(update));
  assert.deepEqual((await travel(routeMaster,mine)).tokens,[]);

  const worldGame='?game='+campaign.id;
  const worldBase=base+'/api/worlds';
  const worldWrite=(endpoint,method,data)=>fetch(worldBase+endpoint+worldGame,{method,headers:noteHeaders,body:JSON.stringify(data)});
  assert.equal((await fetch(worldBase+worldGame,{redirect:'manual'})).status,302);
  const world=await (await worldWrite('','POST',{name:'Деревня у озера',sample:true})).json();
  const worldDir=path.join(dir,'campaigns',campaign.id,'worlds');
  const backup=path.join(worldDir,world.id+'.bak');
  fs.writeFileSync(backup,'backup contents');
  fs.mkdirSync(path.join(worldDir,'00000000-0000-0000-0000-000000000000.json'));
  const listing=await fetch(worldBase+worldGame,{headers:{Cookie:cookie}});
  assert.equal(listing.status,200);
  assert.deepEqual((await listing.json()).worlds,[{id:world.id,name:world.name}]);
  assert.equal(fs.readFileSync(backup,'utf8'),'backup contents');
  const positionBase=base+'/api/character-positions/';
  const ownPositionUrl=base+'/api/player-position'+worldGame;
  const positionUrl=id=>positionBase+encodeURIComponent(id)+worldGame;
  const setPosition=(id,position,headers=noteHeaders)=>fetch(positionUrl(id),{
    method:'PUT',headers,redirect:'manual',body:JSON.stringify(position),
  });
  const readPosition=(id,masterCookie)=>fetch(positionUrl(id),{headers:{Cookie:masterCookie}}).then(r=>r.json());
  const readOwnPosition=token=>fetch(ownPositionUrl,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  const firstPosition={worldId:world.id,sceneId:'overworld',floorId:'ground',x:-33,y:31};
  assert.deepEqual(await readPosition(otherChar.id,cookie),{position:null});
  assert.deepEqual(await readOwnPosition(otherToken.token),{position:null});
  assert.equal((await fetch(ownPositionUrl)).status,401);
  assert.equal((await fetch(ownPositionUrl,{headers:{Authorization:'Bearer '+playerToken}})).status,401);
  assert.equal((await fetch(positionUrl(otherChar.id),{redirect:'manual'})).status,302);
  assert.equal((await setPosition(otherChar.id,firstPosition,{'Content-Type':'application/json',Authorization:'Bearer '+otherToken.token})).status,302);
  assert.equal((await setPosition(otherChar.id,{...firstPosition,x:0.5})).status,400);
  assert.equal((await setPosition(otherChar.id,{...firstPosition,floorId:'upstairs'})).status,404);
  assert.equal((await setPosition(otherChar.id,{...firstPosition,sceneId:'unknown'})).status,404);
  assert.equal((await setPosition(ch.id,firstPosition)).status,404);
  assert.equal((await fetch(positionBase+encodeURIComponent(ch.id),{method:'PUT',headers:noteHeaders,body:JSON.stringify(firstPosition)})).status,404);
  const secondHero=await fetch(base+'/api/characters'+worldGame,{
    method:'POST',headers:noteHeaders,body:JSON.stringify({name:'Разведчик'}),
  }).then(r=>r.json());
  const secondWorld=await worldWrite('','POST',{name:'Северный мир'}).then(r=>r.json());
  const secondPosition={...firstPosition,worldId:secondWorld.id,x:32,y:-1};
  assert.equal((await setPosition(secondHero.id,secondPosition)).status,200);
  assert.equal((await setPosition(otherChar.id,{...firstPosition,x:10})).status,200);
  assert.equal((await setPosition(otherChar.id,firstPosition)).status,200);
  const firstSaved={position:{characterId:otherChar.id,...firstPosition,revision:2}};
  const secondSaved={position:{characterId:secondHero.id,...secondPosition,revision:1}};
  const legacyPositionsFile=path.join(worldDir,'..','character-positions.json');
  const legacyPositions=JSON.parse(fs.readFileSync(legacyPositionsFile,'utf8')).positions;
  fs.writeFileSync(legacyPositionsFile,JSON.stringify(legacyPositions));
  assert.deepEqual(await readOwnPosition(otherToken.token),firstSaved);
  assert.deepEqual(await readPosition(secondHero.id,cookie),secondSaved);
  assert.equal((await fetch(ownPositionUrl+'&characterId='+secondHero.id,{
    headers:{Authorization:'Bearer '+otherToken.token},
  }).then(r=>r.json())).position.characterId,otherChar.id);

  const movePosition=(body,token=otherToken.token)=>fetch(base+'/api/player-position/move'+worldGame,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),
  });
  assert.equal((await movePosition({direction:'east',revision:2},playerToken)).status,401);
  assert.equal((await movePosition({direction:'east',revision:2,characterId:secondHero.id})).status,400);
  assert.equal((await movePosition({direction:'diagonal',revision:2})).status,400);
  const secondInvitation=await fetch(base+'/api/player-access'+worldGame,{
    method:'POST',headers:noteHeaders,body:JSON.stringify({characterId:secondHero.id}),
  }).then(r=>r.json());
  const secondSocket=await open(undefined,campaign.id);sockets.push(secondSocket);
  next=message(secondSocket,m=>m.type==='CHARACTER_POSITION');
  secondSocket.send(JSON.stringify({action:'player-auth',token:secondInvitation.token}));
  assert.deepEqual((await next).position,secondSaved.position);
  const observedPositions=[];
  secondSocket.on('message',raw=>{
    const msg=JSON.parse(raw);
    if(msg.type==='CHARACTER_POSITION')observedPositions.push(msg.characterId);
  });
  next=message(otherReconnected,m=>m.type==='CHARACTER_POSITION');
  const step={direction:'east',revision:2};
  const [firstStep,retry]=await Promise.all([movePosition(step),movePosition(step)]);
  const results=[firstStep,retry];
  assert.deepEqual(results.map(response=>response.status).sort(),[200,409]);
  const afterStep={...firstSaved.position,x:-32,revision:3};
  assert.deepEqual((await next).position,afterStep);
  assert.deepEqual((await results.find(response=>response.status===409).json()).position,afterStep);
  next=message(secondSocket,m=>m.type==='CHARACTER_POSITION');
  assert.equal((await movePosition({direction:'north',revision:1},secondInvitation.token)).status,200);
  const secondMoved={...secondSaved.position,y:-2,revision:2};
  assert.deepEqual((await next).position,secondMoved);
  assert.deepEqual(observedPositions,[secondHero.id]);

  next=message(otherReconnected,m=>m.type==='MOVEMENT_LOCK'&&m.locked===true);
  other.send(JSON.stringify({action:'lock-player',name:otherChar.name}));
  await next;
  assert.equal((await movePosition({direction:'east',revision:3})).status,403);
  next=message(otherReconnected,m=>m.type==='CHARACTER_POSITION');
  const transferredPosition={...firstPosition,worldId:secondWorld.id,x:80,y:-60};
  assert.equal((await setPosition(otherChar.id,transferredPosition)).status,200);
  const transferred={position:{characterId:otherChar.id,...transferredPosition,revision:4}};
  assert.deepEqual((await next).position,transferred.position);
  next=message(otherReconnected,m=>m.type==='MOVEMENT_LOCK'&&m.locked===false);
  other.send(JSON.stringify({action:'unlock-player',name:otherChar.name}));
  await next;
  const staleMove=await movePosition({direction:'east',revision:3});
  assert.equal(staleMove.status,409);
  assert.deepEqual((await staleMove.json()).position,transferred.position);
  assert.deepEqual(await readOwnPosition(otherToken.token),transferred);
  assert.ok(tableMessages.every(msg=>msg.type!=='CHARACTER_POSITION'));


  const tiles=require('../remote/world-model');
  tiles.set(world.chunks,-70,-41,'path');
  world.chunks['7,7']={0:'dirt'};
  world.objects.push({id:'secret-door',kind:'door',x:0,y:0,turn:0,hidden:true},
    {id:'secret-marker',kind:'torch',x:14,y:12,turn:0,hidden:true},
    {id:'another-secret',kind:'torch',x:14,y:12,turn:1,hidden:true});
  for(let x=20;x<=30;x++) tiles.set(world.chunks,x,0,'path');
  tiles.set(world.chunks,20,-1,'grass');
  tiles.set(world.chunks,14,12,'grass');
  tiles.set(world.chunks,14,13,'grass');
  world.objects.push(
    {id:'party-wall',kind:'wall',x:22,y:0,turn:1},
    {id:'remembered-torch',kind:'torch',x:29,y:0,turn:0},
    {id:'private-party-torch',kind:'torch',x:21,y:0,turn:0,hidden:true},
  );
  const savedWorld=await (await worldWrite('/'+world.id,'PUT',world)).json();
  assert.equal(tiles.get(savedWorld.chunks,-70,-41),'path');
  assert.equal((await worldWrite('/'+world.id,'PUT',world)).status,409);
  next=message(table,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  assert.equal((await worldWrite('/'+world.id+'/publish','POST',{revision:savedWorld.revision,fog:true})).status,200);
  const publishedNotice=await next;
  const tableWorld=(keys='0,0')=>fetch(worldBase+'/table'+worldGame+'&chunks='+encodeURIComponent(keys)).then(r=>r.json());
  const tableStatus=(query=worldGame)=>fetch(worldBase+'/table/status'+query).then(r=>r.json());
  const freshTable=await tableWorld();
  assert.deepEqual(freshTable.version,publishedNotice.version);
  assert.deepEqual(await tableStatus(),{...publishedNotice,blackout:false});
  assert.equal((await tableStatus('?game='+packedCampaign.id)).id,null);
  assert.deepEqual(freshTable.chunks['0,0'],{});
  assert.deepEqual(freshTable.tokens,[]);
  assert.equal(freshTable.positions,undefined);
  assert.equal((await setPosition(otherChar.id,{...firstPosition,x:20,y:0})).status,200);
  assert.equal((await setPosition(secondHero.id,{...firstPosition,x:24,y:0})).status,200);
  assert.equal(tiles.get((await tableWorld()).chunks,20,0),undefined,'a transfer alone does not explore the map');

  next=message(table,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  const partyStep=await movePosition({direction:'east',revision:5});
  assert.equal(partyStep.status,200);
  const partyFirst=await partyStep.json();
  const stepNotice=await next;
  const firstExplored=await tableWorld();
  assert.deepEqual(firstExplored.version,stepNotice.version);
  assert.deepEqual(stepNotice.version,{...publishedNotice.version,exploration:publishedNotice.version.exploration+1});
  assert.deepEqual((await tableStatus()).version,stepNotice.version);
  assert.equal(tiles.get(firstExplored.chunks,20,0),'path');
  assert.equal(tiles.get(firstExplored.chunks,21,0),'path');
  assert.equal(tiles.get(firstExplored.chunks,22,0),'path','the wall cell itself is visible');
  assert.equal(tiles.get(firstExplored.visible,21,0),true);
  assert.equal(tiles.get(firstExplored.visible,23,0),undefined);
  assert.equal(tiles.get(firstExplored.chunks,23,0),undefined,'the wall blocks sight beyond it');
  assert.equal(tiles.get((await tableWorld('0,-1')).chunks,20,-1),'grass','sight crosses chunk boundaries');
  assert.ok(firstExplored.objects.every(prop=>prop.id!=='private-party-torch'));
  assert.equal((await movePosition({direction:'east',revision:6})).status,409);
  assert.deepEqual(await readOwnPosition(otherToken.token),partyFirst);
  const afterBlockedStep=await tableWorld();
  assert.deepEqual(afterBlockedStep.seen,firstExplored.seen,'a blocked step does not change exploration');
  assert.deepEqual(afterBlockedStep.version,firstExplored.version);

  next=message(table,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  const secondPartyStep=await movePosition({direction:'east',revision:3},secondInvitation.token);
  assert.equal(secondPartyStep.status,200);
  const partySecond=await secondPartyStep.json();
  await next;
  const partyMap=await tableWorld();
  for(const x of [20,21,23,24,25,29]) assert.equal(tiles.get(partyMap.chunks,x,0),'path');
  assert.equal(tiles.get(partyMap.chunks,30,0),undefined,'cells outside both heroes’ sight stay hidden');
  assert.deepEqual(partyMap.tokens,[]);
  for(const x of [21,25,29]) assert.equal(tiles.get(partyMap.visible,x,0),true,'current sight combines both heroes');
  assert.deepEqual(partyMap.objects.find(prop=>prop.id==='remembered-torch'),{id:'remembered-torch',kind:'torch',x:29,y:0,turn:0});

  const sceneResponse=await worldWrite('','POST',{name:'Нижняя пещера',parentWorldId:world.id});
  assert.equal(sceneResponse.status,201);
  const cave=await sceneResponse.json();
  tiles.set(cave.chunks,4,4,'caveFloor');
  tiles.set(cave.chunks,4,5,'water');
  tiles.set(cave.chunks,5,4,'water');
  tiles.set(cave.chunks,7,4,'caveFloor');
  cave.objects.push({id:'cave-bridge',kind:'bridge',x:6,y:4,turn:0},
    {id:'cave-door',kind:'door',x:6,y:4,turn:0});
  const caveSaved=await worldWrite('/'+cave.id,'PUT',cave).then(r=>r.json());
  assert.equal(caveSaved.parentWorldId,world.id);
  const sceneList=await fetch(worldBase+worldGame,{headers:{Cookie:cookie}}).then(r=>r.json());
  assert.equal(sceneList.worlds.find(item=>item.id===cave.id).parentWorldId,world.id);
  assert.equal((await worldWrite('','POST',{name:'Недопустимая сцена',parentWorldId:cave.id})).status,404);
  const linkEndpoint='/'+world.id+'/transitions';
  const worldLinkBody={x:21,y:0,toMapId:cave.id,toX:4,toY:4};
  assert.equal((await fetch(worldBase+linkEndpoint+worldGame,{redirect:'manual'})).status,302);
  assert.equal((await worldWrite(linkEndpoint,'POST',{...worldLinkBody,toMapId:secondWorld.id})).status,400);
  assert.equal((await worldWrite(linkEndpoint,'POST',{...worldLinkBody,toY:5})).status,409);
  const createdLink=await worldWrite(linkEndpoint,'POST',worldLinkBody);
  assert.equal(createdLink.status,201);
  const {link}=await createdLink.json();
  const temporaryLink=await worldWrite(linkEndpoint,'POST',{...worldLinkBody,x:20}).then(r=>r.json());
  const deletedLink=await worldWrite(linkEndpoint+'/'+encodeURIComponent(temporaryLink.link.id),'DELETE');
  assert.equal(deletedLink.status,200);
  assert.deepEqual((await deletedLink.json()).links,[link]);
  assert.deepEqual(link.to,{worldId:world.id,sceneId:cave.id,floorId:'ground',x:4,y:4});
  assert.equal((await movePosition({direction:'enter',revision:4},secondInvitation.token)).status,409);
  assert.deepEqual(await readOwnPosition(secondInvitation.token),partySecond);
  const entered=await movePosition({direction:'enter',revision:6});
  assert.equal(entered.status,200);
  assert.deepEqual((await entered.json()).position,{characterId:otherChar.id,...link.to,revision:7});
  assert.equal((await movePosition({direction:'enter',revision:6})).status,409);
  assert.equal((await movePosition({direction:'south',revision:7})).status,409);
  const bridgeStep=await movePosition({direction:'east',revision:7});
  assert.equal(bridgeStep.status,200);
  const afterBridge=await bridgeStep.json();
  assert.deepEqual(afterBridge.position,{characterId:otherChar.id,...link.to,x:5,revision:8});
  assert.equal(tiles.get((await tableWorld()).chunks,4,4),undefined,'the cave is a separate exploration scope');
  assert.equal((await worldWrite('/'+cave.id+'/publish','POST',{revision:caveSaved.revision,fog:true})).status,200);
  const caveTable=await tableWorld();
  assert.equal(caveTable.id,cave.id);
  assert.equal(tiles.get(caveTable.chunks,4,4),'caveFloor');
  assert.equal(tiles.get(caveTable.chunks,5,4),'water');
  assert.equal(tiles.get(caveTable.chunks,4,5),'water','a visible cell need not be passable');
  assert.equal(tiles.get(caveTable.chunks,7,4),undefined,'the closed door blocks sight');
  assert.equal((await movePosition({direction:'east',revision:8})).status,409);
  const floorResponse=await worldWrite('','POST',{name:'Подвал',sceneMapId:cave.id,elevation:-1});
  assert.equal(floorResponse.status,201);
  const lowerFloor=await floorResponse.json();
  assert.equal(lowerFloor.parentSceneId,cave.id);
  assert.equal(lowerFloor.parentWorldId,world.id);
  assert.equal((await worldWrite('','POST',{name:'Дубликат',sceneMapId:cave.id,elevation:-1})).status,409);
  assert.equal((await worldWrite('','POST',{name:'Нулевой этаж',sceneMapId:cave.id,elevation:0})).status,400);
  tiles.set(lowerFloor.chunks,7,4,'stone');
  const floorSaved=await worldWrite('/'+lowerFloor.id,'PUT',lowerFloor).then(r=>r.json());
  const lowerPosition={...link.to,floorId:lowerFloor.id,x:5};
  assert.equal((await setPosition(secondHero.id,lowerPosition)).status,200);
  assert.equal((await setPosition(secondHero.id,{...lowerPosition,sceneId:'overworld'})).status,404);
  const changeDoor=(open,id=cave.id)=>worldWrite('/live/doors/cave-door','PUT',{id,open});
  const guestDoor=await fetch(worldBase+'/live/doors/cave-door'+worldGame,{
    method:'PUT',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cave.id,open:true}),
  });
  assert.equal(guestDoor.status,302);
  assert.equal((await changeDoor(true,world.id)).status,409);
  next=message(table,m=>m.type==='WORLD_UPDATE'&&m.id===cave.id);
  assert.deepEqual(await (await changeDoor(true)).json(),{open:true});
  const openedNotice=await next;
  const openedCave=await tableWorld();
  assert.deepEqual(openedCave.version,openedNotice.version);
  assert.deepEqual(openedCave.version,{...caveTable.version,exploration:caveTable.version.exploration+1});
  assert.equal((await changeDoor(true)).status,200);
  assert.deepEqual((await tableStatus()).version,openedCave.version);
  assert.equal(tiles.get(openedCave.chunks,7,4),'caveFloor','stationary hero sees past the opened door');
  assert.equal(openedCave.objects.find(prop=>prop.id==='cave-door').open,true);
  assert.equal(tiles.get(openedCave.visible,7,4),true);
  assert.equal((await changeDoor(false)).status,200);
  const rememberedCave=await tableWorld();
  assert.equal(tiles.get(rememberedCave.chunks,7,4),'caveFloor');
  assert.equal(tiles.get(rememberedCave.visible,7,4),undefined,'closing the door moves the cell beyond it out of live sight');
  assert.equal((await changeDoor(true)).status,200);
  assert.deepEqual(await readOwnPosition(otherToken.token),afterBridge);
  const doorStep=await movePosition({direction:'east',revision:8});
  assert.equal(doorStep.status,200);
  const afterDoor=await doorStep.json();
  assert.equal(afterDoor.position.x,6);
  assert.equal((await changeDoor(false)).status,200);
  const closedCave=await tableWorld();
  assert.equal(tiles.get(closedCave.chunks,7,4),'caveFloor','closing a door preserves remembered terrain');
  assert.equal(closedCave.objects.find(prop=>prop.id==='cave-door').open,undefined);
  assert.equal((await changeDoor(true)).status,200);

  assert.equal((await worldWrite('/'+lowerFloor.id+'/publish','POST',{revision:floorSaved.revision,fog:true})).status,200);
  const unexploredFloor=await tableWorld();
  assert.equal(tiles.get(unexploredFloor.chunks,7,4),undefined,'opening a door does not explore another floor');
  const floorStep=await movePosition({direction:'north',revision:5},secondInvitation.token);
  assert.equal(floorStep.status,200);
  assert.equal(tiles.get((await tableWorld()).chunks,7,4),'stone');
  const stairs=await worldWrite('/'+lowerFloor.id+'/transitions','POST',{x:5,y:3,toMapId:cave.id,toX:7,toY:4});
  assert.equal(stairs.status,201);
  const stairsStep=await movePosition({direction:'enter',revision:6},secondInvitation.token);
  assert.equal(stairsStep.status,200);
  const afterStairs=await stairsStep.json();
  assert.deepEqual(afterStairs.position,{characterId:secondHero.id,...link.to,x:7,revision:7});
  assert.equal((await worldWrite('/'+world.id+'/publish','POST',{revision:savedWorld.revision,fog:true})).status,200);
  const departedWorld=await tableWorld();
  assert.equal(tiles.get(departedWorld.chunks,21,0),'path');
  assert.deepEqual(departedWorld.visible,{},'heroes on other maps leave only the party’s memory');
  assert.ok(departedWorld.version.generation > openedCave.version.generation);
  assert.equal(departedWorld.version.publication,publishedNotice.version.publication+1);


  const movement={id:world.id,action:'token',characterId:otherChar.id,x:0,y:0};
  assert.equal((await worldWrite('/live/change','POST',movement)).status,200);
  const firstView=await tableWorld();
  assert.equal(tiles.get(firstView.chunks,0,0),'path');
  assert.ok(firstView.objects.every(prop=>prop.id!=='secret-door' && prop.id!=='secret-marker'));
  assert.equal(tiles.get(firstView.seen,14,12),undefined);
  const revealSecret=(objectId,body,headers=noteHeaders,query=worldGame)=>fetch(
    worldBase+'/live/secrets/'+encodeURIComponent(objectId)+query,{
      method:'PUT',headers,redirect:'manual',body:JSON.stringify(body),
    });
  const secretBody={id:world.id,revision:savedWorld.revision};
  const masterLive=(revision,headers=noteHeaders)=>fetch(
    worldBase+'/live'+worldGame+'&version='+encodeURIComponent(world.id+':'+revision),{headers,redirect:'manual'},
  );
  const guestSecretHeaders={'Content-Type':'application/json'};
  const playerSecretHeaders={...guestSecretHeaders,Authorization:'Bearer '+otherToken.token};
  assert.equal((await masterLive(savedWorld.revision,playerSecretHeaders)).status,302);
  assert.equal((await revealSecret('secret-marker',secretBody,guestSecretHeaders)).status,302);
  assert.equal((await revealSecret('secret-marker',secretBody,playerSecretHeaders)).status,302);
  assert.equal((await revealSecret('secret-marker',secretBody,noteHeaders,worldGame+'&view=table')).status,302);
  assert.equal((await revealSecret('secret-marker',secretBody,noteHeaders,'?game='+packedCampaign.id)).status,409);
  assert.equal((await revealSecret('secret-marker',{...secretBody,revision:savedWorld.revision+1})).status,409);
  assert.equal((await revealSecret('secret-marker',{...secretBody,characterId:secondHero.id})).status,400);
  assert.equal((await revealSecret('remembered-torch',secretBody)).status,404);
  assert.equal((await tableWorld()).objects.some(prop=>prop.id==='secret-marker'),false);
  assert.deepEqual((await (await masterLive(savedWorld.revision)).json()).revealedSecrets,[]);

  const secretScreen=await open(undefined,campaign.id,'table');sockets.push(secretScreen);
  next=message(secretScreen,msg=>msg.type==='WORLD_UPDATE'&&msg.id===world.id&&
    msg.version.exploration===firstView.version.exploration+1);
  const phoneUpdate=message(secondSocket,msg=>msg.type==='WORLD_UPDATE'&&msg.id===world.id);
  assert.deepEqual(await (await revealSecret('secret-marker',secretBody)).json(),{revealed:true});
  for(const event of await Promise.all([next,phoneUpdate])) {
    assert.doesNotMatch(JSON.stringify(event),/secret-marker|revealedSecrets/);
    assert.deepEqual(event.version,{...firstView.version,exploration:firstView.version.exploration+1});
  }
  assert.deepEqual(await readOwnPosition(secondInvitation.token),afterStairs);
  assert.deepEqual(await (await revealSecret('secret-marker',secretBody)).json(),{revealed:true},'repeated reveal is idempotent');
  const firstSecretView=await tableWorld();
  assert.deepEqual(firstSecretView.version,{...firstView.version,exploration:firstView.version.exploration+1});
  assert.deepEqual((await tableStatus()).version,firstSecretView.version);
  const firstMarker={id:'secret-marker',kind:'torch',x:14,y:12,turn:0};
  assert.deepEqual(firstSecretView.objects.find(prop=>prop.id==='secret-marker'),firstMarker);
  assert.equal(tiles.get(firstSecretView.chunks,14,12),'grass','the reveal opens exactly its own cell');
  assert.equal(tiles.get(firstSecretView.seen,14,13),undefined);
  assert.equal(firstSecretView.objects.some(prop=>prop.id==='secret-door' || prop.id==='another-secret'),false);
  assert.equal((await tableWorld('0,-1')).objects.some(prop=>prop.id==='secret-marker'),false);
  assert.deepEqual((await (await masterLive(savedWorld.revision)).json()).revealedSecrets,['secret-marker']);
  assert.equal((await (await fetch(worldBase+'/'+world.id+worldGame,{headers:noteHeaders})).json())
    .objects.find(prop=>prop.id==='secret-marker').hidden,true,'the draft remains secret');
  const chunkEndpoint='/'+world.id+'/chunks';
  const chunkUrl=worldBase+chunkEndpoint+worldGame+'&chunks=0%2C0';
  assert.equal((await fetch(chunkUrl,{redirect:'manual'})).status,302);
  const [otherChunk]=tiles.address(-70,-41);
  const manifest=JSON.parse(fs.readFileSync(path.join(worldDir,world.id+'-chunks.json')));
  const unrelatedFile=path.join(worldDir,world.id+'-chunks',manifest.index[otherChunk].hash+'.json');
  const editedTerrain={'0,0':{...savedWorld.chunks['0,0'],0:'water'},'7,7':null};
  tiles.set(editedTerrain,29,0,'dirt');
  tiles.set(editedTerrain,28,0,null);
  tiles.set(editedTerrain,28,1,'grass');
  const chunkPatch={revision:savedWorld.revision,chunks:editedTerrain};
  fs.renameSync(unrelatedFile,unrelatedFile+'.held');
  try {
   const partial=await fetch(chunkUrl,{headers:{Cookie:cookie}});
   assert.equal(partial.status,200);
   assert.deepEqual(await partial.json(),{id:world.id,revision:savedWorld.revision,chunks:{'0,0':savedWorld.chunks['0,0']}});
   const changed=await worldWrite(chunkEndpoint,'PATCH',chunkPatch);
   assert.equal(changed.status,200);
   assert.deepEqual(await changed.json(),{revision:savedWorld.revision+1});
   assert.equal(tiles.get((await tableWorld()).chunks,0,0),'path');
  } finally {
   fs.renameSync(unrelatedFile+'.held',unrelatedFile);
  }
  assert.equal((await worldWrite(chunkEndpoint,'PATCH',chunkPatch)).status,409);
  const updatedDraft=await fetch(worldBase+'/'+world.id+worldGame,{headers:{Cookie:cookie}}).then(r=>r.json());
  assert.equal(tiles.get(updatedDraft.chunks,-70,-41),'path');
  assert.equal(tiles.get(updatedDraft.chunks,0,0),'water');
  assert.equal(updatedDraft.chunks['7,7'],undefined);
  assert.deepEqual(updatedDraft.objects,savedWorld.objects);
  Object.assign(updatedDraft.objects.find(prop=>prop.id==='remembered-torch'),{x:28,turn:1});
  Object.assign(updatedDraft.objects.find(prop=>prop.id==='secret-marker'),{x:29,y:0});
  const editedWorld=await worldWrite('/'+world.id,'PUT',updatedDraft).then(r=>r.json());
  assert.equal(editedWorld.revision,savedWorld.revision+2);
  const legacyId='10000000-0000-0000-0000-000000000000';
  const legacy={id:legacyId,name:'Legacy',revision:0,chunks:{'0,0':{0:'path'}},objects:[]};
  const legacyFile=path.join(worldDir,legacyId+'.json');
  fs.writeFileSync(legacyFile,JSON.stringify(legacy));
  const legacyChunks=await fetch(worldBase+'/'+legacyId+'/chunks'+worldGame+'&chunks=0%2C0',{headers:{Cookie:cookie}});
  assert.deepEqual((await legacyChunks.json()).chunks,legacy.chunks);
  assert.equal((await worldWrite('/'+legacyId+'/chunks','PATCH',{revision:0,chunks:{'0,0':null}})).status,409);
  assert.equal((await worldWrite('/'+legacyId,'PUT',legacy)).status,200);
  assert.equal(JSON.parse(fs.readFileSync(legacyFile)).revision,1);
  assert.equal(tiles.get((await tableWorld()).chunks,0,0),'path');
  assert.equal((await worldWrite('/live/change','POST',{...movement,x:9})).status,200);
  const savedWorldStatus=await tableStatus();
  assert.ok(savedWorldStatus.version.publication > firstSecretView.version.publication);
  for(const socket of sockets) socket.terminate();
  await stop();
  // Simulate a cell discovered before snapshots existed. Its old published terrain must survive republish.
  const positionsFile=path.join(worldDir,'..','character-positions.json');
  const legacyExploration=JSON.parse(fs.readFileSync(positionsFile));
  delete legacyExploration.memory[JSON.stringify([world.id,'overworld','ground'])].chunks['0,0'][0];
  fs.writeFileSync(positionsFile,JSON.stringify(legacyExploration));
  execFileSync(process.execPath,[path.join(root,'import-world.js'),path.dirname(worldDir),legacyId]);
  child=launch();
  await waitForServer();
  const newLogin=await fetch(base+'/dm-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=test-only',redirect:'manual'});
  const newCookie=newLogin.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await readOwnPosition(otherToken.token),afterDoor);
  assert.deepEqual(await readPosition(secondHero.id,newCookie),afterStairs);
  const restoredLinks=await fetch(worldBase+linkEndpoint+worldGame,{headers:{Cookie:newCookie}}).then(r=>r.json());
  assert.deepEqual(restoredLinks.links,[link]);
  const positionAfterRestart=await open(undefined,campaign.id);sockets.push(positionAfterRestart);
  next=message(positionAfterRestart,m=>m.type==='CHARACTER_POSITION');
  positionAfterRestart.send(JSON.stringify({action:'player-auth',token:otherToken.token}));
  assert.deepEqual((await next).position,afterDoor.position);
  const resumed=await open(newCookie,packedCampaign.id);sockets.push(resumed);
  const display=await open(undefined,packedCampaign.id,'table');sockets.push(display);
  next=message(display,m=>m.type==='SHOW_SCENE_VIEW');
  display.send(JSON.stringify({action:'request-sync'}));
  const restoredView=await next;
  assert.equal(restoredView.mapKey,mine);
  assert.equal((await fetch(publicAsset(restoredView.image,'?game='+packedCampaign.id))).status,200);
  const returned=await travel(resumed,farm);
  assert.equal((await fetch(publicAsset(restoredView.image,'?game='+packedCampaign.id))).status,404);
  assert.equal((await fetch(publicAsset(farmAsset,'?game='+packedCampaign.id))).status,200);
  assert.deepEqual(returned.fogStates[farm],fog);
  assert.equal(returned.tokens[0].id,'farm-hero');
  assert.equal(returned.featureStates[pendingTrap.id],'triggered');
  assert.equal(returned.objectStates['farm-gate'].currentRotation,90);
  assert.equal((await (await fetch(base+linksPath,{headers:{Cookie:newCookie}})).json()).links.length,2);
  const importedChunks=await fetch(worldBase+'/'+legacyId+'/chunks'+worldGame+'&chunks=0%2C0',{headers:{Cookie:newCookie}});
  assert.equal(importedChunks.status,200);
  assert.deepEqual((await importedChunks.json()).chunks,legacy.chunks);
  const resumedWorld=await tableWorld();
  assert.deepEqual(await tableStatus(),savedWorldStatus,'the projection version persists across server restart');
  assert.deepEqual(resumedWorld.version,savedWorldStatus.version);
  const resumedScreen=await open(undefined,campaign.id,'table');sockets.push(resumedScreen);
  next=message(resumedScreen,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  resumedScreen.send(JSON.stringify({action:'request-sync'}));
  assert.deepEqual((await next).version,resumedWorld.version);
  for(const x of [20,21,22,23,24,25,29]) assert.equal(tiles.get(resumedWorld.chunks,x,0),'path');
  assert.equal(tiles.get(resumedWorld.chunks,30,0),undefined);
  assert.equal(tiles.get((await tableWorld('0,-1')).chunks,20,-1),'grass');
  assert.equal(resumedWorld.tokens[0].x,9);
  assert.deepEqual(resumedWorld.objects.find(prop=>prop.id==='secret-marker'),firstMarker,'the explicit reveal survives restart');
  assert.equal(tiles.get(resumedWorld.chunks,0,0),'path');
  assert.equal(tiles.get(resumedWorld.chunks,9,0),'path');
  const resumedWorldWrite=(endpoint,body)=>fetch(worldBase+endpoint+worldGame,{
    method:'POST',headers:{Cookie:newCookie,'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  assert.equal(await fetch(worldBase+'/table').then(r=>r.json()),null);
  assert.deepEqual(await (await resumedWorldWrite('/live/hide',{})).json(),{hidden:true});
  assert.equal(await tableWorld(),null);
  const hiddenStatus=await tableStatus();
  assert.equal(hiddenStatus.id,null);
  assert.deepEqual(hiddenStatus.version,{generation:resumedWorld.version.generation+1,publication:0,exploration:0});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(worldDir,'..','active-world.json'))),
    {id:null,generation:hiddenStatus.version.generation});
  assert.deepEqual(await (await resumedWorldWrite('/live/hide',{})).json(),{hidden:false});
  assert.deepEqual(await tableStatus(),hiddenStatus);
  const republish=await resumedWorldWrite('/'+world.id+'/publish',{revision:editedWorld.revision,fog:true});
  assert.equal(republish.status,200);
  const republished=await tableWorld();
  assert.equal(republished.version.generation,hiddenStatus.version.generation+1);
  assert.deepEqual(republished.tokens,resumedWorld.tokens);
  assert.deepEqual(republished.seen,resumedWorld.seen);
  assert.deepEqual(republished.objects.find(prop=>prop.id==='secret-marker'),firstMarker);
  const resumedHeaders={...noteHeaders,Cookie:newCookie};
  assert.deepEqual((await (await masterLive(editedWorld.revision,resumedHeaders)).json()).revealedSecrets,[]);
  assert.equal((await revealSecret('secret-marker',secretBody,resumedHeaders)).status,409,'an old publication cannot authorize a moved secret');
  assert.equal(tiles.get(republished.chunks,0,0),'path','legacy discovery keeps the outgoing published tile');
  assert.equal(tiles.get(republished.chunks,29,0),'path','terrain outside live sight stays as remembered');
  assert.equal(tiles.get(republished.chunks,28,0),'path','removing unseen terrain stays private');
  assert.equal(tiles.get(republished.seen,28,1),true);
  assert.equal(tiles.get(republished.chunks,28,1),undefined,'an observed empty tile stays empty in memory');
  assert.deepEqual(republished.objects.find(prop=>prop.id==='remembered-torch'),{id:'remembered-torch',kind:'torch',x:29,y:0,turn:0});
  const restorePublished=(id,revision)=>fetch(worldBase+'/'+id+'/publish'+worldGame,{
    method:'POST',headers:{Cookie:newCookie,'Content-Type':'application/json'},body:JSON.stringify({revision,fog:true}),
  });
  assert.equal((await restorePublished(cave.id,caveSaved.revision)).status,200);
  assert.equal((await tableWorld()).objects.find(prop=>prop.id==='cave-door').open,true);
  assert.equal((await restorePublished(lowerFloor.id,floorSaved.revision)).status,200);
  assert.equal(tiles.get((await tableWorld()).chunks,7,4),'stone');
  assert.equal((await restorePublished(world.id,editedWorld.revision)).status,200);
  assert.equal((await resumedWorldWrite('/live/change',{id:world.id,action:'reveal',x:0,y:0})).status,200);
  const revealedAgain=await tableWorld();
  assert.equal(tiles.get(revealedAgain.chunks,0,0),'water','an explicit reveal refreshes map memory');
  assert.equal(tiles.get(revealedAgain.visible,0,0),undefined);

  const returnToWorld=(x,y)=>fetch(base+'/api/character-positions/'+secondHero.id+worldGame,{
    method:'PUT',headers:{Cookie:newCookie,'Content-Type':'application/json'},body:JSON.stringify({...firstPosition,x,y}),
  });
  assert.equal((await returnToWorld(25,0)).status,200);
  assert.equal((await movePosition({direction:'east',revision:8},secondInvitation.token)).status,200);
  const revisited=await tableWorld();
  assert.equal(tiles.get(revisited.visible,29,0),true);
  assert.equal(tiles.get(revisited.chunks,29,0),'dirt');
  assert.equal(tiles.get(revisited.chunks,28,0),undefined);
  assert.equal(tiles.get(revisited.chunks,28,1),'grass');
  assert.deepEqual(revisited.objects.filter(prop=>prop.id==='remembered-torch'),[{id:'remembered-torch',kind:'torch',x:28,y:0,turn:1}]);
  assert.ok(revisited.objects.every(prop=>prop.id!=='private-party-torch' && prop.id!=='secret-door'));
  assert.deepEqual(revisited.objects.filter(prop=>prop.id==='secret-marker'),[firstMarker],
    'seeing the new cell does not disclose the moved secret');
  const movedSecretBody={id:world.id,revision:editedWorld.revision};
  assert.equal((await revealSecret('secret-marker',movedSecretBody,resumedHeaders)).status,200);
  assert.deepEqual((await tableWorld()).objects.filter(prop=>prop.id==='secret-marker'),[{...firstMarker,x:29,y:0}]);

  const revisitedScreen=await open(undefined,campaign.id,'table');sockets.push(revisitedScreen);
  next=message(revisitedScreen,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  assert.equal((await returnToWorld(80,80)).status,200);
  await next;
  const leftAgain=await tableWorld();
  assert.deepEqual(leftAgain.visible,{});
  assert.equal(tiles.get(leftAgain.chunks,29,0),'dirt','the latest observation remains when heroes leave');

  assert.equal((await returnToWorld(25,0)).status,200);
  assert.equal((await movePosition({direction:'east',revision:11},secondInvitation.token)).status,200);
  tiles.set(editedWorld.chunks,29,0,'stone');
  const liveEdit=await fetch(worldBase+'/'+world.id+worldGame,{
    method:'PUT',headers:{Cookie:newCookie,'Content-Type':'application/json'},body:JSON.stringify(editedWorld),
  });
  assert.equal(liveEdit.status,200);
  assert.equal((await restorePublished(world.id,(await liveEdit.json()).revision)).status,200);
  assert.equal(tiles.get((await tableWorld()).chunks,29,0),'stone','a published edit in current sight is visible at once');
  next=message(revisitedScreen,m=>m.type==='WORLD_UPDATE'&&m.id===world.id);
  assert.equal((await fetch(base+'/api/characters/'+secondHero.id+worldGame,{
    method:'DELETE',headers:{Cookie:newCookie},
  })).status,200);
  await next;
  const afterRemoval=await tableWorld();
  assert.deepEqual(afterRemoval.visible,{});
  assert.equal(tiles.get(afterRemoval.chunks,29,0),'stone','removing a hero ends sight and preserves their last observation');

  const otherMapSecret=await fetch(worldBase+'/'+secondWorld.id+worldGame,{
    method:'PUT',headers:resumedHeaders,body:JSON.stringify({...secondWorld,objects:[{...firstMarker,x:29,y:0,hidden:true}]}),
  }).then(r=>r.json());
  assert.equal((await resumedWorldWrite('/'+secondWorld.id+'/publish',{revision:otherMapSecret.revision,fog:false})).status,200);
  const withoutFog=await tableWorld();
  assert.equal(withoutFog.fog,false);
  assert.equal(withoutFog.objects.some(prop=>prop.id==='secret-marker'),false,
    'a grant on another map cannot reveal a secret with the same ID and appearance, even without fog');
  assert.equal((await revealSecret('secret-marker',{id:secondWorld.id,revision:otherMapSecret.revision},resumedHeaders)).status,200);
  const clearMap=await tableWorld();
  assert.deepEqual(clearMap.objects.find(prop=>prop.id==='secret-marker'),{...firstMarker,x:29,y:0});
  assert.deepEqual(clearMap.version,{...withoutFog.version,exploration:withoutFog.version.exploration+1});
  const placedInClearMap=await (await setPosition(otherChar.id,secondPosition,resumedHeaders)).json();
  assert.equal((await movePosition({direction:'east',revision:placedInClearMap.position.revision})).status,200);
  assert.deepEqual((await tableStatus()).version,clearMap.version,'private steps do not change the public version without fog');

  const blackout=()=>fetch(base+'/api/blackout'+worldGame,{method:'POST',headers:resumedHeaders});
  assert.equal((await blackout()).status,200);
  assert.equal((await tableStatus()).blackout,true);
  assert.equal((await blackout()).status,200);
  assert.equal((await tableStatus()).blackout,false);

 }finally{ollama.close();for(const ws of sockets)ws.terminate();await stop();for(const file of catalogImages)fs.rmSync(file,{force:true});fs.rmSync(dir,{recursive:true,force:true});}
});

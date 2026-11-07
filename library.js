'use strict';
module.exports=(app,{express,crypto,gameFile,requireDm,hasWindenPack})=>{
 const read=()=>{const fs=require('fs'),file=gameFile('library.json');const data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{entries:[]};if(hasWindenPack()&&!data.goblinWarsImported){const seed=require('./resources/goblin-wars/bestiary.json');const ids=new Set(data.entries.map(e=>e.id));data.entries.push(...seed.entries.filter(e=>!ids.has(e.id)));data.goblinWarsImported=true;save(data);}return data;};
 const save=data=>{const fs=require('fs'),file=gameFile('library.json');fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
 const route=fn=>(req,res)=>{res.setHeader('Cache-Control','no-store');try{fn(req,res);}catch(e){res.status(500).json({error:'Не удалось сохранить библиотеку'});}};
 function validate(body){return body&&['creature','npc','item','trap','scenery'].includes(body.kind)&&typeof body.name==='string'&&body.name.trim()&&body.name.length<=120&&['description','actions','abilities','properties','notes'].every(k=>body[k]===undefined||(typeof body[k]==='string'&&body[k].length<=20000))&&['hp','ac','speed','quantity'].every(k=>body[k]===undefined||(Number.isFinite(body[k])&&body[k]>=0&&body[k]<=100000));}
 const fields=body=>Object.fromEntries(['kind','name','description','actions','abilities','properties','notes','hp','ac','speed','quantity','rarity','archived','source','sourcePage','sourceText'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
 function add(body) {
  const data = read();
  const entry = { ...fields(body), id: crypto.randomUUID(), revision: 0 };
  data.entries.push(entry);
  save(data);
  return entry;
 }
 app.get('/api/library',requireDm,route((req,res)=>res.json(read())));
 app.post('/api/library',requireDm,express.json({limit:'256kb'}),route((req,res)=>{if(!validate(req.body))return res.status(400).json({error:'Проверьте название и поля карточки'});res.status(201).json(add(req.body));}));
 app.put('/api/library/:id',requireDm,express.json({limit:'256kb'}),route((req,res)=>{if(!validate(req.body))return res.status(400).json({error:'Проверьте поля карточки'});const data=read(),entry=data.entries.find(x=>x.id===req.params.id);if(!entry)return res.status(404).json({error:'Карточка не найдена'});if(req.body.revision!==entry.revision)return res.status(409).json({error:'Карточка изменена в другом окне. Обновите библиотеку.'});Object.assign(entry,fields(req.body),{revision:entry.revision+1});save(data);res.json(entry);}));
 return { read, add };
};

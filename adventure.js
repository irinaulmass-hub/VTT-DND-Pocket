'use strict';
module.exports=(app,{express,fs,path,gameFile,requireDm,hasWindenPack})=>{
 const folder=path.join(__dirname,'resources','goblin-wars'),source=JSON.parse(fs.readFileSync(path.join(folder,'pages.json'),'utf8'));
 for(const name of ['winden-farm.png','winden-mine.png']){const target=path.join(__dirname,'public','assets','maps',name);fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.copyFileSync(path.join(folder,'maps',name),target);}
 const chapters=[['intro','Подготовка и правила кампании',2,4],['road','Дорога к Виндену',5,7],['winden','Винден и праздник',7,9],['festival','Состязания на площади',10,13],['attack','Гоблинское нападение',14,15],['quest','Утро после налёта и задание',16,16],['farm','Преследование и ферма Тэда',16,18],['approach','Гоблинские налётчики и логово',18,19],['mine','Развилка и ловушки шахты',20,20],['boss','Мимик и Харамах',21,22],['ettin','Визит Грум-Грума',22,23],['return','Обратный путь и пустая ферма',23,24],['home','Возвращение в Винден',25,25],['bestiary','Существа и противники',26,29],['npc','Персонажи мастера',30,35],['maps','Схемы фермы и шахты',36,36]].map(([id,title,from,to])=>({id,title,from,to}));
 const state=()=>{const file=gameFile('adventure.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{revision:0,current:'intro',done:[],notes:{}};};
 const hasAdventure = () => hasWindenPack() || fs.existsSync(gameFile('adventure.json'));
 app.get('/api/adventure',requireDm,(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!hasAdventure()) return res.json({title:null,pages:[],chapters:[],state:null});
  res.json({...source,chapters,state:state()});
 });
 app.get('/api/adventure/source.pdf',requireDm,(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!hasAdventure()) return res.status(404).json({error:'У кампании нет этого материала'});
  res.sendFile(path.join(folder,'prologue.pdf'));
 });
 app.put('/api/adventure/state',requireDm,express.json({limit:'256kb'}),(req,res)=>{
  if(!hasAdventure()) return res.status(404).json({error:'У кампании пока нет приключения'});
  const body=req.body||{},saved=state();if(body.revision!==saved.revision)return res.status(409).json({error:'Записи изменены в другом окне. Обновите приключение.'});
  if(!chapters.some(c=>c.id===body.current)||!Array.isArray(body.done)||body.done.some(id=>!chapters.some(c=>c.id===id))||!body.notes||typeof body.notes!=='object'||Array.isArray(body.notes)||Object.values(body.notes).some(text=>typeof text!=='string'||text.length>30000))return res.status(400).json({error:'Проверьте записи приключения'});
  const updated={revision:saved.revision+1,current:body.current,done:[...new Set(body.done)],notes:body.notes},file=gameFile('adventure.json');fs.writeFileSync(file+'.tmp',JSON.stringify(updated,null,2));fs.renameSync(file+'.tmp',file);res.json(updated);
 });
};

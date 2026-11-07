'use strict';
module.exports=(app,{express,loadCharacters,saveCharacters,requireDm,broadcast})=>{
 app.post('/api/characters/:id/rest',requireDm,express.json({limit:'8kb'}),(req,res)=>{
  const data=loadCharacters(),ch=data.characters.find(c=>c.id===req.params.id);if(!ch)return res.status(404).json({error:'Герой не найден'});const type=req.body?.type;if(!['short','long'].includes(type))return res.status(400).json({error:'Выберите короткий или длинный отдых'});
  const one=new Set(['rage','second-wind','channel','wild-shape']),full=new Set(['action-surge','focus']);const known=new Set(['rage','second-wind','channel','wild-shape','action-surge','focus','inspiration','lay-on-hands','free-smite','favored-enemy','innate','sorcery','arcane-recovery']);
  ch.resources=(ch.resources||[]).map(r=>({...r,used:type==='long'&&known.has(r.id)?0:type==='short'&&one.has(r.id)?Math.max(0,(r.used||0)-1):type==='short'&&full.has(r.id)?0:r.used}));
  if(type==='long'||ch.cls==='Warlock')for(const slot of Object.values(ch.spellSlots||{}))if(slot&&typeof slot==='object')slot.used=0;
  if(type==='long')ch.hp=ch.maxHp;ch.lastRest={type,at:new Date().toISOString()};saveCharacters(data);broadcast({type:'CHARACTERS_UPDATE',characters:data.characters});res.json(ch);
 });
 app.post('/api/characters/:id/advance',requireDm,express.json({limit:'8kb'}),(req,res)=>{
  try{const data=loadCharacters(),index=data.characters.findIndex(c=>c.id===req.params.id);if(index<0)return res.status(404).json({error:'Герой не найден'});const old=data.characters[index],body=req.body||{};
   if(!old.creationChoices)return res.status(400).json({error:'У героя нет набора автоматического создания. Измените уровень вручную в карточке.'});
   if(body.fromLevel!==old.level)return res.status(409).json({error:'Уровень уже изменился. Обновите карточку.'});
   const level=Number(body.level);if(level!==old.level+1||level>3)return res.status(400).json({error:'Повышение: один уровень за раз, максимум до третьего'});
   const rules=require('./remote/character-rules'),next=rules.calculate({...old.creationChoices,overrideStats:old.stats,level,subclass:level===3?(body.subclass||rules.classes[old.cls].subclass):''});
   const damage=Math.max(0,(old.maxHp||0)-(old.hp||0)),manualHp=(old.maxHp||0)-(old.generatedBaseline?.maxHp||old.maxHp||0),manualAc=(old.ac||0)-(old.generatedBaseline?.ac||old.ac||0);
   next.maxHp+=manualHp;next.ac+=manualAc;next.hp=Math.max(0,next.maxHp-damage);
   const previousGenerated=rules.calculate(old.creationChoices);
   next.resources=next.resources.map(r=>{const previous=old.resources?.find(item=>item.id===r.id),baseline=previousGenerated.resources.find(item=>item.id===r.id);const maxUses=Math.max(0,r.maxUses+(previous&&baseline?previous.maxUses-baseline.maxUses:0));return {...r,maxUses,used:Math.min(maxUses,previous?.used||0)};});
   next.resources.push(...(old.resources||[]).filter(r=>!previousGenerated.resources.some(item=>item.id===r.id)));
   for(const [slot,value] of Object.entries(next.spellSlots))value.used=Math.min(value.max,old.spellSlots?.[slot]?.used||0);
   if(old.cls==='Warlock'){const slot=Object.values(next.spellSlots)[0];slot.used=Math.min(slot.max,Object.values(old.spellSlots||{}).reduce((sum,s)=>sum+(s.used||0),0));}
   const oldNames=rules.calculate(old.creationChoices).abilities.map(a=>a.name);next.abilities.push(...(old.abilities||[]).filter(a=>!oldNames.includes(a.name)&&!next.abilities.some(n=>n.name===a.name)));
   data.characters[index]={...old,...next,xp:old.xp||0,inventory:old.inventory||[],conditions:old.conditions||[],tempHp:old.tempHp||0};saveCharacters(data);broadcast({type:'CHARACTERS_UPDATE',characters:data.characters});res.json(data.characters[index]);
  }catch(error){res.status(400).json({error:error.message});}
 });
};

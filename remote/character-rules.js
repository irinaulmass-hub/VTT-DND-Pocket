'use strict';
(function(scope){
 const source='https://www.dndbeyond.com/sources/dnd/br-2024/';
 const abilities={str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма'};
 const skills={acrobatics:['Акробатика','dex'],animalHandling:['Уход за животными','wis'],arcana:['Магия','int'],athletics:['Атлетика','str'],deception:['Обман','cha'],history:['История','int'],insight:['Проницательность','wis'],intimidation:['Запугивание','cha'],investigation:['Анализ','int'],medicine:['Медицина','wis'],nature:['Природа','int'],perception:['Восприятие','wis'],performance:['Выступление','cha'],persuasion:['Убеждение','cha'],religion:['Религия','int'],sleightOfHand:['Ловкость рук','dex'],stealth:['Скрытность','dex'],survival:['Выживание','wis']};
 const classes={
 Barbarian:{name:'Варвар',die:12,primary:['str','con','dex'],saves:['str','con'],armor:['light','medium','shield'],skills:['animalHandling','athletics','intimidation','nature','perception','survival'],count:2,subclass:'Путь берсерка',features:[['Ярость','Защита без доспехов','Оружейное мастерство'],['Чувство опасности','Безрассудная атака'],['Первобытные знания']]},
 Fighter:{name:'Воин',die:10,primary:['str','con','dex'],saves:['str','con'],armor:['light','medium','heavy','shield'],skills:['acrobatics','animalHandling','athletics','history','insight','intimidation','persuasion','perception','survival'],count:2,subclass:'Чемпион',features:[['Боевой стиль','Второе дыхание','Оружейное мастерство'],['Всплеск действий','Тактический разум'],[]]},
 Bard:{name:'Бард',die:8,primary:['cha','dex','con'],saves:['dex','cha'],armor:['light'],skills:Object.keys(skills),count:3,spell:'cha',subclass:'Коллегия знаний',features:[['Бардовское вдохновение','Магия'],['Компетентность','Мастер на все руки'],[]]},
 Cleric:{name:'Жрец',die:8,primary:['wis','con','str'],saves:['wis','cha'],armor:['light','medium','shield'],skills:['history','insight','medicine','persuasion','religion'],count:2,spell:'wis',subclass:'Домен жизни',features:[['Магия','Божественный орден'],['Божественный канал'],[]]},
 Druid:{name:'Друид',die:8,primary:['wis','con','dex'],saves:['int','wis'],armor:['light','shield'],skills:['arcana','animalHandling','insight','medicine','nature','perception','religion','survival'],count:2,spell:'wis',subclass:'Круг земли',features:[['Магия','Друидический язык','Первобытный орден'],['Дикий облик','Дикий спутник'],[]]},
 Monk:{name:'Монах',die:8,primary:['dex','wis','con'],saves:['str','dex'],armor:[],skills:['acrobatics','athletics','history','insight','religion','stealth'],count:2,subclass:'Воин открытой ладони',features:[['Боевые искусства','Защита без доспехов'],['Сосредоточение','Движение без доспехов','Сверхъестественный метаболизм'],['Отражение атак']]},
 Paladin:{name:'Паладин',die:10,primary:['str','cha','con'],saves:['wis','cha'],armor:['light','medium','heavy','shield'],skills:['athletics','insight','intimidation','medicine','persuasion','religion'],count:2,spell:'cha',subclass:'Клятва преданности',features:[['Наложение рук','Магия','Оружейное мастерство'],['Боевой стиль','Кара паладина'],['Божественный канал']]},
 Ranger:{name:'Следопыт',die:10,primary:['dex','wis','con'],saves:['str','dex'],armor:['light','medium','shield'],skills:['animalHandling','athletics','insight','investigation','nature','perception','stealth','survival'],count:3,spell:'wis',subclass:'Охотник',features:[['Магия','Избранный враг','Оружейное мастерство'],['Искусный исследователь','Боевой стиль'],[]]},
 Rogue:{name:'Плут',die:8,primary:['dex','con','int'],saves:['dex','int'],armor:['light'],skills:['acrobatics','athletics','deception','insight','intimidation','investigation','perception','persuasion','sleightOfHand','stealth'],count:4,subclass:'Вор',features:[['Компетентность','Скрытая атака','Воровской жаргон','Оружейное мастерство'],['Хитрое действие'],['Меткая цель']]},
 Sorcerer:{name:'Чародей',die:6,primary:['cha','con','dex'],saves:['con','cha'],armor:[],skills:['arcana','deception','insight','intimidation','persuasion','religion'],count:2,spell:'cha',subclass:'Драконье чародейство',features:[['Магия','Врождённое чародейство'],['Источник магии','Метамагия'],[]]},
 Warlock:{name:'Колдун',die:8,primary:['cha','con','dex'],saves:['wis','cha'],armor:['light'],skills:['arcana','deception','history','intimidation','investigation','nature','religion'],count:2,spell:'cha',subclass:'Покровитель-исчадие',features:[['Таинственные воззвания','Магия договора'],['Магическая хитрость'],[]]},
 Wizard:{name:'Волшебник',die:6,primary:['int','con','dex'],saves:['int','wis'],armor:[],skills:['arcana','history','insight','investigation','medicine','nature','religion'],count:2,spell:'int',subclass:'Школа воплощения',features:[['Магия','Ритуальный адепт','Магическое восстановление'],['Учёный'],[]]}
 };
 const backgrounds={
 soldier:{name:'Солдат',scores:['str','dex','con'],skills:['athletics','intimidation'],feat:'Дикий нападающий',tools:'Игровой набор'},
 sage:{name:'Мудрец',scores:['con','int','wis'],skills:['arcana','history'],feat:'Посвящённый в магию: волшебник',tools:'Инструменты каллиграфа'},
 acolyte:{name:'Послушник',scores:['int','wis','cha'],skills:['insight','religion'],feat:'Посвящённый в магию: жрец',tools:'Инструменты каллиграфа'},
 criminal:{name:'Преступник',scores:['dex','con','int'],skills:['sleightOfHand','stealth'],feat:'Бдительный',tools:'Воровские инструменты'},
 noble:{name:'Благородный',scores:['str','int','cha'],skills:['history','persuasion'],feat:'Умелый',tools:'Игровой набор'},
 entertainer:{name:'Артист',scores:['str','dex','cha'],skills:['acrobatics','performance'],feat:'Музыкант',tools:'Музыкальный инструмент'},
 artisan:{name:'Ремесленник',scores:['str','dex','int'],skills:['investigation','persuasion'],feat:'Ремесленник',tools:'Инструменты ремесленника'}
 };
 const species={
 human:{name:'Человек',speed:30,traits:['Героическое вдохновение после длинного отдыха','Дополнительное владение навыком','Дополнительная черта происхождения']},
 elf:{name:'Эльф',speed:30,traits:['Тёмное зрение: 60 футов','Преимущество против очарования','Магия не может усыпить','Транс','Острые чувства: выбор навыка','Эльфийское наследие: дополнительная магия']},
 dwarf:{name:'Дварф',speed:30,traits:['Тёмное зрение: 120 футов','Сопротивление урону ядом','Преимущество против состояния «Отравлен»','Дварфская стойкость: +1 максимум здоровья за уровень','Каменное чутьё']},
 halfling:{name:'Полурослик',speed:30,traits:['Удачливый: переброс натуральной единицы в проверках к20','Преимущество против испуга','Проворство полурослика','Природная скрытность']}
 };
 const mod=n=>Math.floor((n-10)/2),armorNames={none:'Без доспехов',light:'Кожаный доспех',medium:'Чешуйчатый доспех',heavy:'Кольчуга'};
 function standard(cls){const order=[...classes[cls].primary,...Object.keys(abilities).filter(k=>!classes[cls].primary.includes(k))];return Object.fromEntries(order.map((k,i)=>[k,[15,14,13,12,10,8][i]]));}
 function calculate(input){
  const c=classes[input.cls],race=species[input.species],bg=backgrounds[input.background];if(!c||!race||!bg)throw Error('Выберите вид, класс и предысторию');
  const level=Number(input.level??1);if(!Number.isInteger(level)||level<1||level>3)throw Error('Автоматический расчёт поддерживает уровни 1–3');
  const base=input.base||standard(input.cls),boost=input.boost||{[bg.scores[0]]:2,[bg.scores[1]]:1};const amounts=Object.values(boost).filter(Boolean).sort();if(!(['1,2','1,1,1'].includes(amounts.join(',')))||Object.keys(boost).some(k=>boost[k]&&!bg.scores.includes(k)))throw Error('Прибавки предыстории: +2 и +1 к разным характеристикам или +1 к трём указанным');
  const stats={},breakdown={};for(const key of Object.keys(abilities)){const n=Number(base[key]);if(!Number.isInteger(n)||n<3||n>18)throw Error('Базовые характеристики должны быть целыми от 3 до 18');stats[key]=Math.min(20,n+(boost[key]||0));breakdown[key]={base:n,background:boost[key]||0,total:stats[key],modifier:mod(stats[key])};}
  for(const key of Object.keys(abilities)){if(input.overrideStats?.[key]!==undefined){const n=Number(input.overrideStats[key]);if(!Number.isInteger(n)||n<1||n>30)throw Error('Поправка мастера: характеристика от 1 до 30');breakdown[key].manual=n-stats[key];stats[key]=n;breakdown[key].total=n;breakdown[key].modifier=mod(n);}}
  const warnings=[],selected=[...new Set(input.skills||[])],automatic=[...bg.skills];
  if(selected.length!==c.count||selected.some(k=>!c.skills.includes(k)||automatic.includes(k)))throw Error('Выберите '+c.count+' разных навыка класса без повторения предыстории');
  if(input.species==='human'){if(!input.extraSkill||selected.includes(input.extraSkill)||automatic.includes(input.extraSkill))throw Error('Выберите дополнительный навык человека');automatic.push(input.extraSkill);if(!input.originFeat)throw Error('Выберите дополнительную черту происхождения человека');}
  if(input.species==='elf'){if(!['perception','insight','survival'].includes(input.elfSkill)||selected.includes(input.elfSkill)||automatic.includes(input.elfSkill))throw Error('Выберите неповторяющийся навык острых чувств эльфа');automatic.push(input.elfSkill);}
  let lineage=input.lineage||'high';let speed=race.speed;if(input.species==='elf'&&lineage==='wood')speed=35;
  let hp=c.die+mod(stats.con)+(level-1)*(c.die/2+1+mod(stats.con))+(input.species==='dwarf'?level:0)+(input.species==='human'&&input.originFeat==='Крепкий'?2*level:0);
  const armor=input.armor||'none',shield=!!input.shield;let trained=[...c.armor];
  if(input.cls==='Cleric'&&input.order==='protector')trained.push('heavy');if(input.cls==='Druid'&&input.order==='warden')trained.push('medium');
  let ac=10+mod(stats.dex);if(armor==='light')ac=11+mod(stats.dex);if(armor==='medium')ac=14+Math.min(2,mod(stats.dex));if(armor==='heavy')ac=16;
  if(armor==='none'&&input.cls==='Barbarian')ac=10+mod(stats.dex)+mod(stats.con);
  if(armor==='none'&&!shield&&input.cls==='Monk')ac=10+mod(stats.dex)+mod(stats.wis);
  if(shield)ac+=2;
  if(armor!=='none'&&!trained.includes(armor))warnings.push('Нет обучения выбранному типу брони: действуют ограничения, включая невозможность колдовать.');
  if(shield&&!trained.includes('shield'))warnings.push('Нет обучения щитам.');
  if(input.cls==='Barbarian'&&armor==='heavy')warnings.push('В тяжёлой броне нельзя войти в ярость.');
  if(input.cls==='Monk'&&(armor!=='none'||shield))warnings.push('Боевые искусства и движение без доспехов требуют отсутствия брони и щита.');
  if(armor==='heavy'&&stats.str<13)warnings.push('Для кольчуги нужна Сила 13: скорость уменьшается на 10 футов.');
  const resources=[];const resource=(id,name,max,recovery)=>resources.push({id,name,maxUses:max,used:0,recovery});
  if(input.cls==='Barbarian')resource('rage','Ярость',level===3?3:2,'Один расход возвращается после короткого отдыха; все — после длинного');
  if(input.cls==='Fighter'){resource('second-wind','Второе дыхание',2,'Один расход после короткого отдыха; все — после длинного');if(level>=2)resource('action-surge','Всплеск действий',1,'Короткий или длинный отдых');}
  if(input.cls==='Bard')resource('inspiration','Бардовское вдохновение',Math.max(1,mod(stats.cha)),'Длинный отдых');
  if(['Cleric','Paladin'].includes(input.cls)&&level>=(input.cls==='Cleric'?2:3))resource('channel','Божественный канал',2,'Один расход после короткого отдыха; все — после длинного');
  if(input.cls==='Druid'&&level>=2)resource('wild-shape','Дикий облик',2,'Один расход после короткого отдыха; все — после длинного');
  if(input.cls==='Monk'&&level>=2)resource('focus','Очки сосредоточения',level,'Короткий или длинный отдых');
  if(input.cls==='Paladin'){resource('lay-on-hands','Наложение рук: запас лечения',5*level,'Длинный отдых');if(level>=2)resource('free-smite','Кара паладина без ячейки',1,'Длинный отдых');}
  if(input.cls==='Ranger')resource('favored-enemy','Метка охотника без ячейки',2,'Длинный отдых');
  if(input.cls==='Sorcerer'){resource('innate','Врождённое чародейство',2,'Длинный отдых');if(level>=2)resource('sorcery','Очки чародейства',level,'Длинный отдых');}
  if(input.cls==='Wizard')resource('arcane-recovery','Магическое восстановление',1,'Длинный отдых; применяется во время короткого');
  const spellSlots={};if(c.spell){if(input.cls==='Warlock')spellSlots[level===3?'2':'1']={max:level===1?1:2,used:0};else if(['Paladin','Ranger'].includes(input.cls))spellSlots['1']={max:level===3?3:2,used:0};else{spellSlots['1']={max:[2,3,4][level-1],used:0};if(level===3)spellSlots['2']={max:2,used:0};}}
  if(input.background==='noble'||(input.species==='human'&&input.originFeat==='Умелый')){const additional=input.additionalSkills||Object.keys(skills).filter(k=>!selected.includes(k)&&!automatic.includes(k)).slice(0,3);if(additional.length!==3||new Set(additional).size!==3||additional.some(k=>!skills[k]||selected.includes(k)||automatic.includes(k)))throw Error('Для черты «Умелый» нужны три разных дополнительных навыка');automatic.push(...additional);}
  const proficiencies=[...new Set([...selected,...automatic])],skillValues={};for(const [key,[,ability]] of Object.entries(skills))skillValues[key]=mod(stats[ability])+(proficiencies.includes(key)?2:0);
  if(input.cls==='Monk'&&level>=2&&armor==='none'&&!shield)speed+=10;if(armor==='heavy'&&stats.str<13)speed-=10;
  const expertise=[];if(input.cls==='Rogue'||(input.cls==='Bard'&&level>=2)){expertise.push(...(input.expertise||selected.slice(0,2)));if(expertise.length!==2||expertise.some(key=>!proficiencies.includes(key)))throw Error('Выберите два навыка с владением для компетентности');for(const key of expertise)skillValues[key]+=2;}
  const features=c.features.slice(0,level).flat().map(name=>({name,description:'Источник: правила класса '+c.name+' (2024).'}));features.push(...race.traits.map(name=>({name,description:'Особенность вида '+race.name})));features.push({name:bg.feat,description:'Черта предыстории '+bg.name});if(input.species==='human')features.push({name:input.originFeat,description:'Дополнительная черта происхождения человека'});
  if(input.species==='elf')features.push({name:lineage==='wood'?'Лесное наследие':lineage==='drow'?'Наследие дроу':'Высшее наследие',description:'Магия наследия учитывается отдельно от ячеек класса. Выберите заклинательную характеристику и доступные заклинания.'});
  if(input.cls==='Cleric'||input.cls==='Druid')features.push({name:'Выбранный орден',description:input.order||'Не выбран'});
  if(level===3){warnings.push('Особенности подкласса пока не рассчитываются автоматически: проверьте их в подробном листе.');if(!input.subclass)warnings.push('На третьем уровне нужно выбрать подкласс.');else features.push({name:input.subclass,description:'Подкласс выбран. Особенности, требующие выбора, нужно заполнить в листе героя.'});}
  if(input.background==='noble'||input.species==='human'&&input.originFeat==='Умелый')features.push({name:'Дополнительные навыки: '+automatic.filter(key=>!bg.skills.includes(key)&&key!==input.extraSkill).map(key=>skills[key][0]).join(', '),description:'Рекомендуемый набор черты «Умелый»; мастер может выбрать другие владения.'});
  if(['sage','acolyte'].includes(input.background))warnings.push('Посвящённый в магию: выберите два заговора, заклинание первого уровня и его характеристику в листе героя.');
  return {generatedBaseline:{maxHp:hp,ac},rulesVersion:'2024',cls:input.cls,race:race.name,speciesId:input.species,background:bg.name,backgroundId:input.background,level,xp:0,hp,maxHp:hp,tempHp:0,ac,speed,stats,proficiencyBonus:2,skillProficiencies:proficiencies,expertise,skillValues,saves:Object.fromEntries(Object.keys(abilities).map(key=>[key,mod(stats[key])+(c.saves.includes(key)?2:0)])),passivePerception:10+skillValues.perception,initiative:mod(stats.dex)+((input.background==='criminal'||input.species==='human'&&input.originFeat==='Бдительный')?2:0),resources,spellSlots,hasSpellcasting:!!c.spell,spellcastingAbility:c.spell||null,spellSaveDC:c.spell?10+mod(stats[c.spell]):null,spellAttackBonus:c.spell?2+mod(stats[c.spell]):null,spellSlotRecovery:input.cls==='Warlock'?'Короткий или длинный отдых':'Длинный отдых',abilities:features,inventory:[...(armor==='none'?[]:[{name:armorNames[armor],quantity:1,type:'armor',armorType:armor,equipped:true}]),...(shield?[{name:'Щит',quantity:1,type:'shield',equipped:true}]:[])],armorTraining:trained,subclass:level>=3?(input.subclass||''):'',creationChoices:{...input,base,boost},calculation:breakdown,warnings,source:source+'character-classes'};
 }
 const api={abilities,skills,classes,backgrounds,species,standard,calculate};if(typeof module==='object')module.exports=api;else scope.CharacterRules=api;
})(typeof window==='object'?window:globalThis);

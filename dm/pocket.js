'use strict';
window.editPocketCharacter = function(button) {
  const id=button.closest('[data-char-id]').dataset.charId;
  const ch=characterRoster.find(c=>c.id===id); if(!ch)return;
  let dialog=document.querySelector('#pocket-editor');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='pocket-editor';document.body.append(dialog);}
  dialog.style.cssText='width:min(650px,95vw);max-height:90vh;overflow:auto;background:#19211e;color:#eee4ce;border:1px solid #9b733e;border-radius:14px;padding:24px';
  const fields={level:'Уровень',portrait:'Портрет: /assets/… или URL',eclipse:'Затмение',maxEclipse:'Максимум затмения',speed:'Скорость (футы)',initiative:'Инициатива',passivePerception:'Пассивное восприятие',money:'Деньги'};
  const defaults={level:1,eclipse:0,maxEclipse:10,speed:30,money:0};
  const collections={conditions:'Состояния',inventory:'Инвентарь',abilities:'Умения',spells:'Заклинания',attacks:'Оружие и атаки'};
  const schemas={conditions:{name:'Название'},inventory:{name:'Название',description:'Описание',quantity:'Количество',image:'Адрес картинки',type:'Тип предмета'},abilities:{name:'Название',description:'Описание',maxUses:'Всего использований',used:'Потрачено',recovery:'Когда восстанавливается'},spells:{name:'Название',description:'Описание',recovery:'Когда восстанавливается'},attacks:{name:'Название',attackBonus:'Бонус атаки',damage:'Урон (например 1d8+4)',description:'Описание'}};
  const numeric=new Set(['quantity','maxUses','used','attackBonus']);
  function itemRow(key,item={},index=-1){if(typeof item==='string')item={name:item};return '<fieldset data-original="'+index+'" data-item="'+key+'" style="border:1px solid #526050;border-radius:8px;margin:10px 0;padding:12px">'+Object.entries(schemas[key]).map(([field,label])=>'<label style="display:block;margin:6px 0">'+label+'<input data-field="'+field+'" style="display:block;width:100%;padding:9px" type="'+(numeric.has(field)?'number':'text')+'" value="'+escHtml(item[field]??'')+'"></label>').join('')+'<button type="button" data-remove>Убрать из списка</button></fieldset>';}
  dialog.innerHTML='<form method="dialog"><h2>Карточка · '+escHtml(ch.name)+'</h2><p>Изменения сразу появятся на телефоне.</p>'+Object.entries(fields).map(([k,label])=>'<label style="display:block;margin:12px 0">'+label+'<input style="display:block;width:100%;padding:10px" name="'+k+'" type="'+(k==='portrait'?'text':'number')+'" value="'+escHtml(ch[k]??defaults[k]??'')+'"></label>').join('')+Object.entries(collections).map(([k,label])=>'<section><h3>'+label+'</h3><div data-items="'+k+'">'+(ch[k]||[]).map((item,index)=>itemRow(k,item,index)).join('')+'</div><button type="button" data-add="'+k+'">+ Добавить</button></section>').join('')+'<p id="pocket-error" role="alert"></p><button value="cancel" type="button" id="pocket-cancel">Отмена</button> <button type="submit">Сохранить</button></form>';
  dialog.querySelector('#pocket-cancel').onclick=()=>dialog.close();
  dialog.onclick=event=>{const add=event.target.closest('[data-add]');if(add)dialog.querySelector('[data-items="'+add.dataset.add+'"]').insertAdjacentHTML('beforeend',itemRow(add.dataset.add));const remove=event.target.closest('[data-remove]');if(remove)remove.closest('fieldset').remove();};
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    try{
      const form=new FormData(event.target),patch={};
      for(const key of Object.keys(fields)){const value=form.get(key);if(value!=='')patch[key]=key==='portrait'?value:Number(value);}
      for(const key of Object.keys(collections)){patch[key]=[...dialog.querySelectorAll('[data-item="'+key+'"]')].map((row,index)=>{const original=ch[key]?.[Number(row.dataset.original)];const item={...(typeof original==='object'?original:{})};for(const input of row.querySelectorAll('[data-field]')){if(numeric.has(input.dataset.field)){if(input.value!=='')item[input.dataset.field]=Number(input.value);else delete item[input.dataset.field];}else item[input.dataset.field]=input.value;}return item;}).filter(item=>item.name);}
      const response=await fetch('/api/characters/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
      if(!response.ok)throw Error('Не удалось сохранить. Проверьте вход мастера.');
      const updated=await response.json();Object.assign(ch,updated);renderCharacterSheets();dialog.close();
    }catch(error){dialog.querySelector('#pocket-error').textContent=error.message;}
  };
  dialog.showModal();
};
const access=document.createElement('details');
access.style.cssText='position:fixed;right:15px;bottom:15px;z-index:800;background:#19211e;color:#eee4ce;border:1px solid #9b733e;border-radius:10px;padding:12px;max-width:90vw;box-shadow:0 4px 20px #0008';
access.innerHTML='<summary style="cursor:pointer">📱 Подключить игроков</summary><div id="pocket-links">Загрузка адресов…</div>';
document.body.append(access);
fetch('/api/connection').then(r=>r.json()).then(data=>{
  access.querySelector('div').innerHTML='<p>Одна Wi-Fi сеть с компьютером мастера.</p>'+data.addresses.map(url=>'<p>Игрокам: <a style="color:#dcc18b" href="'+escHtml(url)+'/player" target="_blank" rel="noopener">'+escHtml(url)+'/player</a><br>Телевизору: <a style="color:#dcc18b" href="'+escHtml(url)+'/tv" target="_blank" rel="noopener">'+escHtml(url)+'/tv</a></p>').join('')+'<small>На этом компьютере: <a style="color:#dcc18b" href="/player" target="_blank" rel="noopener">карточка игрока</a> · <a style="color:#dcc18b" href="/tv" target="_blank" rel="noopener">телевизор</a></small>';
}).catch(()=>{access.querySelector('div').textContent='Не удалось определить адрес сети.';});

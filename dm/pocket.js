'use strict';
window.editPocketCharacter = function(button) {
  const id=button.closest('[data-char-id]').dataset.charId;
  const ch=characterRoster.find(c=>c.id===id); if(!ch)return;
  let dialog=document.querySelector('#pocket-editor');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='pocket-editor';document.body.append(dialog);}
  dialog.style.cssText='width:min(650px,95vw);max-height:90vh;overflow:auto;background:#19211e;color:#eee4ce;border:1px solid #9b733e;border-radius:14px;padding:24px';
  const fields={level:'Уровень',portrait:'Портрет: /assets/… или URL',eclipse:'Затмение',maxEclipse:'Максимум затмения',speed:'Скорость (футы)',initiative:'Инициатива',passivePerception:'Пассивное восприятие',money:'Деньги'};
  const defaults={level:1,eclipse:0,maxEclipse:10,speed:30,money:0};
  const collections={conditions:'Состояния: строки или объекты с name',inventory:'Предметы: name, description, quantity, image, type',abilities:'Умения: name, description, maxUses, used, recovery',spells:'Заклинания: name, description, recovery',attacks:'Атаки: name, attackBonus, damage, description'};
  dialog.innerHTML='<form method="dialog"><h2>Карточка · '+escHtml(ch.name)+'</h2><p>Изменения сразу появятся на телефоне.</p>'+Object.entries(fields).map(([k,label])=>'<label style="display:block;margin:12px 0">'+label+'<input style="display:block;width:100%;padding:10px" name="'+k+'" type="'+(k==='portrait'?'text':'number')+'" value="'+escHtml(ch[k]??defaults[k]??'')+'"></label>').join('')+Object.entries(collections).map(([k,label])=>'<label style="display:block;margin:18px 0">'+label+'<textarea name="'+k+'" style="display:block;width:100%;min-height:100px;padding:10px">'+escHtml(JSON.stringify(ch[k]||[],null,2))+'</textarea></label>').join('')+'<p>Списки задаются в JSON. Пример предмета: [{"name":"Ключ","quantity":1,"description":"От старой башни"}]</p><p id="pocket-error" role="alert"></p><button value="cancel" type="button" id="pocket-cancel">Отмена</button> <button type="submit">Сохранить</button></form>';
  dialog.querySelector('#pocket-cancel').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    try{
      const form=new FormData(event.target),patch={};
      for(const key of Object.keys(fields)){const value=form.get(key);if(value!=='')patch[key]=key==='portrait'?value:Number(value);}
      for(const key of Object.keys(collections)){patch[key]=JSON.parse(form.get(key));if(!Array.isArray(patch[key]))throw Error('Поле '+key+' должно содержать список.');}
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

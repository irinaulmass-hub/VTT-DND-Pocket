'use strict';
(() => {
 const {esc,rarities,request}=window.LootUI;
 const launcher=document.createElement('button');launcher.id='loot-launcher';launcher.className='btn btn-secondary';launcher.textContent='Сундуки и добыча';launcher.style.cssText='margin:20px;min-height:44px';document.body.append(launcher);
 const dialog=document.createElement('dialog');dialog.className='loot-dialog';dialog.lang='ru';dialog.setAttribute('translate','no');dialog.setAttribute('aria-label','Управление добычей');
 dialog.innerHTML='<h2>Сундуки и добыча</h2><div class="loot-actions"><button data-refresh>Обновить</button><button data-close>Закрыть</button></div><label>Контейнер <select data-select></select></label><form data-create class="loot-actions"><label>Новый контейнер <input name="name" placeholder="Сундук в таверне" maxlength="120" required></label><button>Создать</button></form><p data-link></p><p role="status"></p><div data-editor></div>';
 document.body.append(dialog);
 const select=dialog.querySelector('[data-select]'),editor=dialog.querySelector('[data-editor]'),status=dialog.querySelector('[role=status]');
 let containers=[],characters=[],current=null,busy=false,dirty=false,tokenContext=null;
 const drafts=new Map();
 const api=(url,method,body)=>request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 function value(){return {revision:drafts.get(current.id)?.revision ?? current.revision,name:editor.querySelector('[name=name]').value,revealed:editor.querySelector('[name=revealed]').checked,items:[...editor.querySelectorAll('[data-edit-item]')].map(row=>{const result={};if(row.dataset.editItem)result.id=row.dataset.editItem;for(const input of row.querySelectorAll('[data-field]'))result[input.dataset.field]=input.dataset.field==='quantity'?Number(input.value):input.value;return result;})};}
 function remember(){if(current&&dirty)drafts.set(current.id,value());}
 function itemRow(item={name:'',quantity:1,rarity:'common',description:'',properties:''}){
  return '<fieldset class="loot-item" data-edit-item="'+esc(item.id||'')+'"><legend>Предмет</legend><div class="loot-grid"><label>Название <input data-field="name" value="'+esc(item.name)+'" maxlength="120" required></label><label>Количество <input data-field="quantity" type="number" min="1" max="100000" value="'+item.quantity+'" required></label><label>Редкость <select data-field="rarity">'+Object.entries(rarities).map(([key,v])=>'<option value="'+key+'" '+(key===item.rarity?'selected':'')+'>'+v[0]+'</option>').join('')+'</select></label></div><label>Свойства <textarea data-field="properties" rows="2" maxlength="2000">'+esc(item.properties)+'</textarea></label><label>Описание <textarea data-field="description" rows="3" maxlength="10000">'+esc(item.description)+'</textarea></label><button type="button" data-remove>Убрать из контейнера</button></fieldset>';
 }
 function render(){
  current=containers.find(c=>c.id===select.value)||null;
  if(!current){editor.replaceChildren();return;}
  const draft=drafts.get(current.id),data=draft||current;dirty=!!draft;
  editor.innerHTML='<form data-edit><label>Название контейнера <input name="name" maxlength="120" required value="'+esc(data.name)+'"></label><label><input name="revealed" type="checkbox" '+(data.revealed?'checked':'')+'> Открыть содержимое игрокам</label><div data-items>'+data.items.map(itemRow).join('')+'</div><div class="loot-actions"><button type="button" data-add>Добавить предмет</button><button>Сохранить содержимое</button><button type="button" data-discard>Загрузить сохранённое</button></div></form><h3>Выдать герою</h3><p>Выдача сразу переносит предмет в инвентарь.</p><form data-transfer class="loot-actions"><label>Герой <select name="characterId" required>'+characters.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label><label>Предмет <select name="itemId" required>'+current.items.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' × '+i.quantity+'</option>').join('')+'</select></label><label>Количество <input name="quantity" type="number" min="1" max="100000" value="1" required style="width:90px"></label><button data-give '+(dirty||!current.items.length||!characters.length?'disabled':'')+'>Выдать</button></form><details><summary>История выдачи ('+(current.transfers||[]).length+')</summary>'+((current.transfers||[]).map(t=>'<p>'+esc(t.characterName)+' ← '+esc(t.name)+' × '+t.quantity+'</p>').join('')||'<p>Предметы ещё не выдавались.</p>')+'</details>';
  status.textContent=dirty?'Есть черновик. Сохраните содержимое перед выдачей.':(current.revealed?'Контейнер открыт игрокам.':'Контейнер скрыт от игроков.');
 }
 async function refresh(preferred){
  const [loot,roster]=await Promise.all([request('/api/loot'),request('/api/characters')]);containers=loot.containers;characters=roster.characters;
  const chosen=preferred||select.value;
  select.replaceChildren(...containers.map(c=>new Option(c.name+(c.revealed?' · открыт':' · скрыт'),c.id)));
  if(containers.some(c=>c.id===chosen))select.value=chosen;render();
 }
 async function run(action){if(busy)return;busy=true;dialog.querySelectorAll('button,select').forEach(b=>b.disabled=true);try{await action();}catch(e){status.textContent=e.message;}finally{busy=false;dialog.querySelectorAll('button,select').forEach(b=>b.disabled=false);const give=editor.querySelector('[data-give]');if(give)give.disabled=dirty||!current?.items.length||!characters.length;}}
 window.openLootEditor=async context=>{
  if(busy)return;remember();tokenContext=context||null;
  dialog.querySelector('[data-link]').textContent=tokenContext?'Новый контейнер будет связан с токеном «'+tokenContext.name+'».':'Можно создать отдельный контейнер или открыть меню предметного токена на карте.';
  dialog.querySelector('[data-create] input').value=tokenContext?.name||'';
  if(!dialog.open)dialog.showModal();
  await run(async()=>{await refresh();if(tokenContext){const linked=containers.find(c=>c.tokenId===tokenContext.tokenId&&c.mapKey===tokenContext.mapKey);if(linked){select.value=linked.id;render();}}});
 };
 launcher.onclick=()=>window.openLootEditor();
 select.onchange=()=>{remember();render();};
 dialog.querySelector('[data-refresh]').onclick=()=>run(async()=>{remember();await refresh();});
 dialog.querySelector('[data-close]').onclick=()=>{remember();dialog.close();};
 dialog.addEventListener('cancel',()=>remember());
 editor.addEventListener('input',()=>{dirty=true;const give=editor.querySelector('[data-give]');if(give)give.disabled=true;status.textContent='Есть несохранённые изменения.';});
 editor.addEventListener('click',event=>{
  if(event.target.closest('[data-add]')){editor.querySelector('[data-items]').insertAdjacentHTML('beforeend',itemRow());dirty=true;editor.querySelector('[data-give]').disabled=true;}
  if(event.target.closest('[data-remove]')){event.target.closest('[data-edit-item]').remove();dirty=true;editor.querySelector('[data-give]').disabled=true;}
  if(event.target.closest('[data-discard]'))run(async()=>{drafts.delete(current.id);dirty=false;await refresh();});
 });
 dialog.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;
  if(form.hasAttribute('data-create'))run(async()=>{remember();const c=await api('/api/loot','POST',{name:new FormData(form).get('name'),tokenId:tokenContext?.tokenId||'',mapKey:tokenContext?.mapKey||''});await refresh(c.id);form.reset();});
  if(form.hasAttribute('data-edit'))run(async()=>{const id=current.id,body=value();const draft=drafts.get(id);if(draft)body.revision=draft.revision;await api('/api/loot/'+encodeURIComponent(id),'PUT',body);drafts.delete(id);dirty=false;await refresh(id);status.textContent='Содержимое сохранено.';});
  if(form.hasAttribute('data-transfer')){const fields=new FormData(form);run(async()=>{await api('/api/loot/'+encodeURIComponent(current.id)+'/take','POST',{revision:current.revision,characterId:fields.get('characterId'),itemId:fields.get('itemId'),quantity:Number(fields.get('quantity'))});await refresh();status.textContent='Предмет передан герою.';});}
 });
 window.addEventListener('loot-changed',()=>{if(dialog.open&&!busy)status.textContent='Добыча изменилась. Нажмите «Обновить», чтобы увидеть остаток.';});
})();

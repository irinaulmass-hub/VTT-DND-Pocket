'use strict';
(() => {
 const rarities={common:['Обычный','#c6cdc8'],uncommon:['Необычный','#7ddd8e'],rare:['Редкий','#83b7ff'],'very-rare':['Очень редкий','#d3a0ff'],legendary:['Легендарный','#ffce74']};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(url,options){const response=await fetch(url,options);if(response.redirected)throw Error('Войдите в панель мастера.');const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось загрузить добычу.');return data;}
 window.LootUI={rarities,esc,request};
 const dialog=document.createElement('dialog');dialog.className='loot-dialog';dialog.lang='ru';dialog.setAttribute('translate','no');dialog.setAttribute('aria-label','Добыча');
 dialog.innerHTML='<h2>Сундуки и добыча</h2><div class="loot-actions"><button data-refresh>Обновить</button><button data-close>Закрыть</button></div><label>Получатель <select data-character aria-label="Получатель добычи"></select></label><p role="status"></p><div data-containers></div>';
 document.body.append(dialog);
 const list=dialog.querySelector('[data-containers]'),select=dialog.querySelector('select'),status=dialog.querySelector('[role=status]');
 let filter={},containers=[],busy=false,generation=0;
 async function refresh(){
  const version=++generation;status.textContent='Загрузка…';
  try{
   const query=filter.tokenId?'?tokenId='+encodeURIComponent(filter.tokenId)+'&mapKey='+encodeURIComponent(filter.mapKey||''):'';
   const [loot,characters]=await Promise.all([request('/api/loot'+query),request('/api/characters')]);
   if(version!==generation)return;
   containers=loot.containers;
   const choice=select.value || localStorage.getItem('pocket-character') || '';
   select.replaceChildren(...characters.characters.map(c=>new Option(c.name,c.id)));if(characters.characters.some(c=>c.id===choice))select.value=choice;
   list.innerHTML=containers.length?containers.map(c=>'<section><h3>'+esc(c.name)+'</h3>'+(c.items.length?c.items.map(item=>{
    const rarity=rarities[item.rarity]||rarities.common;
    return '<article class="loot-item" style="--rarity:'+rarity[1]+'"><h3>'+esc(item.name)+'</h3><span class="loot-rarity">'+rarity[0]+' · осталось '+item.quantity+'</span><p class="loot-text">'+esc(item.description)+'</p><p class="loot-text">'+esc(item.properties)+'</p><form data-container="'+esc(c.id)+'" data-item="'+esc(item.id)+'" class="loot-actions"><label>Количество <input aria-label="Количество: '+esc(item.name)+'" name="quantity" type="number" value="1" min="1" max="'+item.quantity+'" required style="width:90px"></label><button '+(!select.value?'disabled':'')+'>Забрать</button></form></article>';
   }).join(''):'<p>Всё забрали — контейнер пуст.</p>')+'</section>').join(''):'<p>Мастер пока не открыл добычу.</p>';
   status.textContent=select.value?'Выберите предмет и количество.':'Сначала мастер должен создать персонажей.';
  }catch(e){if(version===generation)status.textContent=e.message;}
 }
 window.openLoot=async options=>{if(busy)return;select.value='';filter=options||{};if(!dialog.open)dialog.showModal();await refresh();};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-refresh]').onclick=()=>{if(!busy)refresh();};
 dialog.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const form=event.target,container=containers.find(c=>c.id===form.dataset.container);if(!container)return;
  busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   await request('/api/loot/'+encodeURIComponent(container.id)+'/take',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:container.revision,itemId:form.dataset.item,quantity:Number(new FormData(form).get('quantity')),characterId:select.value})});
   await refresh();status.textContent='Предмет передан в инвентарь героя.';
  }catch(e){await refresh();status.textContent=e.message;}finally{busy=false;dialog.querySelectorAll('[data-close],[data-refresh]').forEach(b=>b.disabled=false);}
 });
 window.addEventListener('loot-changed',()=>{if(dialog.open&&!busy)refresh();});
})();

'use strict';
(() => {
 const {esc,request}=window.LootUI,host=document.getElementById('book-content-adventure');
 const reader=document.createElement('section');reader.className='adventure-reader';reader.innerHTML='<div class="book-eyebrow">Материалы кампании · только для мастера</div><h2 id="adventure-title">Материалы приключения</h2><div class="book-toolbar"><input class="book-select" id="adventure-search" hidden placeholder="Найти в истории: имя, место, проверку…" aria-label="Поиск по приключению"><button class="book-button" id="adventure-refresh">Обновить</button><a class="book-button" id="adventure-source" href="/api/adventure/source.pdf" hidden target="_blank" rel="noopener">Открыть исходный PDF ↗</a></div><p class="book-status" id="adventure-status" role="status"></p><div class="adventure-layout" id="adventure-layout" hidden><nav id="adventure-chapters" aria-label="Главы приключения"></nav><div><div id="adventure-results"></div><div class="adventure-page-toolbar"><button class="book-button" id="adventure-prev">← Назад</button><span id="adventure-page-label"></span><button class="book-button" id="adventure-next">Вперёд →</button></div><article id="adventure-page" class="adventure-page"></article><div class="book-toolbar"><button class="book-button primary" id="adventure-current">Сделать текущей сценой</button><button class="book-button" id="adventure-done">Отметить пройденной</button></div><label for="adventure-note">Мои записи к главе</label><textarea class="book-note-input" id="adventure-note" rows="5"></textarea><button class="book-button" id="adventure-save">Сохранить записи</button></div></div>';
 host.prepend(reader);let data,chapter,page=2,dirty=false,busy=false;const $=id=>document.getElementById('adventure-'+id);
 function markCurrent(){if(!data?.state)return;const current=data.chapters.find(c=>c.id===data.state.current);window.currentAdventureChapter=current;const target=document.getElementById('book-scene-info');if(target){target.className='book-story-text';target.innerHTML='<strong>'+esc(current.title)+'</strong><p>'+esc(data.title)+' · страницы '+current.from+'–'+current.to+'</p><button class="book-button" id="book-read-current">Открыть главу</button>';document.getElementById('book-read-current').onclick=()=>{document.getElementById('book-tab-adventure').click();open(current.id);};}}
 function draftKey(id){return 'adventure-draft:'+id;}
 function remember(){if(chapter&&dirty)localStorage.setItem(draftKey(chapter.id),$('note').value);}
 function render(){if(!data)return;$('chapters').innerHTML=data.chapters.map(c=>'<button class="adventure-chapter" data-chapter="'+c.id+'" aria-current="'+(c.id===chapter.id?'page':'false')+'">'+(data.state.done.includes(c.id)?'✓ ':'')+esc(c.title)+(c.id===data.state.current?' · сейчас':'')+'<small>стр. '+c.from+(c.to===c.from?'':'–'+c.to)+'</small></button>').join('');const source=data.pages.find(p=>p.number===page);$('page-label').textContent='Страница '+page+' из '+data.pages.length;$('page').textContent=source.text;$('prev').disabled=page<=1;$('next').disabled=page>=data.pages.length;$('done').textContent=data.state.done.includes(chapter.id)?'Снять отметку о прохождении':'Отметить пройденной';}
 function open(id){remember();chapter=data.chapters.find(c=>c.id===id)||data.chapters[0];page=chapter.from;const draft=localStorage.getItem(draftKey(chapter.id));$('note').value=draft??data.state.notes[chapter.id]??'';dirty=draft!==null;render();}
 async function load(){
  remember();
  try {
   data = await request('/api/adventure');
   const hasStory = Boolean(data.state && data.chapters.length);
   $('title').textContent = data.title || 'Материалы приключения';
   for (const id of ['source','search','layout']) $(id).hidden = !hasStory;
   if (!hasStory) {
    $('status').textContent = 'У этой кампании пока нет материалов. Для подготовки можно использовать заметки мастера.';
    return;
   }
   $('source').href = '/api/adventure/source.pdf?game=' + encodeURIComponent(window.currentCampaignId || 'default');
   open(chapter?.id || data.state.current);
   markCurrent();
   $('status').textContent = 'История сохранена в кампании.';
  } catch(e) { $('status').textContent = e.message; }
 }
 async function save(changes={}){if(busy)return;busy=true;try{const state={...data.state,...changes,notes:{...data.state.notes,[chapter.id]:$('note').value}};const result=await request('/api/adventure/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});data.state=result;dirty=false;localStorage.removeItem(draftKey(chapter.id));render();markCurrent();$('status').textContent='Записи сохранены';}catch(e){remember();$('status').textContent=e.message+' Черновик остаётся на этом устройстве.';}finally{busy=false;}}
 $('chapters').onclick=event=>{const button=event.target.closest('[data-chapter]');if(button)open(button.dataset.chapter);};
 $('prev').onclick=()=>{if(page>1){page--;render();}};$('next').onclick=()=>{if(page<data.pages.length){page++;render();}};$('refresh').onclick=load;$('save').onclick=()=>save();$('current').onclick=()=>save({current:chapter.id});$('done').onclick=()=>save({done:data.state.done.includes(chapter.id)?data.state.done.filter(id=>id!==chapter.id):[...data.state.done,chapter.id]});$('note').oninput=()=>{dirty=true;remember();$('status').textContent='Есть несохранённые записи';};
 $('search').oninput=()=>{if(!data)return;const query=$('search').value.trim().toLocaleLowerCase('ru');$('results').innerHTML=query.length<2?'':data.pages.filter(p=>p.text.toLocaleLowerCase('ru').includes(query)).map(p=>{const index=p.text.toLocaleLowerCase('ru').indexOf(query);return '<button class="adventure-result" data-page="'+p.number+'"><strong>Страница '+p.number+'</strong> '+esc(p.text.slice(Math.max(0,index-45),index+120).replace(/\n/g,' '))+'</button>';}).join('')||'<p>Совпадений нет</p>';};
 $('results').onclick=event=>{const button=event.target.closest('[data-page]');if(button){page=Number(button.dataset.page);render();}};
 load();
})();

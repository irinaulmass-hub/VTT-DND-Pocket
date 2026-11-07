'use strict';
(() => {
 const panel=document.createElement('details');panel.id='assistant-tools';panel.style.cssText='margin:20px;padding:18px;border:1px solid #9b733e;border-radius:12px';
 panel.innerHTML='<summary>✧ ИИ-помощник мастера</summary><p>Локальная модель Ollama. В запрос попадают только выбранные ниже данные; заметки берутся из сохранённой версии.</p><label>Модель <select id="ai-model"></select></label> <button id="ai-refresh">Обновить модели</button><p><label><input type="checkbox" id="ai-notes"> Заметки кампании и текущей сцены</label></p><p><label><input type="checkbox" id="ai-characters"> Персонажи и здоровье</label></p><label for="ai-question">Вопрос</label><textarea id="ai-question" rows="4" maxlength="12000" style="display:block;width:100%;box-sizing:border-box" placeholder="Например: предложи три слуха для таверны"></textarea><button id="ai-ask">Спросить</button><p id="ai-status" role="status"></p><div id="ai-answer" style="white-space:pre-wrap;overflow-wrap:anywhere"></div>';
 document.body.append(panel);
 const find=id=>panel.querySelector('#ai-'+id),status=find('status');
 async function models(){status.textContent='Подключение к Ollama…';try{const r=await fetch('/api/assistant/models');const data=await r.json();if(!r.ok)throw Error(data.error);find('model').replaceChildren(...data.models.map(name=>new Option(name,name)));status.textContent=data.models.length?'Готов к вопросам':'В Ollama пока нет моделей. Установите модель и обновите список.';}catch(e){status.textContent=e.message;}}
 find('refresh').onclick=models;let initialized=false;panel.addEventListener('toggle',()=>{if(panel.open&&!initialized){initialized=true;models();}});
 find('ask').onclick=async()=>{
  if(!find('model').value || !find('question').value.trim()){status.textContent='Выберите модель и введите вопрос.';return;}
  find('ask').disabled=true;status.textContent='Модель готовит ответ…';
  try{const r=await fetch('/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:find('model').value,question:find('question').value,includeNotes:find('notes').checked,includeCharacters:find('characters').checked,sceneId:window.notesCurrentSceneId || ''})});const data=await r.json();if(!r.ok)throw Error(data.error);find('answer').textContent=data.answer;status.textContent='Ответ готов';}catch(e){status.textContent=e.message;}finally{find('ask').disabled=false;}
 };
})();

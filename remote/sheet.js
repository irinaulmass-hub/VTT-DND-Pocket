'use strict';
const content = document.querySelector('#content');
const nav = document.querySelector('nav');
const status = document.querySelector('#connection');
let invitation = new URLSearchParams(location.hash.slice(1)).get('invite') || localStorage.getItem('player-invitation');
if (invitation) {
  localStorage.setItem('player-invitation', invitation);
  history.replaceState(null, '', location.pathname + location.search);
}
let accessRevoked = false;
let position = null, positionReady = false, moving = false, movementError = '';
const directions = { north: 'На север', west: 'На запад', east: 'На восток', south: 'На юг' };
let roster = [], selected = localStorage.getItem('pocket-character') || new URLSearchParams(location.search).get('character'), tab = 'hero', socket;
const stats = {str:'СИЛ',dex:'ЛОВ',con:'ТЕЛ',int:'ИНТ',wis:'МДР',cha:'ХАР'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value, fallback=0) => Number.isFinite(Number(value)) && value != null ? Number(value) : fallback;
const signed = n => n >= 0 ? '+' + n : String(n);
const mod = (ch,key) => Math.floor((number(ch.stats?.[key],10)-10)/2) + number(ch.modifiers?.[key]);
const safeImage = value => typeof value === 'string' && (/^\/assets\//.test(value) || /^https?:\/\//.test(value)) ? esc(value) : '';
const list = value => Array.isArray(value) ? value : [];
const title = item => typeof item === 'string' ? item : item.name || 'Без названия';
const effects = ch => [...list(ch.conditions),...list(ch.effects)];
function rows(items, kind) {
  if (!items.length) return '<p class="empty">Пока ничего нет. Мастер добавит это во время игры.</p>';
  return items.map((item,index) => {
    const obj = typeof item === 'string' ? {name:item} : item;
    const uses = obj.maxUses != null ? `${obj.remaining ?? Math.max(0,number(obj.maxUses)-number(obj.used))}/${obj.maxUses}` : '';
    return `<button class="row" data-detail="${kind}" data-index="${index}">${safeImage(obj.image)?`<img src="${safeImage(obj.image)}" alt="">`:''}<span class="description"><strong>${esc(title(obj))}</strong><small>${esc(obj.summary || obj.recovery || obj.type || '')}</small></span><span class="badge">${esc(kind==='inventory' ? '× '+number(obj.quantity,1) : kind==='combat' ? `${obj.attackBonus != null ? signed(number(obj.attackBonus)) : '—'} • ${obj.damage || '—'}` : uses)} ›</span></button>`;
  }).join('');
}
function renderTravel() {
  let locationText = 'Мастер ещё не задал позицию героя.';
  if (position) locationText = 'Клетка (' + position.x + ', ' + position.y + ')';
  else if (!positionReady) locationText = 'Получаем позицию героя…';
  const disabled = !position || !positionReady || moving;
  content.innerHTML = `<h2>Путь героя</h2>
    <p role="status">${esc(locationText)}</p>
    <div class="travel-controls" role="group" aria-label="Шаг на соседнюю клетку">
      ${Object.entries(directions).map(([direction, label]) =>
        `<button class="choose" data-move="${direction}" ${disabled ? 'disabled' : ''}>${label}</button>`).join('')}
    </div>
    <p class="muted" role="status">${esc(movementError)}</p>`;
}

function showPosition(next) {
  if (next && position && next.revision < position.revision) return;
  position = next;
}

async function moveHero(direction) {
  if (!position || !positionReady || moving || accessRevoked) return;
  moving = true;
  movementError = '';
  renderTravel();
  try {
    const response = await fetch('/api/player-position/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + invitation },
      body: JSON.stringify({ direction, revision: position.revision }),
    });
    const data = await response.json();
    if (accessRevoked) return;
    if (Object.hasOwn(data, 'position')) showPosition(data.position);
    if (!response.ok) movementError = data.error || 'Не удалось сделать шаг';
  } catch {
    if (!accessRevoked) movementError = 'Связь прервалась. Проверьте позицию перед следующим шагом.';
  } finally {
    moving = false;
    if (!accessRevoked && tab === 'travel') render();
  }
}

function render() {
  const ch = roster.find(c=>c.id===selected);
  nav.hidden = !ch;
  if (!ch) {
    content.innerHTML = '<h1>Приглашение мастера</h1><p>Откройте ссылку, которую мастер создал для вашего героя.</p>';
    return;
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));
  const abilities = [...list(ch.abilities),...list(ch.spells),...list(ch.resources)];
  if (tab==='hero') {
    const hp=number(ch.hp), maxHp=number(ch.maxHp,10), eclipse=number(ch.eclipse), maxEclipse=number(ch.maxEclipse,10);
    content.innerHTML=`<div class="identity">${safeImage(ch.portrait)?`<img class="portrait" src="${safeImage(ch.portrait)}" alt="Портрет ${esc(ch.name)}">`:`<div class="portrait" aria-hidden="true">${esc(ch.name?.[0] || '✦')}</div>`}<div><span class="eyebrow">Личный лист персонажа</span><h1>${esc(ch.name)}</h1><span class="muted">${esc(ch.cls)} · уровень ${esc(ch.level??1)} · опыт ${esc(ch.xp??0)}</span></div></div><div class="trackers"><div class="tracker hp"><label>Здоровье · HP</label><small>Временные HP: ${esc(ch.tempHp??0)}</small><b>${hp}<small> / ${maxHp}</small></b><div class="bar"><i style="width:${Math.max(0,Math.min(100,hp/Math.max(1,maxHp)*100))}%"></i></div></div><div class="tracker"><label>☾ Затмение</label><b>${eclipse}<small> / ${maxEclipse}</small></b><div class="bar"><i style="width:${Math.max(0,Math.min(100,eclipse/Math.max(1,maxEclipse)*100))}%"></i></div></div></div><div class="metrics">${[[ch.ac??10,'Класс доспеха'],[signed(number(ch.initiative,mod(ch,'dex'))),'Инициатива'],[ch.speed??30,'Скорость · футы'],[ch.passivePerception??10+mod(ch,'wis'),'Восприятие']].map(([v,l])=>`<div class="metric"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div><p class="eyebrow">Текущие эффекты</p><div class="chips">${effects(ch).length?effects(ch).map(e=>`<span class="chip">${esc(title(e))}</span>`).join(''):'<span class="muted">Нет активных эффектов</span>'}</div><p class="eyebrow">Характеристики</p><div class="stats">${Object.entries(stats).map(([k,l])=>`<div class="stat"><span>${l}</span><b>${esc(ch.stats?.[k]??10)}</b><small>${signed(mod(ch,k))}</small></div>`).join('')}</div><button class="switch" data-switch>Выйти из приглашения</button>`;
  } else if (tab==='travel') {
    renderTravel();
  } else if (tab==='inventory') {
    const money = typeof ch.money === 'object' && ch.money ? Object.entries(ch.money).map(([k,v])=>`${v} ${k}`).join(' · ') : ch.money ?? 0;
    content.innerHTML=`<p class="eyebrow">Всё для приключения</p><h2>Инвентарь</h2><button class="choose" data-open-loot>Сундуки и добыча</button><div class="money">Монеты · ${esc(money)}</div>${rows(list(ch.inventory),'inventory')}`;
  } else if (tab==='abilities') {
    const slots = Object.entries(ch.spellSlots || {}).filter(([,s])=>number(s.max)>0);
    content.innerHTML=`<p class="eyebrow">Ваши возможности</p><h2>Умения и магия</h2>${slots.length?'<h3>Ячейки заклинаний</h3><div class="chips">'+slots.map(([l,s])=>`<span class="chip">${esc(l)} ур. · ${Math.max(0,number(s.max)-number(s.used))}/${esc(s.max)}</span>`).join('')+'</div>':''}${rows(abilities,'abilities')}`;
  } else {
    content.innerHTML=`<p class="eyebrow">Под рукой в свой ход</p><h2>Боевая памятка</h2><h3>Оружие и атаки</h3>${rows(list(ch.attacks),'combat')}<h3>Основные действия</h3><div class="chips">${(list(ch.actions).length?ch.actions:['Атака','Рывок','Отход','Уклонение','Помощь','Подготовка']).map(a=>`<span class="chip">${esc(title(a))}</span>`).join('')}</div><h3>Спасброски</h3><div class="stats">${Object.entries(stats).map(([k,l])=>`<div class="stat"><span>${l}</span><b>${signed(number(ch.saves?.[k],mod(ch,k)))}</b></div>`).join('')}</div><h3>Состояния</h3><div class="chips">${effects(ch).length?effects(ch).map(e=>`<span class="chip">${esc(title(e))}</span>`).join(''):'<span class="muted">Нет активных состояний</span>'}</div>`;
  }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.move)moveHero(b.dataset.move);
  if(b.hasAttribute('data-open-loot'))window.openLoot();
  if(b.dataset.character){selected=b.dataset.character;localStorage.setItem('pocket-character',selected);render();}
  if(b.hasAttribute('data-switch')){localStorage.removeItem('player-invitation');location.reload();}
  if(b.dataset.tab){tab=b.dataset.tab;render();window.scrollTo(0,0);}
  if(b.dataset.detail){
    const ch=roster.find(c=>c.id===selected); if(!ch)return;
    const items=b.dataset.detail==='inventory'?list(ch.inventory):b.dataset.detail==='combat'?list(ch.attacks):[...list(ch.abilities),...list(ch.spells),...list(ch.resources)];
    const item=items[Number(b.dataset.index)]; if(!item)return;
    document.querySelector('#detail-content').innerHTML=`${safeImage(item.image)?`<img src="${safeImage(item.image)}" alt="">`:''}<h2>${esc(title(item))}</h2><p class="details-text">${esc(item.description || item.summary || 'Описание пока не добавлено.')}</p>${item.properties?`<p class="details-text">${esc(item.properties)}</p>`:''}${item.rarity?`<p>Редкость: ${esc(window.LootUI?.rarities[item.rarity]?.[0] || item.rarity)}</p>`:''}${item.quantity!=null?`<p>Количество: ${esc(item.quantity)}</p>`:''}${item.recovery?`<p class="muted">Восстановление: ${esc(item.recovery)}</p>`:''}`;
    document.querySelector('#detail').showModal();
  }
});
document.querySelector('#close-detail').onclick=()=>document.querySelector('#detail').close();
function connect(){
  if (!invitation || accessRevoked) { status.textContent='Ожидание приглашения'; return; }
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  socket.onopen=()=>{status.textContent='● На связи';socket.send(JSON.stringify({action:'player-auth',token:invitation}));};
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ACCESS_REVOKED') {
      accessRevoked = true;
      roster = [];
      selected = null;
      position = null;
      positionReady = false;
      localStorage.removeItem('player-invitation');
      document.querySelector('#detail').close();
      render();
      return;
    }
    if (accessRevoked) return;
    if (msg.type === 'LOOT_CHANGED') window.dispatchEvent(new Event('loot-changed'));
    if (msg.type === 'CHARACTERS_UPDATE') {
      roster = msg.characters || [];
      selected = roster[0]?.id;
      render();
    }
    if (msg.type === 'CHARACTER_POSITION' && msg.characterId === selected) {
      showPosition(msg.position);
      positionReady = true;
      if (tab === 'travel') render();
    }
    if (msg.type === 'ping') socket.send(JSON.stringify({ action: 'pong' }));
  };
  socket.onclose = () => {
    positionReady = false;
    if (accessRevoked) {
      status.textContent = 'Доступ отозван';
      return;
    }
    status.textContent = '○ Переподключение…';
    if (tab === 'travel') render();
    setTimeout(connect, 2000);
  };
  socket.onerror=()=>socket.close();
}
render();connect();

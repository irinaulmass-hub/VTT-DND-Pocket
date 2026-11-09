'use strict';

(() => {
  const { terrain, props, get, set } = window.WorldMap;
  const { request } = window.LootUI;
  const editor = document.createElement('section');
  editor.className = 'book-widget book-world-editor';
  editor.id = 'world-map-editor';
  const extraGroups = Object.entries(window.WorldMap.propGroups)
    .map(([title, ids]) => [title, ids.filter(id => !['house','tavern','bridge','tree','bush','wall','door'].includes(id))]);
  const tileButton = ([id, [label]]) => `<button class="book-button" data-tool="${id}"><canvas width="24" height="24" aria-hidden="true"></canvas>${label}</button>`;
  editor.innerHTML = `
    <div class="book-widget-body">
      <h2>Большая карта мира</h2>
      <form class="book-toolbar" data-world-create>
        <input class="book-select" name="title" required maxlength="80" placeholder="Название карты" aria-label="Название карты мира">
        <label><input type="checkbox" name="sample"> Начать с деревни у озера</label>
        <button class="book-button primary">Создать карту мира</button>
      </form>
      <div class="book-toolbar">
        <select class="book-select" data-world-select aria-label="Открыть черновик карты"></select>
      </div>
      <div data-world-editor hidden>
        <p>Выбери тайл и нажми на клетку. Колёсико меняет масштаб, правая кнопка сдвигает карту.</p>
        <div class="world-palette" role="group" aria-label="Местность">
          <strong>Местность</strong>
          ${Object.entries(terrain).map(tileButton).join('')}
        </div>
        <div class="world-palette" role="group" aria-label="Основные объекты">
          <strong>Основные объекты</strong>
          ${['house','tavern','bridge','tree','bush','wall','door'].map(id => tileButton([id, props[id]])).join('')}
        </div>
        <details class="world-extra-palette">
          <summary>Библиотека дополнительных объектов</summary>
          ${extraGroups.map(([title, ids]) => `<div class="world-palette" role="group" aria-label="${title}">
            <strong>${title}</strong>${ids.map(id => tileButton([id, props[id]])).join('')}
          </div>`).join('')}
        </details>
        <div class="book-toolbar">
          <button class="book-button" data-tool="pan">Рука</button>
          <button class="book-button" data-tool="erase">Убрать тайл</button>
          <button class="book-button" data-tool="select">Двигать объекты</button>
          <button class="book-button" data-tool="delete-object">Удалять объекты</button>
          <label><input type="checkbox" data-world-rect> Заполнить прямоугольник</label>
          <button class="book-button" data-world-undo>Отменить</button>
          <button class="book-button" data-world-redo>Повторить</button>
        </div>
        <div class="book-toolbar" data-world-object hidden>
          <span data-world-size></span>
          <button class="book-button" data-world-turn>Повернуть</button>
          <button class="book-button" data-world-delete>Удалить выбранный</button>
          <label><input type="checkbox" data-world-secret> Видно только мастеру</label>
        </div>
        <div class="book-toolbar">
          <select class="book-select" data-world-position-hero aria-label="Герой для личной позиции"></select>
          <button class="book-button" data-tool="position">Поставить или перенести героя</button>
          <small data-world-position-info role="status"></small>
        </div>
        <canvas class="world-canvas" data-world-canvas tabindex="0" aria-label="Редактор карты мира"></canvas>
        <div class="book-toolbar">
          <button class="book-button" data-world-save>Сохранить черновик</button>
          <label><input type="checkbox" data-world-fog checked> Туман на экране игроков</label>
          <button class="book-button primary" data-world-publish>Показать игрокам</button>
        </div>
      </div>
      <p class="book-status" data-world-status role="status"></p>
    </div>`;
  document.getElementById('book-content-maps').prepend(editor);
  if (location.hash === '#world-map-editor') requestAnimationFrame(() => editor.scrollIntoView());
  function drawPalette() {
    editor.querySelectorAll('.world-palette [data-tool]').forEach(button => createWorldView.preview(button.querySelector('canvas'), button.dataset.tool));
  }
  drawPalette();
  window.addEventListener('world-sprites-ready', drawPalette);
  const e = name => editor.querySelector('[data-world-' + name + ']');
  const status = text => { e('status').textContent = text; };
  const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let draft, tool = 'grass', first, selected, dirty = false, busy = false;
  const undo = [], redo = [];

  function paint() {
    if (!draft) return;
    editorView.data(draft);
    const object = draft.objects.find(item => item.id === selected);
    e('object').hidden = !object;
    if (object) {
      const { width, height } = window.WorldMap.footprint(object);
      e('size').textContent = props[object.kind][0] + ' · ' + width + ' × ' + height + ' кл.';
    }
    e('secret').checked = !!object?.hidden;
    e('undo').disabled = !undo.length;
    e('redo').disabled = !redo.length;
    editor.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
  }
  function apply(change, backwards = false) {
    if (change.objects) draft.objects = backwards ? change.before : change.after;
    else for (const tile of change.tiles) set(draft.chunks, tile.x, tile.y, backwards ? tile.before : tile.after);
    dirty = true;
    status('Есть несохранённые изменения');
    paint();
  }
  function edit(change) {
    undo.push(change);
    if (undo.length > 50) undo.shift();
    redo.length = 0;
    apply(change);
  }
  function objects(after) { edit({ objects: true, before: draft.objects, after }); }
  function updateSelected(patch) {
    if (!draft || busy || !draft.objects.some(item => item.id === selected)) return;
    objects(draft.objects.map(item => item.id === selected ? { ...item, ...patch } : item));
  }
  function objectAt(x, y) {
    return [...draft.objects].reverse().find(item => {
      const bounds = window.WorldMap.footprint(item);
      return x >= bounds.x - bounds.width/2 && x < bounds.x + bounds.width/2 &&
        y >= bounds.y - bounds.height/2 && y < bounds.y + bounds.height/2;
    });
  }
  function removeObject(id) {
    if (!draft || busy || !draft.objects.some(item => item.id === id)) return;
    selected = undefined;
    objects(draft.objects.filter(item => item.id !== id));
    status('Объект удалён. Вернуть его можно кнопкой «Отменить».');
  }
  const positionUrl = id => '/api/character-positions/' + encodeURIComponent(id);
  let positionGeneration = 0;
  function describePosition(position) {
    const place = position.worldId === draft?.id ? '' : 'в другом мире ';
    e('position-info').textContent = 'Личная позиция ' + place + '(' + position.x + ', ' + position.y + ')';
  }
  async function readPosition() {
    const generation = ++positionGeneration;
    const id = e('position-hero').value;
    e('position-info').textContent = '';
    if (!id) return;
    try {
      const { position } = await request(positionUrl(id));
      if (generation !== positionGeneration) return;
      if (position) describePosition(position);
      else e('position-info').textContent = 'Позиция ещё не задана';
    } catch (error) {
      if (generation === positionGeneration) e('position-info').textContent = error.message;
    }
  }
  e('position-hero').onchange = readPosition;
  window.addEventListener('character-position', event => {
    const { characterId, position } = event.detail;
    if (characterId !== e('position-hero').value || !position) return;
    ++positionGeneration;
    describePosition(position);
  });

  function click(x, y, point) {
    if (!draft || busy) return;
    if (tool === 'position') {
      const id = e('position-hero').value;
      if (!id) return status('Выбери героя');
      const generation = ++positionGeneration;
      run(async () => {
        const { position } = await request(positionUrl(id), json('PUT', {
          worldId: draft.id, sceneId: 'overworld', floorId: 'ground', x, y,
        }));
        if (generation === positionGeneration) describePosition(position);
        status('Личная позиция сохранена');
      });
      return;
    }
    if (tool === 'select' || tool === 'delete-object') {
      const item = objectAt(point.x, point.y);
      if (tool === 'delete-object') return removeObject(item?.id);
      selected = item?.id;
      return paint();
    }
    if (props[tool]) {
      selected = crypto.randomUUID?.() || 'object-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const item = { id: selected, kind: tool, x, y, turn: 0 };
      tool = 'select';
      objects([...draft.objects, item]);
      status('Объект поставлен. Перетащи его или нажми Delete, чтобы убрать.');
      return;
    }
    if (!terrain[tool] && tool !== 'erase') return;
    if (e('rect').checked && !first) {
      first = { x, y };
      status('Выбери противоположный угол');
      return paint();
    }
    const start = first || { x, y };
    first = null;
    const left = Math.min(start.x, x), right = Math.max(start.x, x);
    const top = Math.min(start.y, y), bottom = Math.max(start.y, y);
    if ((right - left + 1) * (bottom - top + 1) > 16384) { paint(); return status('Выдели участок не больше 16 384 клеток за один раз'); }
    const after = tool === 'erase' ? undefined : tool;
    const tiles = [];
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const before = get(draft.chunks, col, row);
      if (before !== after) tiles.push({ x: col, y: row, before, after });
    }
    if (tiles.length) edit({ tiles });
    else paint();
  }
  const editorView = createWorldView(e('canvas'), {
    grid: true, click, pan: () => tool === 'pan', selected: () => selected, mark: () => first,
    pickProp(x, y) {
      if (!draft || busy || tool !== 'select') return;
      const item = objectAt(x, y);
      selected = item?.id;
      paint();
      return item;
    },
    moveProp(item, x, y) {
      if (tool !== 'select' || item.id !== selected) return;
      updateSelected({ x, y });
    },
  });
  e('canvas').addEventListener('keydown', event => {
    if (event.key === 'Delete' && tool === 'select' && selected) {
      event.preventDefault();
      removeObject(selected);
    }
  });

  function open(data) {
    draft = data;
    dirty = false;
    first = selected = undefined;
    undo.length = redo.length = 0;
    e('editor').hidden = false;
    readPosition();
    editorView.setCamera({ x: 0, y: 0, scale: 24 });
    paint();
    status('Открыт черновик «' + data.name + '»');
  }
  async function list() {
    const { worlds } = await request('/api/worlds');
    e('select').replaceChildren(new Option('Открыть сохранённый черновик', ''), ...worlds.map(item => new Option(item.name, item.id)));
    e('select').value = draft?.id || '';
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    try { await task(); }
    catch (error) { status(error.message); }
    finally { busy = false; }
  }
  e('create').onsubmit = event => {
    event.preventDefault();
    if (dirty && !confirm('Открыть новую карту без сохранения правок текущей?')) return;
    run(async () => {
      const form = event.target.elements;
      open(await request('/api/worlds', json('POST', { name: form.title.value, sample: form.sample.checked })));
      await list();
      event.target.reset();
    });
  };
  e('select').onchange = () => {
    const id = e('select').value;
    if (!id) return;
    if (dirty && !confirm('Открыть другую карту без сохранения текущих правок?')) { e('select').value = draft.id; return; }
    run(async () => open(await request('/api/worlds/' + encodeURIComponent(id))));
  };
  editor.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => {
    tool = button.dataset.tool;
    if (tool === 'position') status('Выбери героя и нажми на клетку, чтобы перенести его');
    first = undefined;
    paint();
    if (tool === 'select') status('Перетащи объект мышью. Щёлкни по нему, чтобы выделить.');
    if (tool === 'delete-object') status('Щёлкни по объекту, который хочешь убрать.');
  });
  e('rect').onchange = () => { first = undefined; paint(); };
  e('undo').onclick = () => { if (!busy && undo.length) { const change = undo.pop(); redo.push(change); apply(change, true); } };
  e('redo').onclick = () => { if (!busy && redo.length) { const change = redo.pop(); undo.push(change); apply(change); } };
  e('turn').onclick = () => { const item = draft.objects.find(prop => prop.id === selected); if (item) updateSelected({ turn: (item.turn + 1) % 4 }); };
  e('delete').onclick = () => removeObject(selected);
  e('secret').onchange = () => updateSelected({ hidden: e('secret').checked });
  async function save() {
    if (!dirty) return;
    draft = await request('/api/worlds/' + draft.id, json('PUT', draft));
    dirty = false;
    paint();
  }
  e('save').onclick = () => run(async () => { await save(); status('Черновик сохранён'); });
  e('publish').onclick = () => run(async () => {
    await save();
    await request('/api/worlds/' + draft.id + '/publish', json('POST', { revision: draft.revision, fog: e('fog').checked }));
    await sync();
    status('Карта опубликована. Открой «Карту игроков» для второго монитора.');
  });
  window.addEventListener('book-section-change', event => { if (event.detail === 'maps') run(list); });
  if (document.body.dataset.bookView === 'maps') run(list);

  const panel = document.createElement('div');
  panel.className = 'world-live-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="book-toolbar">
      <strong data-live-title></strong>
      <button class="book-button small" data-live-party>К партии</button>
      <button class="book-button small" data-live-frame>Показать этот участок</button>
      <button class="book-button small" data-live-close>Вернуться к сценам</button>
    </div>
    <div class="book-toolbar">
      <select class="book-select" data-live-hero aria-label="Жетон героя"></select>
      <button class="book-button small" data-live-reveal>Открыть участок</button>
      <label><input type="checkbox" data-live-expand> Развернуть карту</label>
    </div>
    <canvas class="world-canvas" data-live-canvas aria-label="Большая карта мастера без тумана"></canvas>
    <p class="book-status" data-live-status role="status">Колёсико приближает карту. Жетоны можно перетаскивать.</p>`;
  const mapSection = document.getElementById('section-map-control');
  mapSection.append(panel);
  const p = name => panel.querySelector('[data-live-' + name + ']');
  let live, reveal = false, liveGeneration = 0;
  const liveView = createWorldView(p('canvas'), {
    pan: () => !reveal && !p('hero').value,
    click(x, y) {
      if (reveal) {
        reveal = false;
        p('reveal').setAttribute('aria-pressed', 'false');
        change('reveal', x, y);
      } else if (p('hero').value) {
        const id = p('hero').value;
        p('hero').value = '';
        change('token', x, y, { characterId: id });
      }
    },
    moveToken: (token, x, y) => change('token', x, y, { characterId: token.id }),
  });
  function heroes() {
    for (const [select, placeholder] of [
      [p('hero'), 'Поставить жетон героя'],
      [e('position-hero'), 'Герой для личной позиции'],
    ]) {
      const value = select.value;
      select.replaceChildren(new Option(placeholder, ''), ...characterRoster.map(hero => new Option(hero.name, hero.id)));
      if (characterRoster.some(hero => hero.id === value)) select.value = value;
      else if (value && select === e('position-hero')) readPosition();
    }
  }
  heroes();
  new MutationObserver(heroes).observe(document.getElementById('party-list-container'), { childList: true, subtree: true });
  async function sync() {
    const generation = ++liveGeneration;
    try {
      const version = live ? '?version=' + encodeURIComponent(live.map.id + ':' + live.map.revision) : '';
      const next = await request('/api/worlds/live' + version);
      if (generation !== liveGeneration) return;
      const changed = next?.map.id !== live?.map.id;
      if (next && !next.map.chunks && live) next.map = live.map;
      live = next;
      panel.hidden = !live;
      mapSection.toggleAttribute('data-world-playing', !!live);
      if (!live) return;
      p('title').textContent = live.map.name;
      liveView.data({ ...live.map, tokens: live.tokens });
      if (changed) liveView.party();
      heroes();
    } catch (error) { p('status').textContent = error.message; }
  }
  async function change(action, x, y, extra = {}) {
    if (!live) return;
    const id = live.map.id;
    try {
      const result = await request('/api/worlds/live/change', json('POST', { id, action, x, y, ...extra }));
      if (live?.map.id === id && result.revision >= live.revision) {
        Object.assign(live, result);
        liveView.data({ ...live.map, tokens: live.tokens });
      }
      p('status').textContent = action === 'frame' ? 'Кадр отправлен на второй экран' : 'Состояние карты сохранено';
    } catch (error) { p('status').textContent = error.message; }
  }
  p('party').onclick = liveView.party;
  p('frame').onclick = () => {
    const { x, y, scale } = liveView.camera();
    change('frame', Math.floor(x), Math.floor(y), { scale });
  };
  p('close').onclick = async () => {
    try { await request('/api/worlds/live/hide', { method: 'POST' }); await sync(); }
    catch (error) { p('status').textContent = error.message; }
  };
  p('reveal').onclick = () => {
    reveal = !reveal;
    p('reveal').setAttribute('aria-pressed', String(reveal));
    p('status').textContent = reveal ? 'Нажми на участок, который нужно открыть игрокам' : '';
  };
  p('expand').onchange = () => panel.classList.toggle('world-expanded', p('expand').checked);
  window.addEventListener('world-update', sync);
  sync();
})();

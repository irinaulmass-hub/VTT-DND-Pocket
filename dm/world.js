'use strict';

(() => {
  const { terrain, props, get, set, sceneScope, locationMapId, buildingKinds, cellBounds } = window.WorldMap;
  const { generationChange, protectManualChanges, maxPathPoints, maxForestPoints, validTemplate } = window.WorldGenerators;
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
        <select class="book-select" name="parentMap" aria-label="Тип и расположение новой карты"></select>
        <label data-world-elevation hidden>Номер этажа <input class="book-select" type="number" name="elevation" step="1" disabled></label>
        <label><input type="checkbox" name="sample"> Начать с деревни у озера</label>
        <button class="book-button primary">Создать карту</button>
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
          <button class="book-button" data-tool="generate-path">Path · Дорога или река</button>
          <button class="book-button" data-tool="generate-forest">Forest Plot · Лес</button>
          <button class="book-button" data-tool="generate-room">Room · Комната</button>
          <button class="book-button" data-tool="generate-district">District Plot · Район</button>
          <button class="book-button" data-tool="erase">Убрать тайл</button>
          <button class="book-button" data-tool="select">Двигать объекты</button>
          <button class="book-button" data-tool="delete-object">Удалять объекты</button>
          <label><input type="checkbox" data-world-rect> Заполнить прямоугольник</label>
          <button class="book-button" data-world-undo>Отменить</button>
          <button class="book-button" data-world-redo>Повторить</button>
        </div>
        <section data-world-path hidden aria-label="Параметры генератора">
          <div class="book-toolbar">
            <select class="book-select" data-world-path-saved aria-label="Сохранённый рецепт"></select>
            <label data-world-path-terrain-label>Покрытие <select class="book-select" data-world-path-terrain>
              <option value="path">Дорога</option><option value="water">Река</option>
            </select></label>
            <label data-world-path-width-label>Ширина <select class="book-select" data-world-path-width>
              ${[1, 3, 5, 7, 9, 11, 13, 15].map(width => `<option value="${width}">${width} кл.</option>`).join('')}
            </select></label>
            <label data-world-forest-density-label hidden>Плотность <input class="book-select" type="number" min="10" max="100" step="1" value="65" data-world-forest-density> %</label>
            <label data-world-district-count-label hidden>Домов <input class="book-select" type="number" min="1" max="24" step="1" value="8" data-world-district-count></label>
            <label data-world-room-floor-label hidden>Пол <select class="book-select" data-world-room-floor>
              <option value="wood">Доски</option><option value="stone">Камень</option><option value="caveFloor">Пещерный пол</option>
            </select></label>
            <button class="book-button" data-world-room-entrance hidden>Выбрать вход</button>
            <small data-world-room-entry-info hidden></small>
            <label>Seed <input class="book-select" type="number" min="0" max="4294967295" step="1" value="0" data-world-path-seed></label>
          </div>
          <div class="book-toolbar" data-world-templates>
            <select class="book-select" data-world-template-select aria-label="Шаблон настроек"></select>
            <button class="book-button" data-world-template-load disabled>Загрузить настройки</button>
            <input class="book-select" data-world-template-name maxlength="80" placeholder="Название шаблона" aria-label="Название шаблона">
            <button class="book-button" data-world-template-save>Сохранить настройки</button>
          </div>
          <div class="book-toolbar">
            <small data-world-path-count></small>
            <button class="book-button" data-world-path-preview>Предпросмотр</button>
            <button class="book-button primary" data-world-path-apply>Применить к черновику</button>
            <button class="book-button" data-world-path-clear-points>Изменить точки</button>
            <button class="book-button" data-world-path-reset>Новый участок</button>
          </div>
        </section>
        <div class="book-toolbar" data-world-object hidden>
          <span data-world-size></span>
          <button class="book-button" data-world-turn>Повернуть</button>
          <button class="book-button" data-world-delete>Удалить выбранный</button>
          <button class="book-button" data-world-building-link hidden>Связать с интерьером</button>
          <label><input type="checkbox" data-world-secret> Видно только мастеру</label>
        </div>
        <div class="book-toolbar">
          <select class="book-select" data-world-position-hero aria-label="Герой для личной позиции"></select>
          <button class="book-button" data-tool="position">Поставить или перенести героя</button>
          <small data-world-position-info role="status"></small>
        </div>
        <canvas class="world-canvas" data-world-canvas tabindex="0" aria-label="Редактор карты мира"></canvas>
        <details data-world-transitions>
          <summary>Переходы между сценами</summary>
          <form class="book-toolbar" data-world-transition-form aria-label="Связь между картами">
            <select class="book-select" data-world-transition-building aria-label="Постройка для входа"></select>
            <button class="book-button" type="button" data-tool="transition">Указать клетку на карте</button>
            <label>X <input class="book-select" type="number" name="x" required></label>
            <label>Y <input class="book-select" type="number" name="y" required></label>
            <select class="book-select" name="toMapId" aria-label="Карта назначения" required></select>
            <label>X назначения <input class="book-select" type="number" name="toX" required></label>
            <label>Y назначения <input class="book-select" type="number" name="toY" required></label>
            <button class="book-button" data-world-transition-submit>Сохранить переход</button>
          </form>
          <ul data-world-transition-list></ul>
        </details>
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
  let availableMaps = [];
  let generatorPoints = [], generatorPreview = null, roomEntrance = null, pickingEntrance = false;
  let templates = { revision: 0, templates: [] }, templatesReady = false, templateGeneration = 0;
  const templateUrl = '/api/world-generator-templates';
  const generatorKind = () => tool === 'generate-district' ? 'district' : tool === 'generate-room' ? 'room' : tool === 'generate-forest' ? 'forest' : 'path';
  const generatorTool = () => ['generate-path', 'generate-forest', 'generate-room', 'generate-district'].includes(tool);

  function paintGeneratorControls() {
    e('path').hidden = !generatorTool();
    if (e('path').hidden) return;
    const kind = generatorKind();
    paintTemplates();
    e('path-terrain-label').hidden = e('path-width-label').hidden = kind !== 'path';
    e('room-floor-label').hidden = e('room-entrance').hidden = e('room-entry-info').hidden = kind !== 'room';
    e('templates').hidden = kind === 'room' || kind === 'district';
    e('district-count-label').hidden = kind !== 'district';
    e('room-entrance').textContent = pickingEntrance ? 'Нажми на клетку входа…' : 'Выбрать вход';
    e('room-entry-info').textContent = roomEntrance ? 'Вход: ' + roomEntrance.x + ', ' + roomEntrance.y : 'Вход не выбран';
    e('forest-density-label').hidden = kind !== 'forest';
    const saved = e('path-saved');
    const selectedId = saved.value;
    const recipes = (draft.generators || []).filter(recipe => recipe.kind === kind && recipe.version === 1);
    saved.replaceChildren(new Option(kind === 'district' ? 'Новый район' : kind === 'room' ? 'Новая комната' : kind === 'forest' ? 'Новый лесной участок' : 'Новая линия', ''), ...recipes.map((recipe, index) =>
      new Option((kind === 'district' ? 'Район' : kind === 'room' ? 'Комната' : kind === 'forest' ? 'Лес' : recipe.params.terrain === 'path' ? 'Дорога' : 'Река') + ' · ' + (index + 1) +
        ' · seed ' + recipe.seed, recipe.id)));
    if (recipes.some(recipe => recipe.id === selectedId)) saved.value = selectedId;
    e('path-count').textContent = kind === 'district' ? 'Углы района: ' + (generatorPoints.length === 4 ? 2 : generatorPoints.length) + ' / 2' : 'Опорных точек: ' + generatorPoints.length;
    e('path-preview').disabled = busy || generatorPoints.length < (kind === 'room' || kind === 'district' ? 4 : kind === 'path' ? 2 : 3) || (kind === 'room' && !roomEntrance);
    e('path-apply').disabled = busy || !generatorPreview;
    e('path-apply').textContent = kind === 'district' ? 'Применить и сохранить район' : saved.value ? 'Применить регенерацию' : 'Применить к черновику';
  }

  function generatorSettings() {
    const kind = generatorKind();
    return { kind, version: 1, seed: e('path-seed').valueAsNumber, settings: kind === 'forest' ?
      { density: e('forest-density').valueAsNumber } :
      { terrain: e('path-terrain').value, width: Number(e('path-width').value) } };
  }

  function paintTemplates() {
    const select = e('template-select');
    const value = select.value;
    const items = templates.templates.filter(item => item.kind === generatorKind());
    select.replaceChildren(new Option(templatesReady ? 'Выбрать шаблон настроек' : 'Получаем шаблоны…', ''),
      ...items.map(item => new Option(item.name, item.id)));
    if (items.some(item => item.id === value)) select.value = value;
    e('template-load').disabled = !select.value || busy;
    e('template-save').disabled = !['path', 'forest'].includes(generatorKind()) || !templatesReady || busy;
  }

  async function readTemplates() {
    const generation = ++templateGeneration;
    try {
      const next = await request(templateUrl);
      if (generation !== templateGeneration) return;
      templates = next;
      templatesReady = true;
    } catch (error) {
      if (generation !== templateGeneration) return;
      templatesReady = false;
      status(error.message);
    }
    paintTemplates();
  }

  function clearGeneratorPreview(resetRecipe = false) {
    generatorPreview = null;
    if (resetRecipe) e('path-saved').value = '';
  }

  function previewGenerator() {
    if (!draft || busy || e('path').hidden || e('path-preview').disabled) return;
    generatorPreview = null;
    try {
      const savedId = e('path-saved').value;
      const kind = generatorKind();
      const forest = kind === 'forest';
      const recipe = {
        id: savedId || crypto.randomUUID?.() || 'path-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        kind, version: 1, seed: e('path-seed').valueAsNumber,
        params: kind === 'district' ? { count: e('district-count').valueAsNumber, points: generatorPoints } : kind === 'room' ? { floor: e('room-floor').value, points: generatorPoints, entrance: roomEntrance } : forest ? { density: e('forest-density').valueAsNumber, points: generatorPoints } :
          { terrain: e('path-terrain').value, width: Number(e('path-width').value), points: generatorPoints },
      };
      if (kind === 'district') return run(async () => {
        await save();
        const result = await request('/api/worlds/' + draft.id + '/district-preview', json('POST', { revision: draft.revision, recipe, format: 'delta-v1' }));
        generatorPreview = { ...window.WorldGenerators.expandGenerationChange(result.change, draft),
          districtGuard: result.guard, districtHistory: result.history };
        const xs = generatorPoints.map(point => point.x), ys = generatorPoints.map(point => point.y);
        const width = Math.max(...xs) - Math.min(...xs) + 1, height = Math.max(...ys) - Math.min(...ys) + 1;
        editorView.setCamera({ x: (Math.min(...xs) + Math.max(...xs) + 1) / 2,
          y: (Math.min(...ys) + Math.max(...ys) + 1) / 2,
          scale: Math.min(24, ((e('canvas').clientHeight || 480) - 36) / (height + 2), ((e('canvas').clientWidth || 1000) - 36) / (width + 2)) });
        status('Предпросмотр района · ' + recipe.params.count + ' домов. Связанные дома сохраняются. Применение сохранит район.');
      });
      generatorPreview = generationChange(recipe, draft);
      if (!generatorPreview.count && !savedId) throw new RangeError('В участке нет свободных клеток для генератора');
      status((savedId ? 'Регенерация' : 'Предпросмотр') + ' · ' + generatorPreview.count +
        ' кл. Ручные правки сохраняются. Примени результат к черновику.');
    } catch (error) {
      generatorPreview = null;
      status(error.message);
    }
    paint();
  }

  function paint() {
    if (!draft) return;
    if (generatorPreview) {
      editorView.data({ ...draft, chunks: generatorPreview.chunks, objects: generatorPreview.objects?.after || draft.objects });
    } else editorView.data(draft);
    paintGeneratorControls();
    const object = draft.objects.find(item => item.id === selected);
    e('object').hidden = !object;
    e('building-link').hidden = !object || !buildingKinds.has(object.kind);
    updateBuildings();
    if (object) {
      const { width, height } = window.WorldMap.footprint(object);
      e('size').textContent = props[object.kind][0] + ' · ' + width + ' × ' + height + ' кл.';
    }
    e('secret').checked = !!object?.hidden;
    e('undo').disabled = busy || !undo.length;
    e('redo').disabled = busy || !redo.length;
    for (const name of ['path-saved','path-terrain','path-width','forest-density','district-count','room-floor','path-seed',
      'path-clear-points','path-reset','room-entrance','save','publish','select']) e(name).disabled = busy;
    editor.querySelectorAll('[data-tool]').forEach(button => {
      button.disabled = busy;
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    });
  }
  function apply(change, backwards = false) {
    if (change.objects) draft.objects = backwards ? change.objects.before : change.objects.after;
    for (const tile of change.tiles || []) set(draft.chunks, tile.x, tile.y, backwards ? tile.before : tile.after);
    if (change.generators) draft.generators = backwards ? change.generators.before : change.generators.after;
    generatorPreview = null;
    dirty = true;
    status('Есть несохранённые изменения');
    paint();
  }
  function edit(change) {
    try { if (!change.generators) change = protectManualChanges(draft, change); }
    catch (error) { status(error.message); return; }
    undo.push(change);
    if (undo.length > 50) undo.shift();
    redo.length = 0;
    apply(change);
  }
  function objects(after) { edit({ objects: { before: draft.objects, after } }); }
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
  const transitionForm = e('transition-form');
  const transitionUrl = id => '/api/worlds/' + encodeURIComponent(id) + '/transitions';
  let transitionRevision = null, transitionGeneration = 0;

  function updateBuildings() {
    const select = e('transition-building'), value = select.value;
    const buildings = (draft?.objects || []).filter(item => buildingKinds.has(item.kind));
    select.replaceChildren(new Option('Обычный переход без постройки', ''), ...buildings.map(item =>
      new Option(props[item.kind][0] + ' · ' + item.x + ', ' + item.y, item.id)));
    if (buildings.some(item => item.id === value)) select.value = value;
    e('transition-submit').textContent = select.value ? 'Связать вход и возврат' : 'Сохранить переход';
  }

  function updateDestinations() {
    const select = transitionForm.elements.toMapId;
    const value = select.value;
    const scope = draft && sceneScope(draft);
    const targets = scope ? availableMaps.filter(item =>
      item.id !== draft.id && sceneScope(item).worldId === scope.worldId &&
      (!e('transition-building').value || item.parentWorldId)) : [];
    select.replaceChildren(new Option('Карта назначения', ''), ...targets.map(item => new Option(item.name, item.id)));
    if (targets.some(item => item.id === value)) select.value = value;
  }

  async function showTransitions() {
    const id = draft.id, generation = ++transitionGeneration;
    const { links, revision } = await request(transitionUrl(id));
    if (draft?.id !== id || generation !== transitionGeneration) return;
    transitionRevision = revision;
    const nodes = links.map(link => {
      const item = document.createElement('li');
      const target = locationMapId(link.to);
      const name = availableMaps.find(map => map.id === target)?.name || 'Сцена';
      item.textContent = '(' + link.from.x + ', ' + link.from.y + ') → ' + name +
        ' (' + link.to.x + ', ' + link.to.y + ')' + (link.pairId ? ' · Вход и возврат ' : ' ');
      const button = document.createElement('button');
      button.className = 'book-button small';
      button.textContent = link.pairId ? 'Удалить вход и возврат' : 'Удалить переход';
      button.onclick = () => run(async () => {
        ++transitionGeneration;
        try {
          const query = link.pairId ? '?linksRevision=' + encodeURIComponent(revision) : '';
          await request(transitionUrl(id) + '/' + encodeURIComponent(link.id) + query, { method: 'DELETE' });
        } finally { await showTransitions(); }
      });
      item.append(button);
      if (link.pairId) {
        const visit = document.createElement('button');
        visit.className = 'book-button small';
        visit.textContent = link.building.mapId === id ? 'Открыть интерьер' : 'Открыть наружную карту';
        visit.onclick = () => {
          if (dirty && !confirm('Открыть другую карту без сохранения текущих правок?')) return;
          run(async () => { open(await request('/api/worlds/' + encodeURIComponent(target))); e('select').value = target; });
        };
        item.append(visit);
      }
      return item;
    });
    e('transition-list').replaceChildren(...nodes);
  }

  e('transitions').ontoggle = () => {
    if (e('transitions').open && draft) showTransitions().catch(error => status(error.message));
  };
  transitionForm.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      await save();
      const { x, y, toMapId, toX, toY } = transitionForm.elements;
      const buildingId = e('transition-building').value;
      const body = { x: x.valueAsNumber, y: y.valueAsNumber, toMapId: toMapId.value,
        toX: toX.valueAsNumber, toY: toY.valueAsNumber };
      if (buildingId) {
        if (!transitionRevision) { await showTransitions(); return status('Список переходов обновлён. Повтори привязку.'); }
        const target = await request('/api/worlds/' + encodeURIComponent(toMapId.value));
        Object.assign(body, { buildingId, sourceRevision: draft.revision, targetRevision: target.revision, linksRevision: transitionRevision });
      }
      ++transitionGeneration;
      try {
        const url = buildingId ? '/api/worlds/' + encodeURIComponent(draft.id) + '/building-links' : transitionUrl(draft.id);
        await request(url, json('POST', body));
      } finally { await showTransitions(); }
      status(buildingId ? 'Вход и возврат сохранены. Опубликуй обе карты для путешествия героев.' : 'Переход сохранён');
    });
  };

  e('transition-building').onchange = () => { updateBuildings(); updateDestinations(); };
  e('building-link').onclick = () => {
    if (!draft || busy) return;
    const building = draft.objects.find(item => item.id === selected && buildingKinds.has(item.kind));
    if (!building) return;
    const bounds = cellBounds(building);
    e('transition-building').value = building.id;
    transitionForm.elements.x.value = Math.floor((bounds.left + bounds.right) / 2);
    transitionForm.elements.y.value = bounds.bottom + 1;
    e('transitions').open = true;
    updateBuildings(); updateDestinations();
    showTransitions().catch(error => status(error.message));
    status('Выбери внутреннюю сцену или этаж и проходимую клетку. Вход снаружи можно уточнить на карте.');
  };

  let positionGeneration = 0;
  function describePosition(position) {
    const scope = draft && sceneScope(draft);
    const place = position.worldId === scope?.worldId && position.sceneId === scope?.sceneId && position.floorId === scope?.floorId ? '' : 'на другой карте ';
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
    if (generatorTool()) {
      if (generatorKind() === 'district') {
        if (generatorPoints.length !== 1) {
          generatorPoints = [{ x, y }];
          status('Укажи противоположный угол прямоугольного района.');
        } else {
          const first = generatorPoints[0];
          if (first.x === x || first.y === y) return status('Углы должны задавать прямоугольник с шириной и высотой.');
          generatorPoints = [first, { x, y: first.y }, { x, y }, { x: first.x, y }];
          status('Контур района выбран. Задай число домов и seed, затем нажми «Предпросмотр».');
        }
        clearGeneratorPreview(); paint(); return;
      }
      const forest = generatorKind() !== 'path';
      if (generatorKind() === 'room' && pickingEntrance) {
        roomEntrance = { x, y }; pickingEntrance = false; clearGeneratorPreview();
        status('Вход выбран. Проверь предпросмотр комнаты.'); paint(); return;
      }
      const maxPoints = forest ? maxForestPoints : maxPathPoints;
      const usedPoints = forest ? generatorPoints : generatorPoints.slice(-1);
      if (usedPoints.some(point => point.x === x && point.y === y)) return;
      if (generatorPoints.length >= maxPoints) return status('Допустимо не больше ' + maxPoints + ' опорных точек');
      generatorPoints = [...generatorPoints, { x, y }];
      clearGeneratorPreview();
      status(generatorPoints.length < (forest ? 3 : 2) ? 'Укажи ещё точки на карте.' : 'Добавь ещё точки или нажми «Предпросмотр».');
      paint();
      return;
    }
    if (tool === 'transition') {
      transitionForm.elements.x.value = x;
      transitionForm.elements.y.value = y;
      tool = 'pan';
      status('Клетка перехода выбрана');
      paint();
      return;
    }
    if (tool === 'position') {
      const id = e('position-hero').value;
      if (!id) return status('Выбери героя');
      const generation = ++positionGeneration;
      run(async () => {
        const { position } = await request(positionUrl(id), json('PUT', {
          ...sceneScope(draft), x, y,
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
    grid: true, click, pan: () => tool === 'pan', selected: () => selected,
    marks: () => generatorTool() ? [...generatorPoints, ...(tool === 'generate-room' && roomEntrance ? [roomEntrance] : [])] : first ? [first] : [],
    outline: () => ['generate-forest','generate-room','generate-district'].includes(tool) ? generatorPoints : null,
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
    generatorPoints = [];
    roomEntrance = null; pickingEntrance = false;
    clearGeneratorPreview(true);
    undo.length = redo.length = 0;
    e('editor').hidden = false;
    transitionForm.reset();
    transitionRevision = null; ++transitionGeneration;
    e('transition-building').value = '';
    e('transition-list').replaceChildren();
    updateDestinations();
    if (e('transitions').open) showTransitions().catch(error => status(error.message));
    readPosition();
    editorView.setCamera({ x: 0, y: 0, scale: 24 });
    paint();
    status('Открыт черновик «' + data.name + '»');
  }
  async function list() {
    const { worlds } = await request('/api/worlds');
    availableMaps = worlds;
    e('select').replaceChildren(new Option('Открыть сохранённый черновик', ''),
      ...worlds.map(item => new Option(item.parentSceneId ? 'Этаж ' + item.elevation + ' · ' + item.name :
        item.parentWorldId ? 'Сцена · ' + item.name : item.name, item.id)));
    const select = e('create').elements.parentMap;
    const value = select.value;
    select.replaceChildren(new Option('Новый основной мир', ''),
      ...worlds.filter(item => !item.parentWorldId).map(item => new Option('Сцена в мире «' + item.name + '»', 'world:' + item.id)),
      ...worlds.filter(item => !item.parentSceneId).map(item => new Option('Этаж карты «' + item.name + '»', 'floor:' + item.id)));
    if ([...select.options].some(option => option.value === value)) select.value = value;
    updateElevation();
    updateDestinations();
    e('select').value = draft?.id || '';
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    paint();
    try { await task(); }
    catch (error) { status(error.message); }
    finally { busy = false; paint(); paintTemplates(); }
  }
  function updateElevation() {
    const form = e('create').elements;
    const floor = form.parentMap.value.startsWith('floor:');
    e('elevation').hidden = !floor;
    form.elevation.disabled = !floor;
    form.elevation.required = floor;
  }
  e('create').elements.parentMap.onchange = updateElevation;

  e('create').onsubmit = event => {
    event.preventDefault();
    if (dirty && !confirm('Открыть новую карту без сохранения правок текущей?')) return;
    run(async () => {
      const form = event.target.elements;
      const [type, id] = form.parentMap.value.split(':');
      const creation = { name: form.title.value, sample: form.sample.checked };
      if (type === 'world') creation.parentWorldId = id;
      if (type === 'floor') Object.assign(creation, { sceneMapId: id, elevation: form.elevation.valueAsNumber });
      open(await request('/api/worlds', json('POST', creation)));
      await list();
      event.target.reset();
      updateElevation();
    });
  };
  e('select').onchange = () => {
    if (busy) { e('select').value = draft?.id || ''; return; }
    const id = e('select').value;
    if (!id) return;
    if (dirty && !confirm('Открыть другую карту без сохранения текущих правок?')) { e('select').value = draft.id; return; }
    run(async () => open(await request('/api/worlds/' + encodeURIComponent(id))));
  };
  editor.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => {
    if (busy) return;
    if (tool !== button.dataset.tool) {
      generatorPoints = [];
      roomEntrance = null; pickingEntrance = false;
      clearGeneratorPreview(true);
    }
    tool = button.dataset.tool;
    if (tool === 'generate-room') status('Отметь углы комнаты по порядку, затем выбери вход на прямой стене. Стороны идут по линиям сетки.');
    if (tool === 'generate-district') status('Укажи два противоположных угла района: от 11×11 до 4096 клеток. Затем выбери число домов и seed.');
    if (tool === 'generate-forest') status('Отметь вершины контура леса по порядку и нажми «Предпросмотр».');
    if (tool === 'generate-path') status('Укажи опорные точки на карте и нажми «Предпросмотр».');
    if (tool === 'generate-path' || tool === 'generate-forest') readTemplates();
    if (tool === 'transition') status('Нажми на исходную клетку перехода');
    if (tool === 'position') status('Выбери героя и нажми на клетку, чтобы перенести его');
    first = undefined;
    paint();
    if (tool === 'select') status('Перетащи объект мышью. Щёлкни по нему, чтобы выделить.');
    if (tool === 'delete-object') status('Щёлкни по объекту, который хочешь убрать.');
  });
  e('template-select').onchange = paintTemplates;
  e('template-load').onclick = () => {
    if (!draft || busy) return;
    const template = templates.templates.find(item => item.id === e('template-select').value && item.kind === generatorKind());
    if (!template) return;
    generatorPoints = [];
    roomEntrance = null; pickingEntrance = false;
    clearGeneratorPreview(true);
    e('path-seed').value = String(template.seed);
    if (template.kind === 'forest') e('forest-density').value = String(template.settings.density);
    else {
      e('path-terrain').value = template.settings.terrain;
      e('path-width').value = String(template.settings.width);
    }
    status('Настройки «' + template.name + '» загружены. Укажи точки нового участка.');
    paint();
  };
  e('template-save').onclick = async () => {
    if (!draft || busy || !templatesReady) return;
    const name = e('template-name').value.trim();
    const settings = generatorSettings();
    if (!validTemplate({ id: 'new-template', name, ...settings })) {
      return status('Укажи название, seed и корректные настройки генератора.');
    }
    busy = true;
    ++templateGeneration;
    paintTemplates();
    try {
      const next = await request(templateUrl, json('POST', { revision: templates.revision, name, ...settings }));
      ++templateGeneration;
      templates = next;
      paintTemplates();
      const saved = templates.templates.find(item => item.kind === settings.kind && item.name === name);
      if (generatorKind() === settings.kind && saved) e('template-select').value = saved.id;
      status('Настройки «' + name + '» сохранены в шаблон.');
    } catch (error) {
      await readTemplates();
      status(error.message);
    } finally {
      busy = false;
      paintTemplates();
    }
  };
  e('path-saved').onchange = () => {
    if (!draft || busy) return;
    const recipe = (draft.generators || []).find(item => item.id === e('path-saved').value);
    generatorPoints = recipe?.params.points || [];
    roomEntrance = recipe?.kind === 'room' ? recipe.params.entrance : null; pickingEntrance = false;
    generatorPreview = null;
    if (recipe) {
      if (recipe.kind === 'room') e('room-floor').value = recipe.params.floor;
      else if (recipe.kind === 'district') e('district-count').value = String(recipe.params.count);
      else if (recipe.kind === 'forest') e('forest-density').value = String(recipe.params.density);
      else {
        e('path-terrain').value = recipe.params.terrain;
        e('path-width').value = String(recipe.params.width);
      }
      e('path-seed').value = String(recipe.seed);
      const x = recipe.kind === 'district' ? (Math.min(...generatorPoints.map(p => p.x)) + Math.max(...generatorPoints.map(p => p.x))) / 2 : generatorPoints[0].x;
      const y = recipe.kind === 'district' ? (Math.min(...generatorPoints.map(p => p.y)) + Math.max(...generatorPoints.map(p => p.y))) / 2 : generatorPoints[0].y;
      editorView.setCamera({ ...editorView.camera(), x: x + .5, y: y + .5 });
      status('Рецепт загружен. Нажми «Предпросмотр».');
    }
    paint();
  };
  for (const field of ['path-terrain', 'path-width', 'path-seed', 'forest-density', 'room-floor', 'district-count']) {
    e(field).oninput = () => {
      if (busy) return;
      clearGeneratorPreview();
      if (generatorPoints.length >= 2) status('Нажми «Предпросмотр» для обновлённого участка.');
      paint();
    };
  }
  e('path-clear-points').onclick = () => {
    if (!draft || busy) return;
    generatorPoints = [];
    roomEntrance = null; pickingEntrance = false;
    clearGeneratorPreview();
    status('Укажи новый контур или линию. Сохранённый участок будет перестроен после применения.');
    paint();
  };
  e('path-reset').onclick = () => {
    if (!draft || busy) return;
    generatorPoints = [];
    roomEntrance = null; pickingEntrance = false;
    clearGeneratorPreview(true);
    status('Укажи новые опорные точки на карте.');
    paint();
  };
  e('room-entrance').onclick = () => {
    if (!draft || busy || generatorKind() !== 'room') return;
    pickingEntrance = true; clearGeneratorPreview();
    status('Нажми на клетку входа на прямой стороне контура.'); paint();
  };
  e('path-preview').onclick = previewGenerator;
  const sameDistrictValue = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && sameDistrictValue(a[key], b[key])));
  const sameDistrictSnapshot = (a, b) => sameDistrictValue(a.chunks, b.chunks) &&
    sameDistrictValue(a.generators || [], b.generators || []) && a.objects.length === b.objects.length &&
    a.objects.every((item, index) => ['id','kind','x','y','turn'].every(key => item[key] === b.objects[index][key]) &&
      (item.hidden === true) === (b.objects[index].hidden === true));
  async function districtWrite(source, target, url, options, decode) {
    try {
      const response = await request(url, options);
      const next = decode(response);
      if (draft !== source || next.id !== source.id || next.revision !== source.revision + 1 ||
          !sameDistrictSnapshot(next, target)) throw new Error('Ответ сохранения не совпадает с картой.');
      return next;
    } catch (error) {
      // A response can be lost after the server committed. Never retry a write blindly.
      let current;
      try { current = await request('/api/worlds/' + source.id); }
      catch { throw new Error('Не удалось подтвердить сохранение. Открой карту заново перед продолжением.'); }
      if (draft === source && current.id === source.id && current.revision === source.revision + 1 &&
          sameDistrictSnapshot(current, target)) return current;
      if (current.id !== source.id || current.revision !== source.revision ||
          !sameDistrictSnapshot(current, source)) {
        throw new Error('Карта изменилась. Открой актуальную карту перед продолжением.');
      }
      throw error;
    }
  }
  e('path-apply').onclick = () => {
    if (!draft || busy || !generatorPreview) return;
    if (generatorPreview.districtGuard) {
      const preview = generatorPreview;
      return run(async () => {
        try {
          const source = draft;
          const target = { ...source, chunks: preview.chunks, objects: preview.objects?.after || source.objects,
            generators: preview.generators.after };
          const next = await districtWrite(source, target, '/api/worlds/' + source.id + '/district-apply',
            json('POST', { districtGuard: preview.districtGuard }), response => {
              if (response.id !== source.id || response.baseRevision !== source.revision ||
                  response.revision !== source.revision + 1 || response.change?.format !== 'delta-v1' ||
                  response.history?.before !== preview.districtHistory.before || response.history?.after !== preview.districtHistory.after) {
                throw new Error('Некорректный ответ применения района.');
              }
              const change = window.WorldGenerators.expandGenerationChange(response.change, source);
              return { ...source, revision: response.revision, chunks: change.chunks,
                objects: change.objects?.after || source.objects, generators: change.generators.after };
            });
          undo.push({ tiles: preview.tiles, objects: preview.objects, generators: preview.generators,
            districtId: preview.id, districtHistory: preview.districtHistory, linksRevision: preview.districtGuard.linksRevision });
          if (undo.length > 50) undo.shift();
          redo.length = 0;
          draft = next; dirty = false; generatorPreview = null;
          paint();
          e('path-saved').value = preview.id;
          status('Район сохранён. Отмена и повтор доступны; для ТВ нажми «Показать игрокам».');
        } catch (error) { generatorPreview = null; throw error; }
      });
    }
    const { id, tiles, objects, generators } = generatorPreview;
    if (!tiles.length && !objects && generators.before === generators.after) {
      generatorPreview = null;
      paint();
      return status('Результат уже есть в черновике.');
    }
    edit({ tiles, objects, generators });
    e('path-saved').value = id;
    paint();
  };
  e('rect').onchange = () => { first = undefined; paint(); };
  function history(backwards) {
    const from = backwards ? undo : redo, to = backwards ? redo : undo;
    if (busy || !from.length) return;
    const change = from.at(-1);
    if (!change.districtHistory) { from.pop(); to.push(change); return apply(change, backwards); }
    return run(async () => {
      await save();
      const desiredObjects = (change.objects ? (backwards ? change.objects.before : change.objects.after) : draft.objects)
        .map(item => ({ ...item, hidden: item.hidden === true }));
      const delta = window.WorldGenerators.compactGenerationChange({ id: change.districtId,
        count: (change.tiles || []).length,
        tiles: (change.tiles || []).map(tile => backwards ? { x: tile.x, y: tile.y, before: tile.after, after: tile.before } : tile),
        objects: { before: draft.objects, after: desiredObjects },
        generators: { before: draft.generators || [], after: backwards ? change.generators.before : change.generators.after } });
      const restored = window.WorldGenerators.expandGenerationChange(delta, draft);
      const target = { ...draft, chunks: restored.chunks, objects: restored.objects?.after || draft.objects, generators: restored.generators.after };
      const districtGuard = { revision: draft.revision, linksRevision: change.linksRevision,
        historyProof: change.districtHistory[backwards ? 'before' : 'after'] };
      const source = draft;
      const next = await districtWrite(source, target, '/api/worlds/' + source.id + '/district-history',
        json('POST', { districtGuard, change: delta }), response => {
          if (response.id !== source.id || response.baseRevision !== source.revision || response.revision !== source.revision + 1) {
            throw new Error('Некорректный ответ истории района.');
          }
          return { ...target, revision: response.revision };
        });
      from.pop(); to.push(change); draft = next; dirty = false; generatorPreview = null;
      if (tool === 'generate-district') {
        const recipe = (draft.generators || []).find(item => item.id === change.districtId);
        if (recipe) {
          generatorPoints = recipe.params.points;
          e('district-count').value = String(recipe.params.count); e('path-seed').value = String(recipe.seed);
        }
        paint(); e('path-saved').value = recipe?.id || '';
      }
      status(backwards ? 'Отмена района сохранена.' : 'Повтор района сохранён.');
    });
  }
  e('undo').onclick = () => history(true);
  e('redo').onclick = () => history(false);
  e('turn').onclick = () => { const item = draft.objects.find(prop => prop.id === selected); if (item) updateSelected({ turn: (item.turn + 1) % 4 }); };
  e('delete').onclick = () => removeObject(selected);
  e('secret').onchange = () => updateSelected({ hidden: e('secret').checked });
  async function save() {
    if (generatorPreview) {
      generatorPreview = null;
      paint();
    }
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
    <div class="book-toolbar" data-live-doors hidden>
      <select class="book-select" data-live-door aria-label="Дверь на карте"></select>
      <button class="book-button small" data-live-toggle-door disabled>Открыть дверь</button>
    </div>
    <div class="book-toolbar" data-live-secrets hidden>
      <select class="book-select" data-live-secret aria-label="Скрытый объект на карте"></select>
      <button class="book-button small" data-live-reveal-secret disabled>Раскрыть на ТВ</button>
      <select class="book-select" data-live-secret-hero aria-label="Получатель открытия"></select>
      <button class="book-button small" data-live-share-secret disabled>Передать герою</button>
    </div>
    <canvas class="world-canvas" data-live-canvas aria-label="Большая карта мастера без тумана"></canvas>
    <p class="book-status" data-live-status role="status">Колёсико приближает карту. Жетоны можно перетаскивать.</p>`;
  const mapSection = document.getElementById('section-map-control');
  mapSection.append(panel);
  const p = name => panel.querySelector('[data-live-' + name + ']');
  let live, reveal = false, liveGeneration = 0, doorBusy = false, secretBusy = false;
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
      [p('secret-hero'), 'Выбрать получателя'],
      [e('position-hero'), 'Герой для личной позиции'],
    ]) {
      const value = select.value;
      select.replaceChildren(new Option(placeholder, ''), ...characterRoster.map(hero => new Option(hero.name, hero.id)));
      if (characterRoster.some(hero => hero.id === value)) select.value = value;
      else if (value && select === e('position-hero')) readPosition();
    }
    secretButton();
  }
  heroes();
  new MutationObserver(heroes).observe(document.getElementById('party-list-container'), { childList: true, subtree: true });
  function doorButton() {
    const id = p('door').value;
    const open = live?.openDoors?.includes(id);
    p('toggle-door').textContent = open ? 'Закрыть дверь' : 'Открыть дверь';
    p('toggle-door').disabled = !id || doorBusy;
  }

  function secretButton() {
    const objectId = p('secret').value;
    p('reveal-secret').disabled = !objectId || secretBusy || !!live?.revealedSecrets?.includes(objectId);
    p('share-secret').disabled = !objectId || !p('secret-hero').value || secretBusy;
  }

  function paintLive() {
    const openDoors = new Set(live.openDoors);
    const doors = live.map.objects.filter(prop => prop.kind === 'door');
    const selection = p('door').value;
    p('doors').hidden = !doors.length;
    p('door').replaceChildren(new Option('Выбрать дверь', ''), ...doors.map(door =>
      new Option('Дверь (' + door.x + ', ' + door.y + ') · ' +
        (openDoors.has(door.id) ? 'открыта' : 'закрыта'), door.id)));
    if (doors.some(door => door.id === selection)) p('door').value = selection;
    doorButton();
    const revealed = new Set(live.revealedSecrets);
    const secrets = live.map.objects.filter(prop => prop.hidden);
    const selectedSecret = p('secret').value;
    p('secrets').hidden = !secrets.length;
    p('secret').replaceChildren(new Option('Выбрать скрытый объект', ''), ...secrets.map(prop =>
      new Option((props[prop.kind]?.[0] || prop.kind) + ' (' + prop.x + ', ' + prop.y + ')' +
        (revealed.has(prop.id) ? ' · раскрыт на ТВ' : ''), prop.id)));
    if (secrets.some(prop => prop.id === selectedSecret)) p('secret').value = selectedSecret;
    secretButton();
    const objects = live.map.objects.map(prop =>
      prop.kind === 'door' && openDoors.has(prop.id) ? { ...prop, open: true } : prop);
    liveView.data({ ...live.map, objects, tokens: live.tokens });
  }

  p('door').onchange = doorButton;
  p('toggle-door').onclick = async () => {
    const doorId = p('door').value;
    if (!live || !doorId || doorBusy) return;
    const id = live.map.id;
    const open = !live.openDoors.includes(doorId);
    doorBusy = true;
    doorButton();
    try {
      await request('/api/worlds/live/doors/' + encodeURIComponent(doorId), json('PUT', { id, open }));
      await sync();
      p('status').textContent = open ? 'Дверь открыта' : 'Дверь закрыта';
    } catch (error) {
      p('status').textContent = error.message;
    } finally {
      doorBusy = false;
      doorButton();
    }
  };

  p('secret').onchange = p('secret-hero').onchange = secretButton;
  p('reveal-secret').onclick = () => sendSecret();
  p('share-secret').onclick = () => {
    const characterId = p('secret-hero').value;
    if (characterId) return sendSecret(characterId);
  };
  async function sendSecret(characterId) {
    const objectId = p('secret').value;
    if (!live || !objectId || secretBusy) return;
    const { id, revision } = live.map;
    const endpoint = '/api/worlds/live/secrets/' + encodeURIComponent(objectId);
    secretBusy = true;
    secretButton();
    try {
      if (characterId) {
        await request(endpoint + '/share', json('PUT', { id, revision, characterId }));
        p('status').textContent = 'Открытие передано герою';
      } else {
        await request(endpoint, json('PUT', { id, revision }));
        p('status').textContent = 'Секрет раскрыт на ТВ';
      }
    } catch (error) {
      p('status').textContent = error.message;
    } finally {
      await sync();
      secretBusy = false;
      secretButton();
    }
  }

  async function sync() {
    const generation = ++liveGeneration;
    try {
      const version = live ? '?version=' + encodeURIComponent(live.map.id + ':' + live.map.revision) : '';
      const next = await request('/api/worlds/live' + version);
      if (generation !== liveGeneration) return;
      const changed = next?.map.id !== live?.map.id;
      if (changed || next?.map.revision !== live?.map.revision) p('secret').value = '';
      if (next && !next.map.chunks && live) next.map = live.map;
      live = next;
      panel.hidden = !live;
      mapSection.toggleAttribute('data-world-playing', !!live);
      if (!live) return;
      p('title').textContent = live.map.name;
      paintLive();
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
        paintLive();
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

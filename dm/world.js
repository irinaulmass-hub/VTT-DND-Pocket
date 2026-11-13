'use strict';

(() => {
  const { terrain, props, get, set, sceneScope, locationMapId } = window.WorldMap;
  const { generationChange, protectManualChanges, maxPathPoints, maxForestPoints } = window.WorldGenerators;
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
            <label>Seed <input class="book-select" type="number" min="0" max="4294967295" step="1" value="0" data-world-path-seed></label>
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
          <form class="book-toolbar" data-world-transition-form>
            <button class="book-button" type="button" data-tool="transition">Указать клетку на карте</button>
            <label>X <input class="book-select" type="number" name="x" required></label>
            <label>Y <input class="book-select" type="number" name="y" required></label>
            <select class="book-select" name="toMapId" aria-label="Карта назначения" required></select>
            <label>X назначения <input class="book-select" type="number" name="toX" required></label>
            <label>Y назначения <input class="book-select" type="number" name="toY" required></label>
            <button class="book-button">Сохранить переход</button>
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
  let generatorPoints = [], generatorPreview = null;
  const generatorKind = () => tool === 'generate-forest' ? 'forest' : 'path';

  function paintGeneratorControls() {
    e('path').hidden = tool !== 'generate-path' && tool !== 'generate-forest';
    if (e('path').hidden) return;
    const kind = generatorKind();
    e('path-terrain-label').hidden = e('path-width-label').hidden = kind === 'forest';
    e('forest-density-label').hidden = kind !== 'forest';
    const saved = e('path-saved');
    const selectedId = saved.value;
    const recipes = (draft.generators || []).filter(recipe => recipe.kind === kind && recipe.version === 1);
    saved.replaceChildren(new Option(kind === 'forest' ? 'Новый лесной участок' : 'Новая линия', ''), ...recipes.map((recipe, index) =>
      new Option((kind === 'forest' ? 'Лес' : recipe.params.terrain === 'path' ? 'Дорога' : 'Река') + ' · ' + (index + 1) +
        ' · seed ' + recipe.seed, recipe.id)));
    if (recipes.some(recipe => recipe.id === selectedId)) saved.value = selectedId;
    e('path-count').textContent = 'Опорных точек: ' + generatorPoints.length;
    e('path-preview').disabled = generatorPoints.length < (kind === 'forest' ? 3 : 2);
    e('path-apply').disabled = !generatorPreview;
    e('path-apply').textContent = saved.value ? 'Применить регенерацию' : 'Применить к черновику';
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
        params: forest ? { density: e('forest-density').valueAsNumber, points: generatorPoints } :
          { terrain: e('path-terrain').value, width: Number(e('path-width').value), points: generatorPoints },
      };
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

  function updateDestinations() {
    const select = transitionForm.elements.toMapId;
    const value = select.value;
    const scope = draft && sceneScope(draft);
    const targets = scope ? availableMaps.filter(item =>
      item.id !== draft.id && sceneScope(item).worldId === scope.worldId) : [];
    select.replaceChildren(new Option('Карта назначения', ''), ...targets.map(item => new Option(item.name, item.id)));
    if (targets.some(item => item.id === value)) select.value = value;
  }

  async function showTransitions() {
    const id = draft.id;
    const { links } = await request(transitionUrl(id));
    if (draft?.id !== id) return;
    const nodes = links.map(link => {
      const item = document.createElement('li');
      const target = locationMapId(link.to);
      const name = availableMaps.find(map => map.id === target)?.name || 'Сцена';
      item.textContent = '(' + link.from.x + ', ' + link.from.y + ') → ' + name +
        ' (' + link.to.x + ', ' + link.to.y + ') ';
      const button = document.createElement('button');
      button.className = 'book-button small';
      button.textContent = 'Удалить переход';
      button.onclick = () => run(async () => {
        await request(transitionUrl(id) + '/' + encodeURIComponent(link.id), { method: 'DELETE' });
        await showTransitions();
      });
      item.append(button);
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
      await request(transitionUrl(draft.id), json('POST', {
        x: x.valueAsNumber, y: y.valueAsNumber, toMapId: toMapId.value,
        toX: toX.valueAsNumber, toY: toY.valueAsNumber,
      }));
      await showTransitions();
      status('Переход сохранён');
    });
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
    if (tool === 'generate-path' || tool === 'generate-forest') {
      const forest = generatorKind() === 'forest';
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
    marks: () => tool === 'generate-path' || tool === 'generate-forest' ? generatorPoints : first ? [first] : [],
    outline: () => tool === 'generate-forest' ? generatorPoints : null,
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
    clearGeneratorPreview(true);
    undo.length = redo.length = 0;
    e('editor').hidden = false;
    transitionForm.reset();
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
    try { await task(); }
    catch (error) { status(error.message); }
    finally { busy = false; }
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
    const id = e('select').value;
    if (!id) return;
    if (dirty && !confirm('Открыть другую карту без сохранения текущих правок?')) { e('select').value = draft.id; return; }
    run(async () => open(await request('/api/worlds/' + encodeURIComponent(id))));
  };
  editor.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => {
    if (tool !== button.dataset.tool) {
      generatorPoints = [];
      clearGeneratorPreview(true);
    }
    tool = button.dataset.tool;
    if (tool === 'generate-forest') status('Отметь вершины контура леса по порядку и нажми «Предпросмотр».');
    if (tool === 'generate-path') status('Укажи опорные точки на карте и нажми «Предпросмотр».');
    if (tool === 'transition') status('Нажми на исходную клетку перехода');
    if (tool === 'position') status('Выбери героя и нажми на клетку, чтобы перенести его');
    first = undefined;
    paint();
    if (tool === 'select') status('Перетащи объект мышью. Щёлкни по нему, чтобы выделить.');
    if (tool === 'delete-object') status('Щёлкни по объекту, который хочешь убрать.');
  });
  e('path-saved').onchange = () => {
    if (!draft || busy) return;
    const recipe = (draft.generators || []).find(item => item.id === e('path-saved').value);
    generatorPoints = recipe?.params.points || [];
    generatorPreview = null;
    if (recipe) {
      if (recipe.kind === 'forest') e('forest-density').value = String(recipe.params.density);
      else {
        e('path-terrain').value = recipe.params.terrain;
        e('path-width').value = String(recipe.params.width);
      }
      e('path-seed').value = String(recipe.seed);
      const [{ x, y }] = generatorPoints;
      editorView.setCamera({ ...editorView.camera(), x: x + .5, y: y + .5 });
      status('Рецепт загружен. Нажми «Предпросмотр».');
    }
    paint();
  };
  for (const field of ['path-terrain', 'path-width', 'path-seed', 'forest-density']) {
    e(field).oninput = () => {
      clearGeneratorPreview();
      if (generatorPoints.length >= 2) status('Нажми «Предпросмотр» для обновлённого участка.');
      paint();
    };
  }
  e('path-clear-points').onclick = () => {
    if (!draft || busy) return;
    generatorPoints = [];
    clearGeneratorPreview();
    status('Укажи новый контур или линию. Сохранённый участок будет перестроен после применения.');
    paint();
  };
  e('path-reset').onclick = () => {
    if (!draft || busy) return;
    generatorPoints = [];
    clearGeneratorPreview(true);
    status('Укажи новые опорные точки на карте.');
    paint();
  };
  e('path-preview').onclick = previewGenerator;
  e('path-apply').onclick = () => {
    if (!draft || busy || !generatorPreview) return;
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
  e('undo').onclick = () => { if (!busy && undo.length) { const change = undo.pop(); redo.push(change); apply(change, true); } };
  e('redo').onclick = () => { if (!busy && redo.length) { const change = redo.pop(); undo.push(change); apply(change); } };
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

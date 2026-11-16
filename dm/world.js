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
  const tileButton = ([id, [label]]) => `<button class="book-button" data-tool="${id}"><canvas width="96" height="96" aria-hidden="true"></canvas>${label}</button>`;
  editor.innerHTML = `
    <div class="book-widget-body">
      <div class="world-editor-heading"><div><small>КНИГА МАСТЕРА · РЕДАКТОР МИРА</small><h2>Большая карта мира</h2></div><button class="book-button" data-world-expand aria-pressed="false">Развернуть редактор</button></div>
      <details class="world-create"><summary>Новая карта или сцена</summary>
      <form class="book-toolbar" data-world-create>
        <input class="book-select" name="title" required maxlength="80" placeholder="Название карты" aria-label="Название карты мира">
        <select class="book-select" name="parentMap" aria-label="Тип и расположение новой карты"></select>
        <label>Заготовка <select class="book-select" name="preset" aria-label="Готовая заготовка карты">
          <option value="">Пустая карта</option><option value="village">Поселение у реки</option>
          ${Object.entries(window.WorldGenerators.roomThemes).filter(([id]) => id !== 'none').map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}
        </select></label>
        <label data-world-elevation hidden>Номер этажа <input class="book-select" type="number" name="elevation" step="1" disabled></label>
        <label><input type="checkbox" name="sample"> Начать с деревни у озера</label>
        <button class="book-button primary">Создать карту</button>
      </form></details>
      <div class="book-toolbar">
        <select class="book-select" data-world-select aria-label="Открыть черновик карты"></select>
      </div>
      <div data-world-editor hidden>
        <div class="world-studio"><aside class="world-library" aria-label="Инструменты и библиотека карты"><h3>Материалы и объекты</h3>
        <div class="world-toolbox" aria-label="Инструменты карты">
          <button class="book-button" data-tool="pan">Рука</button>
          <button class="book-button" data-tool="generate-path">Path · Линии и ограды</button>
          <button class="book-button" data-tool="generate-forest">Plot · Лес, поля и участки</button>
          <button class="book-button" data-tool="generate-room">Room · Комната</button>
          <button class="book-button" data-tool="generate-district">District Plot · Район</button>
          <button class="book-button" data-tool="erase">Убрать тайл</button>
          <button class="book-button" data-tool="select">Выделение и группы</button><label><input type="checkbox" data-world-marquee> Выделять рамкой</label>
          <button class="book-button" data-tool="delete-object">Удалять объекты</button>
          <label><input type="checkbox" data-world-rect> Заполнить прямоугольник</label>
        </div>
        <label class="world-library-search">Найти в библиотеке
          <input class="book-select" type="search" data-world-library-search placeholder="Дерево, стул, камень…" aria-label="Поиск по библиотеке">
        </label>
        <select class="book-select world-category" data-world-library-category aria-label="Категория библиотеки"><option value="all">Вся библиотека</option><option value="terrain">Покрытия</option>${Object.keys(window.WorldMap.propGroups).map((title,i)=>`<option value="${i}">${title}</option>`).join('')}</select>
        <small class="world-library-count" data-world-library-count aria-live="polite"></small>
        <div class="world-palette" role="group" aria-label="Местность">
          <strong>Местность</strong>
          ${Object.entries(terrain).map(tileButton).join('')}
        </div>
        <div class="world-palette" role="group" aria-label="Основные объекты">
          <strong>Основные объекты</strong>
          ${['house','tavern','bridge','tree','bush','wall','door'].map(id => tileButton([id, props[id]])).join('')}
        </div>
        <details class="world-extra-palette" data-world-library-extra>
          <summary>Библиотека дополнительных объектов</summary>
          ${extraGroups.map(([title, ids]) => `<div class="world-palette" role="group" aria-label="${title}">
            <strong>${title}</strong>${ids.map(id => tileButton([id, props[id]])).join('')}
          </div>`).join('')}
        </details>
        </aside><div class="world-workbench">
        <div class="world-stage"><div class="world-canvas-toolbar"><div><strong data-world-map-name>Карта мира</strong><small data-world-selection-summary>Колёсико — масштаб · Правая кнопка — перемещение</small></div><div class="book-toolbar">
          <label><input type="checkbox" data-world-grid> Сетка</label>
          <button class="book-button" data-world-frame>Вся карта</button><button class="book-button" data-world-undo>Отменить</button>
          <button class="book-button" data-world-redo>Повторить</button>
        </div></div>
        <canvas class="world-canvas" data-world-canvas tabindex="0" aria-label="Редактор карты мира"></canvas>
        </div><aside class="world-inspector" aria-label="Свойства и действия"><h3>Свойства инструмента</h3><label class="world-group-picker">Группы карты<select class="book-select" data-world-groups aria-label="Группы карты"></select></label><div class="book-toolbar" data-world-brush-controls aria-label="Кисть местности">
          <label>Размер кисти <select class="book-select" data-world-brush-size>
            ${[1, 3, 5, 9, 15].map(width => `<option value="${width}">${width} кл.</option>`).join('')}
          </select></label>
          <label>Форма кисти <select class="book-select" data-world-brush-shape>
            <option value="circle">Круг</option><option value="square">Квадрат</option>
          </select></label>
          <small>Один мазок — одна отмена. Escape отменяет незавершённый мазок.</small>
        </div>
        <section data-world-path hidden aria-label="Параметры генератора">
          <div class="book-toolbar">
            <select class="book-select" data-world-path-saved aria-label="Сохранённый рецепт"></select>
            <label data-world-path-terrain-label>Тип линии <select class="book-select" data-world-path-terrain>
              <option value="path">Дорога</option><option value="water">Река</option>
              <option value="wall">Каменная стена</option><option value="fence">Деревянный забор</option><option value="palisade">Частокол</option>
            </select></label>
            <label data-world-room-theme-label hidden>Назначение <select class="book-select" data-world-room-theme>
              ${Object.entries(window.WorldGenerators.roomThemes).map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}
            </select></label>
            <label data-world-path-width-label>Ширина <select class="book-select" data-world-path-width>
              ${[1, 3, 5, 7, 9, 11, 13, 15].map(width => `<option value="${width}">${width} кл.</option>`).join('')}
            </select></label>
            <label data-world-plot-biome-label hidden>Тип участка <select class="book-select" data-world-plot-biome aria-label="Тип участка">
              ${Object.entries(window.WorldGenerators.plotBiomes).map(([id,spec]) => `<option value="${id}">${spec.label}</option>`).join('')}
            </select></label>
            <label data-world-plot-orientation-label hidden>Направление рядов <select class="book-select" data-world-plot-orientation aria-label="Направление рядов"><option value="0">Вдоль X</option><option value="1">Вдоль Y</option></select></label>
            <label data-world-forest-density-label hidden>Плотность <input class="book-select" type="number" min="10" max="100" step="1" value="65" data-world-forest-density> %</label>
            <label data-world-district-count-label hidden>Домов <input class="book-select" type="number" min="1" max="24" step="1" value="8" data-world-district-count></label>
            <label data-world-room-floor-label hidden>Пол <select class="book-select" data-world-room-floor>
              <option value="wood">Доски</option><option value="stone">Камень</option><option value="caveFloor">Пещерный пол</option>
            </select></label>
            <button class="book-button" data-world-room-entrance hidden>Выбрать вход</button>
            <small data-world-room-entry-info hidden></small>
            <label>Seed <input class="book-select" type="number" min="0" max="4294967295" step="1" value="0" data-world-path-seed></label>
          </div>
          <details data-world-templates><summary>Шаблоны настроек</summary><div class="book-toolbar">
            <select class="book-select" data-world-template-select aria-label="Шаблон настроек"></select>
            <button class="book-button" data-world-template-load disabled>Загрузить настройки</button>
            <input class="book-select" data-world-template-name maxlength="80" placeholder="Название шаблона" aria-label="Название шаблона">
            <button class="book-button" data-world-template-save>Сохранить настройки</button>
          </div></details>
          <div class="book-toolbar">
            <small data-world-path-count></small>
            <button class="book-button" data-world-path-preview>Предпросмотр</button>
            <button class="book-button primary" data-world-path-apply>Применить к черновику</button>
            <button class="book-button" data-world-path-clear-points>Нарисовать контур заново</button>
            <button class="book-button" data-world-path-reset>Новый участок</button>
          </div>
          <div class="world-contour-controls" data-world-contour-controls aria-label="Редактирование контура">
            <strong>Опорные точки</strong>
            <p>Перетаскивай круглые вершины. Квадрат — вход в комнату. Карта изменится после предпросмотра и применения.</p>
            <div class="book-toolbar">
              <select class="book-select" data-world-vertex aria-label="Выбранная вершина"></select>
              <label>X <input class="book-select" type="number" step="1" data-world-vertex-x></label>
              <label>Y <input class="book-select" type="number" step="1" data-world-vertex-y></label>
              <button class="book-button" data-world-vertex-move>Переместить</button>
              <button class="book-button" data-world-vertex-insert>Вставить на ребре</button>
              <button class="book-button" data-world-vertex-delete>Убрать точку</button>
            </div>
            <small data-world-contour-info role="status"></small>
          </div>
        </section>
        <div class="book-toolbar" data-world-object hidden>
          <strong data-world-size></strong>
          <ul class="world-selection-list" data-world-selection-list aria-label="Состав выделения"></ul>
          <small>Ctrl/⌘ + клик — добавить · стрелки — сдвиг · R — поворот</small>
          <div class="world-selection-move"><label>ΔX <input class="book-select" type="number" step="1" value="0" data-world-move-x aria-label="Сдвиг выделения по X"></label><label>ΔY <input class="book-select" type="number" step="1" value="0" data-world-move-y aria-label="Сдвиг выделения по Y"></label></div>
          <button class="book-button" data-world-move>Сдвинуть выделение</button>
          <input class="book-select" maxlength="80" data-world-group-name placeholder="Название группы" aria-label="Название группы объектов">
          <button class="book-button" data-world-group>Объединить в группу</button>
          <button class="book-button" data-world-ungroup>Разгруппировать</button>
          <button class="book-button" data-world-group-rename>Переименовать группу</button>
          <button class="book-button" data-world-turn>Повернуть</button>
          <button class="book-button" data-world-copy>Копировать</button>
          <button class="book-button" data-world-delete>Удалить выбранный</button>
          <button class="book-button" data-world-building-link hidden>Связать с интерьером</button>
          <label><input type="checkbox" data-world-secret> Видно только мастеру</label>
        </div>
        <div class="book-toolbar" data-world-placement hidden aria-label="Расстановка объектов">
          <strong data-world-placement-name></strong>
          <label><input type="checkbox" data-world-placement-repeat> Ставить несколько</label>
          <button class="book-button" data-world-placement-turn>Повернуть · R</button>
          <button class="book-button" data-world-placement-stop>Завершить · Esc</button>
          <small data-world-placement-info>Нажми на карту, чтобы поставить объект.</small>
        </div>
        <div class="book-toolbar">
          <select class="book-select" data-world-position-hero aria-label="Герой для личной позиции"></select>
          <button class="book-button" data-tool="position">Поставить или перенести героя</button>
          <small data-world-position-info role="status"></small>
        </div>

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
        <details class="world-export"><summary>Экспорт карты · PNG</summary>
          <p>Область без тумана и маркеров редактора. Скрытые предметы исключены.</p>
          <div class="world-export-bounds">
            <label>Слева <input class="book-select" type="number" step="1" data-world-export-left aria-label="Левая граница экспорта"></label>
            <label>Сверху <input class="book-select" type="number" step="1" data-world-export-top aria-label="Верхняя граница экспорта"></label>
            <label>Справа <input class="book-select" type="number" step="1" data-world-export-right aria-label="Правая граница экспорта"></label>
            <label>Снизу <input class="book-select" type="number" step="1" data-world-export-bottom aria-label="Нижняя граница экспорта"></label>
          </div>
          <button class="book-button" data-world-export-viewport>Взять видимый участок</button>
          <label>Масштаб <select class="book-select" data-world-export-scale><option value="32">32 px/кл.</option><option value="64">64 px/кл.</option><option value="128">128 px/кл.</option></select></label>
          <label>Сетка <select class="book-select" data-world-export-grid><option value="none">Без сетки</option><option value="square">Квадраты</option><option value="hex">Шестиугольники</option></select></label>
          <label><input type="checkbox" data-world-export-transparent> Прозрачный фон вне карты</label>
          <button class="book-button primary" data-world-export>Скачать PNG</button>
        </details>
        <div class="book-toolbar">
          <button class="book-button" data-world-save>Сохранить черновик</button>
          <label><input type="checkbox" data-world-fog checked> Туман на экране игроков</label>
          <button class="book-button primary" data-world-publish>Показать игрокам</button>
        </div>
        </aside></div></div>
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
  e('expand').onclick = () => {
    const expanded=editor.classList.toggle('world-editor-expanded');
    e('expand').textContent=expanded?'Вернуться к книге':'Развернуть редактор';
    e('expand').setAttribute('aria-pressed',String(expanded));
    if(draft)requestAnimationFrame(()=>frameMap());
  };
  let libraryWasExpanded;
  function filterLibrary() {
    const query = e('library-search').value.trim().toLocaleLowerCase('ru').replaceAll('ё','е');
    if (query && libraryWasExpanded === undefined) libraryWasExpanded = e('library-extra').open;
    if (query || !['all','terrain',''].includes(e('library-category').value)) e('library-extra').open = true;
    else if (libraryWasExpanded !== undefined) { e('library-extra').open = libraryWasExpanded; libraryWasExpanded = undefined; }
    const category=e('library-category').value || 'all',group=Object.values(window.WorldMap.propGroups)[Number(category)];
    let found = 0;
    editor.querySelectorAll('.world-palette [data-tool]').forEach(button => {
      const id = button.dataset.tool, label = (terrain[id] || props[id])[0];
      button.hidden = (!!query && ![label,id].join(' ').toLocaleLowerCase('ru').replaceAll('ё','е').includes(query)) || (category==='terrain' ? !terrain[id] : category!=='all' && !group?.includes(id));
      if (!button.hidden) found++;
    });
    editor.querySelectorAll('.world-palette').forEach(group => {
      group.hidden = ![...group.querySelectorAll('[data-tool]')].some(button => !button.hidden);
    });
    e('library-count').textContent = query || category!=='all' ? found ? 'Найдено: ' + found : 'Ничего не найдено. Измени запрос.' :
      Object.keys(props).length + ' объектов · ' + Object.keys(terrain).length + ' покрытий';
  }
  e('library-search').oninput = filterLibrary;
  e('library-category').onchange=filterLibrary;
  filterLibrary();
  const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let draft, tool = 'grass', first, selected, dirty = false, busy = false;
  let brushStroke = null, brushDraft, strokeError;
  let copyTemplate = null, placementTurn = 0, batchCopy = null;
  let selection = new Set();
  const selectedMembers=()=>draft ? draft.objects.filter(p=>selection.size ? selection.has(p.id) : p.id===selected) : [];
  function selectItems(ids){
    const wanted=new Set(ids),groups=new Set(draft.objects.filter(p=>wanted.has(p.id)&&p.groupId).map(p=>p.groupId));
    selection=new Set(draft.objects.filter(p=>wanted.has(p.id)||groups.has(p.groupId)).map(p=>p.id));
    selected=[...selection].at(-1);
  }
  function freshId(extra=[]){
    const used=new Set([...draft.objects.flatMap(p=>[p.id,p.groupId]),...extra]);
    for(let i=0;i<8;i++){const id=crypto.randomUUID?.() || 'item-'+Date.now()+'-'+Math.random().toString(36).slice(2);if(!used.has(id))return id;}
    throw new RangeError('Не удалось создать уникальный ID. Повтори действие.');
  }
  const placing = () => tool === 'place-copy' || !!props[tool];
  const placementSettings = () => copyTemplate || { kind: tool, turn: placementTurn, hidden: false };
  const undo = [], redo = [];
  let availableMaps = [];
  let generatorPoints = [], generatorPreview = null, roomEntrance = null, pickingEntrance = false;
  let selectedVertex = null, dragContour = null;
  const contourUndo = [], contourRedo = [];
  const contourSnapshot = () => ({ points: generatorPoints.map(p => ({ ...p })), entrance: roomEntrance && { ...roomEntrance } });
  function resetContourHistory() { contourUndo.length = contourRedo.length = 0; selectedVertex = null; dragContour = null; }
  function setContour(next) { generatorPoints = next.points; roomEntrance = next.entrance; dragContour = null; clearGeneratorPreview(); }
  function changeContour(next) {
    if (JSON.stringify(contourSnapshot()) === JSON.stringify(next)) { dragContour = null; return paint(); }
    contourUndo.push(contourSnapshot());
    if (contourUndo.length > 50) contourUndo.shift();
    contourRedo.length = 0; setContour(next); paint();
    status('Контур изменён. Проверь предпросмотр, затем примени результат.');
  }
  function modifyContour(operation) {
    if (!draft || busy || !generatorTool()) return;
    try { changeContour(window.WorldGenerators.editContour(generatorKind(), generatorPoints, roomEntrance, operation)); }
    catch (error) { dragContour = null; paint(); status(error.message); }
  }
  let templates = { revision: 0, templates: [] }, templatesReady = false, templateGeneration = 0;
  const templateUrl = '/api/world-generator-templates';
  const generatorKind = () => tool === 'generate-district' ? 'district' : tool === 'generate-room' ? 'room' : tool === 'generate-forest' ? 'forest' : 'path';
  const generatorTool = () => ['generate-path', 'generate-forest', 'generate-room', 'generate-district'].includes(tool);

  function paintGeneratorControls() {
    e('path').hidden = !generatorTool();
    if (e('path').hidden) return;
    const kind = generatorKind();
    paintTemplates();
    e('path-terrain-label').hidden = kind !== 'path';
    e('path-width-label').hidden = kind !== 'path' || window.WorldGenerators.structuralPaths.has(e('path-terrain').value);
    e('room-floor-label').hidden = e('room-entrance').hidden = e('room-entry-info').hidden = kind !== 'room';
    e('room-theme-label').hidden = kind !== 'room';
    e('templates').hidden = kind === 'room' || kind === 'district';
    e('district-count-label').hidden = kind !== 'district';
    e('room-entrance').textContent = pickingEntrance ? 'Нажми на клетку входа…' : 'Выбрать вход';
    e('room-entry-info').textContent = roomEntrance ? 'Вход: ' + roomEntrance.x + ', ' + roomEntrance.y : 'Вход не выбран';
    e('forest-density-label').hidden = e('plot-biome-label').hidden = kind !== 'forest';
    e('plot-orientation-label').hidden = kind !== 'forest' || !['field','garden','orchard','graveyard'].includes(e('plot-biome').value);
    e('templates').hidden ||= kind === 'forest' && !['','forest'].includes(e('plot-biome').value);
    const saved = e('path-saved');
    const selectedId = saved.value;
    const recipes = (draft.generators || []).filter(recipe => recipe.kind === kind && recipe.version === 1);
    saved.replaceChildren(new Option(kind === 'district' ? 'Новый район' : kind === 'room' ? 'Новая комната' : kind === 'forest' ? 'Новый лесной участок' : 'Новая линия', ''), ...recipes.map((recipe, index) =>
      new Option((kind === 'district' ? 'Район' : kind === 'room' ? (window.WorldGenerators.roomThemes[recipe.params.furnishing] || 'Комната') : kind === 'forest' ? (window.WorldGenerators.plotBiomes[recipe.params.biome || 'forest']?.label || 'Лес') :
        ({path:'Дорога',water:'Река',wall:'Стена',fence:'Забор',palisade:'Частокол'})[recipe.params.terrain]) + ' · ' + (index + 1) +
        ' · seed ' + recipe.seed, recipe.id)));
    if (recipes.some(recipe => recipe.id === selectedId)) saved.value = selectedId;
    e('path-count').textContent = kind === 'district' ? 'Углы района: ' + (generatorPoints.length === 4 ? 2 : generatorPoints.length) + ' / 2' : 'Опорных точек: ' + generatorPoints.length;
    e('path-preview').disabled = busy || generatorPoints.length < (kind === 'room' || kind === 'district' ? 4 : kind === 'path' ? 2 : 3) || (kind === 'room' && !roomEntrance);
    e('path-apply').disabled = busy || !generatorPreview;
    e('path-apply').textContent = kind === 'district' ? 'Применить и сохранить район' : saved.value ? 'Применить регенерацию' : 'Применить к черновику';
    const vertex = e('vertex');
    if (selectedVertex !== 'entrance' && !(selectedVertex >= 0 && selectedVertex < generatorPoints.length)) selectedVertex = null;
    vertex.replaceChildren(new Option('Выбрать точку', ''), ...generatorPoints.map((p, i) => new Option('Точка ' + (i + 1), String(i))),
      ...(roomEntrance ? [new Option('Вход в комнату', 'entrance')] : []));
    vertex.value = selectedVertex === null ? '' : String(selectedVertex);
    const point = selectedVertex === 'entrance' ? roomEntrance : generatorPoints[selectedVertex];
    e('vertex-x').value = point ? String(point.x) : '';
    e('vertex-y').value = point ? String(point.y) : '';
    for (const name of ['vertex','vertex-x','vertex-y','vertex-move']) e(name).disabled = busy || (name !== 'vertex' && !point);
    const flexible = ['path','forest'].includes(kind) && Number.isInteger(selectedVertex);
    e('vertex-insert').disabled = busy || !flexible || generatorPoints.length < 2;
    e('vertex-delete').disabled = busy || !flexible || generatorPoints.length <= (kind === 'path' ? 2 : 3);
    e('contour-info').textContent = kind === 'room' || kind === 'district'
      ? 'При переносе угла соседние стороны остаются прямыми. Вход перемещается вместе со стеной.'
      : 'Выбери вершину для точных координат, вставки точки на следующем ребре или удаления.';
  }

  function generatorSettings() {
    const kind = generatorKind();
    return { kind, version: 1, seed: e('path-seed').valueAsNumber, settings: kind === 'forest' ?
      { density: e('forest-density').valueAsNumber } :
      { terrain: e('path-terrain').value, width: window.WorldGenerators.structuralPaths.has(e('path-terrain').value) ? 1 : Number(e('path-width').value) } };
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
        params: kind === 'district' ? { count: e('district-count').valueAsNumber, points: generatorPoints } : kind === 'room' ? { floor: e('room-floor').value, points: generatorPoints, entrance: roomEntrance,
          ...(e('room-theme').value && e('room-theme').value !== 'none' ? { furnishing: e('room-theme').value } : {}) } : forest ? { density: e('forest-density').valueAsNumber, points: generatorPoints,
          ...(e('plot-biome').value && e('plot-biome').value !== 'forest' ? {biome:e('plot-biome').value,orientation:Number(e('plot-orientation').value || 0)} : {}) } :
          { ...generatorSettings().settings, points: generatorPoints },
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
      const objectCount = generatorPreview.generators.after.find(item => item.id === recipe.id)?.state?.objects.length || 0;
      status((savedId ? 'Регенерация' : 'Предпросмотр') + ' · ' + generatorPreview.count +
        (kind === 'path' && window.WorldGenerators.structuralPaths.has(recipe.params.terrain) ? ' секций.' : ' кл. · ' + objectCount + ' объектов.') +
        ' Ручные правки сохраняются. Примени результат к черновику.');
    } catch (error) {
      generatorPreview = null;
      status(error.message);
    }
    paint();
  }

  function paint() {
    if (!draft) return;
    if (brushStroke && !strokeError) editorView.data({ ...draft, chunks: brushStroke.chunks });
    else if (generatorPreview) {
      editorView.data({ ...draft, chunks: generatorPreview.chunks, objects: generatorPreview.objects?.after || draft.objects });
    } else editorView.data(draft);
    paintGeneratorControls();
    e('map-name').textContent = draft.name;
    const members=selectedMembers();
    const object = draft.objects.find(item => item.id === selected);
    e('selection-summary').textContent=members.length ? 'Выделено '+members.length+' · Ctrl/⌘ + клик добавляет · Alt + клик выбирает перекрытый объект' : 'Колёсико — масштаб · Правая кнопка — перемещение';
    e('selection-list').replaceChildren(...members.slice(0,40).map(p=>{const li=document.createElement('li');li.textContent=props[p.kind][0]+' · '+p.x+', '+p.y+(p.hidden?' · Только мастеру':'');return li;}));
    const groups=new Map();for(const p of draft.objects)if(p.groupId){const group=groups.get(p.groupId)||{name:p.groupName || 'Группа',count:0};group.count++;groups.set(p.groupId,group);}
    const common=members.length && members.every(p=>p.groupId && p.groupId===members[0].groupId) ? members[0].groupId : '';
    e('groups').replaceChildren(new Option('Выбрать группу · '+groups.size,''),...[...groups].map(([id,g])=>new Option(g.name+' · '+g.count,id)));e('groups').value=common;
    e('group').disabled=busy || members.length<2;e('ungroup').disabled=e('group-rename').disabled=busy || !common;
    e('group-name').placeholder=common ? members[0].groupName || 'Название группы' : 'Название новой группы';
    e('object').hidden = !object || placing();
    e('copy').disabled = busy || !!brushStroke || draft.objects.length + members.length > window.WorldMap.objectLimit;
    e('placement').hidden = !placing();
    for (const name of ['placement-repeat','placement-turn','placement-stop']) e(name).disabled = busy || !!brushStroke;
    if (placing()) {
      const settings = placementSettings();
      e('placement-name').textContent = (batchCopy ? 'Копия набора · '+batchCopy.length+' объектов · ' : copyTemplate ? 'Копия: ' : '') + props[settings.kind][0] +
        (settings.hidden ? ' · Только мастеру' : '');
      e('placement-info').textContent = draft.objects.length >= window.WorldMap.objectLimit
        ? 'Достигнут лимит 3 000 объектов. Отмени лишний объект или заверши расстановку.'
        : 'Нажми на карту, чтобы поставить объект. Поворот: ' + settings.turn * 90 + '°.';
    }
    e('building-link').hidden = members.length!==1 || !object || !buildingKinds.has(object.kind);
    updateBuildings();
    if (object) {
      const { width, height } = window.WorldMap.footprint(object);
      e('size').textContent = members.length>1 ? 'Выделено: '+members.length+' объектов' : props[object.kind][0] + ' · ' + width + ' × ' + height + ' кл.';
    }
    e('secret').checked = members.length>0 && members.every(p=>p.hidden);
    e('secret').indeterminate=members.some(p=>p.hidden) && !members.every(p=>p.hidden);
    e('undo').disabled = busy || !!brushStroke || !(contourUndo.length || undo.length);
    e('redo').disabled = busy || !!brushStroke || !(contourRedo.length || redo.length);
    e('undo').textContent = contourUndo.length ? 'Отменить точку' : 'Отменить';
    e('redo').textContent = contourRedo.length ? 'Повторить точку' : 'Повторить';
    const brushTool = !!terrain[tool] || tool === 'erase';
    e('brush-controls').hidden = !brushTool;
    for (const name of ['brush-size','brush-shape','rect']) e(name).disabled = busy || !!brushStroke;
    e('brush-size').disabled ||= e('rect').checked;
    e('brush-shape').disabled ||= e('rect').checked;
    e('canvas').setAttribute('data-brush-active', String(placing() || brushTool && !e('rect').checked));
    for (const name of ['path-saved','path-terrain','path-width','forest-density','plot-biome','plot-orientation','district-count','room-floor','room-theme','path-seed',
      'path-clear-points','path-reset','room-entrance','save','publish','select']) e(name).disabled = busy || !!brushStroke;
    editor.querySelectorAll('[data-tool]').forEach(button => {
      button.disabled = busy || !!brushStroke;
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    });
  }
  function apply(change, backwards = false) {
    if (change.objects) draft.objects = backwards ? change.objects.before : change.objects.after;
    for (const tile of change.tiles || []) set(draft.chunks, tile.x, tile.y, backwards ? tile.before : tile.after);
    if (change.generators) draft.generators = backwards ? change.generators.before : change.generators.after;
    if (change.recipeId && generatorTool()) {
      const recipe = (draft.generators || []).find(item => item.id === change.recipeId && item.kind === generatorKind());
      if (recipe) {
        generatorPoints = recipe.params.points.map(p => ({ ...p }));
        roomEntrance = recipe.kind === 'room' ? { ...recipe.params.entrance } : null;
        if (recipe.kind === 'room') { e('room-floor').value = recipe.params.floor; e('room-theme').value = recipe.params.furnishing || 'none'; }
        if (recipe.kind === 'forest') { e('forest-density').value=String(recipe.params.density); e('plot-biome').value=recipe.params.biome || 'forest'; e('plot-orientation').value=String(recipe.params.orientation || 0); }
        if (recipe.kind === 'path') { e('path-terrain').value = recipe.params.terrain; e('path-width').value = String(recipe.params.width); }
        e('path-seed').value = String(recipe.seed);
      }
      resetContourHistory();
    }
    generatorPreview = null;
    dirty = true;
    status('Есть несохранённые изменения');
    paint();
    if (change.recipeId && (draft.generators || []).some(item => item.id === change.recipeId && item.kind === generatorKind())) e('path-saved').value = change.recipeId;
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
  function beginCopy() {
    if (!draft || busy || brushStroke) return;
    const members=selectedMembers(),object=members[0];
    if (!object) return;
    batchCopy=members.length>1 ? members.map(p=>({...p})) : null;
    if (draft.objects.length >= window.WorldMap.objectLimit) return status('Достигнут лимит 3 000 объектов');
    // A detached copy has no generator ownership or building/interior links.
    copyTemplate = { kind: object.kind, turn: object.turn, hidden: object.hidden === true };
    tool = 'place-copy'; first = undefined; clearGeneratorPreview(true); paint();
    e('canvas').focus?.({ preventScroll: true });
    status('Копия готова. Укажи место на карте. R — повернуть, Esc — закончить.');
  }
  function stopPlacement() {
    if (!placing() || busy) return;
    copyTemplate = batchCopy = null; placementTurn = 0; tool = 'select'; paint();
    status('Расстановка завершена');
  }
  function turnPlacement() {
    if (!placing() || busy) return;
    if(batchCopy){try{batchCopy=window.WorldMap.transformObjects(batchCopy,batchCopy.map(p=>p.id),{turns:1});}catch(error){return status(error.message);}}
    else if (copyTemplate) copyTemplate = { ...copyTemplate, turn: (copyTemplate.turn + 1) % 4 };
    else placementTurn = (placementTurn + 1) % 4;
    paint();
  }
  function placeObject(x, y) {
    if(batchCopy){
      if(draft.objects.length+batchCopy.length>window.WorldMap.objectLimit)return status('Для всего набора недостаточно места в лимите объектов');
      try{
        const b=window.WorldMap.selectionBounds(batchCopy),moved=window.WorldMap.transformObjects(batchCopy,batchCopy.map(p=>p.id),{dx:x-b.left,dy:y-b.top});
        const groupId=freshId(),copyName=batchCopy.every(p=>p.groupName===batchCopy[0].groupName) && batchCopy[0].groupName ? batchCopy[0].groupName.slice(0,69)+' · копия' : 'Копия набора',used=[groupId],copies=moved.map(p=>{const id=freshId(used);used.push(id);return {id,kind:p.kind,x:p.x,y:p.y,turn:p.turn,hidden:!!p.hidden,groupId,groupName:copyName};});
        selection=new Set(copies.map(p=>p.id));selected=copies.at(-1).id;
        if(!e('placement-repeat').checked){batchCopy=copyTemplate=null;tool='select';}
        objects([...draft.objects,...copies]);status('Набор скопирован. Связи с интерьерами и генераторами не копируются.');
      }catch(error){status(error.message);}return;
    }

    if (draft.objects.length >= window.WorldMap.objectLimit) return status('Достигнут лимит 3 000 объектов');
    const settings = placementSettings();
    let id;
    for (let attempt = 0; attempt < 8; attempt++) {
      id = crypto.randomUUID?.() || 'object-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      if (!draft.objects.some(item => item.id === id)) break;
      id = undefined;
    }
    if (!id) return status('Не удалось создать новый ID объекта. Повтори расстановку.');
    const item = { id, kind: settings.kind, x, y, turn: settings.turn, ...(settings.hidden ? { hidden: true } : {}) };
    selected = id; selection=new Set([id]);
    if (!e('placement-repeat').checked) { copyTemplate = null; tool = 'select'; }
    objects([...draft.objects, item]);
    status(e('placement-repeat').checked ? 'Объект поставлен. Укажи следующее место или нажми Esc.' :
      'Объект поставлен. Перетащи его или нажми Delete, чтобы убрать.');
  }
  function updateSelected(patch) {
    if (!draft || busy || !draft.objects.some(item => item.id === selected)) return;
    const ids=new Set(selectedMembers().map(p=>p.id));
    objects(draft.objects.map(item => ids.has(item.id) ? { ...item, ...patch } : item));
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
    const ids=selection.has(id) ? selection : new Set([id]);
    selected = undefined;selection=new Set();
    objects(draft.objects.filter(item => !ids.has(item.id)));
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
          changeContour({ points: [{ x, y }], entrance: null });
          status('Укажи противоположный угол прямоугольного района.');
        } else {
          const first = generatorPoints[0];
          if (first.x === x || first.y === y) return status('Углы должны задавать прямоугольник с шириной и высотой.');
          changeContour({ points: [first, { x, y: first.y }, { x, y }, { x: first.x, y }], entrance: null });
          status('Контур района выбран. Задай число домов и seed, затем нажми «Предпросмотр».');
        }
        clearGeneratorPreview(); paint(); return;
      }
      const forest = generatorKind() !== 'path';
      if (generatorKind() === 'room' && pickingEntrance) {
        const next = { x, y };
        if (!window.WorldGenerators.validContour('room', generatorPoints, next)) return status('Вход должен находиться на прямой стене, вдали от углов.');
        changeContour({ points: generatorPoints, entrance: next }); pickingEntrance = false;
        status('Вход выбран. Проверь предпросмотр комнаты.'); paint(); return;
      }
      const maxPoints = forest ? maxForestPoints : maxPathPoints;
      const usedPoints = forest ? generatorPoints : generatorPoints.slice(-1);
      if (usedPoints.some(point => point.x === x && point.y === y)) return;
      if (generatorPoints.length >= maxPoints) return status('Допустимо не больше ' + maxPoints + ' опорных точек');
      changeContour({ points: [...generatorPoints, { x, y }], entrance: roomEntrance });
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
      selectItems(item?[item.id]:[]);
      return paint();
    }
    if (placing()) return placeObject(x, y);
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
    background:()=>editor.classList.contains('world-editor-expanded')?'#343c32':'#e8dec5',
    grid: () => e('grid').checked, click, pan: () => tool === 'pan', selected: () => selected,
    selectedIds:()=>tool==='select' ? selectedMembers().map(p=>p.id) : [],
    marquee:()=>tool==='select' && e('marquee').checked,
    selectArea(a,b,additive){
      if(busy || !draft)return;const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
      const ids=draft.objects.filter(p=>{const c=window.WorldMap.footprint(p);return c.x>=left&&c.x<=right&&c.y>=top&&c.y<=bottom;}).map(p=>p.id);
      selectItems(additive ? [...selectedMembers().map(p=>p.id),...ids] : ids);paint();
    },
    previewMove(item,x,y){try{return window.WorldMap.transformObjects(draft.objects,selectedMembers().map(p=>p.id),{dx:x-item.x,dy:y-item.y});}catch{return draft.objects;}},
    placementPreview(x, y) {
      if (!draft || busy || !placing() || !window.WorldMap.valid(x) || !window.WorldMap.valid(y)) return null;
      if(batchCopy){try{const b=window.WorldMap.selectionBounds(batchCopy),props=window.WorldMap.transformObjects(batchCopy,batchCopy.map(p=>p.id),{dx:x-b.left,dy:y-b.top});return {prop:props[0],props,allowed:draft.objects.length+props.length<=window.WorldMap.objectLimit};}catch{return null;}}
      return { prop: { id: 'placement-preview', ...placementSettings(), x, y },
        allowed: draft.objects.length < window.WorldMap.objectLimit };
    },
    brushPreview(x, y) {
      if (!draft || busy || strokeError || e('rect').checked || (!terrain[tool] && tool !== 'erase') ||
          !window.WorldMap.valid(x) || !window.WorldMap.valid(y)) return null;
      return window.WorldBrush.cells(x, y, Number(e('brush-size').value || 1), e('brush-shape').value || 'circle');
    },
    startStroke(x, y) {
      if (!draft || busy || e('rect').checked || (!terrain[tool] && tool !== 'erase') ||
          !window.WorldMap.valid(x) || !window.WorldMap.valid(y)) return false;
      brushDraft = draft; strokeError = null;
      brushStroke = window.WorldBrush.start(draft.chunks, { width: Number(e('brush-size').value || 1),
        shape: e('brush-shape').value || 'circle', type: tool === 'erase' ? undefined : tool });
      this.strokeTo(x, y);
      paint();
      return true;
    },
    strokeTo(x, y) {
      if (!brushStroke || strokeError) return;
      try { brushStroke.add(x, y); }
      catch (error) { strokeError = error; status(error.message); paint(); return; }
      // During a drag refresh only the map, not every inspector and building selector.
      editorView.data({ ...draft, chunks: brushStroke.chunks });
    },
    endStroke(commit) {
      if (!brushStroke) return;
      const stroke = brushStroke, source = brushDraft, error = strokeError;
      brushStroke = brushDraft = strokeError = null;
      if (commit && !error && source === draft && !busy) {
        const change = stroke.finish();
        if (change.tiles.length) return edit(change);
      }
      paint(); status(error ? error.message : commit ? 'Покрытие уже совпадает с кистью' : 'Мазок отменён');
    },
    marks: () => generatorTool() ? [...generatorPoints, ...(tool === 'generate-room' && roomEntrance ? [roomEntrance] : [])] : first ? [first] : [],
    outline: () => ['generate-forest','generate-room','generate-district'].includes(tool) ? generatorPoints : null,
    contour: () => generatorTool() ? { ...(dragContour || contourSnapshot()), closed: generatorKind() !== 'path', selected: selectedVertex } : null,
    pickHandle(x, y, tolerance) {
      if (!draft || busy || !generatorTool() || pickingEntrance) return null;
      const handles = generatorPoints.map((p, index) => ({ ...p, index }));
      if (roomEntrance) handles.unshift({ ...roomEntrance, index: 'entrance' });
      const handle = handles.find(p => Math.hypot(x - p.x - .5, y - p.y - .5) <= tolerance);
      if (handle) { selectedVertex = handle.index; paint(); }
      return handle;
    },
    previewHandle(handle, x, y) {
      try { dragContour = window.WorldGenerators.editContour(generatorKind(), generatorPoints, roomEntrance,
        { type: handle.index === 'entrance' ? 'entrance' : 'move', index: handle.index, x, y }); }
      catch { dragContour = { ...contourSnapshot(), invalid: true }; }
    },
    moveHandle(handle, x, y) {
      if (x === handle.x && y === handle.y) { dragContour = null; return paint(); }
      modifyContour({ type: handle.index === 'entrance' ? 'entrance' : 'move', index: handle.index, x, y });
    },
    cancelHandle() { dragContour = null; paint(); },
    pickProp(x, y,event={}) {
      if (!draft || busy || tool !== 'select') return;
      let item = objectAt(x, y);
      if(event.altKey){const hits=[...draft.objects].reverse().filter(p=>{const b=window.WorldMap.footprint(p);return x>=b.x-b.width/2&&x<b.x+b.width/2&&y>=b.y-b.height/2&&y<b.y+b.height/2;});item=hits[(hits.findIndex(p=>p.id===selected)+1)%hits.length];}
      if(event.ctrlKey || event.metaKey || event.shiftKey){
        const ids=new Set(selectedMembers().map(p=>p.id)),unit=item ? draft.objects.filter(p=>p.id===item.id || item.groupId && p.groupId===item.groupId).map(p=>p.id) : [];
        const remove=item && ids.has(item.id);for(const id of unit)remove ? ids.delete(id) : ids.add(id);selectItems([...ids]);paint();return;
      }
      if(!item || !selectedMembers().some(p=>p.id===item.id))selectItems(item?[item.id]:[]);
      selected=item?.id;paint();return item;
    },
    moveProp(item, x, y) {
      if (tool !== 'select' || item.id !== selected) return;
      if(selectedMembers().length>1)moveSelection({dx:x-item.x,dy:y-item.y});else updateSelected({ x, y });
    },
  });
  e('canvas').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); history(event.key.toLowerCase() === 'z' && !event.shiftKey); return;
    }
    if (event.key === 'Delete' && generatorTool() && !e('vertex-delete').disabled) {
      event.preventDefault(); e('vertex-delete').onclick(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault(); if (!placing()) beginCopy(); return;
    }
    if (placing() && event.key === 'Escape') { event.preventDefault(); stopPlacement(); return; }
    if (placing() && event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); turnPlacement(); return;
    }
    if(tool==='select' && draft && (event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selectItems(draft.objects.map(p=>p.id));paint();return;}
    if(tool==='select' && selectedMembers().length){
      const key=event.key.toLowerCase();
      if(key==='r'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();e('turn').onclick();return;}
      const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(direction){event.preventDefault();moveSelection({dx:direction[0]*(event.shiftKey?10:1),dy:direction[1]*(event.shiftKey?10:1)});return;}
      if(event.key==='Escape'){event.preventDefault();selection=new Set();selected=undefined;paint();return;}
    }
    if (event.key === 'Delete' && tool === 'select' && selected) {
      event.preventDefault();
      removeObject(selected);
    }
  });

  function frameMap(updateExport=false) {
    if (!draft) return;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const [key,chunk] of Object.entries(draft.chunks)) {
      const [cx,cy]=key.split(',').map(Number);
      for(const offset of Object.keys(chunk)) {
        const x=cx*window.WorldMap.size+Number(offset)%window.WorldMap.size,y=cy*window.WorldMap.size+Math.floor(Number(offset)/window.WorldMap.size);
        left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
      }
    }
    for(const prop of draft.objects){const b=window.WorldMap.visualBounds(prop);left=Math.min(left,b.left);right=Math.max(right,b.right);top=Math.min(top,b.top);bottom=Math.max(bottom,b.bottom);}
    if(!Number.isFinite(left))return editorView.setCamera({x:0,y:0,scale:24});
    if(updateExport===true)fillExportArea({left:Math.floor(left),top:Math.floor(top),right:Math.ceil(right),bottom:Math.ceil(bottom)});
    editorView.setCamera({x:(left+right)/2,y:(top+bottom)/2,scale:Math.min(42,((e('canvas').clientWidth||1000)-40)/(right-left+2),((e('canvas').clientHeight||480)-40)/(bottom-top+2))});
  }
  e('frame').onclick=()=>frameMap();
  function fillExportArea(area){for(const key of ['left','top','right','bottom'])e('export-'+key).value=String(Math.max(-window.WorldMap.limit,Math.min(window.WorldMap.limit,area[key])));}
  e('export-viewport').onclick=()=>{
    const camera=editorView.camera(),width=(e('canvas').clientWidth||1000)/camera.scale,height=(e('canvas').clientHeight||480)/camera.scale;
    fillExportArea({left:Math.floor(camera.x-width/2),right:Math.ceil(camera.x+width/2),top:Math.floor(camera.y-height/2),bottom:Math.ceil(camera.y+height/2)});
  };
  e('export').onclick=()=>run(async()=>{
    if(!draft)return;
    const area=Object.fromEntries(['left','top','right','bottom'].map(key=>[key,e('export-'+key).valueAsNumber]));
    const plan=window.WorldMap.exportPlan(area,Number(e('export-scale').value));
    const blob=await createWorldView.exportImage(draft,{area,pixelsPerCell:plan.pixelsPerCell,grid:e('export-grid').value,transparent:e('export-transparent').checked,includeHidden:false});
    const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='world-map.png';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('PNG готов: '+plan.width+' × '+plan.height+' px. Скрытые предметы и маркеры редактора не включены.');
  });
  function open(data) {
    draft = data;
    dirty = false;
    first = selected = undefined;
    copyTemplate = batchCopy = null; selection=new Set(); placementTurn = 0;
    if (tool === 'place-copy') tool = 'select';
    generatorPoints = [];
    resetContourHistory();
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
    frameMap(true);
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
    const requested = typeof URLSearchParams === 'function' ? new URLSearchParams(location.search || '').get('world') : null;
    if (!draft && requested && worlds.some(item => item.id === requested)) {
      open(await request('/api/worlds/' + encodeURIComponent(requested)));
      const room=draft.generators?.find(item => item.kind === 'room');
      tool = room ? 'generate-room' : 'pan'; paint();
      e('path-saved').value = room?.id || '';
      if (room) loadGeneratorRecipe();
      if(new URLSearchParams(location.search || '').get('editor') === '1' && !editor.classList.contains('world-editor-expanded')) e('expand').onclick();
    }
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
      const creation = { name: form.title.value, ...(form.preset?.value ? { preset: form.preset.value } : { sample: form.sample.checked }) };
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
      resetContourHistory();
      roomEntrance = null; pickingEntrance = false;
      clearGeneratorPreview(true);
    }
    tool = button.dataset.tool;
    copyTemplate = batchCopy = null; placementTurn = 0;
    if (tool === 'generate-room') status('Отметь углы комнаты и вход. Выбери назначение — мебель появится автоматически. Стороны идут по линиям сетки.');
    if (tool === 'generate-district') status('Укажи два противоположных угла района: от 11×11 до 4096 клеток. Затем выбери число домов и seed.');
    if (tool === 'generate-forest') status('Выбери тип участка, отметь вершины по порядку и нажми «Предпросмотр».');
    if (tool === 'generate-path') status('Выбери дорогу, реку или ограду, укажи точки и нажми «Предпросмотр».');
    if (tool === 'generate-path' || tool === 'generate-forest') readTemplates();
    if (tool === 'transition') status('Нажми на исходную клетку перехода');
    if (tool === 'position') status('Выбери героя и нажми на клетку, чтобы перенести его');
    first = undefined;
    paint();
    if (tool === 'select') status('Ctrl/⌘ + клик — добавить объект. Рамка выделяет набор. Группы выбираются целиком.');
    if (tool === 'delete-object') status('Щёлкни по объекту, который хочешь убрать.');
  });
  e('template-select').onchange = paintTemplates;
  e('template-load').onclick = () => {
    if (!draft || busy) return;
    const template = templates.templates.find(item => item.id === e('template-select').value && item.kind === generatorKind());
    if (!template) return;
    resetContourHistory();
    generatorPoints = [];
    roomEntrance = null; pickingEntrance = false;
    clearGeneratorPreview(true);
    e('path-seed').value = String(template.seed);
    if (template.kind === 'forest') { e('forest-density').value = String(template.settings.density); e('plot-biome').value='forest'; e('plot-orientation').value='0'; }
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
  function loadGeneratorRecipe() {
    const recipe = (draft.generators || []).find(item => item.id === e('path-saved').value);
    resetContourHistory();
    generatorPoints = (recipe?.params.points || []).map(p => ({ ...p }));
    roomEntrance = recipe?.kind === 'room' ? { ...recipe.params.entrance } : null; pickingEntrance = false;
    generatorPreview = null;
    if (recipe) {
      if (recipe.kind === 'room') { e('room-floor').value = recipe.params.floor; e('room-theme').value = recipe.params.furnishing || 'none'; }
      else if (recipe.kind === 'district') e('district-count').value = String(recipe.params.count);
      else if (recipe.kind === 'forest') { e('forest-density').value = String(recipe.params.density); e('plot-biome').value=recipe.params.biome || 'forest'; e('plot-orientation').value=String(recipe.params.orientation || 0); }
      else {
        e('path-terrain').value = recipe.params.terrain;
        e('path-width').value = String(recipe.params.width);
      }
      e('path-seed').value = String(recipe.seed);
      const xs=generatorPoints.map(p=>p.x),ys=generatorPoints.map(p=>p.y);
      const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
      editorView.setCamera({ x:(left+right+1)/2, y:(top+bottom+1)/2,
        scale:Math.min(42,((e('canvas').clientWidth||1000)-56)/(right-left+3),((e('canvas').clientHeight||480)-56)/(bottom-top+3)) });
      status('Рецепт загружен. Нажми «Предпросмотр».');
    }
    paint();
  }
  e('path-saved').onchange = () => { if (draft && !busy) loadGeneratorRecipe(); };
  for (const field of ['path-terrain', 'path-width', 'path-seed', 'forest-density', 'plot-biome', 'plot-orientation', 'room-floor', 'room-theme', 'district-count']) {
    e(field).oninput = () => {
      if (busy) return;
      clearGeneratorPreview();
      if (generatorPoints.length >= 2) status('Нажми «Предпросмотр» для обновлённого участка.');
      paint();
    };
  }
  e('path-clear-points').onclick = () => {
    if (!draft || busy) return;
    changeContour({ points: [], entrance: null }); pickingEntrance = false;
    status('Укажи новый контур или линию. Сохранённый участок будет перестроен после применения.');
    paint();
  };
  e('path-reset').onclick = () => {
    if (!draft || busy) return;
    resetContourHistory();
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
  e('vertex').onchange = () => { selectedVertex = e('vertex').value === 'entrance' ? 'entrance' :
    e('vertex').value === '' ? null : Number(e('vertex').value); paint(); };
  e('vertex-move').onclick = () => {
    if (selectedVertex === null) return;
    modifyContour({ type: selectedVertex === 'entrance' ? 'entrance' : 'move', index: selectedVertex,
      x: e('vertex-x').valueAsNumber, y: e('vertex-y').valueAsNumber });
  };
  e('vertex-insert').onclick = () => { if (!e('vertex-insert').disabled) modifyContour({ type: 'insert', index: selectedVertex }); };
  e('vertex-delete').onclick = () => { if (!e('vertex-delete').disabled) modifyContour({ type: 'remove', index: selectedVertex }); };
  e('path-preview').onclick = previewGenerator;
  const sameDistrictValue = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && sameDistrictValue(a[key], b[key])));
  const sameDistrictSnapshot = (a, b) => sameDistrictValue(a.chunks, b.chunks) &&
    sameDistrictValue(a.generators || [], b.generators || []) && a.objects.length === b.objects.length &&
    a.objects.every((item, index) => ['id','kind','x','y','turn','groupId','groupName'].every(key => item[key] === b.objects[index][key]) &&
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
          resetContourHistory();
          paint();
          e('path-saved').value = preview.id;
          status('Район сохранён. Отмена и повтор доступны; для ТВ нажми «Показать игрокам».');
        } catch (error) { generatorPreview = null; throw error; }
      });
    }
    const { id, tiles, objects, generators } = generatorPreview;
    resetContourHistory();
    if (!tiles.length && !objects && generators.before === generators.after) {
      generatorPreview = null;
      paint();
      return status('Результат уже есть в черновике.');
    }
    edit({ tiles, objects, generators, recipeId: id });
    e('path-saved').value = id;
    paint();
  };
  e('rect').onchange = () => { first = undefined; paint(); };
  e('copy').onclick = beginCopy;
  e('placement-turn').onclick = turnPlacement;
  e('placement-stop').onclick = stopPlacement;
  e('brush-size').onchange = e('brush-shape').onchange = () => editorView.draw?.();
  e('grid').onchange = () => editorView.draw?.();
  function history(backwards) {
    if (busy) return;
    const contourFrom = backwards ? contourUndo : contourRedo, contourTo = backwards ? contourRedo : contourUndo;
    if (generatorTool() && contourFrom.length) {
      contourTo.push(contourSnapshot()); setContour(contourFrom.pop()); selectedVertex = null;
      paint(); status(backwards ? 'Правка контура отменена.' : 'Правка контура повторена.'); return;
    }
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
  function moveSelection(change){
    if(!draft||busy||brushStroke)return;
    try{const after=window.WorldMap.transformObjects(draft.objects,selectedMembers().map(p=>p.id),change);if(JSON.stringify(after)!==JSON.stringify(draft.objects))objects(after);}catch(error){status(error.message);}
  }
  e('turn').onclick = () => { const item = draft?.objects.find(prop => prop.id === selected); if(selectedMembers().length>1)moveSelection({turns:1});else if(item)updateSelected({turn:(item.turn+1)%4}); };
  e('move').onclick=()=>moveSelection({dx:e('move-x').valueAsNumber,dy:e('move-y').valueAsNumber});
  e('group').onclick=()=>{
    if(!draft||busy||selectedMembers().length<2)return;
    try{const groupId=freshId(),groupName=e('group-name').value.trim() || 'Группа объектов',ids=new Set(selectedMembers().map(p=>p.id));
      objects(draft.objects.map(p=>ids.has(p.id)?{...p,groupId,groupName}:p));e('group-name').value='';status('Группа создана. Ручной состав сохранится при регенерации.');
    }catch(error){status(error.message);}
  };
  e('ungroup').onclick=()=>{
    if(!draft||busy)return;const ids=new Set(selectedMembers().map(p=>p.id));
    objects(draft.objects.map(p=>{if(!ids.has(p.id))return p;const {groupId,groupName,...rest}=p;return rest;}));status('Объекты разгруппированы');
  };
  e('group-rename').onclick=()=>{
    if(!draft||busy)return;const name=e('group-name').value.trim().slice(0,80);if(!name)return status('Введи название группы');
    updateSelected({groupName:name});e('group-name').value='';
  };
  e('groups').onchange=()=>{if(!draft||busy)return;selectItems(draft.objects.filter(p=>p.groupId===e('groups').value).map(p=>p.id));tool='select';batchCopy=copyTemplate=null;paint();};

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

'use strict';

(() => {
  const { esc, request } = window.LootUI;
  const types = { map: 'Карта', creature: 'Существо', npc: 'Персонаж мастера', item: 'Предмет', trap: 'Ловушка', scenery: 'Окружение' };
  const host = document.getElementById('book-content-catalog');
  host.innerHTML = `
    <section class="book-library">
      <form id="catalog-save" class="book-toolbar">
        <select class="book-select" name="source" aria-label="Что сохранить в общую библиотеку" required></select>
        <input class="book-select" name="tags" placeholder="Метки через запятую" aria-label="Метки заготовки" maxlength="288">
        <button class="book-button primary">Сохранить заготовку</button>
      </form>
      <p class="book-status" id="catalog-status" role="status"></p>
      <div id="catalog-result"></div>
      <div class="book-toolbar">
        <input class="book-select" id="catalog-search" placeholder="Поиск по названию или метке" aria-label="Поиск в общей библиотеке">
        <select class="book-select" id="catalog-kind" aria-label="Тип заготовки">
          <option value="">Все типы</option>
          ${Object.entries(types).map(([id, title]) => `<option value="${id}">${title}</option>`).join('')}
        </select>
      </div>
      <div data-library-list id="catalog-list"></div>
    </section>`;
  const $ = id => document.getElementById('catalog-' + id);
  const form = $('save');
  const source = form.elements.source;
  let entries = [];
  let choices = [];

  function render() {
    const query = $('search').value.trim().toLocaleLowerCase('ru');
    const type = $('kind').value;
    $('list').innerHTML = entries.filter(item => (!type || item.kind === type) &&
      [item.name, ...item.tags].some(value => value.toLocaleLowerCase('ru').includes(query)))
      .map(item => `<div class="book-stock-entry">
        ${item.kind === 'map' ? '<img class="catalog-thumb" alt="" loading="lazy" src="/api/catalog/' + encodeURIComponent(item.id) + '/image">' : ''}
        <div><strong>${esc(item.name)}</strong><small>${[types[item.kind], ...item.tags].map(esc).join(' · ')}</small></div>
        <button class="book-button small" data-catalog-import="${esc(item.id)}" aria-label="Добавить в кампанию: ${esc(item.name)}">Добавить в кампанию</button>
      </div>`).join('') || '<p class="book-empty">Подходящих заготовок нет</p>';
  }

  async function load() {
    try {
      const [catalog, cards, maps] = await Promise.all([request('/api/catalog'), request('/api/library'), request('/api/scenes')]);
      entries = catalog.entries;
      choices = [
        ...cards.entries.filter(card => !card.archived).map(card => ({ cardId: card.id, label: types[card.kind] + ' · ' + card.name })),
        ...maps.scenes.filter(scene => !scene.legacyExample).flatMap(scene => (scene.views || [])
          .filter(view => /^\/assets\/maps\/[^/]+\.(png|jpe?g)$/i.test(view.image || ''))
          .map(view => ({ sceneId: scene.id, viewId: view.id, label: 'Карта · ' + (view.label || scene.label) }))),
      ];
      source.replaceChildren(new Option('Выберите карту или карточку кампании', ''),
        ...choices.map((item, i) => new Option(item.label, String(i))));
      render();
    } catch (error) { $('status').textContent = error.message; }
  }

  form.onsubmit = async event => {
    event.preventDefault();
    if (!source.value) return;
    const button = event.submitter;
    button.disabled = true;
    try {
      const { label, ...item } = choices[Number(source.value)];
      const tags = form.elements.tags.value.split(',').map(tag => tag.trim()).filter(Boolean);
      const entry = await request('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, tags }),
      });
      entries.push(entry);
      form.reset();
      render();
      $('status').textContent = 'Заготовка добавлена в общую библиотеку';
    } catch (error) { $('status').textContent = error.message; }
    finally { button.disabled = false; }
  };

  $('list').onclick = async event => {
    const button = event.target.closest('[data-catalog-import]');
    if (!button) return;
    button.disabled = true;
    $('result').replaceChildren();
    try {
      const result = await request('/api/catalog/' + encodeURIComponent(button.dataset.catalogImport) + '/import', { method: 'POST' });
      if (result.scene) {
        sceneData.push(result.scene);
        renderScenesPanel();
        const link = document.createElement('a');
        link.className = 'book-button';
        const params = new URLSearchParams({ game: window.currentCampaignId || 'default', draft: result.draft });
        link.href = '/map-builder?' + params;
        link.textContent = 'Редактировать копию карты';
        $('result').append(link);
        $('status').textContent = 'Карта добавлена. Ищите её в разделе «Карты», группа «Из библиотеки».';
      } else {
        window.dispatchEvent(new Event('book-library-changed'));
        $('status').textContent = 'Копия карточки добавлена в эту кампанию';
      }
      await load();
    } catch (error) { $('status').textContent = error.message; }
    finally { button.disabled = false; }
  };

  $('search').oninput = render;
  $('kind').onchange = render;
  window.addEventListener('book-section-change', event => { if (event.detail === 'catalog') load(); });
  if (document.body.dataset.bookView === 'catalog') load();
})();

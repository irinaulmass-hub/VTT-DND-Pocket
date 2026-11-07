'use strict';

(() => {
  const { request } = window.LootUI;
  const panel = document.createElement('div');
  panel.className = 'book-location-links';
  panel.innerHTML = `
    <details>
      <summary>Переходы между локациями</summary>
      <p data-location-current></p>
      <div class="book-shortcuts" data-location-links></div>
      <form class="book-toolbar">
        <select class="book-select" name="destination" required aria-label="Куда ведёт переход"></select>
        <label><input type="checkbox" name="returnLink" checked> Обратный путь</label>
        <button class="book-button">Связать</button>
      </form>
      <p class="book-status" role="status"></p>
    </details>`;
  document.getElementById('section-map-control').insertBefore(panel, document.getElementById('map-control-grid'));
  const form = panel.querySelector('form');
  const destination = form.elements.destination;
  const status = panel.querySelector('[role=status]');
  const list = panel.querySelector('[data-location-links]');
  let links = [];

  function render() {
    const maps = new Map(sceneData.flatMap(scene => (scene.views || [])
      .filter(view => view.id && view.image)
      .map(view => [view.id, view.label === scene.label ? scene.label : scene.label + ' · ' + (view.label || 'Карта')])));
    const current = currentViewFogKey;
    panel.querySelector('[data-location-current]').textContent = current
      ? 'Сейчас: ' + (maps.get(current) || lastSceneViewPayload?.label || 'Текущая карта')
      : 'Покажите карту, чтобы создать переход из этой локации.';
    form.hidden = !current || maps.size < 2;
    const previous = destination.value;
    destination.replaceChildren(new Option('Куда ведёт переход', ''),
      ...[...maps].filter(([id]) => id !== current).map(([id, title]) => new Option(title, id)));
    if ([...destination.options].some(option => option.value === previous)) destination.value = previous;
    list.replaceChildren();
    for (const link of links.filter(link => link.from === current && maps.has(link.to))) {
      const group = document.createElement('span');
      group.className = 'book-location-link';
      const go = document.createElement('button');
      go.className = 'book-button primary';
      go.textContent = '→ ' + maps.get(link.to);
      go.onclick = () => {
        status.textContent = openBookLocation(link.to) ? '' : 'Нет связи со столом мастера';
      };
      const remove = document.createElement('button');
      remove.className = 'book-button small';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Убрать переход в ' + maps.get(link.to));
      remove.onclick = async () => {
        remove.disabled = true;
        try {
          links = (await request('/api/locations/links/' + encodeURIComponent(link.id), { method: 'DELETE' })).links;
          render();
        } catch (error) {
          status.textContent = error.message;
          remove.disabled = false;
        }
      };
      group.append(go, remove);
      list.append(group);
    }
  }

  form.onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const result = await request('/api/locations/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: currentViewFogKey, to: destination.value, returnLink: form.elements.returnLink.checked }),
      });
      links = result.links;
      status.textContent = 'Переход сохранён';
      render();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  window.addEventListener('book-location-changed', render);
  window.addEventListener('book-locations-loaded', render);
  request('/api/locations/links').then(result => { links = result.links; render(); })
    .catch(error => { status.textContent = error.message; });
  render();
})();

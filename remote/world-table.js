'use strict';

(() => {
  if (!document.documentElement.hasAttribute('data-table-view')) return;
  const panel = document.createElement('div');
  panel.id = 'world-table';
  panel.hidden = true;
  panel.innerHTML = `<canvas class="world-canvas" aria-label="Большая карта игроков"></canvas>
    <div class="world-table-controls"><button type="button">К партии</button>
    <label><input type="checkbox"> Следовать за партией</label></div>`;
  document.body.append(panel);
  const follow = panel.querySelector('input');
  let id, serial, generation = 0, timer;
  const view = createWorldView(panel.querySelector('canvas'), { player: true, changed: schedule });
  panel.querySelector('button').onclick = view.party;
  follow.onchange = () => { if (follow.checked) view.party(); };

  function schedule() {
    if (!id) return;
    clearTimeout(timer);
    const requestId = ++generation;
    timer = setTimeout(() => load(requestId), 70);
  }

  async function load(requestId) {
    const area = view.bounds();
    const size = window.WorldMap.size;
    const keys = [];
    for (let y = Math.floor((area.top - 1) / size); y <= Math.floor((area.bottom + 1) / size); y++) {
      for (let x = Math.floor((area.left - 1) / size); x <= Math.floor((area.right + 1) / size); x++) keys.push(x + ',' + y);
    }
    try {
      const response = await fetch('/api/worlds/table?chunks=' + encodeURIComponent(keys.join(';')));
      if (!response.ok) return;
      const data = await response.json();
      if (requestId !== generation || data?.id !== id) return;
      view.data(data);
    } catch { /* Keep the last rendered area until the connection resumes. */ }
  }

  function activate(update) {
    const wasActive = !!id;
    const changed = id !== update.id;
    id = update.id;
    panel.hidden = !id;
    document.documentElement.toggleAttribute('data-world-table', !!id);
    if (!id) {
      ++generation;
      if (wasActive) wsSend({ action: 'request-sync' });
      return;
    }
    if (changed) {
      view.data({ chunks: {}, objects: [], tokens: [] });
      stopAudio();
    }
    if (changed || serial !== update.frame?.serial) {
      serial = update.frame?.serial;
      if (update.frame) view.setCamera(update.frame, false);
    } else if (follow.checked && update.party) {
      view.setCamera({ ...view.camera(), ...update.party }, false);
    }
    schedule();
  }
  window.addEventListener('world-update', event => activate(event.detail));
  if (ws?.readyState === WebSocket.OPEN) wsSend({ action: 'request-sync' });
})();

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
  const blackoutOverlay = document.getElementById('blackout-overlay');
  let current, generation = 0, screenGeneration = 0, timer;
  let pending = false, loaded = false, checking = false;
  const view = createWorldView(panel.querySelector('canvas'), { player: true, changed: schedule });
  panel.querySelector('button').onclick = view.party;
  follow.onchange = () => { if (follow.checked) view.party(); };

  function compareVersion(a, b) {
    return a.generation - b.generation || a.publication - b.publication || a.exploration - b.exploration;
  }

  function schedule() {
    if (!current?.id) return;
    loaded = false;
    pending = true;
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
      const response = await fetch('/api/worlds/table?chunks=' + encodeURIComponent(keys.join(';')), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (requestId !== generation) return;
      if (!data || compareVersion(data.version, current.version) > 0) {
        refreshStatus();
        return;
      }
      if (data.id === current.id && compareVersion(data.version, current.version) === 0) {
        view.data(data);
        loaded = true;
      }
    } catch { /* Keep the current drawing. The next status check retries the request. */ }
    finally { if (requestId === generation) pending = false; }
  }

  function activate(update) {
    if (!update?.version) return;
    const order = current ? compareVersion(update.version, current.version) : 1;
    if (order < 0) return;
    if (order === 0) {
      if (!pending && !loaded) schedule();
      return;
    }

    const previous = current;
    current = update;
    panel.hidden = !update.id;
    document.documentElement.toggleAttribute('data-world-table', !!update.id);
    if (!update.id) {
      clearTimeout(timer);
      ++generation;
      pending = loaded = false;
      if (previous?.id) wsSend({ action: 'request-sync' });
      return;
    }

    const changed = previous?.id !== update.id || previous?.version.generation !== update.version.generation;
    if (changed) {
      view.data({ chunks: {}, objects: [], tokens: [] });
      stopAudio();
    }
    if (changed || previous.frame?.serial !== update.frame?.serial) {
      if (update.frame) view.setCamera(update.frame, false);
    } else if (follow.checked && update.party) {
      view.setCamera({ ...view.camera(), ...update.party }, false);
    }
    schedule();
  }

  async function refreshStatus() {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    const screen = screenGeneration;
    try {
      const response = await fetch('/api/worlds/table/status', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const update = await response.json();
      if (!update?.version || (current && compareVersion(update.version, current.version) < 0)) return;
      if (screen === screenGeneration && update.blackout !== (blackoutOverlay.style.display === 'block')) {
        handleMessage({ type: 'BLACKOUT', active: update.blackout });
      }
      activate(update);
    } catch { /* The next check or WebSocket update restores synchronization. */ }
    finally { checking = false; }
  }

  window.addEventListener('world-update', event => activate(event.detail));
  window.addEventListener('table-presentation-change', () => { ++screenGeneration; });
  window.addEventListener('online', refreshStatus);
  document.addEventListener('visibilitychange', refreshStatus);
  setInterval(refreshStatus, 5000);
  refreshStatus();
  if (ws?.readyState === WebSocket.OPEN) wsSend({ action: 'request-sync' });
})();

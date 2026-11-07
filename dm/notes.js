'use strict';
(() => {
  const button = document.createElement('button');
  button.id = 'notes-launcher';button.textContent = '✎ Заметки мастера';
  button.className = 'btn btn-secondary';
  button.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:800;min-height:44px';
  document.body.append(button);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'notes-title');
  dialog.style.cssText = 'width:min(780px,94vw);max-height:90dvh;overflow:auto;background:#19211e;color:#eee4ce;border:1px solid #9b733e;border-radius:14px;padding:24px';
  dialog.innerHTML = '<h2 id="notes-title">Заметки мастера</h2><p>Сюжет, секреты и подготовка. Эти записи видны только мастеру.</p><label for="notes-scope">Раздел</label> <select id="notes-scope"><option value="">Вся кампания</option></select> <button type="button" id="notes-current">Текущая сцена</button><p><label for="notes-text">Текст заметки</label></p><textarea id="notes-text" rows="15" maxlength="200000" style="box-sizing:border-box;width:100%;padding:12px;background:#101713;color:#eee4ce;border:1px solid #526050;border-radius:8px;font:16px/1.6 system-ui;resize:vertical" placeholder="Что произошло, кого встретят герои, что скрыто от игроков…"></textarea><p id="notes-status" role="status" aria-live="polite"></p><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" id="notes-save">Сохранить</button><button type="button" id="notes-reload">Загрузить сохранённое</button><button type="button" id="notes-close">Закрыть</button></div><p><small>Черновик остаётся на этом устройстве при переключении разделов. Для сохранения в игре нажмите «Сохранить» или Ctrl+Enter.</small></p>';
  document.body.append(dialog);
  const scope = dialog.querySelector('#notes-scope'), text = dialog.querySelector('textarea'), status = dialog.querySelector('#notes-status'), save = dialog.querySelector('#notes-save');
  let active = '', revision = 0, loading = false, saving = false, request = 0;
  const draftKey = key => 'dm-note-draft:' + (key || 'campaign');
  const endpoint = key => '/api/notes' + (key ? '?scene=' + encodeURIComponent(key) : '');
  function draft() {
    if (loading) return;
    try { localStorage.setItem(draftKey(active), JSON.stringify({ text: text.value, revision })); }
    catch { status.textContent = 'Не удалось сохранить черновик на устройстве. Нажмите «Сохранить».'; }
  }
  async function load(key, savedOnly = false) {
    const token = ++request;
    active = key; scope.value = key; loading = true; text.disabled = true; save.disabled = true;
    status.textContent = 'Загрузка…';
    try {
      const res = await fetch(endpoint(key), { cache: 'no-store' });
      if (!res.ok) throw Error('Не удалось загрузить заметку. Проверьте соединение и вход мастера.');
      const note = await res.json();
      if (token !== request) return;
      let local;
      try { local = JSON.parse(localStorage.getItem(draftKey(key))); } catch {}
      revision = note.revision; text.value = note.text;
      if (local && !savedOnly && typeof local.text === 'string') {
        text.value = local.text; revision = local.revision;
        status.textContent = revision !== note.revision ? 'На сервере есть новая версия. Ваш черновик сохранён. Скопируйте нужный текст перед загрузкой сохранённого.' : 'Восстановлен черновик с этого устройства.';
      } else {
        if (savedOnly) localStorage.removeItem(draftKey(key));
        status.textContent = note.updatedAt ? 'Сохранено: ' + new Date(note.updatedAt).toLocaleString('ru-RU') : 'Новая заметка';
      }
      text.disabled = false;
    } catch (e) { if (token === request) status.textContent = e.message; }
    finally { if (token === request) { loading = false; save.disabled = text.disabled; } }
  }
  async function persist() {
    if (loading || saving || text.disabled) return;
    const key = active, value = text.value, version = revision;
    saving = true; save.disabled = true; scope.disabled = true; status.textContent = 'Сохранение…';
    try {
      const res = await fetch(endpoint(key), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value, revision: version }) });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || 'Не удалось сохранить заметку');
      revision = result.revision;
      if (text.value === value) { localStorage.removeItem(draftKey(key)); status.textContent = 'Сохранено в кампании'; }
      else { draft(); status.textContent = 'Сохранено. Последние изменения пока в черновике.'; }
    } catch (e) { draft(); status.textContent = e.message + ' Текст остаётся в черновике.'; }
    finally { saving = false; save.disabled = false; scope.disabled = false; }
  }
  button.onclick = async () => {
    if (saving) return;
    dialog.showModal();
    const previous = active;
    scope.replaceChildren(new Option('Вся кампания', ''));
    for (const scene of (typeof sceneData !== 'undefined' ? sceneData : [])) {
      if (scene.id) scope.add(new Option(scene.label || scene.id, scene.id));
    }
    const key = [...scope.options].some(o => o.value === previous) ? previous : '';
    await load(key);
  };
  text.oninput = () => { draft(); status.textContent = 'Есть несохранённые изменения · черновик на этом устройстве'; };
  scope.onchange = () => load(scope.value);
  save.onclick = persist;
  dialog.querySelector('#notes-reload').onclick = () => { if (!saving) load(active, true); };
  dialog.querySelector('#notes-current').onclick = () => {
    if (saving) return;
    const id = window.notesCurrentSceneId;
    if (!id || ![...scope.options].some(o => o.value === id)) { status.textContent = 'Сначала покажите сцену на карте или выберите её в списке.'; return; }
    load(id);
  };
  dialog.querySelector('#notes-close').onclick = () => dialog.close();
  dialog.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); persist(); } });
})();

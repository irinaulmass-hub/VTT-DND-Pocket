'use strict';

// Containers and inventories share one atomic snapshot: a transfer cannot save only half.
module.exports = function registerLoot(app, { express, crypto, loadCharacters, saveCharacters, isDmAuthed, requireDm, broadcast }) {
  const rarities = new Set(['common', 'uncommon', 'rare', 'very-rare', 'legendary']);
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось сохранить добычу. Повторите запрос.' }); }
  };
  const text = (value, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Проверьте текстовые поля.');
    return value.trim();
  };
  const quantity = value => {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100000) fail(400, 'Количество должно быть целым числом от 1 до 100000.');
    return value;
  };
  const containers = data => data.lootContainers || (data.lootContainers = []);
  const find = (data, id) => containers(data).find(c => c.id === id) || fail(404, 'Контейнер не найден.');
  const checkRevision = (container, revision) => {
    if (!Number.isSafeInteger(revision) || container.revision !== revision) fail(409, 'Содержимое изменилось. Обновите контейнер перед действием.');
  };
  const publicContainer = c => ({ id: c.id, name: c.name, tokenId: c.tokenId, mapKey: c.mapKey, revision: c.revision, items: c.items });
  function changed(data) {
    saveCharacters(data);
    broadcast({ type: 'LOOT_CHANGED' }); // Hidden contents never enter public broadcasts.
  }
  app.get('/api/loot', route((req, res) => {
    let list = containers(loadCharacters());
    if (!isDmAuthed(req)) list = list.filter(c => c.revealed);
    if (req.query.tokenId !== undefined) list = list.filter(c => c.tokenId === req.query.tokenId && c.mapKey === (req.query.mapKey || ''));
    res.json({ containers: isDmAuthed(req) ? list : list.map(publicContainer) });
  }));
  app.post('/api/loot', requireDm, express.json({ limit: '16kb' }), route((req, res) => {
    const body = req.body || {}, data = loadCharacters();
    const tokenId = text(body.tokenId || '', 200), mapKey = text(body.mapKey || '', 500);
    if (tokenId && containers(data).some(c => c.tokenId === tokenId && c.mapKey === mapKey)) fail(409, 'Этот токен уже связан с контейнером.');
    const container = { id: crypto.randomUUID(), name: text(body.name, 120, true), tokenId, mapKey, revealed: false, revision: 0, items: [], transfers: [] };
    containers(data).push(container); changed(data); res.status(201).json(container);
  }));
  app.put('/api/loot/:id', requireDm, express.json({ limit: '512kb' }), route((req, res) => {
    const data = loadCharacters(), container = find(data, req.params.id), body = req.body || {};
    checkRevision(container, body.revision);
    const name = text(body.name, 120, true);
    if (typeof body.revealed !== 'boolean' || !Array.isArray(body.items) || body.items.length > 100) fail(400, 'Проверьте содержимое контейнера.');
    const ids = new Set();
    const items = body.items.map(item => {
      if (!item || typeof item !== 'object') fail(400, 'Некорректный предмет.');
      const id = item.id || crypto.randomUUID();
      if (typeof id !== 'string' || (item.id && !container.items.some(old => old.id === id)) || ids.has(id)) fail(400, 'Некорректный идентификатор предмета.');
      ids.add(id);
      if (!rarities.has(item.rarity)) fail(400, 'Выберите редкость предмета.');
      return { id, name: text(item.name, 120, true), quantity: quantity(item.quantity), rarity: item.rarity, properties: text(item.properties || '', 2000), description: text(item.description || '', 10000) };
    });
    Object.assign(container, { name, revealed: body.revealed, items, revision: container.revision + 1 });
    changed(data); res.json(container);
  }));
  app.post('/api/loot/:id/take', express.json({ limit: '16kb' }), route((req, res) => {
    const data = loadCharacters(), container = find(data, req.params.id), body = req.body || {};
    if (!container.revealed && !isDmAuthed(req)) fail(404, 'Контейнер недоступен.');
    checkRevision(container, body.revision);
    const item = container.items.find(i => i.id === body.itemId);
    if (!item) fail(409, 'Этот предмет уже забрали. Обновите контейнер.');
    const amount = quantity(body.quantity);
    if (amount > item.quantity) fail(409, 'В контейнере осталось меньше предметов.');
    const character = data.characters.find(c => c.id === body.characterId);
    if (!character) fail(404, 'Выберите персонажа этой кампании.');
    if (!Array.isArray(character.inventory)) character.inventory = [];
    const received = { ...item, id: crypto.randomUUID(), quantity: amount, sourceContainer: container.id };
    character.inventory.push(received);
    item.quantity -= amount;
    container.items = container.items.filter(i => i.quantity > 0);
    container.revision++;
    container.transfers.push({ name: item.name, quantity: amount, characterId: character.id, characterName: character.name, at: new Date().toISOString() });
    changed(data);
    broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
    broadcast({ type: 'PLAYER_DATA_UPDATE', player: character });
    res.json({ container: isDmAuthed(req) ? container : publicContainer(container), characterId: character.id });
  }));
};

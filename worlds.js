'use strict';

const { randomUUID } = require('node:crypto');
const map = require('./remote/world-model');
const createWorldStore = require('./world-store');
const registerCharacterPositions = require('./character-positions');
const createWorldMovement = require('./world-movement');

module.exports = (app, { express, requireDm, gameFile, broadcast, loadCharacters, assignedCharacter, movementLocked, revealScreen }) => {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const chunkPattern = /^-?\d{1,3},-?\d{1,3}$/;
  const store = createWorldStore(gameFile);
  const tileLimit = 150000;

  const movement = createWorldMovement(store, gameFile);

  const { getPosition, getExploration } = registerCharacterPositions(app, {
    express, requireDm, gameFile, loadCharacters, assignedCharacter, movementLocked, broadcast,
    locationExists: movement.locationExists,
    stepVisibility: movement.stepVisibility,
    findTransition: movement.findTransition,
    explorationNotice({ worldId, sceneId }) {
      const id = sceneId === 'overworld' ? worldId : sceneId;
      if (store.readActiveId() !== id) return null;
      const data = store.readPublished(id, []);
      return data?.fog ? notice(data) : null;
    },
  });

  function notice(data) {
    const tokens = data?.tokens || [];
    const party = tokens.length ? {
      x: tokens.reduce((sum, token) => sum + token.x, 0) / tokens.length + .5,
      y: tokens.reduce((sum, token) => sum + token.y, 0) / tokens.length + .5,
    } : null;
    return { type: 'WORLD_UPDATE', id: data?.map.id || null, revision: data?.revision, frame: data?.frame || null, party };
  }
  const announce = data => broadcast(notice(data));
  function hide() {
    if (!store.readActiveId()) return false;
    store.writeActiveId(null);
    announce(null);
    return true;
  }

  function validChunks(chunks, partial = false) {
    let count = 0;
    for (const [key, tiles] of Object.entries(chunks)) {
      if (!chunkPattern.test(key) || key.split(',').some(n => !map.valid(Number(n) * map.size))) return false;
      if (partial && key.split(',').map(Number).join(',') !== key) return false;
      if (partial && tiles === null) continue;
      if (!object(tiles)) return false;
      for (const [index, type] of Object.entries(tiles)) {
        if (!/^\d{1,4}$/.test(index) || Number(index) >= map.size ** 2 || !Object.hasOwn(map.terrain, type)) return false;
        if (partial && String(Number(index)) !== index) return false;
        if (++count > tileLimit) return false;
      }
    }
    return true;
  }

  function validMap(body) {
    if (!object(body?.chunks) || !Array.isArray(body.objects) || body.objects.length > 3000) return false;
    if (!validChunks(body.chunks)) return false;
    const ids = new Set();
    return body.objects.every(prop => {
      if (!object(prop) || typeof prop.id !== 'string' || prop.id.length > 64 || ids.has(prop.id) ||
        !Object.hasOwn(map.props, prop.kind) || !map.valid(prop.x) || !map.valid(prop.y) || ![0, 1, 2, 3].includes(prop.turn)) return false;
      ids.add(prop.id);
      return true;
    });
  }
  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); }
    catch (error) {
      console.error('World map:', error.message);
      res.status(500).json({ error: 'Не удалось прочитать или сохранить карту мира' });
    }
  };
  const json = express.json({ limit: '8mb' });

  app.get('/api/worlds', requireDm, route((req, res) => {
    res.json({ worlds: store.listDrafts() });
  }));
  app.post('/api/worlds', requireDm, json, route((req, res) => {
    const name = typeof req.body?.name === 'string' && req.body.name.trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Введите название карты' });
    const parentWorldId = req.body.parentWorldId;
    if (parentWorldId !== undefined) {
      const parent = typeof parentWorldId === 'string' && store.readDraft(parentWorldId, []);
      if (!parent || parent.parentWorldId) return res.status(404).json({ error: 'Выберите основной мир кампании' });
    }
    const data = { id: randomUUID(), name, revision: 0, ...(req.body.sample === true ? map.sample() : { chunks: {}, objects: [] }) };
    if (parentWorldId !== undefined) data.parentWorldId = parentWorldId;
    store.writeDraft(data);
    res.status(201).json(data);
  }));
  app.get('/api/worlds/live', requireDm, route((req, res) => {
    const data = store.readActiveWorld([]);
    if (!data) return res.json(null);
    const { id, name, revision } = data.map;
    res.json({
      revision: data.revision, frame: data.frame, fog: data.fog, tokens: data.tokens,
      map: req.query.version === id + ':' + revision ? { id, name, revision } : store.readPublished(id).map,
    });
  }));
  app.get('/api/worlds/table', route((req, res) => {
    const activeId = store.readActiveId();
    if (!activeId) return res.json(null);
    const requested = typeof req.query.chunks === 'string' ? req.query.chunks.split(';') : [];
    if (requested.length > 100 || requested.some(key => !chunkPattern.test(key))) return res.status(400).json({ error: 'Некорректный участок карты' });
    const keys = new Set(requested);
    const data = store.readPublished(activeId, keys);
    if (!data) return res.json(null);
    const chunks = {};
    const seen = {};
    const scope = movement.sceneScope(data.map);
    const explored = data.fog ? getExploration(scope.worldId, scope.sceneId, scope.floorId) : {};
    for (const key of keys) {
      if (data.fog && (data.seen[key] || explored[key])) {
        seen[key] = { ...data.seen[key], ...explored[key] };
      }
      const tiles = data.map.chunks[key];
      if (!tiles) continue;
      chunks[key] = data.fog ? Object.fromEntries(Object.entries(tiles).filter(([offset]) => seen[key]?.[offset])) : tiles;
    }
    const visible = prop => {
      const [key, offset] = map.address(prop.x, prop.y);
      return keys.has(key) && (!data.fog || !!seen[key]?.[offset]);
    };
    res.json({
      id: data.map.id, revision: data.revision, frame: data.frame, tokens: data.tokens,
      chunks, seen, fog: data.fog, objects: data.map.objects.filter(prop => !prop.hidden && visible(prop)),
    });
  }));
  app.get('/api/worlds/:id/transitions', requireDm, route((req, res) => {
    if (!store.readDraft(req.params.id, [])) return res.status(404).json({ error: 'Карта не найдена' });
    res.json({ links: movement.listTransitions(req.params.id) });
  }));
  app.post('/api/worlds/:id/transitions', requireDm, json, route((req, res) => {
    const { x, y, toMapId, toX, toY } = req.body || {};
    if (![x, y, toX, toY].every(map.valid) || typeof toMapId !== 'string') {
      return res.status(400).json({ error: 'Укажите клетки начала и назначения' });
    }
    const source = store.readDraft(req.params.id, []);
    const target = store.readDraft(toMapId, []);
    if (!source || !target) return res.status(404).json({ error: 'Карта не найдена' });
    const from = { ...movement.sceneScope(source), x, y };
    const to = { ...movement.sceneScope(target), x: toX, y: toY };
    if (source.id === target.id || from.worldId !== to.worldId) {
      return res.status(400).json({ error: 'Свяжите разные сцены одного мира' });
    }
    if (!movement.canStep(from, false) || !movement.canStep(to, false)) {
      return res.status(409).json({ error: 'Обе клетки перехода должны быть проходимыми' });
    }
    res.status(201).json({ link: movement.saveTransition(from, to) });
  }));
  app.delete('/api/worlds/:id/transitions/:linkId', requireDm, route((req, res) => {
    if (!store.readDraft(req.params.id, [])) return res.status(404).json({ error: 'Карта не найдена' });
    movement.removeTransition(req.params.id, req.params.linkId);
    res.json({ links: movement.listTransitions(req.params.id) });
  }));
  app.get('/api/worlds/:id/chunks', requireDm, route((req, res) => {
    const keys = typeof req.query.chunks === 'string' ? req.query.chunks.split(';') : [];
    if (!keys.length || keys.length > 100 || keys.some(key => !chunkPattern.test(key))) {
      return res.status(400).json({ error: 'Некорректный участок карты' });
    }
    const data = store.readDraft(req.params.id, new Set(keys));
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    res.json({ id: data.id, revision: data.revision, chunks: data.chunks });
  }));
  app.patch('/api/worlds/:id/chunks', requireDm, json, route((req, res) => {
    const { revision, chunks } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !object(chunks) ||
        Object.keys(chunks).length === 0 || Object.keys(chunks).length > 100 || !validChunks(chunks, true)) {
      return res.status(400).json({ error: 'Некорректный участок карты' });
    }
    const result = store.patchDraft(req.params.id, revision, chunks, tileLimit);
    if (result.status === 'missing') return res.status(404).json({ error: 'Карта не найдена' });
    if (result.status === 'legacy') return res.status(409).json({ error: 'Для этой карты доступно только полное сохранение' });
    if (result.status === 'conflict') return res.status(409).json({ error: 'Черновик изменён в другом окне. Откройте его заново.' });
    if (result.status === 'limit') return res.status(400).json({ error: 'Превышено количество тайлов' });
    res.json({ revision: result.revision });
  }));
  app.get('/api/worlds/:id', requireDm, route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    res.json(data);
  }));
  app.put('/api/worlds/:id', requireDm, json, route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    if (data.revision !== req.body?.revision) return res.status(409).json({ error: 'Черновик изменён в другом окне. Откройте его заново.' });
    if (!validMap(req.body)) return res.status(400).json({ error: 'Проверьте слои карты и количество тайлов' });
    const objects = req.body.objects.map(({ id, kind, x, y, turn, hidden }) => ({ id, kind, x, y, turn, hidden: hidden === true }));
    const next = { ...data, revision: data.revision + 1, chunks: req.body.chunks, objects };
    store.writeDraft(next);
    res.json(next);
  }));
  app.post('/api/worlds/:id/publish', requireDm, json, route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    if (data.revision !== req.body?.revision) return res.status(409).json({ error: 'Сначала сохраните актуальный черновик' });
    const previous = store.readPublished(data.id, []);
    const next = {
      tokens: [], seen: {}, frame: { x: 0, y: 0, scale: 24, serial: 0 }, ...previous,
      map: data, fog: req.body.fog === true, revision: (previous?.revision || 0) + 1,
    };
    store.writePublished(data.id, next);
    store.writeActiveId(data.id);
    revealScreen();
    announce(next);
    res.json(next);
  }));
  app.post('/api/worlds/live/change', requireDm, json, route((req, res) => {
    const data = store.readActiveWorld([]);
    if (!data || req.body?.id !== data.map.id) return res.status(409).json({ error: 'На экране уже другая карта' });
    const { action, x, y, characterId, scale } = req.body;
    if (!map.valid(x) || !map.valid(y)) return res.status(400).json({ error: 'Проверьте координаты' });
    if (action === 'frame' && Number.isFinite(scale)) {
      data.frame = { x, y, scale: Math.min(100, Math.max(6, scale)), serial: data.frame.serial + 1 };
    } else if (action === 'reveal' || action === 'token') {
      if (action === 'token') {
        const hero = loadCharacters().characters.find(character => character.id === characterId);
        if (!hero) return res.status(404).json({ error: 'Герой не найден' });
        const token = data.tokens.find(item => item.id === hero.id);
        if (token) Object.assign(token, { x, y, name: hero.name });
        else data.tokens.push({ id: hero.id, name: hero.name, x, y });
      }
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 16 && map.valid(x + dx) && map.valid(y + dy)) map.set(data.seen, x + dx, y + dy, true);
      }
    } else return res.status(400).json({ error: 'Действие недоступно' });
    data.revision++;
    store.updatePublishedState(data.map.id, data);
    announce(data);
    res.json({ tokens: data.tokens, revision: data.revision, frame: data.frame });
  }));
  app.post('/api/worlds/live/hide', requireDm, route((req, res) => res.json({ hidden: hide() })));
  return { hide, getPosition, notice: () => notice(store.readActiveWorld([])) };
};

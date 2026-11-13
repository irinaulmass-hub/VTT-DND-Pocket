'use strict';

const { randomUUID } = require('node:crypto');
const map = require('./remote/world-model');
const createWorldStore = require('./world-store');
const registerCharacterPositions = require('./character-positions');
const createWorldMovement = require('./world-movement');
const createWorldDiscoveries = require('./world-discoveries');
const registerWorldTemplates = require('./world-templates');
const createWorldDistricts = require('./world-districts');
const { validGenerators } = require('./remote/world-generators');
const { project, isRevealedSecret } = require('./world-exploration');

module.exports = (app, { express, requireDm, gameFile, broadcast, loadCharacters, assignedCharacter, movementLocked, revealScreen, screenBlackout }) => {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const chunkPattern = /^-?\d{1,3},-?\d{1,3}$/;
  const store = createWorldStore(gameFile);
  const { tileLimit, objectLimit } = map;

  registerWorldTemplates(app, { express, requireDm, gameFile });
  const movement = createWorldMovement(store, gameFile);
  const districts = createWorldDistricts(movement, () => gameFile('world-transitions.json'));
  const discoveries = createWorldDiscoveries(gameFile);

  const {
    getPosition, mapState, projectionRevision, setDoor, preservePublication, rememberReveal, rememberCharacterView, revealSecret,
  } = registerCharacterPositions(app, {
    express, requireDm, gameFile, loadCharacters, assignedCharacter, movementLocked, broadcast,
    locationExists: movement.locationExists,
    stepVisibility: movement.stepVisibility,
    doorVisibility: movement.doorVisibility,
    visibleCells: movement.visibleCells,
    readPublishedMap: (id, keys) => store.readPublished(id, keys)?.map,
    findTransition: movement.findTransition,
    explorationNotice(position) {
      const id = map.locationMapId(position);
      const active = store.readActive();
      if (active.id !== id) return null;
      const data = store.readPublished(id, []);
      return data?.fog ? notice(data, active) : null;
    },
  });

  function syncVersion(data, active, exploration = data ? projectionRevision(data.map.id, data.fog) : 0) {
    return { generation: active.generation, publication: data?.revision ?? 0, exploration };
  }

  function notice(data, active = store.readActive()) {
    const tokens = data?.tokens || [];
    const party = tokens.length ? {
      x: tokens.reduce((sum, token) => sum + token.x, 0) / tokens.length + .5,
      y: tokens.reduce((sum, token) => sum + token.y, 0) / tokens.length + .5,
    } : null;
    return {
      type: 'WORLD_UPDATE', id: data?.map.id || null, revision: data?.revision,
      version: syncVersion(data, active), frame: data?.frame || null, party,
    };
  }
  function activeNotice() {
    const active = store.readActive();
    const data = active.id ? store.readPublished(active.id, []) : null;
    return notice(data, active);
  }

  const announce = (data, active) => broadcast(notice(data, active));
  function hide() {
    if (!store.readActiveId()) return false;
    announce(null, store.writeActiveId(null));
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
    if (!object(body?.chunks) || !Array.isArray(body.objects) || body.objects.length > objectLimit) return false;
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
      if ([400, 404, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
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
    const { parentWorldId, sceneMapId, elevation } = req.body;
    let parentScope;
    if (sceneMapId !== undefined) {
      if (parentWorldId !== undefined || !Number.isSafeInteger(elevation) || elevation === 0) {
        return res.status(400).json({ error: 'Укажите целый номер дополнительного этажа' });
      }
      const scene = typeof sceneMapId === 'string' && store.readDraft(sceneMapId, []);
      if (!scene || scene.parentSceneId) return res.status(404).json({ error: 'Выберите сцену этой кампании' });
      parentScope = map.sceneScope(scene);
      if (store.listDrafts().some(item => item.parentWorldId === parentScope.worldId &&
          item.parentSceneId === parentScope.sceneId && item.elevation === elevation)) {
        return res.status(409).json({ error: 'В этой сцене уже есть этаж с таким номером' });
      }
    }
    if (parentWorldId !== undefined) {
      const parent = typeof parentWorldId === 'string' && store.readDraft(parentWorldId, []);
      if (!parent || parent.parentWorldId) return res.status(404).json({ error: 'Выберите основной мир кампании' });
    }
    const data = { id: randomUUID(), name, revision: 0, ...(req.body.sample === true ? map.sample() : { chunks: {}, objects: [] }) };
    if (parentScope) {
      data.parentWorldId = parentScope.worldId;
      data.parentSceneId = parentScope.sceneId;
      data.elevation = elevation;
    } else if (parentWorldId !== undefined) data.parentWorldId = parentWorldId;
    store.writeDraft(data);
    res.status(201).json(data);
  }));
  app.get('/api/worlds/live', requireDm, route((req, res) => {
    const data = store.readActiveWorld([]);
    if (!data) return res.json(null);
    const { id, name, revision, objects } = data.map;
    const { openDoors, revealedSecrets } = mapState(data.map);
    res.json({
      revision: data.revision, frame: data.frame, fog: data.fog, tokens: data.tokens,
      openDoors: [...openDoors],
      revealedSecrets: objects.filter(prop => prop.hidden && isRevealedSecret(prop, revealedSecrets)).map(prop => prop.id),
      map: req.query.version === id + ':' + revision ? { id, name, revision } : store.readPublished(id).map,
    });
  }));
  app.get('/api/worlds/table/status', route((req, res) => {
    res.json({ ...activeNotice(), blackout: screenBlackout() });
  }));
  app.get('/api/worlds/table', route((req, res) => {
    const active = store.readActive();
    if (!active.id) return res.json(null);
    const requested = typeof req.query.chunks === 'string' ? req.query.chunks.split(';') : [];
    if (requested.length > 100 || requested.some(key => !chunkPattern.test(key))) return res.status(400).json({ error: 'Некорректный участок карты' });
    const keys = new Set(requested);
    const data = store.readPublished(active.id, keys);
    if (!data) return res.json(null);
    const state = mapState(data.map, data.fog);
    res.json({
      id: data.map.id, revision: data.revision, frame: data.frame, tokens: data.tokens,
      version: syncVersion(data, active, state.projectionRevision),
      fog: data.fog, ...project(data, keys, state),
    });
  }));
  app.get('/api/worlds/:id/transitions', requireDm, route((req, res) => {
    if (!store.readDraft(req.params.id, [])) return res.status(404).json({ error: 'Карта не найдена' });
    res.json({ links: movement.listTransitions(req.params.id), revision: movement.linksRevision() });
  }));
  app.post('/api/worlds/:id/district-preview', requireDm, json, route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена в этой кампании.' });
    res.json(districts.preview(data, req.body));
  }));
  app.post('/api/worlds/:id/district-apply', requireDm, express.json({ limit: '8kb' }), route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена в этой кампании.' });
    const { next, response } = districts.prepareApply(data, req.body);
    if (!validMap(next) || !validGenerators(next.generators)) {
      return res.status(400).json({ error: 'Проверьте слои карты и параметры генераторов' });
    }
    // The same synchronous draft commit as PUT; no publication or transition writes.
    store.writeDraft(next);
    res.json(response);
  }));
  app.post('/api/worlds/:id/building-links', requireDm, json, route((req, res) => {
    const body = req.body || {};
    const fields = ['buildingId', 'sourceRevision', 'targetRevision', 'linksRevision', 'x', 'y', 'toMapId', 'toX', 'toY'];
    if (Object.keys(body).length !== fields.length || fields.some(field => !Object.hasOwn(body, field)) ||
        typeof body.buildingId !== 'string' || !body.buildingId.length || body.buildingId.length > 64 ||
        typeof body.toMapId !== 'string' || typeof body.linksRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.linksRevision) ||
        ![body.sourceRevision, body.targetRevision].every(value => Number.isSafeInteger(value) && value >= 0) ||
        ![body.x, body.y, body.toX, body.toY].every(map.valid)) return res.status(400).json({ error: 'Проверь постройку, клетки и версии карт и переходов.' });
    const source = store.readDraft(req.params.id, []), target = store.readDraft(body.toMapId, []);
    if (!source || !target) return res.status(404).json({ error: 'Карта не найдена в этой кампании.' });
    const links = movement.saveBuildingLink(source, target, body);
    res.status(201).json({ links, revision: movement.linksRevision() });
  }));
  app.post('/api/worlds/:id/transitions', requireDm, json, route((req, res) => {
    const { x, y, toMapId, toX, toY } = req.body || {};
    if (![x, y, toX, toY].every(map.valid) || typeof toMapId !== 'string') {
      return res.status(400).json({ error: 'Укажите клетки начала и назначения' });
    }
    const source = store.readDraft(req.params.id, []);
    const target = store.readDraft(toMapId, []);
    if (!source || !target) return res.status(404).json({ error: 'Карта не найдена' });
    const from = { ...map.sceneScope(source), x, y };
    const to = { ...map.sceneScope(target), x: toX, y: toY };
    if (source.id === target.id || from.worldId !== to.worldId) {
      return res.status(400).json({ error: 'Свяжите разные карты одного мира' });
    }
    if (!movement.canStep(from, false) || !movement.canStep(to, false)) {
      return res.status(409).json({ error: 'Обе клетки перехода должны быть проходимыми' });
    }
    res.status(201).json({ link: movement.saveTransition(from, to) });
  }));
  app.delete('/api/worlds/:id/transitions/:linkId', requireDm, route((req, res) => {
    if (!store.readDraft(req.params.id, [])) return res.status(404).json({ error: 'Карта не найдена' });
    movement.removeTransition(req.params.id, req.params.linkId, req.query.linksRevision);
    res.json({ links: movement.listTransitions(req.params.id), revision: movement.linksRevision() });
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
    const { generators } = req.body;
    if (generators !== undefined && !validGenerators(generators)) {
      return res.status(400).json({ error: 'Проверьте версии и параметры генераторов карты' });
    }
    const objects = req.body.objects.map(({ id, kind, x, y, turn, hidden }) => ({ id, kind, x, y, turn, hidden: hidden === true }));
    const next = { ...data, revision: data.revision + 1, chunks: req.body.chunks, objects };
    if (generators !== undefined) next.generators = generators;
    districts.verifySave(data, next, req.body.districtGuard);
    store.writeDraft(next);
    res.json(next);
  }));
  app.post('/api/worlds/:id/publish', requireDm, json, route((req, res) => {
    const data = store.readDraft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    if (data.revision !== req.body?.revision) return res.status(409).json({ error: 'Сначала сохраните актуальный черновик' });
    const previous = store.readPublished(data.id, []);
    preservePublication(previous);
    const { generators, ...publishedMap } = data;
    const next = {
      tokens: [], seen: {}, frame: { x: 0, y: 0, scale: 24, serial: 0 }, ...previous,
      map: publishedMap, fog: req.body.fog === true, revision: (previous?.revision || 0) + 1,
    };
    store.writePublished(data.id, next);
    const active = store.writeActiveId(data.id);
    revealScreen();
    announce(next, active);
    res.json(next);
  }));
  app.put('/api/worlds/live/doors/:doorId', requireDm, json, route((req, res) => {
    const data = store.readActiveWorld([]);
    if (!data || req.body?.id !== data.map.id) return res.status(409).json({ error: 'На экране уже другая карта' });
    if (typeof req.body.open !== 'boolean') return res.status(400).json({ error: 'Укажите состояние двери' });
    const door = data.map.objects.find(prop => prop.kind === 'door' && prop.id === req.params.doorId);
    if (!door) return res.status(404).json({ error: 'Дверь не найдена на опубликованной карте' });
    if (setDoor(data.map, door, req.body.open)) announce(data);
    res.json({ open: req.body.open });
  }));
  function secretRoute(handler, extraFields = []) {
    const fields = new Set(['id', 'revision', ...extraFields]);
    return route((req, res) => {
      const { id, revision } = req.body || {};
      if (typeof id !== 'string' || !Number.isSafeInteger(revision) ||
          Object.keys(req.body).some(key => !fields.has(key))) {
        return res.status(400).json({ error: 'Укажите карту и версию публикации' });
      }
      const data = store.readActiveWorld([]);
      if (!data || data.map.id !== id || data.map.revision !== revision) {
        return res.status(409).json({ error: 'Публикация изменилась. Обновите карту и выберите секрет снова' });
      }
      const prop = data.map.objects.find(item => item.id === req.params.objectId && item.hidden);
      if (!prop) return res.status(404).json({ error: 'Скрытый объект не найден на опубликованной карте' });
      handler(req, res, data, prop);
    });
  }

  app.put('/api/worlds/live/secrets/:objectId', requireDm, json, secretRoute((req, res, data, prop) => {
    if (revealSecret(data.map, prop)) announce(data);
    res.json({ revealed: true });
  }));
  app.put('/api/worlds/live/secrets/:objectId/share', requireDm, express.json({ limit: '8kb' }), secretRoute((req, res, data, prop) => {
    const { characterId } = req.body;
    if (typeof characterId !== 'string' || !characterId) {
      return res.status(400).json({ error: 'Выберите героя' });
    }
    if (!loadCharacters().characters.some(hero => hero.id === characterId)) {
      return res.status(404).json({ error: 'Герой не найден в этой кампании' });
    }
    if (discoveries.share(characterId, data.map, prop)) broadcast({ type: 'PLAYER_DISCOVERIES_CHANGED', characterId });
    res.json({ shared: true });
  }, ['characterId']));
  app.get('/api/player-discoveries', route((req, res) => {
    const characterId = req.query.view === 'table' ? null : assignedCharacter(req);
    if (!characterId) return res.status(401).json({ error: 'Требуется действующее приглашение героя' });
    res.json({ discoveries: discoveries.forCharacter(characterId) });
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
      const revealed = {};
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 16 && map.valid(x + dx) && map.valid(y + dy)) map.set(revealed, x + dx, y + dy, true);
      }
      rememberReveal(data.map.id, revealed);
      for (const [key, cells] of Object.entries(revealed)) data.seen[key] = { ...data.seen[key], ...cells };
    } else return res.status(400).json({ error: 'Действие недоступно' });
    data.revision++;
    store.updatePublishedState(data.map.id, data);
    announce(data);
    res.json({ tokens: data.tokens, revision: data.revision, frame: data.frame });
  }));
  app.post('/api/worlds/live/hide', requireDm, route((req, res) => res.json({ hidden: hide() })));
  return { hide, getPosition, rememberCharacterView, notice: activeNotice };
};

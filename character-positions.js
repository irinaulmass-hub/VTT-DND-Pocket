'use strict';

const fs = require('node:fs');
const { valid, set, sceneScope, locationMapId } = require('./remote/world-model');
const { mask, remember } = require('./world-exploration');

const steps = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

module.exports = function registerCharacterPositions(app, {
  express, requireDm, gameFile, loadCharacters, assignedCharacter, locationExists, movementLocked, broadcast,
  stepVisibility, findTransition, explorationNotice, doorVisibility, visibleCells, readPublishedMap,
}) {
  const stateFile = () => gameFile('character-positions.json');

  function readState(file = stateFile()) {
    const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return saved.formatVersion === 1 ? saved : { formatVersion: 1, positions: saved, explored: {} };
  }

  function getPosition(characterId, positions = readState().positions) {
    if (!Object.hasOwn(positions, characterId)) return null;
    const position = positions[characterId];
    return { ...position, revision: position.revision ?? 0 };
  }

  function explorationKey({ worldId, sceneId, floorId }) {
    return JSON.stringify([worldId, sceneId, floorId]);
  }

  function openDoorsAt(state, id) {
    return new Set(state.doors?.[id] || []);
  }

  function mapObservers(state, layout, activeOnly = false) {
    const key = explorationKey(sceneScope(layout));
    const candidates = Object.values(state.positions).filter(position =>
      explorationKey(position) === key && (!activeOnly || isObserving(state, position)));
    if (!candidates.length) return [];
    const heroes = new Set(loadCharacters().characters.map(hero => hero.id));
    return candidates.filter(position => heroes.has(position.characterId));
  }

  function isObserving(state, position) {
    return state.observing?.[position.characterId] === (position.revision ?? 0);
  }

  function liveMask(state, layout, openDoors, observers = mapObservers(state, layout, true)) {
    return mask(observers.filter(position => isObserving(state, position))
      .flatMap(position => visibleCells(position, layout.objects, openDoors)));
  }

  function mapState(layout, includeVisibility = false) {
    const state = readState();
    const key = explorationKey(sceneScope(layout));
    const openDoors = openDoorsAt(state, layout.id);
    return {
      explored: state.explored[key] || {},
      memory: state.memory?.[key] || { chunks: {}, objects: {} },
      openDoors,
      visible: includeVisibility ? liveMask(state, layout, openDoors) : {},
    };
  }

  function recordExploration(state, position, cells) {
    const seen = state.explored[explorationKey(position)] ||= {};
    for (const { x, y } of cells) set(seen, x, y, true);
  }

  function capture(state, id, observed) {
    const keys = Object.keys(observed);
    if (!keys.length) return;
    const source = readPublishedMap(id, keys);
    if (!source) return;
    const memories = state.memory ||= {};
    const memory = memories[explorationKey(sceneScope(source))] ||= { chunks: {}, objects: {} };
    remember(memory, source, observed, openDoorsAt(state, id));
  }

  function captureDeparture(state, position, includeOrigin = false) {
    const id = locationMapId(position);
    const layout = readPublishedMap(id, []);
    if (!layout) return;
    const cells = includeOrigin ? [position] : [];
    if (isObserving(state, position)) {
      cells.push(...visibleCells(position, layout.objects, openDoorsAt(state, id)));
    }
    capture(state, id, mask(cells));
  }

  function preservePublication(previous) {
    if (!previous) return;
    const layout = previous.map;
    const file = stateFile();
    const state = readState(file);
    const key = explorationKey(sceneScope(layout));
    const known = state.memory?.[key]?.chunks || {};
    const explored = state.explored[key] || {};
    const manual = previous.seen || {};
    const observed = liveMask(state, layout, openDoorsAt(state, layout.id));
    // Fill legacy discovery from the outgoing publication before replacing it.
    for (const chunk of new Set([...Object.keys(manual), ...Object.keys(explored)])) {
      const cells = { ...manual[chunk], ...explored[chunk] };
      for (const [offset, seen] of Object.entries(cells)) {
        if (seen && !Object.hasOwn(known[chunk] || {}, offset)) (observed[chunk] ||= {})[offset] = true;
      }
    }
    if (Object.keys(observed).length) {
      capture(state, layout.id, observed);
      writeState(file, state);
    }
  }

  function rememberCharacterView(characterId) {
    const file = stateFile();
    const state = readState(file);
    const position = getPosition(characterId, state.positions);
    if (!position || !isObserving(state, position)) return null;
    captureDeparture(state, position);
    writeState(file, state);
    return explorationNotice(position);
  }

  function rememberReveal(id, observed) {
    const file = stateFile();
    const state = readState(file);
    capture(state, id, observed);
    writeState(file, state);
  }

  function writeState(file, state) {
    fs.writeFileSync(file + '.tmp', JSON.stringify(state));
    fs.renameSync(file + '.tmp', file);
  }

  function savePosition(file, state, position) {
    state.positions = { ...state.positions, [position.characterId]: position };
    writeState(file, state);
    broadcast({ type: 'CHARACTER_POSITION', characterId: position.characterId, position });
  }

  function characterExists(characterId) {
    return loadCharacters().characters.some(character => character.id === characterId);
  }

  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); }
    catch (error) {
      console.error('Character position:', error.message);
      res.status(500).json({ error: 'Не удалось прочитать или сохранить позицию героя' });
    }
  };

  app.get('/api/player-position', route((req, res) => {
    const characterId = assignedCharacter(req);
    if (!characterId) return res.status(401).json({ error: 'Требуется действующее приглашение' });
    res.json({ position: getPosition(characterId) });
  }));

  app.post('/api/player-position/move', express.json({ limit: '8kb' }), route((req, res) => {
    const characterId = assignedCharacter(req);
    if (!characterId) return res.status(401).json({ error: 'Требуется действующее приглашение' });
    const { direction, revision } = req.body || {};
    if (typeof direction !== 'string' || (direction !== 'enter' && !Object.hasOwn(steps, direction)) ||
        !Number.isSafeInteger(revision) || revision < 0 ||
        Object.keys(req.body).some(key => key !== 'direction' && key !== 'revision')) {
      return res.status(400).json({ error: 'Укажите направление и версию позиции' });
    }
    if (movementLocked(characterId)) return res.status(403).json({ error: 'Мастер приостановил движение' });

    const file = stateFile();
    const state = readState(file);
    const current = getPosition(characterId, state.positions);
    if (!current) return res.status(409).json({ position: null, error: 'Мастер ещё не задал позицию героя' });
    if (current.revision !== revision) {
      return res.status(409).json({ position: current, error: 'Позиция изменилась. Выберите направление ещё раз' });
    }

    let destination;
    if (direction === 'enter') {
      destination = findTransition(current);
      if (!destination) return res.status(409).json({ error: 'Здесь нет перехода' });
    } else {
      const [dx, dy] = steps[direction];
      destination = { ...current, x: current.x + dx, y: current.y + dy };
    }
    const position = { ...current, ...destination, revision: current.revision + 1 };
    if (!valid(position.x) || !valid(position.y)) return res.status(400).json({ error: 'Достигнута граница мира' });
    const visible = stepVisibility(position, openDoorsAt(state, locationMapId(position)));
    if (!visible) return res.status(409).json({ error: 'В эту клетку нельзя пройти' });
    captureDeparture(state, current, true);
    recordExploration(state, current, [current]);
    recordExploration(state, position, visible);
    capture(state, locationMapId(position), mask(visible));
    (state.observing ||= {})[characterId] = position.revision;
    savePosition(file, state, position);
    // At most one of the two maps can be on the table.
    const notice = explorationNotice(current) || explorationNotice(position);
    if (notice) broadcast(notice);
    res.json({ position });
  }));

  app.get('/api/character-positions/:characterId', requireDm, route((req, res) => {
    const { characterId } = req.params;
    if (!characterExists(characterId)) return res.status(404).json({ error: 'Герой не найден' });
    res.json({ position: getPosition(characterId) });
  }));

  app.put('/api/character-positions/:characterId', requireDm, express.json({ limit: '8kb' }), route((req, res) => {
    const { characterId } = req.params;
    const { worldId, sceneId, floorId, x, y } = req.body || {};
    if (typeof worldId !== 'string' || !valid(x) || !valid(y)) {
      return res.status(400).json({ error: 'Укажите мир и целочисленные координаты клетки' });
    }
    if (!characterExists(characterId) || !locationExists({ worldId, sceneId, floorId })) {
      return res.status(404).json({ error: 'Герой, мир, сцена или этаж не найдены в этой кампании' });
    }

    const file = stateFile();
    const state = readState(file);
    const previous = getPosition(characterId, state.positions);
    const observed = previous && isObserving(state, previous);
    if (observed) captureDeparture(state, previous);
    const revision = (previous?.revision ?? 0) + 1;
    const position = { characterId, worldId, sceneId, floorId, x, y, revision };
    savePosition(file, state, position);
    if (observed) {
      const notice = explorationNotice(previous);
      if (notice) broadcast(notice);
    }
    res.json({ position });
  }));

  function setDoor(layout, door, open) {
    const file = stateFile();
    const state = readState(file);
    const current = openDoorsAt(state, layout.id);
    if (current.has(door.id) === open) return false;

    const observers = mapObservers(state, layout);
    capture(state, layout.id, liveMask(state, layout, current, observers));
    const next = new Set(current);
    if (open) next.add(door.id);
    else next.delete(door.id);
    (state.doors ||= {})[layout.id] = [...next];

    if (open) {
      for (const position of observers) {
        const visible = doorVisibility(position, layout.objects, door, current, next);
        if (!visible.length) continue;
        recordExploration(state, position, visible);
        (state.observing ||= {})[position.characterId] = position.revision ?? 0;
      }
    }
    capture(state, layout.id, liveMask(state, layout, next, observers));

    writeState(file, state);
    return true;
  }

  return { getPosition, mapState, setDoor, preservePublication, rememberReveal, rememberCharacterView };
};

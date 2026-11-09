'use strict';

const fs = require('node:fs');
const { valid, get, set } = require('./remote/world-model');

const steps = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

module.exports = function registerCharacterPositions(app, {
  express, requireDm, gameFile, loadCharacters, assignedCharacter, locationExists, movementLocked, broadcast, canStep, findTransition, explorationNotice,
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

  function explorationKey(worldId, sceneId, floorId) {
    return JSON.stringify([worldId, sceneId, floorId]);
  }

  function getExploration(worldId, sceneId, floorId) {
    return readState().explored[explorationKey(worldId, sceneId, floorId)] || {};
  }

  function recordCell(state, position) {
    const { worldId, sceneId, floorId, x, y } = position;
    const key = explorationKey(worldId, sceneId, floorId);
    const seen = state.explored[key] ||= {};
    if (get(seen, x, y)) return false;
    set(seen, x, y, true);
    return true;
  }

  function savePosition(file, state, position) {
    state.positions = { ...state.positions, [position.characterId]: position };
    fs.writeFileSync(file + '.tmp', JSON.stringify(state));
    fs.renameSync(file + '.tmp', file);
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
    if (!canStep(position)) return res.status(409).json({ error: 'В эту клетку нельзя пройти' });
    const originChanged = recordCell(state, current);
    const destinationChanged = recordCell(state, position);
    // At most one of the two maps can be on the table.
    const notice = (originChanged && explorationNotice(current)) ||
      (destinationChanged && explorationNotice(position));
    savePosition(file, state, position);
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
    const revision = (getPosition(characterId, state.positions)?.revision ?? 0) + 1;
    const position = { characterId, worldId, sceneId, floorId, x, y, revision };
    savePosition(file, state, position);
    res.json({ position });
  }));

  return { getPosition, getExploration };
};

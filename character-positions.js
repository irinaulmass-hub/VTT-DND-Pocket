'use strict';

const fs = require('node:fs');
const { valid } = require('./remote/world-model');

const steps = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

module.exports = function registerCharacterPositions(app, {
  express, requireDm, gameFile, loadCharacters, assignedCharacter, worldExists, movementLocked, broadcast,
}) {
  function readPositions(file) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  function getPosition(characterId, positions = readPositions(gameFile('character-positions.json'))) {
    if (!Object.hasOwn(positions, characterId)) return null;
    const position = positions[characterId];
    return { ...position, revision: position.revision ?? 0 };
  }

  function savePosition(file, positions, position) {
    fs.writeFileSync(file + '.tmp', JSON.stringify({ ...positions, [position.characterId]: position }));
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
    if (typeof direction !== 'string' || !Object.hasOwn(steps, direction) ||
        !Number.isSafeInteger(revision) || revision < 0 ||
        Object.keys(req.body).some(key => key !== 'direction' && key !== 'revision')) {
      return res.status(400).json({ error: 'Укажите направление и версию позиции' });
    }
    if (movementLocked(characterId)) return res.status(403).json({ error: 'Мастер приостановил движение' });

    const file = gameFile('character-positions.json');
    const positions = readPositions(file);
    const current = getPosition(characterId, positions);
    if (!current) return res.status(409).json({ position: null, error: 'Мастер ещё не задал позицию героя' });
    if (current.revision !== revision) {
      return res.status(409).json({ position: current, error: 'Позиция изменилась. Выберите направление ещё раз' });
    }

    const [dx, dy] = steps[direction];
    const x = current.x + dx;
    const y = current.y + dy;
    if (!valid(x) || !valid(y)) return res.status(400).json({ error: 'Достигнута граница мира' });
    const position = { ...current, x, y, revision: current.revision + 1 };
    savePosition(file, positions, position);
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
    if (!characterExists(characterId) || !worldExists(worldId) || sceneId !== 'overworld' || floorId !== 'ground') {
      return res.status(404).json({ error: 'Герой, мир, сцена или этаж не найдены в этой кампании' });
    }

    const file = gameFile('character-positions.json');
    const positions = readPositions(file);
    const revision = (getPosition(characterId, positions)?.revision ?? 0) + 1;
    const position = { characterId, worldId, sceneId, floorId, x, y, revision };
    savePosition(file, positions, position);
    res.json({ position });
  }));

  return { getPosition };
};

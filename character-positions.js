'use strict';

const fs = require('node:fs');
const { valid } = require('./remote/world-model');

module.exports = function registerCharacterPositions(app, {
  express, requireDm, gameFile, loadCharacters, assignedCharacter, worldExists,
}) {
  function readPositions(file) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  function getPosition(characterId) {
    const positions = readPositions(gameFile('character-positions.json'));
    return Object.hasOwn(positions, characterId) ? positions[characterId] : null;
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

    const position = { characterId, worldId, sceneId, floorId, x, y };
    const file = gameFile('character-positions.json');
    const positions = { ...readPositions(file), [characterId]: position };
    fs.writeFileSync(file + '.tmp', JSON.stringify(positions));
    fs.renameSync(file + '.tmp', file);
    res.json({ position });
  }));
};

'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

module.exports = (app, { express, requireDm, gameFile, loadCharacters }) => {
  const file = () => gameFile('player-access.json');
  const read = () => fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(), 'utf8')) : {};
  const hash = token => crypto.createHash('sha256').update(token).digest('hex');
  const save = data => {
    fs.writeFileSync(file() + '.tmp', JSON.stringify(data));
    fs.renameSync(file() + '.tmp', file());
  };
  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); }
    catch (error) {
      console.error('Player access:', error.message);
      res.status(500).json({ error: 'Не удалось сохранить назначение' });
    }
  };

  app.get('/api/player-access', requireDm, route((req, res) => {
    res.json({ assignments: Object.values(read()).map(({ characterId, createdAt }) => ({ characterId, createdAt })) });
  }));
  app.post('/api/player-access', requireDm, express.json({ limit: '8kb' }), route((req, res) => {
    const characterId = req.body?.characterId;
    if (!loadCharacters().characters.some(character => character.id === characterId)) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const data = read();
    for (const [key, assignment] of Object.entries(data)) {
      if (assignment.characterId === characterId) delete data[key];
    }
    const createdAt = new Date().toISOString();
    data[hash(token)] = { characterId, createdAt };
    save(data);
    res.status(201).json({ characterId, token, createdAt });
  }));
  app.delete('/api/player-access/:characterId', requireDm, route((req, res) => {
    const data = read();
    for (const [key, assignment] of Object.entries(data)) {
      if (assignment.characterId === req.params.characterId) delete data[key];
    }
    save(data);
    res.json({ revoked: true });
  }));

  function resolve(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      const assignment = read()[hash(token)];
      if (!assignment) return null;
      return loadCharacters().characters.some(character => character.id === assignment.characterId)
        ? assignment.characterId : null;
  }

  app.get('/api/player-access/current', route((req, res) => {
    const characterId = resolve(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!characterId) return res.status(401).json({ error: 'Назначение недоступно' });
    res.json({ characterId });
  }));
  return { resolve };
};

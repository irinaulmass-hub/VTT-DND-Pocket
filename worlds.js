'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const map = require('./remote/world-model');

module.exports = (app, { express, requireDm, gameFile, broadcast, loadCharacters, revealScreen }) => {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const idPattern = /^[a-f0-9-]{36}$/;
  const chunkPattern = /^-?\d{1,3},-?\d{1,3}$/;
  const read = (file, fallback = null) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
  function write(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  }
  const directory = () => gameFile('worlds');
  const file = (id, suffix) => path.join(directory(), id + suffix + '.json');
  const draft = id => idPattern.test(id) ? read(file(id, '')) : null;
  const activeFile = () => gameFile('active-world.json');
  const active = () => read(activeFile())?.id || null;
  const play = () => { const id = active(); return id ? read(file(id, '-live')) : null; };
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
    if (!active()) return false;
    write(activeFile(), { id: null });
    announce(null);
    return true;
  }

  function validMap(body) {
    if (!object(body?.chunks) || !Array.isArray(body.objects) || body.objects.length > 3000) return false;
    let count = 0;
    for (const [key, tiles] of Object.entries(body.chunks)) {
      if (!chunkPattern.test(key) || key.split(',').some(n => !map.valid(Number(n) * map.size)) || !object(tiles)) return false;
      for (const [index, type] of Object.entries(tiles)) {
        if (!/^\d{1,4}$/.test(index) || Number(index) >= map.size ** 2 || !Object.hasOwn(map.terrain, type)) return false;
        if (++count > 150000) return false;
      }
    }
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
    const dir = directory();
    const worlds = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json') && idPattern.test(entry.name.slice(0, -5)))
      .map(entry => { const { id, name: title } = read(path.join(dir, entry.name)); return { id, name: title }; }) : [];
    res.json({ worlds });
  }));
  app.post('/api/worlds', requireDm, json, route((req, res) => {
    const name = typeof req.body?.name === 'string' && req.body.name.trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Введите название карты' });
    const data = { id: randomUUID(), name, revision: 0, ...(req.body.sample === true ? map.sample() : { chunks: {}, objects: [] }) };
    write(file(data.id, ''), data);
    res.status(201).json(data);
  }));
  app.get('/api/worlds/live', requireDm, route((req, res) => {
    const data = play();
    if (!data) return res.json(null);
    const { id, name, revision } = data.map;
    res.json({
      revision: data.revision, frame: data.frame, fog: data.fog, tokens: data.tokens,
      map: req.query.version === id + ':' + revision ? { id, name, revision } : data.map,
    });
  }));
  app.get('/api/worlds/table', route((req, res) => {
    const data = play();
    if (!data) return res.json(null);
    const requested = typeof req.query.chunks === 'string' ? req.query.chunks.split(';') : [];
    if (requested.length > 100 || requested.some(key => !chunkPattern.test(key))) return res.status(400).json({ error: 'Некорректный участок карты' });
    const keys = new Set(requested);
    const chunks = {};
    const seen = {};
    for (const key of keys) {
      if (data.fog && data.seen[key]) seen[key] = data.seen[key];
      const tiles = data.map.chunks[key];
      if (!tiles) continue;
      chunks[key] = data.fog ? Object.fromEntries(Object.entries(tiles).filter(([offset]) => data.seen[key]?.[offset])) : tiles;
    }
    const visible = prop => {
      const [key, offset] = map.address(prop.x, prop.y);
      return keys.has(key) && (!data.fog || !!data.seen[key]?.[offset]);
    };
    res.json({
      id: data.map.id, revision: data.revision, frame: data.frame, tokens: data.tokens,
      chunks, seen, fog: data.fog, objects: data.map.objects.filter(prop => !prop.hidden && visible(prop)),
    });
  }));
  app.get('/api/worlds/:id', requireDm, route((req, res) => {
    const data = draft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    res.json(data);
  }));
  app.put('/api/worlds/:id', requireDm, json, route((req, res) => {
    const data = draft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    if (data.revision !== req.body?.revision) return res.status(409).json({ error: 'Черновик изменён в другом окне. Откройте его заново.' });
    if (!validMap(req.body)) return res.status(400).json({ error: 'Проверьте слои карты и количество тайлов' });
    const objects = req.body.objects.map(({ id, kind, x, y, turn, hidden }) => ({ id, kind, x, y, turn, hidden: hidden === true }));
    const next = { ...data, revision: data.revision + 1, chunks: req.body.chunks, objects };
    write(file(data.id, ''), next);
    res.json(next);
  }));
  app.post('/api/worlds/:id/publish', requireDm, json, route((req, res) => {
    const data = draft(req.params.id);
    if (!data) return res.status(404).json({ error: 'Карта не найдена' });
    if (data.revision !== req.body?.revision) return res.status(409).json({ error: 'Сначала сохраните актуальный черновик' });
    const previous = read(file(data.id, '-live'));
    const next = {
      tokens: [], seen: {}, frame: { x: 0, y: 0, scale: 24, serial: 0 }, ...previous,
      map: data, fog: req.body.fog === true, revision: (previous?.revision || 0) + 1,
    };
    write(file(data.id, '-live'), next);
    write(activeFile(), { id: data.id });
    revealScreen();
    announce(next);
    res.json(next);
  }));
  app.post('/api/worlds/live/change', requireDm, json, route((req, res) => {
    const data = play();
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
    write(file(data.map.id, '-live'), data);
    announce(data);
    res.json({ tokens: data.tokens, revision: data.revision, frame: data.frame });
  }));
  app.post('/api/worlds/live/hide', requireDm, route((req, res) => res.json({ hidden: hide() })));
  return { hide, notice: () => notice(play()) };
};

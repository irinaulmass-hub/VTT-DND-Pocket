'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

module.exports = (app, { express, requireDm, library, sceneFile, gameFile, mapStatePath, catalogDir, mapDir, campaignId }) => {
  const index = path.join(catalogDir, 'index.json');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const write = (file, data) => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  };
  const starter = [
    { id: 'starter-farm', name: 'Ферма Тэда', tags: ['ферма', 'деревня'], file: 'winden-farm.png', cols: 28, rows: 20 },
    { id: 'starter-mine', name: 'Старая шахта', tags: ['шахта', 'подземелье'], file: 'winden-mine.png', cols: 32, rows: 18 },
  ].map(entry => ({ ...entry, kind: 'map', starter: true, ext: '.png' }));
  const entries = () => fs.existsSync(index) ? read(index) : [];
  const find = id => [...starter, ...entries()].find(entry => entry.id === id);
  const summary = ({ id, name, kind, tags }) => ({ id, name, kind, tags });
  const imagePath = entry => entry.starter
    ? path.join(__dirname, 'resources', 'goblin-wars', 'maps', entry.file)
    : path.join(catalogDir, entry.id + entry.ext);
  const statePath = entry => path.join(catalogDir, entry.id + '.json');
  const privateImageUrl = (id, background = false) => '/api/catalog/' + id + (background ? '/background' : '/image');

  function localImage(url) {
    const match = typeof url === 'string' && /^\/assets\/maps\/([^/\\]+\.(png|jpe?g))$/i.exec(url);
    if (!match) return null;
    let filename;
    try { filename = decodeURIComponent(match[1]); } catch { return null; }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(filename) || path.basename(filename) !== filename) return null;
    const file = path.join(mapDir, filename);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
  }

  function snapshotMap(entry, view, file) {
    entry.ext = path.extname(file).toLowerCase();
    fs.copyFileSync(file, imagePath(entry));
    const draft = mapStatePath(path.parse(file).name);
    if (!fs.existsSync(draft)) return;
    const state = read(draft);
    if (state.bgImage === view.image) {
      state.bgImage = privateImageUrl(entry.id);
    } else {
      const background = localImage(state.bgImage);
      if (background) {
        entry.backgroundExt = path.extname(background).toLowerCase();
        fs.copyFileSync(background, path.join(catalogDir, entry.id + '-background' + entry.backgroundExt));
        state.bgImage = privateImageUrl(entry.id, true);
      }
    }
    write(statePath(entry), state);
  }

  function installMap(entry) {
    const id = randomUUID();
    const prefix = campaignId() === 'default' ? '' : campaignId() + '-';
    const basename = prefix + 'catalog-' + id;
    const filename = basename + entry.ext;
    const image = '/assets/maps/' + filename;
    const file = path.join(mapDir, filename);
    const drafts = gameFile('map-drafts');
    const draft = path.join(drafts, basename + '.map.json');
    const scenesFile = sceneFile();
    const scenes = read(scenesFile);
    const scene = { id, label: entry.name, tab: 'Из библиотеки', views: [{ id: id + '-view', label: entry.name, image, builderDraft: basename, fog: true, fit: 'contain' }] };
    const state = fs.existsSync(statePath(entry)) ? read(statePath(entry)) : {
      cols: entry.cols || 30, rows: entry.rows || 20, cellSize: 40,
      bgImage: privateImageUrl(entry.id), fogEnabled: true,
    };
    fs.mkdirSync(drafts, { recursive: true });
    fs.mkdirSync(mapDir, { recursive: true });
    try {
      fs.copyFileSync(imagePath(entry), file, fs.constants.COPYFILE_EXCL);
      write(draft, state);
      write(scenesFile, [...scenes, scene]);
    } catch (error) {
      for (const target of [file, draft, draft + '.tmp']) fs.rmSync(target, { force: true });
      throw error;
    }
    return { scene, draft: basename };
  }

  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); }
    catch (error) {
      console.error('Catalog:', error.message);
      res.status(500).json({ error: 'Не удалось сохранить или прочитать общую библиотеку' });
    }
  };

  app.get('/api/catalog', requireDm, route((req, res) => {
    res.json({ entries: [...starter, ...entries()].map(summary) });
  }));
  app.post('/api/catalog', requireDm, express.json({ limit: '8kb' }), route((req, res) => {
    const { cardId, sceneId, viewId, tags = [] } = req.body || {};
    if (!Array.isArray(tags) || tags.length > 8 || tags.some(tag => typeof tag !== 'string' || tag.length > 36)) {
      return res.status(400).json({ error: 'Добавьте до восьми меток длиной до 36 символов' });
    }
    const entry = { id: randomUUID(), tags: [...new Set(tags.map(tag => tag.trim()).filter(Boolean))] };
    fs.mkdirSync(catalogDir, { recursive: true });
    if (typeof cardId === 'string') {
      const card = library.read().entries.find(item => item.id === cardId && !item.archived);
      if (!card) return res.status(404).json({ error: 'Карточка не найдена' });
      Object.assign(entry, { name: card.name, kind: card.kind, card });
    } else {
      const scene = read(sceneFile()).find(item => item.id === sceneId);
      const view = scene?.views?.find(item => item.id === viewId);
      const file = localImage(view?.image);
      if (!file) return res.status(400).json({ error: 'Выберите карту с локальным изображением PNG или JPEG' });
      const name = view.label || scene.label;
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Укажите название карты' });
      Object.assign(entry, { name, kind: 'map' });
      snapshotMap(entry, view, file);
    }
    write(index, [...entries(), entry]);
    res.status(201).json(summary(entry));
  }));
  app.post('/api/catalog/:id/import', requireDm, route((req, res) => {
    const entry = find(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Заготовка не найдена' });
    res.status(201).json(entry.kind === 'map' ? installMap(entry) : { card: library.add(entry.card) });
  }));
  app.get('/api/catalog/:id/:asset(image|background)', requireDm, route((req, res) => {
    const entry = find(req.params.id);
    if (entry?.kind !== 'map') return res.sendStatus(404);
    if (req.params.asset === 'image') return res.sendFile(path.resolve(imagePath(entry)));
    if (!entry.backgroundExt) return res.sendStatus(404);
    res.sendFile(path.resolve(catalogDir, entry.id + '-background' + entry.backgroundExt));
  }));
};

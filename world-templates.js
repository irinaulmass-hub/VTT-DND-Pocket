'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { validTemplate } = require('./remote/world-generators');

module.exports = function registerWorldTemplates(app, { express, requireDm, gameFile }) {
  const file = () => gameFile('world-generator-templates.json');
  const read = () => {
    const saved = fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(), 'utf8')) : { revision: 0, templates: [] };
    if (!Number.isSafeInteger(saved?.revision) || saved.revision < 0 || !Array.isArray(saved.templates) ||
        saved.templates.length > 128 || !saved.templates.every(validTemplate) ||
        new Set(saved.templates.map(item => item.id)).size !== saved.templates.length) {
      throw new Error('Invalid template store');
    }
    return saved;
  };
  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { handler(req, res); }
    catch (error) {
      console.error('World templates:', error.message);
      res.status(500).json({ error: 'Не удалось прочитать или сохранить шаблоны' });
    }
  };

  app.get('/api/world-generator-templates', requireDm, route((req, res) => res.json(read())));
  app.post('/api/world-generator-templates', requireDm, express.json({ limit: '8kb' }), route((req, res) => {
    const { revision, name, kind, version, seed, settings } = req.body || {};
    const template = { id: randomUUID(), name: typeof name === 'string' ? name.trim() : name, kind, version, seed, settings };
    if (!Number.isSafeInteger(revision) || revision < 0 || !validTemplate(template) ||
        Object.keys(req.body).some(field => !['revision', 'name', 'kind', 'version', 'seed', 'settings'].includes(field))) {
      return res.status(400).json({ error: 'Укажите название и корректные настройки шаблона' });
    }
    const saved = read();
    if (saved.revision !== revision) return res.status(409).json({ error: 'Список шаблонов изменился. Обновите список и повторите сохранение.' });
    if (saved.revision === Number.MAX_SAFE_INTEGER) return res.status(409).json({ error: 'Достигнут предел ревизии шаблонов' });
    if (saved.templates.length >= 128) return res.status(400).json({ error: 'В кампании уже 128 шаблонов' });
    if (saved.templates.some(item => item.kind === kind && item.name.toLowerCase() === template.name.toLowerCase())) {
      return res.status(409).json({ error: 'Шаблон с этим названием уже есть. Укажите другое название.' });
    }
    const next = { revision: saved.revision + 1, templates: [...saved.templates, template] };
    const destination = file();
    fs.writeFileSync(destination + '.tmp', JSON.stringify(next));
    fs.renameSync(destination + '.tmp', destination);
    res.status(201).json(next);
  }));
};

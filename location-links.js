'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

module.exports = (app, { express, requireDm, gameFile, findLocation }) => {
  function read() {
    const file = gameFile('location-links.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }

  function save(links) {
    const file = gameFile('location-links.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(links));
    fs.renameSync(file + '.tmp', file);
  }

  app.get('/api/locations/links', requireDm, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ links: read() });
  });
  app.post('/api/locations/links', requireDm, express.json({ limit: '8kb' }), (req, res) => {
    const { from, to, returnLink } = req.body || {};
    if (typeof from !== 'string' || typeof to !== 'string' || from === to || !findLocation(from) || !findLocation(to)) {
      return res.status(400).json({ error: 'Выберите две разные карты этой кампании' });
    }
    const links = read();
    const add = (source, target) => {
      if (!links.some(link => link.from === source && link.to === target)) {
        links.push({ id: randomUUID(), from: source, to: target });
      }
    };
    add(from, to);
    if (returnLink === true) add(to, from);
    save(links);
    res.json({ links });
  });
  app.delete('/api/locations/links/:id', requireDm, (req, res) => {
    const links = read().filter(link => link.id !== req.params.id);
    save(links);
    res.json({ links });
  });
};

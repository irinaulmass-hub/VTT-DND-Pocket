'use strict';

const fs = require('node:fs');
const path = require('node:path');

const idPattern = /^[a-f0-9-]{36}$/;

function read(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);
}

module.exports = function createWorldStore(gameFile) {
  // Resolve paths on each operation so the server's current campaign selects the data.
  const worldFile = (id, suffix) => path.join(gameFile('worlds'), id + suffix + '.json');
  const readPublished = id => read(worldFile(id, '-live'));
  const readActiveId = () => read(gameFile('active-world.json'))?.id || null;

  return {
    listDrafts() {
      const dir = gameFile('worlds');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.json') && idPattern.test(entry.name.slice(0, -5)))
        .map(entry => {
          const { id, name } = read(path.join(dir, entry.name));
          return { id, name };
        });
    },
    readDraft: id => idPattern.test(id) ? read(worldFile(id, '')) : null,
    writeDraft: draft => write(worldFile(draft.id, ''), draft),
    readPublished,
    writePublished: (id, snapshot) => write(worldFile(id, '-live'), snapshot),
    readActiveId,
    writeActiveId: id => write(gameFile('active-world.json'), { id }),
    readActiveWorld() {
      const id = readActiveId();
      return id ? readPublished(id) : null;
    },
  };
};

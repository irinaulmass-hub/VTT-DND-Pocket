'use strict';

const fs = require('node:fs');

module.exports = function createWorldDiscoveries(gameFile) {
  const filename = () => gameFile('world-discoveries.json');
  const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

  function forCharacter(characterId) {
    return read(filename())[':' + characterId] || [];
  }

  function share(characterId, layout, prop) {
    const file = filename();
    const saved = read(file);
    const discoveries = saved[':' + characterId] ||= [];
    const { id, kind, x, y, turn } = prop;
    const entry = { mapId: layout.id, mapName: layout.name, object: { id, kind, x, y, turn } };
    const index = discoveries.findIndex(item => item.mapId === entry.mapId && item.object.id === id);
    const previous = discoveries[index];
    if (previous && previous.mapName === entry.mapName && previous.object.kind === kind &&
        previous.object.x === x && previous.object.y === y && previous.object.turn === turn) return false;

    if (index < 0) discoveries.push(entry);
    else discoveries[index] = entry;
    fs.writeFileSync(file + '.tmp', JSON.stringify(saved));
    fs.renameSync(file + '.tmp', file);
    return true;
  }

  return { forCharacter, share };
};

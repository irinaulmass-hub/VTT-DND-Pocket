'use strict';

const fs = require('node:fs');
const map = require('./remote/world-model');

const barriers = new Set(['wall', 'palisade', 'fence']);
const solid = new Set(['house', 'tavern', 'barn', 'well', 'boulder', 'tree', 'wagon', 'wreckedWagon']);

function sceneScope(layout) {
  return {
    worldId: layout.parentWorldId || layout.id,
    sceneId: layout.parentWorldId ? layout.id : 'overworld',
    floorId: 'ground',
  };
}

function mapId(position) {
  return position.sceneId === 'overworld' ? position.worldId : position.sceneId;
}

function covers(prop, x, y) {
  const bounds = map.footprint(prop);
  return x + .5 >= bounds.x - bounds.width / 2 && x + .5 < bounds.x + bounds.width / 2 &&
    y + .5 >= bounds.y - bounds.height / 2 && y + .5 < bounds.y + bounds.height / 2;
}

function passable(layout, x, y) {
  let bridge = false;
  for (const prop of layout.objects) {
    if (barriers.has(prop.kind) && map.wallCells(prop).some(([col, row]) => col === x && row === y)) return false;
    if (prop.kind === 'door' && prop.x === x && prop.y === y) return false;
    if (solid.has(prop.kind) && covers(prop, x, y)) return false;
    if (prop.kind === 'bridge' && covers(prop, x, y)) bridge = true;
  }
  return bridge || map.get(layout.chunks, x, y) !== 'water';
}

module.exports = function createWorldMovement(store, gameFile) {
  function layoutAt(position, keys, published = true) {
    if (typeof position.worldId !== 'string' || typeof position.sceneId !== 'string' ||
        position.floorId !== 'ground') return null;
    const id = mapId(position);
    const layout = (published && store.readPublished(id, keys)?.map) || store.readDraft(id, keys);
    if (!layout) return null;
    const scope = sceneScope(layout);
    return scope.worldId === position.worldId && scope.sceneId === position.sceneId ? layout : null;
  }

  function canStep(position, published = true) {
    const [key] = map.address(position.x, position.y);
    const layout = layoutAt(position, [key], published);
    return !!layout && passable(layout, position.x, position.y);
  }

  function readLinks() {
    const file = gameFile('world-transitions.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }

  function writeLinks(links) {
    const file = gameFile('world-transitions.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(links));
    fs.renameSync(file + '.tmp', file);
  }

  return {
    sceneScope,
    locationExists: position => !!layoutAt(position, [], false),
    canStep,
    findTransition(position) {
      return readLinks().find(({ from }) => from.worldId === position.worldId &&
        from.sceneId === position.sceneId && from.floorId === position.floorId &&
        from.x === position.x && from.y === position.y)?.to || null;
    },
    listTransitions(id) {
      return readLinks().filter(link => mapId(link.from) === id);
    },
    saveTransition(from, to) {
      const links = readLinks();
      const id = JSON.stringify([mapId(from), from.x, from.y]);
      const link = { id, from, to };
      writeLinks([...links.filter(item => item.id !== id), link]);
      return link;
    },
    removeTransition(sceneMapId, id) {
      writeLinks(readLinks().filter(link => link.id !== id || mapId(link.from) !== sceneMapId));
    },
  };
};

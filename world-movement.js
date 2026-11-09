'use strict';

const fs = require('node:fs');
const map = require('./remote/world-model');

const barriers = new Set(['wall', 'palisade', 'fence']);
const solid = new Set(['house', 'tavern', 'barn', 'well', 'boulder', 'tree', 'wagon', 'wreckedWagon']);
const sightRadius = 4;

const { sceneScope, locationMapId } = map;

function cellBounds(prop) {
  const { x, y, width, height } = map.footprint(prop);
  return {
    left: Math.ceil(x - width / 2 - .5),
    right: Math.ceil(x + width / 2 - .5) - 1,
    top: Math.ceil(y - height / 2 - .5),
    bottom: Math.ceil(y + height / 2 - .5) - 1,
  };
}

function covers(prop, x, y) {
  const bounds = cellBounds(prop);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function passable(layout, x, y, openDoors) {
  let bridge = false;
  for (const prop of layout.objects) {
    if (barriers.has(prop.kind) && map.wallCells(prop).some(([col, row]) => col === x && row === y)) return false;
    if (prop.kind === 'door' && !openDoors.has(prop.id) && prop.x === x && prop.y === y) return false;
    if (solid.has(prop.kind) && covers(prop, x, y)) return false;
    if (prop.kind === 'bridge' && covers(prop, x, y)) bridge = true;
  }
  return bridge || map.get(layout.chunks, x, y) !== 'water';
}

function sightObstacles(objects, origin, openDoors) {
  const blocked = new Set();
  for (const prop of objects) {
    if (barriers.has(prop.kind)) {
      for (const cell of map.wallCells(prop)) blocked.add(cell.join(','));
    } else if (prop.kind === 'door' && !openDoors.has(prop.id)) {
      blocked.add(prop.x + ',' + prop.y);
    } else if (solid.has(prop.kind)) {
      const bounds = cellBounds(prop);
      const left = Math.max(origin.x - sightRadius, bounds.left);
      const right = Math.min(origin.x + sightRadius, bounds.right);
      const top = Math.max(origin.y - sightRadius, bounds.top);
      const bottom = Math.min(origin.y + sightRadius, bounds.bottom);
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) blocked.add(x + ',' + y);
      }
    }
  }
  return blocked;
}

function hasSight(origin, target, blocked) {
  const width = Math.abs(target.x - origin.x);
  const height = Math.abs(target.y - origin.y);
  const dx = Math.sign(target.x - origin.x);
  const dy = Math.sign(target.y - origin.y);
  let x = origin.x, y = origin.y;
  let columns = 0, rows = 0;
  const opaque = (col, row) => blocked.has(col + ',' + row);

  while (columns < width || rows < height) {
    const nextColumn = (2 * columns + 1) * height;
    const nextRow = (2 * rows + 1) * width;
    // A ray through a corner cannot pass between two adjacent opaque cells.
    if (nextColumn === nextRow && opaque(x + dx, y) && opaque(x, y + dy)) return false;
    if (nextColumn <= nextRow) { x += dx; columns++; }
    if (nextRow <= nextColumn) { y += dy; rows++; }
    if (x === target.x && y === target.y) return true;
    if (opaque(x, y)) return false;
  }
  return true;
}

function visibleCells(position, objects, openDoors) {
  const blocked = sightObstacles(objects, position, openDoors);
  const visible = [];
  for (let dy = -sightRadius; dy <= sightRadius; dy++) {
    for (let dx = -sightRadius; dx <= sightRadius; dx++) {
      if (dx * dx + dy * dy > sightRadius * sightRadius) continue;
      const target = { x: position.x + dx, y: position.y + dy };
      if (map.valid(target.x) && map.valid(target.y) && hasSight(position, target, blocked)) visible.push(target);
    }
  }
  return visible;
}

module.exports = function createWorldMovement(store, gameFile) {
  function layoutAt(position, keys, published = true) {
    if (typeof position.worldId !== 'string' || typeof position.sceneId !== 'string' ||
        typeof position.floorId !== 'string') return null;
    const id = locationMapId(position);
    const layout = (published && store.readPublished(id, keys)?.map) || store.readDraft(id, keys);
    if (!layout) return null;
    const scope = sceneScope(layout);
    return scope.worldId === position.worldId && scope.sceneId === position.sceneId &&
      scope.floorId === position.floorId ? layout : null;
  }

  function canStep(position, published = true) {
    const [key] = map.address(position.x, position.y);
    const layout = layoutAt(position, [key], published);
    return !!layout && passable(layout, position.x, position.y, new Set());
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
    visibleCells,
    doorVisibility(position, objects, door, previous, next) {
      if ((position.x - door.x) ** 2 + (position.y - door.y) ** 2 > sightRadius ** 2) return [];
      if (!hasSight(position, door, sightObstacles(objects, position, previous))) return [];
      return visibleCells(position, objects, next);
    },
    locationExists: position => !!layoutAt(position, [], false),
    canStep,
    stepVisibility(position, openDoors) {
      const [key] = map.address(position.x, position.y);
      const layout = layoutAt(position, [key]);
      return layout && passable(layout, position.x, position.y, openDoors) ? visibleCells(position, layout.objects, openDoors) : null;
    },
    findTransition(position) {
      return readLinks().find(({ from }) => from.worldId === position.worldId &&
        from.sceneId === position.sceneId && from.floorId === position.floorId &&
        from.x === position.x && from.y === position.y)?.to || null;
    },
    listTransitions(id) {
      return readLinks().filter(link => locationMapId(link.from) === id);
    },
    saveTransition(from, to) {
      const links = readLinks();
      const id = JSON.stringify([locationMapId(from), from.x, from.y]);
      const link = { id, from, to };
      writeLinks([...links.filter(item => item.id !== id), link]);
      return link;
    },
    removeTransition(sceneMapId, id) {
      writeLinks(readLinks().filter(link => link.id !== id || locationMapId(link.from) !== sceneMapId));
    },
  };
};

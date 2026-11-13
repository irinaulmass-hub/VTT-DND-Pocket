'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const map = require('./remote/world-model');

const barriers = new Set(['wall', 'palisade', 'fence']);
const solid = new Set(['house', 'tavern', 'barn', 'well', 'boulder', 'tree', 'wagon', 'wreckedWagon']);
const sightRadius = 4;

const { sceneScope, locationMapId, cellBounds } = map;

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
    if (map.furnitureKinds.has(prop.kind) && covers(prop, x, y)) return false;
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

  const linkId = position => JSON.stringify([locationMapId(position), position.x, position.y]);
  const revisionOf = links => createHash('sha256').update(JSON.stringify(links)).digest('hex');
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const samePoint = (a, b) => a && b && ['worldId', 'sceneId', 'floorId', 'x', 'y'].every(key => a[key] === b[key]);
  const buildingMatches = (layout, building) => !!building && layout?.id === building.mapId &&
    layout.objects.some(prop => prop.id === building.objectId && map.buildingKinds.has(prop.kind) &&
      ['kind', 'x', 'y', 'turn'].every(key => prop[key] === building[key]) && !prop.hidden);
  const publishedAt = position => {
    const layout = store.readPublished(locationMapId(position), new Set([map.address(position.x, position.y)[0]]))?.map;
    return layout && samePoint({ ...sceneScope(layout), x: position.x, y: position.y }, position) ? layout : null;
  };

  function findTransition(position, openDoors = new Set()) {
    const links = readLinks();
    const link = links.find(({ from }) => samePoint(from, position));
    if (!link) return null;
    if (link.pairId) {
      const pair = links.filter(item => item.pairId === link.pairId);
      const source = publishedAt(link.from), target = publishedAt(link.to);
      const building = link.building;
      if (pair.length !== 2 || !pair.every(item => JSON.stringify(item.building) === JSON.stringify(building)) ||
          !pair.some(item => samePoint(item.from, link.to) && samePoint(item.to, link.from)) || !source || !target ||
          !buildingMatches(source.id === building?.mapId ? source : target, building) ||
          !passable(source, position.x, position.y, openDoors)) return null;
      const interior = source.id === building.mapId ? { layout: target, point: link.to } : { layout: source, point: link.from };
      if (map.get(interior.layout.chunks, interior.point.x, interior.point.y) === undefined) return null;
    }
    return link.to;
  }

  function saveBuildingLink(source, target, body) {
    const { buildingId, sourceRevision, targetRevision, linksRevision, x, y, toX, toY } = body;
    if (source.revision !== sourceRevision || target.revision !== targetRevision) fail(409, 'Карта изменилась. Открой актуальные черновики и повтори привязку.');
    const from = { ...sceneScope(source), x, y }, to = { ...sceneScope(target), x: toX, y: toY };
    if (source.id === target.id || from.worldId !== to.worldId || !target.parentWorldId) {
      fail(400, 'Выбери внутреннюю сцену или этаж того же мира.');
    }
    const prop = source.objects.find(item => item.id === buildingId && map.buildingKinds.has(item.kind));
    if (!prop) fail(404, 'Постройка не найдена на исходной карте.');
    if (prop.hidden) fail(409, 'Скрытую постройку сначала нужно сделать доступной игрокам.');
    const bounds = cellBounds(prop);
    const adjacent = ((x === bounds.left - 1 || x === bounds.right + 1) && y >= bounds.top && y <= bounds.bottom) ||
      ((y === bounds.top - 1 || y === bounds.bottom + 1) && x >= bounds.left && x <= bounds.right);
    if (!adjacent) fail(400, 'Вход должен находиться рядом с краем постройки, а не внутри неё или по диагонали.');
    if (!canStep(from, false) || !canStep(to, false)) fail(409, 'Обе клетки перехода должны быть проходимыми.');
    if (map.get(store.readDraft(target.id, new Set([map.address(toX, toY)[0]])).chunks, toX, toY) === undefined) {
      fail(409, 'Сначала подготовь пол в клетке внутренней сцены.');
    }
    const links = readLinks();
    if (revisionOf(links) !== linksRevision) fail(409, 'Переходы изменились. Обнови список и повтори привязку.');
    const pairId = JSON.stringify(['building', source.id, buildingId]);
    const remaining = links.filter(item => item.pairId !== pairId);
    if (remaining.some(item => [linkId(from), linkId(to)].includes(item.id))) fail(409, 'Одна из клеток уже занята другим переходом.');
    const building = { mapId: source.id, objectId: prop.id, kind: prop.kind, x: prop.x, y: prop.y, turn: prop.turn };
    const pair = [{ id: linkId(from), from, to, pairId, building }, { id: linkId(to), from: to, to: from, pairId, building }];
    writeLinks([...remaining, ...pair]);
    return pair;
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
    findTransition,
    saveBuildingLink,
    districtContext(layout) {
      const links = readLinks();
      const local = links.filter(link => link.pairId && locationMapId(link.from) === layout.id);
      const pinnedIds = new Set(), reservedCells = [];
      for (const link of local) {
        const pair = links.filter(item => item.pairId === link.pairId);
        if (pair.length !== 2 || !pair.every(item => JSON.stringify(item.building) === JSON.stringify(link.building)) ||
            !pair.some(item => samePoint(item.from, link.to) && samePoint(item.to, link.from))) {
          fail(409, 'Пара переходов повреждена. Проверь связь с интерьером перед регенерацией.');
        }
        if (link.building?.mapId === layout.id) {
          if (!buildingMatches(layout, link.building)) fail(409, 'Связанная постройка изменилась. Сначала настрой её связь заново.');
          pinnedIds.add(link.building.objectId);
        }
        if (!passable(layout, link.from.x, link.from.y, new Set())) {
          fail(409, 'Клетка входа или возврата перекрыта. Освободи её перед регенерацией.');
        }
        reservedCells.push({ x: link.from.x, y: link.from.y });
      }
      return { pinnedIds: [...pinnedIds], reservedCells, linksRevision: revisionOf(links), hasBindings: !!local.length };
    },
    linksRevision: () => revisionOf(readLinks()),
    listTransitions(id) {
      return readLinks().filter(link => locationMapId(link.from) === id);
    },
    saveTransition(from, to) {
      const links = readLinks();
      const id = linkId(from);
      if (links.some(item => item.id === id && item.pairId)) fail(409, 'Здесь уже есть вход в здание. Измени или удали всю пару.');
      const link = { id, from, to };
      writeLinks([...links.filter(item => item.id !== id), link]);
      return link;
    },
    removeTransition(sceneMapId, id, revision) {
      const links = readLinks();
      const link = links.find(item => item.id === id && locationMapId(item.from) === sceneMapId);
      if (link?.pairId && revisionOf(links) !== revision) fail(409, 'Переходы изменились. Обнови список и повтори удаление.');
      writeLinks(links.filter(item => link?.pairId ? item.pairId !== link.pairId : item !== link));
    },
  };
};

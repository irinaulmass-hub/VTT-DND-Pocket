'use strict';

((root) => {
  const size = 32;
  const limit = 8192;
  const tileLimit = 150000;
  const objectLimit = 3000;
  const terrain = {
    grass: ['Трава', '#7e9b55'], dirt: ['Земля', '#aa875c'], path: ['Тропа', '#c8a371'],
    forest: ['Лес', '#3e6340'], water: ['Вода', '#477f89'], stone: ['Камень', '#909289'], wood: ['Доски', '#a06e47'],
    denseForest: ['Густой лес', '#435537'], woodland: ['Лесная подстилка', '#737d54'],
    caveFloor: ['Пещерный пол', '#625e56'], mud: ['Грязь', '#705740'],
  };
  const props = {
    house: ['Домик', 3, 3], tavern: ['Таверна', 5, 4], bridge: ['Мост', 4, 2],
    tree: ['Дерево', 1, 1], bush: ['Куст', 1, 1], wall: ['Каменная стена', 2, 1], door: ['Дверь', 1, 1],
    wagon: ['Повозка', 3, 2], wreckedWagon: ['Повозка (разбитая)', 3, 2],
    campfire: ['Костёр', 1, 1], barrel: ['Бочка', 1, 1], vineBarrel: ['Бочка (особая)', 1, 1],
    chest: ['Сундук', 1, 1], openChest: ['Сундук (приоткрытый)', 1, 1],
    palisade: ['Частокол', 2, 1], ruinedHouse: ['Разрушенный дом', 3, 3],
    table: ['Стол', 2, 1], bench: ['Скамейка', 2, 1], bed: ['Кровать', 1, 2],
    stairs: ['Лестница', 2, 3], bearTrap: ['Капкан', 1, 1],
    brazier: ['Жаровня', 1, 1], goblinTotems: ['Тотемы гоблинов', 2, 1],
    barn: ['Амбар', 6, 4], well: ['Колодец', 1, 1], cart: ['Телега', 3, 1],
    pole: ['Столб', 1, 1], pumpkin: ['Тыква', 1, 1], smallPumpkin: ['Тыква (маленькая)', 1, 1],
    greatsword: ['Большой меч', 2, 1], burningRoof: ['Горящая крыша', 3, 3], debris: ['Обломки', 2, 1],
    fence: ['Деревянный забор', 2, 1], bones: ['Кости', 1, 1], boulder: ['Валун', 1, 1],
    torch: ['Факел', 1, 1], garland: ['Гирлянда', 3, 1],
    goblinArcher: ['Гоблин-лучник', 1, 1], goblinShield: ['Гоблин со щитом', 1, 1],
    goblinAxes: ['Гоблин с топорами', 1, 1],
  };
  const buildingKinds = new Set(['house', 'tavern', 'barn']);
  // Low furniture blocks occupied cells, but does not block sight like a wall.
  const furnitureKinds = new Set(['table', 'bench', 'bed']);
  const linkedSections = new Set(['wall','palisade','fence']);
  const propGroups = {
    'Существа': ['goblinArcher','goblinShield','goblinAxes'],
    'Постройки и природа': ['house','tavern','barn','bridge','well','tree','bush','wall','door','fence','palisade','ruinedHouse','burningRoof','boulder'],
    'Деревня и лагерь': ['wagon','wreckedWagon','cart','campfire','pole','pumpkin','smallPumpkin','garland'],
    'Интерьер и приключения': ['barrel','vineBarrel','chest','openChest','table','bench','bed','stairs','brazier','torch','bearTrap','goblinTotems','greatsword','debris','bones'],
  };
  const directions = [[0,-1],[1,0],[0,1],[-1,0]];
  function wallCells(prop) {
    const [dx,dy] = directions[(prop.turn + 1) % 4];
    return [[prop.x,prop.y],[prop.x+dx,prop.y+dy]];
  }
  function footprint(prop) {
    const [,w,h] = props[prop.kind];
    const width = prop.turn % 2 ? h : w;
    const height = prop.turn % 2 ? w : h;
    if (linkedSections.has(prop.kind)) {
      const [, [x,y]] = wallCells(prop);
      return { x: (prop.x+x)/2+.5, y: (prop.y+y)/2+.5, width, height };
    }
    return { x: prop.x + (width%2 ? .5 : 1), y: prop.y + (height%2 ? .5 : 1), width, height };
  }
  function cellBounds(prop) {
    const { x, y, width, height } = footprint(prop);
    return {
      left: Math.ceil(x - width / 2 - .5),
      right: Math.ceil(x + width / 2 - .5) - 1,
      top: Math.ceil(y - height / 2 - .5),
      bottom: Math.ceil(y + height / 2 - .5) - 1,
    };
  }
  // Render metadata only: never use these envelopes for movement, sight or exploration.
  function crownFrame(prop) {
    const variant = ((Math.imul(prop.x, 53) ^ Math.imul(prop.y, 107) ^ (prop.turn << 3)) >>> 0) % 32;
    return { variant, left: -1.2 + ((variant % 7) - 3) * .038,
      top: -1.1 + ((variant % 5) - 2) * .045, width: 2.4, height: 2.4 };
  }
  function visualBounds(prop) {
    const center = footprint(prop);
    if (prop.kind === 'tree' || prop.kind === 'bush') {
      const frame = crownFrame(prop);
      return { left: center.x + frame.left, right: center.x + frame.left + frame.width,
        top: center.y + frame.top, bottom: center.y + frame.top + frame.height };
    }
    let halfWidth, halfHeight;
    if (prop.kind === 'wall') {
      // Connected wall fills reach .501 from each occupied cell's center.
      halfWidth = center.width / 2 + .002; halfHeight = center.height / 2 + .002;
    } else if (buildingKinds.has(prop.kind) || prop.kind === 'bridge') {
      // Roof canvas adds .3 per side; fixed southeast shadows extend at most .29.
      halfWidth = center.width / 2 + .3; halfHeight = center.height / 2 + .3;
    } else {
      // Normalized decor includes round caps and the tilted broken wagon. Also cover
      // the fallback shadow (.10/.16), sprites and the selected outline (.06).
      halfWidth = Math.max(center.width * .6, center.width / 2 + .2);
      halfHeight = Math.max(center.height * .6, center.height / 2 + .2);
    }
    return { left: center.x - halfWidth, right: center.x + halfWidth,
      top: center.y - halfHeight, bottom: center.y + halfHeight };
  }
  const boundsIntersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function structures(objects) {
    const walls = new Set();
    const doors = new Map();
    for (const prop of objects) {
      if (prop.kind === 'wall') for (const cell of wallCells(prop)) walls.add(cell.join(','));
    }
    for (const prop of objects) {
      if (prop.kind !== 'door') continue;
      const counts = [0,0];
      directions.forEach(([dx,dy],i) => {
        if (walls.has((prop.x+dx)+','+(prop.y+dy))) counts[(i+1)%2]++;
      });
      const axis = counts[0] === counts[1] ? prop.turn % 2 : Number(counts[1] > counts[0]);
      doors.set(prop.x+','+prop.y, axis);
    }
    return {
      doorAxis: prop => doors.get(prop.x+','+prop.y) ?? prop.turn%2,
      wallMask(x,y) {
        return directions.reduce((mask,[dx,dy],i) => {
          const key=(x+dx)+','+(y+dy);
          return walls.has(key) || doors.get(key)===(i+1)%2 ? mask | (1<<i) : mask;
        },0);
      },
    };
  }
  const valid = n => Number.isInteger(n) && n >= -limit && n < limit;
  function address(x, y) {
    const cx = Math.floor(x / size), cy = Math.floor(y / size);
    return [cx + ',' + cy, (y - cy * size) * size + x - cx * size];
  }
  function get(chunks, x, y) {
    const [key, offset] = address(x, y);
    return chunks[key]?.[offset];
  }
  function set(chunks, x, y, value) {
    const [key, offset] = address(x, y);
    if (value === undefined || value === null) {
      if (!chunks[key]) return;
      delete chunks[key][offset];
      if (!Object.keys(chunks[key]).length) delete chunks[key];
    } else {
      (chunks[key] ||= {})[offset] = value;
    }
  }
  function sample() {
    const chunks = {};
    for (let y = -15; y <= 15; y++) for (let x = -24; x <= 24; x++) {
      let type = 'grass';
      if ((x + 15) ** 2 / 49 + (y + 2) ** 2 / 30 < 1) type = 'water';
      if (x > 9 + Math.sin(y * .6) * 2 || (y > 9 && x < -8)) type = 'forest';
      if ((y === 0 && x >= -8 && x <= 13) || (x === 0 && y >= 0)) type = 'path';
      set(chunks, x, y, type);
    }
    return { chunks, objects: [
      { id: 'inn', kind: 'tavern', x: 2, y: 1, turn: 0 },
      { id: 'home', kind: 'house', x: -3, y: -2, turn: 0 },
      { id: 'pier', kind: 'bridge', x: -9, y: 0, turn: 0 },
      { id: 'oak', kind: 'tree', x: -6, y: -2, turn: 0 },
      { id: 'roadside-shrub', kind: 'bush', x: 6, y: -1, turn: 0 },
    ] };
  }
  function sceneScope(layout) {
    return {
      worldId: layout.parentWorldId || layout.id,
      sceneId: layout.parentSceneId || (layout.parentWorldId ? layout.id : 'overworld'),
      floorId: layout.parentSceneId ? layout.id : 'ground',
    };
  }

  function locationMapId({ worldId, sceneId, floorId }) {
    if (floorId !== 'ground') return floorId;
    return sceneId === 'overworld' ? worldId : sceneId;
  }

  const api = { size, limit, tileLimit, objectLimit, terrain, props, valid, address, get, set, sample, wallCells, structures, sceneScope, locationMapId, linkedSections, buildingKinds, furnitureKinds, propGroups, footprint, cellBounds, crownFrame, visualBounds, boundsIntersect };
  if (typeof module === 'object') module.exports = api;
  else root.WorldMap = api;
})(globalThis);

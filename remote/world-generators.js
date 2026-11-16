'use strict';

((root) => {
  const { size, limit, tileLimit, terrain, objectLimit, valid, get, set, cellBounds, wallCells } = typeof module === 'object' ? require('./world-model') : root.WorldMap;

  const seedMax = 0xffffffff;
  const maxRecipes = 128;
  const maxPathPoints = 256;
  const maxPathCells = 16384;
  const maxPathSteps = 65536;
  const maxForestPoints = 64;
  const maxForestArea = 4096;
  const maxDistrictBuildings = 24;
  const forestGround = new Set([undefined, 'grass', 'forest', 'denseForest', 'woodland']);
  const structuralPaths = new Set(['wall', 'fence', 'palisade']);
  const roomThemes = { none: 'Без мебели', tavern: 'Таверна', bedroom: 'Спальня',
    library: 'Библиотека', storeroom: 'Склад', crypt: 'Склеп', workshop: 'Мастерская' };
  const roomFurniture = new Set(['table','bench','bed','chest','barrel','torch','brazier','bones',
    'bookshelf','chair','altar','sarcophagus','crate','rug','oven','counter','anvil']);
  const plotBiomes = {
    forest: { label:'Лиственный лес', ground:'woodland', kinds:['tree','bush'] },
    pine: { label:'Хвойный лес', ground:'woodland', kinds:['pine','boulder','bush'] },
    meadow: { label:'Цветущий луг', ground:'grass', kinds:['flowers','bush'] },
    field: { label:'Пшеничное поле', ground:'dirt', kinds:['wheat'] },
    garden: { label:'Огород', ground:'dirt', kinds:['crops'] },
    orchard: { label:'Яблоневый сад', ground:'grass', kinds:['appleTree'] },
    graveyard: { label:'Кладбище', ground:'grass', kinds:['grave','flowers'] },
  };

  function hasFields(value, fields) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
  }

  function validSeed(seed) {
    return Number.isInteger(seed) && seed >= 0 && seed <= seedMax;
  }

  function validPathParams(params) {
    if (!hasFields(params, ['terrain', 'width', 'points'])) return false;
    const { terrain, width, points } = params;
    if ((terrain !== 'path' && terrain !== 'water' && !structuralPaths.has(terrain)) ||
        (structuralPaths.has(terrain) && width !== 1) ||
        !Number.isInteger(width) || width < 1 || width > 15 || width % 2 === 0 ||
        !Array.isArray(points) || points.length < 2 || points.length > maxPathPoints) return false;

    let previous;
    for (const point of points) {
      if (!hasFields(point, ['x', 'y']) || !valid(point.x) || !valid(point.y) ||
          (point.x === previous?.x && point.y === previous?.y)) return false;
      previous = point;
    }
    return true;
  }

  function forestBounds(points) {
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  const orientation = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

  function crossing(a, b, c, d) {
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) &&
      orientation(a, b, c) * orientation(a, b, d) <= 0 && orientation(c, d, a) * orientation(c, d, b) <= 0;
  }

  function validForestParams(params) {
    const fields=['density','points'];
    if (params && Object.hasOwn(params,'biome')) fields.push('biome');
    if (params && Object.hasOwn(params,'orientation')) fields.push('orientation');
    if (!hasFields(params, fields) || (Object.hasOwn(params,'biome') && (typeof params.biome !== 'string' || !Object.hasOwn(plotBiomes,params.biome))) ||
        (Object.hasOwn(params,'orientation') && ![0,1].includes(params.orientation)) || !Number.isInteger(params.density) ||
        params.density < 10 || params.density > 100 || !Array.isArray(params.points) ||
        params.points.length < 3 || params.points.length > maxForestPoints) return false;
    const seen = new Set();
    for (const point of params.points) {
      if (!hasFields(point, ['x', 'y']) || !valid(point.x) || !valid(point.y)) return false;
      const key = point.x + ',' + point.y;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    const { left, right, top, bottom } = forestBounds(params.points);
    if ((right - left + 1) * (bottom - top + 1) > maxForestArea) return false;
    const twiceArea = params.points.reduce((area, point, index) => {
      const next = params.points[(index + 1) % params.points.length];
      return area + point.x * next.y - point.y * next.x;
    }, 0);
    if (!twiceArea) return false;
    const { points } = params;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        if (crossing(points[i], points[i + 1], points[j], points[(j + 1) % points.length])) return false;
      }
    }
    return true;
  }

  const roomFloors = new Set(['wood', 'stone', 'caveFloor']);
  const neighbors = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function roomShape(params) {
    const { points, entrance } = params;
    const bounds = forestBounds(points);
    const area = new Map();
    for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) {
      if (contains(points, x, y)) area.set(x + ',' + y, { x, y });
    }
    const boundary = new Map(), interior = new Map();
    for (const [key, cell] of area) {
      const edge = neighbors.some(([dx, dy]) => !area.has((cell.x + dx) + ',' + (cell.y + dy)));
      (edge ? boundary : interior).set(key, cell);
    }
    if (!interior.size || !boundary.has(entrance.x + ',' + entrance.y)) return null;
    const connected = new Set(), queue = [interior.values().next().value];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i], key = cell.x + ',' + cell.y;
      if (connected.has(key)) continue;
      connected.add(key);
      for (const [dx, dy] of neighbors) {
        const next = interior.get((cell.x + dx) + ',' + (cell.y + dy));
        if (next && !connected.has(next.x + ',' + next.y)) queue.push(next);
      }
    }
    if (connected.size !== interior.size) return null;
    const { x, y } = entrance;
    const at = (cells, dx, dy) => cells.has((x + dx) + ',' + (y + dy));
    const horizontal = at(boundary, -1, 0) && at(boundary, 1, 0) &&
      ((at(interior, 0, 1) && !at(area, 0, -1) && valid(y - 1)) ||
       (at(interior, 0, -1) && !at(area, 0, 1) && valid(y + 1)));
    const vertical = at(boundary, 0, -1) && at(boundary, 0, 1) &&
      ((at(interior, 1, 0) && !at(area, -1, 0) && valid(x - 1)) ||
       (at(interior, -1, 0) && !at(area, 1, 0) && valid(x + 1)));
    if (!horizontal && !vertical) return null;
    boundary.delete(x + ',' + y);
    // Every solid boundary cell needs a neighboring cell for the existing two-cell wall object.
    for (const cell of boundary.values()) {
      if (!neighbors.some(([dx, dy]) => boundary.has((cell.x + dx) + ',' + (cell.y + dy)))) return null;
    }
    return { area, boundary, doorTurn: horizontal ? 0 : 1 };
  }

  function validRoomParams(params) {
    const fields = ['floor', 'points', 'entrance'];
    if (params && Object.hasOwn(params, 'furnishing')) fields.push('furnishing');
    if (!hasFields(params, fields) || (Object.hasOwn(params, 'furnishing') && !Object.hasOwn(roomThemes, params.furnishing)) || !roomFloors.has(params.floor) ||
        !hasFields(params.entrance, ['x', 'y']) || !valid(params.entrance.x) || !valid(params.entrance.y) ||
        !validForestParams({ density: 10, points: params.points })) return false;
    if (!params.points.every((point, index) => {
      const next = params.points[(index + 1) % params.points.length];
      return point.x === next.x || point.y === next.y;
    })) return false;
    return !!roomShape(params);
  }

  function validDistrictParams(params) {
    if (!hasFields(params, ['count', 'points']) || !Number.isInteger(params.count) ||
        params.count < 1 || params.count > maxDistrictBuildings ||
        !validForestParams({ density: 10, points: params.points }) || params.points.length !== 4) return false;
    const { left, right, top, bottom } = forestBounds(params.points);
    if (right - left < 10 || bottom - top < 10) return false;
    // The first district slice deliberately accepts only a rectangle, in either winding.
    return params.points.every((point, index) => {
      const next = params.points[(index + 1) % 4];
      return (point.x === left || point.x === right) && (point.y === top || point.y === bottom) &&
        (point.x === next.x || point.y === next.y);
    });
  }

  const cellKey = ({ x, y }) => x + ',' + y;
  const sameObject = (a, b) => !!a && !!b &&
    ['id', 'kind', 'x', 'y', 'turn','groupId','groupName'].every(key => a[key] === b[key]) && !!a.hidden === !!b.hidden;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const terrainValue = value => value === null || typeof value === 'string' && Object.hasOwn(terrain, value);

  function validState(state, kind, params) {
    if (!hasFields(state, ['version', 'tiles', 'objects', 'protectedTiles', 'protectedObjects']) || state.version !== 1 ||
        !Array.isArray(state.tiles) || state.tiles.length > (kind === 'path' ? maxPathCells : maxForestArea) ||
        !Array.isArray(state.objects) || state.objects.length > objectLimit ||
        !Array.isArray(state.protectedTiles) || state.protectedTiles.length > tileLimit ||
        !Array.isArray(state.protectedObjects) || state.protectedObjects.length > objectLimit) return false;
    for (const [cells, fields] of [[state.tiles, ['x', 'y', 'before', 'after']], [state.protectedTiles, ['x', 'y']]]) {
      const seen = new Set();
      for (const cell of cells) {
        if (!hasFields(cell, fields) || !valid(cell.x) || !valid(cell.y) || seen.has(cellKey(cell))) return false;
        const allowedAfter = kind === 'forest' ? cell.after === (plotBiomes[params?.biome || 'forest']?.ground) : kind === 'room' ? roomFloors.has(cell.after) :
          kind === 'district' ? ['path', 'dirt'].includes(cell.after) : !structuralPaths.has(params?.terrain) && ['path', 'water'].includes(cell.after);
        if (fields.length === 4 && (!terrainValue(cell.before) || !allowedAfter)) return false;
        seen.add(cellKey(cell));
      }
    }
    const ids = new Set();
    for (const prop of state.objects) {
      const allowedKind = kind === 'path' ? structuralPaths.has(params?.terrain) && prop?.kind === params.terrain :
        kind === 'room' ? ['wall', 'door'].includes(prop?.kind) || params?.furnishing && params.furnishing !== 'none' && roomFurniture.has(prop?.kind) :
        kind === 'district' ? prop?.kind === 'house' : (plotBiomes[params?.biome || 'forest']?.kinds || []).includes(prop?.kind);
      if (!['path', 'forest', 'room', 'district'].includes(kind) || !hasFields(prop, ['id', 'kind', 'x', 'y', 'turn', 'hidden']) ||
          typeof prop.id !== 'string' || !prop.id.length || prop.id.length > 64 || ids.has(prop.id) ||
          !allowedKind || !valid(prop.x) || !valid(prop.y) ||
          ![0, 1, 2, 3].includes(prop.turn) || typeof prop.hidden !== 'boolean' ||
          (structuralPaths.has(prop.kind) && !wallCells(prop).every(cell => cell.every(valid)))) return false;
      ids.add(prop.id);
    }
    const protectedIds = state.protectedObjects;
    return protectedIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64) &&
      new Set(protectedIds).size === protectedIds.length;
  }

  function validRecipe(recipe) {
    const fields = ['id', 'kind', 'version', 'seed', 'params'];
    if (recipe && Object.hasOwn(recipe, 'state')) fields.push('state');
    return hasFields(recipe, fields) &&
      (!Object.hasOwn(recipe, 'state') || validState(recipe.state, recipe.kind, recipe.params)) &&
      typeof recipe.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(recipe.id) &&
      recipe.version === 1 && validSeed(recipe.seed) &&
      ((recipe.kind === 'path' && validPathParams(recipe.params)) ||
       (recipe.kind === 'forest' && validForestParams(recipe.params)) ||
       (recipe.kind === 'room' && validRoomParams(recipe.params)) ||
       (recipe.kind === 'district' && validDistrictParams(recipe.params)));
  }

  function validTemplate(template) {
    if (!hasFields(template, ['id', 'name', 'kind', 'version', 'seed', 'settings']) ||
        typeof template.name !== 'string' || template.name !== template.name.trim() ||
        !template.name.length || template.name.length > 80) return false;
    const { settings, kind } = template;
    const fields = kind === 'path' ? ['terrain', 'width'] : ['density'];
    if (!hasFields(settings, fields)) return false;
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    if (kind === 'forest') points.push({ x: 1, y: 1 });
    return validRecipe({ id: template.id, kind, version: template.version, seed: template.seed,
      params: { ...settings, points } });
  }

  function validGenerators(recipes) {
    if (!Array.isArray(recipes) || recipes.length > maxRecipes) return false;
    const ids = new Set();
    for (const recipe of recipes) {
      if (!validRecipe(recipe) || ids.has(recipe.id)) return false;
      ids.add(recipe.id);
    }
    return true;
  }

  // Keep this sequence stable for recipes using the version 1 random stream.
  function createRandomV1(seed) {
    if (!validSeed(seed)) throw new RangeError('Seed must be a 32-bit unsigned integer');
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
  }

  function trace(a, b, visit) {
    let { x, y } = a;
    const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y);
    const sx = Math.sign(b.x - x), sy = Math.sign(b.y - y);
    let error = dx - dy;
    while (x !== b.x || y !== b.y) {
      const twice = 2 * error;
      // Emit each axis step so even a one-cell path is connected orthogonally.
      if (twice > -dy) {
        error -= dy;
        x += sx;
        visit(x, y);
      }
      if (twice < dx) {
        error += dx;
        y += sy;
        visit(x, y);
      }
    }
  }

  function generateStructuralPath(recipe, draft, excludedCells, excludedIds) {
    const points = recipe.params.points, line = [points[0]], visited = new Set([cellKey(points[0])]);
    let steps = 0;
    for (let i = 1; i < points.length; i++) trace(points[i - 1], points[i], (x, y) => {
      if (++steps > maxPathSteps) throw new RangeError('Линия слишком велика. Раздели её на участки.');
      const key = x + ',' + y;
      if (!visited.has(key)) { line.push({ x, y }); visited.add(key); }
      // Retraced sections break the ordered pairing without inventing diagonal segments.
      else if (line.at(-1).x !== x || line.at(-1).y !== y) line.push({ x, y });
    });
    const prefix = 'path-' + Array.from(recipe.id).reduce((hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619), 2166136261).toString(36) + '-';
    const occupied = new Set(), ids = new Set(draft.objects.map(p => p.id));
    for (const prop of draft.objects) {
      if (prop.id.startsWith(prefix) && excludedIds.has(prop.id) && structuralPaths.has(prop.kind) &&
          wallCells(prop).every(([x,y]) => visited.has(x + ',' + y))) continue;
      const b = cellBounds(prop);
      for (let y = b.top; y <= b.bottom; y++) for (let x = b.left; x <= b.right; x++) {
        if (visited.has(x + ',' + y)) occupied.add(x + ',' + y);
      }
    }
    const objects = [], pairs = new Set();
    for (let i = 0; i < line.length; i += 2) {
      const a = i + 1 < line.length ? line[i] : line[i - 1], b = i + 1 < line.length ? line[i + 1] : line[i];
      if (!a || Math.abs(a.x-b.x) + Math.abs(a.y-b.y) !== 1) continue;
      const pair = [cellKey(a),cellKey(b)].sort().join('|');
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      const turn = b.x > a.x ? 0 : b.y > a.y ? 1 : b.x < a.x ? 2 : 3;
      const prop = { id: prefix + a.x + '_' + a.y + '_' + turn, kind: recipe.params.terrain, ...a, turn, hidden: false };
      if (ids.has(prop.id) || excludedIds.has(prop.id) || [a,b].some(p =>
        excludedCells.has(cellKey(p)) || occupied.has(cellKey(p)) || get(draft.chunks,p.x,p.y) === 'water')) continue;
      if (objects.length + draft.objects.length >= objectLimit) throw new RangeError('Линия превысит лимит объектов. Раздели её на участки.');
      objects.push(prop);
    }
    return { chunks: {}, count: objects.length, objects };
  }

  function generatePath(recipe, draft = { chunks: {}, objects: [] }, excludedCells = new Set(), excludedIds = new Set()) {
    if (recipe?.kind !== 'path' || !validRecipe(recipe)) throw new RangeError('Проверь точки, ширину и seed линии');
    if (structuralPaths.has(recipe.params.terrain)) return generateStructuralPath(recipe, draft, excludedCells, excludedIds);
    const { points, terrain, width } = recipe.params;
    const random = createRandomV1(recipe.seed);
    const radius = (width - 1) / 2;
    const brush = [];
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) brush.push({ x, y });
    }

    const chunks = {};
    const centers = new Set();
    let count = 0, steps = 0;
    const tooLarge = 'Линия слишком велика. Раздели её на несколько участков.';
    function visit(x, y) {
      if (++steps > maxPathSteps) throw new RangeError(tooLarge);
      const key = (x + limit) * (2 * limit) + y + limit;
      if (centers.has(key)) return;
      centers.add(key);
      for (const offset of brush) {
        const col = x + offset.x, row = y + offset.y;
        if (!valid(col) || !valid(row) || get(chunks, col, row)) continue;
        if (++count > maxPathCells) throw new RangeError(tooLarge);
        set(chunks, col, row, terrain);
      }
    }

    const clamp = value => Math.max(-limit, Math.min(limit - 1, value));
    visit(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1], end = points[i];
      const dx = end.x - start.x, dy = end.y - start.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const sections = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 12);
      let last = start;
      for (let section = 1; section < sections; section++) {
        const offset = Math.floor(random() * 5) - 2;
        const bend = {
          x: clamp(Math.round(start.x + dx * section / sections) + (horizontal ? 0 : offset)),
          y: clamp(Math.round(start.y + dy * section / sections) + (horizontal ? offset : 0)),
        };
        trace(last, bend, visit);
        last = bend;
      }
      trace(last, end, visit);
    }
    return { chunks, count };
  }

  function contains(points, x, y) {
    let inside = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
      if (!cross && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) &&
          y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return true;
      if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
    }
    return inside;
  }

  function generateForest(recipe, draft, excludedCells = new Set(), excludedIds = new Set()) {
    if (recipe?.kind !== 'forest' || !validRecipe(recipe)) {
      throw new RangeError('Проверь seed, плотность и контур. Участок должен занимать до 4096 клеток по габаритам.');
    }
    const { points, density } = recipe.params;
    const biome = recipe.params.biome || 'forest', spec = plotBiomes[biome];
    const orientation = recipe.params.orientation || 0;
    const { left, right, top, bottom } = forestBounds(points);
    const occupied = {};
    const objectIds = new Set();
    for (const prop of draft.objects) {
      objectIds.add(prop.id);
      const bounds = cellBounds(prop);
      for (let row = Math.max(top, bounds.top); row <= Math.min(bottom, bounds.bottom); row++) {
        for (let col = Math.max(left, bounds.left); col <= Math.min(right, bounds.right); col++) set(occupied, col, row, prop.kind);
      }
    }

    const chunks = {}, plants = [];
    const random = createRandomV1(recipe.seed);
    const grove = (x, y) => {
      let hash = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ recipe.seed;
      hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
      return ((hash ^ (hash >>> 15)) >>> 0) / 0x100000000;
    };
    const prefix = Array.from(recipe.id).reduce((hash, letter) =>
      Math.imul(hash ^ letter.charCodeAt(0), 16777619), 2166136261) >>> 0;
    let count = 0;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const roll = random(), turn = Math.floor(random() * 4);
      if (excludedCells.has(x + ',' + y) || !contains(points, x, y) ||
          !(forestGround.has(get(draft.chunks, x, y)) || biome !== 'forest' && get(draft.chunks,x,y) === 'dirt') || get(occupied, x, y)) continue;
      set(chunks, x, y, spec.ground);
      count++;
      const cx = Math.floor(x / 7), cy = Math.floor(y / 7);
      const fx = x / 7 - cx, fy = y / 7 - cy;
      const north = grove(cx, cy) * (1 - fx) + grove(cx + 1, cy) * fx;
      const south = grove(cx, cy + 1) * (1 - fx) + grove(cx + 1, cy + 1) * fx;
      const cover = north * (1 - fy) + south * fy;
      const chance = density / 100 * (['field','garden','orchard','graveyard'].includes(biome) ? 1 : (.04 + .93 * cover));
      if (roll >= chance) continue;
      const row = orientation ? x : y, column = orientation ? y : x;
      if (['field','garden'].includes(biome) && ((row%3+3)%3 === 2)) continue;
      if (['orchard','graveyard'].includes(biome) && ((row%3+3)%3 || (column%3+3)%3)) continue;
      const nearTree = get(occupied, x - 1, y) === 'tree' || get(occupied, x, y - 1) === 'tree';
      const kind = biome === 'forest' ? (roll < chance * .77 && !nearTree ? 'tree' : 'bush') :
        spec.kinds[Math.min(spec.kinds.length-1, Math.floor(roll/chance*spec.kinds.length))];
      const id = 'forest-' + prefix.toString(36) + '-' + x + '_' + y;
      if (objectIds.has(id) || excludedIds.has(id)) continue;
      if (draft.objects.length + plants.length >= objectLimit) {
        throw new RangeError('Лес превысит лимит объектов. Уменьши плотность или размер участка.');
      }
      plants.push({ id, kind, x, y, turn: ['field','garden','graveyard'].includes(biome) ? orientation : turn, hidden: false });
      set(occupied, x, y, kind);
    }
    return { chunks, count, plants };
  }

  function generateDistrict(recipe, draft, excludedCells = new Set(), excludedIds = new Set(), retainedObjects = []) {
    if (recipe?.kind !== 'district' || !validRecipe(recipe)) {
      throw new RangeError('Район: задай прямоугольник от 11×11 до 4096 клеток и от 1 до 24 домов.');
    }
    const { left, right, top, bottom } = forestBounds(recipe.params.points);
    const cx = Math.floor((left + right) / 2), cy = Math.floor((top + bottom) / 2);
    const occupied = new Set(), obstacles = new Set(), ids = new Set(draft.objects.map(prop => prop.id));
    const inside = (x, y) => x >= left && x <= right && y >= top && y <= bottom;
    const requested = recipe.params.count - retainedObjects.length;
    if (requested < 0) throw new RangeError('Число домов меньше числа связанных построек. Сначала измени связи.');
    for (const prop of retainedObjects) {
      const bounds = cellBounds(prop);
      const [x, y] = [[prop.x,bounds.bottom+1],[bounds.left-1,prop.y],
        [prop.x,bounds.top-1],[bounds.right+1,prop.y]][prop.turn];
      if (!inside(bounds.left, bounds.top) || !inside(bounds.right, bounds.bottom) ||
          !inside(x, y) || (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1)) {
        throw new RangeError('Новый контур или улица отрезает связанную постройку. Измени контур или связь.');
      }
    }
    const eachCell = (bounds, visit, margin = 0) => {
      for (let y = Math.max(top, bounds.top - margin); y <= Math.min(bottom, bounds.bottom + margin); y++) {
        for (let x = Math.max(left, bounds.left - margin); x <= Math.min(right, bounds.right + margin); x++) visit(x, y);
      }
    };
    for (const prop of draft.objects) {
      eachCell(cellBounds(prop), (x, y) => occupied.add(x + ',' + y), 1);
      eachCell(cellBounds(prop), (x, y) => obstacles.add(x + ',' + y));
    }
    const road = new Set(), chunks = {}, objects = [];
    const ground = new Set([undefined, 'grass', 'dirt', 'path']);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) continue;
      const key = x + ',' + y, type = get(draft.chunks, x, y);
      // Do not cut through existing props, water, floors or a foreign generator.
      // A manually repainted owned road cell stays intact if it is dry.
      if (obstacles.has(key) || type === 'water' || (!excludedCells.has(key) && !ground.has(type))) {
        throw new RangeError('Улица района пересекает объект, воду или неподходящее покрытие. Выбери свободный участок.');
      }
      road.add(key);
      if (!excludedCells.has(key)) set(chunks, x, y, 'path');
    }
    const hash = Array.from(recipe.id).reduce((value, letter) =>
      Math.imul(value ^ letter.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const candidates = new Map();
    const candidate = (x, y, turn) => {
      const key = x + ',' + y;
      if (!candidates.has(key)) candidates.set(key, { id: 'district-' + hash.toString(36) + '-' + x + '_' + y,
        kind: 'house', x, y, turn, hidden: false });
    };
    for (let x = left + 2; x <= right - 2; x += 5) {
      candidate(x, cy - 3, 0); candidate(x, cy + 3, 2);
    }
    for (let y = top + 2; y <= bottom - 2; y += 5) {
      candidate(cx - 3, y, 3); candidate(cx + 3, y, 1);
    }
    const random = createRandomV1(recipe.seed), slots = [...candidates.values()];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (const prop of slots) {
      if (objects.length === requested) break;
      if (ids.has(prop.id) || excludedIds.has(prop.id)) continue;
      const bounds = cellBounds(prop);
      if (!inside(bounds.left, bounds.top) || !inside(bounds.right, bounds.bottom)) continue;
      let blocked = false;
      eachCell(bounds, (x, y) => {
        const key = x + ',' + y;
        if (occupied.has(key) || road.has(key) || excludedCells.has(key) ||
            ![undefined, 'grass', 'dirt'].includes(get(draft.chunks, x, y))) blocked = true;
      });
      if (blocked) continue;
      objects.push(prop);
      eachCell(bounds, (x, y) => set(chunks, x, y, 'dirt'));
      eachCell(bounds, (x, y) => occupied.add(x + ',' + y), 1);
    }
    if (objects.length !== requested) {
      throw new RangeError('В районе недостаточно свободных мест для указанного числа домов. Уменьши число или увеличь участок.');
    }
    if (draft.objects.length + objects.length > objectLimit) throw new RangeError('Район превысит лимит объектов');
    return { chunks, count: Object.values(chunks).reduce((sum, chunk) => sum + Object.keys(chunk).length, 0), objects };
  }

  function generateRoom(recipe, draft, excludedCells = new Set(), excludedIds = new Set()) {
    if (recipe?.kind !== 'room' || !validRecipe(recipe)) {
      throw new RangeError('Комната: задай простой контур по линиям сетки, пол и вход на прямой стене. Внутренние клетки должны соединяться.');
    }
    const { area, boundary, doorTurn } = roomShape(recipe.params);
    const { floor, entrance } = recipe.params;
    const hash = Array.from(recipe.id).reduce((value, letter) =>
      Math.imul(value ^ letter.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const prefix = 'room-' + hash.toString(36) + '-';
    const objects = [], covered = new Set(), chunks = {};
    for (const cell of boundary.values()) {
      if (covered.has(cellKey(cell))) continue;
      const choices = neighbors.map(([dx, dy], turn) => ({ x: cell.x + dx, y: cell.y + dy, turn }))
        .filter(next => boundary.has(cellKey(next)))
        .sort((a, b) => Number(covered.has(cellKey(a))) - Number(covered.has(cellKey(b))));
      const next = choices[0];
      const prop = { id: prefix + cell.x + '_' + cell.y + '_' + next.turn,
        kind: 'wall', x: cell.x, y: cell.y, turn: next.turn, hidden: false };
      objects.push(prop);
      covered.add(cellKey(cell)); covered.add(cellKey(next));
    }
    objects.push({ id: prefix + 'door-' + entrance.x + '_' + entrance.y,
      kind: 'door', ...entrance, turn: doorTurn, hidden: false });
    const generated = objects.filter(prop => !excludedIds.has(prop.id));
    const occupied = new Set();
    for (const prop of draft.objects) {
      // Wall sections may share an endpoint; a manually hidden owned wall on this boundary is safe.
      if (prop.kind === 'wall' && excludedIds.has(prop.id) &&
          wallCells(prop).every(([x, y]) => boundary.has(x + ',' + y))) continue;
      const bounds = cellBounds(prop);
      for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) occupied.add(x + ',' + y);
    }
    const ids = new Set(draft.objects.map(prop => prop.id));
    for (const prop of generated) {
      const cells = prop.kind === 'wall' ? wallCells(prop) : [[prop.x, prop.y]];
      if (ids.has(prop.id) || cells.some(([x, y]) => occupied.has(x + ',' + y))) {
        throw new RangeError('Стена или вход комнаты пересекает существующий объект. Измени контур или перемести объект.');
      }
    }
    if (recipe.params.furnishing && recipe.params.furnishing !== 'none') {
      generated.push(...furnishRoom(recipe, { area, boundary }, draft, occupied, prefix, excludedCells, excludedIds));
    }
    if (draft.objects.length + generated.length > objectLimit) throw new RangeError('Комната превысит лимит объектов');
    for (const cell of area.values()) if (!excludedCells.has(cellKey(cell))) set(chunks, cell.x, cell.y, floor);
    return { chunks, count: area.size, objects: generated };
  }

  function furnishRoom(recipe, shape, draft, occupied, prefix, excludedCells, excludedIds) {
    const { area, boundary } = shape, entry = recipe.params.entrance;
    const interior = new Set([...area.keys()].filter(key => !boundary.has(key) && key !== cellKey(entry)));
    const blocked = new Set(occupied), objects = [], reserved = new Set();
    const start = neighbors.map(([dx,dy]) => ({ x: entry.x+dx, y: entry.y+dy })).find(p => interior.has(cellKey(p)));
    if (!start) return objects;
    reserved.add(cellKey(start));
    const inward = { x: start.x + start.x-entry.x, y: start.y + start.y-entry.y };
    if (interior.has(cellKey(inward))) reserved.add(cellKey(inward));
    const flood = () => {
      const reached = new Set(), queue = [start];
      for (let i=0; i<queue.length; i++) {
        const p=queue[i], key=cellKey(p);
        if (!interior.has(key) || blocked.has(key) || reached.has(key)) continue;
        reached.add(key);
        for (const [dx,dy] of neighbors) queue.push({x:p.x+dx,y:p.y+dy});
      }
      return reached;
    };
    let accessible = flood();
    const candidates = [...area.values()].filter(p => accessible.has(cellKey(p)));
    const hash = (p, salt) => {
      let n = Math.imul(p.x,374761393) ^ Math.imul(p.y,668265263) ^ recipe.seed ^ Math.imul(salt,1274126177);
      n = Math.imul(n ^ n>>>13,1274126177); return (n ^ n>>>16) >>> 0;
    };
    let salt=0;
    const place = (parts, count, edge = false) => {
      const order = candidates.map(p => ({ ...p, score: hash(p,++salt) }));
      // Wall furniture is tried at the perimeter first; all ties are deterministic.
      const nearWall = p => neighbors.some(([dx,dy]) => boundary.has((p.x+dx)+','+(p.y+dy)));
      order.sort((a,b) => (edge ? Number(nearWall(b))-Number(nearWall(a)) : 0) || a.score-b.score);
      let placed=0;
      for (const p of order) {
        if (placed >= count) break;
        const turn = hash(p,salt) % 2;
        const group = parts.map(([kind,dx,dy],i) => {
          const x=p.x+(turn ? -dy : dx), y=p.y+(turn ? dx : dy);
          return { id: prefix+'f-'+kind+'-'+x+'_'+y+'_'+turn+'_'+i, kind, x, y, turn, hidden:false };
        });
        if (group.some(prop => excludedIds.has(prop.id) || draft.objects.some(p => p.id===prop.id))) continue;
        const cells = new Set(); let validGroup=true;
        for (const prop of group) {
          const b=cellBounds(prop);
          for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++) {
            const key=x+','+y;
            if(!interior.has(key)||blocked.has(key)||reserved.has(key)||excludedCells.has(key)||cells.has(key))validGroup=false;
            cells.add(key);
          }
        }
        if(!validGroup)continue;
        for(const key of cells)blocked.add(key);
        const next=flood();
        if([...accessible].some(key=>!cells.has(key)&&!next.has(key))) {
          for(const key of cells)blocked.delete(key);continue;
        }
        objects.push(...group); accessible=next; placed++;
      }
    };
    const amount=(divisor,max)=>Math.max(1,Math.min(max,Math.floor(interior.size/divisor)));
    const theme=recipe.params.furnishing;
    if(theme==='tavern') {
      place([['table',0,0],['bench',0,-1],['bench',0,1]],amount(24,8));
      place([['counter',0,0]],1,true);place([['oven',0,0]],1,true);
      place([['barrel',0,0]],amount(28,5),true); place([['brazier',0,0]],1,true);
    } else if(theme==='bedroom') {
      place([['bed',0,0],['chest',2,0]],amount(34,6),true);
      place([['table',0,0],['chair',0,2]],1);
    } else if(theme==='library') {
      place([['bookshelf',0,0]],amount(18,10),true);
      place([['table',0,0],['chair',0,2]],amount(48,3));
    } else if(theme==='crypt') {
      place([['altar',0,0]],1,true);place([['sarcophagus',0,0]],amount(22,8));
      place([['bones',0,0]],amount(35,5));
    } else if(theme==='storeroom') {
      place([['crate',0,0]],amount(13,12),true);place([['barrel',0,0]],amount(18,8),true);place([['chest',0,0]],amount(35,4),true);
    } else if(theme==='workshop') {
      place([['table',0,0],['chair',0,2]],amount(40,3));
      place([['anvil',0,0]],1,true);place([['oven',0,0]],1,true);
      place([['crate',0,0]],amount(25,6),true);place([['barrel',0,0]],2,true);
    }
    place([['torch',0,0]],amount(50,4),true);
    // Rugs are a decorative underlay. They may share furniture cells but never walls.
    const rugs=[], rugCells=new Set();
    if(['tavern','bedroom','library'].includes(theme))for(const anchor of objects.filter(p=>['table','bed'].includes(p.kind)).slice(0,theme==='tavern'?1:3)) {
      const prop={id:prefix+'f-rug-'+anchor.x+'_'+anchor.y,kind:'rug',x:anchor.x,y:anchor.y,turn:0,hidden:false};
      if(excludedIds.has(prop.id)||draft.objects.some(p=>p.id===prop.id))continue;
      const b=cellBounds(prop);let clear=true;
      for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++) {
        const key=x+','+y;if(!interior.has(key)||occupied.has(key)||excludedCells.has(key)||rugCells.has(key))clear=false;
      }
      if(clear) {
        rugs.push(prop);
        for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)rugCells.add(x+','+y);
      }
    }
    return [...rugs,...objects];
  }

  function cells(chunks) {
    const result = [];
    for (const [key, values] of Object.entries(chunks)) {
      const [cx, cy] = key.split(',').map(Number);
      for (const [offset, after] of Object.entries(values)) result.push({
        x: cx * size + Number(offset) % size, y: cy * size + Math.floor(Number(offset) / size), after,
      });
    }
    return result;
  }

  // Copy only changed chunks; previews must never mutate the open draft or history.
  function copyChunks(chunks) {
    const copy = { ...chunks }, copied = new Set();
    return { chunks: copy, write(x, y, value) {
      const key = Math.floor(x / size) + ',' + Math.floor(y / size);
      if (!copied.has(key)) { if (copy[key]) copy[key] = { ...copy[key] }; copied.add(key); }
      set(copy, x, y, value);
    } };
  }

  function generationChange(recipe, draft, { pinnedIds = [], reservedCells = [] } = {}) {
    const parameters = ({ id, kind, version, seed, params }) => ({ id, kind, version, seed, params });
    recipe = parameters(recipe);
    if (!validRecipe(recipe)) throw new RangeError('Проверь параметры генератора');
    const generators = draft.generators || [];
    const previous = generators.find(item => item.id === recipe.id);
    if (previous && previous.kind !== recipe.kind) throw new RangeError('Тип сохранённого рецепта изменять нельзя');
    if (previous && !previous.state) {
      if (!same(parameters(previous), recipe)) {
        throw new RangeError('У старого рецепта нет исходного покрытия. Выбери «Новый участок», чтобы сохранить прежнюю карту.');
      }
      return { id: recipe.id, chunks: draft.chunks, tiles: [], objects: null, generators: { before: generators, after: generators }, count: 0 };
    }
    const old = previous?.state;
    const protectedTiles = new Map((old?.protectedTiles || []).map(cell => [cellKey(cell), cell]));
    const protectedObjects = new Set(old?.protectedObjects || []);
    const currentObjects = new Map(draft.objects.map(prop => [prop.id, prop]));
    const pinned = new Set(recipe.kind === 'district' ? pinnedIds : []);
    const reserved = new Set(recipe.kind === 'district' ? reservedCells.map(cellKey) : []);
    const retained = (old?.objects || []).filter(prop => pinned.has(prop.id)).map(prop => {
      const current = currentObjects.get(prop.id);
      if (!current || current.kind !== 'house' || current.hidden) throw new RangeError('Связанная постройка изменилась. Проверь связь с интерьером.');
      const bounds = cellBounds(current);
      const area = forestBounds(recipe.params.points);
      for (const cell of reservedCells) {
        const adjacent = ((cell.x === bounds.left - 1 || cell.x === bounds.right + 1) && cell.y >= bounds.top && cell.y <= bounds.bottom) ||
          ((cell.y === bounds.top - 1 || cell.y === bounds.bottom + 1) && cell.x >= bounds.left && cell.x <= bounds.right);
        if (adjacent && (cell.x < area.left || cell.x > area.right || cell.y < area.top || cell.y > area.bottom)) {
          throw new RangeError('Новый контур отсекает клетку входа связанной постройки. Измени контур или связь.');
        }
      }
      for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) reserved.add(x + ',' + y);
      const {groupId,groupName,...snapshot}=current;
      return snapshot;
    });
    for (const cell of old?.tiles || []) {
      if ((get(draft.chunks, cell.x, cell.y) ?? null) !== cell.after) protectedTiles.set(cellKey(cell), { x: cell.x, y: cell.y });
    }
    for (const prop of old?.objects || []) {
      if (!sameObject(prop, currentObjects.get(prop.id))) protectedObjects.add(prop.id);
    }
    // Never reclaim cells recorded by another generator, even when their values match.
    const foreignCells = new Set(generators.filter(item => item.id !== recipe.id)
      .flatMap(item => [...(item.state?.tiles || []), ...(item.state?.protectedTiles || [])].map(cellKey)));
    const excluded = new Set([...foreignCells, ...protectedTiles.keys(), ...reserved]);
    const ownedIds = new Set((old?.objects || []).filter(prop => !protectedObjects.has(prop.id) && !pinned.has(prop.id)).map(prop => prop.id));
    const remaining = draft.objects.filter(prop => !ownedIds.has(prop.id));
    const working = copyChunks(draft.chunks);
    const affected = new Map();
    const write = (x, y, after) => { affected.set(x + ',' + y, { x, y }); working.write(x, y, after); };
    for (const cell of old?.tiles || []) {
      if (!excluded.has(cellKey(cell))) write(cell.x, cell.y, cell.before);
    }
    if (recipe.kind === 'room') {
      const shape = roomShape(recipe.params);
      if ([...shape.area.keys()].some(key => foreignCells.has(key))) {
        throw new RangeError('Комната пересекает другой процедурный участок. Выбери свободный контур.');
      }
    }
    const base = { chunks: working.chunks, objects: remaining };
    if (recipe.kind === 'district') {
      const { left, right, top, bottom } = forestBounds(recipe.params.points);
      const cx = Math.floor((left + right) / 2), cy = Math.floor((top + bottom) / 2);
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        if ((Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1) && foreignCells.has(x + ',' + y)) {
          throw new RangeError('Улица района пересекает другой процедурный участок. Выбери свободный контур.');
        }
      }
    }
    const output = recipe.kind === 'forest' ? generateForest(recipe, base, excluded, protectedObjects) :
      recipe.kind === 'room' ? generateRoom(recipe, base, excluded, protectedObjects) :
      recipe.kind === 'district' ? generateDistrict(recipe, base, excluded, protectedObjects, retained) : generatePath(recipe, base, excluded, protectedObjects);
    // Keep ownership of temporarily pinned pads/entrances, so unlinking can restore source ground.
    const tiles = (old?.tiles || []).filter(cell => reserved.has(cellKey(cell)) &&
      !protectedTiles.has(cellKey(cell)) && !foreignCells.has(cellKey(cell)));
    for (const cell of cells(output.chunks)) {
      if (excluded.has(cellKey(cell))) continue;
      tiles.push({ ...cell, before: get(working.chunks, cell.x, cell.y) ?? null });
      write(cell.x, cell.y, cell.after);
    }
    const generatedObjects = output.objects || output.plants || [];
    const afterObjects = [...remaining, ...generatedObjects];
    const nextRecipe = { ...recipe, state: { version: 1, tiles, objects: [...retained, ...generatedObjects],
      protectedTiles: [...protectedTiles.values()], protectedObjects: [...protectedObjects] } };
    const nextGenerators = previous ? generators.map(item => item.id === recipe.id ? nextRecipe : item) : [...generators, nextRecipe];
    if (!validGenerators(nextGenerators)) throw new RangeError('Превышен лимит рецептов или сохранённых ручных правок');
    const total = Object.values(working.chunks).reduce((sum, chunk) => sum + Object.keys(chunk).length, 0);
    if (total > tileLimit) throw new RangeError('Превышен лимит тайлов на карте');
    const changes = [...affected.values()].map(({ x, y }) => ({ x, y,
      before: get(draft.chunks, x, y), after: get(working.chunks, x, y),
    })).filter(cell => cell.before !== cell.after);
    return { id: recipe.id, chunks: working.chunks, tiles: changes, count: tiles.length || generatedObjects.length,
      objects: same(draft.objects, afterObjects) ? null : { before: draft.objects, after: afterObjects },
      generators: { before: generators, after: same(generators, nextGenerators) ? generators : nextGenerators } };
  }

  // Wire-only deltas. Keep list order: it is part of the signed history snapshot.
  function listDelta(before, after) {
    const positions = new Map(before.map((value, index) => [value.id, index]));
    const retained = new Set(), insert = [];
    let last = -1;
    after.forEach((value, index) => {
      const original = positions.get(value.id);
      if (original !== undefined && original > last && (before[original] === value || same(before[original], value))) {
        retained.add(original); last = original;
      } else insert.push({ index, value });
    });
    return { remove: before.map((_, index) => index).filter(index => !retained.has(index)), insert };
  }

  function expandListDelta(before, delta) {
    if (!hasFields(delta, ['remove', 'insert']) || !Array.isArray(delta.remove) || !Array.isArray(delta.insert)) {
      throw new RangeError('Некорректное изменение списка предпросмотра');
    }
    let last = -1;
    for (const index of delta.remove) {
      if (!Number.isInteger(index) || index <= last || index >= before.length) throw new RangeError('Некорректный индекс удаления');
      last = index;
    }
    const removed = new Set(delta.remove), after = before.filter((_, index) => !removed.has(index));
    last = -1;
    for (const entry of delta.insert) {
      if (!hasFields(entry, ['index', 'value']) || !Number.isInteger(entry.index) || entry.index <= last || entry.index > after.length) {
        throw new RangeError('Некорректный индекс вставки');
      }
      after.splice(entry.index, 0, entry.value); last = entry.index;
    }
    return after;
  }

  function compactGenerationChange(change) {
    return { format: 'delta-v1', id: change.id, count: change.count, tiles: change.tiles,
      objects: change.objects ? listDelta(change.objects.before, change.objects.after) : null,
      generators: listDelta(change.generators.before, change.generators.after) };
  }

  function expandGenerationChange(change, draft) {
    if (!change.format) return change; // Older full responses remain readable.
    if (change.format !== 'delta-v1') throw new RangeError('Неизвестный формат предпросмотра');
    const working = copyChunks(draft.chunks);
    for (const cell of change.tiles) {
      if (!valid(cell.x) || !valid(cell.y) || get(draft.chunks, cell.x, cell.y) !== cell.before) {
        throw new RangeError('Карта не совпадает с исходным предпросмотром');
      }
      working.write(cell.x, cell.y, cell.after);
    }
    return { id: change.id, count: change.count, tiles: change.tiles, chunks: working.chunks,
      objects: change.objects ? { before: draft.objects, after: expandListDelta(draft.objects, change.objects) } : null,
      generators: { before: draft.generators || [], after: expandListDelta(draft.generators || [], change.generators) } };
  }

  // Manual edits and their ownership markers belong to the same Undo/Redo entry.
  function protectManualChanges(draft, change) {
    const generators = draft.generators || [];
    const changedTiles = new Set((change.tiles || []).map(cellKey));
    const afterObjects = change.objects && new Map(change.objects.after.map(prop => [prop.id, prop]));
    const after = generators.map(recipe => {
      if (!recipe.state) return recipe;
      const state = recipe.state;
      const protectedTiles = new Map(state.protectedTiles.map(cell => [cellKey(cell), cell]));
      const protectedObjects = new Set(state.protectedObjects);
      for (const cell of state.tiles) {
        if (changedTiles.has(cellKey(cell))) protectedTiles.set(cellKey(cell), { x: cell.x, y: cell.y });
      }
      if (afterObjects) for (const prop of state.objects) {
        if (!sameObject(prop, afterObjects.get(prop.id))) protectedObjects.add(prop.id);
      }
      return { ...recipe, state: { ...state, protectedTiles: [...protectedTiles.values()], protectedObjects: [...protectedObjects] } };
    });
    if (!validGenerators(after)) throw new RangeError('Превышен лимит сохранённых ручных правок');
    return same(generators, after) ? change : { ...change, generators: { before: generators, after } };
  }

  // Editor geometry is staged independently of the saved/generated map.
  function validContour(kind, points, entrance = null) {
    if (kind === 'path') return validPathParams({ terrain: 'path', width: 1, points });
    if (kind === 'district') return validDistrictParams({ count: 1, points });
    if (!validForestParams({ density: 10, points })) return false;
    if (kind === 'forest') return true;
    if (kind !== 'room' || !points.every((p, i) => {
      const next = points[(i + 1) % points.length];
      return p.x === next.x || p.y === next.y;
    })) return false;
    return !entrance || validRoomParams({ floor: 'wood', points, entrance });
  }

  function editContour(kind, source, entrance, operation) {
    let points = source.map(p => ({ ...p }));
    let entry = entrance ? { ...entrance } : null;
    const { index, x, y } = operation;
    const fail = () => { throw new RangeError('Контур недопустим: проверь пересечения, размеры и вход на прямой стене.'); };
    if (operation.type === 'entrance') {
      if (kind !== 'room' || !valid(x) || !valid(y)) return fail();
      entry = { x, y };
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= points.length) return fail();
      if (operation.type === 'move') {
        if (!valid(x) || !valid(y)) return fail();
        const old = points[index];
        if (kind === 'room' || kind === 'district') {
          // Keep neighboring walls axis-aligned, including a rectangle's opposite corner.
          for (const adjacent of [(index + points.length - 1) % points.length, (index + 1) % points.length]) {
            const p = points[adjacent];
            points[adjacent] = p.x === old.x ? { x, y: p.y } : { x: p.x, y };
          }
        }
        points[index] = { x, y };
        if (kind === 'room' && entry) {
          for (let i = 0; i < source.length; i++) {
            const a = source[i], b = source[(i + 1) % source.length];
            const horizontal = a.y === b.y;
            const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
            if (entry[cross] !== a[cross] || entry[axis] <= Math.min(a[axis], b[axis]) || entry[axis] >= Math.max(a[axis], b[axis])) continue;
            const t = (entry[axis] - a[axis]) / (b[axis] - a[axis]);
            const nextA = points[i], nextB = points[(i + 1) % points.length];
            entry = { [axis]: Math.round(nextA[axis] + t * (nextB[axis] - nextA[axis])), [cross]: nextA[cross] };
            break;
          }
        }
      } else if (operation.type === 'insert') {
        if (!['path', 'forest'].includes(kind) || points.length >= (kind === 'path' ? maxPathPoints : maxForestPoints)) return fail();
        const edge = kind === 'path' && index === points.length - 1 ? index - 1 : index;
        if (edge < 0) return fail();
        const a = points[edge], b = points[(edge + 1) % points.length];
        points.splice(edge + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
      } else if (operation.type === 'remove') {
        if (!['path', 'forest'].includes(kind)) return fail();
        points.splice(index, 1);
      } else return fail();
    }
    if (!validContour(kind, points, entry)) return fail();
    return { points, entrance: entry };
  }

  const api = { validTemplate, validGenerators, validContour, editContour, roomThemes, plotBiomes, structuralPaths, createRandomV1, generatePath, generateForest, generateRoom, generateDistrict, generationChange, protectManualChanges,
    compactGenerationChange, expandGenerationChange,
    maxPathPoints, maxForestPoints, maxDistrictBuildings };
  if (typeof module === 'object') module.exports = api;
  else root.WorldGenerators = api;
})(globalThis);

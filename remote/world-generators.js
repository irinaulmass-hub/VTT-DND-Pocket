'use strict';

((root) => {
  const { limit, valid, get, set } = typeof module === 'object' ? require('./world-model') : root.WorldMap;

  const seedMax = 0xffffffff;
  const maxRecipes = 128;
  const maxPathPoints = 256;
  const maxPathCells = 16384;
  const maxPathSteps = 65536;

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
    if ((terrain !== 'path' && terrain !== 'water') ||
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

  function validRecipe(recipe) {
    return hasFields(recipe, ['id', 'kind', 'version', 'seed', 'params']) &&
      typeof recipe.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(recipe.id) &&
      recipe.kind === 'path' && recipe.version === 1 && validSeed(recipe.seed) && validPathParams(recipe.params);
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

  function generatePath(recipe) {
    if (!validRecipe(recipe)) throw new RangeError('Проверь точки, ширину и seed линии');
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

  const api = { validGenerators, createRandomV1, generatePath, maxPathPoints };
  if (typeof module === 'object') module.exports = api;
  else root.WorldGenerators = api;
})(globalThis);

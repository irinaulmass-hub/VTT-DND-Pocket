'use strict';

const { valid } = require('./remote/world-model');

const seedMax = 0xffffffff;
const maxRecipes = 128;
const maxPathPoints = 256;

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

module.exports = { validGenerators, createRandomV1 };

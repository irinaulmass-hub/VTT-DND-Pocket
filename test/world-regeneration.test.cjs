const { test } = require('node:test');
const assert = require('node:assert/strict');
const { get, set, objectLimit } = require('../remote/world-model');
const { generationChange, protectManualChanges, validGenerators } = require('../remote/world-generators');

const road = {
  id: 'road', kind: 'path', version: 1, seed: 42,
  params: { terrain: 'water', width: 3, points: [{ x: -34, y: 0 }, { x: 3, y: 0 }] },
};
const forest = {
  id: 'forest', kind: 'forest', version: 1, seed: 36,
  params: { density: 100, points: [{ x: -12, y: -9 }, { x: 10, y: -9 }, { x: 10, y: 9 }, { x: -12, y: 9 }] },
};
function apply(map, change, backwards = false) {
  for (const cell of change.tiles || []) set(map.chunks, cell.x, cell.y, backwards ? cell.before : cell.after);
  if (change.objects) map.objects = backwards ? change.objects.before : change.objects.after;
  if (change.generators) map.generators = backwards ? change.generators.before : change.generators.after;
}
const empty = () => ({ chunks: {}, objects: [], generators: [] });
const reload = map => JSON.parse(JSON.stringify(map));

test('regeneration restores the old footprint and preserves manual cells through reload, Undo and Redo', () => {
  let map = empty();
  set(map.chunks, -34, 0, 'grass');
  set(map.chunks, 3, 0, 'stone');
  apply(map, generationChange(road, map));
  apply(map, protectManualChanges(map, { tiles: [{ x: -34, y: 0, before: 'water', after: undefined }] }));
  // An explicitly edited cell remains manual even if painted back to the generated value.
  apply(map, protectManualChanges(map, { tiles: [{ x: -33, y: 0, before: get(map.chunks, -33, 0), after: 'stone' }] }));
  apply(map, protectManualChanges(map, { tiles: [{ x: -33, y: 0, before: 'stone', after: 'water' }] }));
  map = reload(map);
  const before = structuredClone(map);
  const next = { ...road, seed: 7, params: { terrain: 'path', width: 1, points: [{ x: 0, y: 5 }, { x: 3, y: 5 }] } };
  const change = generationChange(next, map);
  assert.deepEqual(map, before, 'preview is pure');
  apply(map, change);
  assert.equal(map.generators.length, 1);
  assert.equal(map.generators[0].id, road.id);
  assert.equal(map.generators[0].seed, 7);
  assert.equal(get(map.chunks, -34, 0), undefined, 'erased cell stays erased');
  assert.equal(get(map.chunks, -33, 0), 'water', 'explicit manual value survives outside the new footprint');
  assert.equal(get(map.chunks, 3, 0), 'stone', 'source terrain is restored');
  assert.equal(get(map.chunks, 0, 5), 'path');
  const after = structuredClone(map);
  apply(map, change, true);
  assert.deepEqual(map, before);
  apply(map, change);
  assert.deepEqual(map, after);
  const repeated = generationChange(next, reload(map));
  assert.deepEqual(repeated.tiles, []);
  assert.equal(repeated.objects, null);
  assert.strictEqual(repeated.generators.before, repeated.generators.after, 'same inputs create no extra write');
  assert.ok(validGenerators(map.generators));
});

test('forest regeneration preserves deleted, moved and hidden plants and newly placed manual objects', () => {
  let map = empty();
  set(map.chunks, -12, -9, 'grass');
  apply(map, generationChange(forest, map));
  assert.ok(map.objects.length > 3);
  const [deleted, moved, hidden] = map.objects;
  const after = map.objects.filter(prop => prop.id !== deleted.id).map(prop =>
    prop.id === moved.id ? { ...prop, x: 30, y: 30, turn: 2 } : prop.id === hidden.id ? { ...prop, hidden: true } : prop);
  after.push({ id: 'home', kind: 'house', x: 5, y: 5, turn: 0, hidden: false });
  apply(map, protectManualChanges(map, { objects: { before: map.objects, after } }));
  const tile = map.generators[0].state.tiles.find(cell => !(cell.x === -12 && cell.y === -9) && !map.objects.some(prop => prop.x === cell.x && prop.y === cell.y));
  apply(map, protectManualChanges(map, { tiles: [{ ...tile, before: 'woodland', after: undefined }] }));
  map = reload(map);
  const next = { ...forest, seed: 51, params: { ...forest.params, density: 70 } };
  const before = structuredClone(map);
  const change = generationChange(next, map);
  assert.deepEqual(map, before);
  apply(map, change);
  assert.ok(!map.objects.some(prop => prop.id === deleted.id));
  assert.deepEqual(map.objects.find(prop => prop.id === moved.id), after.find(prop => prop.id === moved.id));
  assert.equal(map.objects.find(prop => prop.id === hidden.id).hidden, true);
  assert.equal(get(map.chunks, tile.x, tile.y), undefined);
  assert.ok(!map.objects.some(prop => prop.x === tile.x && prop.y === tile.y));
  assert.equal(new Set(map.objects.map(prop => prop.id)).size, map.objects.length);
  assert.ok(!map.generators[0].state.objects.some(prop => prop.x >= 4 && prop.x <= 6 && prop.y >= 4 && prop.y <= 6));
  const twice = generationChange(next, reload(map));
  assert.deepEqual(twice.tiles, []);
  assert.equal(twice.objects, null);
  assert.strictEqual(twice.generators.before, twice.generators.after);
  // Contracting the contour restores grass and removes only the remaining automatic plants.
  apply(map, generationChange({ ...next, params: { ...next.params, points: [
    { x: 50, y: 50 }, { x: 55, y: 50 }, { x: 55, y: 55 }, { x: 50, y: 55 },
  ] } }, map));
  assert.equal(get(map.chunks, -12, -9), 'grass');
  assert.ok(map.objects.some(prop => prop.id === moved.id && prop.x === 30));
  assert.ok(map.objects.some(prop => prop.id === hidden.id && prop.hidden));
  assert.ok(validGenerators(map.generators));
});

test('manual ownership markers undo with the edit and external chunk edits are detected after reload', () => {
  const map = empty();
  apply(map, generationChange(road, map));
  const before = structuredClone(map);
  const change = protectManualChanges(map, { tiles: [{ x: -34, y: 0, before: 'water', after: 'stone' }] });
  apply(map, change);
  assert.ok(map.generators[0].state.protectedTiles.length);
  apply(map, change, true);
  assert.deepEqual(map, before);
  set(map.chunks, -34, 0, 'dirt'); // Other editor/API: no local ownership markers.
  const next = { ...road, params: { ...road.params, terrain: 'path' } };
  apply(map, generationChange(next, reload(map)));
  assert.equal(get(map.chunks, -34, 0), 'dirt');
  assert.equal(get(map.chunks, 3, 0), 'path');
});

test('overlapping generators preserve the cells owned by another recipe', () => {
  const map = empty();
  const line = { ...road, params: { terrain: 'path', width: 1, points: [{ x: -1, y: 0 }, { x: 1, y: 0 }] } };
  apply(map, generationChange(line, map));
  const crossing = { ...line, id: 'crossing', params: { terrain: 'water', width: 1, points: [{ x: 0, y: -1 }, { x: 0, y: 1 }] } };
  apply(map, generationChange(crossing, map));
  assert.equal(get(map.chunks, 0, 0), 'path');
  apply(map, generationChange({ ...crossing, seed: 5 }, map));
  assert.equal(get(map.chunks, 0, 0), 'path');
  assert.equal(map.generators.length, 2);
  assert.equal(get(map.chunks, 0, -1), 'water');
});

test('legacy recipes do not guess the lost source terrain', () => {
  const map = empty();
  map.generators = [road];
  set(map.chunks, -34, 0, 'stone');
  const before = structuredClone(map);
  const same = generationChange(road, map);
  assert.deepEqual(same.tiles, []);
  assert.strictEqual(same.generators.before, same.generators.after);
  assert.throws(() => generationChange({ ...road, seed: 2 }, map), /старого рецепта/);
  assert.deepEqual(map, before);
});

test('generation state rejects malformed metadata and a failed preview leaves the draft intact', () => {
  const map = empty();
  apply(map, generationChange(forest, map));
  const recipe = map.generators[0], state = recipe.state;
  for (const bad of [
    { ...state, version: 2 }, { ...state, extra: true },
    { ...state, tiles: [...state.tiles, state.tiles[0]] },
    { ...state, tiles: [{ x: 8192, y: 0, before: null, after: 'woodland' }] },
    { ...state, tiles: [{ x: 0, y: 0, before: 'garbage', after: 'woodland' }] },
    { ...state, tiles: [{ x: 0, y: 0, before: null, after: 'water' }] },
    { ...state, objects: [{ ...state.objects[0], hidden: 'yes' }] },
    { ...state, objects: [...state.objects, state.objects[0]] },
    { ...state, protectedTiles: [{ x: 0, y: 0 }, { x: 0, y: 0 }] },
    { ...state, protectedObjects: ['x', 'x'] },
  ]) assert.equal(validGenerators([{ ...recipe, state: bad }]), false);
  const full = empty();
  full.objects = Array.from({ length: objectLimit }, (_, id) => ({ id: String(id), kind: 'tree', x: 100, y: 100, turn: 0 }));
  const before = structuredClone(full);
  assert.throws(() => generationChange(forest, full), /лимит объектов/);
  assert.deepEqual(full, before);
  assert.throws(() => generationChange({ ...road, params: { ...road.params, width: 2 } }, full), /параметры/);
  assert.deepEqual(full, before);
});

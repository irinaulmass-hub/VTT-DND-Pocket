const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRandomV1, validGenerators, generatePath, generateForest } = require('../remote/world-generators');

const { get, set, size, valid, cellBounds, objectLimit } = require('../remote/world-model');

const road = {
  id: 'road-1', kind: 'path', version: 1, seed: 0,
  params: { terrain: 'path', width: 3, points: [{ x: -33, y: 0 }, { x: 32, y: -1 }] },
};

test('generator recipes accept both road and river paths on world cell coordinates', () => {
  const river = {
    ...road, id: 'river-1', seed: 0xffffffff,
    params: { terrain: 'water', width: 15, points: [{ x: -8192, y: 8191 }, { x: 8191, y: -8192 }] },
  };
  assert.equal(validGenerators([road, river]), true);
  assert.equal(validGenerators([]), true);
});

test('invalid or ambiguous generator recipes are rejected', () => {
  const withParams = patch => ({ ...road, params: { ...road.params, ...patch } });
  for (const recipe of [
    null,
    { ...road, id: '' },
    { ...road, kind: 'forest' },
    { ...road, version: 2 },
    { ...road, seed: '1' },
    { ...road, seed: -1 },
    { ...road, seed: 0x100000000 },
    { ...road, extra: true },
    withParams({ terrain: 'grass' }),
    withParams({ width: 2 }),
    withParams({ width: 17 }),
    withParams({ points: [{ x: 0, y: 0 }] }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 8192, y: 0 }] }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] }),
    withParams({ points: Array.from({ length: 257 }, (_, x) => ({ x, y: 0 })) }),
  ]) {
    assert.equal(validGenerators([recipe]), false, JSON.stringify(recipe).slice(0, 300));
  }
  assert.equal(validGenerators(null), false);
  assert.equal(validGenerators([road, road]), false);
  assert.equal(validGenerators(Array.from({ length: 129 }, (_, index) => ({ ...road, id: 'road-' + index }))), false);
});

test('the version 1 random stream is stable for the same seed including both bounds', () => {
  const cases = [
    [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]],
    [0xffffffff, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
  ];
  for (const [seed, expected] of cases) {
    const next = createRandomV1(seed);
    const same = createRandomV1(JSON.parse(JSON.stringify(seed)));
    for (const word of expected) {
      const fraction = next();
      assert.equal(fraction * 0x100000000, word);
      assert.equal(fraction, same());
    }
  }
  for (const seed of [undefined, '1', -1, 1.5, NaN, 0x100000000]) {
    assert.throws(() => createRandomV1(seed), RangeError);
  }
});


test('Path connects every anchor through orthogonal neighbors across chunk boundaries', () => {
  const points = [{ x: -34, y: -33 }, { x: -30, y: -30 }, { x: 1, y: 0 }];
  const { chunks, count } = generatePath({ ...road, params: { ...road.params, width: 1, points } });
  for (const { x, y } of points) assert.equal(get(chunks, x, y), 'path');
  assert.ok(chunks['-2,-2'] && chunks['-1,-1'] && chunks['0,0']);

  const visited = new Set();
  const queue = [points[0]];
  for (let index = 0; index < queue.length; index++) {
    const { x, y } = queue[index];
    const key = x + ',' + y;
    if (visited.has(key) || !get(chunks, x, y)) continue;
    visited.add(key);
    queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  assert.equal(visited.size, count);
});

test('a river uses the selected width and clips its brush at world boundaries', () => {
  const river = { ...road, params: { terrain: 'water', width: 5, points: [{ x: 0, y: 1 }, { x: 10, y: 1 }] } };
  const { chunks } = generatePath(river);
  for (let y = -1; y <= 3; y++) assert.equal(get(chunks, 5, y), 'water');
  assert.equal(get(chunks, 5, 4), undefined);

  const edge = generatePath({ ...river, params: { ...river.params,
    points: [{ x: -8192, y: 8191 }, { x: -8182, y: 8191 }],
  } });
  assert.equal(get(edge.chunks, -8192, 8191), 'water');
  for (const [key, cells] of Object.entries(edge.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    for (const offset of Object.keys(cells)) {
      assert.ok(valid(cx * size + offset % size) && valid(cy * size + Math.floor(offset / size)));
    }
  }
});

test('Path bends are reproducible and excessive routes fail before applying', () => {
  const first = generatePath(road);
  assert.deepEqual(generatePath(JSON.parse(JSON.stringify(road))), first);
  assert.notDeepEqual(generatePath({ ...road, seed: 1 }).chunks, first.chunks);
  assert.throws(() => generatePath({ ...road, params: { ...road.params, width: 15,
    points: [{ x: -8192, y: 0 }, { x: 8191, y: 0 }],
  } }), /Линия слишком велика/);
  assert.throws(() => generatePath({ ...road, params: { ...road.params, width: 1,
    points: Array.from({ length: 200 }, (_, index) => ({ x: index % 2 ? 1000 : 0, y: 0 })),
  } }), /Линия слишком велика/);
});

const forest = {
  id: 'west-grove', kind: 'forest', version: 1, seed: 36,
  params: { density: 85, points: [{ x: -10, y: -8 }, { x: 12, y: -8 }, { x: 12, y: 0 },
    { x: 0, y: 0 }, { x: 0, y: 13 }, { x: -10, y: 13 }] },
};

test('Forest Plot reproduces groves in a concave contour and preserves existing features', () => {
  const map = { chunks: {}, objects: [{ id: 'home', kind: 'house', x: -4, y: 5, turn: 0 }] };
  set(map.chunks, -1, 0, 'water');
  set(map.chunks, -1, 1, 'path');
  set(map.chunks, -1, 2, 'stone');
  const original = structuredClone(map);
  const first = generateForest(forest, map);
  assert.ok(validGenerators([forest, road]));
  assert.deepEqual(generateForest(forest, map), first);
  assert.notDeepEqual(generateForest({ ...forest, seed: 3 }, map).plants, first.plants);
  assert.ok(first.plants.some(prop => prop.kind === 'tree'));
  assert.ok(first.plants.some(prop => prop.kind === 'bush'));
  assert.equal(new Set(first.plants.map(prop => prop.id)).size, first.plants.length);
  assert.equal(get(first.chunks, 2, 2), undefined, 'outside the concave boundary');
  assert.equal(get(first.chunks, -7, 3), 'woodland');
  for (const [x, y] of [[-1, 0], [-1, 1], [-1, 2], [-4, 5], [-3, 6]]) {
    assert.equal(get(first.chunks, x, y), undefined);
    assert.ok(first.plants.every(plant => plant.x !== x || plant.y !== y));
  }
  for (const plant of first.plants) {
    const bounds = cellBounds(map.objects[0]);
    assert.ok(plant.x < bounds.left || plant.x > bounds.right || plant.y < bounds.top || plant.y > bounds.bottom);
    assert.equal(get(first.chunks, plant.x, plant.y), 'woodland');
  }
  assert.deepEqual(map, original);
  const applied = { chunks: { ...map.chunks }, objects: [...map.objects, ...first.plants] };
  for (const [key, cells] of Object.entries(first.chunks)) applied.chunks[key] = { ...applied.chunks[key], ...cells };
  assert.deepEqual(generateForest(forest, applied).plants, [], 'reapplying the same plot adds no duplicate plants');
});

test('Forest Plot rejects invalid contours and respects the object limit', () => {
  const withParams = patch => ({ ...forest, params: { ...forest.params, ...patch } });
  for (const invalid of [
    withParams({ density: 101 }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }] }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 8 }, { x: 6, y: 0 }] }),
    withParams({ points: [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 0, y: 64 }] }),
  ]) assert.equal(validGenerators([invalid]), false);
  const objects = Array.from({ length: objectLimit }, (_, i) => ({ id: 'tree-' + i, kind: 'tree', x: 100 + i, y: 100, turn: 0 }));
  assert.throws(() => generateForest(forest, { chunks: {}, objects }), /лимит объектов/);
});

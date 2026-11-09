const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRandomV1, validGenerators } = require('../world-generators');

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

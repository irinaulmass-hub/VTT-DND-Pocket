const assert = require('node:assert/strict');
const { test } = require('node:test');
const world = require('../remote/world-model');

test('world chunk addresses use floor division at positive and negative boundaries', () => {
  const cases = [
    [0, 0, '0,0', 0],
    [31, 31, '0,0', 1023],
    [32, 32, '1,1', 0],
    [-1, -1, '-1,-1', 1023],
    [-32, -32, '-1,-1', 0],
    [-33, 32, '-2,1', 31],
    [0, -33, '0,-2', 992],
    [-8192, 8191, '-256,255', 992],
  ];
  const chunks = {};
  for (const [x, y, key, offset] of cases) {
    assert.deepEqual(world.address(x, y), [key, offset]);
    const [cx, cy] = key.split(',').map(Number);
    assert.equal(cx * world.size + offset % world.size, x);
    assert.equal(cy * world.size + Math.floor(offset / world.size), y);
    world.set(chunks, x, y, 'path');
    assert.equal(chunks[key][offset], 'path');
    assert.equal(world.get(chunks, x, y), 'path');
  }
});

test('current world coordinate limits accept only integers in the supported range', () => {
  for (const coordinate of [-8192, 0, 8191]) assert.equal(world.valid(coordinate), true);
  for (const coordinate of [-8193, 8192, 0.5, '0', NaN, Infinity]) {
    assert.equal(world.valid(coordinate), false);
  }
});

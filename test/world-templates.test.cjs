const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validTemplate } = require('../remote/world-generators');

test('templates accept only versioned generator settings, without geometry or source state', () => {
  const road = { id: 'road-settings', name: 'Дорога', kind: 'path', version: 1,
    seed: 0, settings: { terrain: 'path', width: 3 } };
  const forest = { ...road, id: 'forest-settings', kind: 'forest', seed: 0xffffffff, settings: { density: 90 } };
  assert.equal(validTemplate(road), true);
  assert.equal(validTemplate(forest), true);
  assert.equal(validTemplate({ ...road, settings: { terrain: 'water', width: 15 } }), true);
  for (const invalid of [
    null, [], {}, { ...road, id: '' }, { ...road, name: '' }, { ...road, name: ' Дорога' },
    { ...road, name: 'x'.repeat(81) }, { ...road, version: 2 }, { ...road, seed: -1 },
    { ...road, seed: 0x100000000 }, { ...road, seed: '0' }, { ...road, kind: 'room' },
    { ...road, params: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } }, { ...road, state: {} },
    { ...road, settings: { ...road.settings, points: [] } }, { ...road, settings: { terrain: 'grass', width: 3 } },
    { ...road, settings: { terrain: 'path', width: 2 } }, { ...forest, settings: { density: 101 } },
    { ...forest, settings: { density: '90' } }, { ...forest, settings: { density: 90, protectedObjects: [] } },
  ]) assert.equal(validTemplate(invalid), false, JSON.stringify(invalid));
});

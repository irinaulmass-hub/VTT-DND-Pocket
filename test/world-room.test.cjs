const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateRoom, generationChange, protectManualChanges, validGenerators } = require('../remote/world-generators');
const { get, set, wallCells, objectLimit } = require('../remote/world-model');
const movementFactory = require('../world-movement');
const room = {
  id: 'room-one', kind: 'room', version: 1, seed: 7,
  params: { floor: 'wood', points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], entrance: { x: 3, y: 0 } },
};
const empty = () => ({ id: 'test-world', chunks: {}, objects: [], generators: [] });
function apply(draft, change, backwards = false) {
  for (const cell of change.tiles) set(draft.chunks, cell.x, cell.y, backwards ? cell.before : cell.after);
  if (change.objects) draft.objects = backwards ? change.objects.before : change.objects.after;
  draft.generators = backwards ? change.generators.before : change.generators.after;
}

test('Room closes the contour with existing two-cell walls and leaves exactly one operable entrance', () => {
  const result = generateRoom(room, empty());
  assert.equal(result.count, 49);
  const walls = new Set(result.objects.filter(p => p.kind === 'wall').flatMap(p => wallCells(p).map(c => c.join(','))));
  for (let y = 0; y <= 6; y++) for (let x = 0; x <= 6; x++) {
    assert.equal(get(result.chunks, x, y), 'wood');
    assert.equal(walls.has(x + ',' + y), (x === 0 || y === 0 || x === 6 || y === 6) && !(x === 3 && y === 0));
  }
  const doors = result.objects.filter(p => p.kind === 'door');
  assert.equal(doors.length, 1);
  assert.equal(doors[0].turn, 0);
  assert.deepEqual(result, generateRoom({ ...room, params: { ...room.params, points: [...room.params.points].reverse() } }, empty()));
  const layout = { ...empty(), chunks: result.chunks, objects: result.objects };
  const movement = movementFactory({ readPublished: () => ({ map: layout }), readDraft: () => layout }, () => 'unused');
  const scope = { worldId: layout.id, sceneId: 'overworld', floorId: 'ground' };
  assert.equal(movement.stepVisibility({ ...scope, x: 3, y: 0 }, new Set()), null, 'closed entrance blocks movement');
  assert.ok(movement.stepVisibility({ ...scope, x: 3, y: 0 }, new Set([doors[0].id])));
  assert.equal(movement.stepVisibility({ ...scope, x: 0, y: 3 }, new Set([doors[0].id])), null, 'opening the door does not open walls');
  const origin = { ...scope, x: 3, y: 1 };
  assert.ok(!movement.visibleCells(origin, layout.objects, new Set()).some(c => c.x === 3 && c.y === -1));
  assert.ok(movement.visibleCells(origin, layout.objects, new Set([doors[0].id])).some(c => c.x === 3 && c.y === -1));
});

test('Room handles concave orthogonal contours, vertical doors, negative chunks and world boundaries', () => {
  const concave = { ...room, params: { floor: 'stone', entrance: { x: 0, y: 2 }, points:
    [[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8]].map(([x, y]) => ({ x, y })) } };
  const output = generateRoom(concave, empty());
  assert.equal(output.objects.find(p => p.kind === 'door').turn, 1);
  assert.equal(get(output.chunks, 7, 7), undefined);
  for (const offset of [-8192, -34, 8185]) {
    const moved = { ...room, params: { ...room.params,
      entrance: { x: offset + 3, y: offset + (offset === -8192 ? 6 : 0) }, points: room.params.points.map(p => ({ x: p.x + offset, y: p.y + offset })) } };
    assert.equal(generateRoom(moved, empty()).count, 49);
  }
});

test('Room rejects malformed, disconnected, diagonal, oversized and ambiguous entrances', () => {
  const patch = params => ({ ...room, params: { ...room.params, ...params } });
  for (const invalid of [
    { ...room, version: 2 }, { ...room, seed: -1 }, patch({ floor: 'water' }),
    patch({ entrance: { x: -8189, y: -8192 }, points: room.params.points.map(p => ({ x: p.x - 8192, y: p.y - 8192 })) }),
    patch({ entrance: { x: 0, y: 0 } }), patch({ entrance: { x: 3, y: 3 } }), patch({ entrance: null }),
    patch({ points: [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 6, y: 6 }, { x: 0, y: 6 }] }),
    patch({ points: [[0,0],[70,0],[70,70],[0,70]].map(([x,y])=>({x,y})) }),
    patch({ points: [[0,0],[6,0],[6,1],[0,1]].map(([x,y])=>({x,y})) }),
    patch({ points: [[0,0],[4,0],[4,2],[8,2],[8,0],[12,0],[12,6],[8,6],[8,3],[4,3],[4,6],[0,6]].map(([x,y])=>({x,y})) }),
  ]) {
    assert.equal(validGenerators([invalid]), false, JSON.stringify(invalid));
    assert.throws(() => generateRoom(invalid, empty()), RangeError);
  }
});

test('Room preserves source terrain and manual edits through regeneration, reload and Undo/Redo', () => {
  let draft = empty();
  set(draft.chunks, 0, 0, 'grass');
  const first = generationChange(room, draft);
  assert.deepEqual(draft.objects, [], 'preview leaves data alone');
  apply(draft, first);
  const wall = draft.objects.find(p => p.kind === 'wall');
  apply(draft, protectManualChanges(draft, { tiles: [{ x: 2, y: 2, before: 'wood', after: 'stone' }],
    objects: { before: draft.objects, after: draft.objects.map(p => p.id === wall.id ? { ...p, hidden: true } : p) } }));
  draft = JSON.parse(JSON.stringify(draft));
  const before = structuredClone(draft);
  const change = generationChange({ ...room, params: { ...room.params, floor: 'caveFloor' } }, draft);
  assert.deepEqual(draft, before);
  apply(draft, change);
  assert.equal(get(draft.chunks, 2, 2), 'stone');
  assert.equal(get(draft.chunks, 3, 3), 'caveFloor');
  assert.equal(draft.objects.find(p => p.id === wall.id).hidden, true);
  assert.equal(draft.generators[0].id, room.id);
  const after = structuredClone(draft);
  apply(draft, change, true); assert.deepEqual(draft, before);
  apply(draft, change); assert.deepEqual(draft, after);
  const noOp = generationChange(draft.generators[0], draft);
  assert.equal(noOp.tiles.length, 0); assert.equal(noOp.objects, null);
  assert.deepEqual(noOp.generators.before, noOp.generators.after);
  const moved = { ...room, params: { ...room.params, entrance: { x: 13, y: 0 }, points: room.params.points.map(p => ({ x: p.x + 10, y: p.y })) } };
  apply(draft, generationChange(moved, draft));
  assert.equal(get(draft.chunks, 0, 0), 'grass');
  assert.equal(get(draft.chunks, 3, 3), undefined);
  assert.equal(get(draft.chunks, 2, 2), 'stone');
});

test('Room fails atomically on foreign ownership, occupied walls, object limits or invalid saved state', () => {
  for (const draft of [
    { ...empty(), objects: [{ id: 'existing', kind: 'house', x: 0, y: 0, turn: 0 }] },
    { ...empty(), objects: Array.from({ length: objectLimit }, (_, i) => ({ id: 'p' + i, kind: 'barrel', x: 100, y: 100, turn: 0 })) },
    { ...empty(), generators: [{ ...room, id: 'other', state: { version: 1, tiles: [{ x: 2, y: 2, before: null, after: 'wood' }], objects: [], protectedTiles: [], protectedObjects: [] } }] },
  ]) {
    const before = structuredClone(draft);
    assert.throws(() => generationChange(room, draft), RangeError);
    assert.deepEqual(draft, before);
  }
  const saved = generationChange(room, empty()).generators.after[0];
  for (const state of [
    { ...saved.state, tiles: [{ x: 0, y: 0, before: null, after: 'woodland' }] },
    { ...saved.state, objects: [{ ...saved.state.objects[0], kind: 'tree' }] },
    { ...saved.state, objects: [{ ...saved.state.objects[0], x: 8191, turn: 0 }] },
  ]) assert.equal(validGenerators([{ ...saved, state }]), false);
});

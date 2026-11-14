const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createStore = require('../world-store');
const createMovement = require('../world-movement');
const { set } = require('../remote/world-model');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-building-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = name => path.join(dir, name);
  const store = createStore(file), movement = createMovement(store, file);
  const source = { id: '10000000-0000-0000-0000-000000000001', name: 'Снаружи', revision: 1,
    chunks: {}, objects: [{ id: 'home', kind: 'house', x: 0, y: 0, turn: 0 }] };
  const target = { id: '10000000-0000-0000-0000-000000000002', name: 'Внутри', revision: 1,
    parentWorldId: source.id, chunks: {}, objects: [] };
  const floor = { ...target, id: '10000000-0000-0000-0000-000000000003', parentSceneId: target.id, elevation: -1 };
  set(source.chunks, 0, 2, 'grass'); set(target.chunks, 3, 1, 'wood');
  set(floor.chunks, 3, 1, 'stone');
  for (const map of [source, target, floor]) store.writeDraft(map);
  const publish = map => store.writePublished(map.id, { map, revision: map.revision, fog: true, seen: {}, tokens: [] });
  const body = (patch = {}) => ({ buildingId: 'home', sourceRevision: 1, targetRevision: 1,
    linksRevision: movement.linksRevision(), x: 0, y: 2, toX: 3, toY: 1, ...patch });
  return { source, target, floor, store, movement, file, publish, body };
}

test('a building binding persists both directions atomically and needs published maps to travel', t => {
  const f = fixture(t), { source, target, floor, movement, publish } = f;
  const pair = movement.saveBuildingLink(source, target, f.body());
  assert.equal(pair.length, 2);
  assert.deepEqual(pair[1].to, pair[0].from);
  assert.equal(movement.findTransition(pair[0].from), null, 'unpublished interiors are not travel destinations');
  publish(source); publish(target);
  assert.deepEqual(movement.findTransition(pair[0].from), pair[0].to);
  assert.deepEqual(movement.findTransition(pair[1].from), pair[0].from, 'return uses the exact external cell');
  const reopened = createMovement(createStore(f.file), f.file);
  assert.deepEqual(reopened.findTransition(pair[0].to), pair[0].from);
  const floorPair = movement.saveBuildingLink(source, floor, f.body());
  assert.equal(movement.listTransitions(target.id).length, 0, 'rebind removes the old return');
  assert.equal(floorPair[0].to.floorId, floor.id);
  publish(floor);
  assert.deepEqual(movement.findTransition(floorPair[0].from), floorPair[0].to);
  movement.removeTransition(floor.id, floorPair[1].id, movement.linksRevision());
  assert.equal(movement.listTransitions(source.id).length, 0);
  assert.equal(movement.listTransitions(floor.id).length, 0);
});

test('bindings reject stale writers, occupied cells, invalid building geometry and unsafe targets without losing links', t => {
  const f = fixture(t), { source, target, movement } = f;
  const stale = f.body();
  const pair = movement.saveBuildingLink(source, target, stale);
  const saved = fs.readFileSync(f.file('world-transitions.json'), 'utf8');
  for (const attempt of [
    () => movement.saveBuildingLink(source, target, stale),
    () => movement.saveBuildingLink(source, target, f.body({ sourceRevision: 0 })),
    () => movement.saveBuildingLink(source, target, f.body({ targetRevision: 0 })),
    () => movement.saveBuildingLink(source, target, f.body({ buildingId: 'unknown' })),
    () => movement.saveBuildingLink(source, target, f.body({ x: 0, y: 0 })),
    () => movement.saveBuildingLink(source, target, f.body({ x: 2, y: 2 })),
    () => movement.saveBuildingLink(source, target, f.body({ toX: 20 })),
    () => movement.saveBuildingLink(source, { ...target, parentWorldId: 'another-world' }, f.body()),
    () => movement.saveTransition(pair[0].from, pair[0].to),
    () => movement.removeTransition(source.id, pair[0].id, stale.linksRevision),
  ]) {
    assert.throws(attempt);
    assert.equal(fs.readFileSync(f.file('world-transitions.json'), 'utf8'), saved);
  }
  movement.removeTransition(source.id, pair[0].id, movement.linksRevision());
  movement.saveTransition(pair[0].to, pair[0].from);
  const before = fs.readFileSync(f.file('world-transitions.json'), 'utf8');
  assert.throws(() => movement.saveBuildingLink(source, target, f.body()), { status: 409 });
  assert.equal(fs.readFileSync(f.file('world-transitions.json'), 'utf8'), before, 'a manual transition cannot be overwritten');
});

test('published building changes and blocked source cells invalidate travel; a failed pair write preserves the previous pair', t => {
  const f = fixture(t), { source, target, movement, publish } = f;
  const pair = movement.saveBuildingLink(source, target, f.body());
  publish(source); publish(target);
  for (const changed of [
    { ...source, objects: [] },
    { ...source, objects: [{ ...source.objects[0], x: 1 }] },
    { ...source, objects: [{ ...source.objects[0], turn: 1 }] },
    { ...source, objects: [{ ...source.objects[0], hidden: true }] },
    { ...source, objects: [...source.objects, { id: 'entrance-door', kind: 'door', x: 0, y: 2, turn: 0 }] },
  ]) {
    publish(changed);
    assert.equal(movement.findTransition(pair[0].from), null);
    if (changed.objects.some(p => p.id === 'entrance-door')) {
      assert.deepEqual(movement.findTransition(pair[0].from, new Set(['entrance-door'])), pair[0].to);
    } else assert.equal(movement.findTransition(pair[1].from), null);
  }
  publish(source);
  const wet = structuredClone(source); set(wet.chunks, 0, 2, 'water'); publish(wet);
  assert.equal(movement.findTransition(pair[0].from), null);
  publish(source);
  const before = fs.readFileSync(f.file('world-transitions.json'), 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = (...args) => { if (args[1] === f.file('world-transitions.json')) throw new Error('write interrupted'); return rename(...args); };
  try { assert.throws(() => movement.saveBuildingLink(source, target, f.body()), /write interrupted/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(f.file('world-transitions.json'), 'utf8'), before);
  assert.deepEqual(movement.findTransition(pair[1].from), pair[0].from);
  fs.writeFileSync(f.file('world-transitions.json'), JSON.stringify([pair[0]]));
  assert.equal(movement.findTransition(pair[0].from), null, 'a broken pair fails closed');
});

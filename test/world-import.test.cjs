const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const createStore = require('../world-store');

const id = '10000000-0000-0000-0000-000000000000';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const worlds = path.join(dir, 'worlds');
  fs.mkdirSync(worlds);
  const draft = { id, name: 'Старая карта', revision: 4, objects: [], chunks: { '-01,0': { '0003': 'water' } } };
  const live = {
    map: { ...draft, revision: 2, chunks: { '-1,0': { 3: 'path' } } },
    revision: 7, fog: true, seen: { '-01,0': { '0003': true } },
    frame: { x: -29, y: 0, scale: 24, serial: 0 },
    tokens: [{ id: 'hero', name: 'Герой', x: -29, y: 0 }],
  };
  const draftFile = path.join(worlds, id + '.json');
  const liveFile = path.join(worlds, id + '-live.json');
  fs.writeFileSync(draftFile, JSON.stringify(draft, null, 2));
  fs.writeFileSync(liveFile, JSON.stringify(live, null, 2));
  const activeFile = path.join(dir, 'active-world.json');
  fs.writeFileSync(activeFile, JSON.stringify({ id }));
  const run = () => spawnSync(process.execPath, [path.resolve(__dirname, '../import-world.js'), dir, id], { encoding: 'utf8' });
  return { dir, worlds, draft, live, draftFile, liveFile, activeFile, run };
}

test('legacy import preserves originals, survives reopening, and permits rollback in a separate copy', t => {
  const { dir, worlds, draft, live, draftFile, liveFile, activeFile, run } = fixture(t);
  const originals = [draftFile, liveFile, activeFile].map(file => fs.readFileSync(file));
  const imported = run();
  assert.equal(imported.status, 0, imported.stderr);
  const store = createStore(name => path.join(dir, name));
  assert.deepEqual(store.listDrafts(), [{ id, name: draft.name }]);
  assert.deepEqual(store.readDraft(id), { ...draft, chunks: { '-1,0': { 3: 'water' } } });
  assert.deepEqual(store.readActiveWorld(), { ...live, seen: { '-1,0': { 3: true } } });

  store.writeDraft({ ...store.readDraft(id), revision: 5 });
  store.updatePublishedState(id, { ...store.readActiveWorld([]), revision: 8 });
  const repeated = run();
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /already imported/);
  assert.equal(store.readDraft(id).revision, 5);
  assert.equal(store.readActiveWorld().revision, 8);
  assert.deepEqual([draftFile, liveFile, activeFile].map(file => fs.readFileSync(file)), originals);

  const rollback = path.join(dir, 'rollback');
  fs.mkdirSync(path.join(rollback, 'worlds'), { recursive: true });
  for (const file of [draftFile, liveFile]) fs.copyFileSync(file, path.join(rollback, 'worlds', path.basename(file)));
  fs.copyFileSync(activeFile, path.join(rollback, 'active-world.json'));
  const restored = createStore(name => path.join(rollback, name));
  assert.deepEqual(restored.readDraft(id), draft);
  assert.deepEqual(restored.readActiveWorld(), live);
  assert.ok(fs.existsSync(path.join(worlds, id + '-chunks.json')));
});

test('a conflicting legacy publication leaves both legacy files authoritative', t => {
  const { dir, worlds, draft, live, draftFile, liveFile, run } = fixture(t);
  live.seen['-1,0'] = { 3: true };
  fs.writeFileSync(liveFile, JSON.stringify(live));
  const bytes = fs.readFileSync(draftFile);
  const rejected = run();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Conflicting cell/);
  assert.equal(fs.existsSync(path.join(worlds, id + '-chunks.json')), false);
  assert.deepEqual(fs.readFileSync(draftFile), bytes);
  const store = createStore(name => path.join(dir, name));
  assert.deepEqual(store.readDraft(id), draft);
  assert.deepEqual(store.readActiveWorld(), live);
});

test('a failed final manifest write leaves the legacy publication active and can be retried', t => {
  const { dir, worlds, draft, live, run } = fixture(t);
  const obstruction = path.join(worlds, id + '-chunks.json.tmp');
  fs.mkdirSync(obstruction);
  const interrupted = run();
  assert.equal(interrupted.status, 1);
  assert.ok(fs.existsSync(path.join(worlds, id + '-live-chunks.json')));
  const store = createStore(name => path.join(dir, name));
  assert.deepEqual(store.readDraft(id), draft);
  assert.deepEqual(store.readActiveWorld(), live);
  fs.rmdirSync(obstruction);
  const retried = run();
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(store.readActiveWorld().seen['-1,0'][3], true);
});

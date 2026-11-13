'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { size, valid } = require('./remote/world-model');

const idPattern = /^[a-f0-9-]{36}$/;

function read(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function readManifest(file) {
  const manifest = read(file);
  if (manifest && manifest.storageVersion !== 1) throw Error('Unsupported world storage version');
  return manifest;
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);
}

module.exports = function createWorldStore(gameFile) {
  // Resolve paths on each operation so the server's current campaign selects the data.
  const worldFile = (id, suffix) => path.join(gameFile('worlds'), id + suffix + '.json');
  const manifestFile = (id, suffix) => worldFile(id, suffix + '-chunks');
  const chunkFile = (id, hash) => path.join(gameFile('worlds'), id + '-chunks', hash + '.json');

  function readChunks(id, index, keys = Object.keys(index)) {
    const chunks = {};
    for (const key of keys) {
      if (!Object.hasOwn(index, key)) continue;
      const { hash } = index[key];
      if (!/^[0-9a-f]{64}$/.test(hash)) throw Error('Invalid chunk reference');
      const tiles = read(chunkFile(id, hash));
      if (!tiles) throw Error('Missing chunk ' + key);
      chunks[key] = tiles;
    }
    return chunks;
  }

  function writeChunks(id, chunks) {
    return Object.fromEntries(Object.entries(chunks).map(([key, tiles]) => {
      const hash = createHash('sha256').update(JSON.stringify(tiles)).digest('hex');
      const file = chunkFile(id, hash);
      if (!fs.existsSync(file)) write(file, tiles);
      return [key, { hash, count: Object.keys(tiles).length }];
    }));
  }

  function readDraft(id, keys) {
    if (!idPattern.test(id)) return null;
    const manifest = readManifest(manifestFile(id, ''));
    if (manifest) return { ...manifest.map, chunks: readChunks(id, manifest.index, keys) };
    const draft = read(worldFile(id, ''));
    if (!draft || keys === undefined) return draft;
    return { ...draft, chunks: Object.fromEntries(Array.from(keys).filter(key => Object.hasOwn(draft.chunks, key))
      .map(key => [key, draft.chunks[key]])) };
  }

  function saveChunkDraft(draft) {
    const { chunks, ...map } = draft;
    const index = writeChunks(draft.id, chunks);
    write(manifestFile(draft.id, ''), { storageVersion: 1, map, index });
  }

  function hasChunkDraft(id) {
    return fs.existsSync(manifestFile(id, ''));
  }

  function writeDraft(draft) {
    if (!hasChunkDraft(draft.id) && fs.existsSync(worldFile(draft.id, ''))) {
      return write(worldFile(draft.id, ''), draft);
    }
    saveChunkDraft(draft);
  }

  // Internal commit of an already validated District snapshot. Only supplied chunks are hashed;
  // callers derive these replacements/deletions from the server-verified cell delta.
  function writeDraftChanges(draft, revision, changes, limit) {
    if (!idPattern.test(draft.id)) return { status: 'missing' };
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(draft.revision) ||
        draft.revision !== revision + 1 || !Number.isSafeInteger(limit) || limit < 0 ||
        !changes || typeof changes !== 'object' || Array.isArray(changes)) throw Error('Invalid draft commit');
    for (const [key, tiles] of Object.entries(changes)) {
      if (!/^-?\d{1,3},-?\d{1,3}$/.test(key) || key.split(',').map(Number).join(',') !== key ||
          key.split(',').some(n => !valid(Number(n) * size)) ||
          (tiles !== null && (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)))) {
        throw Error('Invalid draft chunk changes');
      }
    }
    const file = manifestFile(draft.id, ''), manifest = readManifest(file);
    if (!manifest) {
      const previous = read(worldFile(draft.id, ''));
      if (!previous) return { status: 'missing' };
      if (previous.revision !== revision) return { status: 'conflict' };
      if (Object.values(draft.chunks).reduce((sum, tiles) => sum + Object.keys(tiles).length, 0) > limit) return { status: 'limit' };
      writeDraft(draft); // Preserve the legacy format; no migration as a side effect of editing.
      return { status: 'saved', revision: draft.revision };
    }
    if (manifest.map.revision !== revision) return { status: 'conflict' };
    const count = Object.values(manifest.index).reduce((sum, entry) => sum + entry.count, 0);
    const delta = Object.entries(changes).reduce((sum, [key, tiles]) =>
      sum + (tiles === null ? 0 : Object.keys(tiles).length) - (manifest.index[key]?.count || 0), 0);
    if (count + delta > limit) return { status: 'limit' };
    const replacements = Object.fromEntries(Object.entries(changes).filter(([, tiles]) => tiles !== null));
    const index = { ...manifest.index, ...writeChunks(draft.id, replacements) };
    for (const [key, tiles] of Object.entries(changes)) if (tiles === null) delete index[key];
    const { chunks, ...metadata } = draft;
    // A failed chunk write or manifest replacement leaves the previous index authoritative.
    write(file, { ...manifest, map: metadata, index });
    return { status: 'saved', revision: draft.revision };
  }

  function patchDraft(id, revision, changes, limit) {
    if (!idPattern.test(id)) return { status: 'missing' };
    const file = manifestFile(id, '');
    const manifest = readManifest(file);
    if (!manifest) return { status: fs.existsSync(worldFile(id, '')) ? 'legacy' : 'missing' };
    if (manifest.map.revision !== revision) return { status: 'conflict' };
    const count = Object.values(manifest.index).reduce((sum, entry) => sum + entry.count, 0);
    const delta = Object.entries(changes).reduce((sum, [key, tiles]) =>
      sum + (tiles ? Object.keys(tiles).length : 0) - (manifest.index[key]?.count || 0), 0);
    if (count + delta > limit) return { status: 'limit' };

    const replacements = Object.fromEntries(Object.entries(changes).filter(([, tiles]) => tiles !== null));
    Object.assign(manifest.index, writeChunks(id, replacements));
    for (const [key, tiles] of Object.entries(changes)) {
      if (tiles === null) delete manifest.index[key];
    }
    manifest.map.revision++;
    write(file, manifest);
    return { status: 'saved', revision: manifest.map.revision };
  }

  function readPublished(id, keys) {
    const manifest = hasChunkDraft(id) ? readManifest(manifestFile(id, '-live')) : null;
    if (manifest) {
      return { ...manifest.snapshot, map: { ...manifest.snapshot.map, chunks: readChunks(id, manifest.index, keys) } };
    }
    return read(worldFile(id, '-live'));
  }

  function saveChunkPublished(id, snapshot) {
    const { chunks, ...map } = snapshot.map;
    const index = writeChunks(id, chunks);
    write(manifestFile(id, '-live'), { storageVersion: 1, snapshot: { ...snapshot, map }, index });
  }

  function writePublished(id, snapshot) {
    if (!hasChunkDraft(id)) return write(worldFile(id, '-live'), snapshot);
    saveChunkPublished(id, snapshot);
  }

  function updatePublishedState(id, snapshot) {
    const file = manifestFile(id, '-live');
    const manifest = hasChunkDraft(id) ? readManifest(file) : null;
    if (!manifest) return write(worldFile(id, '-live'), snapshot);
    write(file, { ...manifest, snapshot: { ...snapshot, map: manifest.snapshot.map } });
  }

  function readActive() {
    const state = read(gameFile('active-world.json'));
    return { id: state?.id || null, generation: state?.generation ?? 0 };
  }

  const readActiveId = () => readActive().id;

  function writeActiveId(id) {
    const active = readActive();
    if (id === active.id) return active;
    const next = { id, generation: active.generation + 1 };
    write(gameFile('active-world.json'), next);
    return next;
  }

  return {
    listDrafts() {
      const dir = gameFile('worlds');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .flatMap(entry => {
          const base = entry.name.slice(0, -5);
          if (idPattern.test(base)) {
            if (hasChunkDraft(base)) return [];
            const { id, name } = read(worldFile(base, ''));
            return [{ id, name }];
          }
          if (!base.endsWith('-chunks') || !idPattern.test(base.slice(0, -7))) return [];
          const { id, name, parentWorldId, parentSceneId, elevation } = readManifest(manifestFile(base.slice(0, -7), '')).map;
          const summary = { id, name };
          if (parentWorldId) summary.parentWorldId = parentWorldId;
          if (parentSceneId) Object.assign(summary, { parentSceneId, elevation });
          return [summary];
        });
    },
    importLegacy(id, convert) {
      if (!idPattern.test(id)) throw Error('Invalid world ID');
      if (readManifest(manifestFile(id, ''))) return 'already imported';
      const draft = read(worldFile(id, ''));
      if (!draft) throw Error('Legacy draft not found');
      const live = read(worldFile(id, '-live'));
      if (live === null && fs.existsSync(worldFile(id, '-live'))) throw Error('Invalid legacy publication');
      if (live === null && fs.existsSync(manifestFile(id, '-live'))) throw Error('Staged publication has no legacy source');
      const converted = convert(draft, live);
      // Commit by writing the draft manifest last. Until then both legacy files remain authoritative.
      if (converted.live) saveChunkPublished(id, converted.live);
      saveChunkDraft(converted.draft);
      return 'imported';
    },
    readDraft,
    writeDraft,
    writeDraftChanges,
    patchDraft,
    readPublished,
    writePublished,
    updatePublishedState,
    readActive,
    readActiveId,
    writeActiveId,
    readActiveWorld(keys) {
      const id = readActiveId();
      return id ? readPublished(id, keys) : null;
    },
  };
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const createWorldStore = require('./world-store');
const world = require('./remote/world-model');

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;

function normalizeCells(chunks, validValue) {
  if (!record(chunks)) throw Error('Invalid chunk collection');
  const result = {};
  for (const [rawKey, cells] of Object.entries(chunks)) {
    if (!/^-?\d{1,3},-?\d{1,3}$/.test(rawKey) || !record(cells)) throw Error('Invalid chunk: ' + rawKey);
    const coordinates = rawKey.split(',').map(Number);
    if (coordinates.some(n => !world.valid(n * world.size))) throw Error('Chunk out of bounds: ' + rawKey);
    const key = coordinates.join(',');
    const chunk = result[key] ??= {};
    for (const [rawIndex, value] of Object.entries(cells)) {
      const index = Number(rawIndex);
      if (!/^\d{1,4}$/.test(rawIndex) || index >= world.size ** 2 || !validValue(value)) {
        throw Error('Invalid cell: ' + rawKey + '/' + rawIndex);
      }
      if (Object.hasOwn(chunk, index)) throw Error('Conflicting cell: ' + key + '/' + index);
      chunk[index] = value;
    }
  }
  return result;
}

function convertMap(map, id) {
  if (!record(map) || map.id !== id || typeof map.name !== 'string' || !revision(map.revision) ||
      Object.hasOwn(map, 'schemaVersion') || !Array.isArray(map.objects)) throw Error('Invalid legacy map');
  if (!map.objects.every(item => record(item) && typeof item.id === 'string' &&
      typeof item.kind === 'string' && Object.hasOwn(world.props, item.kind) &&
      world.valid(item.x) && world.valid(item.y) && [0, 1, 2, 3].includes(item.turn))) {
    throw Error('Invalid legacy objects');
  }
  return {
    ...map,
    chunks: normalizeCells(map.chunks, value => typeof value === 'string' && Object.hasOwn(world.terrain, value)),
  };
}

function importWorld(campaignDir, id) {
  if (!fs.statSync(campaignDir).isDirectory()) throw Error('Campaign path must be a directory');
  const store = createWorldStore(name => path.join(campaignDir, name));
  return store.importLegacy(id, (draft, live) => {
    const converted = { draft: convertMap(draft, id), live: null };
    if (live !== null) {
      if (!record(live) || !revision(live.revision) || typeof live.fog !== 'boolean' ||
          !record(live.frame) || !world.valid(live.frame.x) || !world.valid(live.frame.y) ||
          !Number.isFinite(live.frame.scale) || live.frame.scale <= 0 || !revision(live.frame.serial) ||
          !Array.isArray(live.tokens) || !live.tokens.every(token => record(token) &&
            typeof token.id === 'string' && typeof token.name === 'string' && world.valid(token.x) && world.valid(token.y))) throw Error('Invalid legacy publication');
      converted.live = {
        ...live,
        map: convertMap(live.map, id),
        seen: normalizeCells(live.seen, value => typeof value === 'boolean'),
      };
    }
    return converted;
  });
}

if (require.main === module) {
  const [campaignDir, id, ...extra] = process.argv.slice(2);
  try {
    if (!campaignDir || !id || extra.length) throw Error('Usage: node import-world.js <campaign-data-directory> <world-id>');
    console.log(id + ': ' + importWorld(campaignDir, id));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

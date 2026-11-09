'use strict';

const { address, get, set } = require('./remote/world-model');

function mask(cells) {
  const result = {};
  for (const { x, y } of cells) set(result, x, y, true);
  return result;
}

function publicProp(prop, openDoors) {
  const { id, kind, x, y, turn } = prop;
  const result = { id, kind, x, y, turn };
  if (kind === 'door' && openDoors.has(id)) result.open = true;
  return result;
}

function remember(memory, layout, observed, openDoors) {
  for (const [key, cells] of Object.entries(observed)) {
    const saved = memory.chunks[key] ||= {};
    for (const offset of Object.keys(cells)) saved[offset] = layout.chunks[key]?.[offset] ?? null;
  }

  // Replace the contents of observed cells and keep only the most recently seen location per object.
  for (const [id, prop] of Object.entries(memory.objects)) {
    if (get(observed, prop.x, prop.y)) delete memory.objects[id];
  }
  for (const prop of layout.objects) {
    if (!prop.hidden && get(observed, prop.x, prop.y)) {
      memory.objects[':' + prop.id] = publicProp(prop, openDoors);
    }
  }
}

function project(data, keys, { explored, openDoors, memory, visible }) {
  const chunks = {};
  const seen = {};
  const current = {};
  for (const key of keys) {
    const tiles = data.map.chunks[key];
    if (!data.fog) {
      if (tiles) chunks[key] = tiles;
      continue;
    }

    const remembered = memory.chunks[key];
    if (visible[key]) current[key] = visible[key];
    if (data.seen[key] || explored[key] || remembered || current[key]) {
      seen[key] = { ...data.seen[key], ...explored[key], ...current[key] };
      for (const offset of Object.keys(remembered || {})) seen[key][offset] = true;
    }
    if (!tiles && !remembered) continue;
    chunks[key] = {};
    for (const [offset, known] of Object.entries(seen[key] || {})) {
      if (!known) continue;
      const tile = !current[key]?.[offset] && Object.hasOwn(remembered || {}, offset)
        ? remembered[offset] : tiles?.[offset];
      if (tile) chunks[key][offset] = tile;
    }
  }

  const objects = [];
  const liveIds = new Set();
  for (const prop of data.map.objects) {
    if (prop.hidden) continue;
    const [key, offset] = address(prop.x, prop.y);
    if (data.fog && visible[key]?.[offset]) liveIds.add(prop.id);
    if (keys.has(key) && (!data.fog || visible[key]?.[offset] ||
        (seen[key]?.[offset] && !Object.hasOwn(memory.chunks[key] || {}, offset)))) {
      objects.push(publicProp(prop, openDoors));
    }
  }
  if (data.fog) {
    for (const prop of Object.values(memory.objects)) {
      const [key, offset] = address(prop.x, prop.y);
      if (keys.has(key) && !visible[key]?.[offset] && !liveIds.has(prop.id)) objects.push(prop);
    }
  }
  return { chunks, seen, visible: current, objects };
}

module.exports = { mask, remember, project };

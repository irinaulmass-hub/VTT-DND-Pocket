// Reference projection from 4ff46f7; keep independent of the indexed implementation.
'use strict';

const { address, get, set, visualBounds, size, props } = require('../../remote/world-model');

function mask(cells) {
  const result = {};
  for (const { x, y } of cells) set(result, x, y, true);
  return result;
}

function publicProp(prop, openDoors) {
  const { id, kind, x, y, turn } = prop;
  const result = { id, kind, x, y, turn };
  if (kind === 'door' && openDoors?.has(id)) result.open = true;
  return result;
}

function isRevealedSecret(prop, revealedSecrets) {
  const revealed = revealedSecrets[':' + prop.id];
  return !!revealed && revealed.kind === prop.kind && revealed.x === prop.x &&
    revealed.y === prop.y && revealed.turn === prop.turn;
}

function intersects(prop, keys) {
  if (!keys.size) return false;
  if (keys.has(address(prop.x, prop.y)[0])) return true;
  if (!Object.hasOwn(props, prop.kind)) return false;
  const { left, right, top, bottom } = visualBounds(prop);
  for (let y = Math.floor(top / size); y < Math.ceil(bottom / size); y++) {
    for (let x = Math.floor(left / size); x < Math.ceil(right / size); x++) {
      if (keys.has(x + ',' + y)) return true;
    }
  }
  return false;
}

function remember(memory, layout, observed, openDoors, revealedSecrets) {
  for (const [key, cells] of Object.entries(observed)) {
    const saved = memory.chunks[key] ||= {};
    for (const offset of Object.keys(cells)) saved[offset] = layout.chunks[key]?.[offset] ?? null;
  }

  // Replace the contents of observed cells and keep only the most recently seen location per object.
  for (const [id, prop] of Object.entries(memory.objects)) {
    if (get(observed, prop.x, prop.y)) delete memory.objects[id];
  }
  for (const prop of layout.objects) {
    if ((!prop.hidden || isRevealedSecret(prop, revealedSecrets)) && get(observed, prop.x, prop.y)) {
      memory.objects[':' + prop.id] = publicProp(prop, openDoors);
    }
  }
}

function project(data, keys, { explored, openDoors, memory, visible, revealedSecrets }) {
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
  const selectedIds = new Set();
  // Authorization is global to the anchor, independent of which chunks were requested.
  // Preserve the same mask precedence as the merged seen cells above.
  const knownAnchor = (key, offset) => {
    for (const cells of [visible[key], explored[key], data.seen[key]]) {
      if (cells && Object.hasOwn(cells, offset)) return cells[offset];
    }
    return false;
  };
  for (const prop of data.map.objects) {
    if (prop.hidden && !isRevealedSecret(prop, revealedSecrets)) continue;
    const [key, offset] = address(prop.x, prop.y);
    if (data.fog && visible[key]?.[offset]) liveIds.add(prop.id);
    if (intersects(prop, keys) && (!data.fog || visible[key]?.[offset] ||
        (knownAnchor(key, offset) && !Object.hasOwn(memory.chunks[key] || {}, offset)))) {
      objects.push(publicProp(prop, openDoors));
      selectedIds.add(prop.id);
    }
  }
  if (data.fog) {
    for (const prop of Object.values(memory.objects)) {
      const [key, offset] = address(prop.x, prop.y);
      if (intersects(prop, keys) && !visible[key]?.[offset] && !liveIds.has(prop.id) && !selectedIds.has(prop.id)) {
        const snapshot = publicProp(prop);
        if (prop.kind === 'door' && prop.open === true) snapshot.open = true;
        objects.push(snapshot);
        selectedIds.add(prop.id);
      }
    }
  }
  return { chunks, seen, visible: current, objects };
}

module.exports = { mask, remember, project, isRevealedSecret };

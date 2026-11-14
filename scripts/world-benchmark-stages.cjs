'use strict';
// Installed only in the guarded, disposable benchmark server; production never loads this module.
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');

function createStages(current, now = () => performance.now()) {
  const stack = [];
  function record(name, totalMs, selfMs) {
    const item = current();
    if (!item) return;
    const row = (item.stages ||= {})[name] ||= { calls:0, totalMs:0, selfMs:0 };
    row.calls++; row.totalMs += totalMs; row.selfMs += Math.max(0, selfMs);
  }
  function measure(name, action) {
    if (!current()) return action();
    const start = now(), frame = { childMs:0 };
    stack.push(frame);
    try { return action(); }
    finally {
      const elapsed = now() - start;
      stack.pop();
      record(name, elapsed, elapsed - frame.childMs);
      if (stack.length) stack.at(-1).childMs += elapsed;
    }
  }
  // A synchronous interval already elapsed inside the current measured parent.
  function span(name, elapsed) {
    record(name, elapsed, elapsed);
    if (stack.length) stack.at(-1).childMs += elapsed;
  }
  return { measure, span };
}

function install(current, root) {
  const stages = createStages(current), load = Module._load, wrapped = new WeakSet();
  function methods(object, names, prefix) {
    if (wrapped.has(object)) return object;
    wrapped.add(object);
    for (const name of names) {
      const original = object[name];
      if (typeof original !== 'function') continue;
      object[name] = function(...args) {
        return stages.measure(prefix + name, () => original.apply(this, args));
      };
    }
    return object;
  }
  const factories = new Map([
    [path.join(root, 'world-store.js'), { names:['readDraft','writeDraft','writeDraftChanges','readPublished','readPublishedView','readActive'], prefix:'store.' }],
    [path.join(root, 'character-positions.js'), { names:['mapState','projectionRevision'], prefix:'positions.' }],
    [path.join(root, 'world-movement.js'), { names:['districtContext','visibleCells'], prefix:'movement.' }],
    [path.join(root, 'world-districts.js'), { names:['preview','prepareApply','prepareHistory','verifySave'], prefix:'district.' }],
  ]);
  Module._load = function(request, parent, ...rest) {
    const value = load.call(this, request, parent, ...rest);
    if (parent?.filename === path.join(root, 'world-store.js') && request === 'node:crypto') {
      return { ...value, createHash(...args) {
        if (!current()) return value.createHash(...args);
        const start = performance.now(), hash = value.createHash(...args), digest = hash.digest;
        hash.digest = function(...args) {
          try { return digest.apply(this, args); }
          finally { stages.span('store.chunkHash', performance.now() - start); }
        };
        return hash;
      } };
    }
    if (parent?.filename === path.join(root, 'world-districts.js')) {
      if (request === 'node:crypto') return { ...value, createHmac(...args) {
        if (!current()) return value.createHmac(...args);
        const hmac = stages.measure('signature.crypto', () => value.createHmac(...args));
        const preparedAt = performance.now(), update = hmac.update, digest = hmac.digest;
        let firstUpdate = true;
        hmac.update = function(...args) {
          if (firstUpdate) {
            // In proof(), createHmac precedes evaluation of the canonical JSON argument.
            // This includes normalization, canonicalization and JSON.stringify together.
            stages.span('signature.input', performance.now() - preparedAt);
            firstUpdate = false;
          }
          return stages.measure('signature.crypto', () => update.apply(this, args));
        };
        hmac.digest = function(...args) {
          return stages.measure('signature.crypto', () => digest.apply(this, args));
        };
        return hmac;
      } };
      if (request === './remote/world-generators') return { ...value, generationChange(...args) {
        return stages.measure('generation', () => value.generationChange.apply(this, args));
      } };
    }
    if (request === 'express' && value.response) methods(value.response, ['json'], 'response.');
    if (request.startsWith('.')) {
      const filename = Module._resolveFilename(request, parent), config = factories.get(filename);
      if (filename === path.join(root, 'world-exploration.js')) return methods(value, ['project'], 'exploration.');
      if (config) return function(...args) {
        return methods(value.apply(this, args), config.names, config.prefix);
      };
    }
    return value;
  };
  return stages;
}

module.exports = { createStages, install };

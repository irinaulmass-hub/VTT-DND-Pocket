const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const world = require('../remote/world-model');
const { generatePath } = require('../remote/world-generators');

test('the master can preview, apply, undo, save, and reopen Path, Forest Plot and Room recipes', async () => {
  const tool = { dataset: { tool: 'generate-path' }, setAttribute() {} };
  const roomTool = { dataset: { tool: 'generate-room' }, setAttribute() {} };
  const forestTool = { dataset: { tool: 'generate-forest' }, setAttribute() {} };
  const manualTools = ['stone', 'erase', 'select', 'delete-object'].map(name => ({ dataset: { tool: name }, setAttribute() {} }));
  let nextId = 0;
  class Element {
    nodes = new Map();
    elements = { parentMap: { value: '' }, toMapId: { value: '', replaceChildren() {} }, elevation: {} };
    value = '';
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
    querySelector(selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
      return this.nodes.get(selector);
    }
    querySelectorAll(selector) { return selector === '[data-tool]' ? [tool, forestTool, roomTool, ...manualTools] : []; }
    replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; }
    setAttribute() {}
    toggleAttribute() {}
    addEventListener() {}
    prepend() {}
    append() {}
    reset() {}
  }
  const root = new Element();
  const editor = new Element();
  const elements = [editor, new Element()];
  const control = name => editor.querySelector('[data-world-' + name + ']');
  const original = { id: 'world-id', name: 'Тест', revision: 1, chunks: {}, objects: [] };
  world.set(original.chunks, -1, 0, 'grass');
  world.set(original.chunks, 4, 4, 'stone');
  let saved = structuredClone(original), rendered, camera, canvas;
  const writes = [];
  let templates = { revision: 0, templates: [] };
  let holdTemplateRead = false, releaseTemplateRead;
  const context = vm.createContext({
    WorldMap: world, location: { hash: '' },
    document: {
      createElement: () => elements.shift(),
      getElementById: id => root.querySelector(id),
      body: { dataset: {} },
    },
    crypto: { randomUUID: () => 'recipe-' + (++nextId) }, characterRoster: [],
    MutationObserver: class { observe() {} },
    Option: class { constructor(label, value) { Object.assign(this, { label, value }); } },
    confirm: () => true,
    createWorldView: (element, options) => {
      const isEditor = element === control('canvas');
      if (isEditor) canvas = options;
      return {
        data(data) { if (isEditor) rendered = structuredClone(data); },
        setCamera(next) { if (isEditor) camera = next; },
        camera: () => camera,
        party() {},
      };
    },
    addEventListener() {},
    LootUI: { async request(url, options) {
      if (url === '/api/world-generator-templates') {
        if (holdTemplateRead && !options) {
          holdTemplateRead = false;
          const stale = structuredClone(templates);
          return new Promise(resolve => { releaseTemplateRead = () => resolve(stale); });
        }
        if (options?.method === 'POST') {
          const { revision, ...settings } = JSON.parse(options.body);
          assert.equal(revision, templates.revision);
          templates = { revision: revision + 1, templates: [...templates.templates, { id: 'template-' + (revision + 1), ...settings }] };
        }
        return structuredClone(templates);
      }
      if (url.startsWith('/api/worlds/live')) return null;
      assert.equal(url, '/api/worlds/world-id');
      if (options?.method === 'PUT') {
        const draft = JSON.parse(options.body);
        writes.push(draft);
        saved = { ...draft, revision: saved.revision + 1 };
      }
      return structuredClone(saved);
    } },
  });
  context.window = context;
  for (const file of ['remote/world-generators.js', 'dm/world.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }

  const reopen = async () => {
    control('select').value = 'world-id';
    control('select').onchange();
    await new Promise(setImmediate);
  };
  await reopen();
  tool.onclick();
  assert.equal(control('path-preview').disabled, true);
  control('path-terrain').value = 'water';
  control('path-width').value = '3';
  control('path-seed').value = '42';
  canvas.click(-1, 0);
  canvas.click(3, 0);
  control('path-preview').onclick();
  assert.equal(world.get(rendered.chunks, -1, 0), 'water');
  assert.equal(world.get(rendered.chunks, 4, 4), 'stone');
  await control('save').onclick();
  assert.deepEqual(writes, [], 'preview alone does not save');
  assert.equal(world.get(rendered.chunks, -1, 0), 'grass');

  control('path-preview').onclick();
  control('path-seed').value = '43';
  control('path-seed').oninput();
  assert.equal(control('path-apply').disabled, true);
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(control('template-save').disabled, false, 'saving changed terrain re-enables template controls');
  const [recipe] = saved.generators;
  assert.equal(recipe.seed, 43);
  const actual = generatePath(recipe);
  for (const [key, cells] of Object.entries(actual.chunks)) {
    for (const [offset, terrain] of Object.entries(cells)) assert.equal(saved.chunks[key][offset], terrain);
  }

  control('undo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.chunks, original.chunks);
  assert.deepEqual(saved.generators, []);
  control('redo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.generators, [recipe]);

  await reopen();
  control('path-saved').value = recipe.id;
  control('path-saved').onchange();
  assert.equal(camera.x, -.5);
  assert.equal(control('path-seed').value, '43');
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(writes.length, 3, 'reapplying the same saved line creates no duplicate or write');
  await new Promise(setImmediate);
  assert.equal(control('template-save').disabled, false, 'saving a draft re-enables template controls');
  control('template-name').value = 'Река у деревни';
  await control('template-save').onclick();
  assert.deepEqual(templates.templates[0], { id: 'template-1', name: 'Река у деревни',
    kind: 'path', version: 1, seed: 43, settings: { terrain: 'water', width: 3 } });
  assert.deepEqual(saved.generators, [recipe], 'saving settings leaves the source recipe alone');
  control('template-load').onclick();
  assert.equal(control('path-saved').value, '');
  assert.equal(control('path-preview').disabled, true, 'a template starts without the previous contour');
  canvas.click(15, 10);
  canvas.click(18, 10);
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(control('template-load').disabled, false, 'saving a draft re-enables the selected template');
  const created = saved.generators[1];
  assert.notEqual(created.id, recipe.id);
  assert.equal(created.seed, recipe.seed);
  assert.notDeepEqual(created.state.tiles, recipe.state.tiles, 'the new section captures its own source terrain');
  assert.deepEqual(saved.generators[0], recipe);


  const beforeForest = structuredClone(saved);
  forestTool.onclick();
  control('forest-density').value = '90';
  for (const [x, y] of [[-7, -5], [8, -5], [8, 6], [-7, 6]]) canvas.click(x, y);
  assert.equal(canvas.outline().length, 4);
  control('path-preview').onclick();
  assert.equal(world.get(rendered.chunks, -1, 0), 'water');
  assert.ok(rendered.objects.some(prop => prop.kind === 'tree'));
  assert.deepEqual(saved, beforeForest, 'a forest preview leaves the saved draft alone');

  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(saved.generators[2].kind, 'forest');
  assert.ok(saved.objects.length > 0);
  const savedForest = structuredClone(saved);
  control('undo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.chunks, beforeForest.chunks);
  assert.deepEqual(saved.objects, beforeForest.objects);
  assert.deepEqual(saved.generators, beforeForest.generators);
  control('redo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.objects, savedForest.objects);
  await reopen();
  control('path-saved').value = savedForest.generators[2].id;
  control('path-saved').onchange();
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(writes.length, 7, 'a saved forest does not generate a second set of plants');

  // A loaded recipe is edited in place; manual changes survive save/reopen and history.
  tool.onclick();
  manualTools[0].onclick();
  canvas.click(-1, 0);
  await control('save').onclick();
  assert.equal(world.get(saved.chunks, -1, 0), 'stone');
  await reopen();
  tool.onclick();
  control('path-saved').value = recipe.id;
  control('path-saved').onchange();
  control('path-width').value = '1';
  control('path-width').oninput();
  assert.equal(control('path-saved').value, recipe.id, 'parameter edits retain recipe ownership');
  control('path-preview').onclick();
  assert.equal(world.get(rendered.chunks, -1, 0), 'stone');
  const beforeRegeneration = structuredClone(saved);
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(saved.generators.length, 3);
  assert.equal(saved.generators[0].params.width, 1);
  assert.equal(world.get(saved.chunks, -1, 0), 'stone');
  const regenerated = structuredClone(saved);
  control('undo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.chunks, beforeRegeneration.chunks);
  assert.deepEqual(saved.generators, beforeRegeneration.generators);
  control('redo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.chunks, regenerated.chunks);
  assert.deepEqual(saved.generators, regenerated.generators);

  // Deleting an automatic tree and changing the forest seed cannot resurrect it.
  forestTool.onclick();
  const removed = saved.objects[0];
  manualTools[3].onclick();
  canvas.click(removed.x, removed.y, { x: removed.x + .5, y: removed.y + .5 });
  await control('save').onclick();
  assert.ok(!saved.objects.some(prop => prop.id === removed.id));
  await reopen();
  forestTool.onclick();
  const forestId = saved.generators[2].id;
  control('path-saved').value = forestId;
  control('path-saved').onchange();
  control('path-seed').value = '100';
  control('path-seed').oninput();
  const beforeForestRegeneration = structuredClone(saved);
  control('path-preview').onclick();
  assert.ok(!rendered.objects.some(prop => prop.id === removed.id));
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(saved.generators.length, 3);
  assert.equal(saved.generators[2].id, forestId);
  assert.equal(saved.generators[2].seed, 100);
  assert.ok(!saved.objects.some(prop => prop.id === removed.id));
  const regeneratedForest = structuredClone(saved);
  control('undo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.objects, beforeForestRegeneration.objects);
  assert.deepEqual(saved.generators, beforeForestRegeneration.generators);
  control('redo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.objects, regeneratedForest.objects);
  assert.deepEqual(saved.generators, regeneratedForest.generators);

  // Replacing all points retains the identity and previews removals before applying.
  control('path-clear-points').onclick();
  assert.equal(control('path-saved').value, forestId);
  for (const [x, y] of [[20, 20], [25, 20], [25, 25], [20, 25]]) canvas.click(x, y);
  control('path-preview').onclick();
  assert.equal(world.get(rendered.chunks, 8, 6), undefined, 'old footprint disappears in preview');
  assert.equal(world.get(saved.chunks, 8, 6), 'woodland', 'preview does not save removals');
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(world.get(saved.chunks, 8, 6), undefined);
  assert.equal(saved.generators[2].params.points[0].x, 20);

  const sourceForest = structuredClone(saved.generators[2]);
  control('template-name').value = 'Роща';
  await control('template-save').onclick();
  assert.deepEqual(templates.templates[1], { id: 'template-2', name: 'Роща',
    kind: 'forest', version: 1, seed: 100, settings: { density: 90 } });
  control('path-seed').value = '999';
  control('forest-density').value = '10';
  control('template-load').onclick();
  assert.equal(control('path-saved').value, '');
  assert.equal(control('path-preview').disabled, true);
  assert.equal(control('path-seed').value, '100');
  assert.equal(control('forest-density').value, '90');
  assert.deepEqual(control('template-select').options.map(item => item.label), ['Выбрать шаблон настроек', 'Роща']);
  for (const [x, y] of [[40, 40], [44, 40], [44, 44], [40, 44]]) canvas.click(x, y);
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(saved.generators.length, 4);
  assert.notEqual(saved.generators[3].id, sourceForest.id);
  assert.deepEqual(saved.generators[3].state.protectedObjects, []);
  assert.deepEqual(saved.generators[3].state.protectedTiles, []);
  assert.deepEqual(saved.generators[2], sourceForest, 'a template leaves source manual exceptions with their original section');
  holdTemplateRead = true;
  forestTool.onclick();
  control('template-name').value = 'Роща после сохранения';
  await control('template-save').onclick();
  releaseTemplateRead();
  await new Promise(setImmediate);
  assert.equal(control('template-select').value, 'template-3', 'a delayed read cannot replace the saved list');
  assert.equal(control('template-select').options.length, 3);



  roomTool.onclick();
  assert.equal(control('templates').hidden, true);
  control('room-floor').value = 'wood';
  control('path-seed').value = '7';
  for (const [x, y] of [[60, 0], [66, 0], [66, 6], [60, 6]]) canvas.click(x, y);
  assert.equal(control('path-preview').disabled, true, 'a room requires an explicit entrance');
  control('room-entrance').onclick();
  canvas.click(63, 0);
  assert.equal(canvas.outline().length, 4, 'the entrance is not another contour point');
  const beforeRoom = structuredClone(saved);
  control('path-preview').onclick();
  assert.equal(world.get(rendered.chunks, 63, 3), 'wood');
  assert.equal(saved.generators.length, beforeRoom.generators.length, 'preview does not save a recipe');
  control('path-apply').onclick();
  await control('save').onclick();
  const savedRoom = saved.generators.at(-1);
  assert.equal(savedRoom.kind, 'room');
  assert.deepEqual(savedRoom.params.entrance, { x: 63, y: 0 });
  assert.ok(saved.objects.some(prop => prop.kind === 'door' && prop.x === 63 && prop.y === 0));
  control('undo').onclick();
  await control('save').onclick();
  assert.deepEqual(saved.generators, beforeRoom.generators);
  assert.deepEqual(saved.objects, beforeRoom.objects);
  control('redo').onclick();
  await control('save').onclick();
  await reopen();
  control('path-saved').value = savedRoom.id;
  control('path-saved').onchange();
  assert.equal(control('room-floor').value, 'wood');
  assert.equal(control('path-preview').disabled, false);
  control('room-floor').value = 'stone';
  control('room-floor').oninput();
  control('path-preview').onclick();
  control('path-apply').onclick();
  await control('save').onclick();
  assert.equal(saved.generators.at(-1).id, savedRoom.id);
  assert.equal(world.get(saved.chunks, 63, 3), 'stone');
  control('path-clear-points').onclick();
  assert.equal(control('room-entry-info').textContent, 'Вход не выбран');

});

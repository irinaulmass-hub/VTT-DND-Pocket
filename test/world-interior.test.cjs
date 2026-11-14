const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const map = require('../remote/world-model');

test('rotated low furniture blocks exactly its footprint, leaving sight and stairs usable', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-interior-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = name => path.join(dir, name);
  const store = require('../world-store')(file);
  const movement = require('../world-movement')(store, file);
  const layout = { id: '10000000-0000-0000-0000-000000000004', name: 'Furniture', revision: 1, chunks: {}, objects: [] };
  const point = (x, y) => ({ ...map.sceneScope(layout), x, y });
  for (const kind of ['table', 'bench', 'bed', 'stairs']) for (let turn = 0; turn < 4; turn++) {
    const prop = { id: kind, kind, x: -1, y: -1, turn };
    layout.objects = [prop];
    const bounds = map.cellBounds(prop), center = map.footprint(prop);
    const expected = map.props[kind].slice(1);
    if (turn % 2) expected.reverse();
    assert.deepEqual([bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1], expected);
    assert.deepEqual([center.width, center.height], expected);
    store.writeDraft(layout);
    store.writePublished(layout.id, { map: layout, revision: 1, fog: false, seen: {}, tokens: [] });
    for (let y = bounds.top - 1; y <= bounds.bottom + 1; y++) for (let x = bounds.left - 1; x <= bounds.right + 1; x++) {
      const occupied = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      const allowed = kind === 'stairs' || !occupied;
      assert.equal(movement.canStep(point(x, y)), allowed, `${kind} turn=${turn} at ${x},${y}`);
      assert.equal(movement.canStep(point(x, y), false), allowed);
    }
    const origin = point(bounds.left - 1, bounds.top);
    assert.ok(movement.visibleCells(origin, [prop], new Set()).some(cell =>
      cell.x === bounds.right + 1 && cell.y === bounds.top), 'low furniture never hides cells behind it');
  }
  layout.chunks = {}; map.set(layout.chunks, -1, -1, 'water');
  store.writeDraft(layout);
  assert.equal(movement.canStep(point(-1, -1), false), false, 'stairs do not become a water bridge');
});

test('interior art has balanced transforms, rotated world-space shadows and a cell-bounded glow', () => {
  const calls = [], states = [];
  let state = { alpha: 1 };
  const ctx = {
    save() { states.push({ ...state }); }, restore() { state = states.pop(); assert.ok(state); },
    translate(...args) { calls.push(['translate', ...args]); },
    rotate(angle) { calls.push(['rotate', angle]); }, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, strokeRect() {},
    fillRect(...args) { calls.push(['rect', ...args]); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    createRadialGradient(...args) {
      calls.push(['glow', ...args]); return { addColorStop() {} };
    },
    set globalAlpha(value) { state.alpha = value; }, get globalAlpha() { return state.alpha; },
  };
  const window = {};
  const globals = { window, WorldMap: map };
  for (const file of ['world-decor.js', 'world-art.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../remote', file), 'utf8'), globals);
  }
  for (const kind of ['table', 'bench', 'bed', 'stairs', 'torch', 'brazier']) for (let turn = 0; turn < 4; turn++) {
    calls.length = 0;
    window.WorldArt.paintProp(ctx, { id: kind, kind, x: 0, y: 0, turn, hidden: true }, true);
    assert.equal(states.length, 0);
    assert.equal(ctx.globalAlpha, 1, 'hidden props must not dim the next object');
    if (map.furnitureKinds.has(kind)) {
      const rotate = calls.findIndex(call => call[0] === 'rotate');
      assert.ok(calls.slice(0, rotate).some(call => call[0] === 'rect'), 'shadow is painted before rotation');
    }
    const glows = calls.filter(call => call[0] === 'glow');
    assert.equal(glows.length, ['torch', 'brazier'].includes(kind) ? 1 : 0);
    for (const glow of glows) assert.ok(glow[6] <= .5, 'glow stays within the source cell');
  }
});

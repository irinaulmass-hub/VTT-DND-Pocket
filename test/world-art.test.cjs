const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const world = require('../remote/world-model');

function loadArt() {
  const tiles = [];
  const document = {
    createElement() {
      let scale = 1;
      const stack = [];
      const fills = [];
      const context = {
        fills, curves: 0,
        scale(x) { scale *= x; },
        save() { stack.push(scale); },
        restore() { scale = stack.pop(); },
        setTransform(x) { scale = x; },
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
        quadraticCurveTo() { this.curves++; },
        fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
        getImageData() {
          const data = new Uint8ClampedArray(64 * 64 * 4);
          for (let i = 0; i < data.length; i += 4) data.set([66, 108, 113, 255], i);
          return { data };
        },
        putImageData(image) {
          assert.equal(scale, 1, 'image pixels are written in device coordinates');
          this.image = image.data;
        },
      };
      tiles.push(context);
      return { getContext: () => context };
    },
  };
  const globals = { WorldMap: world, document, window: {} };
  const file = path.join(__dirname, '../remote/world-art.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), globals);
  return { paintTile: globals.window.WorldArt.paintTile, tiles };
}

test('shore pixels transition from the bank to unchanged deep water', () => {
  const { paintTile, tiles } = loadArt();
  const chunks = {};
  for (let y = -1; y <= 1; y++) {
    world.set(chunks, -1, y, 'grass');
    world.set(chunks, 0, y, 'water');
    world.set(chunks, 1, y, 'water');
  }
  paintTile({ drawImage() {} }, chunks, 0, 0, 'water');
  const pixel = x => Array.from(tiles[0].image.subarray((32 * 64 + x) * 4, (32 * 64 + x) * 4 + 4));
  assert.deepEqual(pixel(40), [66, 108, 113, 255]);
  assert.notDeepEqual(pixel(1), pixel(40));
  assert.notDeepEqual(pixel(9), pixel(1));
});

test('a road rounds a bend and fills the interior corners of a wide junction', () => {
  const { paintTile, tiles } = loadArt();
  const chunks = {};
  for (const [x, y] of [[0, 0], [0, -1], [1, 0]]) world.set(chunks, x, y, 'path');
  const canvas = { drawImage() {} };
  paintTile(canvas, chunks, 0, 0, 'path');
  assert.equal(tiles[0].curves, 3, 'each visual layer follows the bend');

  world.set(chunks, 1, -1, 'path');
  paintTile(canvas, chunks, 0, 0, 'path');
  assert.ok(tiles[1].fills.some(rect => rect.x > 0 && rect.y === 0 &&
    rect.width >= .5 && rect.height >= .5 && rect.color === '#c3a779'));
});

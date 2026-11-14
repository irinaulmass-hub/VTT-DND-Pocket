const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const client = fs.readFileSync(path.join(__dirname, '../remote/world-table.js'), 'utf8');

function tableClient() {
  const events = new Map();
  const drawing = [];
  const requests = [];
  const actions = [];
  const overlay = { style: { display: 'none' } };
  const controls = { button: {}, input: {}, canvas: {} };
  const panel = { querySelector: key => controls[key] };
  const window = {
    WorldMap: { size: 32 },
    addEventListener: (event, handler) => events.set(event, handler),
  };
  const document = {
    documentElement: { hasAttribute: () => true, toggleAttribute() {} },
    body: { append() {} },
    getElementById: () => overlay,
    createElement: () => panel,
    addEventListener() {},
  };
  let poll, timer;
  vm.runInNewContext(client, {
    window, document, AbortSignal, ws: null, WebSocket: { OPEN: 1 },
    wsSend: action => actions.push(action.action),
    stopAudio() {},
    handleMessage(message) {
      events.get('table-presentation-change')();
      overlay.style.display = message.active ? 'block' : 'none';
    },
    createWorldView: () => ({
      party() {}, setCamera() {}, data: data => drawing.push(data),
      bounds: () => ({ left: 0, right: 1, top: 0, bottom: 1 }),
    }),
    setTimeout: callback => { timer = callback; },
    clearTimeout: () => { timer = undefined; },
    setInterval: callback => { poll = callback; },
    fetch: url => new Promise(resolve => {
      requests.push({
        url,
        reply: async (data, ok = true) => {
          resolve({ ok, json: async () => data });
          await new Promise(setImmediate);
        },
      });
    }),
  });
  return {
    actions, drawing, overlay, panel,
    status() {
      const request = requests.shift();
      assert.equal(request?.url, '/api/worlds/table/status');
      return request;
    },
    chunks() {
      assert.ok(timer, 'there is a scheduled chunk request');
      const load = timer;
      timer = undefined;
      load();
      const request = requests.shift();
      assert.match(request?.url, /^\/api\/worlds\/table\?chunks=/);
      return request;
    },
    ws: update => events.get('world-update')({ detail: update }),
    presentation: () => events.get('table-presentation-change')(),
    poll: () => { poll(); },
    scheduled: () => !!timer,
  };
}

const update = (id, generation, publication, exploration) => ({
  id, version: { generation, publication, exploration },
  frame: { x: 0, y: 0, scale: 24, serial: 0 },
  blackout: false,
});

test('TV recovers a failed chunk load and a missed WebSocket update from HTTP status', async () => {
  const table = tableClient();
  const first = update('world', 1, 1, 0);
  await table.status().reply(first);
  await table.chunks().reply(null, false);
  assert.equal(table.drawing.some(data => data.id), false);

  table.poll();
  await table.status().reply(first);
  await table.chunks().reply(first);
  assert.equal(table.drawing.at(-1), first);

  const missed = update('world', 1, 1, 2);
  table.poll();
  await table.status().reply(missed);
  await table.chunks().reply(missed);
  assert.equal(table.drawing.at(-1), missed);
  table.ws(first);
  assert.equal(table.scheduled(), false);
});

test('TV ignores delayed HTTP chunks and status when newer world versions arrive', async () => {
  const table = tableClient();
  const first = update('world', 1, 1, 0);
  await table.status().reply(first);
  const lateChunks = table.chunks();

  const newer = update('world', 1, 1, 1);
  table.ws(newer);
  await lateChunks.reply(first);
  assert.equal(table.drawing.some(data => data.id), false);
  await table.chunks().reply(newer);

  table.poll();
  const lateStatus = table.status();
  const other = update('other-world', 2, 1, 0);
  table.ws(other);
  await lateStatus.reply(newer);
  const otherChunks = table.chunks();

  table.ws(update(null, 3, 0, 0));
  await otherChunks.reply(other);
  assert.equal(table.drawing.at(-1).id, undefined);
  assert.equal(table.panel.hidden, true);
  assert.deepEqual(table.actions, ['request-sync']);
});

test('TV reconciles a newer chunk response and protects blackout from stale polling', async () => {
  const table = tableClient();
  const first = update('world', 1, 1, 0);
  await table.status().reply(first);
  const newer = update('world', 1, 2, 0);
  await table.chunks().reply(newer);
  assert.equal(table.drawing.some(data => data.id), false);

  const lateStatus = table.status();
  table.presentation();
  table.overlay.style.display = 'block';
  await lateStatus.reply(newer);
  assert.equal(table.overlay.style.display, 'block');
  await table.chunks().reply(newer);
  assert.equal(table.drawing.at(-1), newer);

  table.poll();
  await table.status().reply(newer);
  assert.equal(table.overlay.style.display, 'none');
  assert.equal(table.scheduled(), false);
});

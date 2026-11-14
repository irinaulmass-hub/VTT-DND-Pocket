const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../remote/sheet.js'), 'utf8');

test('the phone keeps the latest personal discoveries and drops delayed data after revocation', async () => {
  const nodes = new Map();
  const handlers = new Map();
  const requests = [];
  const settings = new Map([['player-invitation', 'invite-for-hero']]);
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { close() {} });
    return nodes.get(selector);
  };
  let socket, reconnect;
  vm.runInNewContext(script, {
    AbortSignal, URLSearchParams,
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    location: { pathname: '/player', search: '', hash: '', protocol: 'http:', host: 'localhost' },
    history: { replaceState() {} },
    localStorage: { getItem: key => settings.get(key), setItem: (k, v) => settings.set(k, v), removeItem: key => settings.delete(key) },
    window: { WorldMap: require('../remote/world-model'), scrollTo() {} },
    WebSocket: class {
      constructor(url) {
        assert.match(url, /\/ws\?view=player$/);
        socket = this;
      }
      close() { this.onclose(); }
    },
    setTimeout: callback => { reconnect = callback; },
    fetch: (url, options) => new Promise(resolve => {
      assert.equal(url, '/api/player-discoveries');
      assert.equal(options.headers.Authorization, 'Bearer invite-for-hero');
      requests.push(async discoveries => {
        resolve({ ok: true, status: 200, json: async () => ({ discoveries }) });
        await new Promise(setImmediate);
      });
    }),
  });
  const send = data => socket.onmessage({ data: JSON.stringify(data) });
  const characters = { type: 'CHARACTERS_UPDATE', characters: [{ id: 'hero', name: 'Разведчик' }] };
  const change = characterId => send({ type: 'PLAYER_DISCOVERIES_CHANGED', characterId });
  const discovery = (mapName, x) => ({ mapName, object: { kind: 'torch', x, y: 3 } });
  const markup = () => node('#content').innerHTML;

  send(characters);
  const initial = requests.shift();
  handlers.get('click')({ target: { closest: () => ({ dataset: { tab: 'travel' }, hasAttribute: () => false }) } });
  await requests.shift()([discovery('<Пещера>', 5)]);
  assert.match(markup(), /&lt;Пещера&gt; · \(5, 3\)/);
  await initial([discovery('Старая запись', 0)]);
  assert.doesNotMatch(markup(), /Старая запись/);

  change('other-hero');
  assert.equal(requests.length, 0);
  change('hero');
  await requests.shift()([discovery('Новое место', 7)]);
  assert.match(markup(), /Новое место · \(7, 3\)/);

  socket.onclose();
  reconnect();
  send(characters);
  const afterReconnect = requests.shift();
  assert.ok(afterReconnect, 'reconnecting reads the current journal again');
  send({ type: 'ACCESS_REVOKED' });
  await afterReconnect([discovery('Закрытое место', 9)]);
  assert.doesNotMatch(markup(), /Закрытое место|Новое место/);
  assert.equal(settings.has('player-invitation'), false);
  assert.equal(node('nav').hidden, true);
});

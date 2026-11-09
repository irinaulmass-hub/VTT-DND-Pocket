const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const register = require('../player-access');

test('master assignments persist, rotate, revoke and stay inside their campaign', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-access-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = express();
  let characters = [{ id: 'hero' }];
  const dependencies = {
    express,
    requireDm(req, res, next) {
      if (req.headers.authorization !== 'test-master') return res.sendStatus(401);
      next();
    },
    gameFile: name => path.join(dir, name),
    loadCharacters: () => ({ characters }),
  };
  const access = register(app, dependencies);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/player-access';
  const issue = (characterId, authorization = 'test-master') => fetch(url, {
    method: 'POST',
    headers: { authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
  });
  assert.equal((await issue('hero', 'guest')).status, 401);
  assert.equal((await issue('foreign')).status, 404);
  const response = await issue('hero');
  assert.equal(response.status, 201);
  const first = await response.json();
  assert.equal(access.resolve(first.token), 'hero');
  assert.equal(fs.readFileSync(path.join(dir, 'player-access.json'), 'utf8').includes(first.token), false);
  const restarted = register(express(), dependencies);
  assert.equal(restarted.resolve(first.token), 'hero');
  const otherDir = path.join(dir, 'other');
  fs.mkdirSync(otherDir);
  const other = register(express(), { ...dependencies, gameFile: name => path.join(otherDir, name) });
  assert.equal(other.resolve(first.token), null);
  const second = await (await issue('hero')).json();
  assert.equal(access.resolve(first.token), null);
  assert.equal(access.resolve(second.token), 'hero');
  const listing = await (await fetch(url, { headers: { authorization: 'test-master' } })).json();
  assert.deepEqual(listing.assignments, [{ characterId: 'hero', createdAt: second.createdAt }]);
  characters = [];
  assert.equal(access.resolve(second.token), null);
  characters = [{ id: 'hero' }];
  assert.equal((await fetch(url + '/hero', { method: 'DELETE', headers: { authorization: 'test-master' } })).status, 200);
  assert.equal(access.resolve(second.token), null);
  assert.equal(restarted.resolve(second.token), null);
});

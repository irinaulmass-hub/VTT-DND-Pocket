const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/browser-qa.cjs');

async function freePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('the browser fixture isolates data, uses real master login, proxies WS, and resumes after restart', async t => {
  const upstreamPort = await freePort();
  let child, exited, dataDir;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (exited) await exited;
  };
  t.after(async () => { await stop(); if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true }); });
  const start = resume => new Promise((resolve, reject) => {
    child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env,
      QA_PORT: '0', QA_SERVER_PORT: String(upstreamPort), QA_RESUME_DATA_DIR: resume || '',
      DATA_DIR: path.join(root, 'must-not-use-campaign'),
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    exited = new Promise(resolveExit => child.once('exit', resolveExit));
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Fixture did not start: ' + errors)), 10000);
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Fixture exited: ' + errors)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const url = output.match(/fixture: (http:\/\/127\.0\.0\.1:\d+)\//);
      const dir = output.match(/Test DATA_DIR: (.+)\n/);
      if (url && dir) { clearTimeout(timer); dataDir = dir[1]; resolve(url[1]); }
    });
  });
  let base = await start();
  assert.equal(path.dirname(dataDir), os.tmpdir());
  assert.match(path.basename(dataDir), /^vtt-browser-qa-/);
  const list = await fetch(base + '/api/worlds').then(r => r.json());
  assert.equal(list.worlds[0].name, 'Старый рецепт · F1–F3');
  const legacy = await fetch(base + '/api/worlds/' + list.worlds[0].id).then(r => r.json());
  assert.equal(legacy.generators[0].state, undefined);
  assert.equal((await fetch('http://127.0.0.1:' + upstreamPort + '/api/worlds', { redirect: 'manual' })).status, 302,
    'the underlying application still requires authentication');
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
  t.after(() => ws.terminate());
  const roster = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture WS timeout')), 4000);
    ws.on('error', error => { clearTimeout(timer); reject(error); });
    ws.on('open', () => ws.send(JSON.stringify({ action: 'request-characters' })));
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'CHARACTERS_UPDATE') { clearTimeout(timer); resolve(message.characters); }
    });
  });
  assert.ok(roster.length > 0, 'WS uses the disposable master session');
  ws.terminate();
  const created = await fetch(base + '/api/worlds', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Fixture persistence' }),
  }).then(r => r.json());
  await stop();
  const originalDir = dataDir;
  base = await start(originalDir);
  assert.equal(dataDir, originalDir);
  assert.equal((await fetch(base + '/api/worlds/' + created.id).then(r => r.json())).name, 'Fixture persistence');
  assert.deepEqual(await fetch(base + '/api/world-generator-templates?game=qa-other').then(r => r.json()),
    { revision: 0, templates: [] });
});

test('the browser fixture rejects an ordinary directory as a resume target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-protected-test-'));
  const sentinel = path.join(dir, 'campaign.json');
  fs.writeFileSync(sentinel, 'keep');
  try {
    const result = spawnSync(process.execPath, [script], { env: { ...process.env, QA_RESUME_DATA_DIR: dir }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
    assert.deepEqual(fs.readdirSync(dir), ['campaign.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

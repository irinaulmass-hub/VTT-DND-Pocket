const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

async function prepareInstall(dir) {
  await fs.mkdir(dir);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const modules = entries.filter(entry => entry.isFile() && entry.name.endsWith('.js'));
  for (const name of [...modules.map(entry => entry.name), 'remote', 'resources', 'seeds']) {
    await fs.cp(path.join(root, name), path.join(dir, name), { recursive: true });
  }
  await fs.symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
}

async function availablePort() {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function withServer(dir, dataDir, run) {
  const port = await availablePort();
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DM_PASSWORD: 'backup-test-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  async function request(url, options) {
    return fetch(base + url, { redirect: 'manual', signal: AbortSignal.timeout(3000), ...options });
  }

  try {
    for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt++) {
      if (output.includes('D&D Remote Server running!')) break;
      await delay(50);
    }
    assert.match(output, /D&D Remote Server running!/, 'Server startup failed');
    assert.equal((await request('/api/health')).status, 200);

    const login = await request('/dm-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=backup-test-only',
    });
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';')[0];

    await run(async (url, { method = 'GET', body, status = 200 } = {}) => {
      const response = await request(url, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.status, status, method + ' ' + url);
      return response;
    });
  } finally {
    child.kill();
    await closed;
  }
}

test('a cold backup restores a campaign, its editable map, image, and published world', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vtt-backup-'));
  try {
    const source = path.join(tmp, 'source');
    const target = path.join(tmp, 'restored');
    const sourceData = path.join(tmp, 'source-data');
    const targetData = path.join(tmp, 'restored-data');
    const backup = path.join(tmp, 'backup');
    await prepareInstall(source);
    await prepareInstall(target);

    const image = await fs.readFile(path.join(source, 'resources', 'goblin-wars', 'maps', 'winden-farm.png'));
    const draft = { cols: 4, rows: 3, objects: [{ id: 'test-gate', row: 1, col: 2 }] };
    const note = 'Проверка восстановления кампании';
    let campaign, hero, mapUrl, scenes, world, live;

    await withServer(source, sourceData, async api => {
      campaign = await (await api('/api/campaigns', { method: 'POST', body: { name: 'Кампания для восстановления' } })).json();
      const query = '?game=' + campaign.id;
      hero = await (await api('/api/characters' + query, { method: 'POST', body: { name: 'Следопыт', maxHp: 23 } })).json();
      await api('/api/notes' + query, { method: 'PUT', body: { text: note, revision: 0 } });

      const saved = await (await api('/api/map-builder/save' + query, {
        method: 'POST',
        body: { filename: 'backup-map.png', dataUrl: 'data:image/png;base64,' + image.toString('base64'), state: draft },
      })).json();
      mapUrl = saved.webPath;
      scenes = [{ id: 'backup-scene', label: 'Ферма', views: [{ id: 'backup-view', image: mapUrl }] }];
      await api('/api/scenes' + query, { method: 'POST', body: { scenes } });

      world = await (await api('/api/worlds' + query, {
        method: 'POST', status: 201, body: { name: 'Мир для восстановления', sample: true },
      })).json();
      await api('/api/worlds/' + world.id + '/publish' + query, {
        method: 'POST', body: { revision: world.revision, fog: true },
      });
      await api('/api/worlds/live/change' + query, {
        method: 'POST', body: { id: world.id, action: 'token', characterId: hero.id, x: 0, y: 0 },
      });
      live = await (await api('/api/worlds/live' + query)).json();
    });

    const relativeImage = path.join('public', mapUrl.slice(1));
    await assert.rejects(fs.access(targetData), { code: 'ENOENT' });
    await assert.rejects(fs.access(path.join(target, relativeImage)), { code: 'ENOENT' });

    // Snapshot only the two data roots after the source process exits.
    await fs.mkdir(backup);
    await fs.cp(sourceData, path.join(backup, 'data'), { recursive: true });
    await fs.cp(path.join(source, 'public', 'assets'), path.join(backup, 'assets'), { recursive: true });
    await fs.cp(path.join(backup, 'data'), targetData, { recursive: true });
    await fs.cp(path.join(backup, 'assets'), path.join(target, 'public', 'assets'), { recursive: true });

    await withServer(target, targetData, async api => {
      const query = '?game=' + campaign.id;
      assert.ok((await (await api('/api/campaigns')).json()).campaigns.some(entry => entry.id === campaign.id));
      assert.deepEqual((await (await api('/api/characters' + query)).json()).characters, [hero]);
      assert.equal((await (await api('/api/notes' + query)).json()).text, note);
      assert.deepEqual((await (await api('/api/scenes' + query)).json()).scenes, scenes.map(scene => ({ ...scene, legacyExample: false })));

      const draftName = path.basename(mapUrl, '.png');
      assert.deepEqual(await (await api('/api/map-builder/state' + query + '&name=' + draftName)).json(), draft);
      assert.deepEqual(Buffer.from(await (await api(mapUrl)).arrayBuffer()), image);
      assert.deepEqual(await (await api('/api/worlds/' + world.id + query)).json(), world);
      assert.deepEqual(await (await api('/api/worlds/live' + query)).json(), live);
      const table = await (await api('/api/worlds/table' + query + '&chunks=0%2C0')).json();
      assert.equal(table.fog, true);
      assert.equal(table.seen['0,0']['0'], true);
      assert.deepEqual(table.tokens, [{ id: hero.id, name: hero.name, x: 0, y: 0 }]);
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

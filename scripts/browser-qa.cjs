// Disposable master-only UI fixture. Never point this proxy at real campaign data.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.QA_PORT || 3099);
const upstreamPort = Number(process.env.QA_SERVER_PORT || 3100);
if (![port, upstreamPort].every(value => Number.isInteger(value) && value >= 0 && value <= 65535) ||
    !upstreamPort || port === upstreamPort) throw new Error('Choose separate valid fixture ports');
const resume = process.env.QA_RESUME_DATA_DIR;
if (resume && (path.dirname(path.resolve(resume)) !== os.tmpdir() ||
    !/^vtt-browser-qa-[A-Za-z0-9]+$/.test(path.basename(resume)) || !fs.lstatSync(resume).isDirectory())) {
  throw new Error('Resume accepts only a temporary vtt-browser-qa directory');
}
const dataDir = resume ? path.resolve(resume) : fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-browser-qa-'));
const registry = path.join(dataDir, 'campaigns.json');
if (!fs.existsSync(registry)) fs.writeFileSync(registry, JSON.stringify([
  { id: 'default', name: 'Текущая игра' }, { id: 'qa-other', name: 'QA · Другая кампания' },
]));
const legacyId = '10000000-0000-0000-0000-000000000000';
const legacyFile = path.join(dataDir, 'worlds', legacyId + '.json');
if (!fs.existsSync(legacyFile) && !fs.existsSync(legacyFile.replace('.json', '-chunks.json'))) {
  const recipe = { id: 'legacy-road', kind: 'path', version: 1, seed: 1,
    params: { terrain: 'path', width: 3, points: [{ x: -4, y: 0 }, { x: 4, y: 0 }] } };
  const { generatePath } = require('../remote/world-generators');
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, JSON.stringify({ id: legacyId, name: 'Старый рецепт · F1–F3', revision: 0,
    chunks: generatePath(recipe).chunks, objects: [], generators: [recipe] }));
}
// Ready-to-edit building and interior fixtures, created only in this disposable DATA_DIR.
const qaStore = require('../world-store')(name => path.join(dataDir, name));
const exteriorId = '20000000-0000-0000-0000-000000000001';
if (!qaStore.readDraft(exteriorId, [])) {
  const { sample } = require('../remote/world-model');
  const { generationChange } = require('../remote/world-generators');
  qaStore.writeDraft({ id: exteriorId, name: 'Привязка · Снаружи', revision: 0, ...sample() });
  const insideId = '20000000-0000-0000-0000-000000000002';
  for (const [id, name, floor, parent] of [
    [insideId, 'Привязка · Интерьер', 'wood', {}],
    ['20000000-0000-0000-0000-000000000003', 'Привязка · Подвал', 'stone', { parentSceneId: insideId, elevation: -1 }],
  ]) {
    const map = { id, name, revision: 0, parentWorldId: exteriorId, ...parent, chunks: {}, objects: [] };
    const change = generationChange({ id: 'qa-room-' + id, kind: 'room', version: 1, seed: 7,
      params: { floor, points: [{ x:0,y:0 }, { x:6,y:0 }, { x:6,y:6 }, { x:0,y:6 }], entrance: { x:3,y:0 } } }, map);
    qaStore.writeDraft({ ...map, chunks: change.chunks, objects: change.objects.after, generators: change.generators.after });
  }
}
const interiorId = '30000000-0000-0000-0000-000000000001';
if (!qaStore.readDraft(interiorId, [])) {
  const { generationChange } = require('../remote/world-generators');
  const room = { id: interiorId, name: 'Интерьер · Мебель и свет', revision: 0,
    parentWorldId: exteriorId, chunks: {}, objects: [] };
  const change = generationChange({ id: 'qa-furnished-room', kind: 'room', version: 1, seed: 17,
    params: { floor: 'wood', points: [{ x:-7,y:-5 }, { x:7,y:-5 }, { x:7,y:5 }, { x:-7,y:5 }],
      entrance: { x:0,y:5 } } }, room);
  const furniture = [
    { id:'qa-stairs',kind:'stairs',x:-4,y:-2,turn:0 },
    { id:'qa-bed',kind:'bed',x:4,y:-2,turn:0 },
    { id:'qa-bed-turned',kind:'bed',x:4,y:2,turn:1 },
    { id:'qa-table',kind:'table',x:-1,y:0,turn:0 },
    { id:'qa-bench',kind:'bench',x:-1,y:2,turn:0 },
    { id:'qa-chest',kind:'chest',x:4,y:4,turn:0 },
    { id:'qa-torch',kind:'torch',x:-5,y:3,turn:0 },
    { id:'qa-torch-east',kind:'torch',x:4,y:0,turn:0 },
    { id:'qa-brazier',kind:'brazier',x:-4,y:-4,turn:0 },
  ];
  qaStore.writeDraft({ ...room, chunks: change.chunks, objects: [...change.objects.after,...furniture],
    generators: change.generators.after });
}
// Border scene for validating chunk selection and the real master/TV rendering.
const borderId = '40000000-0000-0000-0000-000000000001';
if (!qaStore.readDraft(borderId, [])) {
  const { set } = require('../remote/world-model');
  const border = { id:borderId, name:'Граница чанков · Таверна и амбар', revision:0, chunks:{}, objects:[
    {id:'border-tavern',kind:'tavern',x:-1,y:2,turn:0},
    {id:'border-barn',kind:'barn',x:1,y:-5,turn:1},
    {id:'border-house',kind:'house',x:-10,y:-5,turn:0},
    {id:'border-bridge',kind:'bridge',x:-10,y:5,turn:0},
    {id:'border-wall',kind:'wall',x:-1,y:7,turn:0},
    {id:'border-tree',kind:'tree',x:-7,y:-1,turn:0},
    {id:'border-barrel',kind:'barrel',x:3,y:3,turn:0},
    {id:'border-secret',kind:'chest',x:9,y:5,turn:0,hidden:true},
  ] };
  for(let y=-10;y<=11;y++)for(let x=-17;x<=16;x++) {
    set(border.chunks,x,y,Math.abs(x+10)<=3&&y>=3&&y<=7?'water':
      (y===7||x===6)?'path':'grass');
  }
  qaStore.writeDraft(border);
}
const visualId = '40000000-0000-0000-0000-000000000002';
if (!qaStore.readDraft(visualId, [])) {
  const { set } = require('../remote/world-model');
  const visual = { ...qaStore.readDraft(borderId), id:visualId, name:'Граница чанков · Выступы крыш и крон' };
  visual.objects.push(
    {id:'visual-crown',kind:'tree',x:-1,y:-1,turn:0},
    {id:'visual-roof',kind:'house',x:-2,y:9,turn:0},
    {id:'visual-shadow',kind:'bridge',x:-3,y:-9,turn:0},
  );
  for(let y=-10;y<=-8;y++)for(let x=-5;x<=1;x++)set(visual.chunks,x,y,'water');
  qaStore.writeDraft(visual);
}
const password = randomBytes(32).toString('hex');
const upstream = spawn(process.execPath, ['server.js'], {
  cwd: root, env: { ...process.env, PORT: String(upstreamPort), DATA_DIR: dataDir, DM_PASSWORD: password },
  stdio: ['ignore', 'ignore', 'inherit'],
});
let session, proxy;
const sockets = new Set();
function stop() {
  for (const socket of sockets) socket.destroy();
  proxy?.close();
  upstream.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
upstream.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
upstream.on('exit', () => { proxy?.close(); for (const socket of sockets) socket.destroy(); });

const login = () => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: '/dm-login', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 500 }, res => {
    res.resume();
    const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
    if (res.statusCode !== 302 || !cookie) return reject(new Error('Fixture login failed'));
    resolve(cookie);
  });
  req.on('error', reject);
  req.on('timeout', () => req.destroy(new Error('Fixture startup timeout')));
  req.end(new URLSearchParams({ password }).toString());
});

(async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (upstream.exitCode !== null || upstream.signalCode !== null) throw new Error('Fixture server exited');
    try { session = await login(); break; } catch (error) {
      if (attempt === 99) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const options = req => ({ hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method,
    headers: { ...req.headers, cookie: session } });
  proxy = http.createServer((req, res) => {
    const request = http.request(options(req), response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    request.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(request);
  });
  proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  proxy.on('upgrade', (req, socket, head) => {
    const request = http.request(options(req));
    request.on('upgrade', (response, target, targetHead) => {
      sockets.add(target); target.on('close', () => sockets.delete(target));
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(response.headers).map(([name, value]) => name + ': ' + value).join('\r\n') + '\r\n\r\n');
      if (head.length) target.write(head);
      if (targetHead.length) socket.write(targetHead);
      socket.pipe(target).pipe(socket);
      socket.on('error', () => target.destroy());
      target.on('error', () => socket.destroy());
    });
    request.on('response', () => socket.destroy());
    request.on('error', () => socket.destroy());
    request.end();
  });
  proxy.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
  proxy.listen(port, '127.0.0.1', () => {
    console.log('Disposable master-only browser fixture: http://127.0.0.1:' + proxy.address().port + '/?view=maps');
    console.log('Test DATA_DIR:', dataDir);
    console.log('Use the normal server for authentication and role tests. Ctrl+C stops this fixture.');
  });
})().catch(error => { console.error(error.message); process.exitCode = 1; stop(); });

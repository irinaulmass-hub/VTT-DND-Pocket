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

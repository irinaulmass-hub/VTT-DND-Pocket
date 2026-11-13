// Loaded only by world-benchmark.cjs in an isolated temporary campaign.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { performance } = require('node:perf_hooks');

const dataDir = path.resolve(process.env.DATA_DIR || '.');
if (process.env.VTT_WORLD_BENCHMARK !== '1' || path.dirname(dataDir) !== os.tmpdir() ||
    !/^vtt-world-benchmark-[A-Za-z0-9]+$/.test(path.basename(dataDir)) || !process.send) {
  throw Error('Benchmark probe requires an isolated temporary campaign and an IPC parent');
}
let active;
const inside = file => typeof file === 'string' && path.resolve(file).startsWith(dataDir + path.sep);
const bytes = value => typeof value === 'string' ? Buffer.byteLength(value) : value?.byteLength || 0;
const read = fs.readFileSync, write = fs.writeFileSync;
fs.readFileSync = function(file, ...args) {
  const result = read.call(this, file, ...args);
  if (active && inside(file)) { active.reads++; active.readBytes += bytes(result); active.files.add(path.resolve(file)); }
  return result;
};
fs.writeFileSync = function(file, value, ...args) {
  const result = write.call(this, file, value, ...args);
  if (active && inside(file)) { active.writes++; active.writeBytes += bytes(value); }
  return result;
};
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function(event, ...args) {
  if (event === 'request') {
    const [req, res] = args, id = req.headers['x-vtt-benchmark-id'];
    if (typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id)) {
      if (active) throw Error('Benchmark requests must run sequentially');
      const item = { id, start: performance.now(), cpu: process.cpuUsage(), memory: process.memoryUsage(),
        reads: 0, readBytes: 0, writes: 0, writeBytes: 0, files: new Set() };
      active = item;
      res.once('finish', () => {
        const cpu = process.cpuUsage(item.cpu), memory = process.memoryUsage();
        if (active === item) active = undefined;
        process.send({ type:'world-benchmark', id, status:res.statusCode,
          serverMs:performance.now()-item.start, cpuMs:(cpu.user+cpu.system)/1000,
          reads:item.reads, uniqueReadFiles:item.files.size, readBytes:item.readBytes,
          writes:item.writes, writeBytes:item.writeBytes,
          heapBeforeBytes:item.memory.heapUsed, heapAfterBytes:memory.heapUsed, rssBytes:memory.rss,
          processPeakRssBytes:process.resourceUsage().maxRSS*1024 });
      });
    }
  }
  return emit.call(this, event, ...args);
};

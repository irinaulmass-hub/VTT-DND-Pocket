const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/world-benchmark.cjs');

test('world benchmark measures real HTTP operations in isolated data and never overwrites a report', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-benchmark-report-test-'));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  const sentinel = path.join(dir, 'campaign.json'), output = path.join(dir, 'report.json');
  fs.writeFileSync(sentinel, 'user data stays intact');
  const args = [script,'--profile','small','--samples','1','--output',output,'--ref','9eadec84e817c5cea80ea973931dc8a49407b533'];
  const run = () => spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:20000,
    env:{...process.env,DATA_DIR:dir}});
  const result = run();
  assert.equal(result.status,0,result.stderr);
  const bytes = fs.readFileSync(output), report = JSON.parse(bytes);
  assert.equal(report.schemaVersion,1);
  assert.equal(report.results.length,1);
  const measured = report.results[0];
  assert.equal(measured.status,'verified');
  assert.equal(measured.dimensions.objects,8);assert.equal(measured.dimensions.tiles,2048);
  assert.ok(measured.dimensions.generatorStateJsonBytes>0);
  assert.deepEqual(Object.keys(measured.summary).sort(),['district_preview','full_load','full_save','viewport_read']);
  for(const row of measured.rows) {
    assert.equal(row.status,200);
    for(const key of ['wallMs','serverMs','cpuMs','reads','readBytes','writes','writeBytes','heapAfterBytes','rssBytes']) {
      assert.ok(Number.isFinite(row[key]) && row[key]>=0,key);
    }
    assert.ok(row.processPeakRssBytes>0);
  }
  assert.equal(measured.rows.length,4,'warm-up requests are excluded');
  assert.ok(measured.summary.full_save.writeBytes.max>0);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'user data stays intact');
  assert.deepEqual(fs.readdirSync(dir).sort(),['campaign.json','report.json']);
  const duplicate = run();
  assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/EEXIST/);
  assert.deepEqual(fs.readFileSync(output),bytes,'an existing baseline is preserved');
});

test('world benchmark rejects unknown profiles and invalid sample counts before running', () => {
  for(const args of [['--profile','missing'],['--samples','0'],['--samples','11'],['--ref','main'],['--unknown','x']]) {
    const result=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:5000});
    assert.notEqual(result.status,0);
    assert.doesNotMatch(result.stderr,/Measuring/);
  }
});

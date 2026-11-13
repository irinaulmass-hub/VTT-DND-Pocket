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
  assert.equal(report.method.previewFormat,'delta-v1');
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
    assert.equal(row.stages,undefined,'stage instrumentation is opt-in');
  }
  assert.equal(measured.rows.length,4,'warm-up requests are excluded');
  assert.ok(measured.summary.full_save.writeBytes.max>0);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'user data stays intact');
  assert.deepEqual(fs.readdirSync(dir).sort(),['campaign.json','report.json']);
  const duplicate = run();
  assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/EEXIST/);
  assert.deepEqual(fs.readFileSync(output),bytes,'an existing baseline is preserved');
  const compactArgs=[script,'--profile','small','--samples','1','--save-mode','district-apply','--history-mode','delta-v1'];
  const compact=spawnSync(process.execPath,[...compactArgs,'--stages','on'],
    {cwd:root,encoding:'utf8',timeout:20000,env:{...process.env,DATA_DIR:dir}});
  assert.equal(compact.status,0,compact.stderr);
  const measuredApply=JSON.parse(compact.stdout);
  assert.equal(measuredApply.method.saveMode,'district-apply');
  assert.equal(measuredApply.method.stages,'on');
  assert.equal(measuredApply.results[0].status,'verified');
  assert.ok(measuredApply.results[0].summary.district_apply.requestBytes.max<1024);
  assert.ok(measuredApply.results[0].summary.history_undo.responseBytes.max<200);
  assert.equal(measuredApply.results[0].summary.history_redo.samples,1);
  const rows=measuredApply.results[0].rows;
  const apply=rows.find(row=>row.operation==='district_apply');
  assert.equal(apply.stages.generation.calls,1);
  assert.equal(apply.stages['signature.input'].calls,2);
  assert.equal(apply.stages['signature.crypto'].calls,6,'create/update/digest per signature');
  assert.equal(apply.stages['store.writeDraft'].calls,1);
  const undo=rows.find(row=>row.operation==='history_undo');
  assert.equal(undo.stages['signature.input'].calls,1);
  assert.equal(undo.stages['movement.districtContext'].calls,2);
  assert.equal(undo.stages.generation,undefined,'history restores a delta, without regenerating');
  assert.ok(measuredApply.results[0].summary.history_undo.stages['signature.input'].selfMs.median>=0);
  for(const row of rows) {
    let exclusive=0;
    for(const stage of Object.values(row.stages)) {
      assert.ok(stage.calls>0);
      assert.ok(stage.totalMs>=stage.selfMs && stage.selfMs>=0);
      exclusive+=stage.selfMs;
    }
    assert.ok(row.unmeasuredMs>=0);
    assert.ok(Math.abs(row.serverMs-exclusive-row.unmeasuredMs)<0.001,'exclusive spans partition server time');
  }
  const control=spawnSync(process.execPath,[...compactArgs,'--stages','off'],
    {cwd:root,encoding:'utf8',timeout:20000,env:{...process.env,DATA_DIR:dir}});
  assert.equal(control.status,0,control.stderr);
  const controlResult=JSON.parse(control.stdout).results[0];
  assert.equal(controlResult.verificationSha256,measuredApply.results[0].verificationSha256,
    'instrumented and control servers persist exactly the same map, objects, recipes and revision');
  assert.deepEqual(controlResult.rows.map(row=>[row.operation,row.status,row.requestBytes,row.responseBytes]),
    rows.map(row=>[row.operation,row.status,row.requestBytes,row.responseBytes]),'transport semantics are unchanged');
  assert.deepEqual(fs.readdirSync(dir).sort(),['campaign.json','report.json']);
});

test('world benchmark rejects unknown profiles and invalid sample counts before running', () => {
  for(const args of [['--profile','missing'],['--samples','0'],['--samples','11'],['--ref','main'],['--unknown','x'],['--preview-format','missing'],['--save-mode','missing'],['--history-mode','missing'],['--stages','missing']]) {
    const result=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:5000});
    assert.notEqual(result.status,0);
    assert.doesNotMatch(result.stderr,/Measuring/);
  }
});

test('stage accounting excludes nested spans and preserves return values and errors', () => {
  const { createStages }=require('../scripts/world-benchmark-stages.cjs');
  let time=0, active={};
  const stages=createStages(()=>active,()=>time);
  const sentinel={result:true}, failure=Error('expected failure');
  assert.equal(stages.measure('outer',()=>{
    time=2;
    assert.equal(stages.measure('inner',()=>{time=7;return sentinel;}),sentinel);
    time=10;stages.span('input',3);
    return sentinel;
  }),sentinel);
  assert.deepEqual(active.stages,{inner:{calls:1,totalMs:5,selfMs:5},input:{calls:1,totalMs:3,selfMs:3},
    outer:{calls:1,totalMs:10,selfMs:2}});
  assert.throws(()=>stages.measure('throws',()=>{time=12;throw failure;}),error=>error===failure);
  assert.equal(active.stages.throws.selfMs,2);
  assert.equal(stages.measure('next',()=>{time=13;return sentinel;}),sentinel);
  assert.equal(active.stages.next.selfMs,1,'throw clears the timing stack');
  active=undefined;
  assert.equal(stages.measure('disabled',()=>sentinel),sentinel);
});

test('benchmark hook preserves HMAC output and scopes crypto instrumentation to District', () => {
  const Module=require('node:module'), crypto=require('node:crypto');
  const { install }=require('../scripts/world-benchmark-stages.cjs');
  const originalLoad=Module._load, active={};
  try {
    install(()=>active,root);
    const districtRequire=Module.createRequire(path.join(root,'world-districts.js'));
    const instrumented=districtRequire('node:crypto');
    assert.equal(require('node:crypto'),crypto,'other consumers keep their original crypto export');
    const hmac=instrumented.createHmac('sha256',Buffer.alloc(20,0x0b));
    assert.equal(hmac.update('Hi There'),hmac,'update preserves receiver and chaining');
    assert.equal(hmac.digest('hex'),'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    assert.equal(active.stages['signature.input'].calls,1);
    assert.equal(active.stages['signature.crypto'].calls,3);
  } finally { Module._load=originalLoad; }
});

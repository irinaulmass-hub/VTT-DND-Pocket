'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {optionsFor}=require('../scripts/world-table-benchmark.cjs');
const root=path.resolve(__dirname,'..'),script=path.join(root,'scripts/world-table-benchmark.cjs');

test('table benchmark verifies public HTTP, dense memory and stage transparency without touching external data',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vtt-table-report-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sentinel=path.join(dir,'campaign.json');fs.writeFileSync(sentinel,'keep campaign');
  function run(stages,fog,output) {
    const result=spawnSync(process.execPath,[script,'--profile','small','--samples','1','--stages',stages,'--fog',fog,
      ...(output?['--output',output]:[])],{cwd:root,encoding:'utf8',timeout:20000,env:{...process.env,DATA_DIR:dir}});
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(output?fs.readFileSync(output,'utf8'):result.stdout);
  }
  const output=path.join(dir,'report.json'),instrumented=run('on','on',output),bytes=fs.readFileSync(output);
  const control=run('off','on'),clear=run('on','off');
  assert.equal(instrumented.status,'verified');
  assert.equal(instrumented.method.stages,'on');
  assert.ok(instrumented.dimensions.memoryCells>=2048);
  assert.ok(instrumented.dimensions.memoryObjects>=5);
  assert.deepEqual(instrumented.responseSha256,control.responseSha256,'wrappers preserve every response byte');
  assert.deepEqual(instrumented.rows.map(r=>[r.operation,r.responseBytes,r.readBytes]),
    control.rows.map(r=>[r.operation,r.responseBytes,r.readBytes]));
  assert.deepEqual(Object.keys(instrumented.summary).sort(),['adjacent','distant','empty','live','near','status']);
  assert.equal(instrumented.rows.length,6,'one warm-up per region is excluded');
  assert.equal(instrumented.warmupRows.length,6);
  assert.equal(instrumented.warmupRows.find(r=>r.operation==='near').work.indexBuilds,2,'first query builds live and memory indices');
  assert.equal(clear.warmupRows.find(r=>r.operation==='near').work.indexBuilds,1,'fog off does not build a memory index');
  for(const report of [instrumented,clear])for(const row of report.rows) {
    assert.equal(row.status,200);assert.equal(row.writes,0);
    for(const stage of ['store.readPublishedView','response.json',...(row.operation==='status'?['positions.projectionRevision']:['positions.mapState','exploration.project'])])
      assert.equal(row.stages[stage].calls,1,stage);
    if(row.operation==='status')assert.deepEqual(row.work,{});
    else {
      assert.equal(row.work.indexBuilds||0,0,'unchanged indices are reused after warm-up');
      assert.equal(row.work.indexFallbacks||0,0,'fixture is eligible for both immutable indices');
      assert.ok(row.work.indexCandidates>=0);
      if(['empty','distant'].includes(row.operation))assert.equal(row.work.indexCandidates,0,'empty geometry does not scan remote objects');
    }
    const categories=Object.values(row.readCategories);
    assert.equal(categories.reduce((n,c)=>n+c.calls,0),row.reads);
    assert.equal(categories.reduce((n,c)=>n+c.bytes,0),row.readBytes);
    assert.equal(row.readCategories.publishedManifest,undefined,'warm reads reuse the unchanged publication manifest');
    assert.equal(row.readCategories.positions,undefined,'warm projection reuses the unchanged state document');
    const exclusive=Object.values(row.stages).reduce((n,s)=>n+s.selfMs,0);
    assert.ok(Math.abs(row.serverMs-exclusive-row.unmeasuredMs)<.001,'exclusive time partitions the request');
    assert.ok(Object.values(row.stages).every(s=>s.selfMs>=0&&s.totalMs>=s.selfMs));
  }
  assert.equal(instrumented.summary.status.readCategories.positions,undefined,'warm polling does not reload exploration state');
  assert.equal(instrumented.summary.status.readCategories.terrainChunk,undefined,'status never loads terrain');
  assert.equal(instrumented.rows.find(row=>row.operation==='status').stages['positions.mapState'],undefined);
  assert.equal(instrumented.summary.empty.readCategories.terrainChunk,undefined,'empty viewport loads no terrain files');
  assert.equal(instrumented.summary.empty.readCategories.positions,undefined);
  assert.ok(instrumented.summary.empty.readBytes.median<instrumented.dimensions.positionsBytes,'warm reads exclude the state file');
  assert.equal(instrumented.summary.empty.readCategories.publishedManifest,undefined);
  assert.equal(instrumented.summary.status.readBytes.median,60,'unchanged status reads only the active-world pointer');
  assert.ok(control.rows.every(r=>r.stages===undefined));
  assert.notDeepEqual(clear.responseSha256,instrumented.responseSha256,'fog/memory actually affect the fixture');
  const duplicate=spawnSync(process.execPath,[script,'--samples','1','--output',output],{cwd:root,encoding:'utf8',timeout:20000});
  assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/EEXIST/);
  assert.deepEqual(fs.readFileSync(output),bytes);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'keep campaign');
  assert.deepEqual(fs.readdirSync(dir).sort(),['campaign.json','report.json']);
});

test('table benchmark rejects invalid options before starting a server',()=>{
  for(const args of [['--profile','missing'],['--samples','0'],['--samples','11'],['--ref','main'],
    ['--fog','missing'],['--stages','missing'],['--unknown','x'],['--samples']])assert.throws(()=>optionsFor(args));
  assert.equal(optionsFor([]).stages,'on');
});

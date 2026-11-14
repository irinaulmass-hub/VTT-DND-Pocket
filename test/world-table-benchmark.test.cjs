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
    ['--fog','missing'],['--stages','missing'],['--state-updates','missing'],['--exploration-updates','missing'],
    ['--state-updates','on','--exploration-updates','on'],['--unknown','x'],['--samples']])assert.throws(()=>optionsFor(args));
  assert.equal(optionsFor([]).stages,'on');
});

test('controlled frame updates keep live indices while fresh revisions remain byte-compatible without hooks',()=>{
  const run=stages=>{
    const result=spawnSync(process.execPath,[script,'--samples','2','--state-updates','on','--stages',stages],
      {cwd:root,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  const measured=run('on'),control=run('off');
  assert.equal(measured.method['state-updates'],'on');
  assert.equal(measured.rows.length,12);assert.equal(measured.updateRows.length,2);assert.equal(measured.warmupRows.length,6);
  assert.deepEqual(measured.responseSequenceSha256,control.responseSequenceSha256);
  for(const row of measured.rows) {
    assert.equal(row.work.arrayIndexBuilds||0,0,'frame updates retain the published object collection');
    assert.equal(row.work.dictionaryIndexBuilds||0,0,'frame updates do not replace exploration memory');
    assert.equal(row.writes,0);
    if(row.operation==='status')assert.equal(row.readCategories.publishedManifest.calls,1,'updated state is read afresh');
    else assert.equal(row.readCategories.publishedManifest,undefined);
  }
  assert.equal(new Set(measured.rows.filter(r=>r.operation==='status').map(r=>r.responseSha256)).size,2,'versions actually change');
  assert.ok(measured.updateRows.every(row=>row.status===200&&row.writes>0));
  assert.ok(measured.updateCycles.every(row=>row.firstReadsMs>=0&&row.updateAndFirstReadsMs>=row.firstReadsMs));
  assert.ok(control.rows.every(row=>Object.keys(row.work).length===0));
});

test('assigned-player steps profile fresh exploration, memory and rejected commands transparently',()=>{
  const run=(fog,stages)=>{
    const result=spawnSync(process.execPath,[script,'--samples','5','--exploration-updates','on','--fog',fog,'--stages',stages],
      {cwd:root,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  for(const fog of ['on','off']) {
    const measured=run(fog,'on'),control=run(fog,'off');
    assert.deepEqual(measured.responseSequenceSha256,control.responseSequenceSha256);
    assert.equal(measured.updateResponseSequenceSha256,control.updateResponseSequenceSha256);
    assert.equal(measured.rows.length,35);assert.equal(measured.warmupRows.length,7);
    assert.equal(measured.dimensions.tiles,2048);assert.equal(measured.updateRows.length,5);
    assert.deepEqual(measured.rows.map(r=>[r.operation,r.readBytes,r.writeBytes]),
      control.rows.map(r=>[r.operation,r.readBytes,r.writeBytes]));
    for(const row of measured.rows) {
      assert.equal(row.writes,0);assert.equal(row.work.arrayIndexBuilds||0,0);
      assert.equal(row.work.indexFallbacks||0,0);
      assert.equal(row.work.dictionaryIndexBuilds||0,row.operation==='near'&&fog==='on'?1:0);
      assert.equal(row.readCategories.publishedManifest,undefined,'steps do not invalidate the publication');
      if(row.operation==='status')assert.equal(row.readCategories.positions?.calls||0,fog==='on'?0:1,
        'fog-on notification already parsed new state inside the step; fog-off defers it to polling');
      else assert.equal(row.readCategories.positions,undefined);
    }
    for(const row of measured.updateRows) {
      assert.equal(row.operation,'exploration_move');assert.equal(row.status,200);assert.equal(row.writes,1);
      assert.equal(row.stages['movement.stepVisibility'].calls,1);assert.equal(row.stages['exploration.remember'].calls,2);
      assert.equal(row.stages['io.write'].calls,1);
      assert.equal(row.readCategories.positions.calls,fog==='on'?2:1);
      const exclusive=Object.values(row.stages).reduce((sum,s)=>sum+s.selfMs,0);
      assert.ok(Math.abs(row.serverMs-exclusive-row.unmeasuredMs)<.001);
    }
    const statuses=measured.rows.filter(r=>r.operation==='status').map(r=>r.responseSha256);
    assert.equal(new Set(statuses).size,fog==='on'?5:1,'only fog exposes changes to party sight');
    assert.equal(measured.validationRows.length,10);
    assert.deepEqual(measured.validationRows.slice(0,3).map(r=>[r.operation,r.status]),
      [['unauthorized',401],['stale',409],['blocked',409]]);
    assert.ok(measured.validationRows.every(r=>r.writes===0));
    assert.ok(control.rows.every(r=>r.stages===undefined&&Object.keys(r.work).length===0));
  }
});

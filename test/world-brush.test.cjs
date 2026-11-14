const {test}=require('node:test');
const assert=require('node:assert/strict');
const brush=require('../remote/world-brush');
const map=require('../remote/world-model');

test('brush stencils match their preview and clip to the world at negative coordinates',()=>{
  assert.equal(brush.cells(0,0,5,'square').length,25);
  assert.equal(brush.cells(0,0,5,'circle').length,21);
  assert.equal(brush.cells(-8192,-8192,5,'square').length,9);
  for(const width of brush.sizes)for(const shape of ['circle','square']) {
    const stroke=brush.start({}, {width,shape,type:'water'});stroke.add(-1,-1);
    assert.deepEqual(stroke.finish().tiles.map(({x,y})=>({x,y})),brush.cells(-1,-1,width,shape));
  }
  assert.throws(()=>brush.cells(0,0,2,'circle'),RangeError);
  assert.throws(()=>brush.start({}, {width:1,shape:'circle',type:'unknown'}),RangeError);
});

test('fast brush drags cover intermediate cells and preserve source chunks for cancel and Undo',()=>{
  const source={};map.set(source,-34,-1,'grass');map.set(source,70,0,'stone');
  const original=structuredClone(source),stroke=brush.start(source,{width:1,shape:'square',type:'water'});
  stroke.add(-34,-1);stroke.add(34,-1);stroke.add(-34,-1);
  const change=stroke.finish();assert.equal(change.tiles.length,69);
  for(let x=-34;x<=34;x++)assert.equal(map.get(stroke.chunks,x,-1),'water');
  assert.deepEqual(source,original,'preview never mutates the original document');
  assert.equal(new Set(change.tiles.map(p=>p.x+','+p.y)).size,69);
  for(const p of change.tiles)map.set(stroke.chunks,p.x,p.y,p.before);
  assert.deepEqual(stroke.chunks,source,'one reverse change restores every cell');
  assert.equal(stroke.chunks['2,0'],source['2,0'],'untouched chunks are shared read-only');
});

test('eraser drops only terrain and a no-op stroke produces no history entries',()=>{
  const source={};map.set(source,-1,-1,'water');map.set(source,0,0,'stone');
  const erase=brush.start(source,{width:5,shape:'circle',type:undefined});erase.add(0,0);
  assert.equal(erase.finish().tiles.length,2);assert.deepEqual(erase.chunks,{});
  assert.equal(map.get(source,-1,-1),'water');
  const noop=brush.start(source,{width:1,shape:'circle',type:'stone'});noop.add(0,0);noop.add(0,0);
  assert.deepEqual(noop.finish().tiles,[]);
});

test('brush refuses oversized strokes and tile-limit overflow without committing a partial map',()=>{
  const source={};
  for(let i=0;i<map.tileLimit;i++)map.set(source,i%512,Math.floor(i/512),'grass');
  const stroke=brush.start(source,{width:3,shape:'square',type:'water'});
  assert.throws(()=>stroke.add(-1,-1),/150 000/);assert.throws(()=>stroke.finish(),/150 000/);
  assert.equal(map.get(source,0,0),'grass');assert.equal(map.get(source,-1,-1),undefined);
  const huge=brush.start({}, {width:15,shape:'square',type:'water'});huge.add(-8000,0);
  assert.throws(()=>huge.add(8000,0),/16 384/);assert.throws(()=>huge.finish(),/16 384/);
});

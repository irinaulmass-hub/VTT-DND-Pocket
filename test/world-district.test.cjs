const { test } = require('node:test');
const assert = require('node:assert/strict');
const map = require('../remote/world-model');
const g = require('../remote/world-generators');

const recipe = (patch = {}) => ({ id: 'test-district', kind: 'district', version: 1, seed: 47,
  params: { count: 8, points: [{ x:-16,y:-12 },{ x:16,y:-12 },{ x:16,y:12 },{ x:-16,y:12 }] }, ...patch });
const blank = () => ({ chunks: {}, objects: [], generators: [] });
const apply = (draft, change) => ({ ...draft, chunks: change.chunks,
  objects: change.objects?.after || draft.objects, generators: change.generators.after });
const keys = chunks => Object.entries(chunks).flatMap(([key, cells]) => {
  const [cx, cy] = key.split(',').map(Number);
  return Object.entries(cells).map(([index, value]) => [cx*32+Number(index)%32, cy*32+Math.floor(Number(index)/32), value]);
});

test('District v1 produces reproducible houses with clearance and connected streets at every door', () => {
  const draft = blank(), before = structuredClone(draft), r = recipe();
  const result = g.generateDistrict(r, draft);
  assert.deepEqual(draft, before, 'preview must not mutate its input');
  assert.deepEqual(result, g.generateDistrict(structuredClone(r), draft));
  assert.deepEqual(result.objects.slice(0,3).map(({x,y,turn})=>[x,y,turn]), [[3,-5,1],[-4,3,2],[-3,10,3]]);
  assert.equal(result.objects.length, 8);
  assert.notDeepEqual(result.objects, g.generateDistrict(recipe({seed:48}),draft).objects);
  const occupied = new Set();
  for (const prop of result.objects) {
    const b = map.cellBounds(prop);
    for (let y=b.top;y<=b.bottom;y++) for(let x=b.left;x<=b.right;x++) {
      assert.equal(occupied.has(x+','+y),false,'house footprints do not overlap');
      assert.equal(map.get(result.chunks,x,y),'dirt');
    }
    for (let y=b.top-1;y<=b.bottom+1;y++) for(let x=b.left-1;x<=b.right+1;x++) occupied.add(x+','+y);
    const entrance = [[prop.x,b.bottom+1],[b.left-1,prop.y],[prop.x,b.top-1],[b.right+1,prop.y]][prop.turn];
    assert.equal(map.get(result.chunks,...entrance),'path','each front door meets a street');
  }
  const roads = new Set(keys(result.chunks).filter(cell=>cell[2]==='path').map(([x,y])=>x+','+y));
  const visited = new Set(), queue = [[0,0]];
  for (let i=0;i<queue.length;i++) {
    const [x,y]=queue[i], key=x+','+y;
    if(visited.has(key)||!roads.has(key))continue;
    visited.add(key);
    queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  assert.equal(visited.size, roads.size);
});

test('District validates rectangles, count, bounded state and coordinates without extending template kinds', () => {
  const r = recipe();
  assert.equal(g.validGenerators([r]),true);
  for (const params of [
    {...r.params,count:0},{...r.params,count:25},{...r.params,count:2.5},{...r.params,extra:true},
    {...r.params,points:[{x:0,y:0},{x:10,y:0},{x:10,y:9},{x:0,y:9}]},
    {...r.params,points:[{x:0,y:0},{x:10,y:0},{x:12,y:12},{x:0,y:12}]},
    {...r.params,points:[{x:0,y:0},{x:64,y:0},{x:64,y:64},{x:0,y:64}]},
  ]) assert.equal(g.validGenerators([{...r,params}]),false);
  for(const origin of [-8192,8128]) {
    const edge=recipe({params:{count:24,points:[{x:origin,y:origin},{x:origin+63,y:origin},
      {x:origin+63,y:origin+63},{x:origin,y:origin+63}]}});
    const result=g.generateDistrict(edge,blank());
    assert.equal(result.objects.length,24);
    assert.ok(keys(result.chunks).every(([x,y])=>map.valid(x)&&map.valid(y)));
    assert.deepEqual(result,g.generateDistrict({...edge,params:{...edge.params,points:[...edge.params.points].reverse()}},blank()));
  }
  const change=g.generationChange(r,blank()), state=change.generators.after[0].state;
  assert.equal(g.validGenerators(change.generators.after),true);
  assert.equal(g.validGenerators([{...r,state:{...state,objects:[{...state.objects[0],kind:'tavern'}]}}]),false);
  assert.equal(g.validGenerators([{...r,state:{...state,tiles:[{x:0,y:0,before:null,after:'water'}]}}]),false);
  assert.equal(g.validTemplate({id:r.id,name:'District',kind:'district',version:1,seed:47,settings:{count:8}}),false);
});

test('District regeneration preserves manual objects and cells, restores former ground and supports Undo/Redo', () => {
  let draft=blank();
  for(let y=-16;y<=16;y++)for(let x=-20;x<=20;x++)map.set(draft.chunks,x,y,'grass');
  const initial=structuredClone(draft), r=recipe();
  const first=g.generationChange(r,draft);draft=apply(draft,first);
  const stable=g.generationChange(r,draft);
  assert.equal(stable.tiles.length,0);
  assert.equal(stable.objects,null);
  assert.equal(stable.generators.after,stable.generators.before,'an unchanged repeat leaves history unchanged');
  const oldHouse=draft.objects[0], removed=draft.objects[1];
  const edit=g.protectManualChanges(draft,{objects:{before:draft.objects,after:draft.objects
    .filter(prop=>prop.id!==removed.id).map(prop=>prop.id===oldHouse.id?{...prop,x:40,y:40,hidden:true}:prop)}});
  draft=apply(draft,{chunks:draft.chunks,...edit});
  const paint=g.protectManualChanges(draft,{tiles:[{x:0,y:0,before:'path',after:'stone'}]});
  draft.generators=paint.generators.after;map.set(draft.chunks,0,0,'stone');
  const before=structuredClone(draft);
  const next=g.generationChange(recipe({seed:48}),JSON.parse(JSON.stringify(draft)));
  const after=apply(draft,next);
  assert.deepEqual(draft,before);
  assert.deepEqual(after.objects.find(prop=>prop.id===oldHouse.id),{...oldHouse,x:40,y:40,hidden:true});
  assert.equal(after.objects.some(prop=>prop.id===removed.id),false);
  assert.equal(map.get(after.chunks,0,0),'stone');
  assert.ok(first.generators.after[0].state.tiles.some(cell=>cell.after==='dirt'&&
    map.get(after.chunks,cell.x,cell.y)==='grass'),'discarded house pads restore their source ground');
  const undo={...after,chunks:structuredClone(after.chunks),objects:next.objects.before,generators:next.generators.before};
  for(const cell of next.tiles)map.set(undo.chunks,cell.x,cell.y,cell.before);
  assert.deepEqual(undo,before);
  const redo=apply(undo,next);assert.deepEqual(redo,after);
  const larger=g.generateDistrict(recipe({params:{...r.params,count:12}}),initial);
  assert.deepEqual(larger.objects.slice(0,8),g.generateDistrict(r,initial).objects,'increasing count keeps the same leading slots');
});

test('District rejects blocked streets, foreign ownership, insufficient slots and limits atomically', () => {
  const r=recipe();
  const scenarios=[
    (()=>{const d=blank();map.set(d.chunks,0,0,'water');return d;})(),
    {...blank(),objects:[{id:'road-object',kind:'torch',x:0,y:0,turn:0}]},
    (()=>{const d=blank();map.set(d.chunks,0,0,'wood');return d;})(),
    {...blank(),generators:g.generationChange({id:'foreign',kind:'path',version:1,seed:0,
      params:{terrain:'path',width:1,points:[{x:0,y:0},{x:1,y:0}]}},blank()).generators.after},
    {...blank(),objects:Array.from({length:map.objectLimit},(_,i)=>({id:'outside-'+i,kind:'bush',x:100,y:100,turn:0}))},
  ];
  for(const draft of scenarios) {
    const before=structuredClone(draft);
    assert.throws(()=>g.generationChange(r,draft));assert.deepEqual(draft,before);
  }
  assert.throws(()=>g.generateDistrict(recipe({params:{count:24,points:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]}}),blank()));
  const occupied=blank();occupied.objects.push({id:'keep-house',kind:'house',x:-4,y:-3,turn:0,hidden:true});
  const result=g.generateDistrict(r,occupied);
  assert.equal(occupied.objects.length,1);
  assert.ok(result.objects.every(prop=>prop.id!=='keep-house'&&!(prop.x===-4&&prop.y===-3)), 'manual houses remain clear');
});

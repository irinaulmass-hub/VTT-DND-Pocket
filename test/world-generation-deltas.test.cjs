const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../remote/world-generators');
const map = require('../remote/world-model');
const wire = value => JSON.parse(JSON.stringify(value));

test('generation wire deltas preserve insertions, removals, changes and exact array order', () => {
  const before=[{id:'a',value:1},{id:'b',value:2},{id:'c',value:3}];
  for(const after of [[],before,[before[2],before[0],before[1]],
    [{id:'new'},before[0],{id:'b',value:9},before[2],{id:'last'}]]) {
    const draft={chunks:{},objects:before,generators:before};
    const change={id:'test',count:0,chunks:{},tiles:[],objects:{before,after},generators:{before,after}};
    const source=structuredClone(draft), delta=wire(g.compactGenerationChange(change));
    const restored=g.expandGenerationChange(delta,draft);
    assert.deepEqual(restored,change);assert.deepEqual(draft,source);
    assert.equal(g.expandGenerationChange(change,draft),change,'legacy response passes through');
  }
});

test('tile deltas handle removed chunks and absent cells after JSON transport and reject malformed patches', () => {
  const draft={chunks:{},objects:[],generators:[]};map.set(draft.chunks,-32,-32,'grass');
  const change={id:'test',count:2,chunks:{},tiles:[{x:-32,y:-32,before:'grass',after:undefined},
    {x:32,y:32,before:undefined,after:'stone'}],objects:null,generators:{before:[],after:[]}};
  map.set(change.chunks,32,32,'stone');
  const delta=wire(g.compactGenerationChange(change)), restored=g.expandGenerationChange(delta,draft);
  assert.deepEqual(wire(restored),wire(change));assert.equal(map.get(draft.chunks,-32,-32),'grass');
  assert.throws(()=>g.expandGenerationChange(delta,{...draft,chunks:{}}),RangeError);
  for(const patch of [{remove:[-1],insert:[]},{remove:[0,0],insert:[]},
    {remove:[],insert:[{index:2,value:{id:'x'}}]},{remove:[],insert:[{index:0,value:{id:'x'}},{index:0,value:{id:'y'}}]}]) {
    assert.throws(()=>g.expandGenerationChange({...delta,generators:patch},draft),RangeError);
  }
  assert.throws(()=>g.expandGenerationChange({...delta,format:'delta-v2'},draft),RangeError);
});

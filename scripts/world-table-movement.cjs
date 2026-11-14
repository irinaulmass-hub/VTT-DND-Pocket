'use strict';
// Diagnostic scenario only. The independent pre-index projector is never loaded by the server.
const assert=require('node:assert/strict');
const map=require('../remote/world-model');
const reference=require('../test/fixtures/world-exploration-linear.cjs');
const walker='bench-walker';
const queries={walk:['40,0','41,0']};

function scenario(snapshot,state,scope,key) {
  const layout=snapshot.map,memory=state.memory[key],explored=state.explored[key];
  const props=[
    {id:'walk-updated',kind:'barrel',x:1312,y:10,turn:0},
    {id:'walk-hidden',kind:'chest',x:1311,y:10,turn:0,hidden:true},
    {id:'walk-revealed',kind:'chest',x:1311,y:6,turn:0,hidden:true},
  ];
  const original=layout.objects.filter(p=>!p.id.startsWith('probe-'));
  const removed=original.slice(Math.max(0,original.length-props.length));
  const ids=new Set(removed.map(p=>p.id));
  layout.objects=layout.objects.filter(p=>!ids.has(p.id)).concat(props.map(p=>({...p,notes:'BENCH_PRIVATE'})));
  assert.ok(layout.objects.length<=map.objectLimit);
  for(const id of ids)delete memory.objects[':'+id];
  // Transfer 225 distant cells, retaining the selected profile's exact terrain count.
  let available=225;
  for(const [chunk,cells] of Object.entries(layout.chunks)) {
    if(Number(chunk.split(',')[1])<32)continue;
    for(const offset of Object.keys(cells)) {
      if(!available)break;
      delete cells[offset];delete memory.chunks[chunk][offset];delete explored[chunk][offset];available--;
    }
    if(!Object.keys(cells).length) {delete layout.chunks[chunk];delete memory.chunks[chunk];delete explored[chunk];}
    if(!available)break;
  }
  assert.equal(available,0,'fixture has enough distant cells to transfer');
  for(let y=4;y<=12;y++)for(let x=1304;x<=1328;x++) {
    map.set(layout.chunks,x,y,y===7?'water':'path');
    if(x<=1308) {map.set(memory.chunks,x,y,'stone');map.set(explored,x,y,true);}
  }
  memory.objects[':walk-updated']={...props[0],x:1304,notes:'BENCH_PRIVATE'};
  state.revealedSecrets[layout.id][':walk-revealed']={...props[2]};
  state.positions[walker]={...scope,characterId:walker,x:1308,y:8,revision:0};
  state.observing[walker]=0;

  const movement=require('../world-movement')({},()=>{});
  const visibleAt=position=>movement.visibleCells(position,layout.objects,new Set());
  const allVisible=()=>reference.mask(Object.values(state.positions).flatMap(visibleAt));
  function advance(sample) {
    const current=state.positions[walker];assert.equal(current.revision,sample);
    const position={...current,x:current.x+1,revision:sample+1},cells=visibleAt(position);
    const secrets=state.revealedSecrets[layout.id];
    reference.remember(memory,layout,reference.mask([current,...visibleAt(current)]),new Set(),secrets);
    map.set(explored,current.x,current.y,true);
    for(const cell of cells)map.set(explored,cell.x,cell.y,true);
    reference.remember(memory,layout,reference.mask(cells),new Set(),secrets);
    state.positions[walker]=position;state.observing[walker]=position.revision;
    state.projectionRevisions[layout.id].sight++;
    assert.equal(memory.objects[':walk-updated'].x,1312,'new sight replaces the old object location');
    assert.equal(memory.objects[':walk-hidden'],undefined,'seeing a secret does not reveal it');
    return position;
  }
  function expected(querySet,fog) {
    const version={generation:1,publication:1,exploration:2+(fog?state.projectionRevisions[layout.id].sight:0)};
    const common={id:layout.id,revision:1,frame:snapshot.frame,tokens:[],version,fog};
    const view={explored,memory,visible:fog?allVisible():{},openDoors:new Set(),revealedSecrets:state.revealedSecrets[layout.id]};
    return Object.fromEntries(Object.entries(querySet).map(([name,keys])=>[name,keys===null?
      {type:'WORLD_UPDATE',id:layout.id,revision:1,version,frame:snapshot.frame,party:null,blackout:false}:
      {...common,...reference.project(snapshot,new Set(keys),view)}]));
  }
  function verify(value,fog,sample) {
    assert.equal(value.objects.some(p=>p.id==='walk-hidden'),false);
    assert.equal(value.objects.some(p=>p.id==='walk-revealed'),true);
    const updated=value.objects.find(p=>p.id==='walk-updated');
    assert.equal(updated?.x,fog&&sample<0?1304:1312,'public view tracks old memory then new sight');
    if(fog) {
      assert.equal(!!map.get(value.seen,1313,8),sample>=0,'first step discovers a previously unknown cell');
      if(sample>=0)assert.equal(map.get(value.chunks,1304,8),'path','departure captures terrain before it leaves sight');
    } else assert.deepEqual(value.visible,{});
  }
  return {walker,queries,advance,expected,verify};
}

module.exports={scenario};

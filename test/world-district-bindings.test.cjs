const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const map = require('../remote/world-model');
const g = require('../remote/world-generators');

function fixture(t, bind = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-district-pins-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = name => path.join(dir, name);
  const store = require('../world-store')(file), movement = require('../world-movement')(store, file);
  const districts = require('../world-districts')(movement);
  const recipe = { id:'pin-district',kind:'district',version:1,seed:47,params:{count:8,
    points:[{x:-16,y:-12},{x:16,y:-12},{x:16,y:12},{x:-16,y:12}]}};
  const initial = {id:'10000000-0000-0000-0000-000000000005',name:'District',revision:1,chunks:{},objects:[]};
  for(let y=-12;y<=12;y++)for(let x=-16;x<=16;x++)map.set(initial.chunks,x,y,'grass');
  const change = g.generationChange(recipe, initial);
  const source = {...initial,chunks:change.chunks,objects:change.objects.after,generators:change.generators.after};
  const target = {id:'10000000-0000-0000-0000-000000000006',name:'Inside',revision:1,
    parentWorldId:source.id,chunks:{},objects:[]};
  for(const x of [3,4])map.set(target.chunks,x,1,'wood');
  store.writeDraft(source);store.writeDraft(target);
  const entrance = prop => {
    const b=map.cellBounds(prop);
    const [x,y]=[[prop.x,b.bottom+1],[b.left-1,prop.y],[prop.x,b.top-1],[b.right+1,prop.y]][prop.turn];
    return {x,y};
  };
  const link = (prop=source.objects[0],toX=3) => movement.saveBuildingLink(source,target,{
    buildingId:prop.id,sourceRevision:source.revision,targetRevision:1,linksRevision:movement.linksRevision(),
    ...entrance(prop),toX,toY:1});
  const pair=bind?link():null;
  const next = (preview, base=source) => ({...base,revision:base.revision+1,chunks:preview.change.chunks,
    objects:preview.change.objects?.after||base.objects,generators:preview.change.generators.after});
  const publish = layout => store.writePublished(layout.id,{map:layout,revision:layout.revision,fog:true,seen:{},tokens:[]});
  return {file,store,movement,districts,recipe,source,target,pair,link,next,publish,entrance};
}

test('guarded District regeneration retains bound houses, exact return cells and temporary source ownership', t => {
  const f=fixture(t), {source,recipe,districts,movement}=f;
  const linksBefore=fs.readFileSync(f.file('world-transitions.json'),'utf8');
  const preview=districts.preview(source,{revision:1,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}});
  const next=f.next(preview), house=source.objects[0];
  districts.verifySave(source,next,preview.guard);
  assert.equal(next.objects.length,3,'bound houses count toward the automatic house target');
  assert.deepEqual(next.objects.find(prop=>prop.id===house.id),house);
  const entry=f.entrance(house);
  assert.equal(map.get(next.chunks,entry.x,entry.y),map.get(source.chunks,entry.x,entry.y));
  const b=map.cellBounds(house);
  for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)assert.equal(map.get(next.chunks,x,y),'dirt');
  assert.ok(next.generators[0].state.objects.some(prop=>prop.id===house.id));
  assert.equal(next.generators[0].state.protectedObjects.includes(house.id),false,'binding is not a permanent manual exception');
  f.store.writeDraft(next);f.publish(next);f.publish(f.target);
  assert.deepEqual(movement.findTransition(f.pair[0].from),f.pair[0].to);
  assert.deepEqual(movement.findTransition(f.pair[0].to),f.pair[0].from);
  assert.equal(fs.readFileSync(f.file('world-transitions.json'),'utf8'),linksBefore,'regeneration never rewrites the pair');
  movement.removeTransition(source.id,f.pair[0].id,movement.linksRevision());
  const unpinned=districts.preview(next,{revision:2,recipe:{...recipe,seed:0,params:{...recipe.params,count:1}}});
  const released=f.next(unpinned,next);
  assert.equal(released.objects.some(prop=>prop.id===house.id),false);
  for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)assert.equal(map.get(released.chunks,x,y),'grass',
    'unlinking releases retained pads back to their original source terrain');
});

test('too few houses, cutting a bound house out of the contour or moving its street fails without writes', t => {
  const f=fixture(t), {source,recipe,districts}=f;
  f.link(source.objects[1],4);
  const before=JSON.stringify(f.store.readDraft(source.id)), links=f.movement.linksRevision();
  for(const params of [
    {...recipe.params,count:1},
    {count:8,points:[{x:40,y:40},{x:72,y:40},{x:72,y:64},{x:40,y:64}]},
    {count:8,points:[{x:-12,y:-12},{x:20,y:-12},{x:20,y:12},{x:-12,y:12}]},
  ])assert.throws(()=>districts.preview(source,{revision:1,recipe:{...recipe,params}}),{status:409});
  assert.equal(JSON.stringify(f.store.readDraft(source.id)),before);
  assert.equal(f.movement.linksRevision(),links);
  const zeroNew=districts.preview(source,{revision:1,recipe:{...recipe,params:{...recipe.params,count:2}}});
  assert.equal(f.next(zeroNew).objects.length,2,'a district may consist entirely of bound houses');
  // F5c permits any side of a building, not just the side facing the street.
  f.movement.removeTransition(source.id,f.pair[0].id,f.movement.linksRevision());
  const house=source.objects[0], b=map.cellBounds(house);
  f.movement.saveBuildingLink(source,f.target,{buildingId:house.id,sourceRevision:1,targetRevision:1,
    linksRevision:f.movement.linksRevision(),x:house.x,y:b.top-1,toX:3,toY:1});
  assert.throws(()=>districts.preview(source,{revision:1,recipe:{...recipe,params:{count:8,
    points:[{x:-16,y:-6},{x:16,y:-6},{x:16,y:6},{x:-16,y:6}]}}}),{status:409},
    'the actual bound entry must stay inside even when the street-facing entry still fits');
});

test('link creation, rebind and deletion after preview reject the old guard; modified results cannot be saved', t => {
  const f=fixture(t,false), {source,recipe,districts,movement}=f;
  const request={revision:1,recipe:{...recipe,seed:0}};
  const unbound=districts.preview(source,request), unboundNext=f.next(unbound);
  f.link();
  assert.throws(()=>districts.verifySave(source,unboundNext,unbound.guard),{status:409});
  assert.throws(()=>districts.verifySave(source,unboundNext),{status:409},'old callers cannot bypass pins on bound maps');
  const first=districts.preview(source,request);
  f.link(source.objects[0],4);
  assert.throws(()=>districts.verifySave(source,f.next(first),first.guard),{status:409});
  const fresh=districts.preview(source,request), next=f.next(fresh);
  districts.verifySave(source,next,fresh.guard);
  const changed=structuredClone(next);changed.objects[0].x++;
  assert.throws(()=>districts.verifySave(source,changed,fresh.guard),{status:409});
  const changedTile=structuredClone(next);map.set(changedTile.chunks,0,0,'water');
  assert.throws(()=>districts.verifySave(source,changedTile,fresh.guard),{status:409});
  const changedState=structuredClone(next);changedState.generators[0].seed++;
  assert.throws(()=>districts.verifySave(source,changedState,fresh.guard),{status:409});
  const manual={...source,objects:[...source.objects,{id:'manual-bush',kind:'bush',x:100,y:100,turn:0}]};
  districts.verifySave(source,manual,undefined,'ordinary manual edits keep their prior contract');
  const pair=movement.listTransitions(source.id)[0];
  movement.removeTransition(source.id,pair.id,movement.linksRevision());
  assert.throws(()=>districts.verifySave(source,next,fresh.guard),{status:409});
  assert.deepEqual(f.store.readDraft(source.id),source,'all rejected saves leave the persisted map unchanged');
});

test('preview rejects malformed requests, stale geometry and broken pairs and reserves the interior return cell', t => {
  const f=fixture(t), {source,recipe,districts,movement}=f;
  for(const body of [null,{revision:1,recipe,extra:true},{revision:1,recipe:{...recipe,state:{}}},
    {revision:-1,recipe},{revision:1,recipe:{...recipe,params:{...recipe.params,count:0}}}]) {
    assert.throws(()=>districts.preview(source,body),{status:400});
  }
  assert.throws(()=>districts.preview(source,{revision:0,recipe}),{status:409});
  const context=movement.districtContext(f.target);
  assert.deepEqual(context.pinnedIds,[]);
  assert.deepEqual(context.reservedCells,[{x:3,y:1}]);
  for(const patch of [{x:40},{turn:2},{hidden:true}]) {
    const changed={...source,objects:source.objects.map((prop,i)=>i===0?{...prop,...patch}:prop)};
    assert.throws(()=>districts.preview(changed,{revision:1,recipe}),{status:409});
  }
  const blocked=structuredClone(source);map.set(blocked.chunks,...Object.values(f.entrance(source.objects[0])),'water');
  assert.throws(()=>districts.preview(blocked,{revision:1,recipe}),{status:409});
  fs.writeFileSync(f.file('world-transitions.json'),JSON.stringify([f.pair[0]]));
  assert.throws(()=>districts.preview(source,{revision:1,recipe}),{status:409});
});

test('server-approved history restores exact snapshots and rejects altered data, other scopes and restarted sessions', t => {
  const f=fixture(t), {source,recipe,movement}=f;
  let scope='campaign-a';
  const server=require('../world-districts')(movement,()=>scope);
  const preview=server.preview(source,{revision:1,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}});
  const after=f.next(preview);
  const undo={...source,revision:after.revision+1};
  const guard={revision:after.revision,linksRevision:preview.guard.linksRevision,historyProof:preview.history.before};
  server.verifySave(after,undo,guard);
  server.verifySave(undo,after,{...guard,revision:undo.revision,historyProof:preview.history.after});
  const altered=structuredClone(undo);map.set(altered.chunks,100,100,'water');
  assert.throws(()=>server.verifySave(after,altered,guard),{status:409});
  assert.throws(()=>server.verifySave(after,undo,{...guard,historyProof:'0'.repeat(64)}),{status:409});
  scope='campaign-b';assert.throws(()=>server.verifySave(after,undo,guard),{status:409});scope='campaign-a';
  const restarted=require('../world-districts')(movement,()=>scope);
  assert.throws(()=>restarted.verifySave(after,undo,guard),{status:409},'old browser history fails closed after a server restart');
  // Even an otherwise approved snapshot cannot remove a newly bound house after a caller refreshes the link hash.
  f.link(source.objects[1],4);
  assert.throws(()=>server.verifySave(source,after,{revision:1,linksRevision:movement.linksRevision(),historyProof:preview.history.after}),{status:409});
});

test('compact District preview restores the exact bound snapshot without transmitting foreign recipes', t => {
  const f=fixture(t), {source,recipe,districts}=f;
  for(let i=0;i<30;i++) {
    const x=128+i*40, y=128;
    const change=g.generationChange({...recipe,id:'foreign-'+i,params:{count:8,
      points:[{x,y},{x:x+32,y},{x:x+32,y:y+24},{x,y:y+24}]}},source);
    Object.assign(source,{chunks:change.chunks,objects:change.objects.after,generators:change.generators.after});
  }
  const before=structuredClone(source), request={revision:1,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}};
  const full=districts.preview(source,request), wire=JSON.parse(JSON.stringify(districts.preview(source,{...request,format:'delta-v1'})));
  assert.deepEqual(source,before,'encoding does not mutate the source');
  assert.equal(wire.change.chunks,undefined);
  assert.equal(wire.change.generators.insert.length,1);
  assert.ok(!JSON.stringify(wire).includes('foreign-'));
  assert.ok(JSON.stringify(wire).length<JSON.stringify(full).length/10);
  const expanded=g.expandGenerationChange(wire.change,source);
  assert.deepEqual(JSON.parse(JSON.stringify(expanded)),JSON.parse(JSON.stringify(full.change)));
  assert.deepEqual(wire.history,full.history);assert.deepEqual(wire.guard,full.guard);
  const after=f.next({...wire,change:expanded});districts.verifySave(source,after,wire.guard);
  districts.verifySave(after,{...source,revision:after.revision+1},{revision:after.revision,
    linksRevision:wire.guard.linksRevision,historyProof:wire.history.before});
  const tampered=structuredClone(after);map.set(tampered.chunks,1000,1000,'stone');
  assert.throws(()=>districts.verifySave(source,tampered,wire.guard),{status:409});
  for(const format of ['delta-v2',null,0])assert.throws(()=>districts.preview(source,{...request,format}),{status:400});
});

test('server-prepared District apply matches guarded PUT and returns only reconstructable changes and history', t => {
  const f=fixture(t), {source,recipe,districts,store,movement}=f;
  map.set(source.chunks,100,100,'stone');
  source.objects.push({id:'manual-secret',kind:'tree',x:100,y:101,turn:0,hidden:true});
  store.writeDraft(source);
  const untouched=structuredClone(source), links=movement.linksRevision();
  const preview=districts.preview(source,{revision:source.revision,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}});
  const {next,response,chunkChanges}=districts.prepareApply(source,{districtGuard:preview.guard});
  const expected=f.next(preview);expected.objects=expected.objects.map(prop=>({...prop,hidden:prop.hidden===true}));
  assert.deepEqual(next,expected);assert.deepEqual(source,untouched);
  assert.equal(map.get(next.chunks,100,100),'stone');
  assert.deepEqual(next.objects.find(prop=>prop.id==='manual-secret'),source.objects.at(-1));
  assert.deepEqual(store.readDraft(source.id),source,'preparation alone does not write');
  assert.deepEqual(response.history,preview.history);
  assert.equal(response.baseRevision,source.revision);assert.equal(response.revision,source.revision+1);
  assert.deepEqual(Object.keys(response).sort(),['baseRevision','change','history','id','revision']);
  assert.equal(response.change.format,'delta-v1');assert.equal(response.change.chunks,undefined);
  const expanded=g.expandGenerationChange(JSON.parse(JSON.stringify(response.change)),source);
  assert.deepEqual(expanded.chunks,next.chunks);assert.deepEqual(expanded.objects.after,next.objects);
  assert.deepEqual(expanded.generators.after,next.generators);
  districts.verifySave(source,next,preview.guard);
  districts.verifySave(next,{...source,revision:next.revision+1},{revision:next.revision,linksRevision:links,historyProof:response.history.before});
  assert.equal(Object.hasOwn(chunkChanges,map.address(100,100)[0]),false,'manual distant terrain is outside the commit');
  assert.equal(store.writeDraftChanges(next,source.revision,chunkChanges,map.tileLimit).status,'saved');
  assert.deepEqual(store.readDraft(source.id),next);
  assert.equal(movement.linksRevision(),links);
});

test('compact District apply rejects malformed bodies, history guards and stale map or bindings before writing', t => {
  const f=fixture(t), {source,recipe,districts,store,movement}=f;
  const guard=districts.preview(source,{revision:source.revision,recipe:{...recipe,seed:0}}).guard;
  for(const body of [null,{},[],{districtGuard:undefined},{districtGuard:guard,chunks:{}},
    {districtGuard:{...guard,extra:true}},{districtGuard:{...guard,revision:-1}},
    {districtGuard:{...guard,linksRevision:'invalid'}},{districtGuard:{...guard,recipe:{...recipe,kind:'path'}}},
    {districtGuard:{revision:1,linksRevision:guard.linksRevision,historyProof:'a'.repeat(64)}}]) {
    assert.throws(()=>districts.prepareApply(source,body),{status:400});
  }
  assert.throws(()=>districts.prepareApply({...source,revision:2},{districtGuard:guard}),{status:409});
  assert.throws(()=>districts.prepareApply({...source,revision:Number.MAX_SAFE_INTEGER},
    {districtGuard:{...guard,revision:Number.MAX_SAFE_INTEGER}}),{status:409});
  f.link(source.objects[0],4);
  assert.throws(()=>districts.prepareApply(source,{districtGuard:guard}),{status:409});
  const fresh=districts.preview(source,{revision:1,recipe}).guard;
  movement.removeTransition(source.id,movement.listTransitions(source.id)[0].id,movement.linksRevision());
  assert.throws(()=>districts.prepareApply(source,{districtGuard:fresh}),{status:409});
  assert.deepEqual(store.readDraft(source.id),source,'all invalid requests preserve the draft');
});

function compactHistory(from,to,tiles,id,historyProof,linksRevision) {
  return JSON.parse(JSON.stringify({districtGuard:{revision:from.revision,linksRevision,historyProof},
    change:g.compactGenerationChange({id,count:tiles.length,tiles,objects:{before:from.objects,after:to.objects},
      generators:{before:from.generators||[],after:to.generators||[]}})}));
}

test('compact history restores signed bound snapshots with exact order and a small acknowledgement', t => {
  const f=fixture(t), {source,recipe,districts,movement,store}=f;
  map.set(source.chunks,100,100,'stone');store.writeDraft(source);
  const preview=districts.preview(source,{revision:1,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}});
  const applied=districts.prepareApply(source,{districtGuard:preview.guard}), after=applied.next;
  assert.equal(store.writeDraftChanges(after,source.revision,applied.chunkChanges,map.tileLimit).status,'saved');
  const reverse=preview.change.tiles.map(c=>({x:c.x,y:c.y,before:c.after,after:c.before}));
  const links=movement.linksRevision(), before=structuredClone(after);
  const undo=districts.prepareHistory(after,compactHistory(after,source,reverse,recipe.id,preview.history.before,links));
  assert.deepEqual(after,before);assert.deepEqual(undo.next.chunks,source.chunks);
  assert.deepEqual(undo.next.generators,source.generators);
  assert.deepEqual(undo.next.objects,source.objects.map(p=>({...p,hidden:p.hidden===true})));
  assert.deepEqual(undo.response,{id:source.id,baseRevision:2,revision:3});
  assert.equal(store.writeDraftChanges(undo.next,after.revision,undo.chunkChanges,map.tileLimit).status,'saved');
  assert.deepEqual(store.readDraft(source.id),undo.next);
  const redo=districts.prepareHistory(undo.next,compactHistory(undo.next,after,preview.change.tiles,recipe.id,preview.history.after,links));
  assert.deepEqual(redo.next.objects,after.objects);assert.deepEqual(redo.next.chunks,after.chunks);
  assert.equal(store.writeDraftChanges(redo.next,undo.next.revision,redo.chunkChanges,map.tileLimit).status,'saved');
  assert.deepEqual(store.readDraft(source.id),redo.next);
  assert.equal(movement.linksRevision(),links);
  districts.verifySave(redo.next,{...source,revision:5},{revision:4,linksRevision:links,historyProof:preview.history.before});
});

test('compact history rejects malformed deltas, tampering, stale revisions, other scopes and restarted keys', t => {
  const f=fixture(t), {source,recipe,movement,store}=f;let scope='a';
  const server=require('../world-districts')(movement,()=>scope);
  const preview=server.preview(source,{revision:1,recipe:{...recipe,seed:0,params:{...recipe.params,count:3}}});
  const after=server.prepareApply(source,{districtGuard:preview.guard}).next;
  const reverse=preview.change.tiles.map(c=>({x:c.x,y:c.y,before:c.after,after:c.before}));
  const body=compactHistory(after,source,reverse,recipe.id,preview.history.before,movement.linksRevision());
  const malformed=[{}, {...body,extra:true},{...body,districtGuard:preview.guard}];
  const change=patch=>({...body,change:{...body.change,...patch}});
  malformed.push(change({format:'full'}),change({chunks:{}}),change({count:-1}),change({tiles:[...body.change.tiles,body.change.tiles[0]],count:body.change.count+1}),
    change({generators:{remove:[],insert:[{index:0,value:{...source.generators[0],id:'foreign'}}]}}),
    change({objects:{remove:[],insert:[{index:0,value:null}]}}));
  for(const value of malformed)assert.throws(()=>server.prepareHistory(after,value),{status:400});
  assert.throws(()=>server.prepareHistory(after,{...body,districtGuard:{...body.districtGuard,revision:1}}),{status:409});
  const altered=structuredClone(body);altered.change.objects.insert[0].value.x++;
  assert.throws(()=>server.prepareHistory(after,altered),{status:409});
  assert.throws(()=>server.prepareHistory(after,change({objects:{remove:[9999],insert:[]}})),{status:409});
  const wrongCell=structuredClone(body);wrongCell.change.tiles[0].before='water';
  assert.throws(()=>server.prepareHistory(after,wrongCell),{status:409});
  scope='b';assert.throws(()=>server.prepareHistory(after,body),{status:409});scope='a';
  const restarted=require('../world-districts')(movement,()=>scope);
  assert.throws(()=>restarted.prepareHistory(after,body),{status:409});
  assert.deepEqual(store.readDraft(source.id),source,'rejections never write');
  store.writeDraft(after);
  const added=after.objects.find(item=>!source.objects.some(old=>old.id===item.id));assert.ok(added);
  movement.saveBuildingLink(after,f.target,{buildingId:added.id,sourceRevision:after.revision,targetRevision:1,
    linksRevision:movement.linksRevision(),...f.entrance(added),toX:4,toY:1});
  assert.throws(()=>server.prepareHistory(after,body),{status:409},'a changed link hash rejects old history');
  assert.throws(()=>server.prepareHistory(after,{...body,districtGuard:{...body.districtGuard,linksRevision:movement.linksRevision()}}),
    {status:409},'refreshing the hash cannot remove a newly bound house');
  assert.deepEqual(store.readDraft(source.id),after);
});

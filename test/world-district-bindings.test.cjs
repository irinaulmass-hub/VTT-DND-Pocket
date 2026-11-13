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

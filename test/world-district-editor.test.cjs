const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const world = require('../remote/world-model');
const copy = value => JSON.parse(JSON.stringify(value));

function editorFixture() {
  const tools = ['generate-path','generate-forest','generate-room','generate-district','stone','select','pan','water','erase','house','tree','barrel']
    .map(tool=>({dataset:{tool},setAttribute(){}}));
  class Element {
    listeners=new Map();
    nodes=new Map(); value=''; checked=false;
    elements={parentMap:{value:''},toMapId:{value:'',replaceChildren(){}},elevation:{},x:{},y:{},toX:{},toY:{}};
    get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
    querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
    querySelectorAll(key){return key==='[data-tool]'?tools:[];}
    replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}
    setAttribute(){} addEventListener(name,callback){this.listeners.set(name,callback);} prepend(){} append(){} reset(){}
  }
  const root=new Element(), editor=new Element(), elements=[editor,new Element()];
  const control=name=>editor.querySelector('[data-world-'+name+']');
  let saved={id:'district-map',name:'District UI',revision:1,chunks:{},objects:[],generators:[]};
  let rendered, canvas, nextId=0, forcedId, linksRevision='a'.repeat(64), failWrite=false, holdPreview=false, releasePreview;
  let loseWrite, failRead=false, corruptReply=false, foreignWrite=false;
  const requests=[];
  const server=require('../world-districts')({districtContext:()=>({pinnedIds:[],reservedCells:[],hasBindings:false,linksRevision})});
  const globals={WorldMap:world,location:{hash:''},
    document:{createElement:()=>elements.shift()||new Element(),getElementById:id=>root.querySelector(id),body:{dataset:{}}},
    crypto:{randomUUID:()=> forcedId||'district-'+(++nextId)},characterRoster:[],MutationObserver:class{observe(){}},
    Option:class{constructor(label,value){Object.assign(this,{label,value});}},confirm:()=>true,addEventListener(){},
    createWorldView:(element,options)=>{
      if(element===control('canvas'))canvas=options;
      return {data(data){if(element===control('canvas'))rendered=copy(data);},setCamera(){},camera:()=>({x:0,y:0,scale:24}),party(){}};
    },LootUI:{async request(url,options){
      const body=options?.body?JSON.parse(options.body):undefined;
      requests.push({url,body});
      if(url==='/api/world-generator-templates')return {revision:0,templates:[]};
      if(url.includes('/live'))return null;
      if(url.endsWith('/district-preview')){
        assert.equal(body.revision,saved.revision);
        assert.equal(body.format,'delta-v1','the editor opts into the compact response');
        const result=copy(server.preview(copy(saved),body));
        if(holdPreview)return new Promise(resolve=>{releasePreview=()=>resolve(result);});
        return result;
      }
      if(url.endsWith('/district-apply')){
        assert.equal(options.method,'POST');assert.deepEqual(Object.keys(body),['districtGuard']);
        if(failWrite)throw new Error('Переходы изменились. Повтори предпросмотр района.');
        const prepared=server.prepareApply(saved,body);saved=prepared.next;
        if(foreignWrite){saved=copy(saved);world.set(saved.chunks,100,100,'water');saved.revision++;}
        if(loseWrite==='apply'){loseWrite=undefined;throw new TypeError('lost apply response');}
        return copy(corruptReply?{...prepared.response,id:'wrong-map'}:prepared.response);
      }
      if(url.endsWith('/district-history')){
        assert.equal(options.method,'POST');assert.deepEqual(Object.keys(body).sort(),['change','districtGuard']);
        assert.equal(body.change.chunks,undefined);
        if(failWrite)throw new Error('Переходы изменились. Повтори предпросмотр района.');
        const prepared=server.prepareHistory(saved,body);saved=prepared.next;
        if(loseWrite==='history'){loseWrite=undefined;throw new TypeError('lost history response');}
        return copy(prepared.response);
      }
      assert.equal(url,'/api/worlds/district-map');
      if(options?.method==='PUT'){
        if(failWrite)throw new Error('Переходы изменились. Повтори предпросмотр района.');
        assert.equal(body.revision,saved.revision);
        const next={...saved,chunks:body.chunks,objects:body.objects.map(prop=>({...prop,hidden:prop.hidden===true})),
          generators:body.generators,revision:saved.revision+1};
        server.verifySave(saved,next,body.districtGuard);saved=next;
        if(loseWrite==='history' && body.districtGuard?.historyProof){loseWrite=undefined;throw new TypeError('lost history response');}
      }
      else if(failRead)throw new TypeError('offline');
      return copy(saved);
    }}};
  globals.window=globals;
  const context=vm.createContext(globals);
  for(const file of ['remote/world-generators.js','remote/world-brush.js','dm/world.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  return {control,tools,requests,seed(value){saved=copy({...saved,...value});},forceId(value){forcedId=value;},get saved(){return saved;},get rendered(){return rendered;},get canvas(){return canvas;},
    async open(){control('select').value='district-map';control('select').onchange();await new Promise(setImmediate);},
    begin(){tools[3].onclick();control('district-count').value='8';control('path-seed').value='47';canvas.click(-16,-12);canvas.click(16,12);},
    hold(){holdPreview=true;},release(){holdPreview=false;releasePreview();},
    changeLinks(){linksRevision='b'.repeat(64);},failWrite(value){failWrite=value;},
    loseNext(kind){loseWrite=kind;},failRead(value){failRead=value;},corruptReply(){corruptReply=true;},foreignWrite(){foreignWrite=true;}};
}

const keyEvent=(key,extra={})=>({key,preventDefault(){},...extra});
function selectObject(f,object) {
  f.tools.find(t=>t.dataset.tool==='select').onclick();const center=world.footprint(object);
  assert.equal(f.canvas.pickProp(center.x,center.y).id,object.id);
}

test('copy placement preserves orientation and secrecy with a new ID, one Undo and persisted Redo',async()=>{
  const f=editorFixture(),c=f.control,source={id:'original-bed',kind:'bed',x:-4,y:-4,turn:1,hidden:true};
  f.seed({objects:[source]});await f.open();selectObject(f,source);const before=copy(f.rendered);
  c('copy').onclick();const ghost=f.canvas.placementPreview(-33,31);
  assert.deepEqual(copy(ghost.prop),{id:'placement-preview',kind:'bed',turn:1,hidden:true,x:-33,y:31});
  assert.deepEqual(f.rendered,before,'entering copy mode changes neither map nor history');
  f.canvas.click(-33,31);const duplicate=f.rendered.objects[1];
  assert.notEqual(duplicate.id,source.id);assert.deepEqual(duplicate,{...source,id:duplicate.id,x:-33,y:31});
  assert.deepEqual(f.rendered.objects[0],source);assert.equal(f.canvas.placementPreview(0,0),null);
  await c('undo').onclick();assert.deepEqual(f.rendered,before);
  await c('redo').onclick();await c('save').onclick();await f.open();
  assert.deepEqual(f.rendered.objects,[source,duplicate]);
});

test('repeated copies rotate independently, cancel without an extra history entry and do not inherit bindings',async()=>{
  const f=editorFixture(),c=f.control,source={id:'bound-house',kind:'house',x:0,y:0,turn:2,hidden:false};
  f.seed({objects:[source]});await f.open();selectObject(f,source);
  c('canvas').listeners.get('keydown')(keyEvent('d',{ctrlKey:true}));c('placement-repeat').checked=true;
  c('canvas').listeners.get('keydown')(keyEvent('r'));assert.equal(f.canvas.placementPreview(8,0).prop.turn,3);
  f.canvas.click(8,0);f.canvas.click(16,0);const copies=f.rendered.objects.slice(1);
  assert.equal(new Set(f.rendered.objects.map(p=>p.id)).size,3);assert.ok(copies.every(p=>p.turn===3));
  assert.deepEqual(f.rendered.objects[0],source);
  assert.ok(copies.every(p=>Object.keys(p).sort().join(',')==='id,kind,turn,x,y'));
  assert.equal(f.requests.some(r=>r.url.includes('building-links')),false);
  c('canvas').listeners.get('keydown')(keyEvent('Escape'));assert.equal(f.canvas.placementPreview(20,0),null);
  await c('undo').onclick();assert.equal(f.rendered.objects.length,2,'cancel adds no history');
  await c('undo').onclick();assert.deepEqual(f.rendered.objects,[source]);
});

test('placement respects object admission, ID collisions and discards templates when opening a map',async()=>{
  const f=editorFixture(),c=f.control,source={id:'source',kind:'barrel',x:0,y:0,turn:0};
  f.seed({objects:[source]});await f.open();selectObject(f,source);c('copy').onclick();
  f.forceId(source.id);f.canvas.click(4,4);assert.deepEqual(f.rendered.objects,[source]);
  assert.match(c('status').textContent,/ID/);f.forceId(undefined);
  await f.open();assert.equal(f.canvas.placementPreview(0,0),null,'stale copy cannot cross map opens');
  f.seed({objects:Array.from({length:world.objectLimit},(_,i)=>({...source,id:'p'+i,x:i,y:0}))});await f.open();
  selectObject(f,f.rendered.objects[0]);assert.equal(c('copy').disabled,true);
  c('canvas').listeners.get('keydown')(keyEvent('d',{ctrlKey:true}));assert.equal(f.canvas.placementPreview(0,0),null);
  f.tools.find(t=>t.dataset.tool==='barrel').onclick();assert.equal(f.canvas.placementPreview(0,0).allowed,false);
  f.canvas.click(0,0);assert.equal(f.rendered.objects.length,world.objectLimit);
  assert.equal(c('undo').disabled,true,'rejected placement adds no history');
});

test('a copied generated object stays detached during regeneration without changing the source recipe',async()=>{
  const f=editorFixture(),c=f.control,generators=require('../remote/world-generators');
  const recipe={id:'room',kind:'room',version:1,seed:7,params:{floor:'wood',points:[{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:0,y:6}],entrance:{x:3,y:0}}};
  const generated=generators.generationChange(recipe,f.saved);
  f.seed({chunks:generated.chunks,objects:generated.objects.after,generators:generated.generators.after});await f.open();
  const source=f.rendered.objects.at(-1),recipes=copy(f.rendered.generators);selectObject(f,source);c('copy').onclick();f.canvas.click(-20,-20);
  const duplicate=f.rendered.objects.at(-1);assert.deepEqual(f.rendered.generators,recipes);
  assert.equal(f.rendered.generators[0].state.objects.some(p=>p.id===duplicate.id),false);
  const next=generators.generationChange({...recipe,seed:9},f.rendered);
  assert.deepEqual(next.objects.after.find(p=>p.id===duplicate.id),duplicate);
  await c('save').onclick();assert.ok(f.saved.objects.some(p=>p.id===duplicate.id));
});

test('the object palette supports repeated placement and changes tools without stale copy settings',async()=>{
  const f=editorFixture(),c=f.control;await f.open();f.tools.find(t=>t.dataset.tool==='tree').onclick();
  c('placement-repeat').checked=true;c('placement-turn').onclick();f.canvas.click(-2,-2);f.canvas.click(-4,-2);
  assert.equal(f.rendered.objects.length,2);assert.ok(f.rendered.objects.every(p=>p.kind==='tree'&&p.turn===1));
  f.tools.find(t=>t.dataset.tool==='water').onclick();assert.equal(f.canvas.placementPreview(0,0),null);
  f.tools.find(t=>t.dataset.tool==='house').onclick();assert.equal(f.canvas.placementPreview(0,0).prop.turn,0);
  c('placement-repeat').checked=false;f.canvas.click(10,10);assert.equal(f.canvas.placementPreview(0,0),null);
  assert.equal(f.rendered.objects.at(-1).kind,'house');
});

test('terrain brush previews a continuous stroke and saves it with single-step Undo and Redo',async()=>{
  const f=editorFixture(),c=f.control;await f.open();
  f.tools.find(t=>t.dataset.tool==='water').onclick();c('brush-size').value='5';c('brush-shape').value='circle';
  const original=copy(f.rendered);
  assert.equal(f.canvas.brushPreview(-1,-1).length,21);
  assert.equal(f.canvas.startStroke(-34,-1),true);f.canvas.strokeTo(34,-1);
  assert.equal(c('undo').disabled,true,'history is locked until the gesture ends');
  assert.equal(world.get(f.rendered.chunks,0,-1),'water','actual terrain is visible while dragging');
  assert.deepEqual(f.saved.chunks,original.chunks,'no implicit server write');
  f.canvas.endStroke(true);const painted=copy(f.rendered);
  await c('undo').onclick();assert.deepEqual(f.rendered,original,'one undo removes the entire drag');
  await c('redo').onclick();assert.deepEqual(f.rendered,painted);
  await c('save').onclick();assert.deepEqual(f.saved.chunks,painted.chunks);
  await f.open();assert.deepEqual(f.rendered.chunks,painted.chunks,'saved strokes survive reload');
  f.canvas.startStroke(0,10);f.canvas.strokeTo(10,10);f.canvas.endStroke(false);
  assert.deepEqual(f.rendered.chunks,painted.chunks,'cancel restores every preview cell');
  assert.equal(c('undo').disabled,true,'cancel adds no history');
});

test('brush manual edits survive regeneration while cancelled, erased and rectangle gestures remain independent',async()=>{
  const f=editorFixture(),c=f.control,generators=require('../remote/world-generators');
  const recipe={id:'manual-road',kind:'path',version:1,seed:12,params:{terrain:'path',width:3,points:[{x:-8,y:0},{x:8,y:0}]}};
  const generated=generators.generationChange(recipe,f.saved);
  f.seed({chunks:generated.chunks,generators:generated.generators.after});await f.open();
  f.tools.find(t=>t.dataset.tool==='stone').onclick();c('brush-size').value='3';c('brush-shape').value='square';
  f.canvas.startStroke(0,0);f.canvas.strokeTo(2,0);f.canvas.endStroke(true);
  assert.ok(f.rendered.generators[0].state.protectedTiles.some(p=>p.x===0&&p.y===0));
  const next=generators.generationChange({...recipe,params:{...recipe.params,width:5}},f.rendered);
  assert.equal(world.get(next.chunks,0,0),'stone');
  await c('undo').onclick();assert.equal(f.rendered.generators[0].state.protectedTiles.length,0);
  await c('redo').onclick();await c('save').onclick();
  f.tools.find(t=>t.dataset.tool==='erase').onclick();f.canvas.startStroke(0,0);f.canvas.endStroke(true);
  assert.equal(world.get(f.rendered.chunks,0,0),undefined);await c('undo').onclick();
  assert.equal(world.get(f.rendered.chunks,0,0),'stone');
  c('rect').checked=true;assert.equal(f.canvas.startStroke(0,0),false);
  assert.equal(f.canvas.brushPreview(0,0),null);
});

test('an oversized brush gesture rolls back its visible preview without adding history',async()=>{
  const f=editorFixture(),c=f.control;await f.open();f.tools.find(t=>t.dataset.tool==='water').onclick();
  c('brush-size').value='15';c('brush-shape').value='square';const original=copy(f.rendered);
  f.canvas.startStroke(-8000,0);f.canvas.strokeTo(8000,0);
  assert.deepEqual(f.rendered,original,'failed preview disappears before pointer release');
  assert.match(c('status').textContent,/16 384/);f.canvas.endStroke(true);
  assert.deepEqual(f.rendered,original);assert.equal(c('undo').disabled,true);
  assert.equal(c('save').disabled,false,'controls unlock after rollback');
});

test('District editor saves manual work before preview, applies with guard and persists exact Undo/Redo', async () => {
  const f=editorFixture(), c=f.control;
  await f.open();f.tools[4].onclick();f.canvas.click(30,30);
  f.begin();
  assert.equal(c('templates').hidden,true);
  assert.equal(c('path-preview').disabled,false);
  assert.equal(f.canvas.outline().length,4);
  await c('path-preview').onclick();
  assert.equal(world.get(f.saved.chunks,30,30),'stone','pending manual work is saved before server preview');
  assert.equal(f.saved.objects.length,0,'preview does not write the district');
  assert.equal(f.rendered.objects.length,8);
  assert.ok(f.requests.findIndex(r=>r.body?.districtGuard===undefined&&r.body?.chunks)<f.requests.findIndex(r=>r.url.endsWith('/district-preview')));
  await c('path-apply').onclick();
  const first=copy(f.saved);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/district-apply')).length,1);
  assert.equal(first.objects.length,8);
  assert.equal(c('path-saved').value,first.generators[0].id);
  assert.equal(c('path-apply').disabled,true);
  await c('undo').onclick();
  assert.equal(f.saved.objects.length,0);
  assert.deepEqual(f.saved.generators,[]);
  assert.equal(world.get(f.saved.chunks,30,30),'stone');
  await c('redo').onclick();
  assert.deepEqual(f.saved.chunks,first.chunks);assert.deepEqual(f.saved.objects,first.objects);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/district-history')).length,2);
  assert.deepEqual(f.saved.generators,first.generators);
  c('district-count').value='4';c('district-count').oninput();c('path-seed').value='0';c('path-seed').oninput();
  await c('path-preview').onclick();await c('path-apply').onclick();
  assert.equal(f.saved.objects.length,4);
  assert.equal(f.saved.generators[0].id,first.generators[0].id);
  await c('undo').onclick();assert.deepEqual(f.saved.objects,first.objects);
  await c('redo').onclick();assert.equal(f.saved.objects.length,4);
  await f.open();c('path-saved').value=f.saved.generators[0].id;c('path-saved').onchange();
  assert.equal(c('district-count').value,'4');assert.equal(c('path-seed').value,'0');
  assert.equal(c('path-preview').disabled,false);
});

test('lost apply and history responses are reconciled by a read, with no duplicate writes or history entries', async () => {
  const f=editorFixture(),c=f.control;await f.open();f.begin();await c('path-preview').onclick();
  f.loseNext('apply');await c('path-apply').onclick();
  assert.equal(f.saved.objects.length,8);assert.deepEqual(f.rendered,f.saved);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/district-apply')).length,1);
  f.loseNext('history');await c('undo').onclick();
  assert.equal(f.saved.objects.length,0);assert.equal(c('undo').disabled,true);assert.equal(c('redo').disabled,false);
  f.loseNext('history');await c('redo').onclick();assert.equal(f.saved.objects.length,8);
  await c('undo').onclick();assert.equal(f.saved.objects.length,0);assert.equal(c('undo').disabled,true);
});

test('unconfirmed or competing commits never enter the local history or replace the open draft', async () => {
  for(const offline of [true,false]) {
    const f=editorFixture(),c=f.control;await f.open();f.begin();await c('path-preview').onclick();
    f.loseNext('apply');if(offline)f.failRead(true);else f.foreignWrite();
    await c('path-apply').onclick();
    assert.equal(f.rendered.objects.length,0);assert.equal(c('undo').disabled,true);assert.equal(c('redo').disabled,true);
    assert.equal(c('path-apply').disabled,true);
    assert.match(c('status').textContent,offline?/подтвердить сохранение/:/Карта изменилась/);
    f.failRead(false);await f.open();assert.deepEqual(f.rendered,f.saved,'explicit reopen loads the authoritative version');
  }
  const f=editorFixture(),c=f.control;await f.open();f.begin();await c('path-preview').onclick();await c('path-apply').onclick();
  f.loseNext('history');f.failRead(true);await c('undo').onclick();
  assert.equal(f.saved.objects.length,0);assert.equal(f.rendered.objects.length,8);
  assert.equal(c('undo').disabled,false);assert.equal(c('redo').disabled,true,'unconfirmed undo does not move the stack');
  f.failRead(false);await f.open();assert.deepEqual(f.rendered,f.saved);
});

test('an invalid compact reply is rejected and reconciled from the actual stored map', async () => {
  const f=editorFixture(),c=f.control;await f.open();f.begin();await c('path-preview').onclick();f.corruptReply();
  await c('path-apply').onclick();assert.equal(f.saved.objects.length,8);assert.deepEqual(f.rendered,f.saved);
  await c('undo').onclick();assert.equal(f.saved.objects.length,0);
});

test('District conflicts leave draft and history intact and a pending request locks map/tool changes', async () => {
  const f=editorFixture(), c=f.control;
  await f.open();f.begin();f.hold();
  const pending=c('path-preview').onclick();await new Promise(setImmediate);
  assert.equal(c('select').disabled,true);assert.equal(c('path-apply').disabled,true);
  f.tools[0].onclick();assert.equal(c('district-count-label').hidden,false,'tool switch is blocked while preview is pending');
  f.release();await pending;
  assert.equal(c('select').disabled,false);
  const before=copy(f.saved);f.changeLinks();await c('path-apply').onclick();
  assert.deepEqual(f.saved,before);assert.deepEqual(f.rendered,before);
  assert.equal(c('undo').disabled,true);assert.equal(c('path-apply').disabled,true);
  await c('path-preview').onclick();await c('path-apply').onclick();
  const committed=copy(f.saved);f.failWrite(true);await c('undo').onclick();
  assert.deepEqual(f.saved,committed);assert.equal(c('undo').disabled,false);
  assert.equal(c('redo').disabled,true);
  f.failWrite(false);await c('undo').onclick();assert.equal(f.saved.objects.length,0);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const world = require('../remote/world-model');
const copy = value => JSON.parse(JSON.stringify(value));

function editorFixture() {
  const tools = ['generate-path','generate-forest','generate-room','generate-district','stone','select','pan']
    .map(tool=>({dataset:{tool},setAttribute(){}}));
  class Element {
    nodes=new Map(); value=''; checked=false;
    elements={parentMap:{value:''},toMapId:{value:'',replaceChildren(){}},elevation:{},x:{},y:{},toX:{},toY:{}};
    get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
    querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
    querySelectorAll(key){return key==='[data-tool]'?tools:[];}
    replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}
    setAttribute(){} addEventListener(){} prepend(){} append(){} reset(){}
  }
  const root=new Element(), editor=new Element(), elements=[editor,new Element()];
  const control=name=>editor.querySelector('[data-world-'+name+']');
  let saved={id:'district-map',name:'District UI',revision:1,chunks:{},objects:[],generators:[]};
  let rendered, canvas, nextId=0, linksRevision='a'.repeat(64), failWrite=false, holdPreview=false, releasePreview;
  let loseWrite, failRead=false, corruptReply=false, foreignWrite=false;
  const requests=[];
  const server=require('../world-districts')({districtContext:()=>({pinnedIds:[],reservedCells:[],hasBindings:false,linksRevision})});
  const globals={WorldMap:world,location:{hash:''},
    document:{createElement:()=>elements.shift()||new Element(),getElementById:id=>root.querySelector(id),body:{dataset:{}}},
    crypto:{randomUUID:()=> 'district-'+(++nextId)},characterRoster:[],MutationObserver:class{observe(){}},
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
  for(const file of ['remote/world-generators.js','dm/world.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  return {control,tools,requests,get saved(){return saved;},get rendered(){return rendered;},get canvas(){return canvas;},
    async open(){control('select').value='district-map';control('select').onchange();await new Promise(setImmediate);},
    begin(){tools[3].onclick();control('district-count').value='8';control('path-seed').value='47';canvas.click(-16,-12);canvas.click(16,12);},
    hold(){holdPreview=true;},release(){holdPreview=false;releasePreview();},
    changeLinks(){linksRevision='b'.repeat(64);},failWrite(value){failWrite=value;},
    loseNext(kind){loseWrite=kind;},failRead(value){failRead=value;},corruptReply(){corruptReply=true;},foreignWrite(){foreignWrite=true;}};
}

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

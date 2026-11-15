const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('selecting an object does not move it when its inspector shifts the canvas; dragging uses pointer distance', () => {
  const handlers=new Map(), moves=[];
  const prop={id:'bound-house',kind:'house',x:3,y:5,turn:0};
  let top=100;
  const canvas={width:1000,height:480,getContext:()=>({}),focus(){},setPointerCapture(){},
    getBoundingClientRect:()=>({left:20,top,width:1000,height:480}),
    addEventListener:(name,callback)=>handlers.set(name,callback)};
  const window={WorldMap:require('../remote/world-model'),WorldArt:{paintTile(){},paintProp(){}},
    addEventListener(){},devicePixelRatio:1};
  const globals={window,cancelAnimationFrame(){},requestAnimationFrame:()=>1,
    ResizeObserver:class{constructor(callback){this.callback=callback;}observe(){this.callback();}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),globals);
  window.createWorldView(canvas,{click(){},pickProp(){top+=144;return prop;},
    moveProp:(item,x,y)=>moves.push({id:item.id,x,y})});
  const event=(clientX,clientY)=>({pointerId:1,button:0,clientX,clientY});
  handlers.get('pointerdown')(event(300,300));
  handlers.get('pointermove')(event(300,300));
  handlers.get('pointerup')(event(300,300));
  assert.deepEqual(moves,[],'opening the inspector must not edit a linked house');
  handlers.get('pointerdown')(event(300,300));
  handlers.get('pointermove')(event(348,276));
  handlers.get('pointerup')(event(348,276));
  assert.deepEqual(moves,[{id:prop.id,x:5,y:4}],'a real drag keeps its cell distance despite layout shifts');
  handlers.get('pointerdown')(event(300,300));
  handlers.get('lostpointercapture')();
  handlers.get('pointerup')(event(348,276));
  assert.equal(moves.length,1,'a cancelled gesture does not write');
});

test('placement ghost follows the pointer with temporary opacity and never enters map data',()=>{
  const handlers=new Map(),painted=[],alpha=[];let frame;
  const ctx={globalAlpha:1,setTransform(){},translate(){},scale(){},fillRect(){},strokeRect(){},
    beginPath(){},moveTo(){},lineTo(){},stroke(){},getTransform:()=>({a:1,d:1,e:0,f:0}),
    save(){alpha.push(this.globalAlpha);},restore(){this.globalAlpha=alpha.pop();}};
  const canvas={width:400,height:300,getContext:()=>ctx,focus(){},setPointerCapture(){},
    getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),addEventListener:(n,fn)=>handlers.set(n,fn)};
  const window={WorldMap:require('../remote/world-model'),WorldArt:{paintTile(){},paintProp(context,p){painted.push({...p,alpha:context.globalAlpha});}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),{window,
    cancelAnimationFrame(){},requestAnimationFrame:fn=>{frame=fn;return 1;},ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}}});
  const data={chunks:{},objects:[{id:'original',kind:'chest',x:0,y:0,turn:2,hidden:true}]},before=JSON.stringify(data);
  const view=window.createWorldView(canvas,{click(){},placementPreview:(x,y)=>({prop:{...data.objects[0],id:'ghost',x,y},allowed:true})});
  view.data(data);handlers.get('pointermove')({pointerId:1,clientX:224,clientY:174});frame();
  assert.deepEqual(painted.find(p=>p.id==='ghost'),{...data.objects[0],id:'ghost',x:1,y:1,alpha:.55});
  assert.equal(ctx.globalAlpha,1);assert.equal(JSON.stringify(data),before);
  painted.length=0;handlers.get('pointerleave')();frame();assert.equal(painted.some(p=>p.id==='ghost'),false);
});

test('brush gestures commit once, interpolate through callbacks and cancel on Escape or pointer loss',()=>{
  const handlers=new Map(),calls=[];
  const canvas={width:1000,height:480,getContext:()=>({}),focus(){},setPointerCapture(){},
    getBoundingClientRect:()=>({left:0,top:0,width:1000,height:480}),
    addEventListener:(name,callback)=>handlers.set(name,callback)};
  const window={WorldMap:require('../remote/world-model'),WorldArt:{paintTile(){},paintProp(){}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),{window,
    cancelAnimationFrame(){},requestAnimationFrame:()=>1,ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}}});
  let enabled=true;
  window.createWorldView(canvas,{click:()=>calls.push(['click']),startStroke(x,y){if(!enabled)return false;calls.push(['start',x,y]);return true;},
    strokeTo:(x,y)=>calls.push(['move',x,y]),endStroke:commit=>calls.push(['end',commit])});
  const event=(x,y,button=0)=>({pointerId:1,button,clientX:x,clientY:y,preventDefault(){}});
  handlers.get('pointerdown')(event(500,240));handlers.get('pointermove')(event(596,240));
  handlers.get('pointerup')(event(620,240));handlers.get('lostpointercapture')();
  assert.deepEqual(calls,[['start',0,0],['move',4,0],['move',5,0],['end',true]]);
  calls.length=0;
  handlers.get('pointerdown')(event(500,240));handlers.get('lostpointercapture')({...event(500,240),pointerId:2});
  handlers.get('pointerup')(event(500,240));
  assert.equal(calls.at(-1)[1],true,'a different pointer cannot cancel this stroke');calls.length=0;
  for(const cancel of ['pointercancel','lostpointercapture','keydown']) {
    handlers.get('pointerdown')(event(500,240));
    handlers.get(cancel)(cancel==='keydown'?{key:'Escape',preventDefault(){}}:event(500,240));
    handlers.get('pointerup')(event(620,240));
  }
  assert.equal(calls.filter(c=>c[0]==='end'&&c[1]===false).length,3);
  assert.equal(calls.some(c=>c[0]==='click'),false);
  calls.length=0;enabled=false;handlers.get('pointerdown')(event(500,240));handlers.get('pointerup')(event(500,240));
  assert.deepEqual(calls,[['click']],'rectangle and other tools keep their click behavior');
  calls.length=0;enabled=true;handlers.get('pointerdown')(event(500,240,2));handlers.get('pointerup')(event(500,240,2));
  assert.deepEqual(calls,[],'right mouse button pans without drawing');
});

test('contour handle gestures use pointer travel, ignore other pointers and cancel on Escape without a commit',()=>{
  const handlers=new Map(),calls=[];let top=0;
  const canvas={width:800,height:480,getContext:()=>({}),focus(){},setPointerCapture(){},
    getBoundingClientRect:()=>({left:0,top,width:800,height:480}),addEventListener:(n,cb)=>handlers.set(n,cb)};
  const window={WorldMap:require('../remote/world-model'),WorldArt:{paintTile(){},paintProp(){}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),{window,
    cancelAnimationFrame(){},requestAnimationFrame:()=>1,ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}}});
  window.createWorldView(canvas,{click:()=>calls.push(['click']),pickHandle(){top+=80;return {x:3,y:5,index:1};},
    previewHandle:(h,x,y)=>calls.push(['preview',h.index,x,y]),moveHandle:(h,x,y)=>calls.push(['commit',h.index,x,y]),
    cancelHandle:()=>calls.push(['cancel'])});
  const event=(x,y,id=1)=>({pointerId:id,button:0,clientX:x,clientY:y,preventDefault(){}});
  handlers.get('pointerdown')(event(300,240));handlers.get('pointermove')(event(348,216));
  handlers.get('pointermove')(event(600,600,2));handlers.get('pointerup')(event(348,216));handlers.get('lostpointercapture')();
  assert.deepEqual(calls,[['preview',1,5,4],['commit',1,5,4]]);
  calls.length=0;handlers.get('pointerdown')(event(300,240));handlers.get('keydown')({key:'Escape',preventDefault(){}});
  handlers.get('pointerup')(event(348,216));assert.deepEqual(calls,[['cancel']]);
  calls.length=0;handlers.get('pointerdown')(event(300,240));handlers.get('pointercancel')(event(300,240,2));
  handlers.get('pointerup')(event(300,240));assert.deepEqual(calls,[['commit',1,3,5]],'layout shifts do not move a selected vertex');
});

test('contour rendering draws open paths, closed fills, numbered handles and a distinct entrance',()=>{
  let frame,contour;const calls=[];
  const ctx={setTransform(){},translate(){},scale(){},fillRect(...a){calls.push(['fillRect',...a]);},strokeRect(){},
    beginPath(){},moveTo(){},lineTo(){},stroke(){calls.push(['stroke']);},closePath(){calls.push(['close']);},fill(){calls.push(['fill']);},
    arc(...a){calls.push(['arc',...a]);},fillText(...a){calls.push(['text',...a]);},save(){},restore(){},getTransform:()=>({a:1,d:1,e:0,f:0})};
  const canvas={width:800,height:480,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:800,height:480}),addEventListener(){}};
  const window={WorldMap:require('../remote/world-model'),WorldArt:{paintTile(){},paintProp(){}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),{window,
    cancelAnimationFrame(){},requestAnimationFrame:fn=>{frame=fn;return 1;},ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}}});
  window.createWorldView(canvas,{contour:()=>contour});
  contour={points:[{x:0,y:0},{x:8,y:0},{x:8,y:8}],closed:false,selected:1};frame();
  assert.equal(calls.some(c=>c[0]==='close'),false);assert.equal(calls.filter(c=>c[0]==='arc').length,3);
  assert.deepEqual(calls.filter(c=>c[0]==='text').map(c=>c[1]),['1','2','3']);
  calls.length=0;contour={...contour,closed:true,entrance:{x:4,y:0}};frame();
  assert.equal(calls.some(c=>c[0]==='close'),true);assert.equal(calls.filter(c=>c[0]==='fillRect').length,2,'background and entrance square');
});

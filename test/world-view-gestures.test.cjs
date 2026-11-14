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

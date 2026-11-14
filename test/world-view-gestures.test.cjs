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

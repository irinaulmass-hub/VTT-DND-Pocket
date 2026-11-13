'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const map=require('../remote/world-model');
const {project,mask}=require('../world-exploration');
const state=()=>({explored:{},visible:{},memory:{chunks:{},objects:{}},openDoors:new Set(),revealedSecrets:{}});

test('visual-only tree, roof and shadow overlap is selected without changing occupied cells or anchor access',()=>{
  const objects=[{id:'tree',kind:'tree',x:31,y:2,turn:0},{id:'roof',kind:'house',x:30,y:7,turn:0},
    {id:'bridge',kind:'bridge',x:29,y:12,turn:0}];
  for(const p of objects)assert.equal(map.cellBounds(p).right,31,'physical cells stop before the requested chunk');
  const data={map:{chunks:{},objects},fog:false,seen:{}},s=state(),keys=new Set(['1,0']);
  assert.deepEqual(project(data,keys,s).objects.map(p=>p.id),['tree','roof','bridge']);
  data.fog=true;s.visible=mask([{x:32,y:2},{x:32,y:7},{x:32,y:12}]);
  assert.deepEqual(project(data,keys,s).objects,[],'visible decorative edge never reveals an unseen anchor');
  s.visible=mask(objects.map(p=>({x:p.x,y:p.y})));
  assert.deepEqual(project(data,keys,s).objects.map(p=>p.id),['tree','roof','bridge']);
  objects[0].hidden=true;assert.equal(project(data,keys,s).objects.some(p=>p.id==='tree'),false);
  s.revealedSecrets[':tree']={kind:'tree',x:31,y:2,turn:0};
  assert.equal(project(data,keys,s).objects.some(p=>p.id==='tree'),true);
  assert.equal(map.cellBounds(objects[0]).right,31);
  const negative={id:'negative-crown',kind:'bush',x:-1,y:2,turn:3};
  assert.equal(map.cellBounds(negative).right,-1);
  assert.deepEqual(project({map:{chunks:{},objects:[negative]},fog:false,seen:{}},new Set(['0,0']),state()).objects,[negative]);
  const remembered={id:'tree',kind:'tree',x:31,y:2,turn:0},memoryState=state();
  memoryState.memory.objects[':tree']=remembered;
  const moved={...remembered,x:100};
  assert.deepEqual(project({map:{chunks:{},objects:[moved]},fog:true,seen:{}},keys,memoryState).objects,[remembered]);
});

// Record the actual paintProp primitives in world coordinates. Offscreen roof/crown
// canvases are bounded by their drawImage destinations, including baked shadows.
function recorder() {
  let matrix=[1,0,0,1,0,0],stack=[],points=[];
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  const transform=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
  const collect=(ps,pad=0)=>{for(const [x,y] of ps){bounds.left=Math.min(bounds.left,x-pad);bounds.right=Math.max(bounds.right,x+pad);bounds.top=Math.min(bounds.top,y-pad);bounds.bottom=Math.max(bounds.bottom,y+pad);}};
  const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y])=>transform(x,y));
  const pad=()=>ctx.lineWidth/2*Math.max(Math.abs(matrix[0])+Math.abs(matrix[2]),Math.abs(matrix[1])+Math.abs(matrix[3]));
  const ctx={lineWidth:1,
    save(){stack.push({matrix:[...matrix],lineWidth:this.lineWidth});},
    restore(){const s=stack.pop();matrix=s.matrix;this.lineWidth=s.lineWidth;},
    translate(x,y){matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;},
    scale(x,y){matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;},
    rotate(a){const [x,y,c,d]=matrix,co=Math.cos(a),si=Math.sin(a);matrix[0]=x*co+c*si;matrix[1]=y*co+d*si;matrix[2]=c*co-x*si;matrix[3]=d*co-y*si;},
    beginPath(){points=[];},closePath(){},clip(){},
    moveTo(x,y){points.push(transform(x,y));},lineTo(x,y){points.push(transform(x,y));},
    quadraticCurveTo(...p){for(let i=0;i<p.length;i+=2)points.push(transform(p[i],p[i+1]));},
    ellipse(x,y,rx,ry){points.push(...rect(x-rx,y-ry,rx*2,ry*2));},
    fill(){collect(points);},stroke(){collect(points,pad());},
    fillRect(x,y,w,h){collect(rect(x,y,w,h));},strokeRect(x,y,w,h){collect(rect(x,y,w,h),pad());},
    drawImage(image,x,y,w,h){collect(rect(x,y,w,h));},
    createRadialGradient(){return{addColorStop(){}};},
  };
  return {ctx,bounds};
}

function art(loadedSprites=false) {
  const noop=()=>{},offscreen=new Proxy({},{get:(obj,key)=>obj[key]||noop,set:(obj,key,value)=>(obj[key]=value,true)});
  const window={},globals={window,WorldMap:map,document:{createElement:()=>({getContext:()=>offscreen})}};
  for(const file of ['world-decor.js','world-art.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote',file),'utf8'),globals);
  if(loadedSprites)window.WorldSprites={has:kind=>['goblinAxes','goblinArcher','goblinShield'].includes(kind),
    draw:(ctx)=>ctx.drawImage({},-.49,-.49,.98,.98)}; // .98 is the sprite loader's maximum side.
  return window.WorldArt.paintProp;
}

test('shared visual envelopes contain existing paint commands for every prop, turn and crown variant',()=>{
  for(const paint of [art(),art(true)])for(const kind of Object.keys(map.props))for(let turn=0;turn<4;turn++)for(let x=-16;x<16;x++) {
    const p={id:kind,kind,x,y:-1,turn,open:!!(x%2)},physical=map.cellBounds(p);
    const {ctx,bounds}=recorder();paint(ctx,p,true,map.structures([p]));
    const expected=map.visualBounds(p),eps=1e-8;
    for(const side of ['left','top'])assert.ok(bounds[side]>=expected[side]-eps,`${kind}/${turn}/${x} ${side}: ${bounds[side]} < ${expected[side]}`);
    for(const side of ['right','bottom'])assert.ok(bounds[side]<=expected[side]+eps,`${kind}/${turn}/${x} ${side}: ${bounds[side]} > ${expected[side]}`);
    assert.deepEqual(map.cellBounds(p),physical,'render metadata does not mutate physical bounds');
  }
  assert.equal(map.boundsIntersect({left:0,right:32,top:0,bottom:32},{left:32,right:64,top:0,bottom:32}),false,'touching edges alone do not intersect');
});

test('canvas culling uses the same visual envelope instead of a fixed five-cell anchor margin',()=>{
  let frame;const painted=[];
  const ctx=new Proxy({getTransform:()=>({a:24,d:24,e:120,f:120})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const canvas={width:240,height:240,getContext:()=>ctx,getBoundingClientRect:()=>({width:240,height:240}),addEventListener(){}};
  const window={WorldMap:map,WorldArt:{paintTile(){},paintProp:(ctx,p)=>painted.push(p.id)},addEventListener(){},devicePixelRatio:1};
  const globals={window,requestAnimationFrame:fn=>(frame=fn,1),cancelAnimationFrame(){},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remote/world-view.js'),'utf8'),globals);
  const view=window.createWorldView(canvas);
  view.data({chunks:{},objects:[{id:'crown-edge',kind:'tree',x:5,y:0,turn:0},{id:'outside',kind:'tree',x:8,y:0,turn:0}]});
  frame();assert.deepEqual(painted,['crown-edge']);
});

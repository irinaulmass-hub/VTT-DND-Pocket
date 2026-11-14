const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const world = require('../remote/world-model');

function loadArt() {
  const tiles = [];
  const document = {
    createElement() {
      let scale = 1;
      const stack = [];
      const fills = [];
      const context = {
        fills, curves: 0,
        scale(x) { scale *= x; },
        save() { stack.push(scale); },
        restore() { scale = stack.pop(); },
        setTransform(x) { scale = x; },
        translate() {}, rotate() {}, beginPath() {}, closePath() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
        quadraticCurveTo() { this.curves++; },
        fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
        getImageData() {
          const data = new Uint8ClampedArray(64 * 64 * 4);
          const hex = fills.find(rect => rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1)?.color || '#426c71';
          const color = [1,3,5].map(start => parseInt(hex.slice(start,start+2),16));
          for (let i = 0; i < data.length; i += 4) data.set([...color, 255], i);
          return { data };
        },
        putImageData(image) {
          assert.equal(scale, 1, 'image pixels are written in device coordinates');
          this.image = image.data;
        },
      };
      tiles.push(context);
      return { getContext: () => context };
    },
  };
  const globals = { WorldMap: world, document, window: { WorldDecor: {paint:{}} } };
  const file = path.join(__dirname, '../remote/world-art.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), globals);
  return { ...globals.window.WorldArt, tiles };
}

test('shore pixels transition from the bank to unchanged deep water', () => {
  const { paintTile, tiles } = loadArt();
  const chunks = {};
  for (let y = -1; y <= 1; y++) {
    world.set(chunks, -1, y, 'grass');
    world.set(chunks, 0, y, 'water');
    world.set(chunks, 1, y, 'water');
  }
  paintTile({ drawImage() {} }, chunks, 0, 0, 'water');
  const pixel = x => Array.from(tiles[0].image.subarray((32 * 64 + x) * 4, (32 * 64 + x) * 4 + 4));
  assert.deepEqual(pixel(40), [66, 108, 113, 255]);
  assert.notDeepEqual(pixel(1), pixel(40));
  assert.notDeepEqual(pixel(9), pixel(1));
});

const pixel = (context, x, y) => Array.from(context.image.subarray((y*64+x)*4,(y*64+x)*4+4));

test('world-space shoreline stays continuous across negative and positive chunk edges', () => {
  for (const boundary of [0,32,-32]) {
    const {paintTile,tiles} = loadArt(), chunks={};
    for(let y=boundary-2;y<=boundary+1;y++)for(let x=-1;x<=1;x++)world.set(chunks,x,y,x<0?'grass':'water');
    paintTile({drawImage(){}},chunks,0,boundary-1,'water');
    paintTile({drawImage(){}},chunks,0,boundary,'water');
    for(let x=0;x<64;x++) {
      const a=pixel(tiles[0],x,63),b=pixel(tiles[1],x,0);
      assert.ok(a.every((value,i)=>Math.abs(value-b[i])<=4),`shore seam at ${boundary}/${x}: ${a} / ${b}`);
    }
  }
});

test('a one-cell river keeps deep water at its center and unknown neighbors invent no banks', () => {
  const {paintTile,tiles}=loadArt(),chunks={};
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)world.set(chunks,x,y,x===0?'water':'grass');
  const snapshot=JSON.stringify(chunks);
  paintTile({drawImage(){}},chunks,0,0,'water');
  assert.deepEqual(pixel(tiles[0],32,32),[66,108,113,255]);
  assert.notDeepEqual(pixel(tiles[0],2,32),pixel(tiles[0],32,32));
  assert.equal(JSON.stringify(chunks),snapshot,'painting never mutates the canonical terrain');
  const sparse=loadArt();
  sparse.paintTile({drawImage(){}},{},0,0,'water');
  const edge=pixel(sparse.tiles[0],0,32);
  assert.ok(Math.abs(edge[0]-66)<=3 && Math.abs(edge[1]-108)<=3,'filtered/missing land cannot reveal a coastline');
});

test('natural material transitions meet across chunk boundaries and keep woodland distinct', () => {
  for(const boundary of [0,32,-32]) {
    const {paintTile,tiles}=loadArt(),chunks={};
    for(let y=-1;y<=1;y++)for(let x=boundary-2;x<=boundary+1;x++)world.set(chunks,x,y,x<boundary?'dirt':'woodland');
    paintTile({drawImage(){}},chunks,boundary-1,0,'dirt');
    paintTile({drawImage(){}},chunks,boundary,0,'woodland');
    for(let y=0;y<64;y++) {
      const a=pixel(tiles[0],63,y),b=pixel(tiles[1],0,y);
      assert.ok(a.every((value,i)=>Math.abs(value-b[i])<=5),`material seam at ${boundary}/${y}: ${a} / ${b}`);
    }
    assert.notDeepEqual(pixel(tiles[0],32,32),pixel(tiles[1],32,32));
  }
});

test('fixed village working set is cached on repeated frames without modifying the scene', () => {
  const data=require('../scripts/fixtures/visual-shores-scene.cjs')();
  const {paintTile,tiles}=loadArt(),ctx={drawImage(){}},snapshot=JSON.stringify(data);
  const draw=()=>{for(let y=-18;y<=18;y++)for(let x=-28;x<=28;x++)paintTile(ctx,data.chunks,x,y,world.get(data.chunks,x,y));};
  draw();const first=tiles.length;draw();
  assert.equal(tiles.length,first,'warm frame does not rebuild tiles');
  assert.ok(first<=1024,'bounded atlas supports this working set');
  assert.equal(JSON.stringify(data),snapshot);
});

test('buildings have three stable cached variants in all turns without changing saved props', () => {
  const {paintProp}=loadArt(),images=[];
  const ctx=new Proxy({drawImage:(sprite)=>images.push(sprite)}, {
    get:(object,key)=>object[key]||(()=>{}),set:(object,key,value)=>(object[key]=value,true),
  });
  for(const kind of ['house','tavern','barn']) {
    const distinct=new Set();
    for(let x=0;x<3;x++)for(let turn=0;turn<4;turn++) {
      const prop={id:'building',kind,x,y:0,turn},saved=JSON.stringify(prop);
      paintProp(ctx,prop,false);const sprite=images.at(-1);distinct.add(sprite);
      paintProp(ctx,{...prop},false);
      assert.equal(images.at(-1),sprite,'editor and TV reuse identical input artwork');
      assert.equal(JSON.stringify(prop),saved);
    }
    assert.equal(distinct.size,6,'three variants, each with two world-light orientations');
  }
});

test('rounded water corners cut only the tip, preserving the non-walkable cell center', () => {
  const {paintTile,tiles}=loadArt(),chunks={};
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)world.set(chunks,x,y,x<0||y<0?'grass':'water');
  paintTile({drawImage(){}},chunks,0,0,'water');
  assert.ok(pixel(tiles[0],1,1)[0]>100,'dry corner tip is rounded into the water tile');
  assert.deepEqual(pixel(tiles[0],32,32),[66,108,113,255],'center remains deep water');
});

test('mixed bank materials and diagonal contacts leave no undefined or black corner pixels', () => {
  const {paintTile,tiles}=loadArt();
  for(let turn=0;turn<4;turn++) {
    const chunks={};
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)world.set(chunks,x,y,'water');
    const sides=[[0,-1],[1,0],[0,1],[-1,0]];
    for(const [j,type] of ['grass','dirt'].entries()) {
      const [x,y]=sides[(turn+j)%4];world.set(chunks,x,y,type);
    }
    const [a,b]=[sides[turn],sides[(turn+1)%4]];
    world.set(chunks,a[0]+b[0],a[1]+b[1],'woodland');
    paintTile({drawImage(){}},chunks,0,0,'water');
    const data=tiles.at(-1).image;
    for(let i=0;i<data.length;i+=4)assert.ok(data[i]>30 && data[i+1]>30 && data[i+2]>30 && data[i+3]===255);
  }
});

test('a road rounds a bend and fills the interior corners of a wide junction', () => {
  const { paintTile, tiles } = loadArt();
  const chunks = {};
  for (const [x, y] of [[0, 0], [0, -1], [1, 0]]) world.set(chunks, x, y, 'path');
  const canvas = { drawImage() {} };
  paintTile(canvas, chunks, 0, 0, 'path');
  assert.equal(tiles[0].curves, 3, 'each visual layer follows the bend');

  world.set(chunks, 1, -1, 'path');
  paintTile(canvas, chunks, 0, 0, 'path');
  assert.ok(tiles[1].fills.some(rect => rect.x > 0 && rect.y === 0 &&
    rect.width >= .5 && rect.height >= .5 && rect.color === '#c3a779'));
});

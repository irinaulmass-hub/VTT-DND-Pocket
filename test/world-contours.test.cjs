'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { editContour, validContour } = require('../remote/world-generators');
const points = coords => coords.map(([x,y]) => ({x,y}));

test('Path edits are independent, preserve coordinates and reject collapsed or out-of-world segments', () => {
  const source=points([[-4,-2],[4,-2],[8,2]]), before=structuredClone(source);
  const moved=editContour('path',source,null,{type:'move',index:1,x:3,y:5});
  assert.deepEqual(moved.points,points([[-4,-2],[3,5],[8,2]]));assert.deepEqual(source,before);
  assert.deepEqual(editContour('path',source,null,{type:'insert',index:0}).points,points([[-4,-2],[0,-2],[4,-2],[8,2]]));
  assert.deepEqual(editContour('path',source,null,{type:'remove',index:1}).points,points([[-4,-2],[8,2]]));
  for(const operation of [{type:'move',index:1,x:-4,y:-2},{type:'move',index:0,x:1e9,y:0},{type:'move',index:0,x:NaN,y:0},
    {type:'move',index:99,x:0,y:0},{type:'unknown',index:0}]) assert.throws(()=>editContour('path',source,null,operation),RangeError);
  assert.throws(()=>editContour('path',source.slice(0,2),null,{type:'remove',index:0}),RangeError);
});

test('Forest contour edits reject intersections, duplicate vertices and admission overflow', () => {
  const source=points([[0,0],[12,0],[12,12],[0,12]]), before=structuredClone(source);
  assert.equal(validContour('forest',source),true);
  assert.throws(()=>editContour('forest',source,null,{type:'move',index:1,x:-2,y:8}),RangeError);
  assert.throws(()=>editContour('forest',source,null,{type:'move',index:1,x:0,y:0}),RangeError);
  assert.throws(()=>editContour('forest',source,null,{type:'move',index:1,x:1000,y:0}),RangeError);
  assert.equal(editContour('forest',source,null,{type:'insert',index:3}).points.length,5);
  assert.deepEqual(source,before);
  assert.throws(()=>editContour('path',points([[0,0],[1,0]]),null,{type:'insert',index:0}),RangeError,'rounded midpoint cannot duplicate an endpoint');
});

test('Room corner edits keep walls orthogonal and carry the entrance along its wall', () => {
  const source=points([[0,0],[10,0],[10,8],[0,8]]), entry={x:5,y:0};
  const next=editContour('room',source,entry,{type:'move',index:0,x:-4,y:-2});
  assert.deepEqual(next.points,points([[-4,-2],[10,-2],[10,8],[-4,8]]));
  assert.deepEqual(next.entrance,{x:3,y:-2});assert.equal(validContour('room',next.points,next.entrance),true);
  assert.deepEqual(entry,{x:5,y:0});assert.deepEqual(source,points([[0,0],[10,0],[10,8],[0,8]]));
  const movedEntry=editContour('room',source,entry,{type:'entrance',x:10,y:4});assert.deepEqual(movedEntry.entrance,{x:10,y:4});
  assert.throws(()=>editContour('room',source,entry,{type:'entrance',x:0,y:0}),RangeError);
  assert.throws(()=>editContour('room',source,entry,{type:'move',index:0,x:10,y:8}),RangeError);
  assert.throws(()=>editContour('room',source,entry,{type:'remove',index:0}),RangeError);
});

test('District handles preserve the rectangle and enforce the existing district limits', () => {
  const source=points([[-12,-12],[12,-12],[12,12],[-12,12]]);
  const next=editContour('district',source,null,{type:'move',index:2,x:20,y:18});
  assert.deepEqual(next.points,points([[-12,-12],[20,-12],[20,18],[-12,18]]));
  assert.equal(validContour('district',next.points),true);
  assert.throws(()=>editContour('district',source,null,{type:'move',index:2,x:-10,y:-10}),RangeError);
  assert.throws(()=>editContour('district',source,null,{type:'insert',index:0}),RangeError);
});

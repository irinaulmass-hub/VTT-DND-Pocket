const {test}=require('node:test'),assert=require('node:assert/strict'),{pack,compact,overlap}=require('../dm/layout-model');
function valid(items){for(const a of items){assert.ok(a.x>=0&&a.x+a.w<=12&&a.y>=0);for(const b of items)if(a!==b)assert.equal(overlap(a,b),false);}}
test('moved panel displaces neighbours without overlap',()=>{const result=pack([{id:'a',x:0,y:0,w:4,h:12},{id:'b',x:4,y:0,w:8,h:5},{id:'c',x:4,y:4,w:4,h:5}],'c');valid(result);assert.equal(result.find(r=>r.id==='c').y,4);});
test('compact fills gaps beside tall cards',()=>{const result=compact(pack([{id:'a',x:0,y:0,w:4,h:20},{id:'b',x:4,y:0,w:8,h:5},{id:'c',x:4,y:25,w:4,h:5}]));valid(result);assert.equal(result.find(r=>r.id==='c').y,5);});
test('resizing and corrupted geometry stay bounded',()=>{valid(pack([{id:'a',x:11,y:-2,w:100,h:8},{id:'b',x:0,y:0,w:4,h:5}]));});
test('dense packing reuses horizontal gaps',()=>{const {dense}=require('../dm/layout-model');const r=dense([{id:'map',w:8,h:5},{id:'party',w:6,h:20},{id:'small',w:4,h:4}]);valid(r);assert.equal(r.find(i=>i.id==='small').x,8);assert.equal(r.find(i=>i.id==='small').y,0);});

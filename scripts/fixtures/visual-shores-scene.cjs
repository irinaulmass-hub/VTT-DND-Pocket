'use strict';
// Fixed, disposable geometry for comparisons. No generator or production data writes.
const map = require('../../remote/world-model');
module.exports = function scene() {
  const chunks = {}, objects = [];
  for (let y = -18; y <= 18; y++) for (let x = -28; x <= 28; x++) {
    const river = -14 + Math.round(2.5 * Math.sin(y * .22));
    let type = Math.abs(x - river) <= 1 ? 'water' : 'grass';
    if (type !== 'water' && (Math.abs(y) <= 1 || (x >= 2 && x <= 3))) type = 'path';
    if (x >= 16 + Math.sin(y * .3) * 2) type = 'woodland';
    if (x >= -6 && x <= 9 && y >= -11 && y <= -6) type = 'dirt';
    if (x >= -5 && x <= -1 && y >= 6 && y <= 10) type = 'stone';
    map.set(chunks, x, y, type);
  }
  objects.push({id:'crossing',kind:'bridge',x:-14,y:0,turn:0});
  for(const [i,[kind,x,y,turn]] of [
    ['house',-7,-5,0],['house',-1,-5,1],['house',6,-5,2],['house',12,-5,3],
    ['tavern',-3,5,0],['tavern',7,6,1],['barn',-6,-13,0],['barn',5,-13,1],
    ['well',-2,1,0],['cart',7,-9,0],['barrel',0,4,0],['barrel',1,4,0],
    ['fence',-8,7,0],['fence',-8,9,0],['bush',-9,3,0],['bush',-20,4,1],
    ['chest',11,1,0],
  ].entries()) objects.push({id:'visual-'+i,kind,x,y,turn,...(kind==='chest'?{hidden:true}:{})});
  for(let y=-14;y<=14;y+=3)for(let x=18;x<=26;x+=3)
    objects.push({id:`tree-${x}-${y}`,kind:'tree',x:x+(y%2),y,turn:(y+16)%4});
  for(const [i,[x,y]] of [[-23,-9],[-21,-12],[-24,7],[-22,10],[-19,12],[12,13],[14,11]].entries())
    objects.push({id:'outlier-'+i,kind:'tree',x,y,turn:i%4});
  return {chunks,objects};
};

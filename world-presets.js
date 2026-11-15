'use strict';

const map = require('./remote/world-model');
const { generationChange, roomThemes } = require('./remote/world-generators');

// Editable recipes, not flattened images. Each invocation owns its independent data.
module.exports = function createWorldPreset(theme) {
  if (theme === 'none' || !Object.hasOwn(roomThemes, theme)) throw new RangeError('Неизвестная заготовка карты');
  const draft = { chunks: {}, objects: [], generators: [] };
  for (let y=-12;y<=12;y++) for(let x=-16;x<=16;x++) map.set(draft.chunks,x,y,'grass');
  const recipe = { id:'preset-'+theme, kind:'room', version:1, seed:17,
    params:{floor:theme==='crypt'?'stone':'wood',furnishing:theme,
      points:[{x:-12,y:-9},{x:12,y:-9},{x:12,y:9},{x:-12,y:9}],entrance:{x:0,y:9}} };
  const change=generationChange(recipe,draft);
  const chunks=change.chunks, objects=change.objects.after;
  for(let y=10;y<=12;y++)for(let x=-1;x<=1;x++)map.set(chunks,x,y,'path');
  for(const [i,[x,y]] of [[-15,-10],[-15,-4],[-15,3],[15,-8],[15,0],[15,7]].entries())
    objects.push({id:'preset-tree-'+i,kind:'tree',x,y,turn:i%4,hidden:false});
  objects.push({id:'preset-well',kind:'well',x:-15,y:9,turn:0,hidden:false});
  return {chunks,objects,generators:change.generators.after};
};

'use strict';

const map = require('./remote/world-model');
const { generationChange, roomThemes } = require('./remote/world-generators');

function village() {
  const draft={chunks:{},objects:[],generators:[]};
  for(let y=-29;y<=29;y++)for(let x=-44;x<=44;x++)map.set(draft.chunks,x,y,'grass');
  const add=recipe=>{
    const change=generationChange({version:1,seed:29,...recipe},draft);
    draft.chunks=change.chunks;draft.objects=change.objects?.after || draft.objects;draft.generators=change.generators.after;
  };
  const points=coords=>coords.map(([x,y])=>({x,y}));
  add({id:'village-river',kind:'path',params:{terrain:'water',width:3,points:points([[18,-29],[16,-12],[18,5],[20,18],[15,29]])}});
  add({id:'village-road',kind:'path',params:{terrain:'path',width:3,points:points([[-34,7],[-14,6],[3,7],[14,7]])}});
  add({id:'village-east-road',kind:'path',params:{terrain:'path',width:3,points:points([[22,7],[36,7],[42,15]])}});
  add({id:'village-district',kind:'district',params:{count:8,points:points([[-29,-21],[8,-21],[8,1],[-29,1]])}});
  const plots=[
    ['wood','pine',78,[[-44,-28],[-33,-26],[-35,0],[-39,16],[-44,23]]],
    ['wheat','field',92,[[-28,13],[-11,13],[-11,27],[-30,26]]],
    ['garden','garden',88,[[25,15],[39,15],[41,27],[25,27]]],
    ['orchard','orchard',100,[[26,-25],[41,-23],[40,-8],[26,-8]]],
    ['meadow','meadow',80,[[27,-3],[42,-3],[43,4],[26,4]]],
    ['cemetery','graveyard',100,[[-6,18],[7,18],[7,27],[-6,27]]],
  ];
  for(const [id,biome,density,polygon] of plots)add({id:'village-'+id,kind:'forest',params:{biome,density,orientation:0,points:points(polygon)}});
  add({id:'village-farm-fence',kind:'path',params:{terrain:'fence',width:1,points:points([[-30,12],[-10,12],[-10,27]])}});
  const props=[
    ['bridge',18,7,0],['tavern',0,11,0],['barn',-22,9,0],['stoneTower',-33,7,0],
    ['marketStall',-5,4,0],['marketStall',2,4,2],['fountain',-1,-3,0],['well',-14,4,0],
    ['wagon',-11,9,0],['hay',-26,10,0],['hay',-24,10,0],['cart',-17,10,0],
    ['boulder',23,1,0],['boulder',14,18,0],['statue',0,17,0],['deadTree',9,24,0],
    ['tree',10,10,0],['tree',-9,16,0],['appleTree',9,-24,0],['tree',-31,-25,0],
    ['barrel',-3,12,0],['crate',-4,13,0],['garland',0,9,0],['anvil',7,13,0],['oven',8,14,0],
  ];
  for(let y=-26;y<28;y+=4)props.push(['reeds',y<8?20:23,y,0]);
  props.forEach(([kind,x,y,turn],i)=>draft.objects.push({id:'village-detail-'+i,kind,x,y,turn,hidden:false}));
  return draft;
}

// Editable recipes, not flattened images. Each invocation owns its independent data.
module.exports = function createWorldPreset(theme) {
  if(theme==='village')return village();
  if (theme === 'none' || !Object.hasOwn(roomThemes, theme)) throw new RangeError('Неизвестная заготовка карты');
  const draft = { chunks: {}, objects: [], generators: [] };
  for (let y=-9;y<=9;y++) for(let x=-13;x<=13;x++) map.set(draft.chunks,x,y,'grass');
  const recipe = { id:'preset-'+theme, kind:'room', version:1, seed:17,
    params:{floor:theme==='crypt'?'stone':'wood',furnishing:theme,
      points:[{x:-9,y:-6},{x:9,y:-6},{x:9,y:6},{x:-9,y:6}],entrance:{x:0,y:6}} };
  const change=generationChange(recipe,draft);
  const chunks=change.chunks, objects=change.objects.after;
  for(let y=7;y<=9;y++)for(let x=-1;x<=1;x++)map.set(chunks,x,y,'path');
  for(const [i,[x,y]] of [[-12,-7],[-12,-2],[-12,3],[12,-6],[12,0],[12,6]].entries())
    objects.push({id:'preset-tree-'+i,kind:'tree',x,y,turn:i%4,hidden:false});
  objects.push({id:'preset-well',kind:'well',x:-12,y:7,turn:0,hidden:false});
  return {chunks,objects,generators:change.generators.after};
};

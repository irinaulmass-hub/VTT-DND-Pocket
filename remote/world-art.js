'use strict';

(() => {
  const { get, terrain, props } = WorldMap;
  const sides = [[0,-1],[1,0],[0,1],[-1,0]];
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const colors = { grass:'#788653', dirt:'#9c7955', stone:'#858279', wood:'#98704c', water:'#477f89', forest:'#566748' };
  const cache = new Map();
  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function random(seed) {
    let state = seed + 183;
    return () => ((state = Math.imul(state, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  }
  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
  }
  function grain(ctx, seed, colors, count = 44) {
    const rnd = random(seed);
    for (let i = 0; i < count; i++) ellipse(ctx, rnd(), rnd(), .01 + rnd() * .045, .007 + rnd() * .022, colors[i % colors.length]);
  }
  function path(ctx, mask) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of [[.61,'#666e47'],[.55,'#9f835c'],[.43,'#b2956d']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      sides.forEach(([dx,dy], i) => {
        if (!(mask & (1 << i))) return;
        ctx.moveTo(.5 + dx * .53, .5 + dy * .53);
        ctx.quadraticCurveTo(.5 + dx * .22 - dy * .045, .5 + dy * .22 + dx * .045, .5, .5);
      });
      ctx.stroke();
      ellipse(ctx,.5,.5,width / 2,width / 2,color);
    }
  }
  const surrounding = [...sides, ...corners];
  const sand = [144,134,103];
  const shallow = [104,151,147];
  const baseMaterial = type => ['forest','denseForest','path'].includes(type) ? 'grass' : type;
  function smooth(x) {
    x = Math.max(0, Math.min(1, x));
    return x*x*(3-2*x);
  }
  function shoreColor(type) {
    if (!type) return sand;
    const ground = baseMaterial(type);
    if (ground === 'stone') return [129,125,112];
    const hex = colors[ground] || terrain[ground][1];
    return [1,3,5].map(start => parseInt(hex.slice(start,start+2),16));
  }
  function shore(ctx, neighbors) {
    const dry = [];
    neighbors.forEach((type, i) => {
      if (type !== 'water') dry.push({ offset: surrounding[i], color: shoreColor(type) });
    });
    if (!dry.length) return;
    const size = 64;
    const image = ctx.getImageData(0,0,size,size);
    for (let row=0;row<size;row++) for (let col=0;col<size;col++) {
      const x=(col+.5)/size,y=(row+.5)/size;
      let distance=Infinity, total=0, edgeX=1, edgeY=1;
      const land=[0,0,0];
      for (const {offset:[dx,dy], color} of dry) {
        const a=dx<0?x:dx>0?1-x:0, b=dy<0?y:dy>0?1-y:0;
        const squared=a*a+b*b;
        if (squared >= .35**2) continue;
        if (dy===0) edgeX=Math.min(edgeX,a);
        if (dx===0) edgeY=Math.min(edgeY,b);
        distance=Math.min(distance,squared);
        const weight=(.35-Math.sqrt(squared))**3/(.012+squared);
        for(let i=0;i<3;i++) land[i]+=color[i]*weight;
        total+=weight;
      }
      if (!total) continue;
      const ripple=.024*Math.sin(x*Math.PI*4)*Math.sin(y*Math.PI*2);
      const round=Math.max(0,.18-Math.abs(edgeX-edgeY));
      const roundedEdge=Math.min(edgeX,edgeY)-round*round/.72;
      const depth=Math.min(Math.sqrt(distance),roundedEdge)+ripple;
      const wet=smooth((depth-.02)/.17), deep=smooth((depth-.11)/.21);
      const offset=(row*size+col)*4;
      for(let i=0;i<3;i++) {
        const shore=land[i]/total*(1-wet)+shallow[i]*wet;
        image.data[offset+i]=shore*(1-deep)+image.data[offset+i]*deep;
      }
    }
    ctx.putImageData(image,0,0);
  }
  function blendLand(ctx, type, neighbors) {
    const own = baseMaterial(type);
    const nearby = [];
    neighbors.forEach((material, i) => {
      if (material) nearby.push({ offset: surrounding[i], material, color: shoreColor(material) });
    });
    if (nearby.every(entry => entry.material === own)) return;

    const size = 64;
    const image = ctx.getImageData(0,0,size,size);
    const base = shoreColor(own);
    for (let row=0;row<size;row++) for (let col=0;col<size;col++) {
      const x=(col+.5)/size, y=(row+.5)/size;
      const mixed = [...base];
      let total = 1, blend = 0;
      for (const {offset:[dx,dy], material, color} of nearby) {
        const a=dx<0?x:dx>0?1-x:0, b=dy<0?y:dy>0?1-y:0;
        const squared=a*a+b*b;
        if (squared >= .23**2) continue;
        const weight=smooth(1-Math.sqrt(squared)/.23);
        for (let c=0;c<3;c++) mixed[c]+=weight*color[c];
        total+=weight;
        if (material !== own) blend=Math.max(blend,weight);
      }
      if (!blend) continue;
      const index=(row*size+col)*4;
      for(let c=0;c<3;c++) image.data[index+c]=image.data[index+c]*(1-blend)+mixed[c]/total*blend;
    }
    ctx.putImageData(image,0,0);
  }
  function leaf(ctx, x, y, angle, length, color) {
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(length*.18,-length*.49,length,0);
    ctx.quadraticCurveTo(length*.43,length*.48,0,0);
    ctx.fill();
    ctx.restore();
  }
  function foliage(ctx, x, y, radius, seed, shrub = false) {
    const rnd = random(seed);
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate((rnd()-.5)*.55);
    ctx.scale(radius,radius*(shrub?.72:.9));
    const outline = Array.from({length:24},(_,i) => {
      const a = i*Math.PI/12;
      const r = .68+rnd()*.22+(i%2)*.10;
      return [Math.cos(a)*r,Math.sin(a)*r];
    });
    polygon(ctx, outline.map(([a,b])=>[a+.11,b+.21]), '#252e2258');
    polygon(ctx, outline, shrub?'#38472b':'#2f4332');
    const shades = shrub
      ? ['#4e6036','#5f7040','#76834c','#a0a267']
      : ['#415738','#536a41','#687b49','#87945c'];
    for (let i=0;i<46;i++) {
      const a = rnd()*Math.PI*2, d = Math.sqrt(rnd())*.73;
      const px = Math.cos(a)*d, py = Math.sin(a)*d;
      const light = Math.min(3,Math.floor(rnd()*2 + (px+py<-.21?1:0) + (i%11===0?1:0)));
      leaf(ctx,px,py,a+(rnd()-.5)*1.4,.12+rnd()*(shrub?.23:.20),shades[light]);
    }
    ctx.restore();
  }
  function roof(ctx, width, height, tavern) {
    const w=width/2, h=height/2;
    polygon(ctx,[[-w,-h+.06],[w-.12,-h],[w,h-.08],[-w+.08,h]],'#48382d');
    polygon(ctx,[[-w+.08,-h+.14],[w-.15,-h+.08],[w-.06,-.08],[-w+.06,-.08]],tavern?'#9e6d50':'#827b59');
    polygon(ctx,[[-w+.06,-.08],[w-.06,-.08],[w-.13,h-.14],[-w+.14,h-.09]],tavern?'#76513f':'#646046');
    ctx.strokeStyle='#45382b77';
    ctx.lineWidth=.023;
    for(let y=-h+.23, row=0;y<h-.11;y+=.17,row++) {
      ctx.beginPath();
      ctx.moveTo(-w+.11,y);
      ctx.lineTo(w-.12,y+.018);
      for(let x=-w+.24+(row%2)*.13;x<w-.15;x+=.29) {
        ctx.moveTo(x,y);
        ctx.lineTo(x+.015,y-.13);
      }
      ctx.stroke();
    }
    polygon(ctx,[[-w+.03,-.11],[w-.05,-.13],[w-.08,.01],[-w+.09,.02]],tavern?'#c08e66':'#a79b70');
    ctx.fillStyle='#49433a';ctx.fillRect(w*.44,-h*.63,.39,.48);
    ctx.fillStyle='#969184';ctx.fillRect(w*.44,-h*.63,.33,.40);
    ctx.fillStyle='#423e36';ctx.fillRect(w*.44+.07,-h*.63+.07,.19,.21);
    polygon(ctx,[[-.39,h-.16],[.39,h-.16],[.49,h+.18],[-.49,h+.18]],'#7c654c');
    ctx.fillStyle='#b29973';ctx.fillRect(-.41,h+.02,.82,.07);
    if(tavern) {
      polygon(ctx,[[.55,h-.37],[1.06,h-.41],[1.08,h-.16],[.56,h-.11]],'#d2a061');
      ctx.fillStyle='#654931';ctx.fillRect(.65,h-.29,.30,.045);
    }
  }
  function tile(type, mask, neighbors, seed) {
    const key = [type,mask,neighbors?.join(','),seed].join(':');
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.scale(64,64);
    const forest = type === 'forest' || type === 'denseForest';
    ctx.fillStyle = colors[type === 'path' || forest ? 'grass' : type] || terrain[type][1];
    ctx.fillRect(0,0,1,1);
    if (type === 'grass' || type === 'path' || type === 'forest' || type === 'dirt') {
      ellipse(ctx,.29+seed*.06,.33,.22,.17,'#d9c28c18');
      ellipse(ctx,.62-seed*.04,.71,.23,.15,'#35462d1e');
    }
    if (type !== 'water') grain(ctx, seed, ['#e4d5a32c','#3033222e','#b5b38325']);
    if (type === 'path') {
      path(ctx,mask);
      for (let i=0;i<7;i++) ellipse(ctx,.25+(i*13%31)/60,.26+((i+seed)*7%29)/60,.012,.009,'#63533c70');
    } else if (type === 'water') {
      ctx.fillStyle='#9ac1ba66';
      ctx.fillRect(.23,.26+seed/14,.34,.03);
      shore(ctx,neighbors);
    } else if (forest) {
      const layouts = [
        [[.36,.39,.38],[.69,.71,.26]], [[.64,.35,.34],[.31,.67,.29]],
        [[.54,.57,.44],[.21,.27,.16]], [[.34,.60,.37],[.70,.31,.28]],
        [[.53,.35,.36],[.65,.74,.25]],
      ];
      const cover=mask===15;
      ellipse(ctx,.5,.52,.47,.42,cover?'#475a3f7a':'#4f653951');
      const open = sides.findIndex((_, i) => !(mask & (1 << i)));
      const [dx,dy] = open < 0 ? [0,0] : sides[open];
      for (const [i,[x,y,r]] of layouts[seed].entries()) {
        foliage(ctx,x-dx*.045,y-dy*.045,type==='denseForest'?r*1.17:cover?r:r*.90,seed*19+i*7);
      }
      if (type==='denseForest') {
        foliage(ctx,.26,.72,.25,seed*13+37);
        foliage(ctx,.75,.26,.24,seed*13+53);
      }
      if (!cover) foliage(ctx,.5+dx*.30,.5+dy*.30,.14,seed+7,true);
    } else if (type === 'caveFloor' || type === 'mud') {
      const rnd = random(seed*65+19);
      for (let i=0;i<9;i++) {
        const x=.13+rnd()*.74, y=.15+rnd()*.70, r=.025+rnd()*.075;
        if (type === 'caveFloor') {
          polygon(ctx,[[x-r,y+.018],[x-r*.7,y-r*.55],[x+r*.23,y-r*.7],[x+r,y-r*.06],[x+r*.62,y+r*.40]],
            i%3?'#777367':'#4d4b44');
          if (i%3) { ctx.fillStyle='#a8a08c66';ctx.fillRect(x-r*.5,y-r*.41,r*.82,.012); }
        } else {
          ellipse(ctx,x,y,r*1.5,r*.62,i%3?'#604a38':'#84694c');
          if (i%3) ellipse(ctx,x-r*.24,y-r*.18,r*.76,.014,'#b59b763b');
        }
      }
    } else if (type === 'stone') {
      const rnd=random(seed*47);
      ctx.fillStyle='#605e55';
      ctx.fillRect(0,0,1,1);
      for(let row=0;row<3;row++) for(let col=-1;col<3;col++) {
        const x=col*.45+(row%2)*.23, y=row/3;
        const tone=['#817d70','#969081','#8a8577','#777468'][Math.floor(rnd()*4)];
        polygon(ctx,[[x+.02,y+.052],[x+.08,y+.014],[x+.413,y+.022],[x+.443,y+.086],
          [x+.419,y+.303],[x+.345,y+.326],[x+.039,y+.311]],tone);
        ctx.strokeStyle='#d1c4a240';ctx.lineWidth=.016;
        ctx.beginPath();ctx.moveTo(x+.081,y+.048);ctx.lineTo(x+.367,y+.052);ctx.stroke();
      }
    } else if (type === 'wood') {
      ctx.strokeStyle = '#3a322980';
      ctx.lineWidth = .018;
      for (let i=1;i<4;i++) {
        const y = i/4;
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1,y);ctx.stroke();
        const x = .21+((i*7+seed)%8)/13;
        ctx.beginPath();ctx.moveTo(x,y-.25);ctx.lineTo(x,y);ctx.stroke();
      }
    } else if (type === 'grass') {
      const rnd=random(seed*79);
      for(let i=0;i<8;i++) {
        const x=.12+rnd()*.76,y=.18+rnd()*.66;
        for(let j=0;j<3;j++) leaf(ctx,x,y,-1.9+j*.42,.031+rnd()*.035,j===0?'#596746a0':'#a4a47588');
      }
    }
    if (type !== 'water' && neighbors) blendLand(ctx,type,neighbors);
    if (cache.size >= 384) cache.delete(cache.keys().next().value);
    cache.set(key,canvas);
    return canvas;
  }
  function paintTile(ctx,chunks,x,y,type,destination=[x,y,1,1]) {
    let mask=0;
    const rawNeighbors = surrounding.map(([dx,dy]) => get(chunks,x+dx,y+dy));
    // Water owns its shoreline. Dry ground only blends with other dry surfaces.
    const neighbors = type === 'water' ? rawNeighbors : rawNeighbors.map(value =>
      value && value !== 'water' ? baseMaterial(value) : null);
    if (type === 'path' || type === 'forest' || type === 'denseForest') {
      sides.forEach(([dx,dy],i) => {
        const neighbor=get(chunks,x+dx,y+dy);
        if (type==='path' ? neighbor==='path' : neighbor==='forest'||neighbor==='denseForest') mask |= 1<<i;
      });
    }
    const seed=((Math.imul(x,374761393)^Math.imul(y,668265263))>>>0)%5;
    const different = type === 'water' || neighbors.some(value => value && value !== baseMaterial(type));
    ctx.drawImage(tile(type,mask,different ? neighbors : null,seed),...destination);
  }
  function stoneWall(ctx, prop, selected, layout) {
    for (const [x,y] of WorldMap.wallCells(prop)) {
      const mask = layout.wallMask(x,y);
      ctx.save();
      ctx.translate(x+.5,y+.5);
      if (prop.hidden) ctx.globalAlpha = .65;
      for (const [width,color] of [[.31,'#3e4138'],[.23,'#8a8876']]) {
        const r = width/2;
        ctx.fillStyle = color;
        ctx.fillRect(-r,-r,width,width);
        if (mask & 1) ctx.fillRect(-r,-.501,width,.501);
        if (mask & 2) ctx.fillRect(0,-r,.501,width);
        if (mask & 4) ctx.fillRect(-r,0,width,.501);
        if (mask & 8) ctx.fillRect(-.501,-r,.501,width);
      }
      ctx.fillStyle = '#d0c3a08a';
      ctx.fillRect(-.09,-.083,.18,.025);
      for (let i = 0; i < sides.length; i++) {
        if (!(mask & (1 << i))) continue;
        ctx.save();
        ctx.rotate(i*Math.PI/2);
        ctx.fillStyle = '#514f43';
        ctx.fillRect(-.11,-.34,.22,.025);
        ctx.fillStyle = '#c3b898';
        ctx.fillRect(-.09,-.48,.022,.13);
        ctx.restore();
      }
      if (selected) {
        ctx.strokeStyle='#ffe3a2';
        ctx.lineWidth=.035;
        ctx.strokeRect(-.47,-.47,.94,.94);
      }
      ctx.restore();
    }
  }
  function door(ctx, open) {
    if (open) {
      ctx.fillStyle = '#42372a';
      ctx.fillRect(-.50,-.15,.11,.30);
      ctx.fillRect(.39,-.15,.11,.30);
      ctx.fillStyle = '#a9794d';
      ctx.fillRect(-.40,-.06,.13,.51);
      return;
    }
    ctx.fillStyle='#42372a';
    ctx.fillRect(-.501,-.155,1.002,.31);
    ctx.fillStyle='#ad9673';
    ctx.fillRect(-.50,-.123,1,.246);
    ctx.fillStyle='#694831';
    ctx.fillRect(-.391,-.10,.782,.20);
    ctx.fillStyle='#a9794d';
    ctx.fillRect(-.367,-.08,.73,.16);
    ctx.fillStyle='#6d4c34';
    ctx.fillRect(-.29,-.035,.59,.018);
    ctx.fillRect(-.31,.026,.65,.017);
    ctx.fillStyle='#4b4640';
    ctx.fillRect(-.39,-.089,.11,.048);
    ctx.fillRect(-.39,.042,.11,.048);
    ellipse(ctx,.26,.02,.045,.034,'#f0c47a');
  }
  function paintProp(ctx,prop,selected,layout) {
    if (prop.kind === 'wall') {
      stoneWall(ctx,prop,selected,layout || WorldMap.structures([prop]));
      return;
    }
    const [,w,h]=props[prop.kind];
    ctx.save();
    const center = WorldMap.footprint(prop);
    ctx.translate(center.x,center.y);
    ctx.rotate((prop.kind === 'door' ? (layout?.doorAxis(prop) ?? prop.turn) : prop.turn)*Math.PI/2);
    if (prop.hidden) ctx.globalAlpha=.65;
    const decor = window.WorldDecor.paint[prop.kind];
    if (window.WorldSprites?.has(prop.kind)) {
      window.WorldSprites.draw(ctx, prop.kind);
    } else if (decor) {
      ctx.save();
      ctx.scale(w,h);
      decor(ctx);
      ctx.restore();
    } else if (prop.kind==='door') {
      door(ctx, prop.open);
    } else if (prop.kind==='tree' || prop.kind==='bush') {
      const seed = ((Math.imul(prop.x,53)^Math.imul(prop.y,107))>>>0)%17;
      foliage(ctx,0,0,prop.kind==='tree'?.59:.47,seed,prop.kind==='bush');
    } else {
      const building=prop.kind==='house'||prop.kind==='tavern';
      ctx.fillStyle='#272d2475';ctx.fillRect(-w/2+.10,-h/2+.16,w,h);
      ctx.fillStyle='#45382c';ctx.fillRect(-w/2,-h/2,w,h);
      ctx.fillStyle=building?'#87624a':'#a78056';
      ctx.fillRect(-w/2+.055,-h/2+.055,w-.11,h-.11);
      if (building) {
        roof(ctx,w,h,prop.kind==='tavern');
      } else {
        ctx.strokeStyle='#534535b0';ctx.lineWidth=.035;
        for (let x=-w/2+.17;x<w/2-.08;x+=.22) {
          ctx.beginPath();ctx.moveTo(x,-h/2+.07);ctx.lineTo(x,h/2-.07);ctx.stroke();
        }
        if (prop.kind==='bridge') {
          ctx.fillStyle='#6d5237';ctx.fillRect(-w/2,-h/2+.06,w,.1);ctx.fillRect(-w/2,h/2-.16,w,.1);
          for (const x of [-w/2+.11,0,w/2-.11]) for (const y of [-h/2+.12,h/2-.12]) {
            polygon(ctx,[[x-.11,y-.11],[x+.09,y-.10],[x+.10,y+.10],[x-.08,y+.12]],'#523f30');
            ctx.fillStyle='#b19469';ctx.fillRect(x-.058,y-.057,.116,.10);
          }
        }
      }
    }
    if (selected) {
      ctx.strokeStyle='#ffe3a2';ctx.lineWidth=.12;ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.restore();
  }
  window.WorldArt={paintTile,paintProp};
})();

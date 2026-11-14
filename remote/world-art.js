'use strict';

(() => {
  const { get, terrain, props } = WorldMap;
  const sides = [[0,-1],[1,0],[0,1],[-1,0]];
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const colors = { grass: '#848d62', dirt: '#aa8b60', stone: '#8a8577', wood: '#98704c', woodland: '#707650', water: '#426c71' };
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
    const connections = sides.filter((_, index) => mask & (1 << index));
    const [first, second] = connections;
    const bend = connections.length === 2 && first[0] + second[0] !== 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of [[.82, '#777651'], [.74, '#a48a64'], [.63, '#c3a779']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      if (bend) {
        ctx.moveTo(.5 + first[0] * .52, .5 + first[1] * .52);
        ctx.quadraticCurveTo(.5, .5, .5 + second[0] * .52, .5 + second[1] * .52);
      } else {
        for (const [dx, dy] of connections) {
          ctx.moveTo(.5 + dx * .52, .5 + dy * .52);
          ctx.lineTo(.5, .5);
        }
      }
      ctx.stroke();
      if (!connections.length) ellipse(ctx, .5, .5, width / 2, width / 2, color);
      // Complete inside corners of a wide road so the center reads as one dirt surface.
      for (const [i, [dx, dy]] of corners.entries()) {
        const horizontal = dx > 0 ? 2 : 8, vertical = dy > 0 ? 4 : 1;
        if ((mask & horizontal) && (mask & vertical) && (mask & (1 << (i + 4)))) {
          ctx.fillStyle = color;
          ctx.fillRect(dx > 0 ? .498 : 0, dy > 0 ? .498 : 0, .502, .502);
        }
      }
    }
  }
  const surrounding = [...sides, ...corners];
  const shallow = [105, 143, 128];
  const baseMaterial = type => ['forest','denseForest'].includes(type) ? 'woodland' : type === 'path' ? 'grass' : type;
  const natural = new Set(['grass','dirt','woodland','mud']);
  function smooth(x) {
    x = Math.max(0, Math.min(1, x));
    return x*x*(3-2*x);
  }
  function shoreColor(type) {
    const ground = baseMaterial(type);
    const hex = colors[ground] || terrain[ground]?.[1] || colors.grass;
    return [1,3,5].map(start => parseInt(hex.slice(start,start+2),16));
  }
  // Four-cell periodic world-space fields meet on every tile edge, including -1/0
  // and chunk boundaries. Phase is independent of the random texture variant.
  function waviness(x, y) {
    return Math.sin((x+y)*Math.PI/2)*.018 + Math.sin((x-y)*Math.PI)*.009;
  }
  function pixels(ctx, paint) {
    const image = ctx.getImageData(0,0,64,64);
    paint(image.data);
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.putImageData(image,0,0);
    ctx.restore();
  }
  function roundedDepth(x,y,mask,distance) {
    // Quarter-circle cuts only the tips of a cell, leaving its physical center intact.
    const radius=.42;
    for(const [dx,dy] of corners) {
      const horizontal=dx>0?2:8,vertical=dy>0?4:1;
      const a=dx<0?x:1-x,b=dy<0?y:1-y;
      if((mask&horizontal)&&(mask&vertical)&&a<radius&&b<radius)
        distance=Math.min(distance,radius-Math.hypot(radius-a,radius-b));
    }
    return distance;
  }
  // At most 16 phase fields (~896 KiB) and 32 geometry fields (512 KiB).
  const fields = new Map(), edgeFields = new Map();
  function field(phase) {
    const key=phase[0]+phase[1]*4;
    if(fields.has(key))return fields.get(key);
    const noise=new Float32Array(4096),ripple=new Int8Array(4096),index=new Uint8Array(4096);
    const tx=new Float32Array(4096),ty=new Float32Array(4096);
    for(let row=0;row<64;row++)for(let col=0;col<64;col++) {
      const i=row*64+col,x=(col+.5)/64,y=(row+.5)/64,wx=x+phase[0],wy=y+phase[1];
      noise[i]=waviness(wx,wy);
      const current=Math.sin(wy*Math.PI*6+Math.sin(wx*Math.PI/2)*.7);
      ripple[i]=current>.96?2:current<-.98?-2:0;
      const u=x+noise[i]*2-.5,v=y+waviness(wy+1,wx)*2-.5,ix=Math.floor(u),iy=Math.floor(v);
      index[i]=(iy+1)*3+ix+1;tx[i]=smooth((u-ix-.28)/.44);ty[i]=smooth((v-iy-.28)/.44);
    }
    const result={noise,ripple,index,tx,ty};fields.set(key,result);return result;
  }
  function edgeField(mask) {
    if(edgeFields.has(mask))return edgeFields.get(mask);
    const distances=new Float32Array(4096);
    const offsets=surrounding.filter((_,i)=>mask&(1<<i));
    for(let row=0;row<64;row++)for(let col=0;col<64;col++) {
      const x=(col+.5)/64,y=(row+.5)/64;
      let distance=Infinity;
      for(const [dx,dy] of offsets) {
        const a=dx<0?x:dx>0?1-x:0,b=dy<0?y:dy>0?1-y:0;
        distance=Math.min(distance,Math.hypot(a,b));
      }
      distances[row*64+col]=roundedDepth(x,y,mask,distance);
    }
    if(edgeFields.size>=32)edgeFields.delete(edgeFields.keys().next().value);
    edgeFields.set(mask,distances);return distances;
  }
  function shore(ctx, neighbors, phase) {
    const dry=[];
    let mask=0;
    neighbors.forEach((type,i)=>{
      // Missing/filtered chunks cannot invent a bank on the public screen.
      if(type && type!=='water') {dry.push({offset:surrounding[i],color:shoreColor(type)});mask|=1<<i;}
    });
    const {noise,ripple}=field(phase),distances=edgeField(mask);
    const uniform=dry.length && dry.every(entry=>entry.color.every((value,i)=>value===dry[0].color[i]));
    pixels(ctx,data=>{
      for(let row=0;row<64;row++)for(let col=0;col<64;col++) {
        const i=row*64+col,offset=i*4;
        if(distances[i]>=.38) {
          for(let c=0;c<3;c++)data[offset+c]+=ripple[i];
          continue;
        }
        let land;
        if(uniform) land=dry[0].color;
        else {
          land=[0,0,0];let total=0;
          const x=(col+.5)/64,y=(row+.5)/64;
          for(const {offset:[dx,dy],color} of dry) {
            const a=dx<0?x:dx>0?1-x:0,b=dy<0?y:dy>0?1-y:0,squared=a*a+b*b;
            if(squared>=.38**2)continue;
            const weight=(.38-Math.sqrt(squared))**2/(.012+squared);
            for(let c=0;c<3;c++)land[c]+=color[c]*weight;
            total+=weight;
          }
          land=total ? land.map(value=>value/total) : dry[0].color;
        }
        const depth=distances[i]+noise[i],wet=smooth((depth+.015)/.09),deep=smooth((depth-.09)/.27);
        const foam=Math.max(0,1-Math.abs(depth-.105)/.018)*.10,cut=1-smooth((depth+.065)/.065);
        for(let c=0;c<3;c++) {
          const bank=land[c]*.38+shallow[c]*.62,shoal=bank*(1-wet)+shallow[c]*wet;
          const color=(shoal*(1-deep)+(data[offset+c]+ripple[i])*deep)*(1-foam)+191*foam;
          data[offset+c]=color*(1-cut)+land[c]*cut;
        }
      }
    });
  }
  function bank(ctx,type,coast,phase) {
    if(!coast || !natural.has(baseMaterial(type)))return;
    const base=shoreColor(type),{noise}=field(phase),distances=edgeField(coast),water=[66,108,113];
    pixels(ctx,data=>{
      for(let i=0;i<4096;i++) {
        if(distances[i]>=.18)continue;
        const depth=distances[i]-noise[i],wet=1-smooth(depth/.14),cut=1-smooth((depth+.08)/.08);
        for(let c=0;c<3;c++) {
          const bank=(base[c]*.38+shallow[c]*.62)*(1-cut)+water[c]*cut;
          data[i*4+c]=data[i*4+c]*(1-wet)+bank*wet;
        }
      }
    });
  }
  function blendLand(ctx, type, neighbors, phase) {
    const own=baseMaterial(type);
    if (!natural.has(own) || !neighbors.some(value=>value && natural.has(value) && value!==own)) return;
    const base=shoreColor(own);
    const at=(dx,dy)=> {
      if (!dx && !dy) return base;
      const i=surrounding.findIndex(([x,y])=>x===dx&&y===dy),material=neighbors[i];
      return material && natural.has(material) ? shoreColor(material) : base;
    };
    const samples = Array.from({length:9},(_,i)=>at(i%3-1,Math.floor(i/3)-1));
    const weights=field(phase);
    pixels(ctx, data=> {
      for(let row=0;row<64;row++)for(let col=0;col<64;col++) {
        const i=row*64+col,k=weights.index[i],tx=weights.tx[i],ty=weights.ty[i];
        const a=samples[k],b=samples[k+1],c=samples[k+3],d=samples[k+4];
        const offset=(row*64+col)*4;
        for(let i=0;i<3;i++) {
          const color=(a[i]*(1-tx)+b[i]*tx)*(1-ty)+(c[i]*(1-tx)+d[i]*tx)*ty;
          data[offset+i]+=color-base[i];
        }
      }
    });
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
  const crowns = new Map();
  const crownPalettes = [
    ['#354333', '#586744', '#788554', '#a6a870'],
    ['#384535', '#626d44', '#89935d', '#b0ad76'],
    ['#344538', '#526c50', '#718b64', '#a3ad7c'],
    ['#453f2b', '#766d41', '#958751', '#bbaa70'],
  ];

  function crownShape(ctx, x, y, radius, seed, fill, outline) {
    const rnd = random(seed);
    const points = Array.from({ length: 12 }, (_, index) => {
      const angle = index * Math.PI / 6;
      const edge = radius * (.81 + rnd() * .24);
      return [x + Math.cos(angle) * edge, y + Math.sin(angle) * edge * .89];
    });
    const [firstX, firstY] = points[0], [lastX, lastY] = points.at(-1);
    ctx.beginPath();
    ctx.moveTo((firstX + lastX) / 2, (firstY + lastY) / 2);
    for (const [index, [px, py]] of points.entries()) {
      const [nx, ny] = points[(index + 1) % points.length];
      ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = .014;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  }

  function paintCrown(ctx, prop) {
    const frame = WorldMap.crownFrame(prop), { variant } = frame;
    const key = prop.kind + variant;
    let sprite = crowns.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = 192;
      const art = sprite.getContext('2d');
      art.setTransform(80, 0, 0, 80, 96, 88);
      const shrub = prop.kind === 'bush';
      const rnd = random(variant * 71 + (shrub ? 29 : 0));
      const radius = (shrub ? .31 : .67) + rnd() * (shrub ? .15 : .21);
      const palette = crownPalettes[(variant + (shrub ? 1 : 0)) % crownPalettes.length];

      art.shadowColor = '#232d2266';
      art.shadowBlur = 8;
      ellipse(art, radius * .31, radius * .42, radius * .95, radius * .65, '#232d2255');
      art.shadowBlur = 0;
      if (!shrub) ellipse(art, .02, radius * .71, .05, .10, '#554433');
      crownShape(art, 0, 0, radius, variant, palette[0], '#303b30');
      const lobes = shrub ? 4 : 6;
      for (let i = 0; i < lobes; i++) {
        const angle = i * Math.PI * 2 / lobes + rnd() * .47;
        const x = Math.cos(angle) * radius * .42, y = Math.sin(angle) * radius * .37;
        crownShape(art, x, y, radius * (.43 + rnd() * .20), variant * 17 + i,
          palette[x + y < .05 ? 2 : 1], '#303b3055');
      }
      crownShape(art, -radius * .12, -radius * .14, radius * .53, variant + 37, palette[2], '#35433255');
      for (let i = 0; i < 20; i++) {
        const angle = rnd() * Math.PI * 2, distance = Math.sqrt(rnd()) * radius * .72;
        const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance * .89;
        leaf(art, x, y, angle, radius * (.08 + rnd() * .15), x + y < 0 ? palette[3] : palette[1]);
      }
      crowns.set(key, sprite);
    }
    ctx.drawImage(sprite, frame.left, frame.top, frame.width, frame.height);
  }

  const roofSprites = new Map();
  const roofColors = {
    house: [
      ['#746044', '#aa8955', '#c5a469', '#d6bb80'],
      ['#615b4c', '#8c7e66', '#a7997e', '#c7b396'],
      ['#70564a', '#9a7358', '#b88e6d', '#cca788'],
    ],
    tavern: [
      ['#694537', '#995b43', '#b77554', '#cf936b'],
      ['#684738', '#98674a', '#b9825c', '#cfa27a'],
      ['#635044', '#926c56', '#ab8166', '#c39d78'],
    ],
    barn: [
      ['#65543d', '#937548', '#ae905b', '#c1a773'],
      ['#565343', '#7b7257', '#998a69', '#b2a17b'],
      ['#64503d', '#937052', '#a98664', '#c0a07d'],
    ],
  };

  function roofSlope(ctx, shape, w, from, to, palette, lit, rnd, material) {
    polygon(ctx, shape, palette[lit ? 2 : 1]);
    ctx.save();
    ctx.clip();
    if (material === 'thatch') {
      // Bundles run down the slope; tie courses break the uniform rectangular grid.
      for(let x=-w;x<w;x+=.045) {
        ctx.strokeStyle=rnd()<.4?palette[0]:palette[3];
        ctx.globalAlpha=lit?.43:.26;ctx.lineWidth=.012+rnd()*.013;
        ctx.beginPath();ctx.moveTo(x,from);ctx.lineTo(x+(rnd()-.5)*.08,to);ctx.stroke();
      }
      for(let y=from+.25;y<to;y+=.32) {
        ctx.strokeStyle=palette[0];ctx.globalAlpha=.28;ctx.lineWidth=.026;
        ctx.beginPath();ctx.moveTo(-w,y);ctx.quadraticCurveTo(0,y+.06,w,y);ctx.stroke();
      }
    } else {
      const step=material==='slate'?.145:.18;
      for(let y=from,row=0;y<to;y+=step,row++)for(let x=-w-.30+(row%2)*.135;x<w;x+=.27) {
        const accent=rnd()<.24;
        const tone=palette[lit?(accent?3:2):(accent?0:1)];
        const drift=(rnd()-.5)*.025;
        ctx.globalAlpha=accent?.28:.85;
        polygon(ctx,[[x,y],[x+.258,y+drift],[x+.25,y+step-.018],[x+.025,y+step]],tone);
        ctx.globalAlpha=1;
        ctx.strokeStyle=lit?'#f2d6ab65':'#3e332755';ctx.lineWidth=.012;
        ctx.beginPath();ctx.moveTo(x+.025,y+step-.017);ctx.lineTo(x+.246,y+step-.028);ctx.stroke();
        if(material==='tile') {
          ctx.strokeStyle=palette[0]+'65';ctx.lineWidth=.009;
          ctx.beginPath();ctx.moveTo(x+.15,y+.025);ctx.lineTo(x+.15,y+step-.03);ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function paintBuilding(ctx, prop, width, height) {
    const variant=((Math.imul(prop.x,53)^Math.imul(prop.y,107))>>>0)%3;
    const northLit=prop.turn===0||prop.turn===3;
    const key=prop.kind+':'+variant+':'+northLit;
    let sprite=roofSprites.get(key);
    if(!sprite) {
      const w=width/2,h=height/2,rnd=random(31+variant*89+width*17);
      const palette=roofColors[prop.kind][variant],barn=prop.kind==='barn';
      const material=prop.kind==='tavern'?'tile':variant===1?'slate':'thatch';
      const hip=variant===1,inset=hip?.40:.055;
      sprite=document.createElement('canvas');
      sprite.width=(width+.6)*64;sprite.height=(height+.6)*64;
      const art=sprite.getContext('2d');
      art.setTransform(64,0,0,64,sprite.width/2,sprite.height/2);
      const left=-w+.05,right=w-.05,top=-h+.06,bottom=h-.26,ridge=-.04;
      polygon(art,[[left+.13,top+.15],[right-.06,top+.15],[right-.03,h-.05],[left+.10,h-.05]],'#4d3f32');
      // A narrow facade carries plaster, timber framing, shutters and the entrance.
      art.fillStyle=barn?'#8b704d':'#c3ad84';
      art.fillRect(left+.12,bottom-.05,width-.24,.29);
      art.strokeStyle='#5e4935';art.lineWidth=.035;
      for(let x=left+.15;x<right;x+=barn?.35:.68) {
        art.beginPath();art.moveTo(x,bottom);art.lineTo(x,h-.075);art.stroke();
      }
      polygon(art,[[left-.025,top+.015],[right,top],[right+.035,bottom+.055],[left+.025,bottom+.055]],'#443c31');
      roofSlope(art,[[left+.03,top+.045],[right-.03,top+.045],[right-inset,ridge],[left+inset,ridge]],w,top,ridge+.01,palette,northLit,rnd,material);
      roofSlope(art,[[left+inset,ridge],[right-inset,ridge],[right-.005,bottom],[left+.05,bottom]],w,ridge,bottom+.02,palette,!northLit,rnd,material);
      if(hip) {
        polygon(art,[[left+.03,top+.045],[left+inset,ridge],[left+.05,bottom]],palette[northLit?2:1]);
        polygon(art,[[right-.03,top+.045],[right-.005,bottom],[right-inset,ridge]],palette[northLit?0:1]);
        art.strokeStyle=palette[3];art.lineWidth=.026;
        art.beginPath();art.moveTo(left+.04,top+.05);art.lineTo(left+inset,ridge);art.lineTo(left+.05,bottom);art.stroke();
      }
      // Carved fascia and a segmented raised ridge, all within the existing envelope.
      art.strokeStyle='#4c3a2b';art.lineWidth=.055;
      art.beginPath();art.moveTo(left+.04,bottom+.022);art.lineTo(right+.01,bottom+.022);art.stroke();
      art.strokeStyle=palette[3];art.lineWidth=.022;
      art.beginPath();art.moveTo(left+.07,top+.035);art.lineTo(right-.04,top+.035);art.stroke();
      for(let x=left+inset-.025;x<right-inset;x+=.19) {
        art.fillStyle=palette[0];art.fillRect(x,ridge-.035,Math.min(.185,right-inset-x),.082);
        art.fillStyle=palette[3];art.fillRect(x+.008,ridge-.026,Math.min(.167,right-inset-x),.021);
      }
      const doorWidth=barn?.43:.22;
      art.fillStyle='#46382b';art.fillRect(-doorWidth,bottom+.035,doorWidth*2,.26);
      art.fillStyle='#92704c';art.fillRect(-doorWidth+.025,bottom+.055,doorWidth*2-.05,.19);
      art.strokeStyle='#493a2d';art.lineWidth=.025;
      art.beginPath();art.moveTo(-doorWidth+.035,bottom+.065);art.lineTo(doorWidth-.035,h-.03);
      if(barn){art.moveTo(doorWidth-.035,bottom+.065);art.lineTo(-doorWidth+.035,h-.03);}art.stroke();
      art.fillStyle='#c5ad81';art.fillRect(-doorWidth-.065,h+.015,doorWidth*2+.13,.075);
      if(!barn) {
        for(const x of [left+.30,right-.55]) {
          art.fillStyle='#554a36';art.fillRect(x,bottom+.07,.23,.11);
          art.fillStyle='#d3bb77';art.fillRect(x+.035,bottom+.085,.16,.055);
          art.fillStyle='#735e43';art.fillRect(x-.035,bottom+.06,.04,.13);art.fillRect(x+.23,bottom+.06,.04,.13);
        }
        const x=w*.43,y=top+.32;
        polygon(art,[[x+.07,y+.10],[x+.46,y+.10],[x+.49,y+.48],[x+.08,y+.44]],'#2e302b66');
        art.fillStyle='#7c7465';art.fillRect(x,y,.35,.39);
        art.fillStyle='#b6a68a';art.fillRect(x-.02,y-.02,.39,.10);
        art.fillStyle='#3a3931';art.fillRect(x+.065,y+.012,.22,.055);
        art.strokeStyle='#5c5549';art.lineWidth=.016;
        for(let row=0;row<3;row++) {art.beginPath();art.moveTo(x,y+.12+row*.08);art.lineTo(x+.35,y+.12+row*.08);art.stroke();}
        // A small dormer changes the silhouette of the roof without extending its bounds.
        if(variant!==2) {
          const dx=-w*.37,dy=bottom-.48;
          polygon(art,[[dx-.26,dy+.32],[dx,dy-.08],[dx+.26,dy+.32]],'#493d31');
          polygon(art,[[dx-.22,dy+.29],[dx,dy-.035],[dx+.22,dy+.29]],palette[northLit?1:2]);
          art.fillStyle='#b69d76';art.fillRect(dx-.13,dy+.24,.26,.20);
          art.fillStyle='#514b3c';art.fillRect(dx-.075,dy+.27,.15,.12);
          art.fillStyle='#dcc28a';art.fillRect(dx-.01,dy+.27,.02,.12);
        }
      } else {
        // Barn ventilation and cross bracing distinguish it from an enlarged house.
        for(let x=left+.32;x<right-.2;x+=.65) {
          art.strokeStyle='#594633';art.lineWidth=.028;
          art.beginPath();art.moveTo(x,bottom+.055);art.lineTo(x+.18,h-.09);art.stroke();
        }
      }
      if(prop.kind==='tavern') {
        art.fillStyle='#4a3c2d';art.fillRect(.56,bottom+.04,.05,.25);
        art.fillStyle='#80613d';art.fillRect(.56,bottom+.08,.43,.18);
        art.fillStyle='#d8b86f';art.fillRect(.60,bottom+.10,.35,.13);
        ellipse(art,.77,bottom+.165,.065,.038,'#6a4d32');
      }
      roofSprites.set(key,sprite);
    }
    ctx.drawImage(sprite,-(width+.6)/2,-(height+.6)/2,width+.6,height+.6);
  }

  function paintBridge(ctx, prop, width, height) {
    const w = width / 2, h = height * .34;
    const rnd = random((Math.imul(prop.x, 53) ^ Math.imul(prop.y, 107)) >>> 0);
    // The walkable cell centers remain on the deck, with room for slender side rails.
    // A four-by-two bridge reads as a narrow crossing rather than a solid wooden slab.
    polygon(ctx, [[-w, -h + .025], [w, -h], [w, h - .02], [-w, h]], '#4f4134');
    for (let x = -w + .025; x < w - .04; x += .18) {
      const end = Math.min(w - .018, x + .168);
      const drift = (rnd() - .5) * .018;
      polygon(ctx, [[x, -h + .035 + drift], [end, -h + .03], [end, h - .03 + drift], [x, h - .035]],
        ['#ab8960', '#b6966b', '#9b7b54'][Math.floor(rnd() * 3)]);
      ctx.strokeStyle = '#e2bd7f54';
      ctx.lineWidth = .012;
      ctx.beginPath();
      ctx.moveTo(x + .035, -h + .13);
      ctx.quadraticCurveTo(x + .02, 0, x + .045, h - .14);
      ctx.stroke();
    }
    for (const y of [-h - .055, h + .055]) {
      ctx.fillStyle = '#3d352b55';
      ctx.fillRect(-w + .06, y + .055, width - .12, .045);
      for (const x of [-w + .10, -w / 3, w / 3, w - .10]) {
        ctx.fillStyle = '#574634';
        ctx.fillRect(x - .046, y - .075, .092, .15);
        ctx.fillStyle = '#bc9e72';
        ctx.fillRect(x - .032, y - .064, .064, .057);
      }
      ctx.fillStyle = '#654b34';
      ctx.fillRect(-w + .06, y - .024, width - .12, .048);
      ctx.fillStyle = '#c5a577';
      ctx.fillRect(-w + .07, y - .024, width - .14, .016);
    }
  }

  function meadow(ctx, seed, woodland) {
    const rnd = random(seed * 157 + 37);

    for (let i = 0; i < 8; i++) {
      const x = rnd(), y = rnd();
      ellipse(ctx, x, y, .035 + rnd() * .13, .025 + rnd() * .065, i % 3 ? '#4d633b20' : '#c7b77427');
      for (let j = 0; j < 3; j++) {
        leaf(ctx, x + j * .009, y, -2.1 + j * .45, .035 + rnd() * .047,
          j === 0 ? '#526441a0' : '#aeb17b95');
      }
      if (i % 3 === 0) ellipse(ctx, x + .025, y - .01, .014, .011, woodland ? '#ae8c57a0' : '#cec49199');
    }
  }

  function tile(type, mask, neighbors, seed, phase, coast) {
    const key = [type,mask,neighbors?.join(','),seed,phase.join(','),coast].join(':');
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.scale(64,64);
    const forest = type === 'forest' || type === 'denseForest';
    ctx.fillStyle = colors[baseMaterial(type)] || terrain[type][1];
    ctx.fillRect(0,0,1,1);

    if (neighbors && type !== 'water') blendLand(ctx,type,neighbors,phase);
    if (coast) bank(ctx,type,coast,phase);
    if (type !== 'water') grain(ctx, seed, ['#e4d5a32c','#3033222e','#b5b38325']);
    if (type === 'path') {
      path(ctx,mask);
      for (let i=0;i<7;i++) ellipse(ctx,.25+(i*13%31)/60,.26+((i+seed)*7%29)/60,.012,.009,'#63533c70');
    } else if (type === 'water') {
      shore(ctx, neighbors || [], phase);
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
    } else if (type === 'grass' || type === 'woodland') {
      meadow(ctx, seed, type === 'woodland');
    }
    // Up to 16 MiB of RGBA tile pixels, excluding browser Canvas overhead.
    if (cache.size >= 1024) cache.delete(cache.keys().next().value);
    cache.set(key,canvas);
    return canvas;
  }
  function paintTile(ctx,chunks,x,y,type,destination=[x,y,1,1]) {
    let mask=0, coast=0;
    const rawNeighbors = surrounding.map(([dx,dy]) => get(chunks,x+dx,y+dy));
    rawNeighbors.forEach((value,i)=>{if(value==='water')coast|=1<<i;});
    // Keep water out of ground-material blending; bank() handles the wet edge separately.
    const neighbors = type === 'water' ? rawNeighbors : rawNeighbors.map(value =>
      value && value !== 'water' ? baseMaterial(value) : null);
    if (type === 'path') {
      rawNeighbors.forEach((neighbor, i) => { if (neighbor === 'path') mask |= 1 << i; });
    } else if (type === 'forest' || type === 'denseForest') {
      for (let i = 0; i < sides.length; i++) {
        if (rawNeighbors[i] === 'forest' || rawNeighbors[i] === 'denseForest') mask |= 1 << i;
      }
    }
    const hash = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    const variants = type === 'grass' || type === 'woodland' || type === 'water' ? 17 : 5;
    const seed = type === 'water' ? 0 : hash % variants;
    const different = type === 'water' || neighbors.some(value => value && value !== baseMaterial(type));
    // Interior textures do not depend on world phase. Keep their small shared cache;
    // phase only differentiates pixels actually using a boundary or current field.
    const phased = type === 'water' || coast || neighbors.some(value =>
      value && natural.has(value) && value !== baseMaterial(type));
    ctx.drawImage(tile(type,mask,different ? neighbors : null,seed,phased ? [x & 3,y & 3] : [0,0],coast),...destination);
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
    const vegetation = prop.kind === 'tree' || prop.kind === 'bush';
    const building = Object.hasOwn(roofColors, prop.kind);
    const bridge = prop.kind === 'bridge';
    if (prop.hidden) ctx.globalAlpha = .65;
    if (building || bridge) {
      const shadowWidth = bridge && prop.turn % 2 ? h * .76 : center.width;
      const shadowHeight = bridge && !(prop.turn % 2) ? h * .76 : center.height;
      ctx.fillStyle = '#323a3033';
      ctx.fillRect(-shadowWidth / 2 + .14, -shadowHeight / 2 + .2, shadowWidth + .10, shadowHeight + .09);
      ctx.fillStyle = '#30382d38';
      ctx.fillRect(-shadowWidth / 2 + .12, -shadowHeight / 2 + .17, shadowWidth, shadowHeight);
    }
    if (WorldMap.furnitureKinds.has(prop.kind)) {
      // World-space shadow stays southeast when furniture turns.
      ctx.fillStyle = '#29271f35';
      ctx.fillRect(-center.width * .44 + .08, -center.height * .34 + .12,
        center.width * .88, center.height * .68);
    }
    if (!vegetation) ctx.rotate((prop.kind === 'door' ? (layout?.doorAxis(prop) ?? prop.turn) : prop.turn)*Math.PI/2);
    const decor = window.WorldDecor.paint[prop.kind];
    if (building) {
      paintBuilding(ctx, prop, w, h);
    } else if (bridge) {
      paintBridge(ctx, prop, w, h);
    } else if (window.WorldSprites?.has(prop.kind)) {
      window.WorldSprites.draw(ctx, prop.kind);
    } else if (decor) {
      ctx.save();
      ctx.scale(w,h);
      decor(ctx);
      ctx.restore();
    } else if (prop.kind==='door') {
      door(ctx, prop.open);
    } else if (vegetation) {
      paintCrown(ctx, prop);
    } else {
      ctx.fillStyle='#272d2475';ctx.fillRect(-w/2+.10,-h/2+.16,w,h);
      ctx.fillStyle='#45382c';ctx.fillRect(-w/2,-h/2,w,h);
      ctx.fillStyle='#a78056';
      ctx.fillRect(-w/2+.055,-h/2+.055,w-.11,h-.11);
      ctx.strokeStyle='#534535b0';ctx.lineWidth=.035;
      for (let x=-w/2+.17;x<w/2-.08;x+=.22) {
        ctx.beginPath();ctx.moveTo(x,-h/2+.07);ctx.lineTo(x,h/2-.07);ctx.stroke();
      }
    }
    if (selected) {
      ctx.strokeStyle='#ffe3a2';ctx.lineWidth=.12;ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.restore();
  }
  window.WorldArt={paintTile,paintProp};
})();

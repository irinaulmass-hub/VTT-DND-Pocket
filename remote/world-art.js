'use strict';

(() => {
  const { get, terrain, props } = WorldMap;
  const sides = [[0,-1],[1,0],[0,1],[-1,0]];
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const colors = { grass: '#848d62', dirt: '#aa8b60', stone: '#8a8577', wood: '#98704c', water: '#426c71' };
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
  const sand = [173, 148, 104];
  const shallow = [110, 150, 138];
  const baseMaterial = type => ['forest','denseForest','woodland','path'].includes(type) ? 'grass' : type;
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
      const wet = smooth((depth - .025) / .13), deep = smooth((depth - .11) / .22);
      const foam = Math.max(0, 1 - Math.abs(depth - .14) / .023) * .16;
      const offset=(row*size+col)*4;
      for(let i=0;i<3;i++) {
        const shore=land[i]/total*(1-wet)+shallow[i]*wet;
        image.data[offset+i]=(shore*(1-deep)+image.data[offset+i]*deep)*(1-foam)+197*foam;
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(image, 0, 0);
    ctx.restore();
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
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(image, 0, 0);
    ctx.restore();
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
    const variant = ((Math.imul(prop.x, 53) ^ Math.imul(prop.y, 107) ^ (prop.turn << 3)) >>> 0) % 32;
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
    const shiftX = ((variant % 7) - 3) * .038;
    const shiftY = ((variant % 5) - 2) * .045;
    ctx.drawImage(sprite, -1.2 + shiftX, -1.1 + shiftY, 2.4, 2.4);
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

  function roofSlope(ctx, shape, w, from, to, palette, lit, rnd, kind) {
    polygon(ctx, shape, palette[lit ? 2 : 1]);
    ctx.save();
    ctx.clip();
    const step = kind === 'barn' ? .22 : .16;
    for (let y = from, row = 0; y < to; y += step, row++) {
      for (let x = -w - .30 + (row % 2) * .14; x < w; x += .29) {
        const accent = rnd() < (lit ? .28 : .31);
        const tone = palette[lit ? (accent ? 3 : 2) : (accent ? 0 : 1)];
        ctx.globalAlpha = accent ? .60 : 1;
        const drift = (rnd() - .5) * .044;
        polygon(ctx, [[x, y], [x + .275, y + drift], [x + .283, y + step - .014],
          [x + .037, y + step + drift]], tone);
        ctx.globalAlpha = 1;
        if (rnd() < .35) {
          ctx.fillStyle = lit ? '#f2d59a40' : '#edc8872b';
          ctx.fillRect(x + .045, y + .025, .11 + rnd() * .08, .016);
        }
      }
    }
    ctx.restore();
  }

  function paintBuilding(ctx, prop, width, height) {
    const variant = ((Math.imul(prop.x, 53) ^ Math.imul(prop.y, 107)) >>> 0) % 3;
    const northLit = prop.turn === 0 || prop.turn === 3;
    const key = prop.kind + ':' + variant + ':' + northLit;
    let sprite = roofSprites.get(key);
    if (!sprite) {
      const w = width / 2, h = height / 2;
      const rnd = random(31 + variant * 89 + width * 17);
      const palette = roofColors[prop.kind][variant];
      const barn = prop.kind === 'barn';
      sprite = document.createElement('canvas');
      sprite.width = (width + .6) * 50;
      sprite.height = (height + .6) * 50;
      const art = sprite.getContext('2d');
      art.setTransform(50, 0, 0, 50, sprite.width / 2, sprite.height / 2);
      const left = -w + .07, right = w - .07, top = -h + .07, bottom = h - .24;
      const ridge = -.1 + variant * .05;
      polygon(art, [[left + .12, top + .12], [right - .09, top + .12], [right, h - .09], [left + .10, h - .03]], '#554237');
      polygon(art, [[left + .17, bottom - .09], [right - .14, bottom - .08], [right - .16, h - .12], [left + .19, h - .10]], '#ab8d62');
      polygon(art, [[left, top + .04], [right - .09, top], [right, bottom + .04],
        [left + .08, bottom]], '#41382f');

      roofSlope(art, [[left + .055, top + .082], [right - .12, top + .063],
        [right - .058, ridge], [left + .086, ridge + .027]], w, top + .04, ridge + .035, palette, northLit, rnd, prop.kind);
      roofSlope(art, [[left + .086, ridge + .022], [right - .058, ridge],
        [right - .058, bottom - .019], [left + .121, bottom - .057]], w, ridge, bottom, palette, !northLit, rnd, prop.kind);
      polygon(art, [[left + .027, ridge + .002], [right + .003, ridge - .026], [right + .002, ridge + .025],
        [left + .037, ridge + .058]], palette[0]);
      art.fillStyle = palette[3];
      art.fillRect(left + .12, ridge + .013, width - .26, .025);

      const doorWidth = barn ? .45 : .25;
      art.fillStyle = '#483829';
      art.fillRect(-doorWidth, bottom + .025, doorWidth * 2, .28);
      art.fillStyle = '#866345';
      art.fillRect(-doorWidth + .035, bottom + .053, doorWidth * 2 - .07, .18);
      art.fillStyle = '#ba9b6d';
      art.fillRect(-doorWidth - .07, h + .02, doorWidth * 2 + .14, .08);
      if (!barn) {
        const x = w * .46, y = top + .32;
        art.fillStyle = '#403b35aa';
        art.fillRect(x + .07, y + .11, .42, .41);
        art.fillStyle = '#53483e';
        art.fillRect(x, y, .39, .40);
        art.fillStyle = '#a49a86';
        art.fillRect(x + .027, y + .027, .33, .31);
        art.fillStyle = '#504940';
        art.fillRect(x + .085, y + .09, .22, .18);
      }
      if (prop.kind === 'tavern') {
        art.fillStyle = '#544029';
        art.fillRect(.55, bottom + .06, .47, .19);
        art.fillStyle = '#d4ab5e';
        art.fillRect(.59, bottom + .095, .38, .11);
        ellipse(art, .78, bottom + .15, .055, .035, '#775535');
      }
      roofSprites.set(key, sprite);
    }
    ctx.drawImage(sprite, -(width + .6) / 2, -(height + .6) / 2, width + .6, height + .6);
  }

  function paintBridge(ctx, prop, width, height) {
    const w = width / 2, h = height / 2;
    const rnd = random((Math.imul(prop.x, 53) ^ Math.imul(prop.y, 107)) >>> 0);
    polygon(ctx, [[-w, -h + .07], [w - .04, -h], [w, h - .08], [-w + .03, h]], '#4f4134');
    for (let x = -w + .035; x < w - .12; x += .23) {
      const end = Math.min(w - .015, x + .215);
      const drift = (rnd() - .5) * .05;
      polygon(ctx, [[x, -h + .14 + drift], [end, -h + .13], [end, h - .12 + drift], [x, h - .13]],
        ['#ab8960', '#b6966b', '#9b7b54'][Math.floor(rnd() * 3)]);
      ctx.strokeStyle = '#e2bd7f54';
      ctx.lineWidth = .018;
      ctx.beginPath();
      ctx.moveTo(x + .035, -h + .31);
      ctx.quadraticCurveTo(x + .015, 0, x + .05, h - .33);
      ctx.stroke();
    }
    for (const y of [-h + .10, h - .10]) {
      ctx.fillStyle = '#6d5237';
      ctx.fillRect(-w + .028, y - .055, width - .06, .115);
      ctx.fillStyle = '#be9c6b';
      ctx.fillRect(-w + .04, y - .055, width - .08, .029);
      for (const x of [-w + .13, 0, w - .13]) {
        polygon(ctx, [[x - .095, y - .075], [x + .088, y - .068],
          [x + .081, y + .09], [x - .083, y + .086]], '#574634');
        ctx.fillStyle = '#bc9e72';
        ctx.fillRect(x - .052, y - .035, .10, .078);
      }
    }
  }

  function meadow(ctx, seed, woodland) {
    const rnd = random(seed * 157 + 37);
    if (woodland) {
      ctx.fillStyle = '#3e50382b';
      ctx.fillRect(0, 0, 1, 1);
    }
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

  function tile(type, mask, neighbors, seed) {
    const key = [type,mask,neighbors?.join(','),seed].join(':');
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.scale(64,64);
    const forest = type === 'forest' || type === 'denseForest';
    ctx.fillStyle = colors[type === 'path' || type === 'woodland' || forest ? 'grass' : type] || terrain[type][1];
    ctx.fillRect(0,0,1,1);

    if (type !== 'water') grain(ctx, seed, ['#e4d5a32c','#3033222e','#b5b38325']);
    if (type === 'path') {
      path(ctx,mask);
      for (let i=0;i<7;i++) ellipse(ctx,.25+(i*13%31)/60,.26+((i+seed)*7%29)/60,.012,.009,'#63533c70');
    } else if (type === 'water') {
      const rnd = random(seed * 71);
      for (let i = 0; i < 6; i++) {
        const x = .04 + rnd() * .69, y = .10 + rnd() * .8;
        ellipse(ctx, x, y, .045 + rnd() * .11, .007 + rnd() * .008, i % 2 ? '#b2cdc66a' : '#3760668a');
      }
      shore(ctx, neighbors);
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
    if (type === 'path') {
      rawNeighbors.forEach((neighbor, i) => { if (neighbor === 'path') mask |= 1 << i; });
    } else if (type === 'forest' || type === 'denseForest') {
      for (let i = 0; i < sides.length; i++) {
        if (rawNeighbors[i] === 'forest' || rawNeighbors[i] === 'denseForest') mask |= 1 << i;
      }
    }
    const hash = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    const variants = type === 'grass' || type === 'woodland' || type === 'water' ? 17 : 5;
    const seed = hash % variants;
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
    const vegetation = prop.kind === 'tree' || prop.kind === 'bush';
    const building = Object.hasOwn(roofColors, prop.kind);
    const bridge = prop.kind === 'bridge';
    if (prop.hidden) ctx.globalAlpha = .65;
    if (building || bridge) {
      ctx.fillStyle = '#323a3033';
      ctx.fillRect(-center.width / 2 + .14, -center.height / 2 + .2, center.width + .10, center.height + .09);
      ctx.fillStyle = '#30382d38';
      ctx.fillRect(-center.width / 2 + .12, -center.height / 2 + .17, center.width, center.height);
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

'use strict';

// ── Tile definitions ──────────────────────────────────────────
const TILES = [
  { id: 'stone-floor',  label: 'Stone',    color: '#6b7280', pattern: 'grid' },
  { id: 'wood-floor',   label: 'Wood',     color: '#92400e', pattern: 'grid' },
  { id: 'dirt',         label: 'Dirt',     color: '#78350f', pattern: 'plain' },
  { id: 'grass',        label: 'Grass',    color: '#166534', pattern: 'plain' },
  { id: 'water',        label: 'Water',    color: '#1e40af', pattern: 'wave' },
  { id: 'deep-water',   label: 'Deep',     color: '#1e3a5f', pattern: 'plain' },
  { id: 'wall',         label: 'Wall',     color: '#374151', pattern: 'solid' },
  { id: 'stone-wall',   label: 'S.Wall',   color: '#1f2937', pattern: 'solid' },
  { id: 'lava',         label: 'Lava',     color: '#b45309', pattern: 'lava' },
  { id: 'sand',         label: 'Sand',     color: '#d97706', pattern: 'plain' },
  { id: 'snow',         label: 'Snow',     color: '#e5e7eb', pattern: 'plain' },
  { id: 'swamp',        label: 'Swamp',    color: '#365314', pattern: 'plain' },
  { id: 'cave',         label: 'Cave',     color: '#44403c', pattern: 'grid' },
  { id: 'road-h',       label: 'Road ─',   color: '#a8a29e', pattern: 'road-h' },
  { id: 'road-v',       label: 'Road │',   color: '#a8a29e', pattern: 'road-v' },
  { id: 'road-cross',   label: 'Road +',   color: '#a8a29e', pattern: 'road-cross' },
  { id: 'road-turn-ne', label: 'Road ↗',   color: '#a8a29e', pattern: 'road-turn-ne' },
  { id: 'road-turn-nw', label: 'Road ↖',   color: '#a8a29e', pattern: 'road-turn-nw' },
  { id: 'road-turn-se', label: 'Road ↘',   color: '#a8a29e', pattern: 'road-turn-se' },
  { id: 'road-turn-sw', label: 'Road ↙',   color: '#a8a29e', pattern: 'road-turn-sw' },
  { id: 'road-t-n',     label: 'Road T-N', color: '#a8a29e', pattern: 'road-t-n' },
  { id: 'road-t-s',     label: 'Road T-S', color: '#a8a29e', pattern: 'road-t-s' },
  { id: 'road-t-e',     label: 'Road T-E', color: '#a8a29e', pattern: 'road-t-e' },
  { id: 'road-t-w',     label: 'Road T-W', color: '#a8a29e', pattern: 'road-t-w' },
  { id: 'door',         label: 'Door',     color: '#7c2d12', pattern: 'door' },
  { id: 'cave-opening', label: 'Cave-Open',color: '#2c2825', pattern: 'solid' },
  { id: 'pit',          label: 'Pit',      color: '#0a0a0a', pattern: 'solid' },
  { id: 'tree',         label: 'Tree',     color: '#14532d', pattern: 'tree' },
  { id: 'tree-large',   label: 'Tree-L',   color: '#14532d', pattern: 'tree-large' },
  { id: 'tree-pine',    label: 'Pine',     color: '#0f4c2a', pattern: 'tree-pine' },
  { id: 'tree-palm',    label: 'Palm',     color: '#16803a', pattern: 'tree-palm' },
  { id: 'mountain',     label: 'Mountain', color: '#57534e', pattern: 'mountain' },
  { id: 'mtn-scree',    label: 'Mtn-A',    color: '#78716c', pattern: 'mtn-scree' },
  { id: 'mtn-alpine',   label: 'Mtn-B',    color: '#3d6b1c', pattern: 'mtn-alpine' },
  { id: 'mtn-earthy',   label: 'Mtn-C',    color: '#8b7355', pattern: 'mtn-earthy' },
  { id: 'mtn-tundra',   label: 'Mtn-D',    color: '#b8b4ae', pattern: 'mtn-tundra' },
  { id: 'mtn-slate',    label: 'Mtn-E',    color: '#4a4540', pattern: 'mtn-slate' },
  { id: 'hill',         label: 'Hill',     color: '#65a30d', pattern: 'hill' },
  { id: 'aura',         label: 'Aura',     color: '#ea580c', pattern: 'aura' },
  { id: 'aura-large',   label: 'Aura-L',   color: '#dc2626', pattern: 'aura-large' },
  { id: 'aura-blue',    label: 'Aura-B',   color: '#2563eb', pattern: 'aura-blue' },
  { id: 'fire',         label: 'Fire',     color: '#f97316', pattern: 'fire' },
  { id: 'fire-blue',    label: 'Fire-B',   color: '#7c3aed', pattern: 'fire-blue' },
  { id: 'cabin',        label: 'Cabin',    color: '#7c3a10', pattern: 'cabin' },
  { id: 'cabin-ruin',   label: 'Ruin-Cab', color: '#4a3018', pattern: 'cabin-ruin' },
  { id: 'tent',         label: 'Tent',     color: '#c9b47a', pattern: 'tent' },
  { id: 'horse',        label: 'Horse',    color: '#b86a28', pattern: 'horse' },
  { id: 'cow',          label: 'Cow',      color: '#c8b89a', pattern: 'cow' },
  { id: 'well',         label: 'Well',     color: '#78716c', pattern: 'well' },
  { id: 'wall-ruin',    label: 'Ruin-Wall',color: '#52484a', pattern: 'wall-ruin' },
];

// ── Tile groups (controls palette display order & headers) ───
const TILE_GROUPS = [
  { label: 'Ground',        ids: ['stone-floor','wood-floor','dirt','cave'] },
  { label: 'Terrain',       ids: ['grass','sand','snow','swamp','lava'] },
  { label: 'Water',         ids: ['water','deep-water'] },
  { label: 'Walls',         ids: ['wall','stone-wall','wall-ruin','door','cave-opening','pit'] },
  { label: 'Buildings',     ids: ['cabin','cabin-ruin','tent','well'] },
  { label: 'Roads',         ids: ['road-h','road-v','road-cross','road-turn-ne','road-turn-nw','road-turn-se','road-turn-sw','road-t-n','road-t-s','road-t-e','road-t-w'] },
  { label: 'Nature',        ids: ['tree','tree-large','tree-pine','tree-palm','hill'] },
  { label: 'Mountains',     ids: ['mountain','mtn-scree','mtn-alpine','mtn-earthy','mtn-tundra','mtn-slate'] },
  { label: 'Animals',       ids: ['horse','cow'] },
  { label: 'Effects',       ids: ['aura','aura-large','aura-blue','fire','fire-blue'] },
];

// ── Procedural tile textures ──────────────────────────────────
const _texCache  = {};
const _patByCtx  = new WeakMap();
// ── Kenney PNG tile image cache ───────────────────────────────
const _kenneyImgCache = {};

function _rng(seed) {
  let s = (seed | 0) + 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function buildTextureCanvas(tileId) {
  const sz = 64;
  const cv = document.createElement('canvas');
  cv.width = sz; cv.height = sz;
  const x = cv.getContext('2d');
  const r = _rng(tileId.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
  switch (tileId) {
    case 'grass': {
      x.fillStyle = '#1a5c2e'; x.fillRect(0, 0, sz, sz);
      const gc = ['#15803d','#16a34a','#14532d','#22c55e','#4ade80','#166534'];
      for (let i = 0; i < 100; i++) {
        const px = r()*sz, py = r()*sz, len = 4 + r()*7;
        const ang = -1.3 + (r()-0.5)*1.8;
        x.strokeStyle = gc[~~(r()*gc.length)]; x.lineWidth = 1 + r()*0.5;
        x.globalAlpha = 0.55 + r()*0.45;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang)*len, py + Math.sin(ang)*len); x.stroke();
      }
      x.globalAlpha = 1; break;
    }
    case 'stone-floor': {
      x.fillStyle = '#505869'; x.fillRect(0, 0, sz, sz);
      [[2,2,28,18],[33,2,29,15],[2,23,19,21],[24,20,23,22],[49,18,13,24],[2,47,23,15],[28,45,21,17],[51,45,11,17]]
        .forEach(([sx,sy,sw,sh]) => {
          const s2 = 0.78 + r()*0.38;
          x.fillStyle = `rgb(${~~(88*s2)},${~~(98*s2)},${~~(114*s2)})`; x.fillRect(sx+1,sy+1,sw-2,sh-2);
          x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(sx+2,sy+2,sw-4,3);
          x.strokeStyle = '#2d3340'; x.lineWidth = 1; x.strokeRect(sx+.5,sy+.5,sw,sh);
        });
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 0.5;
      for (let i=0;i<8;i++){x.beginPath();x.moveTo(r()*sz,r()*sz);x.lineTo(r()*sz,r()*sz);x.stroke();}
      break;
    }
    case 'stone-wall': {
      x.fillStyle = '#2d3340'; x.fillRect(0, 0, sz, sz);
      const bh=11, mt=2;
      for (let row=0; row*bh<sz+bh; row++) {
        const oy=row*bh, off=(row%2)*15;
        for (let bx=-off; bx<sz+30; bx+=30) {
          const s2=0.72+r()*0.38;
          x.fillStyle=`rgb(${~~(45*s2)},${~~(52*s2)},${~~(63*s2)})`; x.fillRect(bx+mt,oy+mt,30-mt*2,bh-mt*2);
          x.fillStyle='rgba(255,255,255,0.05)'; x.fillRect(bx+mt,oy+mt,30-mt*2,2);
          x.fillStyle='rgba(0,0,0,0.2)';         x.fillRect(bx+mt,oy+bh-mt-1,30-mt*2,2);
        }
      }
      break;
    }
    case 'wall': {
      x.fillStyle='#2e3545'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<9;i++){x.beginPath();x.arc(r()*sz,r()*sz,3+r()*8,0,Math.PI*2);x.fillStyle=r()>.5?'#1a1f2b':'#424d60';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1; x.fillStyle='rgba(0,0,0,0.45)'; x.fillRect(5,5,sz-10,sz-10); break;
    }
    case 'wall-ruin': {
      // Dirt/rubble base
      x.fillStyle='#5a4030'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<80;i++){
        const px=r()*sz,py=r()*sz,rad=0.5+r()*3;
        x.beginPath(); x.arc(px,py,rad,0,Math.PI*2);
        x.fillStyle=`rgba(${~~(40+r()*50)},${~~(25+r()*30)},${~~(10+r()*20)},0.5)`; x.fill();
      }
      // Scattered broken stone blocks
      const rblocks=[
        [sz*.04,sz*.08,sz*.22,sz*.14, -0.18],
        [sz*.42,sz*.02,sz*.28,sz*.12,  0.12],
        [sz*.76,sz*.10,sz*.18,sz*.12, -0.08],
        [sz*.02,sz*.46,sz*.16,sz*.13,  0.20],
        [sz*.80,sz*.40,sz*.17,sz*.13, -0.15],
        [sz*.30,sz*.74,sz*.24,sz*.12,  0.10],
        [sz*.62,sz*.72,sz*.20,sz*.14, -0.22],
        [sz*.08,sz*.76,sz*.16,sz*.10,  0.16],
      ];
      rblocks.forEach(([bx,by,bw,bh,ang])=>{
        x.save(); x.translate(bx+bw/2,by+bh/2); x.rotate(ang);
        const bg=x.createLinearGradient(-bw/2,-bh/2,bw/2,bh/2);
        bg.addColorStop(0,'#7a7068'); bg.addColorStop(0.5,'#58524e'); bg.addColorStop(1,'#3e3a36');
        x.fillStyle=bg; x.fillRect(-bw/2,-bh/2,bw,bh);
        x.strokeStyle='rgba(20,15,10,0.6)'; x.lineWidth=1; x.strokeRect(-bw/2,-bh/2,bw,bh);
        // Crack on some blocks
        if(r()>0.45){
          x.strokeStyle='rgba(0,0,0,0.5)'; x.lineWidth=0.8;
          x.beginPath(); x.moveTo(-bw*.2,bh*.1); x.lineTo(bw*.15,-bh*.1); x.lineTo(bw*.1,bh*.25); x.stroke();
        }
        x.restore();
      });
      // Charred timber remnants
      x.strokeStyle='#1a1206'; x.lineWidth=3;
      x.beginPath(); x.moveTo(sz*.18,sz*.30);x.lineTo(sz*.38,sz*.55); x.stroke();
      x.beginPath(); x.moveTo(sz*.55,sz*.22);x.lineTo(sz*.48,sz*.62); x.stroke();
      x.strokeStyle='#2e1c08'; x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.22,sz*.28);x.lineTo(sz*.40,sz*.52); x.stroke();
      // Moss/weeds growing in cracks
      x.fillStyle='rgba(40,110,20,0.55)';
      [[sz*.10,sz*.22],[sz*.50,sz*.36],[sz*.70,sz*.60],[sz*.25,sz*.68],[sz*.82,sz*.28]].forEach(([mx,my])=>{
        x.beginPath(); x.arc(mx,my,2+r()*3,0,Math.PI*2); x.fill();
      });
      break;
    }
    case 'water': {
      const g=x.createLinearGradient(0,0,0,sz);
      g.addColorStop(0,'#1d4ed8'); g.addColorStop(1,'#1e3a8a');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      for(let i=0;i<14;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,6+r()*14,2+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(147,197,253,${.04+r()*.12})`;x.fill();}
      x.strokeStyle='rgba(191,219,254,0.35)'; x.lineWidth=1;
      for(let wy=7;wy<sz;wy+=10){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-4,sz*.7,wy+4,sz,wy);x.stroke();}
      break;
    }
    case 'deep-water': {
      const g=x.createLinearGradient(0,0,0,sz);
      g.addColorStop(0,'#1e3a5f'); g.addColorStop(1,'#172554');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      for(let i=0;i<7;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,5+r()*10,2+r()*4,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(96,165,250,${.04+r()*.08})`;x.fill();}
      x.strokeStyle='rgba(96,165,250,0.15)'; x.lineWidth=.8;
      for(let wy=9;wy<sz;wy+=13){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-3,sz*.7,wy+3,sz,wy);x.stroke();}
      break;
    }
    case 'wood-floor': {
      const pw=16;
      for(let px=0;px<sz;px+=pw){
        const s2=0.8+r()*.35, rv=~~(148*s2), gv=~~(64*s2), bv=~~(14*s2);
        x.fillStyle=`rgb(${Math.min(rv,255)},${Math.min(gv,255)},${Math.min(bv,255)})`; x.fillRect(px,0,pw,sz);
        x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=.5;
        for(let gl=4;gl<sz;gl+=7+~~(r()*5)){x.beginPath();x.moveTo(px+1,gl);x.bezierCurveTo(px+r()*4,gl+2,px+pw-r()*4,gl+1,px+pw-1,gl);x.stroke();}
        x.strokeStyle='rgba(0,0,0,0.3)'; x.lineWidth=1;
        x.beginPath(); x.moveTo(px,0); x.lineTo(px,sz); x.stroke();
      }
      break;
    }
    case 'dirt': {
      x.fillStyle='#78350f'; x.fillRect(0,0,sz,sz);
      const dc=['#6b2d0b','#7c3a12','#5c2409','#884010','#3e1a06'];
      for(let i=0;i<22;i++){x.beginPath();x.arc(r()*sz,r()*sz,2+r()*9,0,Math.PI*2);x.fillStyle=dc[~~(r()*dc.length)];x.globalAlpha=.45;x.fill();}
      x.globalAlpha=1;
      for(let i=0;i<10;i++){x.beginPath();x.arc(r()*sz,r()*sz,1.2,0,Math.PI*2);x.fillStyle='#a16207';x.fill();}
      break;
    }
    case 'sand': {
      x.fillStyle='#c88b09'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<50;i++){x.beginPath();x.arc(r()*sz,r()*sz,r()*3+.5,0,Math.PI*2);x.fillStyle=r()>.5?'#f59e0b':'#a16207';x.globalAlpha=.25+r()*.4;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(251,191,36,0.2)'; x.lineWidth=.5;
      for(let wy=8;wy<sz;wy+=9){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-2,sz*.7,wy+2,sz,wy);x.stroke();}
      break;
    }
    case 'snow': {
      x.fillStyle='#dde3ea'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<30;i++){x.beginPath();x.arc(r()*sz,r()*sz,2+r()*5,0,Math.PI*2);x.fillStyle=r()>.5?'#f9fafb':'#c8d0da';x.globalAlpha=.4;x.fill();}
      x.globalAlpha=1; x.fillStyle='#fff';
      for(let i=0;i<15;i++){x.beginPath();x.arc(r()*sz,r()*sz,1,0,Math.PI*2);x.fill();}
      break;
    }
    case 'swamp': {
      x.fillStyle='#2d4a12'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<12;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,8+r()*14,4+r()*7,r()*Math.PI,0,Math.PI*2);x.fillStyle=r()>.5?'#1a2e05':'#4d7c0f';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1;
      for(let i=0;i<5;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,5+r()*9,3+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle='rgba(30,90,40,0.4)';x.fill();}
      break;
    }
    case 'cave': {
      x.fillStyle='#3c3733'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<10;i++){x.beginPath();x.arc(r()*sz,r()*sz,4+r()*11,0,Math.PI*2);x.fillStyle=r()>.5?'#292524':'#514b47';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(0,0,0,0.35)'; x.lineWidth=.6;
      for(let i=0;i<7;i++){x.beginPath();x.moveTo(r()*sz,r()*sz);x.lineTo(r()*sz,r()*sz);x.stroke();}
      break;
    }
    case 'road-h': {
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const ry=~~(sz*.25),rh=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(0,ry,sz,rh);
      for(let i=0;i<14;i++){x.beginPath();x.arc(r()*sz,ry+r()*rh,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(0,ry+.5);x.lineTo(sz,ry+.5);x.stroke();
      x.beginPath();x.moveTo(0,ry+rh-.5);x.lineTo(sz,ry+rh-.5);x.stroke();
      break;
    }
    case 'road-v': {
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rx=~~(sz*.25),rw=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(rx,0,rw,sz);
      for(let i=0;i<14;i++){x.beginPath();x.arc(rx+r()*rw,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(rx+.5,0);x.lineTo(rx+.5,sz);x.stroke();
      x.beginPath();x.moveTo(rx+rw-.5,0);x.lineTo(rx+rw-.5,sz);x.stroke();
      break;
    }
    case 'road-cross': {
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rs=~~(sz*.25),re=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(0,rs,sz,re); x.fillRect(rs,0,re,sz);
      for(let i=0;i<20;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(0,rs+.5);x.lineTo(rs,rs+.5);x.stroke();
      x.beginPath();x.moveTo(rs+re,rs+.5);x.lineTo(sz,rs+.5);x.stroke();
      x.beginPath();x.moveTo(0,rs+re-.5);x.lineTo(rs,rs+re-.5);x.stroke();
      x.beginPath();x.moveTo(rs+re,rs+re-.5);x.lineTo(sz,rs+re-.5);x.stroke();
      x.beginPath();x.moveTo(rs+.5,0);x.lineTo(rs+.5,rs);x.stroke();
      x.beginPath();x.moveTo(rs+.5,rs+re);x.lineTo(rs+.5,sz);x.stroke();
      x.beginPath();x.moveTo(rs+re-.5,0);x.lineTo(rs+re-.5,rs);x.stroke();
      x.beginPath();x.moveTo(rs+re-.5,rs+re);x.lineTo(rs+re-.5,sz);x.stroke();
      break;
    }
    case 'road-turn-ne': {
      // Connects north (top) and east (right) — arc center: top-right corner (sz,0)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      x.beginPath();
      x.arc(sz,0,sz*.75,Math.PI,Math.PI/2,true);
      x.arc(sz,0,sz*.25,Math.PI/2,Math.PI,false);
      x.closePath(); x.fillStyle='#9c9490'; x.fill();
      for(let i=0;i<12;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.arc(sz,0,sz*.75,Math.PI,Math.PI/2,true);x.stroke();
      x.beginPath();x.arc(sz,0,sz*.25,Math.PI/2,Math.PI,false);x.stroke();
      break;
    }
    case 'road-turn-nw': {
      // Connects north (top) and west (left) — arc center: top-left corner (0,0)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      x.beginPath();
      x.arc(0,0,sz*.75,0,Math.PI/2,false);
      x.arc(0,0,sz*.25,Math.PI/2,0,true);
      x.closePath(); x.fillStyle='#9c9490'; x.fill();
      for(let i=0;i<12;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.arc(0,0,sz*.75,0,Math.PI/2,false);x.stroke();
      x.beginPath();x.arc(0,0,sz*.25,Math.PI/2,0,true);x.stroke();
      break;
    }
    case 'road-turn-se': {
      // Connects south (bottom) and east (right) — arc center: bottom-right corner (sz,sz)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      x.beginPath();
      x.arc(sz,sz,sz*.75,Math.PI*1.5,Math.PI,true);
      x.arc(sz,sz,sz*.25,Math.PI,Math.PI*1.5,false);
      x.closePath(); x.fillStyle='#9c9490'; x.fill();
      for(let i=0;i<12;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.arc(sz,sz,sz*.75,Math.PI*1.5,Math.PI,true);x.stroke();
      x.beginPath();x.arc(sz,sz,sz*.25,Math.PI,Math.PI*1.5,false);x.stroke();
      break;
    }
    case 'road-turn-sw': {
      // Connects south (bottom) and west (left) — arc center: bottom-left corner (0,sz)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      x.beginPath();
      x.arc(0,sz,sz*.75,Math.PI*1.5,Math.PI*2,false);
      x.arc(0,sz,sz*.25,0,Math.PI*1.5,true);
      x.closePath(); x.fillStyle='#9c9490'; x.fill();
      for(let i=0;i<12;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.arc(0,sz,sz*.75,Math.PI*1.5,Math.PI*2,false);x.stroke();
      x.beginPath();x.arc(0,sz,sz*.25,0,Math.PI*1.5,true);x.stroke();
      break;
    }
    case 'road-t-n': {
      // T-junction: exits N, E, W (no south)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rsn=~~(sz*.25),ren=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(0,rsn,sz,ren); x.fillRect(rsn,0,ren,rsn);
      for(let i=0;i<16;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(0,rsn+.5);x.lineTo(rsn,rsn+.5);x.stroke();
      x.beginPath();x.moveTo(rsn+ren,rsn+.5);x.lineTo(sz,rsn+.5);x.stroke();
      x.beginPath();x.moveTo(0,rsn+ren-.5);x.lineTo(sz,rsn+ren-.5);x.stroke();
      x.beginPath();x.moveTo(rsn+.5,0);x.lineTo(rsn+.5,rsn);x.stroke();
      x.beginPath();x.moveTo(rsn+ren-.5,0);x.lineTo(rsn+ren-.5,rsn);x.stroke();
      break;
    }
    case 'road-t-s': {
      // T-junction: exits S, E, W (no north)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rss=~~(sz*.25),res=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(0,rss,sz,res); x.fillRect(rss,rss+res,res,rss);
      for(let i=0;i<16;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(0,rss+.5);x.lineTo(sz,rss+.5);x.stroke();
      x.beginPath();x.moveTo(0,rss+res-.5);x.lineTo(rss,rss+res-.5);x.stroke();
      x.beginPath();x.moveTo(rss+res,rss+res-.5);x.lineTo(sz,rss+res-.5);x.stroke();
      x.beginPath();x.moveTo(rss+.5,rss+res);x.lineTo(rss+.5,sz);x.stroke();
      x.beginPath();x.moveTo(rss+res-.5,rss+res);x.lineTo(rss+res-.5,sz);x.stroke();
      break;
    }
    case 'road-t-e': {
      // T-junction: exits N, S, E (no west)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rse=~~(sz*.25),ree=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(rse,0,ree,sz); x.fillRect(rse+ree,rse,sz-(rse+ree),ree);
      for(let i=0;i<16;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(rse+.5,0);x.lineTo(rse+.5,sz);x.stroke();
      x.beginPath();x.moveTo(rse+ree-.5,0);x.lineTo(rse+ree-.5,rse);x.stroke();
      x.beginPath();x.moveTo(rse+ree-.5,rse+ree);x.lineTo(rse+ree-.5,sz);x.stroke();
      x.beginPath();x.moveTo(rse+ree,rse+.5);x.lineTo(sz,rse+.5);x.stroke();
      x.beginPath();x.moveTo(rse+ree,rse+ree-.5);x.lineTo(sz,rse+ree-.5);x.stroke();
      break;
    }
    case 'road-t-w': {
      // T-junction: exits N, S, W (no east)
      x.fillStyle='#b8a070'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<6;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*3,0,Math.PI*2);x.fillStyle='rgba(139,119,90,0.4)';x.fill();}
      const rsw=~~(sz*.25),rew=~~(sz*.5);
      x.fillStyle='#9c9490'; x.fillRect(rsw,0,rew,sz); x.fillRect(0,rsw,rsw,rew);
      for(let i=0;i<16;i++){x.beginPath();x.arc(r()*sz,r()*sz,1+r()*2,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.38;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(80,74,68,0.55)'; x.lineWidth=1;
      x.beginPath();x.moveTo(rsw+rew-.5,0);x.lineTo(rsw+rew-.5,sz);x.stroke();
      x.beginPath();x.moveTo(rsw+.5,0);x.lineTo(rsw+.5,rsw);x.stroke();
      x.beginPath();x.moveTo(rsw+.5,rsw+rew);x.lineTo(rsw+.5,sz);x.stroke();
      x.beginPath();x.moveTo(0,rsw+.5);x.lineTo(rsw,rsw+.5);x.stroke();
      x.beginPath();x.moveTo(0,rsw+rew-.5);x.lineTo(rsw,rsw+rew-.5);x.stroke();
      break;
    }
    case 'lava': {
      // Flowing lava — modelled after water but in fire colours
      const lg=x.createLinearGradient(0,0,0,sz);
      lg.addColorStop(0,'#b91c1c'); lg.addColorStop(1,'#7f1d1d');
      x.fillStyle=lg; x.fillRect(0,0,sz,sz);
      // Hot-spot ellipses (like water's light patches)
      for(let i=0;i<14;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,6+r()*14,2+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(251,146,60,${.06+r()*.18})`;x.fill();}
      // Flowing wave lines in bright orange/yellow
      x.strokeStyle='rgba(253,186,116,0.45)'; x.lineWidth=1;
      for(let wy=7;wy<sz;wy+=10){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-4,sz*.7,wy+4,sz,wy);x.stroke();}
      break;
    }
    case 'pit': {
      const g=x.createRadialGradient(sz/2,sz/2,2,sz/2,sz/2,sz*.65);
      g.addColorStop(0,'#141414'); g.addColorStop(1,'#000');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      x.strokeStyle='rgba(255,255,255,0.06)'; x.lineWidth=1; x.strokeRect(2,2,sz-4,sz-4); break;
    }
    case 'door': {
      x.fillStyle='#6b2210'; x.fillRect(0,0,sz,sz);
      x.fillStyle='#8a3712'; x.fillRect(~~(sz*.12),~~(sz*.05),~~(sz*.76),~~(sz*.92));
      x.strokeStyle='#4a1a08'; x.lineWidth=1.5;
      for(let i=0;i<4;i++){const ey=~~(sz*.05+i*sz*.23);x.beginPath();x.moveTo(~~(sz*.12)+2,ey+2);x.lineTo(~~(sz*.88)-2,ey+2);x.stroke();}
      x.fillStyle='#ca8a04';
      x.beginPath(); x.arc(~~(sz*.7),~~(sz*.5),~~(sz*.07)+1,0,Math.PI*2); x.fill();
      x.strokeStyle='#92400e'; x.lineWidth=1;
      x.beginPath(); x.arc(~~(sz*.7),~~(sz*.5),~~(sz*.07)+1,0,Math.PI*2); x.stroke();
      break;
    }
    case 'cave-opening': {
      // Rocky wall surround
      const cwg=x.createLinearGradient(0,0,sz,sz);
      cwg.addColorStop(0,'#5a534e'); cwg.addColorStop(0.5,'#45403c'); cwg.addColorStop(1,'#332e2b');
      x.fillStyle=cwg; x.fillRect(0,0,sz,sz);
      // Rock texture — scattered pebble blobs
      for(let i=0;i<28;i++){
        const px=r()*sz,py=r()*sz,rad=1.5+r()*4.5;
        x.beginPath(); x.ellipse(px,py,rad,rad*(0.6+r()*0.5),r()*Math.PI,0,Math.PI*2);
        x.fillStyle=`rgba(${~~(20+r()*30)},${~~(18+r()*22)},${~~(15+r()*18)},0.45)`; x.fill();
      }
      // Highlight cracks
      x.strokeStyle='rgba(255,255,255,0.07)'; x.lineWidth=0.8;
      [[sz*.08,sz*.22,sz*.28,sz*.18],[sz*.60,sz*.10,sz*.72,sz*.35],[sz*.15,sz*.70,sz*.30,sz*.60],[sz*.75,sz*.55,sz*.88,sz*.80]].forEach(([x1,y1,x2,y2])=>{
        x.beginPath(); x.moveTo(x1,y1); x.lineTo(x2,y2); x.stroke();
      });
      // Dark cave void — irregular arch shape
      const ow=sz*.54, oh=sz*.62, ox=sz*.5, oy=sz*.56;
      x.beginPath();
      x.moveTo(ox-ow*.5, oy+oh*.5);
      x.bezierCurveTo(ox-ow*.5,oy-oh*.08, ox-ow*.28,oy-oh*.5, ox,oy-oh*.5);
      x.bezierCurveTo(ox+ow*.28,oy-oh*.5, ox+ow*.5,oy-oh*.08, ox+ow*.5,oy+oh*.5);
      x.closePath();
      const voidGrad=x.createRadialGradient(ox,oy,2,ox,oy+oh*.15,oh*.55);
      voidGrad.addColorStop(0,'#0a0808'); voidGrad.addColorStop(1,'#000');
      x.fillStyle=voidGrad; x.fill();
      // Arch edge highlight — subtle rim light
      x.strokeStyle='rgba(180,160,140,0.35)'; x.lineWidth=1.5; x.stroke();
      // Stalactites hanging from arch top
      [[ox-ow*.18,oy-oh*.48,3,8],[ox,oy-oh*.50,4,10],[ox+ow*.20,oy-oh*.46,3,7]].forEach(([sx2,sy2,sw2,sh2])=>{
        x.beginPath(); x.moveTo(sx2-sw2*.5,sy2); x.lineTo(sx2+sw2*.5,sy2); x.lineTo(sx2,sy2+sh2); x.closePath();
        x.fillStyle='#3a3530'; x.fill();
      });
      break;
    }
    case 'tree': {
      // Grass background
      x.fillStyle='#4ade80'; x.fillRect(0,0,sz,sz);
      // Subtle grass texture variation
      x.fillStyle='#22c55e'; x.fillRect(0,0,sz*.5,sz*.5);
      x.fillStyle='#4ade80'; x.fillRect(2,2,sz*.5-4,sz*.5-4);
      x.fillStyle='#22c55e'; x.fillRect(sz*.5,sz*.5,sz*.5,sz*.5);
      x.fillStyle='#4ade80'; x.fillRect(sz*.5+2,sz*.5+2,sz*.5-4,sz*.5-4);
      // Top-down single tree — canopy fills the tile
      const cx=sz*.5, cy=sz*.5;
      const cr=sz*.44; // canopy radius nearly fills tile
      // Ground shadow cast behind the canopy (offset slightly)
      x.beginPath(); x.ellipse(cx+sz*.06,cy+sz*.07,cr*.88,cr*.82,0,0,Math.PI*2);
      x.fillStyle='rgba(0,0,0,0.28)'; x.fill();
      // Outer canopy — darkest ring (shade underneath outer leaves)
      x.beginPath(); x.arc(cx,cy,cr,0,Math.PI*2);
      x.fillStyle='#14532d'; x.fill();
      // Mid canopy
      x.beginPath(); x.arc(cx,cy,cr*.78,0,Math.PI*2);
      x.fillStyle='#166534'; x.fill();
      // Inner canopy
      x.beginPath(); x.arc(cx,cy,cr*.56,0,Math.PI*2);
      x.fillStyle='#15803d'; x.fill();
      // Bright sunlit centre
      x.beginPath(); x.arc(cx,cy,cr*.35,0,Math.PI*2);
      x.fillStyle='#16a34a'; x.fill();
      // Highlight — upper-left bright spot (sun from upper-left)
      const hg=x.createRadialGradient(cx-cr*.22,cy-cr*.22,0,cx-cr*.22,cy-cr*.22,cr*.38);
      hg.addColorStop(0,'rgba(134,239,172,0.55)');
      hg.addColorStop(1,'rgba(134,239,172,0)');
      x.fillStyle=hg; x.fill(); // reuse last path shape
      x.beginPath(); x.arc(cx-cr*.22,cy-cr*.22,cr*.38,0,Math.PI*2); x.fillStyle=hg; x.fill();
      // Trunk dot visible at exact center
      x.beginPath(); x.arc(cx,cy,cr*.1,0,Math.PI*2);
      x.fillStyle='#78350f'; x.fill();
      x.beginPath(); x.arc(cx,cy,cr*.055,0,Math.PI*2);
      x.fillStyle='#92400e'; x.fill();
      // Leaf texture — small dark blobs around the canopy edge
      for(let i=0;i<16;i++){
        const ang=r()*Math.PI*2, dist=cr*(0.55+r()*0.42);
        x.beginPath(); x.ellipse(cx+Math.cos(ang)*dist, cy+Math.sin(ang)*dist, 2+r()*4, 2+r()*3, r()*Math.PI,0,Math.PI*2);
        x.fillStyle=`rgba(10,60,20,${0.3+r()*0.35})`; x.fill();
      }
      break;
    }
    case 'tree-large': {
      // Oversized canopy — nearly fills the full tile, bold presence
      x.fillStyle='#4ade80'; x.fillRect(0,0,sz,sz);
      x.fillStyle='#22c55e'; x.fillRect(0,0,sz*.5,sz*.5); x.fillStyle='#4ade80'; x.fillRect(2,2,sz*.5-4,sz*.5-4);
      x.fillStyle='#22c55e'; x.fillRect(sz*.5,sz*.5,sz*.5,sz*.5); x.fillStyle='#4ade80'; x.fillRect(sz*.5+2,sz*.5+2,sz*.5-4,sz*.5-4);
      const tlcx=sz*.5, tlcy=sz*.5, tlcr=sz*.48;
      // Shadow
      x.beginPath(); x.ellipse(tlcx+sz*.05,tlcy+sz*.06,tlcr*.9,tlcr*.85,0,0,Math.PI*2);
      x.fillStyle='rgba(0,0,0,0.32)'; x.fill();
      // Canopy rings
      x.beginPath(); x.arc(tlcx,tlcy,tlcr,0,Math.PI*2); x.fillStyle='#14532d'; x.fill();
      x.beginPath(); x.arc(tlcx,tlcy,tlcr*.80,0,Math.PI*2); x.fillStyle='#166534'; x.fill();
      x.beginPath(); x.arc(tlcx,tlcy,tlcr*.60,0,Math.PI*2); x.fillStyle='#15803d'; x.fill();
      x.beginPath(); x.arc(tlcx,tlcy,tlcr*.38,0,Math.PI*2); x.fillStyle='#16a34a'; x.fill();
      // Sunlit highlight
      const tlhg=x.createRadialGradient(tlcx-tlcr*.2,tlcy-tlcr*.2,0,tlcx-tlcr*.2,tlcy-tlcr*.2,tlcr*.42);
      tlhg.addColorStop(0,'rgba(134,239,172,0.65)'); tlhg.addColorStop(1,'rgba(134,239,172,0)');
      x.beginPath(); x.arc(tlcx-tlcr*.2,tlcy-tlcr*.2,tlcr*.42,0,Math.PI*2); x.fillStyle=tlhg; x.fill();
      // Thick trunk
      x.beginPath(); x.arc(tlcx,tlcy,tlcr*.13,0,Math.PI*2); x.fillStyle='#78350f'; x.fill();
      x.beginPath(); x.arc(tlcx,tlcy,tlcr*.07,0,Math.PI*2); x.fillStyle='#92400e'; x.fill();
      // Leaf blobs
      for(let i=0;i<20;i++){
        const ang=r()*Math.PI*2, dist=tlcr*(0.5+r()*0.46);
        x.beginPath(); x.ellipse(tlcx+Math.cos(ang)*dist, tlcy+Math.sin(ang)*dist, 3+r()*5, 2+r()*4, r()*Math.PI,0,Math.PI*2);
        x.fillStyle=`rgba(10,60,20,${0.3+r()*0.38})`; x.fill();
      }
      break;
    }
    case 'tree-pine': {
      // Top-down pine/conifer — darker, more pointed star-burst shape
      x.fillStyle='#4ade80'; x.fillRect(0,0,sz,sz);
      x.fillStyle='#22c55e'; x.fillRect(0,0,sz*.5,sz*.5); x.fillStyle='#4ade80'; x.fillRect(2,2,sz*.5-4,sz*.5-4);
      x.fillStyle='#22c55e'; x.fillRect(sz*.5,sz*.5,sz*.5,sz*.5); x.fillStyle='#4ade80'; x.fillRect(sz*.5+2,sz*.5+2,sz*.5-4,sz*.5-4);
      const pncx=sz*.5, pncy=sz*.5;
      // Shadow
      x.beginPath(); x.ellipse(pncx+sz*.04,pncy+sz*.05,sz*.42,sz*.38,0,0,Math.PI*2);
      x.fillStyle='rgba(0,0,0,0.3)'; x.fill();
      // Star-burst pine canopy — 8 pointed lobes
      x.beginPath();
      for(let i=0;i<8;i++){
        const a=i/8*Math.PI*2-Math.PI/2;
        const outr=sz*.46, inr=sz*.28;
        const ox=pncx+Math.cos(a)*outr, oy=pncy+Math.sin(a)*outr;
        const ia=a+Math.PI/8;
        const ix=pncx+Math.cos(ia)*inr, iy=pncy+Math.sin(ia)*inr;
        if(i===0) x.moveTo(ox,oy); else x.lineTo(ox,oy);
        x.lineTo(ix,iy);
      }
      x.closePath(); x.fillStyle='#0f4c2a'; x.fill();
      // Inner lighter star
      x.beginPath();
      for(let i=0;i<8;i++){
        const a=i/8*Math.PI*2-Math.PI/2;
        const outr=sz*.30, inr=sz*.17;
        const ox=pncx+Math.cos(a)*outr, oy=pncy+Math.sin(a)*outr;
        const ia=a+Math.PI/8;
        const ix=pncx+Math.cos(ia)*inr, iy=pncy+Math.sin(ia)*inr;
        if(i===0) x.moveTo(ox,oy); else x.lineTo(ox,oy);
        x.lineTo(ix,iy);
      }
      x.closePath(); x.fillStyle='#166534'; x.fill();
      // Centre core
      x.beginPath(); x.arc(pncx,pncy,sz*.12,0,Math.PI*2); x.fillStyle='#15803d'; x.fill();
      // Trunk dot
      x.beginPath(); x.arc(pncx,pncy,sz*.055,0,Math.PI*2); x.fillStyle='#78350f'; x.fill();
      break;
    }
    case 'tree-palm': {
      // Sandy/grass bg — palms grow near coast, use a warm light green
      x.fillStyle='#c8b460'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx=0;gx<sz;gx+=8){
        if((gx+gy)/8%2===0){x.fillStyle='rgba(160,130,20,0.25)';x.fillRect(gx,gy,8,8);}
      }}
      const pcx=sz*.50, pcy=sz*.50;
      // Trunk shadow
      x.beginPath(); x.ellipse(pcx+sz*.04,pcy+sz*.06,sz*.07,sz*.05,0,0,Math.PI*2);
      x.fillStyle='rgba(0,0,0,0.22)'; x.fill();
      // Curved trunk — slightly leaning right
      x.strokeStyle='#8b5c1c'; x.lineWidth=sz*.07;
      x.lineCap='round';
      x.beginPath();
      x.moveTo(pcx,pcy+sz*.24);
      x.bezierCurveTo(pcx+sz*.04,pcy+sz*.10, pcx+sz*.08,pcy-sz*.06, pcx+sz*.04,pcy-sz*.20);
      x.stroke();
      // Trunk rings
      x.strokeStyle='#6b3e0e'; x.lineWidth=sz*.018;
      for(let tr=0;tr<5;tr++){
        const ty=pcy+sz*.20-tr*sz*.09;
        const tx=pcx+sz*.01*tr;
        x.beginPath(); x.ellipse(tx,ty,sz*.035,sz*.012,0.15,0,Math.PI*2); x.stroke();
      }
      // 6 long drooping fronds radiating from crown
      const fronds=[
        // [angle, length factor, droop cx offset, droop cy offset]
        [-Math.PI*.80, 0.44,  sz*.04, sz*.14],
        [-Math.PI*.58, 0.42,  sz*.12, sz*.12],
        [-Math.PI*.32, 0.40,  sz*.14, sz*.06],
        [-Math.PI*.10, 0.40,  sz*.14,-sz*.04],
        [ Math.PI*.15, 0.38,  sz*.08,-sz*.12],
        [ Math.PI*.45, 0.40, -sz*.04,-sz*.14],
        [ Math.PI*.70, 0.36, -sz*.14,-sz*.06],
      ];
      const crownX=pcx+sz*.04, crownY=pcy-sz*.20;
      fronds.forEach(([ang,lf,cxo,cyo])=>{
        const tipX=crownX+Math.cos(ang)*sz*lf*1.4;
        const tipY=crownY+Math.sin(ang)*sz*lf*1.4;
        const midX=crownX+cxo, midY=crownY+cyo;
        // Main rib
        x.strokeStyle='#1a6e2e'; x.lineWidth=2.2; x.lineCap='round';
        x.beginPath(); x.moveTo(crownX,crownY);
        x.quadraticCurveTo(midX,midY,tipX,tipY); x.stroke();
        // Leaflets on each side of rib (5 pairs)
        for(let lf2=1;lf2<=5;lf2++){
          const t=lf2/6;
          const rx=crownX+(midX-crownX)*t*2>tipX?tipX:crownX+(tipX-crownX)*t;
          const ry=crownY+(tipY-crownY)*t;
          const perpAng=ang+Math.PI*.5;
          const llen=sz*(0.08-t*0.01);
          x.strokeStyle='#22a84a'; x.lineWidth=1.2;
          x.beginPath();
          x.moveTo(rx,ry);
          x.lineTo(rx+Math.cos(perpAng)*llen, ry+Math.sin(perpAng)*llen);
          x.stroke();
          x.beginPath();
          x.moveTo(rx,ry);
          x.lineTo(rx-Math.cos(perpAng)*llen, ry-Math.sin(perpAng)*llen);
          x.stroke();
        }
      });
      // Crown centre dot
      x.beginPath(); x.arc(crownX,crownY,sz*.055,0,Math.PI*2);
      x.fillStyle='#166534'; x.fill();
      // 2-3 coconuts hanging below crown
      [[crownX-sz*.06,crownY+sz*.06],[crownX+sz*.03,crownY+sz*.08],[crownX-sz*.01,crownY+sz*.12]].forEach(([cx2,cy2])=>{
        x.beginPath(); x.arc(cx2,cy2,sz*.035,0,Math.PI*2);
        x.fillStyle='#7a5010'; x.fill();
        x.beginPath(); x.arc(cx2-sz*.01,cy2-sz*.01,sz*.014,0,Math.PI*2);
        x.fillStyle='#a07030'; x.fill();
      });
      break;
    }
    case 'mountain': {
      // No background fill — transparent outside the triangle
      const mpx=sz*.5, mpy=sz*.05;   // peak
      const mbl=sz*.04, mbr=sz*.96, mby=sz*.93; // left foot, right foot, base y
      const mmc=sz*.5;                // base centre x (ridge foot)
      // Left face — lit side
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mbl,mby); x.lineTo(mmc,mby); x.closePath();
      x.fillStyle='#5c5650'; x.fill();
      // Right face — shadow side
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mmc,mby); x.lineTo(mbr,mby); x.closePath();
      x.fillStyle='#3a3733'; x.fill();
      // Strata lines — left face
      x.strokeStyle='rgba(0,0,0,0.22)'; x.lineWidth=0.5;
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(mpx+(mbl-mpx)*t, mpy+(mby-mpy)*t);
        x.lineTo(mpx+(mmc-mpx)*t, mpy+(mby-mpy)*t);
        x.stroke();}
      // Strata lines — right face
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(mpx+(mmc-mpx)*t, mpy+(mby-mpy)*t);
        x.lineTo(mpx+(mbr-mpx)*t, mpy+(mby-mpy)*t);
        x.stroke();}
      // Snow cap — white triangle at top ~22% of height
      const snowy=mpy+(mby-mpy)*.22;
      const snowl=mpx+(mbl-mpx)*.22, snowr=mpx+(mbr-mpx)*.22;
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(snowl,snowy); x.lineTo(mmc,snowy); x.closePath();
      x.fillStyle='#f0ede8'; x.fill();
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mmc,snowy); x.lineTo(snowr,snowy); x.closePath();
      x.fillStyle='#d8d4cf'; x.fill(); // right snow face slightly dimmer
      // Crisp mountain outline
      x.strokeStyle='rgba(0,0,0,0.55)'; x.lineWidth=0.8;
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mbl,mby); x.lineTo(mbr,mby); x.closePath(); x.stroke();
      break;
    }
    case 'mtn-scree':
    case 'mtn-alpine':
    case 'mtn-earthy':
    case 'mtn-tundra':
    case 'mtn-slate': {
      const _bg={['mtn-scree']:'#78716c',['mtn-alpine']:'#3d6b1c',['mtn-earthy']:'#8b7355',['mtn-tundra']:'#b8b4ae',['mtn-slate']:'#4a4540'}[tileId];
      x.fillStyle=_bg; x.fillRect(0,0,sz,sz);
      const _mpx=sz*.5, _mpy=sz*.05;
      const _mbl=sz*.04, _mbr=sz*.96, _mby=sz*.93;
      const _mmc=sz*.5;
      x.beginPath(); x.moveTo(_mpx,_mpy); x.lineTo(_mbl,_mby); x.lineTo(_mmc,_mby); x.closePath();
      x.fillStyle='#5c5650'; x.fill();
      x.beginPath(); x.moveTo(_mpx,_mpy); x.lineTo(_mmc,_mby); x.lineTo(_mbr,_mby); x.closePath();
      x.fillStyle='#3a3733'; x.fill();
      x.strokeStyle='rgba(0,0,0,0.22)'; x.lineWidth=0.5;
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(_mpx+(_mbl-_mpx)*t, _mpy+(_mby-_mpy)*t);
        x.lineTo(_mpx+(_mmc-_mpx)*t, _mpy+(_mby-_mpy)*t);
        x.stroke();}
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(_mpx+(_mmc-_mpx)*t, _mpy+(_mby-_mpy)*t);
        x.lineTo(_mpx+(_mbr-_mpx)*t, _mpy+(_mby-_mpy)*t);
        x.stroke();}
      const _snowy=_mpy+(_mby-_mpy)*.22;
      const _snowl=_mpx+(_mbl-_mpx)*.22, _snowr=_mpx+(_mbr-_mpx)*.22;
      x.beginPath(); x.moveTo(_mpx,_mpy); x.lineTo(_snowl,_snowy); x.lineTo(_mmc,_snowy); x.closePath();
      x.fillStyle='#f0ede8'; x.fill();
      x.beginPath(); x.moveTo(_mpx,_mpy); x.lineTo(_mmc,_snowy); x.lineTo(_snowr,_snowy); x.closePath();
      x.fillStyle='#d8d4cf'; x.fill();
      x.strokeStyle='rgba(0,0,0,0.55)'; x.lineWidth=0.8;
      x.beginPath(); x.moveTo(_mpx,_mpy); x.lineTo(_mbl,_mby); x.lineTo(_mbr,_mby); x.closePath(); x.stroke();
      break;
    }
    case 'hill': {
      // Dark grass base
      x.fillStyle='#1a3d0c'; x.fillRect(0,0,sz,sz);
      const hx=sz*.5, hy=sz*.5;
      // Concentric layers from outside in — dark to light
      const hLayers=[
        {rx:sz*.48,ry:sz*.44,c:'#234f10'},
        {rx:sz*.39,ry:sz*.35,c:'#2e6b16'},
        {rx:sz*.30,ry:sz*.27,c:'#3d8a1e'},
        {rx:sz*.21,ry:sz*.19,c:'#52a828'},
        {rx:sz*.13,ry:sz*.11,c:'#6abf34'},
        {rx:sz*.06,ry:sz*.05,c:'#8fd64a'},
      ];
      hLayers.forEach(({rx,ry,c})=>{
        x.beginPath(); x.ellipse(hx,hy,rx,ry,0,0,Math.PI*2);
        x.fillStyle=c; x.fill();
      });
      // Soft highlight dot at peak
      x.beginPath(); x.ellipse(hx,hy,sz*.04,sz*.035,0,0,Math.PI*2);
      x.fillStyle='rgba(180,255,120,0.6)'; x.fill();
      // Shadow arc lower-right
      x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=1;
      [sz*.46,sz*.36,sz*.26].forEach(rad=>{
        x.beginPath(); x.ellipse(hx+sz*.04,hy+sz*.05,rad,rad*.9,0,Math.PI*.3,Math.PI*1.2);
        x.stroke();
      });
      // Highlight arc upper-left
      x.strokeStyle='rgba(180,255,100,0.2)'; x.lineWidth=.8;
      [sz*.36,sz*.25].forEach(rad=>{
        x.beginPath(); x.ellipse(hx-sz*.03,hy-sz*.04,rad,rad*.9,0,Math.PI*1.3,Math.PI*2.2);
        x.stroke();
      });
      break;
    }
    case 'aura': {
      // No background fill — transparent outside flame shapes
      // Outer flame — red/orange silhouette, 3 tongues, full-width base
      x.beginPath();
      x.moveTo(0, sz);
      x.bezierCurveTo(0,       sz*.52,  sz*.06,  sz*.10,  sz*.18,  sz*.05);
      x.bezierCurveTo(sz*.28,  sz*.01,  sz*.30,  sz*.38,  sz*.36,  sz*.40);
      x.bezierCurveTo(sz*.41,  sz*.42,  sz*.44,  sz*.02,  sz*.50,  sz*.01);
      x.bezierCurveTo(sz*.56,  sz*.00,  sz*.59,  sz*.40,  sz*.64,  sz*.40);
      x.bezierCurveTo(sz*.70,  sz*.40,  sz*.72,  sz*.01,  sz*.82,  sz*.05);
      x.bezierCurveTo(sz*.92,  sz*.09,  sz,      sz*.52,  sz,      sz);
      x.closePath();
      const fo=x.createLinearGradient(0,sz,0,0);
      fo.addColorStop(0,'rgba(255,215,45,0.98)');
      fo.addColorStop(0.30,'rgba(235,82,0,0.96)');
      fo.addColorStop(1,'rgba(158,14,0,0.92)');
      x.fillStyle=fo; x.fill();

      // Inner flame — orange/yellow, 3 inset tongues
      x.beginPath();
      x.moveTo(sz*.06, sz);
      x.bezierCurveTo(sz*.06, sz*.60,  sz*.14,  sz*.19,  sz*.24,  sz*.17);
      x.bezierCurveTo(sz*.33, sz*.15,  sz*.35,  sz*.48,  sz*.41,  sz*.50);
      x.bezierCurveTo(sz*.46, sz*.52,  sz*.48,  sz*.12,  sz*.50,  sz*.10);
      x.bezierCurveTo(sz*.52, sz*.08,  sz*.55,  sz*.50,  sz*.59,  sz*.50);
      x.bezierCurveTo(sz*.65, sz*.50,  sz*.68,  sz*.15,  sz*.76,  sz*.17);
      x.bezierCurveTo(sz*.86, sz*.19,  sz*.94,  sz*.60,  sz*.94,  sz);
      x.closePath();
      const fi=x.createLinearGradient(0,sz,0,0);
      fi.addColorStop(0,'rgba(255,248,110,0.97)');
      fi.addColorStop(0.26,'rgba(255,148,10,0.95)');
      fi.addColorStop(1,'rgba(215,48,0,0.88)');
      x.fillStyle=fi; x.fill();

      // Hottest base glow — clipped to outer flame so no rectangle artifact
      x.save();
      x.beginPath();
      x.moveTo(0, sz);
      x.bezierCurveTo(0,       sz*.52,  sz*.06,  sz*.10,  sz*.18,  sz*.05);
      x.bezierCurveTo(sz*.28,  sz*.01,  sz*.30,  sz*.38,  sz*.36,  sz*.40);
      x.bezierCurveTo(sz*.41,  sz*.42,  sz*.44,  sz*.02,  sz*.50,  sz*.01);
      x.bezierCurveTo(sz*.56,  sz*.00,  sz*.59,  sz*.40,  sz*.64,  sz*.40);
      x.bezierCurveTo(sz*.70,  sz*.40,  sz*.72,  sz*.01,  sz*.82,  sz*.05);
      x.bezierCurveTo(sz*.92,  sz*.09,  sz,      sz*.52,  sz,      sz);
      x.closePath();
      x.clip();
      const hg=x.createLinearGradient(0,sz,0,sz*.74);
      hg.addColorStop(0,'rgba(255,255,220,0.94)');
      hg.addColorStop(1,'rgba(255,210,40,0)');
      x.fillStyle=hg; x.fillRect(0,sz*.74,sz,sz*.26);
      x.restore();
      break;
    }
    case 'aura-large': {
      // Bigger, wilder fire — fills more of the tile with intense glow underneath
      const flg=x.createRadialGradient(sz*.5,sz,0,sz*.5,sz*.7,sz*.55);
      flg.addColorStop(0,'rgba(255,240,80,0.95)');
      flg.addColorStop(0.4,'rgba(220,60,0,0.9)');
      flg.addColorStop(1,'rgba(80,0,0,0)');
      x.fillStyle=flg; x.fillRect(0,0,sz,sz);
      // Outer wide flame
      x.beginPath();
      x.moveTo(sz*.02,sz);
      x.bezierCurveTo(sz*.02, sz*.45, sz*.04, sz*.06, sz*.15, sz*.02);
      x.bezierCurveTo(sz*.25, sz*.0,  sz*.28, sz*.36, sz*.34, sz*.38);
      x.bezierCurveTo(sz*.39, sz*.40, sz*.43, sz*.0,  sz*.50, sz*.0);
      x.bezierCurveTo(sz*.57, sz*.0,  sz*.61, sz*.40, sz*.66, sz*.38);
      x.bezierCurveTo(sz*.72, sz*.36, sz*.75, sz*.0,  sz*.85, sz*.02);
      x.bezierCurveTo(sz*.96, sz*.06, sz*.98, sz*.45, sz*.98, sz);
      x.closePath();
      const flo=x.createLinearGradient(0,sz,0,0);
      flo.addColorStop(0,'rgba(255,220,40,0.99)');
      flo.addColorStop(0.25,'rgba(240,80,0,0.97)');
      flo.addColorStop(0.6,'rgba(180,20,0,0.94)');
      flo.addColorStop(1,'rgba(100,0,0,0.85)');
      x.fillStyle=flo; x.fill();
      // Inner hot core
      x.beginPath();
      x.moveTo(sz*.12,sz);
      x.bezierCurveTo(sz*.12,sz*.55,sz*.18,sz*.20,sz*.26,sz*.18);
      x.bezierCurveTo(sz*.34,sz*.16,sz*.36,sz*.48,sz*.42,sz*.50);
      x.bezierCurveTo(sz*.47,sz*.52,sz*.49,sz*.10,sz*.50,sz*.08);
      x.bezierCurveTo(sz*.51,sz*.06,sz*.53,sz*.50,sz*.58,sz*.50);
      x.bezierCurveTo(sz*.64,sz*.50,sz*.66,sz*.16,sz*.74,sz*.18);
      x.bezierCurveTo(sz*.82,sz*.20,sz*.88,sz*.55,sz*.88,sz);
      x.closePath();
      const fli=x.createLinearGradient(0,sz,0,0);
      fli.addColorStop(0,'rgba(255,255,180,0.99)');
      fli.addColorStop(0.2,'rgba(255,160,10,0.97)');
      fli.addColorStop(1,'rgba(220,50,0,0.88)');
      x.fillStyle=fli; x.fill();
      break;
    }
    case 'aura-blue': {
      // Magical blue/purple arcane fire
      const fbg=x.createRadialGradient(sz*.5,sz*.9,0,sz*.5,sz*.6,sz*.5);
      fbg.addColorStop(0,'rgba(200,230,255,0.9)');
      fbg.addColorStop(0.5,'rgba(80,100,220,0.7)');
      fbg.addColorStop(1,'rgba(20,0,60,0)');
      x.fillStyle=fbg; x.fillRect(0,0,sz,sz);
      // Outer blue flame
      x.beginPath();
      x.moveTo(0,sz);
      x.bezierCurveTo(0,sz*.52,sz*.06,sz*.10,sz*.18,sz*.05);
      x.bezierCurveTo(sz*.28,sz*.01,sz*.30,sz*.38,sz*.36,sz*.40);
      x.bezierCurveTo(sz*.41,sz*.42,sz*.44,sz*.02,sz*.50,sz*.01);
      x.bezierCurveTo(sz*.56,sz*.00,sz*.59,sz*.40,sz*.64,sz*.40);
      x.bezierCurveTo(sz*.70,sz*.40,sz*.72,sz*.01,sz*.82,sz*.05);
      x.bezierCurveTo(sz*.92,sz*.09,sz,sz*.52,sz,sz);
      x.closePath();
      const fbo=x.createLinearGradient(0,sz,0,0);
      fbo.addColorStop(0,'rgba(180,220,255,0.98)');
      fbo.addColorStop(0.25,'rgba(80,120,255,0.96)');
      fbo.addColorStop(0.6,'rgba(100,30,180,0.93)');
      fbo.addColorStop(1,'rgba(40,0,100,0.88)');
      x.fillStyle=fbo; x.fill();
      // Inner white-blue core
      x.beginPath();
      x.moveTo(sz*.1,sz);
      x.bezierCurveTo(sz*.1,sz*.60,sz*.16,sz*.22,sz*.25,sz*.20);
      x.bezierCurveTo(sz*.34,sz*.18,sz*.36,sz*.50,sz*.42,sz*.52);
      x.bezierCurveTo(sz*.47,sz*.54,sz*.49,sz*.14,sz*.50,sz*.12);
      x.bezierCurveTo(sz*.51,sz*.10,sz*.53,sz*.52,sz*.58,sz*.52);
      x.bezierCurveTo(sz*.64,sz*.52,sz*.66,sz*.18,sz*.75,sz*.20);
      x.bezierCurveTo(sz*.84,sz*.22,sz*.90,sz*.60,sz*.90,sz);
      x.closePath();
      const fbi=x.createLinearGradient(0,sz,0,0);
      fbi.addColorStop(0,'rgba(240,248,255,0.99)');
      fbi.addColorStop(0.2,'rgba(160,200,255,0.97)');
      fbi.addColorStop(1,'rgba(120,60,220,0.88)');
      x.fillStyle=fbi; x.fill();
      break;
    }
    case 'fire': {
      // Dark background + ember glow
      x.fillStyle='#0d0703'; x.fillRect(0,0,sz,sz);
      const fwglow=x.createRadialGradient(sz*.5,sz*.82,0,sz*.5,sz*.82,sz*.48);
      fwglow.addColorStop(0,'rgba(255,160,20,0.55)'); fwglow.addColorStop(1,'rgba(0,0,0,0)');
      x.fillStyle=fwglow; x.fillRect(0,0,sz,sz);
      // Wood logs
      x.beginPath(); x.roundRect(sz*.05,sz*.76,sz*.9,sz*.1,4);
      const wl1=x.createLinearGradient(sz*.05,sz*.76,sz*.05,sz*.86);
      wl1.addColorStop(0,'#5c3010'); wl1.addColorStop(0.4,'#7a4218'); wl1.addColorStop(1,'#3a1e08');
      x.fillStyle=wl1; x.fill();
      x.beginPath(); x.ellipse(sz*.08,sz*.81,sz*.05,sz*.05,0,0,Math.PI*2); x.fillStyle='#4a280e'; x.fill();
      x.beginPath(); x.ellipse(sz*.08,sz*.81,sz*.03,sz*.03,0,0,Math.PI*2); x.fillStyle='#2d1606'; x.fill();
      x.beginPath(); x.roundRect(sz*.08,sz*.82,sz*.84,sz*.1,4);
      const wl2=x.createLinearGradient(sz*.08,sz*.82,sz*.08,sz*.92);
      wl2.addColorStop(0,'#4e2a0c'); wl2.addColorStop(0.4,'#6b3814'); wl2.addColorStop(1,'#2e1406');
      x.fillStyle=wl2; x.fill();
      for(let i=0;i<6;i++){
        x.beginPath(); x.arc(sz*(.15+i*.14),sz*(.79+r()*.08),1+r()*2.5,0,Math.PI*2);
        x.fillStyle=`rgba(255,${~~(120+r()*100)},0,${0.6+r()*.4})`; x.fill();
      }
      // Tongue 1 — whips hard right in lower half, crosses back left, tips far left
      x.beginPath();
      x.moveTo(sz*.09,sz*.78);
      x.bezierCurveTo(sz*.30,sz*.68, sz*.52,sz*.55, sz*.42,sz*.43);
      x.bezierCurveTo(sz*.32,sz*.31, sz*.03,sz*.19, sz*.02,sz*.03);
      x.lineTo(sz*.11,sz*.01);
      x.bezierCurveTo(sz*.15,sz*.19, sz*.52,sz*.31, sz*.60,sz*.43);
      x.bezierCurveTo(sz*.68,sz*.55, sz*.46,sz*.68, sz*.27,sz*.78);
      x.closePath();
      const fw1g=x.createLinearGradient(sz*.18,sz*.78,sz*.06,sz*.02);
      fw1g.addColorStop(0,'rgba(255,250,140,1)'); fw1g.addColorStop(0.2,'rgba(255,170,0,0.98)'); fw1g.addColorStop(0.6,'rgba(220,40,0,0.92)'); fw1g.addColorStop(1,'rgba(140,8,0,0.4)');
      x.fillStyle=fw1g; x.fill();
      // Tongue 2 — sweeps far left, arcs way right, tips center-right (medium height)
      x.beginPath();
      x.moveTo(sz*.28,sz*.78);
      x.bezierCurveTo(sz*.04,sz*.67, sz*-.05,sz*.54, sz*.08,sz*.46);
      x.bezierCurveTo(sz*.21,sz*.38, sz*.54,sz*.30, sz*.60,sz*.24);
      x.lineTo(sz*.68,sz*.26);
      x.bezierCurveTo(sz*.64,sz*.32, sz*.35,sz*.40, sz*.28,sz*.48);
      x.bezierCurveTo(sz*.21,sz*.56, sz*.44,sz*.67, sz*.46,sz*.78);
      x.closePath();
      const fw2g=x.createLinearGradient(sz*.37,sz*.78,sz*.64,sz*.25);
      fw2g.addColorStop(0,'rgba(255,245,120,1)'); fw2g.addColorStop(0.25,'rgba(255,155,0,0.97)'); fw2g.addColorStop(0.65,'rgba(215,42,0,0.92)'); fw2g.addColorStop(1,'rgba(145,8,0,0.4)');
      x.fillStyle=fw2g; x.fill();
      // Tongue 3 — tall S-curve center: bows right then snaps left (medium-tall)
      x.beginPath();
      x.moveTo(sz*.43,sz*.78);
      x.bezierCurveTo(sz*.66,sz*.65, sz*.75,sz*.53, sz*.68,sz*.44);
      x.bezierCurveTo(sz*.61,sz*.35, sz*.26,sz*.26, sz*.41,sz*.12);
      x.lineTo(sz*.52,sz*.12);
      x.bezierCurveTo(sz*.38,sz*.26, sz*.77,sz*.35, sz*.84,sz*.44);
      x.bezierCurveTo(sz*.91,sz*.53, sz*.84,sz*.65, sz*.59,sz*.78);
      x.closePath();
      const fw3g=x.createLinearGradient(sz*.51,sz*.78,sz*.47,sz*.12);
      fw3g.addColorStop(0,'rgba(255,255,180,1)'); fw3g.addColorStop(0.18,'rgba(255,210,20,0.99)'); fw3g.addColorStop(0.5,'rgba(245,68,0,0.93)'); fw3g.addColorStop(1,'rgba(165,12,0,0.4)');
      x.fillStyle=fw3g; x.fill();
      // Tongue 4 — mirror of 2: sweeps hard right, arcs left, tips center-left
      x.beginPath();
      x.moveTo(sz*.54,sz*.78);
      x.bezierCurveTo(sz*.76,sz*.64,sz*1.04,sz*.48, sz*.90,sz*.33);
      x.bezierCurveTo(sz*.76,sz*.18, sz*.44,sz*.10, sz*.38,sz*.03);
      x.lineTo(sz*.46,sz*.01);
      x.bezierCurveTo(sz*.52,sz*.10, sz*.92,sz*.20,sz*1.08,sz*.35);
      x.bezierCurveTo(sz*1.12,sz*.52, sz*.84,sz*.64, sz*.70,sz*.78);
      x.closePath();
      const fw4g=x.createLinearGradient(sz*.62,sz*.78,sz*.42,sz*.02);
      fw4g.addColorStop(0,'rgba(255,242,115,1)'); fw4g.addColorStop(0.25,'rgba(255,138,0,0.97)'); fw4g.addColorStop(0.65,'rgba(212,36,0,0.92)'); fw4g.addColorStop(1,'rgba(135,6,0,0.4)');
      x.fillStyle=fw4g; x.fill();
      // Tongue 5 — whips hard left in lower half, crosses back right, tips far right
      x.beginPath();
      x.moveTo(sz*.73,sz*.78);
      x.bezierCurveTo(sz*.50,sz*.68, sz*.40,sz*.55, sz*.52,sz*.43);
      x.bezierCurveTo(sz*.64,sz*.31, sz*.89,sz*.19, sz*.90,sz*.04);
      x.lineTo(sz*.98,sz*.02);
      x.bezierCurveTo(sz*.97,sz*.19, sz*.74,sz*.31, sz*.68,sz*.43);
      x.bezierCurveTo(sz*.62,sz*.55, sz*.70,sz*.68, sz*.91,sz*.78);
      x.closePath();
      const fw5g=x.createLinearGradient(sz*.82,sz*.78,sz*.94,sz*.03);
      fw5g.addColorStop(0,'rgba(255,240,108,1)'); fw5g.addColorStop(0.25,'rgba(252,128,0,0.96)'); fw5g.addColorStop(0.65,'rgba(207,34,0,0.92)'); fw5g.addColorStop(1,'rgba(128,4,0,0.4)');
      x.fillStyle=fw5g; x.fill();
      // Hot white-yellow core overlay on tongue 3
      x.beginPath();
      x.moveTo(sz*.46,sz*.78);
      x.bezierCurveTo(sz*.60,sz*.65, sz*.67,sz*.53, sz*.62,sz*.44);
      x.bezierCurveTo(sz*.57,sz*.35, sz*.34,sz*.27, sz*.45,sz*.18);
      x.lineTo(sz*.50,sz*.17);
      x.bezierCurveTo(sz*.40,sz*.27, sz*.59,sz*.35, sz*.66,sz*.44);
      x.bezierCurveTo(sz*.73,sz*.53, sz*.66,sz*.65, sz*.56,sz*.78);
      x.closePath();
      const fwcg=x.createLinearGradient(sz*.51,sz*.78,sz*.48,sz*.17);
      fwcg.addColorStop(0,'rgba(255,255,240,1)'); fwcg.addColorStop(0.3,'rgba(255,235,120,0.88)'); fwcg.addColorStop(1,'rgba(255,170,30,0)');
      x.fillStyle=fwcg; x.fill();
      break;
    }
    case 'fire-blue': {
      // Dark background + arcane glow
      x.fillStyle='#03040d'; x.fillRect(0,0,sz,sz);
      const fbglow=x.createRadialGradient(sz*.5,sz*.82,0,sz*.5,sz*.82,sz*.48);
      fbglow.addColorStop(0,'rgba(80,120,255,0.5)'); fbglow.addColorStop(1,'rgba(0,0,0,0)');
      x.fillStyle=fbglow; x.fillRect(0,0,sz,sz);
      // Wood logs (dark tinted)
      x.beginPath(); x.roundRect(sz*.05,sz*.76,sz*.9,sz*.1,4);
      const bwl1=x.createLinearGradient(sz*.05,sz*.76,sz*.05,sz*.86);
      bwl1.addColorStop(0,'#1a1428'); bwl1.addColorStop(0.4,'#2d2040'); bwl1.addColorStop(1,'#0e0a18');
      x.fillStyle=bwl1; x.fill();
      x.beginPath(); x.roundRect(sz*.08,sz*.82,sz*.84,sz*.1,4);
      const bwl2=x.createLinearGradient(sz*.08,sz*.82,sz*.08,sz*.92);
      bwl2.addColorStop(0,'#150f22'); bwl2.addColorStop(0.4,'#261a38'); bwl2.addColorStop(1,'#0a0714');
      x.fillStyle=bwl2; x.fill();
      for(let i=0;i<6;i++){
        x.beginPath(); x.arc(sz*(.15+i*.14),sz*(.79+r()*.08),1+r()*2.5,0,Math.PI*2);
        x.fillStyle=`rgba(${~~(80+r()*80)},${~~(80+r()*80)},255,${0.7+r()*.3})`; x.fill();
      }
      // Tongue 1 — whips hard right, crosses left
      x.beginPath();
      x.moveTo(sz*.09,sz*.78);
      x.bezierCurveTo(sz*.30,sz*.68, sz*.52,sz*.55, sz*.42,sz*.43);
      x.bezierCurveTo(sz*.32,sz*.31, sz*.03,sz*.19, sz*.02,sz*.03);
      x.lineTo(sz*.11,sz*.01);
      x.bezierCurveTo(sz*.15,sz*.19, sz*.52,sz*.31, sz*.60,sz*.43);
      x.bezierCurveTo(sz*.68,sz*.55, sz*.46,sz*.68, sz*.27,sz*.78);
      x.closePath();
      const fb1g=x.createLinearGradient(sz*.18,sz*.78,sz*.06,sz*.02);
      fb1g.addColorStop(0,'rgba(220,240,255,1)'); fb1g.addColorStop(0.2,'rgba(80,140,255,0.98)'); fb1g.addColorStop(0.6,'rgba(75,0,200,0.92)'); fb1g.addColorStop(1,'rgba(25,0,90,0.4)');
      x.fillStyle=fb1g; x.fill();
      // Tongue 2 — sweeps far left, arcs right (medium height)
      x.beginPath();
      x.moveTo(sz*.28,sz*.78);
      x.bezierCurveTo(sz*.04,sz*.67, sz*-.05,sz*.54, sz*.08,sz*.46);
      x.bezierCurveTo(sz*.21,sz*.38, sz*.54,sz*.30, sz*.60,sz*.24);
      x.lineTo(sz*.68,sz*.26);
      x.bezierCurveTo(sz*.64,sz*.32, sz*.35,sz*.40, sz*.28,sz*.48);
      x.bezierCurveTo(sz*.21,sz*.56, sz*.44,sz*.67, sz*.46,sz*.78);
      x.closePath();
      const fb2g=x.createLinearGradient(sz*.37,sz*.78,sz*.64,sz*.25);
      fb2g.addColorStop(0,'rgba(225,242,255,1)'); fb2g.addColorStop(0.25,'rgba(90,150,255,0.97)'); fb2g.addColorStop(0.65,'rgba(85,5,210,0.92)'); fb2g.addColorStop(1,'rgba(30,0,105,0.4)');
      x.fillStyle=fb2g; x.fill();
      // Tongue 3 — tall S-curve center (medium-tall)
      x.beginPath();
      x.moveTo(sz*.43,sz*.78);
      x.bezierCurveTo(sz*.66,sz*.65, sz*.75,sz*.53, sz*.68,sz*.44);
      x.bezierCurveTo(sz*.61,sz*.35, sz*.26,sz*.26, sz*.41,sz*.12);
      x.lineTo(sz*.52,sz*.12);
      x.bezierCurveTo(sz*.38,sz*.26, sz*.77,sz*.35, sz*.84,sz*.44);
      x.bezierCurveTo(sz*.91,sz*.53, sz*.84,sz*.65, sz*.59,sz*.78);
      x.closePath();
      const fb3g=x.createLinearGradient(sz*.51,sz*.78,sz*.47,sz*.12);
      fb3g.addColorStop(0,'rgba(235,248,255,1)'); fb3g.addColorStop(0.18,'rgba(140,200,255,0.99)'); fb3g.addColorStop(0.5,'rgba(95,20,230,0.93)'); fb3g.addColorStop(1,'rgba(35,0,125,0.4)');
      x.fillStyle=fb3g; x.fill();
      // Tongue 4 — sweeps hard right, arcs left
      x.beginPath();
      x.moveTo(sz*.54,sz*.78);
      x.bezierCurveTo(sz*.76,sz*.64,sz*1.04,sz*.48, sz*.90,sz*.33);
      x.bezierCurveTo(sz*.76,sz*.18, sz*.44,sz*.10, sz*.38,sz*.03);
      x.lineTo(sz*.46,sz*.01);
      x.bezierCurveTo(sz*.52,sz*.10, sz*.92,sz*.20,sz*1.08,sz*.35);
      x.bezierCurveTo(sz*1.12,sz*.52, sz*.84,sz*.64, sz*.70,sz*.78);
      x.closePath();
      const fb4g=x.createLinearGradient(sz*.62,sz*.78,sz*.42,sz*.02);
      fb4g.addColorStop(0,'rgba(215,238,255,1)'); fb4g.addColorStop(0.25,'rgba(72,118,255,0.97)'); fb4g.addColorStop(0.65,'rgba(68,0,185,0.92)'); fb4g.addColorStop(1,'rgba(22,0,88,0.4)');
      x.fillStyle=fb4g; x.fill();
      // Tongue 5 — whips hard left, crosses right
      x.beginPath();
      x.moveTo(sz*.73,sz*.78);
      x.bezierCurveTo(sz*.50,sz*.68, sz*.40,sz*.55, sz*.52,sz*.43);
      x.bezierCurveTo(sz*.64,sz*.31, sz*.89,sz*.19, sz*.90,sz*.04);
      x.lineTo(sz*.98,sz*.02);
      x.bezierCurveTo(sz*.97,sz*.19, sz*.74,sz*.31, sz*.68,sz*.43);
      x.bezierCurveTo(sz*.62,sz*.55, sz*.70,sz*.68, sz*.91,sz*.78);
      x.closePath();
      const fb5g=x.createLinearGradient(sz*.82,sz*.78,sz*.94,sz*.03);
      fb5g.addColorStop(0,'rgba(210,235,255,1)'); fb5g.addColorStop(0.25,'rgba(65,108,248,0.96)'); fb5g.addColorStop(0.65,'rgba(58,0,178,0.92)'); fb5g.addColorStop(1,'rgba(18,0,82,0.4)');
      x.fillStyle=fb5g; x.fill();
      // White-blue hot core on tongue 3
      x.beginPath();
      x.moveTo(sz*.46,sz*.78);
      x.bezierCurveTo(sz*.60,sz*.65, sz*.67,sz*.53, sz*.62,sz*.44);
      x.bezierCurveTo(sz*.57,sz*.35, sz*.34,sz*.27, sz*.45,sz*.18);
      x.lineTo(sz*.50,sz*.17);
      x.bezierCurveTo(sz*.40,sz*.27, sz*.59,sz*.35, sz*.66,sz*.44);
      x.bezierCurveTo(sz*.73,sz*.53, sz*.66,sz*.65, sz*.56,sz*.78);
      x.closePath();
      const fbcg=x.createLinearGradient(sz*.51,sz*.78,sz*.48,sz*.17);
      fbcg.addColorStop(0,'rgba(240,248,255,1)'); fbcg.addColorStop(0.3,'rgba(180,215,255,0.88)'); fbcg.addColorStop(1,'rgba(100,165,255,0)');
      x.fillStyle=fbcg; x.fill();
      break;
    }
    case 'cabin': {
      // Grass bg
      x.fillStyle='#1a6b2a'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx=0;gx<sz;gx+=8){
        if((gx+gy)/8%2===0){x.fillStyle='rgba(0,80,0,0.18)';x.fillRect(gx,gy,8,8);}
      }}
      // Walls
      const cwalg=x.createLinearGradient(sz*.15,sz*.36,sz*.15,sz*.85);
      cwalg.addColorStop(0,'#8b5a2b'); cwalg.addColorStop(1,'#5c3610');
      x.fillStyle=cwalg; x.fillRect(sz*.15,sz*.36,sz*.70,sz*.49);
      // Log lines
      x.strokeStyle='rgba(0,0,0,0.22)'; x.lineWidth=1.5;
      for(let ly=sz*.43;ly<sz*.85;ly+=6){x.beginPath();x.moveTo(sz*.15,ly);x.lineTo(sz*.85,ly);x.stroke();}
      // Roof
      x.beginPath(); x.moveTo(sz*.06,sz*.40);x.lineTo(sz*.50,sz*.04);x.lineTo(sz*.94,sz*.40);x.closePath();
      const crg=x.createLinearGradient(sz*.5,sz*.04,sz*.5,sz*.40);
      crg.addColorStop(0,'#2d1a0a'); crg.addColorStop(1,'#5a3010');
      x.fillStyle=crg; x.fill();
      x.strokeStyle='#1a0c04'; x.lineWidth=1; x.stroke();
      // Door
      x.fillStyle='#3b1f08'; x.fillRect(sz*.40,sz*.57,sz*.20,sz*.28);
      x.strokeStyle='#1a0c04'; x.lineWidth=1.5; x.strokeRect(sz*.40,sz*.57,sz*.20,sz*.28);
      // Window left
      x.fillStyle='rgba(180,220,255,0.55)'; x.fillRect(sz*.19,sz*.44,sz*.14,sz*.12);
      x.strokeStyle='#3b1f08'; x.lineWidth=1; x.strokeRect(sz*.19,sz*.44,sz*.14,sz*.12);
      x.beginPath(); x.moveTo(sz*.26,sz*.44);x.lineTo(sz*.26,sz*.56);x.stroke();
      x.beginPath(); x.moveTo(sz*.19,sz*.50);x.lineTo(sz*.33,sz*.50);x.stroke();
      // Window right
      x.fillStyle='rgba(180,220,255,0.55)'; x.fillRect(sz*.67,sz*.44,sz*.14,sz*.12);
      x.strokeStyle='#3b1f08'; x.lineWidth=1; x.strokeRect(sz*.67,sz*.44,sz*.14,sz*.12);
      x.beginPath(); x.moveTo(sz*.74,sz*.44);x.lineTo(sz*.74,sz*.56);x.stroke();
      x.beginPath(); x.moveTo(sz*.67,sz*.50);x.lineTo(sz*.81,sz*.50);x.stroke();
      // Chimney
      x.fillStyle='#4a2010'; x.fillRect(sz*.66,sz*.08,sz*.10,sz*.20);
      x.fillStyle='#2d1208'; x.fillRect(sz*.64,sz*.06,sz*.14,sz*.04);
      break;
    }
    case 'cabin-ruin': {
      // Overgrown grass bg
      x.fillStyle='#1a5c1a'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx2=0;gx2<sz;gx2+=8){
        if((gx2+gy)/8%2===0){x.fillStyle='rgba(0,70,0,0.22)';x.fillRect(gx2,gy,8,8);}
      }}
      // Partial collapsed log walls — three broken segments
      // Left wall stub
      x.save();
      x.fillStyle='#4a2e10';
      x.fillRect(sz*.08,sz*.40,sz*.14,sz*.46);
      // Log grain lines
      x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=1;
      for(let ly=sz*.46;ly<sz*.86;ly+=7){x.beginPath();x.moveTo(sz*.08,ly);x.lineTo(sz*.22,ly);x.stroke();}
      x.restore();
      // Back wall fragment
      x.fillStyle='#3e2608';
      x.fillRect(sz*.22,sz*.36,sz*.42,sz*.10);
      x.strokeStyle='rgba(0,0,0,0.22)'; x.lineWidth=1;
      for(let lx2=sz*.26;lx2<sz*.64;lx2+=6){x.beginPath();x.moveTo(lx2,sz*.36);x.lineTo(lx2,sz*.46);x.stroke();}
      // Collapsed roof — tilted broken triangle
      x.save(); x.translate(sz*.50,sz*.52); x.rotate(0.28);
      x.beginPath(); x.moveTo(-sz*.34,-sz*.08);x.lineTo(sz*.06,-sz*.32);x.lineTo(sz*.38,-sz*.08);x.closePath();
      const rrg=x.createLinearGradient(-sz*.34,-sz*.32,sz*.38,-sz*.08);
      rrg.addColorStop(0,'#1a0c04'); rrg.addColorStop(1,'#3a1a08');
      x.fillStyle=rrg; x.fill();
      x.strokeStyle='#0e0602'; x.lineWidth=1; x.stroke();
      x.restore();
      // Broken chimney stump
      x.fillStyle='#3a1808'; x.fillRect(sz*.62,sz*.30,sz*.08,sz*.14);
      x.fillStyle='rgba(0,0,0,0.35)';
      x.beginPath(); x.moveTo(sz*.62,sz*.30);x.lineTo(sz*.70,sz*.30);x.lineTo(sz*.68,sz*.28);x.lineTo(sz*.64,sz*.29);x.closePath(); x.fill();
      // Scattered rubble stones
      [[sz*.30,sz*.60,6,5],[sz*.55,sz*.48,5,4],[sz*.72,sz*.66,7,5],[sz*.18,sz*.72,5,4],[sz*.48,sz*.76,6,4]].forEach(([rx,ry,rw,rh])=>{
        x.save(); x.translate(rx,ry); x.rotate(r()*0.8-0.4);
        x.fillStyle='#6b6460'; x.fillRect(-rw/2,-rh/2,rw,rh);
        x.strokeStyle='rgba(0,0,0,0.4)'; x.lineWidth=0.8; x.strokeRect(-rw/2,-rh/2,rw,rh);
        x.restore();
      });
      // Moss patches
      x.fillStyle='rgba(30,100,20,0.6)';
      [[sz*.15,sz*.55],[sz*.40,sz*.66],[sz*.70,sz*.46],[sz*.28,sz*.80],[sz*.60,sz*.72]].forEach(([mx,my])=>{
        x.beginPath(); x.arc(mx,my,2+r()*3.5,0,Math.PI*2); x.fill();
      });
      // Weeds sprouting through floor
      x.strokeStyle='#2d7a18'; x.lineWidth=1;
      [[sz*.35,sz*.72],[sz*.52,sz*.60],[sz*.65,sz*.80]].forEach(([wx,wy])=>{
        x.beginPath(); x.moveTo(wx,wy);x.bezierCurveTo(wx-4,wy-8,wx+2,wy-14,wx,wy-16);x.stroke();
        x.beginPath(); x.moveTo(wx,wy);x.bezierCurveTo(wx+5,wy-6,wx+8,wy-10,wx+6,wy-14);x.stroke();
      });
      break;
    }
    case 'tent': {
      // Grass bg
      x.fillStyle='#1a6b2a'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx=0;gx<sz;gx+=8){
        if((gx+gy)/8%2===0){x.fillStyle='rgba(0,80,0,0.18)';x.fillRect(gx,gy,8,8);}
      }}
      // Tent body
      x.beginPath(); x.moveTo(sz*.08,sz*.87);x.lineTo(sz*.50,sz*.08);x.lineTo(sz*.92,sz*.87);x.closePath();
      const ttg=x.createLinearGradient(sz*.5,sz*.08,sz*.5,sz*.87);
      ttg.addColorStop(0,'#e8d5b0'); ttg.addColorStop(0.5,'#c9b47a'); ttg.addColorStop(1,'#a8924e');
      x.fillStyle=ttg; x.fill();
      x.strokeStyle='#6b5a30'; x.lineWidth=1.5; x.stroke();
      // Center seam
      x.strokeStyle='rgba(90,70,30,0.5)'; x.lineWidth=1;
      x.beginPath(); x.moveTo(sz*.50,sz*.08);x.lineTo(sz*.50,sz*.87);x.stroke();
      // Entrance flap
      x.beginPath(); x.moveTo(sz*.35,sz*.87);x.lineTo(sz*.50,sz*.42);x.lineTo(sz*.65,sz*.87);x.closePath();
      x.fillStyle='rgba(25,15,5,0.88)'; x.fill();
      // Flap rolled edges
      x.strokeStyle='rgba(215,190,130,0.7)'; x.lineWidth=1;
      x.beginPath(); x.moveTo(sz*.35,sz*.87);x.bezierCurveTo(sz*.42,sz*.64,sz*.46,sz*.50,sz*.50,sz*.42);x.stroke();
      x.beginPath(); x.moveTo(sz*.65,sz*.87);x.bezierCurveTo(sz*.58,sz*.64,sz*.54,sz*.50,sz*.50,sz*.42);x.stroke();
      // Ground pegs
      x.strokeStyle='#5c3a10'; x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.10,sz*.86);x.lineTo(sz*.05,sz*.95);x.stroke();
      x.beginPath(); x.moveTo(sz*.90,sz*.86);x.lineTo(sz*.95,sz*.95);x.stroke();
      x.beginPath(); x.moveTo(sz*.50,sz*.86);x.lineTo(sz*.50,sz*.96);x.stroke();
      break;
    }
    case 'horse': {
      // Grass bg
      x.fillStyle='#1a6b2a'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx=0;gx<sz;gx+=8){
        if((gx+gy)/8%2===0){x.fillStyle='rgba(0,80,0,0.18)';x.fillRect(gx,gy,8,8);}
      }}
      // Body
      x.beginPath(); x.ellipse(sz*.50,sz*.54,sz*.28,sz*.17,0,0,Math.PI*2);
      const hbg=x.createRadialGradient(sz*.42,sz*.48,sz*.02,sz*.50,sz*.54,sz*.30);
      hbg.addColorStop(0,'#d4884a'); hbg.addColorStop(1,'#7a3e0a');
      x.fillStyle=hbg; x.fill();
      // Neck
      x.beginPath(); x.moveTo(sz*.30,sz*.48);x.bezierCurveTo(sz*.26,sz*.32,sz*.34,sz*.22,sz*.40,sz*.28);x.bezierCurveTo(sz*.44,sz*.34,sz*.40,sz*.46,sz*.36,sz*.52);x.closePath();
      x.fillStyle='#b86a28'; x.fill();
      // Head
      x.beginPath(); x.ellipse(sz*.36,sz*.22,sz*.10,sz*.08,-0.25,0,Math.PI*2);
      x.fillStyle='#b86a28'; x.fill();
      // Muzzle
      x.beginPath(); x.ellipse(sz*.30,sz*.27,sz*.05,sz*.04,0.15,0,Math.PI*2);
      x.fillStyle='#cc8850'; x.fill();
      // Eye
      x.beginPath(); x.arc(sz*.38,sz*.19,sz*.016,0,Math.PI*2); x.fillStyle='#120600'; x.fill();
      // Ear
      x.beginPath(); x.moveTo(sz*.42,sz*.15);x.lineTo(sz*.44,sz*.09);x.lineTo(sz*.47,sz*.16);x.closePath();
      x.fillStyle='#9a5820'; x.fill();
      // Mane
      x.strokeStyle='#2a1000'; x.lineWidth=2.5;
      for(let i=0;i<4;i++){
        x.beginPath(); x.moveTo(sz*(.38+i*.02),sz*(.16+i*.04));
        x.bezierCurveTo(sz*(.30+i*.01),sz*(.20+i*.04),sz*(.26+i*.01),sz*(.27+i*.03),sz*(.27+i*.02),sz*(.33+i*.03));
        x.stroke();
      }
      // Legs
      x.fillStyle='#7a3e0a';
      x.fillRect(sz*.26,sz*.67,sz*.055,sz*.24); x.fillRect(sz*.35,sz*.69,sz*.055,sz*.22);
      x.fillRect(sz*.55,sz*.69,sz*.055,sz*.22); x.fillRect(sz*.64,sz*.67,sz*.055,sz*.24);
      // Hooves
      x.fillStyle='#1e0e02';
      x.fillRect(sz*.26,sz*.88,sz*.055,sz*.04); x.fillRect(sz*.35,sz*.88,sz*.055,sz*.04);
      x.fillRect(sz*.55,sz*.88,sz*.055,sz*.04); x.fillRect(sz*.64,sz*.88,sz*.055,sz*.04);
      // Tail
      x.strokeStyle='#2a1000'; x.lineWidth=3;
      x.beginPath(); x.moveTo(sz*.76,sz*.50);x.bezierCurveTo(sz*.90,sz*.42,sz*.94,sz*.60,sz*.88,sz*.78);x.stroke();
      x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.77,sz*.52);x.bezierCurveTo(sz*.94,sz*.46,sz*.96,sz*.66,sz*.86,sz*.82);x.stroke();
      break;
    }
    case 'cow': {
      // Grass bg
      x.fillStyle='#1a6b2a'; x.fillRect(0,0,sz,sz);
      for(let gy=0;gy<sz;gy+=8){for(let gx=0;gx<sz;gx+=8){
        if((gx+gy)/8%2===0){x.fillStyle='rgba(0,80,0,0.18)';x.fillRect(gx,gy,8,8);}
      }}
      // Body
      x.beginPath(); x.ellipse(sz*.51,sz*.52,sz*.30,sz*.19,0,0,Math.PI*2);
      x.fillStyle='#f0ede0'; x.fill();
      // Black spots
      x.fillStyle='#1a1a1a';
      x.beginPath(); x.ellipse(sz*.40,sz*.46,sz*.10,sz*.08,-0.3,0,Math.PI*2); x.fill();
      x.beginPath(); x.ellipse(sz*.63,sz*.56,sz*.09,sz*.07,0.5,0,Math.PI*2); x.fill();
      x.beginPath(); x.ellipse(sz*.52,sz*.62,sz*.06,sz*.05,0,0,Math.PI*2); x.fill();
      // Neck
      x.beginPath(); x.moveTo(sz*.27,sz*.48);x.bezierCurveTo(sz*.22,sz*.35,sz*.28,sz*.25,sz*.34,sz*.29);x.bezierCurveTo(sz*.38,sz*.37,sz*.36,sz*.47,sz*.34,sz*.52);x.closePath();
      x.fillStyle='#ece8d8'; x.fill();
      // Head
      x.beginPath(); x.ellipse(sz*.26,sz*.29,sz*.10,sz*.08,0.1,0,Math.PI*2);
      x.fillStyle='#ece8d8'; x.fill();
      // Muzzle
      x.beginPath(); x.ellipse(sz*.19,sz*.33,sz*.055,sz*.04,0.1,0,Math.PI*2);
      x.fillStyle='#e8b4b8'; x.fill();
      x.fillStyle='#b86060';
      x.beginPath(); x.arc(sz*.16,sz*.33,sz*.012,0,Math.PI*2); x.fill();
      x.beginPath(); x.arc(sz*.22,sz*.34,sz*.012,0,Math.PI*2); x.fill();
      // Eye
      x.beginPath(); x.arc(sz*.28,sz*.24,sz*.016,0,Math.PI*2); x.fillStyle='#1a1000'; x.fill();
      // Ears
      x.fillStyle='#e0d8c0';
      x.beginPath(); x.moveTo(sz*.22,sz*.21);x.lineTo(sz*.18,sz*.15);x.lineTo(sz*.27,sz*.19);x.closePath(); x.fill();
      x.beginPath(); x.moveTo(sz*.30,sz*.21);x.lineTo(sz*.34,sz*.15);x.lineTo(sz*.37,sz*.21);x.closePath(); x.fill();
      // Horns
      x.strokeStyle='#d4b46a'; x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.22,sz*.19);x.bezierCurveTo(sz*.18,sz*.11,sz*.14,sz*.10,sz*.12,sz*.14);x.stroke();
      x.beginPath(); x.moveTo(sz*.32,sz*.19);x.bezierCurveTo(sz*.36,sz*.11,sz*.40,sz*.10,sz*.38,sz*.14);x.stroke();
      // Legs
      x.fillStyle='#d4cfc0';
      x.fillRect(sz*.28,sz*.67,sz*.06,sz*.22); x.fillRect(sz*.38,sz*.69,sz*.06,sz*.20);
      x.fillRect(sz*.57,sz*.69,sz*.06,sz*.20); x.fillRect(sz*.67,sz*.67,sz*.06,sz*.22);
      // Hooves
      x.fillStyle='#444';
      x.fillRect(sz*.28,sz*.86,sz*.06,sz*.04); x.fillRect(sz*.38,sz*.86,sz*.06,sz*.04);
      x.fillRect(sz*.57,sz*.86,sz*.06,sz*.04); x.fillRect(sz*.67,sz*.86,sz*.06,sz*.04);
      // Udder
      x.beginPath(); x.ellipse(sz*.52,sz*.70,sz*.09,sz*.05,0,0,Math.PI*2);
      x.fillStyle='#f4b8b8'; x.fill();
      x.fillStyle='#c08080';
      x.fillRect(sz*.46,sz*.73,sz*.020,sz*.04); x.fillRect(sz*.52,sz*.73,sz*.020,sz*.04); x.fillRect(sz*.58,sz*.73,sz*.020,sz*.04);
      // Tail
      x.strokeStyle='#888'; x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.79,sz*.48);x.bezierCurveTo(sz*.90,sz*.42,sz*.92,sz*.60,sz*.86,sz*.70);x.stroke();
      x.beginPath(); x.arc(sz*.86,sz*.71,sz*.024,0,Math.PI*2); x.fillStyle='#555'; x.fill();
      break;
    }
    case 'well': {
      // Dirt background
      x.fillStyle='#7c4a18'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<120;i++){
        const px=r()*sz,py=r()*sz,rad=0.5+r()*2.5;
        x.beginPath(); x.arc(px,py,rad,0,Math.PI*2);
        x.fillStyle=`rgba(${~~(60+r()*60)},${~~(28+r()*28)},${~~(4+r()*12)},${0.25+r()*.4})`; x.fill();
      }
      // Well base — circular stone ring (top view)
      const wox=sz*.50, woy=sz*.56;
      // Outer stone ring
      x.beginPath(); x.arc(wox,woy,sz*.32,0,Math.PI*2);
      const wring=x.createRadialGradient(wox,woy,sz*.18,wox,woy,sz*.34);
      wring.addColorStop(0,'#3a3530'); wring.addColorStop(0.4,'#6b6460'); wring.addColorStop(0.7,'#8a8480'); wring.addColorStop(1,'#5a5450');
      x.fillStyle=wring; x.fill();
      // Stone mortar lines on ring
      x.strokeStyle='rgba(20,15,10,0.5)'; x.lineWidth=1;
      for(let a=0;a<Math.PI*2;a+=Math.PI/5){
        x.beginPath();
        x.moveTo(wox+Math.cos(a)*sz*.20,woy+Math.sin(a)*sz*.20);
        x.lineTo(wox+Math.cos(a)*sz*.32,woy+Math.sin(a)*sz*.32);
        x.stroke();
      }
      // Dark water inside
      x.beginPath(); x.arc(wox,woy,sz*.18,0,Math.PI*2);
      const wwater=x.createRadialGradient(wox-sz*.05,woy-sz*.05,sz*.01,wox,woy,sz*.19);
      wwater.addColorStop(0,'#4a7ca8'); wwater.addColorStop(0.5,'#1e4d6b'); wwater.addColorStop(1,'#0a1e2d');
      x.fillStyle=wwater; x.fill();
      // Water shimmer
      x.strokeStyle='rgba(140,200,255,0.35)'; x.lineWidth=1;
      x.beginPath(); x.arc(wox-sz*.05,woy-sz*.04,sz*.06,Math.PI*.9,Math.PI*1.7); x.stroke();
      x.beginPath(); x.arc(wox+sz*.04,woy+sz*.03,sz*.04,Math.PI*1.8,Math.PI*2.5); x.stroke();
      // Bucket rope
      x.strokeStyle='#8b6914'; x.lineWidth=2;
      x.beginPath(); x.moveTo(sz*.50,sz*.30);x.lineTo(sz*.50,sz*.42);x.stroke();
      // Bucket
      x.beginPath();
      x.moveTo(sz*.42,sz*.42); x.lineTo(sz*.40,sz*.50); x.lineTo(sz*.60,sz*.50); x.lineTo(sz*.58,sz*.42); x.closePath();
      const wbg=x.createLinearGradient(sz*.40,sz*.42,sz*.60,sz*.50);
      wbg.addColorStop(0,'#8b5e2a'); wbg.addColorStop(1,'#5a3810');
      x.fillStyle=wbg; x.fill();
      x.strokeStyle='#3a2208'; x.lineWidth=1; x.stroke();
      // Bucket hoop band
      x.strokeStyle='#4a3010'; x.lineWidth=1.5;
      x.beginPath(); x.moveTo(sz*.41,sz*.46);x.lineTo(sz*.59,sz*.46);x.stroke();
      // Crossbar post left
      x.fillStyle='#7a4e1a';
      x.fillRect(sz*.18,sz*.14,sz*.07,sz*.28);
      // Crossbar post right
      x.fillRect(sz*.75,sz*.14,sz*.07,sz*.28);
      // Horizontal beam
      x.fillStyle='#9a6820';
      x.fillRect(sz*.14,sz*.12,sz*.72,sz*.07);
      x.strokeStyle='#5a3808'; x.lineWidth=1; x.strokeRect(sz*.14,sz*.12,sz*.72,sz*.07);
      // Wood grain on beam
      x.strokeStyle='rgba(50,25,5,0.4)'; x.lineWidth=0.8;
      for(let gx=sz*.18;gx<sz*.86;gx+=6){
        x.beginPath(); x.moveTo(gx,sz*.12);x.lineTo(gx+2,sz*.19);x.stroke();
      }
      // Axle/winch handle
      x.fillStyle='#6b4010'; x.fillRect(sz*.44,sz*.11,sz*.12,sz*.045);
      x.strokeStyle='#3a2008'; x.lineWidth=0.8; x.strokeRect(sz*.44,sz*.11,sz*.12,sz*.045);
      break;
    }
  }
  return cv;
}

function getTexturePattern(ctx, tileId) {
  let map = _patByCtx.get(ctx);
  if (!map) { map = {}; _patByCtx.set(ctx, map); }
  if (!map[tileId]) {
    if (!_texCache[tileId]) _texCache[tileId] = buildTextureCanvas(tileId);
    map[tileId] = ctx.createPattern(_texCache[tileId], 'repeat');
  }
  return map[tileId];
}

// ── Mob icons & colours ───────────────────────────────────────
const MOB_TYPES_LIST = [
  'Bandit','Bugbear','Cultist','Dragon','Drow','Gelatinous Cube',
  'Ghoul','Giant','Gnoll','Goblin','Guard','Hobgoblin','Kobold','Mimic',
  'Ogre','Orc','Owlbear','Skeleton','Spy','Thug','Troll','Vampire',
  'Werewolf','Wolf','Zombie'
];
const MOB_ICONS = {
  Bandit: '🗡️', Bugbear: '🐻', Cultist: '🕯️', Dragon: '🐉',
  Drow: '🕷️', 'Gelatinous Cube': '🫧', Ghoul: '👻', Giant: '🏔️',
  Gnoll: '🦴', Goblin: '👺', Guard: '💂', Hobgoblin: '⚔️',
  Kobold: '🦎', Mimic: '📦', Ogre: '🪨', Orc: '🪓',
  Owlbear: '🦉', Skeleton: '💀', Spy: '🕵️', Thug: '👊',
  Troll: '🌲', Vampire: '🧛', Werewolf: '🐺', Wolf: '🐕', Zombie: '🧟',
};
const MOB_COLORS = {
  Bandit: '#92400e', Bugbear: '#7c3aed', Cultist: '#450a0a', Dragon: '#b91c1c',
  Drow: '#312e81', 'Gelatinous Cube': '#4d7c0f', Ghoul: '#374151', Giant: '#6b7280',
  Gnoll: '#78350f', Goblin: '#15803d', Guard: '#1e40af', Hobgoblin: '#9b1c1c',
  Kobold: '#b45309', Mimic: '#854d0e', Ogre: '#6b21a8', Orc: '#14532d',
  Owlbear: '#713f12', Skeleton: '#4b5563', Spy: '#0f766e', Thug: '#b45309',
  Troll: '#44403c', Vampire: '#7f1d1d', Werewolf: '#292524', Wolf: '#44403c', Zombie: '#3d6b47',
};

// ── Class icons & colours ─────────────────────────────────────
const CLASS_ICONS = {
  Rogue:     '🗡️',
  Priest:    '✝️',
  Cleric:    '✝️',
  Sorcerer:  '🔮',
  Wizard:    '🪄',
  Fighter:   '🛡️',
  Paladin:   '⚔️',
  Druid:     '🌿',
  Ranger:    '🏹',
  Bard:      '🎵',
  Monk:      '👊',
  Barbarian: '💢',
  FatChub:   '🐷',
};
const CLASS_COLORS = {
  Rogue:     '#7c3aed',
  Priest:    '#0ea5e9',
  Cleric:    '#0ea5e9',
  Sorcerer:  '#6366f1',
  Wizard:    '#4f46e5',
  Fighter:   '#ea580c',
  Paladin:   '#d4af37',
  Druid:     '#16a34a',
  Ranger:    '#22c55e',
  Bard:      '#ec4899',
  Monk:      '#f97316',
  Barbarian: '#dc2626',
  FatChub:   '#ef4444',
};

// ── State ─────────────────────────────────────────────────────
let cols     = 20;
let rows     = 15;
let cellSize = 40;

// tileMap[r][c] = tile id or null
let tileMap  = [];
// tokens: { id, col, row, name, color, type('player'|'npc'), cls? }
let tokens   = [];
// loaded player roster
let _players = [];
// active tab in token panel ('player' | 'npc')
let activeTokenTab = 'player';
// labels: { id, col, row, text, size, color }
let labels   = [];
// background image url
let bgImage  = null;
let bgImageEl = null;

let activeTool  = 'paint';
let activeTile  = TILES[0];

// Undo stack — each entry is a snapshot of tileMap
let undoStack   = [];
const MAX_UNDO  = 40;

// Paint drag tracking
let isPainting  = false;
let paintValue  = null; // tile id being painted (null = erase)

// Fog of War state
let fogEnabled     = false;
let fogIsPainting  = false;
let fogPaintValue  = false;
const FOG_KEY      = 'builder-live';
let fogBuilderGrid = [];   // [row][col] = true (revealed) / false (hidden)

// ── Map Features ─────────────────────────────────────────────
// features: [{ id, name, type, cells:[[r,c],...], animation, color, description, effectSubtype?, linkedMap? }]
let features = [];
// Cells the user has clicked to select for the next feature
let pendingFeatureCells = []; // [[r,c], ...]
let editingFeatureId = null;  // id of feature being edited, or null for new

// ── Map Objects ───────────────────────────────────────────────
// objects: [{ id, col, row, label, iconType, emoji, tileId, color, size,
//             autoAnim, animSpeed, interactive, interactBy, clickAction,
//             rotateDeg, targetCol, targetRow, canReset, blocksMovement }]
let mapObjects = [];
let editingObjectId = null;
// When DM is picking a target cell for a slide action
let _pickingTargetForObj = false;

// WebSocket
let ws = null;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

// ── Canvas refs ───────────────────────────────────────────────
const bgCanvas     = document.getElementById('bg-canvas');
const tileCanvas   = document.getElementById('tile-canvas');
const gridCanvas   = document.getElementById('grid-canvas');
const cursorCanvas = document.getElementById('cursor-canvas');
const tokenLayer   = document.getElementById('token-layer');
const labelLayer   = document.getElementById('label-layer');
const container    = document.getElementById('canvas-container');
const coordsEl     = document.getElementById('coords');
const fogLayer       = document.getElementById('fog-layer');
const featureCanvas  = document.getElementById('feature-canvas');

const bgCtx     = bgCanvas.getContext('2d');
const tileCtx   = tileCanvas.getContext('2d');
const gridCtx      = gridCanvas.getContext('2d');
const cursorCtx    = cursorCanvas.getContext('2d');
const featureCtx   = featureCanvas.getContext('2d');

// ── Init ──────────────────────────────────────────────────────
function initGrid() {
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push(new Array(cols).fill(null));
  }
  tokens = [];
  labels = [];
  undoStack = [];
  initFogGrid();
  applySize();
}

function applySize() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  [bgCanvas, tileCanvas, featureCanvas, gridCanvas, cursorCanvas].forEach(c => {
    c.width  = w;
    c.height = h;
    c.style.width  = w + 'px';
    c.style.height = h + 'px';
  });
  container.style.width  = w + 'px';
  container.style.height = h + 'px';
  if (fogEnabled) renderFogLayer();
  renderAll();
}

// ── Rendering ─────────────────────────────────────────────────
function renderAll() {
  renderBg();
  renderTiles();
  renderGrid();
  renderTokens();
  renderLabels();
  renderFeatures();
}

// ── Feature rendering (editor overlay) ───────────────────────
function renderFeatures() {
  featureCtx.clearRect(0, 0, featureCanvas.width, featureCanvas.height);

  const FEAT_ICONS = { pit: '⬛', trap: '💥', puzzle: '🧩', reveal: '👁', effect: '✨' };

  // Draw saved features
  features.forEach(feat => {
    const hex = feat.color || '#c0392b';
    featureCtx.fillStyle = hex + 'bb'; // ~73% opacity
    featureCtx.strokeStyle = '#fff';
    featureCtx.lineWidth = 2;
    (feat.cells || []).forEach(([r, c]) => {
      featureCtx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      featureCtx.strokeRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
    });
    // Label first cell
    if (feat.cells && feat.cells.length > 0) {
      const [fr, fc] = feat.cells[0];
      featureCtx.fillStyle = '#fff';
      featureCtx.font = 'bold ' + Math.max(9, Math.round(cellSize * 0.3)) + 'px sans-serif';
      featureCtx.textAlign = 'center';
      featureCtx.textBaseline = 'middle';
      featureCtx.fillText(
        (FEAT_ICONS[feat.type] || '?') + ' ' + (feat.name || feat.type).slice(0, 10),
        fc * cellSize + cellSize / 2,
        fr * cellSize + cellSize / 2
      );
    }
  });

  // Draw pending (unconfirmed) feature selection
  if (activeTool === 'feature' && pendingFeatureCells.length > 0) {
    featureCtx.fillStyle = 'rgba(212,175,55,0.45)';
    featureCtx.strokeStyle = '#d4af37';
    featureCtx.lineWidth = 2;
    pendingFeatureCells.forEach(([r, c]) => {
      featureCtx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      featureCtx.strokeRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
    });
  }
}

// ── Feature sidebar list ──────────────────────────────────────
function renderFeatureList() {
  const listEl  = document.getElementById('feature-list');
  const emptyEl = document.getElementById('feature-list-empty');
  if (!listEl) return;
  listEl.innerHTML = '';
  const FEAT_ICONS = { pit: '⬛', trap: '💥', puzzle: '🧩', reveal: '👁', effect: '✨' };
  if (features.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  features.forEach(feat => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem;padding:0.3rem 0.4rem;background:#1f2937;border-radius:4px;border-left:3px solid ' + (feat.color || '#c0392b') + ';';
    const icon = FEAT_ICONS[feat.type] || '?';
    const info = document.createElement('span');
    info.style.cssText = 'flex:1;font-size:0.78rem;color:#e6e6e6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    info.textContent = icon + ' ' + feat.name + ' (' + (feat.cells || []).length + ' cells)';
    info.title = feat.description || feat.name;
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit';
    editBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:0 0.2rem;';
    editBtn.onclick = () => openFeatureModal(feat.id);
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:0 0.2rem;';
    delBtn.onclick = () => {
      features = features.filter(f => f.id !== feat.id);
      renderFeatureList();
      renderFeatures();
    };
    row.appendChild(info);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}

// ── Feature type → default color / animation mapping ────────
const FEAT_TYPE_DEFAULTS = {
  pit:    { color: '#1a0a00', anim: 'pit' },
  trap:   { color: '#7f1d1d', anim: 'trap' },
  puzzle: { color: '#1e3a5f', anim: 'puzzle' },
  reveal: { color: '#14532d', anim: 'reveal' },
  effect: { color: '#7c2d12', anim: 'effect' },
};

function _updateFeatTypeUI(type, skipColor) {
  document.getElementById('feat-effect-opts').style.display = type === 'effect'  ? '' : 'none';
  document.getElementById('feat-puzzle-opts').style.display = type === 'puzzle'  ? '' : 'none';
  if (!skipColor) {
    const def = FEAT_TYPE_DEFAULTS[type];
    if (def) document.getElementById('feat-color').value = def.color;
  }
  const animEl = document.getElementById('feat-animation');
  if (animEl) animEl.value = type;
}

// Populate puzzle linked-map dropdown
async function _populatePuzzleMapDropdown(currentVal) {
  const sel = document.getElementById('feat-linked-map');
  try {
    const r = await fetch('/api/maps');
    const j = await r.json();
    const maps = (j.maps || []);
    sel.innerHTML = '<option value="">(none — no sub-map)</option>' +
      maps.map(url => {
        const name = url.split('/').pop();
        return `<option value="${url}">${name}</option>`;
      }).join('');
    if (currentVal) sel.value = currentVal;
  } catch (_) { /* non-critical */ }
}

// ── Feature modal ─────────────────────────────────────────────
function openFeatureModal(editId) {
  editingFeatureId = editId || null;
  const modal   = document.getElementById('feature-modal');
  const titleEl = document.getElementById('feature-modal-title');
  const cellsEl = document.getElementById('feat-cells-info');
  const statusEl = document.getElementById('feat-status');
  statusEl.textContent = '';
  if (editId) {
    const feat = features.find(f => f.id === editId);
    if (!feat) return;
    titleEl.textContent = 'Edit Feature';
    document.getElementById('feat-name').value        = feat.name || '';
    document.getElementById('feat-type').value        = feat.type || 'pit';
    document.getElementById('feat-color').value       = feat.color || '#1a0a00';
    document.getElementById('feat-description').value = feat.description || '';
    document.getElementById('feat-auto-trigger').checked = !!feat.autoTrigger;
    // Effect subtype
    if (feat.effectSubtype) document.getElementById('feat-effect-subtype').value = feat.effectSubtype;
    cellsEl.textContent = (feat.cells || []).length + ' cell(s) selected.';
    // Load cells into pending for re-selection
    pendingFeatureCells = (feat.cells || []).map(c => [...c]);
    _updateFeatTypeUI(feat.type || 'pit', true);
    _populatePuzzleMapDropdown(feat.linkedMap || '');
  } else {
    titleEl.textContent = 'Add Feature';
    document.getElementById('feat-name').value        = '';
    document.getElementById('feat-type').value        = 'pit';
    document.getElementById('feat-color').value       = '#1a0a00';
    document.getElementById('feat-description').value = '';
    document.getElementById('feat-auto-trigger').checked = false;
    document.getElementById('feat-effect-subtype').value = 'fire';
    cellsEl.textContent = pendingFeatureCells.length + ' cell(s) selected.';
    _updateFeatTypeUI('pit', false);
    _populatePuzzleMapDropdown('');
  }
  modal.classList.remove('hidden');
}

document.getElementById('feat-type').addEventListener('change', function () {
  _updateFeatTypeUI(this.value, false);
  if (this.value === 'puzzle') _populatePuzzleMapDropdown('');
});

document.getElementById('add-feature-btn').addEventListener('click', () => {
  if (pendingFeatureCells.length === 0) {
    alert('Select at least one cell on the map first.');
    return;
  }
  openFeatureModal(null);
});

document.getElementById('feat-cancel-btn').addEventListener('click', () => {
  document.getElementById('feature-modal').classList.add('hidden');
  editingFeatureId = null;
});

document.getElementById('feat-save-btn').addEventListener('click', () => {
  const name = document.getElementById('feat-name').value.trim();
  const statusEl = document.getElementById('feat-status');
  if (!name) { statusEl.textContent = 'Enter a name.'; statusEl.style.color = '#ef4444'; return; }
  if (pendingFeatureCells.length === 0 && !editingFeatureId) {
    statusEl.textContent = 'No cells selected.'; statusEl.style.color = '#ef4444'; return;
  }
  const type = document.getElementById('feat-type').value;
  const effectSubtype = type === 'effect' ? document.getElementById('feat-effect-subtype').value : undefined;
  const linkedMap = type === 'puzzle' ? (document.getElementById('feat-linked-map').value || undefined) : undefined;
  // Derive animation key from type (for backward compat with player.js legacy fallback)
  const animKey = type === 'effect' ? ('effect-' + (effectSubtype || 'fire')) : type;
  const feat = {
    id:           editingFeatureId || ('f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
    name,
    type,
    animation:    animKey,
    effectSubtype,
    linkedMap,
    color:        document.getElementById('feat-color').value,
    description:  document.getElementById('feat-description').value.trim(),
    autoTrigger:  document.getElementById('feat-auto-trigger').checked,
    cells:        pendingFeatureCells.map(c => [...c]),
  };
  if (editingFeatureId) {
    const idx = features.findIndex(f => f.id === editingFeatureId);
    if (idx !== -1) features[idx] = feat;
  } else {
    features.push(feat);
  }
  pendingFeatureCells = [];
  updatePendingCellsDisplay();
  editingFeatureId = null;
  document.getElementById('feature-modal').classList.add('hidden');
  renderFeatureList();
  renderFeatures();
});

function updatePendingCellsDisplay() {
  const el = document.getElementById('pending-cells-display');
  if (!el) return;
  el.textContent = pendingFeatureCells.length === 0
    ? 'No cells selected'
    : pendingFeatureCells.length + ' cell(s) selected — click again to deselect';
}

// ── Map Objects system ────────────────────────────────────────
const OBJ_ANIM_DUR = { slow: '4s', normal: '2.5s', fast: '1.2s' };

function renderObjectLayer() {
  const layer = document.getElementById('object-layer');
  if (!layer) return;
  layer.innerHTML = '';
  mapObjects.forEach(obj => {
    const x = obj.col * cellSize;
    const y = obj.row * cellSize;
    const sz = Math.round(cellSize * (parseFloat(obj.size) || 1.0));
    const offset = Math.round((cellSize - sz) / 2);

    // Main object div
    const el = document.createElement('div');
    el.className = 'builder-obj' + (obj.interactive ? ' obj-interactive' : '');
    el.dataset.objId = obj.id;
    el.style.cssText = `left:${x + offset}px;top:${y + offset}px;width:${sz}px;height:${sz}px;` +
      `font-size:${Math.round(sz * 0.55)}px;border-color:${obj.color || '#fbbf24'};`;
    el.textContent = obj.iconType === 'tile' ? (obj.tileId || '?') : (obj.emoji || '🪨');
    el.title = obj.label || 'Object';
    el.onclick = e => { e.stopPropagation(); openObjectModal(obj.id); };
    layer.appendChild(el);

    // Slide target marker (B-state ghost)
    if (obj.clickAction === 'slide' && obj.targetCol != null && obj.targetRow != null) {
      const tx = obj.targetCol * cellSize + offset;
      const ty = obj.targetRow * cellSize + offset;
      const tgt = document.createElement('div');
      tgt.className = 'builder-obj-target';
      tgt.style.cssText = `left:${tx}px;top:${ty}px;width:${sz}px;height:${sz}px;` +
        `border-color:${obj.color || '#fbbf24'};font-size:${Math.round(sz * 0.4)}px;`;
      tgt.textContent = '↗B';
      layer.appendChild(tgt);
    }
  });
}

function renderObjectList() {
  const listEl  = document.getElementById('object-list');
  const emptyEl = document.getElementById('object-list-empty');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (mapObjects.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  mapObjects.forEach(obj => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;padding:0.3rem 0.4rem;background:#1f2937;border-radius:4px;border-left:3px solid ' + (obj.color || '#fbbf24') + ';';
    const icon = document.createElement('span');
    icon.style.fontSize = '1rem';
    icon.textContent = obj.iconType === 'tile' ? '🗂' : (obj.emoji || '🪨');
    const info = document.createElement('span');
    info.style.cssText = 'flex:1;font-size:0.78rem;color:#e6e6e6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const animLabel = obj.autoAnim && obj.autoAnim !== 'none' ? ` [${obj.autoAnim}]` : '';
    info.textContent = (obj.label || 'Object') + ` (${obj.col},${obj.row})` + animLabel;
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit';
    editBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:0 0.2rem;';
    editBtn.onclick = () => openObjectModal(obj.id);
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:0 0.2rem;';
    delBtn.onclick = () => { mapObjects = mapObjects.filter(o => o.id !== obj.id); renderObjectList(); renderObjectLayer(); };
    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}

function _updateObjModalUI() {
  const iconType    = document.querySelector('input[name="obj-icon-type"]:checked')?.value || 'emoji';
  const autoAnim    = document.getElementById('obj-auto-anim').value;
  const interactive = document.getElementById('obj-interactive').checked;
  const action      = document.getElementById('obj-click-action').value;
  document.getElementById('obj-emoji-opts').style.display    = iconType === 'emoji' ? '' : 'none';
  document.getElementById('obj-tile-opts').style.display     = iconType === 'tile'  ? '' : 'none';
  document.getElementById('obj-anim-speed-row').style.display = autoAnim !== 'none' ? '' : 'none';
  document.getElementById('obj-interactive-opts').style.display = interactive ? '' : 'none';
  if (interactive) {
    document.getElementById('obj-rotate-opts').style.display = action === 'rotate' ? '' : 'none';
    document.getElementById('obj-slide-opts').style.display  = action === 'slide'  ? '' : 'none';
  }
}

function _populateObjTileDropdown() {
  const sel = document.getElementById('obj-tile-id');
  if (!sel) return;
  // Reuse TILES list from builder
  sel.innerHTML = (typeof TILES !== 'undefined' ? TILES : []).map(t => `<option value="${t.id}">${t.id}</option>`).join('');
}

function openObjectModal(editId) {
  editingObjectId = editId || null;
  const modal   = document.getElementById('object-modal');
  const titleEl = document.getElementById('object-modal-title');
  const statusEl = document.getElementById('obj-status');
  statusEl.textContent = '';
  _populateObjTileDropdown();
  if (editId) {
    const obj = mapObjects.find(o => o.id === editId);
    if (!obj) return;
    titleEl.textContent = 'Edit Object';
    document.getElementById('obj-cell-info').textContent = `Cell (${obj.col}, ${obj.row})`;
    document.getElementById('obj-label').value           = obj.label || '';
    document.getElementById('obj-emoji').value           = obj.emoji || '🪨';
    document.getElementById('obj-color').value           = obj.color || '#fbbf24';
    document.getElementById('obj-size').value            = String(obj.size || '1.0');
    document.getElementById('obj-auto-anim').value       = obj.autoAnim || 'none';
    document.getElementById('obj-anim-speed').value      = obj.animSpeed || 'normal';
    document.getElementById('obj-interactive').checked   = !!obj.interactive;
    document.getElementById('obj-interact-by').value     = obj.interactBy || 'both';
    document.getElementById('obj-click-action').value    = obj.clickAction || 'rotate';
    document.getElementById('obj-rotate-deg').value      = String(obj.rotateDeg || 90);
    document.getElementById('obj-target-col').value      = obj.targetCol != null ? obj.targetCol : '';
    document.getElementById('obj-target-row').value      = obj.targetRow != null ? obj.targetRow : '';
    document.getElementById('obj-can-reset').value       = obj.canReset === false ? 'false' : 'true';
    document.getElementById('obj-blocks-movement').checked = !!obj.blocksMovement;
    // Radio button
    const iconType = obj.iconType || 'emoji';
    document.querySelectorAll('input[name="obj-icon-type"]').forEach(r => { r.checked = (r.value === iconType); });
    if (iconType === 'tile' && obj.tileId) document.getElementById('obj-tile-id').value = obj.tileId;
  } else {
    titleEl.textContent = 'Place Object';
    document.getElementById('obj-cell-info').textContent = `Cell (${_pendingObjCol}, ${_pendingObjRow})`;
    document.getElementById('obj-label').value           = '';
    document.getElementById('obj-emoji').value           = '🪨';
    document.getElementById('obj-color').value           = '#fbbf24';
    document.getElementById('obj-size').value            = '1.0';
    document.getElementById('obj-auto-anim').value       = 'none';
    document.getElementById('obj-anim-speed').value      = 'normal';
    document.getElementById('obj-interactive').checked   = false;
    document.getElementById('obj-interact-by').value     = 'both';
    document.getElementById('obj-click-action').value    = 'rotate';
    document.getElementById('obj-rotate-deg').value      = '90';
    document.getElementById('obj-target-col').value      = '';
    document.getElementById('obj-target-row').value      = '';
    document.getElementById('obj-can-reset').value       = 'true';
    document.getElementById('obj-blocks-movement').checked = false;
    document.querySelectorAll('input[name="obj-icon-type"]').forEach(r => { r.checked = (r.value === 'emoji'); });
  }
  _updateObjModalUI();
  modal.classList.remove('hidden');
}

// Wire object modal UI event listeners
['obj-auto-anim', 'obj-click-action', 'obj-interactive'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', _updateObjModalUI);
});
document.querySelectorAll('input[name="obj-icon-type"]').forEach(r => r.addEventListener('change', _updateObjModalUI));
document.getElementById('obj-interactive').addEventListener('change', _updateObjModalUI);

document.getElementById('obj-cancel-btn').addEventListener('click', () => {
  document.getElementById('object-modal').classList.add('hidden');
  editingObjectId = null;
});

// "Pick on Map" target cell: temporarily dismiss modal, wait for next cell click
document.getElementById('obj-pick-target-btn').addEventListener('click', () => {
  _pickingTargetForObj = true;
  document.getElementById('object-modal').classList.add('hidden');
});

document.getElementById('obj-save-btn').addEventListener('click', () => {
  const statusEl  = document.getElementById('obj-status');
  const iconType  = document.querySelector('input[name="obj-icon-type"]:checked')?.value || 'emoji';
  const interactive = document.getElementById('obj-interactive').checked;
  const clickAction = document.getElementById('obj-click-action').value;
  const obj = {
    id:              editingObjectId || ('obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
    col:             editingObjectId ? mapObjects.find(o => o.id === editingObjectId)?.col : _pendingObjCol,
    row:             editingObjectId ? mapObjects.find(o => o.id === editingObjectId)?.row : _pendingObjRow,
    label:           document.getElementById('obj-label').value.trim(),
    iconType,
    emoji:           iconType === 'emoji' ? (document.getElementById('obj-emoji').value || '🪨') : undefined,
    tileId:          iconType === 'tile'  ? (document.getElementById('obj-tile-id').value || undefined) : undefined,
    color:           document.getElementById('obj-color').value,
    size:            parseFloat(document.getElementById('obj-size').value) || 1.0,
    autoAnim:        document.getElementById('obj-auto-anim').value,
    animSpeed:       document.getElementById('obj-anim-speed').value,
    interactive,
    interactBy:      interactive ? document.getElementById('obj-interact-by').value : undefined,
    clickAction:     interactive ? clickAction : undefined,
    rotateDeg:       (interactive && clickAction === 'rotate') ? parseInt(document.getElementById('obj-rotate-deg').value, 10) : undefined,
    targetCol:       (interactive && clickAction === 'slide')  ? (parseInt(document.getElementById('obj-target-col').value, 10) || 0) : undefined,
    targetRow:       (interactive && clickAction === 'slide')  ? (parseInt(document.getElementById('obj-target-row').value, 10) || 0) : undefined,
    canReset:        interactive ? (document.getElementById('obj-can-reset').value !== 'false') : undefined,
    blocksMovement:  document.getElementById('obj-blocks-movement').checked,
  };
  if (editingObjectId) {
    const idx = mapObjects.findIndex(o => o.id === editingObjectId);
    if (idx !== -1) mapObjects[idx] = obj;
  } else {
    mapObjects.push(obj);
  }
  editingObjectId = null;
  document.getElementById('object-modal').classList.add('hidden');
  renderObjectList();
  renderObjectLayer();
});

let _pendingObjCol = 0;
let _pendingObjRow = 0;

function renderBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgCtx.fillStyle = '#111';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  if (bgImageEl && bgImageEl.complete && bgImageEl.naturalWidth) {
    bgCtx.drawImage(bgImageEl, 0, 0, bgCanvas.width, bgCanvas.height);
  }
}

function renderTiles() {
  tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tid = tileMap[r][c];
      if (!tid) continue;
      const tile = TILES.find(t => t.id === tid);
      if (!tile) continue;
      drawTile(tileCtx, tile, c * cellSize, r * cellSize, cellSize);
    }
  }
}

// Tiles that should stamp one image per cell (not tile as a repeat pattern)
const STAMP_TILES = new Set(['tree','tree-large','tree-pine','tree-palm','mountain','hill','aura','aura-large','aura-blue','fire','fire-blue','cabin','cabin-ruin','tent','horse','cow','well','wall-ruin','door','cave-opening','mtn-scree','mtn-alpine','mtn-earthy','mtn-tundra','mtn-slate','road-h','road-v','road-cross','road-turn-ne','road-turn-nw','road-turn-se','road-turn-sw','road-t-n','road-t-s','road-t-e','road-t-w']);

function drawTile(ctx, tile, x, y, size) {
  if (tile.url) {
    // Kenney PNG tile — draw from preloaded image cache
    const img = _kenneyImgCache[tile.id];
    if (img && img.complete && img.naturalWidth) {
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, size, size);
      ctx.imageSmoothingEnabled = prevSmoothing;
    }
    return;
  }
  if (STAMP_TILES.has(tile.id)) {
    // Scale the texture canvas directly into this cell — one image per cell
    if (!_texCache[tile.id]) _texCache[tile.id] = buildTextureCanvas(tile.id);
    ctx.drawImage(_texCache[tile.id], x, y, size, size);
  } else {
    ctx.fillStyle = getTexturePattern(ctx, tile.id);
    ctx.fillRect(x, y, size, size);
  }
}

function renderGrid() {
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  gridCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  gridCtx.lineWidth = 0.5;
  for (let c = 0; c <= cols; c++) {
    gridCtx.beginPath();
    gridCtx.moveTo(c * cellSize, 0);
    gridCtx.lineTo(c * cellSize, rows * cellSize);
    gridCtx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, r * cellSize);
    gridCtx.lineTo(cols * cellSize, r * cellSize);
    gridCtx.stroke();
  }
}

function renderTokens() {
  tokenLayer.innerHTML = '';
  tokens.forEach(tok => {
    const el = document.createElement('div');
    const sz = cellSize - 6;
    el.style.left   = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top    = (tok.row * cellSize + cellSize / 2) + 'px';
    el.style.width  = sz + 'px';
    el.style.height = sz + 'px';
    el.style.background = tok.color;

    if (tok.type === 'player' && tok.cls) {
      el.className = 'token-el token-player';
      el.style.border = '2.5px solid #d4af37';
      const icon = CLASS_ICONS[tok.cls] || '⚔️';
      el.innerHTML =
        `<span class="token-icon">${icon}</span>` +
        `<span class="token-name">${tok.name}</span>`;
    } else if (tok.type === 'npc' && tok.mobType) {
      el.className = 'token-el token-npc';
      el.style.border = '2px solid rgba(255,255,255,0.5)';
      const icon = MOB_ICONS[tok.mobType] || '❓';
      const num  = tok.name.replace(tok.mobType, '').trim();
      el.innerHTML =
        `<span class="token-icon">${icon}</span>` +
        `<span class="token-name">${num}</span>`;
      el.title = tok.name;
    } else {
      el.className = 'token-el';
      el.style.fontSize = Math.max(8, cellSize * 0.22) + 'px';
      el.textContent = tok.name;
    }

    makeDraggableToken(el, tok);
    tokenLayer.appendChild(el);
  });
}

function renderLabels() {
  labelLayer.innerHTML = '';
  labels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = 'label-el';
    el.style.left     = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top      = (lbl.row * cellSize) + 'px';
    el.style.fontSize = lbl.size + 'px';
    el.style.color    = lbl.color;
    el.textContent    = lbl.text;
    makeDraggableLabel(el, lbl);
    labelLayer.appendChild(el);
  });
}

// ── Cursor preview ────────────────────────────────────────────
function drawCursor(col, row) {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  cursorCtx.strokeStyle = '#d4af37';
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeRect(col * cellSize + 1, row * cellSize + 1, cellSize - 2, cellSize - 2);
}

// ── Canvas mouse interaction ──────────────────────────────────
function getCellFromEvent(e) {
  const rect = cursorCanvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;
  return {
    col: Math.floor(x / cellSize),
    row: Math.floor(y / cellSize),
  };
}

function pushUndo() {
  const snap = tileMap.map(r => [...r]);
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function applyPaint(col, row) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const val = activeTool === 'erase' ? null : activeTile.id;

  // When erasing, always remove tokens/labels on this cell first,
  // regardless of whether there is a tile underneath
  if (val === null) {
    const prevTokenCount = tokens.length;
    const prevLabelCount = labels.length;
    tokens = tokens.filter(t => !(t.col === col && t.row === row));
    labels = labels.filter(l => !(l.col === col && l.row === row));
    if (tokens.length !== prevTokenCount) renderTokens();
    if (labels.length !== prevLabelCount) renderLabels();
  }

  if (tileMap[row][col] === val) return;
  tileMap[row][col] = val;
  if (val === null) {
    tileCtx.clearRect(col * cellSize, row * cellSize, cellSize, cellSize);
  } else {
    drawTile(tileCtx, activeTile, col * cellSize, row * cellSize, cellSize);
  }
}

function floodFill(startCol, startRow, targetId, fillId) {
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return;
  if (targetId === fillId) return;
  const stack = [[startCol, startRow]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    if (tileMap[r][c] !== targetId) continue;
    tileMap[r][c] = fillId;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
  renderTiles();
}

cursorCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { col, row } = getCellFromEvent(e);

  if (activeTool === 'paint' || activeTool === 'erase') {
    pushUndo();
    isPainting = true;
    applyPaint(col, row);
  } else if (activeTool === 'fill') {
    pushUndo();
    const targetId = tileMap[row]?.[col] ?? null;
    const fillId   = activeTile.id;
    floodFill(col, row, targetId, fillId);
  } else if (activeTool === 'token') {
    placeToken(col, row);
  } else if (activeTool === 'label') {
    placeLabel(col, row);
  } else if (activeTool === 'image') {
    // handled by sidebar
  } else if (activeTool === 'feature') {
    // Toggle cell in pending selection
    const exists = pendingFeatureCells.findIndex(([r, c]) => r === row && c === col);
    if (exists !== -1) {
      pendingFeatureCells.splice(exists, 1);
    } else {
      pendingFeatureCells.push([row, col]);
    }
    updatePendingCellsDisplay();
    renderFeatures();
  } else if (activeTool === 'object') {
    // Picking a target (B) cell for a slide action
    if (_pickingTargetForObj) {
      _pickingTargetForObj = false;
      document.getElementById('obj-target-col').value = col;
      document.getElementById('obj-target-row').value = row;
      document.getElementById('object-modal').classList.remove('hidden');
      return;
    }
    // Check if clicking an existing object (open edit)
    const existing = mapObjects.find(o => o.col === col && o.row === row);
    if (existing) { openObjectModal(existing.id); return; }
    // New object placement
    _pendingObjCol = col;
    _pendingObjRow = row;
    openObjectModal(null);
  }
});

cursorCanvas.addEventListener('mousemove', e => {
  const { col, row } = getCellFromEvent(e);
  drawCursor(col, row);
  coordsEl.textContent = col + ', ' + row;
  if (isPainting && (activeTool === 'paint' || activeTool === 'erase')) {
    applyPaint(col, row);
  }
});

cursorCanvas.addEventListener('mouseup',    ()  => { isPainting = false; });
cursorCanvas.addEventListener('mouseleave', ()  => {
  isPainting = false;
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  coordsEl.textContent = '';
});
// Prevent context menu interfering with right-click erase extension
cursorCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Right-click = quick erase
cursorCanvas.addEventListener('mousedown', e => {
  if (e.button === 2) {
    pushUndo();
    isPainting = true;
    const { col, row } = getCellFromEvent(e);
    const prev = activeTool;
    activeTool = 'erase';
    applyPaint(col, row);
    activeTool = prev;
  }
});

// ── Token placement + drag ────────────────────────────────────
let _tokenSeq = 0;
function placeToken(col, row) {
  if (activeTokenTab === 'player') {
    const sel    = document.getElementById('token-player-select');
    const name   = sel.value;
    if (!name) return;
    const player = _players.find(p => p.name === name);
    const cls    = player ? player.cls : '';
    const color  = CLASS_COLORS[cls] || '#3b82f6';
    tokens.push({ id: ++_tokenSeq, col, row, name, cls, color, type: 'player' });
  } else {
    const mobType = document.getElementById('token-mob-type').value;
    if (mobType) {
      // Auto-number: Goblin 1, Goblin 2, …
      const sameCount = tokens.filter(t => t.mobType === mobType).length + 1;
      const name  = mobType + ' ' + sameCount;
      const color = MOB_COLORS[mobType] || '#ef4444';
      tokens.push({ id: ++_tokenSeq, col, row, name, mobType, color, type: 'npc' });
    } else {
      const name  = document.getElementById('token-name').value.trim() || '?';
      const color = document.getElementById('token-color').value;
      tokens.push({ id: ++_tokenSeq, col, row, name, color, type: 'npc' });
    }
  }
  renderTokens();
}

function makeDraggableToken(el, tok) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'token') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = tok.col; origRow = tok.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    tok.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    tok.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (tok.row * cellSize + cellSize / 2) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // Right-click to remove
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    tokens = tokens.filter(t => t.id !== tok.id);
    renderTokens();
  });
}

// ── Label placement + drag ────────────────────────────────────
let _labelSeq = 0;
function placeLabel(col, row) {
  const text  = document.getElementById('label-text').value.trim();
  if (!text) return;
  const size  = parseInt(document.getElementById('label-size').value, 10);
  const color = document.getElementById('label-color').value;
  labels.push({ id: ++_labelSeq, col, row, text, size, color });
  renderLabels();
}

function makeDraggableLabel(el, lbl) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'label') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = lbl.col; origRow = lbl.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    lbl.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    lbl.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (lbl.row * cellSize) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    labels = labels.filter(l => l.id !== lbl.id);
    renderLabels();
  });
}

// ── Background image ──────────────────────────────────────────
function setBgImage(url) {
  if (!url) { bgImage = null; bgImageEl = null; renderBg(); return; }
  bgImage = url;
  bgImageEl = new Image();
  bgImageEl.onload = renderBg;
  bgImageEl.src = url;
}

// Load map list into sidebar as thumbnails
fetch('/api/maps').then(r => r.json()).then(data => {
  const list = document.getElementById('bg-image-list');
  const maps = data.maps || [];
  if (!maps.length) {
    list.innerHTML = '<div style="font-size:0.75rem;color:#555;font-style:italic;padding:0.25rem;">No maps found.</div>';
    return;
  }
  maps.forEach(url => {
    const el = document.createElement('div');
    el.className = 'bg-item';
    el.title = url;
    const thumb = document.createElement('img');
    thumb.className = 'bg-item-thumb';
    thumb.src = url;
    thumb.alt = url.split('/').pop();
    const name = document.createElement('div');
    name.className = 'bg-item-name';
    name.textContent = url.split('/').pop().replace(/\.[^.]+$/, '');
    el.appendChild(thumb);
    el.appendChild(name);
    el.addEventListener('click', () => {
      document.getElementById('bg-image-url').value = url;
      document.querySelectorAll('.bg-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      setBgImage(url);
    });
    list.appendChild(el);
  });
}).catch(() => {});

// ── Player roster load (for class tokens) ─────────────────────
function updatePlayerPreview() {
  const sel     = document.getElementById('token-player-select');
  const preview = document.getElementById('token-player-preview');
  if (!sel || !preview) return;
  const name   = sel.value;
  const player = _players.find(p => p.name === name);
  if (player) {
    const icon  = CLASS_ICONS[player.cls] || '⚔️';
    const color = CLASS_COLORS[player.cls] || '#3b82f6';
    preview.innerHTML =
      `<span style="display:inline-flex;align-items:center;justify-content:center;` +
      `width:28px;height:28px;border-radius:50%;background:${color};` +
      `border:2px solid #d4af37;font-size:1.1rem;line-height:1;">${icon}</span>` +
      `<span style="font-size:0.8rem;color:#e6e6e6;">${player.name} <span style="color:#888;">${player.cls}</span></span>`;
  } else {
    preview.innerHTML = '';
  }
}

fetch('/api/players').then(r => r.json()).then(data => {
  _players = Array.isArray(data) ? data : (data.players || []);
  const sel = document.getElementById('token-player-select');
  _players.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.name;
    opt.textContent = (CLASS_ICONS[p.cls] || '⚔️') + ' ' + p.name + ' (' + p.cls + ')';
    sel.appendChild(opt);
  });
  document.getElementById('token-player-select').addEventListener('change', updatePlayerPreview);
  updatePlayerPreview();
}).catch(() => {});

// ── Token tab switching ───────────────────────────────────────
document.querySelectorAll('.token-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.token-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTokenTab = btn.dataset.tab;
    document.getElementById('token-tab-player').style.display = activeTokenTab === 'player' ? '' : 'none';
    document.getElementById('token-tab-npc').style.display    = activeTokenTab === 'npc'    ? '' : 'none';
  });
});

// ── Mob type auto-fill ────────────────────────────────────────
document.getElementById('token-mob-type').addEventListener('change', function () {
  const mobType = this.value;
  const nameEl  = document.getElementById('token-name');
  if (mobType) {
    nameEl.value       = '';
    nameEl.placeholder = mobType + ' (auto-numbered)';
  } else {
    nameEl.placeholder = 'Custom name (optional)';
  }
});

document.getElementById('apply-bg-btn').addEventListener('click', () => {
  setBgImage(document.getElementById('bg-image-url').value.trim() || null);
});
document.getElementById('remove-bg-btn').addEventListener('click', () => {
  document.getElementById('bg-image-url').value = '';
  setBgImage(null);
});

// ── Fog of War (Map Builder) ────────────────────────────────
function initFogGrid() {
  fogBuilderGrid = [];
  for (let r = 0; r < rows; r++) {
    fogBuilderGrid.push(new Array(cols).fill(false));
  }
}

function renderFogLayer() {
  fogLayer.innerHTML = '';
  fogLayer.style.display = 'grid';
  fogLayer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  fogLayer.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  fogLayer.style.pointerEvents = 'auto';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      (function (row, col) {
        const cell = document.createElement('div');
        cell.style.cssText = 'cursor:crosshair;box-sizing:border-box;border:1px solid rgba(255,255,255,0.04);' +
          'background:' + (fogBuilderGrid[row][col] ? 'transparent' : 'rgba(0,0,0,0.82)') + ';transition:background 0.1s;';
        cell.addEventListener('mousedown', e => {
          e.preventDefault();
          fogIsPainting = true;
          fogPaintValue = !fogBuilderGrid[row][col];
          fogBuilderGrid[row][col] = fogPaintValue;
          cell.style.background = fogPaintValue ? 'transparent' : 'rgba(0,0,0,0.82)';
          scheduleFogSend();
        });
        cell.addEventListener('mouseenter', () => {
          if (!fogIsPainting) return;
          if (fogBuilderGrid[row][col] === fogPaintValue) return;
          fogBuilderGrid[row][col] = fogPaintValue;
          cell.style.background = fogPaintValue ? 'transparent' : 'rgba(0,0,0,0.82)';
          scheduleFogSend();
        });
        fogLayer.appendChild(cell);
      })(r, c);
    }
  }
}

document.addEventListener('mouseup', () => { fogIsPainting = false; });

let _fogSendTimer = null;
function scheduleFogSend() {
  if (_fogSendTimer) return;
  _fogSendTimer = setTimeout(() => {
    _fogSendTimer = null;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'update-fog', fogKey: FOG_KEY, fogGrid: fogBuilderGrid }));
    }
  }, 60);
}

function setFogMode(on) {
  fogEnabled = on;
  const toggleBtn = document.getElementById('fog-toggle-btn');
  const revealBtn = document.getElementById('fog-reveal-btn');
  const hideBtn   = document.getElementById('fog-hide-btn');
  toggleBtn.classList.toggle('active', fogEnabled);
  toggleBtn.textContent = fogEnabled ? '🌫 Fog ON' : '🌫 Fog';
  revealBtn.style.display = fogEnabled ? '' : 'none';
  hideBtn.style.display   = fogEnabled ? '' : 'none';
  if (!fogEnabled) {
    fogLayer.innerHTML = '';
    fogLayer.style.pointerEvents = 'none';
    fogLayer.style.display = 'none';
  } else {
    renderFogLayer();
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'update-fog', fogKey: FOG_KEY, fogGrid: fogBuilderGrid }));
    }
  }
}

document.getElementById('fog-toggle-btn').addEventListener('click', () => setFogMode(!fogEnabled));
document.getElementById('fog-reveal-btn').addEventListener('click', () => {
  for (let r = 0; r < rows; r++) fogBuilderGrid[r].fill(true);
  renderFogLayer();
  scheduleFogSend();
});
document.getElementById('fog-hide-btn').addEventListener('click', () => {
  for (let r = 0; r < rows; r++) fogBuilderGrid[r].fill(false);
  renderFogLayer();
  scheduleFogSend();
});

// ── Tool buttons ──────────────────────────────────────────────
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTool = btn.dataset.tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('token-options').style.display    = activeTool === 'token'   ? '' : 'none';
    document.getElementById('label-options').style.display    = activeTool === 'label'   ? '' : 'none';
    document.getElementById('image-options').style.display    = activeTool === 'image'   ? '' : 'none';
    document.getElementById('feature-options').style.display  = activeTool === 'feature' ? '' : 'none';
    document.getElementById('object-options').style.display   = activeTool === 'object'  ? '' : 'none';
    // Tile palette only for paint/fill
    document.getElementById('tile-palette-section').style.display =
      ['paint','fill'].includes(activeTool) ? '' : 'none';
  });
});

// ── Tile palette build ────────────────────────────────────────
const tileGrid = document.getElementById('tile-grid');
TILE_GROUPS.forEach(group => {
  const hdr = document.createElement('div');
  hdr.className = 'tile-group-header';
  hdr.textContent = group.label;
  tileGrid.appendChild(hdr);
  group.ids.forEach(id => {
    const tile = TILES.find(t => t.id === id);
    if (!tile) return;
    const sw = document.createElement('div');
    sw.className = 'tile-swatch' + (tile === activeTile ? ' selected' : '');
    const _tc = _texCache[tile.id] || (_texCache[tile.id] = buildTextureCanvas(tile.id));
    sw.style.backgroundImage = `url(${_tc.toDataURL()})`;
    sw.style.backgroundSize = 'cover';
    sw.title = tile.label;
    const lbl = document.createElement('div');
    lbl.className = 'tile-label';
    lbl.textContent = tile.label;
    sw.appendChild(lbl);
    sw.addEventListener('click', () => {
      activeTile = tile;
      document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    tileGrid.appendChild(sw);
  });
});

// ── Kenney PNG tile palette (async load) ──────────────────────
fetch('/api/tiles').then(r => r.json()).then(data => {
  const files = data.tiles || [];
  if (!files.length) return;

  // Build tile objects and preload images
  const kenTiles = files.map(filename => {
    const id  = 'kenney:' + filename.replace('.png', '');
    const url = '/assets/tiles/' + filename;
    const num = filename.replace('tile_', '').replace('.png', '');
    const tile = { id, label: 'K-' + num, url };
    TILES.push(tile);
    const img = new Image();
    img.src = url;
    // Re-render tiles layer when each image finishes loading
    img.onload = () => renderTiles();
    _kenneyImgCache[id] = img;
    return tile;
  });

  // Palette section header
  const hdr = document.createElement('div');
  hdr.className = 'tile-group-header';
  hdr.textContent = 'Kenney Dungeon';
  tileGrid.appendChild(hdr);

  // Swatches — use actual PNG as background
  kenTiles.forEach(tile => {
    const sw = document.createElement('div');
    sw.className = 'tile-swatch kenney-swatch';
    sw.title = tile.label;
    const img = document.createElement('img');
    img.src = tile.url;
    img.alt = tile.label;
    img.className = 'kenney-swatch-img';
    sw.appendChild(img);
    const lbl = document.createElement('div');
    lbl.className = 'tile-label';
    lbl.textContent = tile.label;
    sw.appendChild(lbl);
    sw.addEventListener('click', () => {
      activeTile = tile;
      document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    tileGrid.appendChild(sw);
  });
}).catch(() => {});

// ── Grid size controls ────────────────────────────────────────
document.getElementById('apply-grid-btn').addEventListener('click', () => {
  const newCols = parseInt(document.getElementById('grid-cols').value, 10);
  const newRows = parseInt(document.getElementById('grid-rows').value, 10);
  const newCell = parseInt(document.getElementById('cell-size').value, 10);
  if (!newCols || !newRows || !newCell) return;

  // Preserve existing tiles when expanding
  const oldMap = tileMap;
  const oldRows = rows; const oldCols = cols;
  cols = newCols; rows = newRows; cellSize = newCell;
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push([]);
    for (let c = 0; c < cols; c++) {
      tileMap[r][c] = (r < oldRows && c < oldCols) ? oldMap[r][c] : null;
    }
  }
  initFogGrid();
  applySize();
});

// ── Undo ──────────────────────────────────────────────────────
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!undoStack.length) return;
  tileMap = undoStack.pop();
  renderTiles();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (undoStack.length) { tileMap = undoStack.pop(); renderTiles(); }
  }
});

// ── Clear canvas ──────────────────────────────────────────────
document.getElementById('clear-canvas-btn').addEventListener('click', () => {
  if (!confirm('Clear the entire map?')) return;
  pushUndo();
  tileMap = [];
  for (let r = 0; r < rows; r++) tileMap.push(new Array(cols).fill(null));
  tokens = []; labels = [];
  renderAll();
});

// ── Composite export ──────────────────────────────────────────
function buildComposite() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');

  // 1. bg
  ctx.drawImage(bgCanvas, 0, 0);
  // 2. tiles
  ctx.drawImage(tileCanvas, 0, 0);
  // 3. tokens
  tokens.forEach(tok => {
    const r = cellSize / 2 - 3;
    const cx = tok.col * cellSize + cellSize / 2;
    const cy = tok.row * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tok.color;
    ctx.fill();
    ctx.strokeStyle = tok.type === 'player' ? '#d4af37' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = tok.type === 'player' ? 2.5 : 2;
    ctx.stroke();
    if (tok.type === 'player' && tok.cls) {
      const icon     = CLASS_ICONS[tok.cls] || '⚔️';
      const iconSize = Math.max(10, Math.round(cellSize * 0.4));
      ctx.font          = iconSize + 'px "Segoe UI Emoji", Apple Color Emoji, sans-serif';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(icon, cx, cy - 2);
      ctx.font          = 'bold ' + Math.max(6, Math.round(cellSize * 0.18)) + 'px Segoe UI';
      ctx.fillStyle     = '#fff';
      ctx.shadowColor   = '#000';
      ctx.shadowBlur    = 3;
      ctx.fillText(tok.name.slice(0, 6), cx, cy + r * 0.58);
      ctx.shadowBlur    = 0;
    } else if (tok.type === 'npc' && tok.mobType) {
      const icon     = MOB_ICONS[tok.mobType] || '❓';
      const iconSize = Math.max(10, Math.round(cellSize * 0.38));
      ctx.font          = iconSize + 'px "Segoe UI Emoji", Apple Color Emoji, sans-serif';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(icon, cx, cy - 2);
      const num = tok.name.replace(tok.mobType, '').trim();
      if (num) {
        ctx.font          = 'bold ' + Math.max(6, Math.round(cellSize * 0.18)) + 'px Segoe UI';
        ctx.fillStyle     = '#fff';
        ctx.shadowColor   = '#000';
        ctx.shadowBlur    = 3;
        ctx.fillText(num, cx, cy + r * 0.58);
        ctx.shadowBlur    = 0;
      }
    } else {
      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold ' + Math.max(8, cellSize * 0.22) + 'px Segoe UI';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tok.name.slice(0, 4), cx, cy);
    }
  });
  // 4. labels
  labels.forEach(lbl => {
    ctx.fillStyle = lbl.color;
    ctx.font = 'bold ' + lbl.size + 'px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(lbl.text, lbl.col * cellSize + cellSize / 2, lbl.row * cellSize);
    ctx.shadowBlur = 0;
  });
  // 5. light grid overlay
  ctx.drawImage(gridCanvas, 0, 0);
  return out;
}

// ── Send Live ─────────────────────────────────────────────────
document.getElementById('send-live-btn').addEventListener('click', () => {
  if (!ws || ws.readyState !== 1) { alert('Not connected to server.'); return; }
  const comp = buildComposite();
  const dataUrl = comp.toDataURL('image/png');
  ws.send(JSON.stringify({ action: 'show-scene-view', image: dataUrl, fit: 'contain', fogKey: fogEnabled ? FOG_KEY : null }));
  if (fogEnabled) scheduleFogSend();
  document.getElementById('send-live-btn').textContent = '✓ Sent!';
  setTimeout(() => { document.getElementById('send-live-btn').textContent = '📡 Send Live'; }, 2000);
});

// ── Save ──────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.remove('hidden');
  document.getElementById('save-status').textContent = '';
});
document.getElementById('save-cancel-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.add('hidden');
});
let _saveSceneData = [];

document.getElementById('save-add-scene').addEventListener('change', async function() {
  document.getElementById('save-scene-opts').style.display = this.checked ? '' : 'none';
  if (!this.checked) return;
  try {
    const r = await fetch('/api/scenes');
    const d = await r.json();
    _saveSceneData = d.scenes || [];
  } catch(e) { _saveSceneData = []; }
  _populateSaveAreaDropdown();
});

function _populateSaveAreaDropdown() {
  const areaSel = document.getElementById('save-scene-area-sel');
  const areas = [];
  _saveSceneData.forEach(function(s) {
    const t = s.tab || s.label;
    if (areas.indexOf(t) === -1) areas.push(t);
  });
  areaSel.innerHTML = '';
  areas.forEach(function(a) {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    areaSel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '＋ New area…';
  areaSel.appendChild(newOpt);
  if (!areas.length) areaSel.value = '__new__';
  _updateSaveLabelDropdown();
}

function _updateSaveLabelDropdown() {
  const areaSel  = document.getElementById('save-scene-area-sel');
  const areaNew  = document.getElementById('save-scene-area-new');
  const labelSel = document.getElementById('save-scene-label-sel');
  const labelNew = document.getElementById('save-scene-label-new');
  const isNewArea = areaSel.value === '__new__';
  areaNew.style.display = isNewArea ? '' : 'none';
  labelSel.innerHTML = '';
  if (!isNewArea) {
    const group = _saveSceneData.find(function(s) { return (s.tab || s.label) === areaSel.value; });
    (group ? group.views || [] : []).forEach(function(v) {
      const opt = document.createElement('option');
      opt.value = v.label; opt.textContent = v.label;
      labelSel.appendChild(opt);
    });
  }
  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '＋ New label…';
  labelSel.appendChild(newOpt);
  if (labelSel.options.length === 1) labelSel.value = '__new__';
  const isNewLabel = labelSel.value === '__new__';
  labelNew.style.display = isNewLabel ? '' : 'none';
  if (isNewLabel && !labelNew.value) {
    labelNew.value = document.getElementById('save-filename').value.trim().replace(/\.png$/i, '');
  }
}

document.getElementById('save-scene-area-sel').addEventListener('change', _updateSaveLabelDropdown);
document.getElementById('save-scene-label-sel').addEventListener('change', function() {
  const labelNew = document.getElementById('save-scene-label-new');
  const isNew = this.value === '__new__';
  labelNew.style.display = isNew ? '' : 'none';
  if (isNew && !labelNew.value) {
    labelNew.value = document.getElementById('save-filename').value.trim().replace(/\.png$/i, '');
  }
});

document.getElementById('save-confirm-btn').addEventListener('click', async () => {
  const filename = document.getElementById('save-filename').value.trim();
  if (!filename) { document.getElementById('save-status').textContent = 'Enter a filename.'; return; }
  const safeName = filename.endsWith('.png') ? filename : filename + '.png';
  const comp     = buildComposite();
  const dataUrl  = comp.toDataURL('image/png');
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = 'Saving…';

  try {
    const r = await fetch('/api/map-builder/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataUrl,
        filename: safeName,
        state: { cols, rows, cellSize, tileMap, tokens, labels, bgImage, fogEnabled, fogGrid: fogBuilderGrid, features, objects: mapObjects },
      }),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Save failed');

    // Optionally add to scene list
    const addScene = document.getElementById('save-add-scene').checked;
    if (addScene) {
      const areaSel  = document.getElementById('save-scene-area-sel');
      const areaNew  = document.getElementById('save-scene-area-new');
      const labelSel = document.getElementById('save-scene-label-sel');
      const labelNew = document.getElementById('save-scene-label-new');
      const area  = (areaSel.value === '__new__' ? areaNew.value.trim() : areaSel.value) || 'Custom';
      const label = (labelSel.value === '__new__' ? labelNew.value.trim() : labelSel.value) || safeName;
      const scenesR = await fetch('/api/scenes');
      const scenesJ = await scenesR.json();
      const scenes  = scenesJ.scenes || [];
      const newId   = area.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      // Find or create area group
      let group = scenes.find(s => s.label.toLowerCase() === area.toLowerCase());
      if (!group) {
        group = { id: newId, label: area, tab: area, views: [] };
        scenes.push(group);
      }
      // Only add if this image path isn't already in the group
      const alreadyExists = group.views.some(v => v.image === json.webPath);
      if (!alreadyExists) {
        group.views.push({
          id: newId + '-view-0',
          label,
          image: json.webPath,
          fog: !!document.getElementById('save-fog').checked,
        });
      }
      await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
    }

    statusEl.style.color = '#4ade80';
    statusEl.textContent = '✓ Saved to ' + json.webPath;
    setTimeout(() => document.getElementById('save-modal').classList.add('hidden'), 1800);
  } catch (err) {
    statusEl.style.color = '#ef4444';
    statusEl.textContent = 'Error: ' + err.message;
  }
});

// ── Open Map ──────────────────────────────────────────────────
function loadMapState(state) {
  cols     = state.cols     || 20;
  rows     = state.rows     || 15;
  cellSize = state.cellSize || 40;

  // Restore tileMap, clamping to declared dimensions
  tileMap = [];
  const srcMap = state.tileMap || [];
  for (let r = 0; r < rows; r++) {
    const srcRow = srcMap[r] || [];
    const newRow = [];
    for (let c = 0; c < cols; c++) newRow.push(srcRow[c] !== undefined ? srcRow[c] : null);
    tileMap.push(newRow);
  }

  tokens    = state.tokens || [];
  labels    = state.labels || [];
  features  = state.features || [];
  mapObjects = state.objects || [];
  undoStack = [];

  // Background image
  bgImage   = state.bgImage || null;
  bgImageEl = null;
  if (bgImage) {
    bgImageEl = new Image();
    bgImageEl.onload = () => renderBg();
    bgImageEl.src = bgImage;
  }

  // Fog state — restore grid, clamped to declared dimensions
  const srcFog = state.fogGrid || [];
  fogBuilderGrid = [];
  for (let r = 0; r < rows; r++) {
    const srcRow = srcFog[r] || [];
    const newRow = [];
    for (let c = 0; c < cols; c++) newRow.push(!!srcRow[c]);
    fogBuilderGrid.push(newRow);
  }

  // Sync grid dimension inputs
  document.getElementById('grid-cols').value = cols;
  document.getElementById('grid-rows').value = rows;
  document.getElementById('cell-size').value  = cellSize;

  // Apply fog mode (updates button states and renders fog layer)
  setFogMode(!!state.fogEnabled);

  // Resize canvases and redraw everything
  applySize();
  renderFeatureList();
  renderObjectList();
  renderObjectLayer();
}

// ── Open Modal tab switching ──────────────────────────────────
let _openActiveTab = 'builder'; // 'builder' | 'image'

function _setOpenTab(tab) {
  _openActiveTab = tab;
  document.getElementById('open-pane-builder').style.display = tab === 'builder' ? '' : 'none';
  document.getElementById('open-pane-image').style.display   = tab === 'image'   ? '' : 'none';
  document.getElementById('open-tab-builder').className = 'btn btn-small ' + (tab === 'builder' ? 'btn-primary' : 'btn-secondary');
  document.getElementById('open-tab-image').className   = 'btn btn-small ' + (tab === 'image'   ? 'btn-primary' : 'btn-secondary');
}
document.getElementById('open-tab-builder').addEventListener('click', () => _setOpenTab('builder'));
document.getElementById('open-tab-image').addEventListener('click',   () => _setOpenTab('image'));

document.getElementById('open-btn').addEventListener('click', async () => {
  const builderSel = document.getElementById('open-map-select');
  const imageSel   = document.getElementById('open-image-select');
  const statusEl   = document.getElementById('open-status');
  statusEl.textContent = '';
  builderSel.innerHTML = '<option value="" disabled>Loading…</option>';
  imageSel.innerHTML   = '<option value="" disabled>Loading…</option>';
  document.getElementById('open-modal').classList.remove('hidden');
  _setOpenTab('builder');

  // Load builder maps
  fetch('/api/map-builder/states')
    .then(r => r.json())
    .then(json => {
      const list = json.states || [];
      if (!list.length) {
        builderSel.innerHTML = '<option value="" disabled>No builder maps found — save a map first.</option>';
      } else {
        builderSel.innerHTML = list.map(n => `<option value="${n}">${n}</option>`).join('');
        builderSel.selectedIndex = 0;
      }
    })
    .catch(() => { builderSel.innerHTML = '<option value="" disabled>Error loading map list.</option>'; });

  // Load all images
  fetch('/api/maps')
    .then(r => r.json())
    .then(json => {
      const list = (json.maps || []);
      if (!list.length) {
        imageSel.innerHTML = '<option value="" disabled>No images found in assets/maps/.</option>';
      } else {
        imageSel.innerHTML = list.map(url => {
          const name = url.split('/').pop();
          return `<option value="${url}">${name}</option>`;
        }).join('');
        imageSel.selectedIndex = 0;
      }
    })
    .catch(() => { imageSel.innerHTML = '<option value="" disabled>Error loading images.</option>'; });
});

document.getElementById('open-cancel-btn').addEventListener('click', () => {
  document.getElementById('open-modal').classList.add('hidden');
});

document.getElementById('open-confirm-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('open-status');
  statusEl.style.color = '#d1d5db';

  if (_openActiveTab === 'builder') {
    const select = document.getElementById('open-map-select');
    const name   = select.value;
    if (!name) { statusEl.textContent = 'Select a map first.'; return; }
    statusEl.textContent = 'Loading…';
    try {
      const r = await fetch('/api/map-builder/state?name=' + encodeURIComponent(name));
      if (!r.ok) throw new Error((await r.json()).error || 'Load failed');
      const state = await r.json();
      loadMapState(state);
      document.getElementById('save-filename').value = name + '.png';
      document.getElementById('open-modal').classList.add('hidden');
    } catch (e) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = 'Error: ' + e.message;
    }

  } else {
    // Any-image tab — load image as background of a fresh blank grid
    const imageSel = document.getElementById('open-image-select');
    const url      = imageSel.value;
    if (!url) { statusEl.textContent = 'Select an image first.'; return; }
    statusEl.textContent = 'Loading…';
    // Reset to a fresh blank state then set background image
    loadMapState({ cols, rows, cellSize, tileMap: null, tokens: [], labels: [], features: [], bgImage: url, fogEnabled: false, fogGrid: null });
    const filename = url.split('/').pop();
    document.getElementById('save-filename').value = filename.replace(/\.[^.]+$/, '') + '_builder.png';
    document.getElementById('open-modal').classList.add('hidden');
    statusEl.textContent = '';
  }
});

// ── Bootstrap ─────────────────────────────────────────────────
initGrid();

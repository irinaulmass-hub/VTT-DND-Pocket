'use strict';
// Shared, deterministic layout rules. Units are columns and vertical grid steps.
(function(scope){
 const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||min));
 function normalize(rect){return {x:Math.round(clamp(rect.x,0,11)),y:Math.round(clamp(rect.y,0,10000)),w:Math.round(clamp(rect.w,3,12)),h:Math.round(clamp(rect.h,2,100))};}
 function pack(items,anchorId){
  const result=[];
  const ordered=anchorId?[...items.filter(i=>i.id===anchorId),...items.filter(i=>i.id!==anchorId)]:items;
  for(const item of ordered){const r={id:item.id,...normalize(item)};r.x=Math.min(r.x,12-r.w);
   // Keep the actively moved panel in the chosen cell; displace neighbours downward.
   while(result.some(other=>overlap(r,other))){r.y=Math.min(...result.filter(other=>overlap(r,other)).map(other=>other.y+other.h));}
   result.push(r);
  }
  return result;
 }
 function compact(items){const packed=[];for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){const r={...item};while(r.y>0&&!packed.some(other=>overlap({...r,y:r.y-1},other)))r.y--;packed.push(r);}return packed;}
 function dense(items){const result=[];for(const item of items){const r={id:item.id,...normalize(item)};let placed=false;for(let y=0;!placed&&y<=10000;y++){for(let x=0;x<=12-r.w;x++){const candidate={...r,x,y};if(!result.some(other=>overlap(candidate,other))){result.push(candidate);placed=true;break;}}}if(!placed)throw Error('Слишком большая раскладка');}return result;}
 const api={overlap,pack,compact,dense};if(typeof module==='object')module.exports=api;else scope.BookLayout=api;
})(typeof window==='object'?window:globalThis);

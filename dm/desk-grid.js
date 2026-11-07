'use strict';
(() => {
 const desk=window.bookDesk;if(!desk)return;
 const grid=document.getElementById('book-content-desk'),root=document.querySelector('.book-shell'),step=24,gap=12;
 let action=null,scheduled=false,history=[],lastSnapshot='';
 const small=()=>grid.clientWidth<620;
 const layout=()=>desk.layout;
 const visible=()=>layout().order.filter(id=>!desk.widgets[id].hidden);
 function naturalHeight(node){const header=node.querySelector('.book-widget-title').offsetHeight;const body=node.querySelector('.book-widget-body');return Math.max(3,Math.ceil((header+(node.classList.contains('collapsed')?0:Math.min(650,body.scrollHeight))+gap)/step));}
 function rects(){let cursor=0;return visible().map(id=>{const config=layout().widgets[id],node=desk.widgets[id],r=config.rect;const value={id,x:r?.x??cursor,y:r?.y??0,w:config.span||4,h:config.collapsed?Math.ceil((node.querySelector('.book-widget-title').offsetHeight+gap)/step):r?.h??naturalHeight(node)};cursor=(value.x+value.w)%12;return value;});}
 function snapshot(){return JSON.stringify(layout());}
 function remember(){const now=snapshot();if(now!==lastSnapshot){history.push(now);history.splice(30);lastSnapshot=now;}}
 function applyRects(rectangles,persist=false){const col=(grid.clientWidth+gap)/12;let bottom=0;for(const r of rectangles){const node=desk.widgets[r.id];if(!node)continue;node.style.left=(r.x*col)+'px';node.style.top=(r.y*step)+'px';node.style.width=(r.w*col-gap)+'px';node.style.height=(r.h*step-gap)+'px';node.dataset.layoutX=r.x;node.dataset.layoutY=r.y;node.dataset.layoutW=r.w;node.dataset.layoutH=r.h;bottom=Math.max(bottom,(r.y+r.h)*step);if(persist){layout().widgets[r.id].rect={x:r.x,y:r.y,w:r.w,h:r.h};layout().widgets[r.id].span=r.w;node.querySelector('[data-size]').value=String(r.w);}}grid.style.height=bottom+'px';}
 function render(){scheduled=false;if(action||document.getElementById('book-view-desk').hidden||!grid.clientWidth)return;
  grid.classList.toggle('free-desk',!small());if(small()){grid.style.height='';for(const id of visible())for(const name of ['left','top','width','height'])desk.widgets[id].style[name]='';return;}
  applyRects(visible().every(id=>!layout().widgets[id].rect)?BookLayout.dense(rects()):BookLayout.compact(BookLayout.pack(rects())));
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(render);}}
 for(const [id,node] of Object.entries(desk.widgets)){
  const handle=node.querySelector('.book-widget-handle');if(handle)handle.draggable=false;
  const resize=document.createElement('button');resize.className='book-resize';resize.type='button';resize.setAttribute('aria-label','Изменить размер виджета');resize.title='Потяните для изменения ширины и высоты';resize.textContent='◢';node.append(resize);
  new ResizeObserver(()=>{if(!action)schedule();}).observe(node.querySelector('.book-widget-title'));
 }
 const placeholder=document.createElement('div');placeholder.className='book-grid-preview';placeholder.hidden=true;grid.append(placeholder);
 root.addEventListener('pointerdown',event=>{
  const node=event.target.closest('[data-widget]');if(!node||small()||!root.classList.contains('book-editing'))return;
  const resize=event.target.closest('.book-resize');const title=event.target.closest('.book-widget-title');
  if(!resize&&(!title||event.target.closest('button,select,input')))return;
  event.preventDefault();event.stopImmediatePropagation();remember();
  const initial={id:node.dataset.widget,x:Number(node.dataset.layoutX),y:Number(node.dataset.layoutY),w:Number(node.dataset.layoutW),h:Number(node.dataset.layoutH)};
  action={node,resize:!!resize,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,initial,base:rects().map(r=>({...r,x:Number(desk.widgets[r.id].dataset.layoutX),y:Number(desk.widgets[r.id].dataset.layoutY),h:Number(desk.widgets[r.id].dataset.layoutH)}))};
  node.classList.add('book-moving');node.setPointerCapture(event.pointerId);placeholder.hidden=false;
 },true);
 root.addEventListener('pointermove',event=>{if(!action||event.pointerId!==action.pointerId)return;const col=(grid.clientWidth+gap)/12,dx=Math.round((event.clientX-action.startX)/col),dy=Math.round((event.clientY-action.startY)/step),base=action.initial;
  const r=action.resize?{...base,w:Math.max(3,Math.min(12-base.x,base.w+dx)),h:Math.max(3,Math.min(100,base.h+dy))}:{...base,x:Math.max(0,Math.min(12-base.w,base.x+dx)),y:Math.max(0,base.y+dy)};
  action.result=BookLayout.pack(action.base.map(item=>item.id===r.id?r:item),r.id);applyRects(action.result);
  Object.assign(placeholder.style,{left:r.x*col+'px',top:r.y*step+'px',width:r.w*col-gap+'px',height:r.h*step-gap+'px'});
 });
 function finish(event,cancel=false){if(!action||event.pointerId!==action.pointerId)return;const current=action;action=null;current.node.classList.remove('book-moving');placeholder.hidden=true;if(current.node.hasPointerCapture(event.pointerId))current.node.releasePointerCapture(event.pointerId);applyRects(cancel?current.base:(current.result||current.base),true);desk.save();lastSnapshot=snapshot();schedule();}
 root.addEventListener('pointerup',event=>finish(event));root.addEventListener('pointercancel',event=>finish(event,true));
 // Old controls remain available as an accessible alternative to dragging.
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.move||button.id==='book-reset'||button.hasAttribute('data-hide')){for(const config of Object.values(layout().widgets))delete config.rect;schedule();}},true);
 root.addEventListener('change',event=>{if(event.target.matches('[data-size],#book-preset')){for(const config of Object.values(layout().widgets))delete config.rect;schedule();}},true);
 const undo=document.createElement('button');undo.type='button';undo.className='book-button';undo.textContent='Отменить размещение';undo.onclick=()=>{const previous=history.pop();if(previous){desk.replace(JSON.parse(previous));lastSnapshot=snapshot();schedule();}};document.querySelector('#book-config .book-toolbar').append(undo);
 const compact=document.createElement('button');compact.type='button';compact.className='book-button';compact.textContent='Уплотнить стол';compact.onclick=()=>{remember();applyRects(BookLayout.dense(rects()),true);desk.save();schedule();};document.querySelector('#book-config .book-toolbar').append(compact);
 new ResizeObserver(schedule).observe(grid);
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['class']});
 new MutationObserver(schedule).observe(document.getElementById('book-view-desk'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('book-layout-change',schedule);window.addEventListener('resize',schedule);
 // Data updates may increase content; fixed-height panels scroll, automatic panels grow.
 new MutationObserver(schedule).observe(grid,{childList:true,subtree:true,characterData:true});
 grid.addEventListener('load',schedule,true);grid.addEventListener('toggle',schedule,true);
 schedule();
})();

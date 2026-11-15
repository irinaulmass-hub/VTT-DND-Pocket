'use strict';

(() => {
  const { size, limit, terrain, props, get } = window.WorldMap;
  const { paintTile, paintProp } = window.WorldArt;

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    let camera = { x: 0, y: 0, scale: 24 };
    let data = { chunks: {}, objects: [], tokens: [] };
    let width = 1, height = 1, frame, gesture, hover, hoveringBrush = false;
    const minScale = () => Math.max(7, width / (size * 8), height / (size * 8));
    function bounds() {
      return {
        left: Math.floor(camera.x - width / (2 * camera.scale)),
        right: Math.ceil(camera.x + width / (2 * camera.scale)),
        top: Math.floor(camera.y - height / (2 * camera.scale)),
        bottom: Math.ceil(camera.y + height / (2 * camera.scale)),
      };
    }
    function draw() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const area = bounds();
        const ratio = canvas.width / width;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = options.player ? '#121915' : options.background?.() || '#e8dec5';
        ctx.fillRect(0, 0, width, height);
        ctx.translate(width / 2, height / 2);
        ctx.scale(camera.scale, camera.scale);
        ctx.translate(-camera.x, -camera.y);
        // Shared integer pixel boundaries keep adjacent tiles flush at fractional zooms.
        const transform = ctx.getTransform();
        const pixelX = x => Math.round(transform.a*x + transform.e);
        const pixelY = y => Math.round(transform.d*y + transform.f);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let y = area.top; y < area.bottom; y++) for (let x = area.left; x < area.right; x++) {
          const type = get(data.chunks, x, y);
          if (type) paintTile(ctx, data.chunks, x, y, type,
            [pixelX(x), pixelY(y), pixelX(x+1)-pixelX(x), pixelY(y+1)-pixelY(y)]);
        }
        ctx.restore();
        if ((typeof options.grid === 'function' ? options.grid() : options.grid) && camera.scale >= 14) {
          ctx.beginPath();
          ctx.lineWidth = 1 / camera.scale;
          ctx.strokeStyle = '#302a2528';
          for (let x = area.left; x <= area.right; x++) { ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); }
          for (let y = area.top; y <= area.bottom; y++) { ctx.moveTo(area.left, y); ctx.lineTo(area.right, y); }
          ctx.stroke();
        }
        const objects = (data.objects || []).map(object => gesture?.prop?.id === object.id && gesture.destination
          ? { ...object, ...gesture.destination } : object);
        const structures = window.WorldMap.structures(objects);
        for (const prop of objects) {
          if (!window.WorldMap.boundsIntersect(window.WorldMap.visualBounds(prop), area)) continue;
          paintProp(ctx, prop, options.selected?.() === prop.id, structures);
        }
        const placement = hover && options.placementPreview?.(Math.floor(hover.x), Math.floor(hover.y));
        if (placement) {
          ctx.save(); ctx.globalAlpha = .55;
          paintProp(ctx, placement.prop, true, window.WorldMap.structures([...objects, placement.prop]));
          ctx.restore();
          if (!placement.allowed) {
            const bounds = window.WorldMap.cellBounds(placement.prop);
            ctx.strokeStyle = '#bf493d'; ctx.lineWidth = 2 / camera.scale;
            ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1);
          }
        }
        if (options.player && data.fog) {
          for (let y = area.top; y < area.bottom; y++) for (let x = area.left; x < area.right; x++) {
            const seen = get(data.seen, x, y);
            if (seen && (!data.visible || get(data.visible, x, y))) continue;
            ctx.fillStyle = seen ? 'rgba(18,25,21,.48)' : '#121915';
            ctx.fillRect(x, y, 1.002, 1.002);
          }
        }
        for (const token of data.tokens || []) {
          ctx.fillStyle = '#35564b'; ctx.strokeStyle = '#f4db9f'; ctx.lineWidth = .09;
          ctx.beginPath(); ctx.arc(token.x + .5, token.y + .5, .4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = 'bold .35px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff4d2';
          ctx.fillText(token.name.slice(0, 2), token.x + .5, token.y + .5);
        }
        const mark = options.mark?.();
        if (mark) {
          ctx.strokeStyle = '#ffe09b'; ctx.lineWidth = .12;
          ctx.strokeRect(mark.x + .04, mark.y + .04, .92, .92);
        }
        const brush = hover && options.brushPreview?.(Math.floor(hover.x), Math.floor(hover.y));
        if (brush) {
          ctx.fillStyle = '#eacb6940'; ctx.strokeStyle = '#fff0b5'; ctx.lineWidth = 1 / camera.scale;
          for (const cell of brush) { ctx.fillRect(cell.x, cell.y, 1, 1); ctx.strokeRect(cell.x, cell.y, 1, 1); }
        }
        const contour = options.contour?.();
        if (contour?.points.length) {
          const points = contour.points, unit = 1 / camera.scale;
          ctx.save();
          ctx.lineWidth = 2 * unit;
          ctx.strokeStyle = contour.invalid ? '#c14736' : '#246e66';
          ctx.fillStyle = '#43867822';
          ctx.beginPath();
          points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x + .5, p.y + .5));
          if (contour.closed && points.length >= 3) { ctx.closePath(); ctx.fill(); }
          ctx.stroke();
          ctx.font = 'bold ' + 11 * unit + 'px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          points.forEach((p, i) => {
            const active = contour.selected === i, radius = (active ? 8 : 6) * unit;
            ctx.fillStyle = active ? '#246e66' : '#fff9e9';
            ctx.beginPath(); ctx.arc(p.x + .5, p.y + .5, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#173f3b';
            ctx.fillText(String(i + 1), p.x + .5, p.y + .5 - 16 * unit);
          });
          if (contour.entrance) {
            const p = contour.entrance;
            ctx.fillStyle = '#d9a34c'; ctx.strokeStyle = '#704a22';
            ctx.fillRect(p.x + .5 - 7 * unit, p.y + .5 - 7 * unit, 14 * unit, 14 * unit);
            ctx.strokeRect(p.x + .5 - 7 * unit, p.y + .5 - 7 * unit, 14 * unit, 14 * unit);
          }
          ctx.restore();
        }
        for (const p of options.marks?.() || []) {
          if (contour) break;
          ctx.strokeStyle = '#246e66'; ctx.lineWidth = 2 / camera.scale;
          ctx.strokeRect(p.x + .08, p.y + .08, .84, .84);
        }
      });
    }
    function setCamera(next, notify = true) {
      camera = { x: Math.max(-limit, Math.min(limit, next.x)), y: Math.max(-limit, Math.min(limit, next.y)),
        scale: Math.max(minScale(), Math.min(100, next.scale || camera.scale)) };
      draw();
      if (notify) options.changed?.();
    }
    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: camera.x + (e.clientX - rect.left - width / 2) / camera.scale,
        y: camera.y + (e.clientY - rect.top - height / 2) / camera.scale };
    }
    // Selecting may open an inspector and move the canvas under the pointer.
    // Only pointer travel, at the gesture's original scale, moves an object.
    function propDestination(start, event) {
      return { x: start.prop.x + Math.round((event.clientX - start.x) / start.camera.scale),
        y: start.prop.y + Math.round((event.clientY - start.y) / start.camera.scale) };
    }
    new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width; height = rect.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      setCamera(camera);
    }).observe(canvas);
    window.addEventListener('world-sprites-ready', draw);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (gesture?.stroke || gesture?.handle) return;
      const before = point(event);
      const scale = Math.max(minScale(), Math.min(100, camera.scale * Math.exp(-event.deltaY * .0016)));
      const change = camera.scale / scale;
      setCamera({ x: before.x - (before.x - camera.x) * change, y: before.y - (before.y - camera.y) * change, scale });
      hover = point(event);
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
      if (event.button > 2 || gesture) return;
      canvas.setPointerCapture(event.pointerId);
      if (options.pickProp && event.button === 0) canvas.focus({ preventScroll: true });
      const p = point(event);
      hover = p;
      const handle = event.button === 0 && options.pickHandle?.(p.x, p.y, 10 / camera.scale);
      if (handle) {
        gesture = { id: event.pointerId, handle, x: event.clientX, y: event.clientY, camera: { ...camera } };
        canvas.focus({ preventScroll: true }); draw(); return;
      }
      if (event.button === 0 && options.startStroke?.(Math.floor(p.x), Math.floor(p.y))) {
        gesture = { id: event.pointerId, stroke: true };
        canvas.focus({ preventScroll: true });
        draw(); return;
      }
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: { ...camera },
        point: p, prop: event.button === 0 ? options.pickProp?.(p.x, p.y) : null,
        pan: event.button !== 0 || options.pan?.() || !options.click,
        token: event.button === 0 && options.moveToken && (data.tokens || []).find(t => t.x === Math.floor(p.x) && t.y === Math.floor(p.y)) };
    });
    canvas.addEventListener('pointermove', event => {
      hover = point(event);
      if (gesture?.handle && gesture.id === event.pointerId) {
        const h = gesture.handle;
        options.previewHandle?.(h, h.x + Math.round((event.clientX - gesture.x) / gesture.camera.scale),
          h.y + Math.round((event.clientY - gesture.y) / gesture.camera.scale));
        draw(); return;
      }
      if (gesture?.stroke && gesture.id === event.pointerId) {
        options.strokeTo?.(Math.floor(hover.x), Math.floor(hover.y)); draw(); return;
      }
      if (!gesture) {
        const active = !!(options.brushPreview?.(Math.floor(hover.x), Math.floor(hover.y)) ||
          options.placementPreview?.(Math.floor(hover.x), Math.floor(hover.y)));
        if (active || hoveringBrush) draw();
        hoveringBrush = active; return;
      }
      if (gesture?.id !== event.pointerId || gesture.token) return;
      if (gesture.prop) {
        const { x, y } = propDestination(gesture, event);
        if (window.WorldMap.valid(x) && window.WorldMap.valid(y)) gesture.destination = { x, y };
        draw();
        return;
      }
      if (!gesture.pan) return;
      const start = gesture.camera;
      setCamera({ x: start.x - (event.clientX - gesture.x) / start.scale,
        y: start.y - (event.clientY - gesture.y) / start.scale, scale: start.scale });
    });
    function cancelGesture(event) {
      if (event?.pointerId !== undefined && gesture?.id !== event.pointerId) return;
      const cancelled = gesture; gesture = null;
      if (cancelled?.stroke) options.endStroke?.(false);
      if (cancelled?.handle) options.cancelHandle?.();
      draw();
    }
    canvas.addEventListener('lostpointercapture', cancelGesture);
    canvas.addEventListener('pointercancel', cancelGesture);
    canvas.addEventListener('pointerleave', () => { if (!gesture) { hover = null; hoveringBrush = false; draw(); } });
    canvas.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (gesture?.stroke || gesture?.handle)) { event.preventDefault(); cancelGesture(); }
    });
    canvas.addEventListener('pointerup', event => {
      if (gesture?.id !== event.pointerId) return;
      const start = gesture;
      gesture = null;
      const p = point(event);
      if (start.handle) {
        const h = start.handle;
        options.moveHandle?.(h, h.x + Math.round((event.clientX - start.x) / start.camera.scale),
          h.y + Math.round((event.clientY - start.y) / start.camera.scale));
        draw(); return;
      }
      if (start.stroke) {
        options.strokeTo?.(Math.floor(p.x), Math.floor(p.y));
        options.endStroke?.(true); draw(); return;
      }
      if (start.prop) {
        draw();
        const prop = start.prop;
        const { x, y } = propDestination(start, event);
        if (window.WorldMap.valid(x) && window.WorldMap.valid(y) && (x !== prop.x || y !== prop.y)) {
          options.moveProp(prop, x, y);
        }
        return;
      }
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (!window.WorldMap.valid(x) || !window.WorldMap.valid(y)) return;
      if (start.token && (start.token.x !== x || start.token.y !== y)) options.moveToken(start.token, x, y);
      else if (!start.pan && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) options.click?.(x, y, p);
    });
    return {
      data: next => { data = next; draw(); }, draw, bounds, setCamera,
      camera: () => ({ ...camera }),
      party: () => {
        const tokens = data.tokens || [];
        if (!tokens.length) return setCamera({ x: 0, y: 0, scale: 24 });
        setCamera({ x: tokens.reduce((sum, t) => sum + t.x, 0) / tokens.length + .5,
          y: tokens.reduce((sum, t) => sum + t.y, 0) / tokens.length + .5, scale: camera.scale });
      },
    };
  }
  create.preview = (canvas, type) => {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.scale(canvas.width/24,canvas.height/24);
    if (terrain[type]) {
      const chunks = {};
      if (type === 'path') {
        window.WorldMap.set(chunks, -1, 0, type);
        window.WorldMap.set(chunks, 1, 0, type);
      }
      ctx.scale(24, 24);
      paintTile(ctx, chunks, 0, 0, type);
    } else if (props[type]) {
      const [, width, height] = props[type];
      const scale = 22 / Math.max(width, height);
      const center = window.WorldMap.footprint({ kind: type, x: 0, y: 0, turn: 0 });
      ctx.translate(12 - scale * center.x, 12 - scale * center.y);
      ctx.scale(scale, scale);
      paintProp(ctx, { kind: type, x: 0, y: 0, turn: 0 });
    }
  };
  create.exportImage = async (layout, options) => {
    const plan=window.WorldMap.exportPlan(options.area,options.pixelsPerCell);
    if(!['none','square','hex'].includes(options.grid)) throw new RangeError('Неизвестный тип сетки');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    canvas.width=plan.width;canvas.height=plan.height;
    const s=plan.pixelsPerCell;
    if(!options.transparent){ctx.fillStyle='#e8dec5';ctx.fillRect(0,0,canvas.width,canvas.height);}
    // Paint in pixel coordinates first, as in the live view, to avoid tile seams.
    for(let y=plan.top;y<plan.bottom;y++)for(let x=plan.left;x<plan.right;x++){
      const type=get(layout.chunks,x,y);
      if(type)paintTile(ctx,layout.chunks,x,y,type,[(x-plan.left)*s,(y-plan.top)*s,s,s]);
    }
    ctx.setTransform(s,0,0,s,-plan.left*s,-plan.top*s);
    const objects=layout.objects.filter(p=>options.includeHidden || !p.hidden);
    const structures=window.WorldMap.structures(objects);
    for(const prop of objects)if(window.WorldMap.boundsIntersect(window.WorldMap.visualBounds(prop),plan))
      paintProp(ctx,options.includeHidden && prop.hidden?{...prop,hidden:false}:prop,false,structures);
    if(options.grid!=='none'){
      ctx.strokeStyle='#242c2755';ctx.lineWidth=1/s;ctx.beginPath();
      if(options.grid==='square'){
        for(let x=plan.left;x<=plan.right;x++){ctx.moveTo(x,plan.top);ctx.lineTo(x,plan.bottom);}
        for(let y=plan.top;y<=plan.bottom;y++){ctx.moveTo(plan.left,y);ctx.lineTo(plan.right,y);}
      } else {
        // Flat-top hexes: one cell is their vertical height. Anchor to world zero.
        const radius=1/Math.sqrt(3),step=radius*1.5;
        for(let col=Math.floor(plan.left/step)-1;col<=Math.ceil(plan.right/step)+1;col++)
          for(let row=plan.top-1;row<=plan.bottom+1;row++){
            const x=col*step,y=row+(col%2)*.5;
            for(let i=0;i<=6;i++){const a=i*Math.PI/3,px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;ctx[i?'lineTo':'moveTo'](px,py);}
          }
      }
      ctx.stroke();
    }
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось создать PNG')),'image/png'));
  };
  window.createWorldView = create;
})();

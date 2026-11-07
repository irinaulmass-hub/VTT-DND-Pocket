'use strict';

(() => {
  const { size, limit, terrain, props, get } = window.WorldMap;
  const { paintTile, paintProp } = window.WorldArt;

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    let camera = { x: 0, y: 0, scale: 24 };
    let data = { chunks: {}, objects: [], tokens: [] };
    let width = 1, height = 1, frame, gesture;
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
        ctx.fillStyle = options.player ? '#121915' : '#e8dec5';
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
        if (options.grid && camera.scale >= 14) {
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
          if (prop.x < area.left - 5 || prop.x > area.right + 5 || prop.y < area.top - 5 || prop.y > area.bottom + 5) continue;
          paintProp(ctx, prop, options.selected?.() === prop.id, structures);
        }
        if (options.player && data.fog) {
          ctx.fillStyle = '#121915';
          for (let y = area.top; y < area.bottom; y++) for (let x = area.left; x < area.right; x++) {
            if (!get(data.seen, x, y)) ctx.fillRect(x, y, 1.002, 1.002);
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
      const before = point(event);
      const scale = Math.max(minScale(), Math.min(100, camera.scale * Math.exp(-event.deltaY * .0016)));
      const change = camera.scale / scale;
      setCamera({ x: before.x - (before.x - camera.x) * change, y: before.y - (before.y - camera.y) * change, scale });
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
      if (event.button > 2) return;
      canvas.setPointerCapture(event.pointerId);
      if (options.pickProp && event.button === 0) canvas.focus({ preventScroll: true });
      const p = point(event);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: { ...camera },
        point: p, prop: event.button === 0 ? options.pickProp?.(p.x, p.y) : null,
        pan: event.button !== 0 || options.pan?.() || !options.click,
        token: event.button === 0 && options.moveToken && (data.tokens || []).find(t => t.x === Math.floor(p.x) && t.y === Math.floor(p.y)) };
    });
    canvas.addEventListener('pointermove', event => {
      if (gesture?.id !== event.pointerId || gesture.token) return;
      if (gesture.prop) {
        const p = point(event);
        const x = gesture.prop.x + Math.round(p.x - gesture.point.x);
        const y = gesture.prop.y + Math.round(p.y - gesture.point.y);
        if (window.WorldMap.valid(x) && window.WorldMap.valid(y)) gesture.destination = { x, y };
        draw();
        return;
      }
      if (!gesture.pan) return;
      const start = gesture.camera;
      setCamera({ x: start.x - (event.clientX - gesture.x) / start.scale,
        y: start.y - (event.clientY - gesture.y) / start.scale, scale: start.scale });
    });
    canvas.addEventListener('lostpointercapture', () => { gesture = null; draw(); });
    canvas.addEventListener('pointerup', event => {
      if (gesture?.id !== event.pointerId) return;
      const start = gesture;
      gesture = null;
      const p = point(event);
      if (start.prop) {
        draw();
        const prop = start.prop;
        const x = prop.x + Math.round(p.x - start.point.x);
        const y = prop.y + Math.round(p.y - start.point.y);
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
  window.createWorldView = create;
})();

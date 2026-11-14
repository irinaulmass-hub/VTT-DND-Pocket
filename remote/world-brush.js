'use strict';

((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world-model'));
  else root.WorldBrush = factory(root.WorldMap);
})(typeof window === 'object' ? window : this, map => {
  const sizes = [1, 3, 5, 9, 15], strokeLimit = 16384;
  function cells(x, y, width, shape) {
    if (!map.valid(x) || !map.valid(y) || !sizes.includes(width) || !['circle', 'square'].includes(shape)) {
      throw new RangeError('Выбери размер и форму кисти');
    }
    const result = [], radius = (width - 1) / 2;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (shape === 'circle' && dx * dx + dy * dy > (width / 2) ** 2) continue;
      if (map.valid(x + dx) && map.valid(y + dy)) result.push({ x: x + dx, y: y + dy });
    }
    return result;
  }
  function start(source, { width, shape, type }) {
    cells(0, 0, width, shape);
    if (type !== undefined && !Object.hasOwn(map.terrain, type)) throw new RangeError('Неизвестное покрытие');
    const chunks = { ...source }, cloned = new Set(), visited = new Set(), tiles = [];
    let count = Object.values(source).reduce((n, chunk) => n + Object.keys(chunk).length, 0), previous, failed;
    function stamp(x, y) {
      for (const point of cells(x, y, width, shape)) {
        const key = point.x + ',' + point.y;
        if (visited.has(key)) continue;
        if (visited.size >= strokeLimit) throw new RangeError('Мазок слишком длинный: не больше 16 384 клеток. Он отменён целиком.');
        visited.add(key);
        const before = map.get(source, point.x, point.y);
        if (before === type) continue;
        if (before === undefined && type !== undefined && ++count > map.tileLimit) {
          throw new RangeError('Достигнут лимит 150 000 клеток. Мазок отменён целиком.');
        }
        if (type === undefined) count--;
        const [chunk] = map.address(point.x, point.y);
        if (!cloned.has(chunk)) { chunks[chunk] = { ...chunks[chunk] }; cloned.add(chunk); }
        map.set(chunks, point.x, point.y, type);
        tiles.push({ ...point, before, after: type });
      }
    }
    return {
      chunks,
      add(x, y) {
        if (failed) throw failed;
        if (!map.valid(x) || !map.valid(y)) return;
        try {
          const from = previous || { x, y };
          // Fill intermediate stamps even when the pointer crosses several cells in one frame.
          const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y));
          for (let i = 0; i <= steps; i++) {
            stamp(steps ? Math.round(from.x + (x - from.x) * i / steps) : x,
              steps ? Math.round(from.y + (y - from.y) * i / steps) : y);
          }
          previous = { x, y };
        } catch (error) { failed = error; throw error; }
      },
      finish() { if (failed) throw failed; return { tiles }; },
    };
  }
  return { sizes, cells, start };
});

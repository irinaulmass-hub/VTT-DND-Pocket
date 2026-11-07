'use strict';

(() => {
  // Coordinates in the original reference sheet. The source image stays intact.
  const regions = {
    goblinAxes: [15, 21, 106, 105],
    goblinArcher: [248, 16, 108, 110],
    goblinShield: [486, 24, 106, 104],
  };
  const figures = new Map();
  const sheet = new Image();
  function removeBackdrop(image, width, height) {
    const { data } = image;
    const reached = new Uint8Array(width * height);
    const queue = [];
    function visit(x, y) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const point = y * width + x;
      if (reached[point]) return;
      const i = point * 4;
      const low = Math.min(data[i], data[i+1], data[i+2]);
      const high = Math.max(data[i], data[i+1], data[i+2]);
      const neutral = high - low <= 10;
      const threshold = neutral ? 174 : 211;
      if (low < threshold || high - low > 32) return;
      reached[point] = 1;
      queue.push(point);
      const alpha = Math.max(0, (248 - low) / (248 - threshold));
      data[i+3] = alpha * 255;
      if (alpha) {
        for (let channel=0; channel<3; channel++) {
          data[i+channel] = (data[i+channel] - 255 * (1-alpha)) / alpha;
        }
      }
    }
    for(let x=0; x<width; x++) { visit(x,0); visit(x,height-1); }
    for(let y=0; y<height; y++) { visit(0,y); visit(width-1,y); }
    // White holes between a weapon and the body can be enclosed by the outline.
    for(let point=0; point<reached.length; point++) {
      const i = point * 4;
      if (Math.min(data[i], data[i+1], data[i+2]) >= 246) visit(point%width, Math.floor(point/width));
    }
    for(let cursor=0; cursor<queue.length; cursor++) {
      const point = queue[cursor], x = point % width, y = Math.floor(point / width);
      visit(x-1,y); visit(x+1,y); visit(x,y-1); visit(x,y+1);
    }
  }
  sheet.onload = () => {
    for (const [kind, [x, y, width, height]] of Object.entries(regions)) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(sheet, x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      removeBackdrop(pixels, width, height);
      ctx.putImageData(pixels, 0, 0);
      figures.set(kind, canvas);
    }
    window.dispatchEvent(new Event('world-sprites-ready'));
  };
  sheet.src = '/remote/world-sprites/goblins.jpg';
  window.WorldSprites = {
    has: kind => Object.hasOwn(regions, kind),
    draw(ctx, kind) {
      const sprite = figures.get(kind);
      if (!sprite) return;
      const scale = .98 / Math.max(sprite.width, sprite.height);
      const w = sprite.width * scale, h = sprite.height * scale;
      ctx.drawImage(sprite, -w/2, -h/2, w, h);
    },
  };
})();

import { sample } from './engine.js';

// Render-only decals. Mileage and completed edge geometry come from the race,
// so a late-joining ground display can reconstruct exactly the same tracks.
export class TireTrails {
  constructor(url, toScreen) {
    this.toScreen = toScreen;
    this.sprite = new Image();
    this.layers = [0, 1].map(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1000;
      return { canvas, context: canvas.getContext('2d'), next: 0, mileage: 0 };
    });
    this.sprite.onload = () => this.measureSprite();
    this.sprite.src = url;
  }

  measureSprite() {
    const probe = document.createElement('canvas');
    const w = probe.width = this.sprite.naturalWidth;
    const h = probe.height = this.sprite.naturalHeight;
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.sprite, 0, 0);
    const pixels = context.getImageData(0, 0, w, h).data;
    let left = w, right = 0;
    // Ignore end caps: the repeatable section is in the middle of both strips.
    for (let y = Math.floor(h * .25); y < h * .75; y += 4) {
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] > 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    if (right <= left) return;
    this.crop = { x: Math.max(0, left - 2), width: right - left + 5, height: h };
  }

  update(player) {
    const layer = this.layers[player.id];
    if (player.distance < layer.mileage || player.distance === 0) {
      layer.context.clearRect(0, 0, 1600, 1000);
      layer.next = 0;
    }
    layer.mileage = player.distance;
    if (!this.crop) return;

    // Keep marks behind the rear axle; future path points are never stamped.
    const end = player.distance - 18;
    if (layer.next > end) return;
    const points = [...player.history, ...(player.edge?.points.slice(1) || [])];
    if (points.length < 2) return;
    const width = 34;
    const spacing = 3;
    const sourceHeight = spacing * this.crop.width / width;
    const repeatHeight = this.crop.height * .5 - sourceHeight;
    const c = layer.context;
    c.globalAlpha = .72;
    for (; layer.next <= end; layer.next += spacing) {
      const position = sample(points, layer.next);
      const [x, y] = this.toScreen([position.x, position.y], player.id);
      const angle = position.angle * (player.id === 0 ? 1 : -1);
      const sourceY = this.crop.height * .25 +
        (layer.next * this.crop.width / width) % repeatHeight;
      c.save();
      c.translate(x, y);
      c.rotate(angle - Math.PI / 2);
      c.drawImage(this.sprite, this.crop.x, sourceY, this.crop.width, sourceHeight,
        -width / 2, -spacing / 2, width, spacing + .15);
      c.restore();
    }
  }

  draw(context, player) {
    this.update(player);
    context.drawImage(this.layers[player.id].canvas, 0, 0);
  }
}

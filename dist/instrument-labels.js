// Screen-space annotation only: anchor positions remain the renderer's original world points.
const ns = 'http://www.w3.org/2000/svg';
const intersects = (a, b) =>
  a.x < b.x + b.w + 5 && a.x + a.w + 5 > b.x && a.y < b.y + b.h + 5 && a.y + a.h + 5 > b.y;
export class InstrumentLabels {
  constructor(container) {
    this.container = container;
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.classList.add('instrument-leaders');
    this.svg.setAttribute('aria-hidden', 'true');
    container.append(this.svg);
    this.entries = new Map();
    this.obstacles = [];
    this.lastMeasure = 0;
  }
  layout(projected, width, height) {
    const now = performance.now();
    if (now - this.lastMeasure > 150 || width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.lastMeasure = now;
      const origin = this.container.getBoundingClientRect();
      this.obstacles = [
        ...document.querySelectorAll(
          '.exhibition .player, #venue-time, #venue-phase, #race-announcement, #venue-result, .venue-tools',
        ),
      ]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).opacity !== '0')
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
        });
    }
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const used = [...this.obstacles];
    // Moving robots retain priority; optional facility text yields when the screen is crowded.
    for (const { label, x, y, visible } of projected.sort(
      (a, b) =>
        Number(b.label.el.classList.contains('rover-tag')) -
        Number(a.label.el.classList.contains('rover-tag')),
    )) {
      const el = label.el;
      let entry = this.entries.get(el);
      if (!entry) {
        const group = document.createElementNS(ns, 'g');
        const line = document.createElementNS(ns, 'path'),
          dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('r', '2');
        group.append(line, dot);
        this.svg.append(group);
        entry = { group, line, dot };
        this.entries.set(el, entry);
      }
      el.hidden = false;
      const w = el.offsetWidth,
        h = el.offsetHeight;
      const robot = el.classList.contains('rover-tag');
      const color = robot ? (el.classList.contains('gold') ? '#d9b779' : '#93c6d8') : '#aebbc4';
      let box = null;
      const margin = 24;
      const sides = x > width / 2 ? [-w - 12, 12] : [12, -w - 12];
      if (
        visible &&
        w &&
        h &&
        x >= margin &&
        x <= width - margin &&
        y >= margin &&
        y <= height - margin
      ) {
        for (const [dx, dy] of [-h - 12, 12, -h - 32, 32].flatMap((dy) =>
          sides.map((dx) => [dx, dy]),
        )) {
          const candidate = {
            x: Math.max(margin, Math.min(width - w - margin, x + dx)),
            y: Math.max(margin, Math.min(height - h - margin, y + dy)),
            w,
            h,
          };
          // Never drag a label far from its real anchor to fit the viewport.
          if (Math.hypot(candidate.x + (dx < 0 ? w : 0) - x, candidate.y + h / 2 - y) > 85)
            continue;
          if (!used.some((other) => intersects(candidate, other))) {
            box = candidate;
            break;
          }
        }
      }
      el.hidden = !box;
      entry.group.style.display = box ? '' : 'none';
      if (!box) continue;
      used.push(box);
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      const endX = box.x > x ? box.x - 4 : box.x + box.w + 4,
        endY = box.y + box.h / 2;
      entry.line.setAttribute(
        'd',
        `M${x} ${y} L${endX} ${endY} H${box.x > x ? box.x : box.x + box.w}`,
      );
      entry.line.setAttribute('stroke', color);
      entry.dot.setAttribute('fill', color);
      entry.dot.setAttribute('cx', x);
      entry.dot.setAttribute('cy', y);
    }
  }
}

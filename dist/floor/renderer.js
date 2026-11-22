import { BOARD, CY, ROBOTS, variants, currentRoute, plateCrop } from './map.js';
import { routeFor, sample, ENVELOPE } from '../sandbox/geometry.js';
const colors = ['#83c9e1', '#dfbb7c'];
const pathCache = new Map();
function path(r) {
  if (!pathCache.has(r.route_id)) {
    const p = new Path2D();
    r.waypoints_cm.forEach((v, i) => p[i ? 'lineTo' : 'moveTo'](v.x_cm, v.y_cm));
    pathCache.set(r.route_id, p);
  }
  return pathCache.get(r.route_id);
}
const load = (src) =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error('无法加载 ' + src));
    im.src = src;
  });
export class FloorArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loaded = false;
    this.debug = false;
    this.errors = [];
    this.frames = [];
    this.ready = this.load();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  async load() {
    try {
      const data = await Promise.all(
        [1, 2, 3].map((i) => load(`assets/floor-arena/stage-${i}.png`)),
      );
      this.plates = data;
      this.rock = await load('assets/meteorite.png');
      this.loaded = true;
    } catch (e) {
      this.errors.push(e.message);
      throw e;
    }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2, 3840 / r.width);
    this.canvas.width = Math.round(r.width * ratio);
    this.canvas.height = Math.round(r.height * ratio);
  }
  stroke(route, width, color, dash = []) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.setLineDash(dash);
    c.stroke(path(route));
    c.setLineDash([]);
  }
  ring(x, y, r, color, width = 0.06) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  }
  label(x, y, text, color = '#c2c5c6', size = 0.3) {
    const c = this.ctx;
    c.font = `500 ${size}px system-ui`;
    c.textAlign = 'left';
    c.fillStyle = 'rgba(9,15,20,.65)';
    const w = c.measureText(text).width;
    c.fillRect(x - 0.18, y - size - 0.12, w + 0.36, size + 0.3);
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
  glow(x, y, r, color) {
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  draw(state) {
    if (!this.loaded || !state) return;
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    c.setTransform(w / 59.8, 0, 0, h / 33.6, 0, 0);
    c.clearRect(0, 0, 59.8, 33.6);
    for (const [i, r] of state.robots.entries()) {
      const cy = CY[r.robot_id],
        top = cy - 8.4,
        color = colors[i],
        plate = this.plates[r.stage_id - 1];
      c.save();
      c.beginPath();
      c.rect(0, top, 59.8, 16.8);
      c.clip();
      const crop = plateCrop(r.stage_id, r.robot_id, plate.width, plate.height);
      c.drawImage(plate, ...crop.source, ...crop.destination_cm);
      // Compacted lunar roads have soft shoulders; the safety envelope is never a filled HUD strip.
      const all = new Path2D();
      for (const key of variants(r, state)) all.addPath(path(routeFor(r.robot_id, key)));
      c.lineCap = 'round';
      c.lineJoin = 'round';
      // Compacted wheelway inside a 6.6 cm graded shoulder. Many translucent
      // passes retain the baked soil detail and avoid a hard-edged geometric strip.
      for (let k = 0; k < 10; k++) {
        c.strokeStyle = `rgba(176,178,177,${0.009 + k * 0.0015})`;
        c.lineWidth = 6.6 - k * 0.24;
        c.stroke(all);
      }
      // Fine industrial path markings, instead of filling the physical swept corridor with player color.
      for (const key of variants(r, state))
        this.stroke(routeFor(r.robot_id, key), 0.055, 'rgba(197,205,207,.28)', [0.12, 0.55]);
      const route = currentRoute(r);
      this.stroke(route, 0.105, color);
      // Short tire impressions are limited to straight sections; offsetting tight
      // centerline arcs would draw loops across the inside of a 6 cm vehicle turn.
      for (let s = 1; s < route.length_cm - 1; s += 0.42) {
        const p = sample(route, s),
          q = sample(route, s + 0.22);
        if (Math.abs(p.heading_deg - q.heading_deg) > 1) continue;
        const a = (p.heading_deg * Math.PI) / 180;
        for (const side of [-1, 1]) {
          const x = p.x_cm - Math.sin(a) * 2 * side,
            y = p.y_cm + Math.cos(a) * 2 * side;
          c.save();
          c.translate(x, y);
          c.rotate(a);
          c.fillStyle = 'rgba(18,22,24,.22)';
          c.fillRect(-0.045, -0.14, 0.09, 0.28);
          c.restore();
        }
      }
      const pending = r.plans[r.stage_id];
      if (pending?.armed && pending.key !== route.key)
        this.stroke(routeFor(r.robot_id, pending.key), 0.065, color, [0.2, 0.35]);
      for (let s = 8; s < route.length_cm - 3; s += 12) {
        const p = sample(route, s);
        c.save();
        c.translate(p.x_cm, p.y_cm);
        c.rotate((p.heading_deg * Math.PI) / 180);
        c.beginPath();
        c.moveTo(-0.38, -0.35);
        c.lineTo(0.12, 0);
        c.lineTo(-0.38, 0.35);
        c.lineWidth = 0.09;
        c.strokeStyle = color;
        c.stroke();
        c.restore();
      }
      this.label(
        1,
        top + 1.05,
        `${i ? '02 / 黄方' : '01 / 蓝方'}    ${['', '科研前哨 · 信标回廊', '中央遗址 · 月震走廊', '撤离港 · 最终归航'][r.stage_id]}`,
        color,
        0.34,
      );
      if (r.stage_id === 1) {
        c.strokeStyle = r.beacon ? color : '#79858b';
        c.lineWidth = 0.065;
        c.beginPath();
        c.moveTo(15, top + 2.7);
        c.lineTo(15, cy - 3.85);
        c.stroke();
        c.strokeStyle = color;
        c.lineWidth = 0.08;
        c.beginPath();
        c.moveTo(6, cy - 3);
        c.lineTo(6, cy + 3);
        c.stroke();
        this.label(3.5, cy + 3.55, '出发区', color, 0.3);
        this.label(14, cy - 4.25, '个人信标', color, 0.28);
        this.ring(15, cy - 3, 0.8, r.beacon ? color : '#7b8b91', 0.06);
        if (r.beacon) {
          this.glow(15, cy - 3, 1.7, i ? '#e5b76a44' : '#6fd9f744');
          this.ring(15, cy - 3, 1 + 0.12 * Math.sin(state.elapsed_ms / 230), color, 0.08);
        }
        this.gate(21, cy - 3, r.gate, color);
        this.label(20.2, cy + 0.8, r.gate ? '舱门开启' : '个人舱门', '#b7bcbf', 0.27);
        this.ring(53.8, cy, 4.85, '#9eacb655', 0.05);
        this.label(
          51,
          cy + 3.8,
          ['TURNING', 'READY'].includes(r.phase) ? '回转接驳中' : '下一区域 →',
          color,
          0.29,
        );
      }
      if (r.stage_id === 2) {
        c.strokeStyle = '#9ac9dd';
        c.lineWidth = 0.1;
        c.beginPath();
        c.moveTo(51.8, cy - 3.3);
        c.lineTo(51.8, cy + 3.3);
        c.stroke();
        this.label(44.7, cy - 3.8, '月震感应区', color, 0.3);
        this.ring(16, cy, 4.85, '#9eacb655', 0.05);
        this.label(
          13.5,
          cy + 3.7,
          ['TURNING', 'READY'].includes(r.phase) ? '回转接驳中' : '← 撤离港入口',
          color,
          0.28,
        );
      }
      if (r.stage_id >= 2 && state.quake_ms !== null) {
        const alpha = Math.min(1, (state.elapsed_ms - state.quake_ms) / 1200);
        c.save();
        c.globalAlpha = alpha;
        this.fissure(18, cy - 4.4, 26, 0.09, 31 + i, '#73a2b5');
        this.fissure(25, cy + 4.2, 20, 0.065, 79 + i, '#618996');
        c.restore();
      }
      if (r.stage_id === 3) {
        this.label(30.5, cy - 1.35, '震源', color, 0.27);
        this.ring(32, cy, 0.45, '#88adbc', 0.07);
        if (state.aftershock === 'collapse' && r.final === 'risk') {
          this.fissure(38.1, cy, 8.9, 0.62, 114 + i, '#9ab4bd');
          this.label(39, cy + 1.1, '塌陷 · 绕行', '#d2b89a', 0.28);
        }
        c.strokeStyle = r.finished_ms !== null ? '#c1e5c9' : color;
        c.lineWidth = 0.14;
        c.beginPath();
        c.moveTo(51, cy - 3.25);
        c.lineTo(51, cy + 3.25);
        c.stroke();
        c.fillStyle = 'rgba(188,214,213,.07)';
        c.fillRect(51, cy - 0.8, 3.3, 1.6);
        this.ring(53.8, cy, 3.15, color, r.finished_ms !== null ? 0.11 : 0.05);
        this.label(
          50.5,
          cy + 4.1,
          r.finished_ms !== null ? '已抵达 · 停靠中' : '飞船停靠区',
          color,
          0.35,
        );
      }
      if (r.rock && !r.rock.done && r.rock.stage_id === r.stage_id) {
        const age = (state.elapsed_ms - r.rock.armed_at_ms) / 1000,
          [x, y] = r.rock.center_cm;
        if (age < 2) {
          this.ring(x, y, 0.8 + 0.1 * Math.sin(age * 12), '#e6ac7a', 0.07);
          this.glow(x, y, 1.3, '#d2946044');
          this.label(x - 1.5, y - 1.35, '落石预警', '#efbd91', 0.29);
        }
        if (age >= 1.35) {
          const t = Math.min(1, (age - 1.35) / 0.65),
            size = 1.6 + (1 - t) * 1.8;
          c.save();
          c.globalAlpha = 0.25;
          c.fillStyle = '#04070b';
          c.beginPath();
          c.ellipse(x + 0.35, y + 0.3, 0.9, 0.65, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
          c.drawImage(this.rock, x - size / 2, y - size / 2 - (1 - t) * 2.4, size, size);
        }
      }
      if (this.debug) {
        this.stroke(route, ENVELOPE * 2, 'rgba(55,170,210,.12)');
        this.ring(r.pose.x_cm, r.pose.y_cm, ENVELOPE, color, 0.05);
        c.save();
        c.translate(r.pose.x_cm, r.pose.y_cm);
        c.rotate((r.pose.heading_deg * Math.PI) / 180);
        c.strokeStyle = color;
        c.lineWidth = 0.06;
        c.strokeRect(-3, -3, 6, 6);
        c.restore();
        this.label(
          1,
          cy,
          `第 ${r.stage_id} 段 / ${r.pose.x_cm.toFixed(2)}, ${r.pose.y_cm.toFixed(2)} cm`,
          color,
          0.35,
        );
      }
      c.restore();
    }
    // A restrained seam belongs to the base, rather than a diagram grid or dashboard panel.
    c.strokeStyle = '#0b1014';
    c.lineWidth = 0.12;
    c.beginPath();
    c.moveTo(0, 16.8);
    c.lineTo(59.8, 16.8);
    c.stroke();
    if (this.debug) {
      c.strokeStyle = '#75bad655';
      c.lineWidth = 0.02;
      for (let x = 0; x <= 59.8; x += 5) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 33.6);
        c.stroke();
      }
      for (let y = 0; y <= 33.6; y += 5) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(59.8, y);
        c.stroke();
      }
    }
    const now = performance.now();
    this.frames.push(now);
    while (this.frames.length > 1 && this.frames[0] < now - 1500) this.frames.shift();
    this.last = {
      match: state.match_id,
      stages: state.robots.map((r) => r.stage_id),
      routes: state.robots.map((r) => r.route_key),
      elapsed_ms: state.elapsed_ms,
      rocks: state.robots.map((r) => !!(r.rock && !r.rock.done && r.rock.stage_id === r.stage_id)),
      beacons: state.robots.map((r) => r.beacon),
      gates: state.robots.map((r) => r.gate),
      aftershock: state.aftershock,
    };
  }
  fissure(x, y, length, width, seed, color) {
    const c = this.ctx;
    const hash = (n) => {
      const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const pts = Array.from({ length: 45 }, (_, j) => {
      const t = j / 44;
      return [
        x + t * length,
        y + (hash(j) - 0.5) * width * 0.25,
        Math.sin(t * Math.PI) * width * (0.28 + hash(j + 50) * 0.55),
      ];
    });
    c.save();
    c.beginPath();
    pts.forEach(([px, py, w], j) => c[j ? 'lineTo' : 'moveTo'](px, py - w));
    [...pts].reverse().forEach(([px, py, w]) => c.lineTo(px, py + w));
    c.closePath();
    c.fillStyle = '#101319';
    c.fill();
    c.strokeStyle = '#515d66';
    c.lineWidth = 0.028;
    c.stroke();
    c.beginPath();
    pts.forEach(([px, py], j) => c[j ? 'lineTo' : 'moveTo'](px, py));
    c.strokeStyle = color;
    c.lineWidth = 0.025;
    c.globalAlpha = 0.6;
    c.stroke();
    // Short irregular offshoots, kept local to the same visible fault.
    for (let j = 5; j < 40; j += 8) {
      const [px, py] = pts[j],
        side = j % 3 ? 1 : -1;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + 0.23, py + side * (0.25 + width));
      c.lineTo(px + 0.42, py + side * (0.4 + width));
      c.strokeStyle = '#262a2f';
      c.lineWidth = 0.045;
      c.stroke();
    }
    c.restore();
  }
  gate(x, y, open, color) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.fillStyle = '#39434a';
    c.strokeStyle = '#77858e';
    c.lineWidth = 0.035;
    for (const side of [-1, 1]) {
      const half = open ? 0.48 : 3.15;
      const y0 = open ? (side < 0 ? -3.2 - half : 3.2) : side < 0 ? -3.2 : 3.2 - half;
      c.fillRect(-0.25, y0, 0.5, half);
      c.strokeRect(-0.25, y0, 0.5, half);
      for (let j = 0; j < half; j += 0.28) {
        c.beginPath();
        c.moveTo(-0.23, y0 + j);
        c.lineTo(0.23, y0 + j);
        c.stroke();
      }
    }
    c.fillStyle = open ? color : '#c79466';
    for (const sign of [-1, 1]) c.fillRect(-0.36, sign * 3.4, 0.72, 0.13);
    c.restore();
  }
  diagnostics() {
    return {
      ready: this.loaded,
      renderer: 'Blender orthographic plates + centimeter dynamic overlay',
      board: BOARD,
      debug: this.debug,
      renderSize: [this.canvas.width, this.canvas.height],
      fps:
        this.frames.length < 2
          ? 0
          : Math.round(((this.frames.length - 1) * 1000) / (this.frames.at(-1) - this.frames[0])),
      layers: [
        'lunar-terrain',
        'existing-glb-facilities',
        'canonical-roads',
        'beacon-gate',
        'quake',
        'rock',
        'finish',
      ],
      ...this.last,
      errors: this.errors,
    };
  }
}

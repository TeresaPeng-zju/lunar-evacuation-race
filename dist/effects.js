import { ROUTES, sample } from './engine.js';

// Card artwork is sampled directly from the supplied reference. No regenerated text.
export class CardEffects {
  constructor(arena, canvas, toScreen, meteor) {
    this.arena = arena;
    this.canvas = canvas;
    this.toScreen = toScreen;
    this.meteor = meteor;
    this.cards = new Map();
    this.stage = document.createElement('div');
    this.stage.className = 'cast-stage';
    this.stage.setAttribute('aria-hidden', 'true');
    arena.append(this.stage);
  }
  preview() { this.previewAt = performance.now(); }
  shots(race) {
    const shots = race.players.filter(p => p.rock).map(p => {
      const edge = ROUTES[p.rock.edge];
      const pos = sample(edge.points, edge.length / 2);
      return { key: `${p.id}:${p.rock.at}`, age: race.time - p.rock.at,
        target: this.toScreen([pos.x, pos.y], p.id), attacker: 1 - p.id };
    });
    if (this.previewAt !== undefined) {
      const age = (performance.now() - this.previewAt) / 1000;
      if (age < 5) shots.push({ key: 'preview', age, target: [1040, 420], attacker: 0, preview: true });
      else this.previewAt = undefined;
    }
    return shots;
  }
  update(race) {
    const shots = this.shots(race);
    const alive = new Set();
    const rect = this.canvas.getBoundingClientRect();
    const parent = this.arena.getBoundingClientRect();
    const scale = Math.min(rect.width / 1600, rect.height / 1000);
    const ox = rect.left - parent.left + (rect.width - 1600 * scale) / 2;
    const oy = rect.top - parent.top + (rect.height - 1000 * scale) / 2;
    for (const shot of shots) {
      if (shot.age < 0 || shot.age > 2) continue;
      alive.add(shot.key);
      let card = this.cards.get(shot.key);
      if (!card) {
        card = document.createElement('div');
        card.className = 'cast-card';
        card.innerHTML = '<div class="card-rotor"><div class="card-face card-front"></div><div class="card-face card-back"></div><div class="card-shine"></div></div>';
        this.stage.append(card);
        this.cards.set(shot.key, card);
      }
      const t = shot.age;
      const rise = Math.min(1, t / .28);
      const flip = Math.max(0, Math.min(1, (t - .3) / .55));
      card.dataset.phase = flip === 1 ? 'front' : 'back';
      const fly = Math.max(0, Math.min(1, (t - 1.13) / .78));
      const ease = 1 - Math.pow(1 - fly, 3);
      const origin = shot.attacker === 0 ? 300 : 1300;
      let x = origin + (800 - origin) * (1 - Math.pow(1 - rise, 3));
      let y = 820 - 350 * rise;
      x += (shot.target[0] - x) * ease;
      y += (shot.target[1] - y) * ease - Math.sin(fly * Math.PI) * 150;
      const size = (0.45 + .55 * rise) * (1 - fly * .94);
      const cardWidth = Math.min(250, Math.max(150, rect.width * .2));
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardWidth * 1.5}px`;
      card.style.left = `${ox + x * scale}px`;
      card.style.top = `${oy + y * scale}px`;
      card.style.opacity = String(t > 1.88 ? Math.max(0, (2 - t) / .12) : Math.min(1, rise * 3));
      card.style.transform = `translate(-50%,-50%) scale(${size}) rotate(${(shot.attacker ? -1 : 1) * (-8 + fly * 52)}deg)`;
      card.style.setProperty('--card-glow', shot.attacker ? '#e5b85a' : '#67cfff');
      card.firstElementChild.style.transform = `rotateY(${180 * (1 - flip)}deg) rotateX(${Math.sin(flip * Math.PI) * 12}deg)`;
    }
    for (const [key, card] of this.cards) if (!alive.has(key)) { card.remove(); this.cards.delete(key); }
    this.currentShots = shots;
  }
  draw(ctx) {
    for (const s of this.currentShots || []) {
      const [x, y] = s.target;
      const t = s.age;
      if (t > 1.45 && t < 2) {
        const p = (t - 1.45) / .55;
        const mx = x - (1 - p) * 150, my = y - (1 - p) * 240;
        ctx.save();
        const trail = ctx.createLinearGradient(mx - 90, my - 150, mx, my);
        trail.addColorStop(0, '#fb823b00'); trail.addColorStop(1, '#ffc98bdd');
        ctx.fillStyle = trail;
        ctx.beginPath(); ctx.moveTo(mx - 90, my - 150); ctx.lineTo(mx + 16, my + 10); ctx.lineTo(mx - 18, my + 8); ctx.fill();
        ctx.translate(mx, my); ctx.rotate(p * 3);
        if (this.meteor.complete && this.meteor.naturalWidth) ctx.drawImage(this.meteor, -37, -37, 74, 74);
        ctx.restore();
      }
      if (t >= 2 && t < 4.2) {
        const p = (t - 2) / 2.2;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = Math.pow(1 - p, 2);
        ctx.strokeStyle = '#edbf87'; ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, 25 + p * 130, 16 + p * 85, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 18; i++) {
          const angle = i * 2.39996;
          const d = 15 + p * (65 + (i % 4) * 18);
          const dx = Math.cos(angle) * d, dy = Math.sin(angle) * d * .7;
          const radius = 9 + p * 26 + i % 7;
          const cloud = ctx.createRadialGradient(dx, dy, 0, dx, dy, radius);
          cloud.addColorStop(0, '#c1ad8a99'); cloud.addColorStop(1, '#84756000');
          ctx.fillStyle = cloud; ctx.fillRect(dx - radius, dy - radius, radius * 2, radius * 2);
          if (p < .55) { ctx.fillStyle = '#d7b791'; ctx.fillRect(dx, dy - Math.sin(p / .55 * Math.PI) * 35, 4, 3); }
        }
        ctx.restore();
      }
      if (s.preview && t >= 2 && t < 5 && this.meteor.complete && this.meteor.naturalWidth) {
        ctx.save(); ctx.globalAlpha = Math.min(1, 5 - t); ctx.drawImage(this.meteor, x - 41, y - 41, 82, 82); ctx.restore();
      }
    }
  }
}

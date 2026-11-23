import dgram from 'node:dgram';
import { setTimeout as wait } from 'node:timers/promises';
import { calibrate, pose } from '../camera/navigation.mjs';

const vehicles = [
  { name: '蓝车', tag: 0, ip: '192.168.31.157' },
  { name: '黄车', tag: 1, ip: '192.168.31.127' },
];
const angle = (a) => (Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class TagStraight {
  state = { status: 'idle', cars: [], events: [] };
  socket = dgram.createSocket('udp4');
  constructor() {
    this.socket.on('error', (e) => this.stop(e.message));
  }
  event(msg) {
    this.state.events.push(msg);
  }
  wheels(i, l, r) {
    this.socket.send(Buffer.from(l + ',' + r), 8888, vehicles[i].ip);
  }
  zero() {
    vehicles.forEach((_, i) => this.wheels(i, 0, 0));
  }
  stop(reason) {
    if (!this.active) return;
    this.cancelled = true;
    this.zero();
    this.state.status = 'stopping';
    this.event(reason);
  }
  async frame(attempts = 65) {
    for (let i = 0; i < attempts; i++) {
      const f = await (
        await fetch('http://127.0.0.1:4182/live-frame', { signal: AbortSignal.timeout(1500) })
      ).json();
      if (f.age >= 0 && f.age < 180 && f.stamp > (this.stamp ?? 0) && f.items?.length === 6) {
        this.cal ??= calibrate(f.items, 747, 337, 0);
        this.stamp = f.stamp;
        return vehicles.map((v) => pose(f.items, this.cal, v.tag));
      }
      await wait(90);
    }
    throw Error('缺少新鲜六标签定位');
  }
  async stopped() {
    await Promise.all(
      vehicles.map(async (v) => {
        const res = await fetch('http://' + v.ip + '/status', {
          signal: AbortSignal.timeout(2000),
        });
        const s = await res.json();
        if (!res.ok || s.L !== 0 || s.R !== 0) throw Error(v.name + '未确认零输出');
      }),
    );
  }
  async configure() {
    if (this.active || this.configuring) throw Error('测试进行中');
    this.configuring = true;
    try {
      this.cal = null;
      this.state = { status: 'idle', cars: [], events: [] };
      await this.stopped();
      const points = await this.frame(70);
      this.checkSpace(points);
      this.state.status = 'ready';
      this.event('双车在线，已识别六个标签。每车沿场地向右走两段，各 5 cm。');
    } finally {
      this.configuring = false;
    }
  }
  checkSpace(points) {
    if (
      points.some((p) => p.x < 75 || p.x + 100 > 670 || p.y < 40 || p.y > 295) ||
      Math.abs(points[0].y - points[1].y) < 95
    )
      throw Error('当前路径空间不足');
  }
  start() {
    if (this.state.status !== 'ready' || this.active || this.configuring)
      throw Error('请先配置 A→B 直线测试');
    this.active = true;
    this.cancelled = false;
    this.state.status = 'running';
    this.run()
      .catch((e) => {
        this.state.status = 'fault';
        this.event(e.message);
      })
      .finally(() => {
        this.zero();
        this.active = false;
      });
  }
  async run() {
    await this.stopped();
    const starts = await this.frame(70);
    this.checkSpace(starts);
    this.state.cars = vehicles.map((v, i) => ({
      name: v.name,
      stage: 1,
      dx: 0,
      dy: 0,
      parked: false,
    }));
    let points = starts;
    for (let n = 0; n < 80; n++) {
      if (this.cancelled) throw Error('测试已中止');
      const commands = [];
      for (const [i, p] of points.entries()) {
        const c = this.state.cars[i],
          a = starts[i];
        c.dx = p.x - a.x;
        c.dy = p.y - a.y;
        const yaw = angle(p.heading - a.heading);
        if (c.dx < -5 || Math.abs(c.dy) > 15 || Math.abs(yaw) > 22 || c.dx > 112)
          throw Error(c.name + '偏离直线路线');
        const goal = c.stage * 50;
        if (!c.parked && c.dx >= goal - 7) {
          if (c.stage === 1) {
            c.stage = 2;
            this.event(c.name + '到达第一段，已切换第二段');
          } else c.arrived = true;
        }
        if (c.arrived || c.parked) continue;
        const steer = Math.max(-13, Math.min(13, Math.round(-0.9 * yaw - 1.1 * c.dy)));
        commands.push({
          i,
          l: 58 + steer,
          r: 58 - steer,
          ms: Math.max(85, Math.min(135, (c.stage * 50 - c.dx) * 7)),
        });
      }
      if (this.state.cars.some((c) => c.arrived && !c.parked)) {
        await this.stopped();
        const stable = await this.frame();
        this.state.cars.forEach((c, i) => {
          if (
            c.arrived &&
            !c.parked &&
            distance(stable[i], points[i]) <= 1.5 &&
            stable[i].x - starts[i].x >= 93 &&
            stable[i].x - starts[i].x <= 112 &&
            Math.abs(stable[i].y - starts[i].y) <= 15
          ) {
            c.parked = true;
            this.event(c.name + ' PARKED · 零输出及相机停稳确认');
          }
          c.arrived = false;
        });
        points = stable;
        if (this.state.cars.every((c) => c.parked)) {
          this.state.status = 'finished';
          return;
        }
        continue;
      }
      await Promise.all(
        commands.map(async (c) => {
          this.wheels(c.i, c.l, c.r);
          try {
            await wait(c.ms);
          } finally {
            this.wheels(c.i, 0, 0);
          }
        }),
      );
      await wait(330);
      points = await this.frame();
    }
    throw Error('超过直线测试步数');
  }
}

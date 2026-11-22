import { ROBOTS, CY, angleDiff } from '../../dist/sandbox/geometry.js';

// Independent differential-drive plants. They see wheel commands, never routes.
export class SimulatedIO {
  live = false;
  calibrationId = 'simulated-dual-drive';
  time = 100000;
  constructor() {
    this.reset();
  }
  now() {
    return this.time;
  }
  reset() {
    this.vehicles = Object.fromEntries(
      ROBOTS.map((id) => [
        id,
        { pose: { x_cm: 6, y_cm: CY[id], heading_deg: 0 }, v: 0, w: 0, stopped: true },
      ]),
    );
  }
  drive(id, v, w) {
    Object.assign(this.vehicles[id], { v, w });
  }
  advance(ms) {
    this.time += ms;
    for (const r of Object.values(this.vehicles)) {
      const dt = ms / 1000,
        theta = (r.pose.heading_deg * Math.PI) / 180 + (r.w * dt) / 2;
      r.pose = {
        x_cm: r.pose.x_cm + dt * r.v * Math.cos(theta),
        y_cm: r.pose.y_cm + dt * r.v * Math.sin(theta),
        heading_deg: angleDiff(r.pose.heading_deg + (r.w * dt * 180) / Math.PI, 0),
      };
      r.stopped = r.v === 0 && r.w === 0;
    }
  }
  read() {
    return { stamp: this.time, poses: this.vehicles };
  }
}

import { RouteProtocol } from '../../sandbox/simulator.mjs';
import {
  ROBOTS,
  CY,
  MAP_REVISION,
  angleDiff,
  project,
  sample,
} from '../../dist/sandbox/geometry.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const dist = (a, b) => Math.hypot(a.x_cm - b.x_cm, a.y_cm - b.y_cm);

// IO supplies measured, timestamped board poses and wheel-stop confirmation.
// Linear speed is cm/s; positive angular speed is clockwise in rad/s.
export class DualExecutor extends RouteProtocol {
  constructor(send, io) {
    super(send);
    this.io = io;
    this.live = io.live;
    this.clockId = 'dual-executor';
    this.calibrationId = io.calibrationId;
    this.now = io.now();
    this.stops = new Set();
    this.lastSample = -Infinity;
  }
  stopBoth() {
    for (const id of ROBOTS) this.io.drive(id, 0, 0);
  }
  stopForCommand(id) {
    this.stopBoth();
    this.stops.add(id);
  }
  localFault(code) {
    this.stopBoth();
    if (this.paused) return;
    this.paused = true;
    this.startCommand = null;
    this.emit('fault', { code, stopped_confirmed: false });
  }
  receive(m) {
    if (m.type === 'hello') {
      this.stopBoth();
      this.stops.clear();
      this.lastSample = -Infinity;
      this.io.reset?.();
    }
    super.receive(m);
  }
  frameNow() {
    if (
      !this.map ||
      !this.instancesReady() ||
      !this.measurement ||
      this.measurement.stamp <= this.lastSample
    )
      return;
    const { stamp, poses } = this.measurement;
    this.lastSample = stamp;
    this.emit('pose.frame', {
      frame_id: ++this.frame,
      captured_mono_ms: stamp,
      robots: ROBOTS.map((id) => {
        const r = this.robots[id],
          q = poses[id];
        return {
          robot_id: id,
          ...q?.pose,
          valid: !!q,
          in_bounds: !!q && this.inside(id, q.pose),
          stopped_confirmed: !!q?.stopped,
          stage_id: r.stage,
          stage_instance_id: r.instances[r.stage],
          route_revision: r.revision,
          map_revision: MAP_REVISION,
          calibration_id: this.calibrationId,
          quality: q ? 1 : 0,
        };
      }),
    });
  }
  instancesReady() {
    return ROBOTS.every((id) => this.robots[id].instances[1]);
  }
  inside(id, p) {
    const m = Math.sqrt(18) + 0.8;
    return p.x_cm >= m && p.x_cm <= 59.8 - m && Math.abs(p.y_cm - CY[id]) <= 8.4 - m;
  }
  tick(dt) {
    this.io.advance?.(dt);
    const measurement = this.io.read();
    const fresh = measurement && this.io.now() - measurement.stamp <= 150;
    this.measurement = fresh ? measurement : null;
    for (const id of ROBOTS) {
      const r = this.robots[id],
        q = this.measurement?.poses[id];
      r.stopped = !!q?.stopped;
      if (q) r.pose = q.pose;
      if ((this.running || this.startCommand) && (!q || !this.inside(id, q.pose)))
        this.localFault('POSE_OR_LINK_INVALID');
    }
    this.advanceClock(dt);
    if (this.paused && !ROBOTS.every((id) => this.robots[id].stopped)) this.stopBoth();
    if (this.stops.size && ROBOTS.every((id) => this.robots[id].stopped)) {
      for (const id of this.stops)
        this.result(id, 'completed', {
          robots: ROBOTS.map((robot_id) => ({ robot_id, stopped_confirmed: true })),
        });
      this.stops.clear();
    }
    if (this.running && !this.paused) {
      this.activeTime += dt;
      for (const id of ROBOTS) {
        if (!this.paused) this.follow(this.robots[id]);
      }
    }
    this.frameNow();
  }
  follow(r) {
    const id = r.id,
      p = r.pose;
    if (r.phase === 'TURNING') {
      const h = this.handoffs.get(id + '/' + r.stage);
      if (dist(p, { x_cm: h.center_cm[0], y_cm: h.center_cm[1] }) > h.position_tolerance_cm)
        return this.localFault('TURN_CENTER_DRIFT');
      const error = angleDiff(h.target_heading_deg, p.heading_deg);
      if (Math.abs(error) > 3)
        return this.io.drive(id, 0, clamp(((error * Math.PI) / 180) * 5, -2.6, 2.6));
      this.io.drive(id, 0, 0);
      if (r.stopped) {
        this.frameNow();
        r.phase = 'READY';
        this.status(r, 'READY');
      }
      return;
    }
    if (r.phase !== 'RUNNING') return;
    let route = r.current.route;
    const projection = project(route, p);
    if (projection.distance_cm > route.center_tracking_tolerance_cm)
      return this.localFault('OFF_ROUTE');
    r.s = projection.s_cm;
    const pending = r.slots[r.stage];
    if (pending !== r.current && pending?.switch_at_cm) {
      const [x_cm, y_cm] = pending.switch_at_cm;
      if (r.s >= project(route, { x_cm, y_cm }).s_cm - 0.03) {
        if (this.activeTime - pending.armed_at < pending.warning_ms)
          return this.localFault('WARNING_NOT_COMPLETE');
        this.activate(r, pending);
        route = pending.route;
      }
    }
    if (
      r.slots[r.stage] === r.current &&
      r.current.requires_decision_at_x_cm &&
      p.x_cm >= r.current.requires_decision_at_x_cm - 0.05
    )
      return this.localFault('AFTERSHOCK_UNRESOLVED');
    const end = route.stop_pose_cm,
      remaining = dist(p, end);
    if (r.s >= route.length_cm - 0.28 && remaining <= 0.32) {
      this.io.drive(id, 0, 0);
      if (!r.stopped) return;
      this.frameNow();
      if (r.stage === 3) {
        r.phase = 'PARKED';
        this.status(r, 'PARKED');
      } else if (r.slots[r.stage + 1] && this.handoffs.has(id + '/' + r.stage)) {
        r.phase = 'TURNING';
        this.status(r, 'TURNING');
      } else this.localFault('NEXT_STAGE_NOT_PREPARED');
      return;
    }
    const ahead = sample(route, r.s + 0.32);
    const bearing = (Math.atan2(ahead.y_cm - p.y_cm, ahead.x_cm - p.x_cm) * 180) / Math.PI;
    const error = (angleDiff(bearing, p.heading_deg) * Math.PI) / 180;
    const v = Math.min(1.8, Math.max(0.4, remaining * 2)) * Math.max(0, Math.cos(error));
    this.io.drive(id, v, clamp((2 * v * Math.sin(error)) / 0.32, -2.6, 2.6));
  }
}

import dgram from 'node:dgram';
import { isIPv4 } from 'node:net';
import { performance } from 'node:perf_hooks';
import { ROBOTS, MAP_REVISION, angleDiff } from '../../dist/sandbox/geometry.js';
import { calibrate, pose } from '../camera/navigation.mjs';

export function validateProfile(p) {
  if (
    !p?.parameters_verified ||
    !p.calibration_id ||
    p.map_revision !== MAP_REVISION ||
    p.board?.width_cm !== 59.8 ||
    p.board?.height_cm !== 33.6 ||
    p.max_speed_cm_s !== 2 ||
    p.pose_stale_ms !== 150 ||
    ![p.combined_error_cm, p.braking_distance_cm, p.tie_ms].every(Number.isFinite) ||
    p.combined_error_cm < 0 ||
    p.combined_error_cm > 0.8 ||
    p.braking_distance_cm < 0 ||
    p.braking_distance_cm > 2 ||
    p.tie_ms < 100
  )
    throw Error('缺少经验证的实车比赛配置');
  const c = p.camera;
  if (
    !c ||
    ![c.anchor_width_mm, c.anchor_height_mm, c.origin_x_mm, c.origin_y_mm].every(Number.isFinite) ||
    c.anchor_width_mm <= 0 ||
    c.anchor_height_mm <= 0
  )
    throw Error('缺少棋盘与四码标定');
  const ips = new Set(),
    tags = new Set();
  for (const id of ROBOTS) {
    const r = p.vehicles?.[id];
    if (
      !r ||
      !isIPv4(r.ip) ||
      ips.has(r.ip) ||
      !Number.isInteger(r.tag) ||
      r.tag < 0 ||
      [4, 5, 6, 7].includes(r.tag) ||
      tags.has(r.tag) ||
      ![
        r.heading_offset_deg,
        r.forward_mm,
        r.right_mm,
        r.track_cm,
        r.left_pct_per_cm_s,
        r.right_pct_per_cm_s,
        r.max_power,
      ].every(Number.isFinite) ||
      r.track_cm <= 0 ||
      !r.left_pct_per_cm_s ||
      !r.right_pct_per_cm_s ||
      r.max_power <= 0 ||
      r.max_power > 100
    )
      throw Error('请核对两车独立的 IP、标签、车体偏移与轮速参数：' + id);
    ips.add(r.ip);
    tags.add(r.tag);
  }
}
export class RoverIO {
  live = true;
  now() {
    return performance.now();
  }
  constructor(profile, { socket = dgram.createSocket('udp4'), request = fetch } = {}) {
    validateProfile(profile);
    this.profile = profile;
    this.calibrationId = profile.calibration_id;
    this.request = request;
    this.udp = socket;
    this.commands = {};
    this.status = {};
    this.still = {};
    this.udp.on('error', () => {
      this.failed = true;
    });
    this.closed = false;
    this.pollCamera();
    for (const id of ROBOTS) this.pollStatus(id);
  }
  drive(id, v, w) {
    const r = this.profile.vehicles[id];
    const raw = [
      (v + (w * r.track_cm) / 2) * r.left_pct_per_cm_s,
      (v - (w * r.track_cm) / 2) * r.right_pct_per_cm_s,
    ];
    const scale = Math.max(1, ...raw.map((n) => Math.abs(n) / r.max_power));
    const wheels = raw.map((n) => Math.round(n / scale));
    const prev = this.commands[id];
    const now = this.now();
    if (prev && prev.value === wheels.join(',') && now - prev.at < 60) return;
    const value = wheels.join(',');
    this.commands[id] = { value, at: now, since: prev?.value === value ? prev.since : now };
    if (!this.closed) this.udp.send(wheels.join(','), 8888, r.ip);
  }
  async pollStatus(id) {
    while (!this.closed) {
      try {
        const requested = this.now();
        const res = await this.request('http://' + this.profile.vehicles[id].ip + '/status', {
          signal: AbortSignal.timeout(450),
        });
        const s = await res.json();
        if (!res.ok || ![s.L, s.R].every(Number.isFinite)) throw Error();
        this.status[id] = { zero: s.L === 0 && s.R === 0, at: requested };
      } catch {
        delete this.status[id];
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async pollCamera() {
    while (!this.closed) {
      const sent = this.now();
      try {
        const f = await (
          await this.request('http://127.0.0.1:4182/live-frame', {
            signal: AbortSignal.timeout(200),
          })
        ).json();
        if (!Array.isArray(f.items) || !Number.isFinite(f.age) || !Number.isFinite(f.stamp))
          throw Error();
        if (f.stamp !== this.sourceStamp) {
          const c = this.profile.camera;
          this.cal ??= calibrate(f.items, c.anchor_width_mm, c.anchor_height_mm, 0);
          const poses = {},
            stamp = sent - f.age;
          for (const id of ROBOTS) {
            const r = this.profile.vehicles[id];
            try {
              const t = pose(
                f.items,
                { ...this.cal, zero: (-r.heading_offset_deg * Math.PI) / 180 },
                r.tag,
              );
              const cos = Math.cos(t.heading),
                sin = Math.sin(t.heading);
              const q = {
                x_cm: (t.x - c.origin_x_mm + r.forward_mm * cos - r.right_mm * sin) / 10,
                y_cm: (t.y - c.origin_y_mm + r.forward_mm * sin + r.right_mm * cos) / 10,
                heading_deg: angleDiff((t.heading * 180) / Math.PI, 0),
              };
              const st = this.status[id];
              if (!st || this.now() - st.at > 450) throw Error();
              const cmd = this.commands[id];
              const zeroConfirmed = st.zero && cmd?.value === '0,0' && st.at >= cmd.since;
              const ref = this.still[id];
              if (
                !ref ||
                !zeroConfirmed ||
                Math.hypot(q.x_cm - ref.x_cm, q.y_cm - ref.y_cm) > 0.1 ||
                Math.abs(angleDiff(q.heading_deg, ref.heading_deg)) > 1.5
              )
                this.still[id] = { ...q, stamp };
              poses[id] = {
                pose: q,
                stopped: zeroConfirmed && stamp - this.still[id].stamp >= 150,
              };
            } catch {
              delete this.still[id];
            }
          }
          this.latest = { stamp, poses };
          this.sourceStamp = f.stamp;
        }
      } catch {
        this.latest = null;
        this.still = {};
      }
      await new Promise((r) => setTimeout(r, 8));
    }
  }
  read() {
    return this.failed ? null : this.latest;
  }
  close() {
    this.commands = {};
    for (const id of ROBOTS) this.drive(id, 0, 0);
    this.closed = true;
    this.udp.close();
  }
}

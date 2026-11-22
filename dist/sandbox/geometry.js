// Canonical physical coordinates. Rendering and hardware export use this same module.
export const BOARD = Object.freeze({
  width_cm: 59.8,
  height_cm: 33.6,
  origin: 'top_left',
  x_axis: 'right',
  y_axis: 'down',
});
export const ROBOTS = ['rover-blue', 'rover-gold'];
export const CY = { 'rover-blue': 8.4, 'rover-gold': 25.2 };
export const MAP_REVISION = 'physical-v0.3-sandbox.1';
export const ENVELOPE = Math.sqrt(18) + 0.8;
export const LIMITS = Object.freeze({
  speed_cm_s: 2,
  body_cm: [6, 6],
  error_cm: 0.8,
  corner_radius_cm: 1,
  pose_stale_ms: 150,
  command_timeout_ms: 1200,
  warning_ms: 2000,
  rock_lead_cm: 6,
  turn_position_cm: 0.5,
  turn_heading_deg: 5,
  tie_ms: 100,
  turn_ms: 1500,
});
const controls = {
  s1_beacon: [
    [6, 0],
    [12, 0],
    [12, -3],
    [48, -3],
    [48, 0],
    [53.8, 0],
  ],
  s1_beacon_rock: [
    [6, 0],
    [12, 0],
    [12, -3],
    [26, -3],
    [26, 3],
    [46, 3],
    [46, -3],
    [48, -3],
    [48, 0],
    [53.8, 0],
  ],
  s1_outer: [
    [6, 0],
    [12, 0],
    [12, 3],
    [23, 3],
    [23, 0],
    [43, 0],
    [43, 3],
    [48, 3],
    [48, 0],
    [53.8, 0],
  ],
  s1_outer_rock: [
    [6, 0],
    [12, 0],
    [12, 3],
    [23, 3],
    [23, 0],
    [26, 0],
    [26, -3],
    [39, -3],
    [39, 0],
    [43, 0],
    [43, 3],
    [48, 3],
    [48, 0],
    [53.8, 0],
  ],
  s2: [
    [53.8, 0],
    [16, 0],
  ],
};
const tails = {
  stable: [
    [38, 0],
    [53.8, 0],
  ],
  safe: [
    [38, 0],
    [38, -3],
    [42, -3],
    [42, 3],
    [48, 3],
    [48, 0],
    [53.8, 0],
  ],
  collapse: [
    [38, 0],
    [38, 3],
    [41, 3],
    [41, -3],
    [44, -3],
    [44, 3],
    [48, 3],
    [48, 0],
    [53.8, 0],
  ],
};
for (const [name, tail] of Object.entries(tails)) {
  controls[`s3_${name}`] = [[16, 0], ...tail];
  controls[`s3_${name}_rock`] = [[16, 0], [20, 0], [20, -3], [31, -3], [31, 0], [34, 0], ...tail];
}
export const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a, b) => {
  const d = dist(a, b);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
export function rounded(vertices) {
  const segments = [];
  let cursor = vertices[0],
    length = 0;
  const line = (end) => {
    const n = dist(cursor, end);
    if (n > 1e-9) {
      segments.push({ kind: 'line', from: cursor, to: end, s_cm: length, length_cm: n });
      length += n;
    }
    cursor = end;
  };
  for (let i = 1; i < vertices.length - 1; i++) {
    const [a, b, c] = vertices.slice(i - 1, i + 2),
      u = unit(a, b),
      v = unit(b, c),
      cross = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(cross) < 1e-8) {
      line(b);
      continue;
    }
    const from = [b[0] - u[0], b[1] - u[1]],
      center = [from[0] + v[0], from[1] + v[1]],
      to = [b[0] + v[0], b[1] + v[1]];
    line(from);
    segments.push({
      kind: 'arc',
      from,
      to,
      center,
      radius_cm: 1,
      start_rad: Math.atan2(from[1] - center[1], from[0] - center[0]),
      sweep_rad: (Math.sign(cross) * Math.PI) / 2,
      s_cm: length,
      length_cm: Math.PI / 2,
    });
    length += Math.PI / 2;
    cursor = to;
  }
  line(vertices.at(-1));
  return { segments, length_cm: length };
}
export function sample(route, s) {
  s = Math.max(0, Math.min(s, route.length_cm));
  const a = route.segments.find((x) => s <= x.s_cm + x.length_cm + 1e-9) || route.segments.at(-1),
    t = Math.min(1, (s - a.s_cm) / a.length_cm);
  let x, y, h;
  if (a.kind === 'line') {
    x = a.from[0] + (a.to[0] - a.from[0]) * t;
    y = a.from[1] + (a.to[1] - a.from[1]) * t;
    h = Math.atan2(a.to[1] - a.from[1], a.to[0] - a.from[0]);
  } else {
    const angle = a.start_rad + a.sweep_rad * t;
    x = a.center[0] + Math.cos(angle);
    y = a.center[1] + Math.sin(angle);
    h = angle + (Math.sign(a.sweep_rad) * Math.PI) / 2;
  }
  return { x_cm: x, y_cm: y, heading_deg: angleDiff((h * 180) / Math.PI, 0), s_cm: s };
}
export function project(route, pose) {
  let best = { distance_cm: Infinity, s_cm: 0 };
  for (const a of route.segments) {
    let t;
    if (a.kind === 'line')
      t = Math.max(
        0,
        Math.min(
          1,
          ((pose.x_cm - a.from[0]) * (a.to[0] - a.from[0]) +
            (pose.y_cm - a.from[1]) * (a.to[1] - a.from[1])) /
            a.length_cm ** 2,
        ),
      );
    else {
      const angle = Math.atan2(pose.y_cm - a.center[1], pose.x_cm - a.center[0]);
      const diff = Math.atan2(Math.sin(angle - a.start_rad), Math.cos(angle - a.start_rad));
      t = Math.max(0, Math.min(1, diff / a.sweep_rad));
    }
    const s = a.s_cm + t * a.length_cm,
      p = sample(route, s),
      d = Math.hypot(p.x_cm - pose.x_cm, p.y_cm - pose.y_cm);
    if (d < best.distance_cm) best = { distance_cm: d, s_cm: s };
  }
  return best;
}
const cache = new Map();
export function routeFor(robot, key) {
  const id = `${robot}/${key}`;
  if (cache.has(id)) return cache.get(id);
  const endpointSource = { s1_ab: 's1_beacon', s2_ab: 's2', s3_ab: 's3_safe' }[key];
  const source = controls[endpointSource || key];
  if (!Array.isArray(source) || !ROBOTS.includes(robot)) throw Error('UNKNOWN_ROUTE');
  const vertices = (endpointSource ? [source[0], source.at(-1)] : source).map(([x, y]) => [
      x,
      y + CY[robot],
    ]),
    r = rounded(vertices);
  const route = {
    route_id: id,
    key,
    robot_id: robot,
    stage_id: Number(key[1]),
    ...r,
    control_vertices_cm: vertices,
    max_speed_cm_s: 2,
    center_tracking_tolerance_cm: 0.8,
    stop_pose_cm: {
      x_cm: vertices.at(-1)[0],
      y_cm: vertices.at(-1)[1],
      heading_deg: key[1] === '2' ? -180 : 0,
    },
    // Exact corridor definition: union of discs along the analytic centerline, not a polygon shortcut.
    swept_corridor: {
      kind: 'analytic_centerline_disk_sweep',
      radius_cm: ENVELOPE,
      includes_error_cm: 0.8,
    },
  };
  route.waypoints_cm = endpointSource
    ? [sample(route, 0), sample(route, r.length_cm)]
    : Array.from({ length: Math.ceil(r.length_cm / 0.1) + 1 }, (_, i) =>
        sample(route, Math.min(i * 0.1, r.length_cm)),
      );
  cache.set(id, route);
  return route;
}
export function rockSite(stage, opening, robot) {
  const cy = CY[robot],
    name = stage === 1 ? opening : 'entry';
  return {
    rock_site_id: `${robot}/s${stage}/${name}`,
    stage_id: stage,
    center_cm:
      stage === 1 && opening === 'beacon'
        ? [36, cy - 3]
        : stage === 1
          ? [34, cy + 3]
          : [26, cy + 3],
    radius_cm: 0.5,
    fork_cm: stage === 1 ? (opening === 'beacon' ? [25, cy - 3] : [25, cy]) : [19, cy],
    merge_cm: stage === 1 ? (opening === 'beacon' ? [47, cy - 3] : [40, cy]) : [32, cy],
    blocked_edge_id: `${robot}/s${stage}/${name}/direct`,
  };
}
export function manifest(endpointOnly = false) {
  return {
    protocol: 'lunar-hw/0.3-sandbox',
    map_revision: MAP_REVISION,
    parameters_verified: false,
    board: BOARD,
    limits: LIMITS,
    coordinate_reference: 'body_center_on_board',
    heading: '0=right, clockwise, [-180,180)',
    lanes: ROBOTS.map((robot) => ({
      robot_id: robot,
      cy_cm: CY[robot],
      bounds_cm: [0, CY[robot] - 8.4, 59.8, CY[robot] + 8.4],
      start_pose_cm: { x_cm: 6, y_cm: CY[robot], heading_deg: 0 },
      finish_zone_polygon_cm: [
        [51, CY[robot] - 0.8],
        [54.3, CY[robot] - 0.8],
        [54.3, CY[robot] + 0.8],
        [51, CY[robot] + 0.8],
      ],
      stop_pose_cm: { x_cm: 53.8, y_cm: CY[robot], heading_deg: 0 },
      handoffs: [
        { from: 1, to: 2, center_cm: [53.8, CY[robot]], heading_deg: -180 },
        { from: 2, to: 3, center_cm: [16, CY[robot]], heading_deg: 0 },
      ],
      triggers: {
        beacon_cm: [15, CY[robot] - 3],
        beacon_radius_cm: 0.8,
        gate_x_cm: 21,
        quake_x_cm: 51.8,
        source_x_cm: 32,
        aftershock_fork_x_cm: 37,
      },
      rock_sites: [
        rockSite(1, 'beacon', robot),
        rockSite(1, 'outer', robot),
        rockSite(3, null, robot),
      ],
    })),
    routes: ROBOTS.flatMap((robot) =>
      (endpointOnly ? ['s1_ab', 's2_ab', 's3_ab'] : Object.keys(controls)).map((key) =>
        routeFor(robot, key),
      ),
    ),
  };
}

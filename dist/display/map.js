// Presentation mapping only. Physical route revisions and pose validation stay in Sandbox.
import {
  ROBOTS,
  CY,
  MAP_REVISION,
  routeFor,
  sample,
  project,
  manifest,
} from '../sandbox/geometry.js';
import { mapPoint } from '../ruins-map.js';
export { ROBOTS, MAP_REVISION };
export const STAGES = { 1: [6, 53.8, 60, 700], 2: [53.8, 16, 700, 920], 3: [16, 53.8, 920, 1490] };
export function unfold(stage, point, robot) {
  const [a, b, c, d] = STAGES[stage];
  return [c + ((point[0] - a) / (b - a)) * (d - c), (point[1] - CY[robot]) * 50];
}
export function worldXY(stage, point, robot) {
  const p = mapPoint(unfold(stage, point, robot), ROBOTS.indexOf(robot));
  return [p.x, -p.z];
}
export function anchor(stage, x, localY, id) {
  return unfold(stage, [x, CY[ROBOTS[id]] + localY], ROBOTS[id]);
}
export function poseFor(r) {
  const key = r.route_key || `s1_${r.opening}`;
  const route = routeFor(r.robot_id, key);
  if (route.stage_id !== r.stage_id) throw Error('路线段与硬件状态不一致');
  // Never extrapolate. In-place turns stay at the shared display handoff anchor.
  const s = ['TURNING', 'READY', 'PARKED'].includes(r.phase) ? route.length_cm : r.s_cm;
  const p = sample(route, s);
  const q = unfold(r.stage_id, [p.x_cm, p.y_cm], r.robot_id);
  const theta = (p.heading_deg * Math.PI) / 180;
  const [a, b, c, d] = STAGES[r.stage_id];
  const angle = Math.atan2(Math.sin(theta) * 50, (Math.cos(theta) * (d - c)) / (b - a));
  return { x: q[0], y: q[1], angle, stage: r.stage_id, route: key, s_cm: s };
}
export function selectedRoutes(r, state) {
  const first = `s1_${r.opening}${r.rock?.stage_id === 1 ? '_rock' : ''}`;
  let final = state.locked ? (r.final === 'safe' ? 'safe' : state.aftershock || 'stable') : null;
  if (final) final = `s3_${final}${r.rock?.stage_id === 3 ? '_rock' : ''}`;
  return [first, 's2', final].filter(Boolean);
}
export function toView(state) {
  if (state.map_revision !== MAP_REVISION) throw Error('地图版本不匹配，请刷新并核对服务');
  return {
    physical: true,
    match: state.match_id,
    time: state.elapsed_ms / 1000,
    status: state.status === 'idle' ? 'ready' : state.status,
    quake: state.quake_ms === null ? null : state.quake_ms / 1000,
    aftershock: state.aftershock,
    winner: state.winner,
    players: state.robots.map((r) => {
      const id = ROBOTS.indexOf(r.robot_id);
      let rock = null;
      if (r.rock) {
        // The physical rock is offset from the centerline and blocks its swept envelope.
        // Show its obstruction on the corresponding DIRECT display-road centerline.
        const key = r.rock.stage_id === 1 ? `s1_${r.opening}` : 's3_stable';
        const direct = routeFor(r.robot_id, key);
        const s = project(direct, { x_cm: r.rock.center_cm[0], y_cm: r.rock.center_cm[1] }).s_cm;
        const p = sample(direct, s);
        rock = {
          at: r.rock.armed_at_ms / 1000,
          done: r.rock.done,
          target: unfold(r.rock.stage_id, [p.x_cm, p.y_cm], r.robot_id),
          stage: r.rock.stage_id,
        };
      }
      return {
        id,
        position: poseFor(r),
        distance:
          (r.s_cm +
            (r.stage_id > 1
              ? routeFor(r.robot_id, `s1_${r.opening}${r.rock?.stage_id === 1 ? '_rock' : ''}`)
                  .length_cm
              : 0) +
            (r.stage_id > 2 ? routeFor(r.robot_id, 's2').length_cm : 0)) *
          16,
        beacon: r.beacon,
        gate: r.gate,
        arrived: r.finished_ms,
        opening: r.opening,
        final: r.final,
        detours: [],
        rock,
        selected: selectedRoutes(r, state),
        stage: r.stage_id,
        phase: r.phase,
        valid: r.pose.valid,
        source: r.robot_id,
      };
    }),
  };
}
// Split collinear lines at all shared endpoints so overlapping route variants produce
// one surface, rather than coplanar meshes. Membership controls only presentation.
export function roadNetwork() {
  const all = manifest().routes;
  const records = new Map();
  for (const r of all)
    for (const seg of r.segments) {
      let points;
      if (seg.kind === 'arc')
        points = Array.from({ length: 17 }, (_, i) => {
          const a = seg.start_rad + (seg.sweep_rad * i) / 16;
          return [seg.center[0] + Math.cos(a), seg.center[1] + Math.sin(a)];
        });
      else points = [seg.from, seg.to];
      let pieces = [points];
      if (seg.kind === 'line') {
        const dx = seg.to[0] - seg.from[0],
          dy = seg.to[1] - seg.from[1],
          l2 = dx * dx + dy * dy;
        const ts = [0, 1];
        for (const other of all.filter(
          (v) => v.robot_id === r.robot_id && v.stage_id === r.stage_id,
        ))
          for (const a of other.segments)
            for (const p of [a.from, a.to]) {
              const t = ((p[0] - seg.from[0]) * dx + (p[1] - seg.from[1]) * dy) / l2;
              if (
                t > 1e-8 &&
                t < 1 - 1e-8 &&
                Math.abs((p[0] - seg.from[0]) * dy - (p[1] - seg.from[1]) * dx) < 1e-7
              )
                ts.push(t);
            }
        const sorted = [...new Set(ts.map((t) => +t.toFixed(9)))].sort((a, b) => a - b);
        pieces = sorted
          .slice(1)
          .map((t, i) => [sorted[i], t].map((v) => [seg.from[0] + v * dx, seg.from[1] + v * dy]));
      }
      for (const piece of pieces) {
        const key = JSON.stringify([
          r.robot_id,
          r.stage_id,
          piece.map((p) => p.map((v) => +v.toFixed(5))),
        ]);
        if (!records.has(key))
          records.set(key, {
            id: key,
            player_id: ROBOTS.indexOf(r.robot_id),
            stage: r.stage_id,
            points_xy: piece.map((p) => worldXY(r.stage_id, p, r.robot_id)),
            routes: [],
          });
        const rec = records.get(key);
        if (!rec.routes.includes(r.key)) rec.routes.push(r.key);
      }
    }
  return [...records.values()];
}
export function roadState(edge, player, state) {
  const on = edge.routes.some((k) => player.selected.includes(k));
  const collapseOnly = edge.routes.every((k) => k.startsWith('s3_collapse'));
  const stableOnly = edge.routes.every((k) => k.startsWith('s3_stable'));
  return {
    on,
    visible:
      !(collapseOnly && state.aftershock !== 'collapse') &&
      !(stableOnly && state.aftershock === 'collapse' && player.final === 'risk'),
  };
}

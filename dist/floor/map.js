import { BOARD, CY, ROBOTS, routeFor } from '../sandbox/geometry.js';
export { BOARD, CY, ROBOTS };
export function toPixel(x, y, width, height) {
  return [(x / BOARD.width_cm) * width, (y / BOARD.height_cm) * height];
}
export function variants(r, s) {
  if (s.endpoint_only) return ['s' + r.stage_id + '_ab'];
  if (r.stage_id === 2) return ['s2'];
  if (r.stage_id === 1)
    return ['s1_beacon', 's1_outer', ...(r.rock?.stage_id === 1 ? [`s1_${r.opening}_rock`] : [])];
  const suffix = r.rock?.stage_id === 3 ? '_rock' : '';
  return [
    's3_safe' + suffix,
    's3_stable' + suffix,
    ...(s.aftershock === 'collapse' ? ['s3_collapse' + suffix] : []),
  ];
}
export function currentRoute(r) {
  return routeFor(r.robot_id, r.route_key || r.preview_route || `s1_${r.opening}`);
}
export function plateCrop(stage, robot, width, height) {
  return {
    file: `stage-${stage}.png`,
    source: [0, (ROBOTS.indexOf(robot) * height) / 2, width, height / 2],
    destination_cm: [0, CY[robot] - 8.4, 59.8, 16.8],
  };
}

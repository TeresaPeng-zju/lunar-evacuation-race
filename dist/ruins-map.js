// Phase 02 authoring transform. Rendering only: no race decisions or hardware cm here.
export const smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function baseElevation(y) {
  const ys = [-80, -50, -34, -12, 5, 25, 42, 56.5, 76, 120],
    zs = [0.6, 0.9, 1.4, 2.2, 3.5, 5, 4.4, 5.6, 7.2, 7.2];
  if (y <= ys[0]) return zs[0];
  for (let i = 1; i < ys.length; i++)
    if (y <= ys[i])
      return zs[i - 1] + ((zs[i] - zs[i - 1]) * (y - ys[i - 1])) / (ys[i] - ys[i - 1]);
  return zs.at(-1);
}
export function elevation(x, y) {
  let z = baseElevation(y);
  for (const cx of [-32, 32]) {
    const w = 1 - smooth((Math.hypot(x - cx, y - 56.5) - 4.3) / 3);
    z = z * (1 - w) + 6.56 * w;
  }
  return z;
}
export function mapPoint(point, id, offset = 0.08) {
  const x = (id === 0 ? -1 : 1) * (32 + point[1] * 0.075),
    north = point[0] * 0.075 - 55.25;
  return { x, y: elevation(x, north) + offset, z: -north };
}
export function heading(angle, id) {
  return Math.PI / 2 + (id === 0 ? angle : -angle);
}
export function routeActive(player, key, kind, race) {
  if (race.status === 'ready') return false;
  if (kind === 'rock_detour')
    return (player.rock?.edge === key && !player.rock.done) || player.detours.includes(key);
  if (player.rock?.edge === key && !player.rock.done) return false;
  if (key === 'start' || key === 'common') return true;
  if (key.startsWith('beacon')) return player.opening === 'beacon';
  if (key.startsWith('outer')) return player.opening === 'outer';
  if (key.startsWith('safe')) return player.final === 'safe';
  if (key === 'collapse' || key === 'stable')
    return player.final === 'risk' && race.aftershock === key;
  return player.final === 'risk';
}

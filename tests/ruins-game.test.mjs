import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Race, ROUTES, bypass } from '../dist/engine.js';
import { mapPoint, elevation, heading, routeActive } from '../dist/ruins-map.js';
const map = JSON.parse(
  readFileSync(new URL('../dist/assets/ruins-game/map.json', import.meta.url)),
);
const raw = readFileSync(new URL('../dist/assets/ruins-game/interactive.glb', import.meta.url));
const gltf = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('runtime GLB and map retain all original V2.0 edges and source hash', () => {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../dist/engine.js', import.meta.url)))
      .digest('hex'),
    map.source_engine_sha256,
  );
  const nodes = gltf.nodes.filter((n) => n.extras?.logical_edge_id);
  assert.equal(nodes.length, 40);
  for (const lane of map.lanes)
    for (const e of lane.edges) {
      const n = nodes.find((n) => n.extras.logical_edge_id === e.id);
      assert.ok(n && Number.isInteger(n.mesh));
      assert.deepEqual(
        e.source_points,
        e.kind === 'rock_detour' ? bypass(ROUTES[e.key]) : ROUTES[e.key].points,
      );
      for (let i = 0; i < e.source_points.length; i++) {
        const p = mapPoint(e.source_points[i], lane.player === 'blue' ? 0 : 1, 0);
        near(p.x, e.points_xy[i][0]);
        near(p.z, -e.points_xy[i][1]);
      }
    }
});
test('the same source waypoint always maps to one road height across branch joins', () => {
  for (const lane of map.lanes) {
    const seen = new Map();
    for (const e of lane.edges) {
      for (const p of [e.source_points[0], e.source_points.at(-1)]) {
        const v = mapPoint(p, lane.player === 'blue' ? 0 : 1);
        if (seen.has(JSON.stringify(p))) assert.deepEqual(v, seen.get(JSON.stringify(p)));
        seen.set(JSON.stringify(p), v);
      }
    }
  }
  near(mapPoint([1490, 0], 0).y, 6.64);
  near(mapPoint([1490, 0], 1).y, 6.64);
});
test('rover +X heading follows the mirrored Blender to glTF transform', () => {
  for (const id of [0, 1])
    for (const a of [0, Math.PI / 4, -Math.PI / 2, Math.PI]) {
      const p = mapPoint([700, 0], id),
        q = mapPoint([700 + Math.cos(a), Math.sin(a)], id),
        len = Math.hypot(q.x - p.x, q.z - p.z),
        rot = heading(a, id);
      near(Math.cos(rot), (q.x - p.x) / len);
      near(-Math.sin(rot), (q.z - p.z) / len);
    }
});
test('selected final route is not visually disclosed until shared selection lock', () => {
  const r = new Race();
  r.chooseOpening(0, 'beacon');
  r.chooseOpening(1, 'outer');
  r.start();
  while (r.quake === null) r.step(0.1);
  r.chooseFinal(0, 'risk');
  assert.equal(routeActive(r.players[0], 'riskIn', 'main', r), false);
  r.chooseFinal(1, 'safe');
  assert.equal(routeActive(r.players[0], 'riskIn', 'main', r), true);
  assert.equal(routeActive(r.players[1], 'safeIn', 'main', r), true);
});
test('rock detours and aftershock roads are state driven, and reset clears them', () => {
  const r = new Race({ random: () => 0.1 });
  r.chooseOpening(0, 'beacon');
  r.chooseOpening(1, 'beacon');
  r.start();
  r.attack(1);
  assert.equal(routeActive(r.players[0], 'beaconRock', 'rock_detour', r), true);
  assert.equal(routeActive(r.players[0], 'beaconRock', 'main', r), false);
  while (r.aftershock === null) {
    if (r.quake !== null && !r.locked) {
      r.chooseFinal(0, 'risk');
      r.chooseFinal(1, 'risk');
    }
    r.step(0.1);
  }
  assert.equal(routeActive(r.players[0], 'collapse', 'collapse_detour', r), true);
  assert.equal(routeActive(r.players[0], 'stable', 'stable', r), false);
  r.reset();
  assert.equal(routeActive(r.players[0], 'collapse', 'collapse_detour', r), false);
});
test('geometry heights remain finite through the complete traversable detours', () => {
  for (const lane of map.lanes)
    for (const e of lane.edges)
      for (const p of e.points_xy) assert.ok(Number.isFinite(elevation(...p)));
});

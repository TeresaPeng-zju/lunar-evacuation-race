import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOARD,
  CY,
  ROBOTS,
  toPixel,
  plateCrop,
  variants,
  currentRoute,
} from '../dist/floor/map.js';
import { manifest, routeFor, sample } from '../dist/sandbox/geometry.js';
test('floor art uses exact board mapping with no perspective or world-scale transform', () => {
  for (const [width, height] of [
    [3588, 2016],
    [1920, 1080],
  ]) {
    assert.deepEqual(toPixel(0, 0, width, height), [0, 0]);
    assert.deepEqual(toPixel(BOARD.width_cm, BOARD.height_cm, width, height), [width, height]);
    assert.deepEqual(toPixel(29.9, 16.8, width, height), [width / 2, height / 2]);
    for (const robot of ROBOTS) {
      const r = routeFor(robot, 's3_collapse_rock');
      for (let s = 0; s < r.length_cm; s += 0.2) {
        const p = sample(r, s),
          px = toPixel(p.x_cm, p.y_cm, width, height);
        assert.ok(Math.abs((px[0] / width) * 59.8 - p.x_cm) < 1e-8);
        assert.ok(Math.abs((px[1] / height) * 33.6 - p.y_cm) < 1e-8);
      }
    }
  }
});
test('independent stage plates fill only the matching physical half', () => {
  const blue = plateCrop(1, ROBOTS[0], 3840, 2158),
    gold = plateCrop(3, ROBOTS[1], 3840, 2158);
  assert.equal(blue.file, 'stage-1.png');
  assert.equal(gold.file, 'stage-3.png');
  assert.deepEqual(blue.destination_cm, [0, 0, 59.8, 16.8]);
  assert.deepEqual(gold.destination_cm, [0, 16.799999999999997, 59.8, 16.8]);
  assert.deepEqual(gold.source, [0, 1079, 3840, 1079]);
});
test('baked art export preserves every canonical physical route', () => {
  const baked = JSON.parse(
    readFileSync(new URL('../dist/assets/floor-arena/layout.json', import.meta.url)),
  );
  assert.deepEqual(baked.routes, manifest().routes);
  assert.deepEqual(baked.board, BOARD);
  assert.equal(baked.render.camera, 'orthographic_top');
});
test('floor display respects applied route; future rock cannot alter current stage', () => {
  const r = {
    robot_id: ROBOTS[0],
    stage_id: 2,
    route_key: 's2',
    opening: 'beacon',
    rock: { stage_id: 3 },
    plans: { 3: { key: 's3_collapse_rock', armed: true } },
  };
  assert.deepEqual(variants(r, { aftershock: 'collapse' }), ['s2']);
  assert.equal(currentRoute(r).key, 's2');
  r.stage_id = 3;
  r.route_key = 's3_stable_rock';
  assert.ok(variants(r, { aftershock: 'collapse' }).includes('s3_collapse_rock'));
  assert.equal(currentRoute(r).key, 's3_stable_rock');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../sandbox/engine.mjs';
import { HardwareSimulator } from '../sandbox/simulator.mjs';
import { ROBOTS, CY, routeFor, sample } from '../dist/sandbox/geometry.js';
import { unfold, toView, roadNetwork, poseFor, selectedRoutes } from '../dist/display/map.js';
import { readFileSync } from 'node:fs';
const near = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7, `${a} != ${b}`);
test('both handoffs are continuous; stage two leftward motion advances the panorama', () => {
  for (const id of ROBOTS) {
    near(unfold(1, [53.8, CY[id]], id), unfold(2, [53.8, CY[id]], id));
    near(unfold(2, [16, CY[id]], id), unfold(3, [16, CY[id]], id));
    assert.ok(unfold(2, [20, CY[id]], id)[0] > unfold(2, [50, CY[id]], id)[0]);
  }
});
test('display roads are built from canonical physical analytic paths', () => {
  const exported = JSON.parse(
    readFileSync(new URL('../dist/assets/dual-screen/map.json', import.meta.url)),
  );
  const roads = roadNetwork();
  assert.equal(exported.roads.length, roads.length);
  for (const [index, road] of roads.entries()) {
    const { points_xy: actual, ...metadata } = road;
    const { points_xy: expected, ...exportedMetadata } = exported.roads[index];
    assert.deepEqual(metadata, exportedMetadata);
    assert.equal(actual.length, expected.length);
    actual.forEach((point, i) => near(point, expected[i]));
  }
  for (const r of [routeFor(ROBOTS[0], 's1_beacon'), routeFor(ROBOTS[1], 's3_collapse_rock')]) {
    for (let s = 0; s < r.length_cm; s += 0.1) {
      const p = sample(r, s);
      const mapped = poseFor({
        robot_id: r.robot_id,
        route_key: r.key,
        stage_id: r.stage_id,
        phase: 'RUNNING',
        s_cm: s,
      });
      near([mapped.x, mapped.y], unfold(r.stage_id, [p.x_cm, p.y_cm], r.robot_id));
    }
  }
});
test('secret choices, pending revisions, turns and invalid map versions cannot move presentation ahead', () => {
  const game = new Sandbox();
  const s = game.state(),
    r = s.robots[0];
  assert.equal(
    toView(s).players[0].selected.some((k) => k.startsWith('s3')),
    false,
  );
  r.submitted = true;
  assert.equal(toView(s).players[0].final, null);
  r.plans[1] = { key: 's1_beacon_rock', armed: true, revision: 2 };
  assert.equal(toView(s).players[0].position.route, 's1_beacon');
  r.route_key = 's1_beacon';
  r.phase = 'TURNING';
  near([toView(s).players[0].position.x, toView(s).players[0].position.y], [700, 0]);
  assert.throws(() => toView({ ...s, map_revision: 'bad' }), /地图版本/);
});
for (const outcome of ['stable', 'collapse'])
  test(`shared authority complete match: ${outcome}, opening rock + reserved stage-three rock`, () => {
    const queue = [];
    let sim;
    const game = new Sandbox({ send: (m) => queue.push(() => sim.receive(m)) });
    sim = new HardwareSimulator((m) => queue.push(() => game.receive(m)));
    const flush = () => {
      let guard = 0;
      while (queue.length) {
        assert.ok(guard++ < 5000);
        queue.shift()();
      }
    };
    game.connect();
    flush();
    game.configure();
    flush();
    game.forcedAftershock = outcome;
    game.chooseOpening(ROBOTS[0], 'beacon');
    game.chooseOpening(ROBOTS[1], 'outer');
    game.start();
    flush();
    let first = false,
      second = false,
      last = null,
      maxStep = 0,
      turned = false,
      independent = false,
      finished = false;
    for (let t = 0; t < 120000 && game.status !== 'finished'; t += 20) {
      if (!first && game.elapsed > 1000 && game.legalRock(ROBOTS[1])) {
        game.attack(ROBOTS[1]);
        flush();
        first = true;
      }
      if (game.quake !== null && !game.locked) {
        game.chooseFinal(ROBOTS[0], 'risk');
        game.chooseFinal(ROBOTS[1], 'risk');
        flush();
      }
      if (first && !second && game.locked && game.legalRock(ROBOTS[0])?.stage === 3) {
        game.attack(ROBOTS[0]);
        flush();
        second = true;
      }
      game.tick(20);
      flush();
      sim.tick(20);
      flush();
      assert.notEqual(game.status, 'paused', game.fault);
      const state = game.state(),
        view = toView(state);
      independent ||= state.robots[0].stage_id !== state.robots[1].stage_id;
      turned ||= state.robots.some((r) => r.phase === 'TURNING');
      finished ||= state.robots.some((r) => r.finished_ms !== null && !r.parked);
      for (const p of view.players) {
        if (last) {
          const q = last.players[p.id];
          maxStep = Math.max(
            maxStep,
            Math.hypot(p.position.x - q.position.x, p.position.y - q.position.y),
          );
        }
        assert.equal(p.arrived, state.robots[p.id].finished_ms);
        if (state.robots[p.id].rock?.stage_id === 3)
          assert.ok(
            selectedRoutes(state.robots[p.id], state).some(
              (k) => k.startsWith('s3_') && k.endsWith('_rock'),
            ),
          );
      }
      last = view;
    }
    assert.equal(game.status, 'finished');
    assert.equal(game.aftershock, outcome);
    assert.ok(first && second && turned && independent && finished);
    assert.ok(maxStep <= 8.01, `display exceeded one validated 80 ms pose interval: ${maxStep}`);
    assert.ok(game.state().robots.every((r) => r.parked));
    const before = structuredClone(toView(game.state()));
    assert.deepEqual(toView(game.state()), before); // Rendering never advances the state.
  });

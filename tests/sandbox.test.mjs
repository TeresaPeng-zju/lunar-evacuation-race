import test from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../sandbox/engine.mjs';
import { HardwareSimulator } from '../sandbox/simulator.mjs';
import {
  manifest,
  routeFor,
  sample,
  ROBOTS,
  ENVELOPE,
  CY,
  rockSite,
  angleDiff,
} from '../dist/sandbox/geometry.js';

function rig() {
  const queue = [];
  let sim;
  const game = new Sandbox({ send: (m) => queue.push(() => sim.receive(m)) });
  sim = new HardwareSimulator((m) => queue.push(() => game.receive(m)));
  const flush = () => {
    let n = 0;
    while (queue.length) {
      assert.ok(n++ < 5000);
      queue.shift()();
    }
  };
  const step = (ms = 20) => {
    for (let t = 0; t < ms; t += 20) {
      game.tick(20);
      flush();
      sim.tick(20);
      flush();
    }
  };
  game.connect();
  flush();
  game.configure();
  flush();
  return {
    game,
    sim,
    flush,
    step,
    start() {
      game.start();
      flush();
      step(120);
    },
  };
}
function complete(
  r,
  { opening = ['beacon', 'outer'], final = ['risk', 'safe'], result = 'stable', rock = null } = {},
) {
  r.game.forcedAftershock = result;
  ROBOTS.forEach((id, i) => r.game.chooseOpening(id, opening[i]));
  r.start();
  let attacked = false;
  for (let i = 0; i < 5500 && r.game.status !== 'finished'; i++) {
    if (r.game.quake !== null && !r.game.locked) {
      ROBOTS.forEach((id, j) => r.game.chooseFinal(id, final[j]));
      r.flush();
    }
    if (
      rock &&
      !attacked &&
      ((rock === 's1' && r.game.elapsed > 1000) ||
        (rock === 's3' && r.game.locked && r.game.robots['rover-gold'].stage_id === 2))
    ) {
      if (r.game.legalRock('rover-blue')) {
        r.game.attack('rover-blue');
        r.flush();
        attacked = true;
      }
    }
    r.step();
    assert.notEqual(
      r.game.status,
      'paused',
      `${r.game.fault}\n${JSON.stringify(r.game.log.slice(0, 8))}`,
    );
  }
  assert.equal(r.game.status, 'finished');
  if (rock) assert.ok(attacked);
}

test('canonical geometry matches v0.3 lengths, lane clearance and rock clearance', () => {
  const expected = {
    s1_beacon: 52.0832,
    s1_beacon_rock: 62.3664,
    s1_outer: 56.3664,
    s1_outer_rock: 60.6496,
    s2: 37.8,
    s3_stable: 37.8,
    s3_stable_rock: 42.0832,
    s3_safe: 47.2248,
    s3_safe_rock: 51.508,
    s3_collapse: 52.3664,
    s3_collapse_rock: 56.6496,
  };
  for (const route of manifest().routes) {
    assert.ok(Math.abs(route.length_cm - expected[route.key]) < 0.001);
    for (let s = 0; s <= route.length_cm; s += 0.02) {
      const p = sample(route, s),
        cy = CY[route.robot_id];
      assert.ok(Math.min(p.x_cm, 59.8 - p.x_cm, p.y_cm - (cy - 8.4), cy + 8.4 - p.y_cm) > ENVELOPE);
      if (route.key.endsWith('_rock')) {
        const site = rockSite(
          route.stage_id,
          route.key.includes('beacon') ? 'beacon' : 'outer',
          route.robot_id,
        );
        assert.ok(
          Math.hypot(p.x_cm - site.center_cm[0], p.y_cm - site.center_cm[1]) - ENVELOPE - 0.5 >
            0.45,
        );
      }
    }
  }
});
test('full physical race: independent handoffs, beacon, source, finish then parking', () => {
  const r = rig();
  complete(r);
  assert.ok(r.game.robots['rover-blue'].beacon);
  assert.ok(r.game.robots['rover-gold'].parked);
  assert.equal(r.game.aftershock, 'stable');
  assert.ok(r.game.log.some((e) => e.type === 'turn'));
  assert.ok(r.game.robots['rover-blue'].finish_elapsed_ms < r.game.elapsed);
});
for (const opening of ['beacon', 'outer'])
  for (const final of ['safe', 'risk'])
    for (const result of final === 'safe' ? ['stable'] : ['stable', 'collapse'])
      for (const rock of [null, 's1', 's3']) {
        test(`end-to-end ${opening} / ${final} / ${result} / ${rock || 'no rock'}`, () => {
          const r = rig();
          complete(r, { opening: ['beacon', opening], final: ['safe', final], result, rock });
          const target = r.game.robots['rover-gold'];
          assert.equal(target.stage_id, 3);
          assert.ok(target.finish_elapsed_ms > 60000 && target.finish_elapsed_ms < 90000);
          if (rock) {
            assert.equal(r.game.robots['rover-blue'].card, false);
            assert.equal(target.rock.done, true);
            assert.ok(target.route_key.endsWith('_rock') || rock === 's1');
          }
        });
      }
test('secret choices stay hidden and timeout locks default safe', () => {
  const r = rig();
  r.start();
  while (r.game.quake === null) r.step();
  r.game.chooseFinal('rover-blue', 'risk');
  assert.equal(r.game.state().robots[0].secret, undefined);
  assert.equal(r.game.state().robots[0].final, null);
  r.step(7020);
  assert.equal(r.game.robots['rover-gold'].final, 'safe');
  assert.throws(() => r.game.chooseFinal('rover-blue', 'safe'));
});
test('late rock and rejected prepare never consume card', () => {
  const r = rig();
  r.start();
  r.sim.faults.reject_next_route = true;
  r.game.attack('rover-blue');
  r.flush();
  assert.equal(r.game.robots['rover-blue'].card, true);
  assert.equal(r.game.robots['rover-blue'].card_pending, false);
  r.step(14000);
  assert.throws(() => r.game.attack('rover-blue'));
  assert.equal(r.game.robots['rover-blue'].card, true);
});
test('lost pose pauses both clocks; snapshot and explicit resume are required', () => {
  const r = rig();
  r.start();
  r.step(1000);
  r.sim.faults.drop_pose = true;
  r.step(300);
  assert.equal(r.game.status, 'paused');
  const t = r.game.elapsed,
    x = r.sim.robots['rover-gold'].pose.x_cm;
  r.step(2000);
  assert.equal(r.game.elapsed, t);
  assert.equal(r.sim.robots['rover-gold'].pose.x_cm, x);
  assert.throws(() => r.game.resume());
  r.sim.faults = {};
  r.step(100);
  r.game.query();
  r.flush();
  assert.equal(r.game.snapshotOK, true);
  r.game.resume();
  r.flush();
  r.step(200);
  assert.equal(r.game.status, 'running');
});
test('unknown prepare outcome pauses without spending card', () => {
  const r = rig();
  r.start();
  r.sim.faults.drop_results = true;
  r.game.attack('rover-blue');
  r.flush();
  r.step(1300);
  assert.equal(r.game.status, 'paused');
  assert.equal(r.game.robots['rover-blue'].card, true);
});
test('stale sessions, duplicate frames and invalid stage cannot trigger events', () => {
  const r = rig();
  r.start();
  const before = r.game.elapsed;
  const old = r.game.wire.find((x) => x.type === 'pose.frame');
  assert.equal(r.game.receive({ ...old, session_id: 'old', seq: 999999 }), false);
  r.sim.robots['rover-blue'].revision = 999;
  r.step(60);
  assert.equal(r.game.status, 'paused');
  assert.match(r.game.fault, /版本/);
  assert.equal(r.game.winner, null);
  assert.ok(r.game.elapsed >= before);
});
test('same command ID with changed content is rejected by adapter', () => {
  const r = rig(),
    cmd = r.game.wire.find((m) => m.type === 'map.configure');
  const seq = r.sim.lastSeq + 1;
  r.sim.receive({ ...cmd, seq, payload: { ...cmd.payload, map_revision: 'bad' } });
  r.flush();
  assert.ok(r.game.wire.some((m) => m.payload.reason === 'COMMAND_ID_CONTENT_MISMATCH'));
});
test('hardware actuators require verified matching calibration', () => {
  const r = rig();
  r.game.hello.actuators_enabled = true;
  assert.throws(() => r.game.start(), /标定未验证/);
});
test('shared aftershock is drawn once for both risk users', () => {
  const r = rig();
  complete(r, { final: ['risk', 'risk'], result: 'collapse', rock: 's3' });
  assert.equal(r.game.log.filter((e) => e.type === 'aftershock').length, 1);
  assert.ok(ROBOTS.every((id) => r.game.robots[id].route_key.includes('collapse')));
});
test('card presence deduplicates across new event IDs', () => {
  const r = rig();
  r.start();
  const card = {
    robot_id: 'rover-blue',
    card_id: 'rock',
    event_id: 'e1',
    presence_id: 'p1',
    captured_mono_ms: r.sim.now,
  };
  r.sim.emit('card.detected', card);
  r.flush();
  r.sim.emit('card.detected', { ...card, event_id: 'e2' });
  r.flush();
  assert.equal(r.game.log.filter((e) => e.type === 'rock').length, 1);
  assert.equal(r.game.robots['rover-blue'].card, false);
  assert.ok(
    r.game.wire.some((m) => m.type === 'card.result' && m.payload.reason === 'DUPLICATE_PRESENCE'),
  );
});
test('body must completely cross merge before rock clears', () => {
  const r = rig();
  r.start();
  r.game.attack('rover-blue');
  r.flush();
  let seenAtMerge = false;
  for (let i = 0; i < 2000 && !seenAtMerge; i++) {
    r.step();
    const q = r.game.robots['rover-gold'];
    if (q.pose.x_cm >= 47 && q.pose.x_cm < 52 && q.route_key === 's1_beacon_rock') {
      seenAtMerge = true;
      assert.equal(q.rock.done, false);
    }
  }
  assert.ok(seenAtMerge);
});
test('missing turn completion times out instead of silently switching maps', () => {
  const r = rig(),
    status = r.sim.status.bind(r.sim);
  r.sim.status = (robot, state) => {
    if (state !== 'READY') status(robot, state);
  };
  r.start();
  for (let i = 0; i < 2000 && r.game.status === 'running'; i++) r.step();
  assert.equal(r.game.status, 'paused');
  assert.match(r.game.fault, /回转完成/);
  assert.equal(r.game.robots['rover-blue'].stage_id, 1);
});
test('floor coordinate does not win on stage two, and fully equal routes tie', () => {
  const r = rig();
  complete(r, { opening: ['beacon', 'beacon'], final: ['safe', 'safe'] });
  assert.equal(r.game.winner, 'tie');
  assert.ok(r.game.log.filter((e) => e.type === 'finish').every((e) => e.time_ms > 60000));
});
test('pausing during a turn freezes its completion timeout', () => {
  const r = rig();
  r.start();
  while (r.game.robots['rover-blue'].phase !== 'TURNING') r.step();
  r.game.pause();
  r.flush();
  r.step(10000);
  r.game.query();
  r.flush();
  r.game.resume();
  r.flush();
  r.step(1800);
  assert.equal(r.game.status, 'running');
  assert.equal(r.game.robots['rover-blue'].stage_id, 2);
});

test('pause before the scheduled start never releases the cars; stop and reset are required', () => {
  const r = rig();
  r.game.start();
  r.flush();
  assert.equal(r.game.status, 'starting');
  assert.ok(r.sim.startCommand);
  r.game.pause();
  r.flush();
  r.step(2000);
  assert.equal(r.sim.running, false);
  assert.ok(ROBOTS.every((id) => r.sim.robots[id].pose.x_cm === 6 && r.sim.robots[id].stopped));
  assert.equal(r.game.elapsed, 0);
  r.game.query();
  r.flush();
  assert.throws(() => r.game.resume(), /未知/);
  r.game.stop();
  r.flush();
  assert.equal(r.game.status, 'stopped');
  assert.equal(r.sim.startCommand, null);
});

test('invalid stop receipt stays pending until both cars confirm stopped', () => {
  const r = rig();
  r.start();
  r.game.stop();
  const [id, command] = [...r.game.commands].find(([, c]) => c.type === 'robot.stop');
  assert.throws(
    () =>
      r.game.result({
        command_id: id,
        status: 'completed',
        robots: [{ robot_id: ROBOTS[0], stopped_confirmed: true }],
      }),
    /停稳/,
  );
  assert.equal(command.status, 'sent');
  assert.equal(r.game.status, 'stopping');
  r.flush();
  assert.equal(r.game.status, 'stopped');
});

test('a late resume receipt cannot undo an operator stop', () => {
  const r = rig();
  r.start();
  r.game.pause();
  r.flush();
  r.game.query();
  r.flush();
  r.game.resume();
  r.game.stop();
  r.flush();
  assert.equal(r.game.status, 'stopped');
  assert.ok(r.sim.paused);
  assert.equal(r.sim.running, false);
  assert.ok(r.game.log.some((event) => event.text === '过期恢复回执'));
});

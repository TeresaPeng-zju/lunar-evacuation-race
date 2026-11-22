import test from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../sandbox/engine.mjs';
import { DualExecutor } from '../hardware/executor/executor.mjs';
import { SimulatedIO } from '../hardware/executor/simulated-io.mjs';

function setup() {
  const q = [],
    io = new SimulatedIO(),
    events = [];
  const game = new Sandbox({ mode: 'hardware', send: (m) => q.push(() => driver.receive(m)) });
  const driver = new DualExecutor((m) => {
    if (m.type === 'robot.status') events.push(m.payload);
    q.push(() => game.receive(m));
  }, io);
  const flush = () => {
    while (q.length) q.shift()();
  };
  const tick = () => {
    game.tick(20);
    flush();
    driver.tick(20);
    flush();
  };
  game.connect();
  flush();
  game.configure();
  flush();
  tick();
  game.chooseOpening('rover-gold', 'outer');
  game.start();
  flush();
  return { game, driver, io, events, tick };
}
test('external executor follows independent routes, waits for measured turns and parking', () => {
  const { game, driver, events, tick } = setup();
  let rock = false;
  for (let i = 0; i < 9000 && game.status !== 'finished'; i++) {
    tick();
    if (game.status === 'paused')
      assert.fail(game.fault + ' ' + JSON.stringify(game.log.slice(0, 4)));
    if (!rock && game.legalRock('rover-blue')) {
      game.attack('rover-blue');
      rock = true;
    }
    if (game.quake !== null && !game.locked) {
      for (const id of Object.keys(driver.robots))
        game.chooseFinal(id, id === 'rover-blue' ? 'risk' : 'safe');
    }
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.winner);
  assert.ok(rock);
  for (const id of Object.keys(driver.robots)) {
    assert.deepEqual(
      events.filter((e) => e.robot_id === id).map((e) => e.state),
      ['TURNING', 'READY', 'TURNING', 'READY', 'PARKED'],
    );
    assert.equal(game.robots[id].pose.stopped_confirmed, true);
  }
});
test('missing vehicle measurement stops both drives', () => {
  const { game, io, tick } = setup();
  for (let i = 0; i < 50; i++) tick();
  const read = io.read.bind(io);
  io.read = () => ({ ...read(), poses: { 'rover-blue': io.vehicles['rover-blue'] } });
  tick();
  assert.equal(game.status, 'paused');
  for (const r of Object.values(io.vehicles)) assert.deepEqual([r.v, r.w], [0, 0]);
});

test('real IO formats separate UDP commands and reads both firmware status endpoints using mock transports', async () => {
  const { RoverIO, validateProfile } = await import('../hardware/executor/rover-io.mjs');
  const { readFile } = await import('node:fs/promises');
  const cfg = JSON.parse(
    await readFile(new URL('../config/dual-executor.example.json', import.meta.url)),
  );
  assert.throws(() => validateProfile(cfg));
  Object.assign(cfg, {
    parameters_verified: true,
    calibration_id: 'fixture',
    combined_error_cm: 0.2,
    braking_distance_cm: 0.3,
    tie_ms: 120,
  });
  for (const r of Object.values(cfg.vehicles))
    Object.assign(r, {
      heading_offset_deg: 0,
      forward_mm: 0,
      right_mm: 0,
      track_cm: 4,
      left_pct_per_cm_s: 15,
      right_pct_per_cm_s: 16,
      max_power: 60,
    });
  const packets = [],
    requests = [];
  const marker = (id, x, y) => ({
    label: 'ID ' + id + ' · 36h11',
    points: [
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x + 1, y + 1],
      [x - 1, y + 1],
    ],
  });
  const items = [
    marker(4, 0, 0),
    marker(5, 747, 0),
    marker(7, 747, 337),
    marker(6, 0, 337),
    marker(0, 134.5, 84.5),
    marker(1, 134.5, 252.5),
  ];
  let stamp = 0;
  const io = new RoverIO(cfg, {
    socket: {
      on() {},
      send(...a) {
        packets.push(a);
      },
      close() {},
    },
    request: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () =>
          url.endsWith('/status') ? { L: 0, R: 0 } : { items, age: 5, stamp: ++stamp },
      };
    },
  });
  try {
    io.drive('rover-blue', 1, 0);
    io.drive('rover-gold', 0, 1);
    assert.deepEqual(packets.slice(-2), [
      ['15,16', 8888, '192.168.31.157'],
      ['30,-32', 8888, '192.168.31.127'],
    ]);
    io.drive('rover-blue', 0, 0);
    io.drive('rover-gold', 0, 0);
    for (let i = 0; i < 60 && !io.read()?.poses['rover-blue']?.stopped; i++)
      await new Promise((r) => setTimeout(r, 10));
    for (const [id, r] of Object.entries(cfg.vehicles)) {
      assert.ok(requests.includes('http://' + r.ip + '/status'));
      assert.ok(io.read().poses[id].stopped);
      assert.ok(Math.abs(io.read().poses[id].pose.x_cm - 6) < 1e-6);
    }
  } finally {
    io.close();
  }
  assert.deepEqual(
    packets.slice(-2).map((p) => p[0]),
    ['0,0', '0,0'],
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPhoneGateway, resolveCard } from '../sandbox/phone-gateway.mjs';
import { Sandbox } from '../sandbox/engine.mjs';
import { HardwareSimulator } from '../sandbox/simulator.mjs';

test('phone protocol maps the ten physical cards to game kinds and players', () => {
  for (const side of ['blue', 'gold']) {
    for (const [index, kind] of ['beacon', 'outer', 'risk', 'safe', 'rock'].entries()) {
      const card = resolveCard(side + '-0' + (index + 1));
      assert.equal(card.card_id, kind);
      assert.equal(card.robot_id, 'rover-' + side);
    }
  }
  for (const id of ['yellow-01', 'gold-06', 'blue-1', 'rockfall', 'blue-01\n'])
    assert.equal(resolveCard(id), null);
});

test('HTTP scans are authenticated, idempotent and preserve game rejection', async (t) => {
  let gateway;
  let simulator;
  const queue = [];
  const game = new Sandbox({ send: (m) => {
    gateway?.receive(m);
    queue.push(() => simulator.receive(m));
  } });
  simulator = new HardwareSimulator((m) => queue.push(() => game.receive(m)));
  const drain = () => { while (queue.length) queue.shift()(); };
  game.connect();
  drain();
  gateway = createPhoneGateway({ game, drain, advance() {}, port: 0 });
  await once(gateway.server, 'listening');
  t.after(() => { gateway.server.closeAllConnections(); gateway.server.close(); });
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const request = async (path, method = 'GET', body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await request('/api/card-scans', 'POST', {})).status, 401);
  const token = (await request('/api/phone/connect', 'POST', { name: 'test' })).data.token;
  let count = 0;
  const original = game.card.bind(game);
  game.card = (p) => { count++; original(p); };
  const payload = { match_id: game.match, scan_id: 'scan-1', card_instance_id: 'gold-02' };
  const scan = (p = payload) => request('/api/card-scans', 'POST', p, token);
  assert.equal((await scan()).data.status, 'accepted');
  assert.equal(game.robots['rover-gold'].opening, 'outer');
  assert.equal((await scan()).data.status, 'accepted');
  assert.equal(count, 1);
  assert.equal((await scan({ ...payload, card_instance_id: 'blue-01' })).status, 409);
  assert.equal((await scan({ ...payload, scan_id: 'scan-stale', match_id: 'old' })).status, 409);
  const secret = await scan({ ...payload, scan_id: 'scan-secret', card_instance_id: 'blue-03' });
  assert.equal(secret.data.status, 'rejected');
  assert.match(secret.data.message, /不在秘密选路窗口/);
  assert.equal(secret.data.label, '路线牌');
  const monitor = (await request('/api/phone-monitor')).data;
  assert.equal(monitor.phones[0].name, 'test');
  assert.deepEqual(monitor.latest_accepted.map(s => [s.side, s.label]), [['黄方', '废弃栈道']]);
  const polled = await request('/api/card-scans/scan-1', 'GET', undefined, token);
  assert.equal(polled.data.status, 'accepted');
  game.reset();
  assert.deepEqual((await request('/api/phone-monitor')).data.latest_accepted, []);
  assert.equal((await scan()).data.status, 'accepted');
  assert.equal(count, 2);
});

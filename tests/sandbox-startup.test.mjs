import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { parseOptions } from '../sandbox/options.mjs';

const serverPath = fileURLToPath(new URL('../sandbox/server.mjs', import.meta.url));
const mockPath = fileURLToPath(new URL('../sandbox/mock-client.mjs', import.meta.url));
const profilePath = fileURLToPath(new URL('../config/hardware.example.json', import.meta.url));
const env = { ...process.env };
delete env.SANDBOX_PORT;
delete env.MOONFALL_PROFILE;

async function until(check, message, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(25);
  }
  throw new Error(message);
}
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
function launch(t, file, args) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: tmpdir(), // Asset paths must not depend on the shell's working directory.
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), 2500);
    await exited;
    clearTimeout(kill);
  });
  return { child, output: () => output };
}
async function start(t, args = []) {
  const port = await freePort();
  const process = launch(t, serverPath, ['--port', String(port), ...args]);
  await until(() => {
    if (process.child.exitCode !== null) throw Error(process.output());
    return process.output().includes(`http://127.0.0.1:${port}/`);
  }, 'Server did not announce readiness');
  const base = `http://127.0.0.1:${port}`;
  return { ...process, port, base, state: async () => (await fetch(`${base}/api/state`)).json() };
}
async function connect(t, port, suffix = '/ui') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${suffix}`);
  const messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  t.after(() => ws.terminate());
  return { ws, messages };
}

test('startup options are explicit and backward compatible', () => {
  assert.deepEqual(parseOptions([], {}), {
    help: false,
    port: 4174,
    mode: 'simulation',
    profilePath: null,
    host: '127.0.0.1',
  });
  assert.equal(
    parseOptions(['--hardware'], { SANDBOX_PORT: '4180', MOONFALL_PROFILE: 'local.json' })
      .profilePath,
    'local.json',
  );
  assert.equal(parseOptions(['--port', '4181'], { SANDBOX_PORT: '4180' }).port, 4181);
  for (const value of ['0', '65536', 'abc', '4174.5', '4e3', '']) {
    assert.throws(() => parseOptions(['--port', value], {}), /端口/);
  }
  assert.throws(() => parseOptions(['--profile', 'local.json'], {}), /外部硬件/);
  assert.throws(() => parseOptions(['--hardwar'], {}));
});

test('help and configuration failures exit without opening a service', () => {
  const help = spawnSync(process.execPath, [serverPath, '--help'], {
    env,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /npm start/);
  const missing = spawnSync(
    process.execPath,
    [serverPath, '--hardware', '--profile', '/moonfall-missing-profile.json'],
    { env, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /启动失败/);
});

test(
  'one server serves sandbox, retained 3D pages and the canonical map',
  { timeout: 15000 },
  async (t) => {
    const service = await start(t);
    const home = await fetch(service.base);
    assert.match(await home.text(), /硬件联调沙盒/);
    for (const path of [
      '/index.html',
      '/display.html',
      '/floor.html',
      '/floor/renderer.js',
      '/display/map.js',
      '/library.html',
      '/visual-lab.html',
      '/sandbox.html?floor=1',
      '/shared/rules.js',
    ]) {
      const result = await fetch(service.base + path);
      assert.equal(result.status, 200, path);
      await result.arrayBuffer();
    }
    const map = await (await fetch(service.base + '/api/map')).json();
    assert.equal(map.routes.length, 22);
    assert.equal((await fetch(service.base + '/physical-track.html')).status, 404);
    assert.equal((await fetch(service.base + '/sandbox.html', { method: 'POST' })).status, 405);
    const display = await connect(t, service.port, '/ui?role=display');
    await until(() => display.messages.some((m) => m.type === 'welcome'), 'No display welcome');
    assert.equal(display.messages.find((m) => m.type === 'welcome').controller, false);
    display.ws.send(JSON.stringify({ action: 'configure' }));
    await until(
      () => display.messages.some((m) => m.type === 'action.result' && !m.ok),
      'Display accepted control',
    );
    const control = await connect(t, service.port);
    const floor = await connect(t, service.port, '/ui?role=floor');
    await until(
      () =>
        control.messages.some((m) => m.type === 'welcome') &&
        floor.messages.some((m) => m.type === 'welcome'),
      'No welcome',
    );
    assert.equal(control.messages.find((m) => m.type === 'welcome').controller, true);
    assert.equal(floor.messages.find((m) => m.type === 'welcome').controller, false);
    floor.ws.send(JSON.stringify({ action: 'configure' }));
    await until(
      () => floor.messages.some((m) => m.type === 'action.result' && !m.ok),
      'Floor accepted control',
    );
    control.ws.send(JSON.stringify({ action: 'configure' }));
    await until(async () => (await service.state()).configured, 'Simulation configure failed');
    control.ws.send(JSON.stringify({ action: 'start' }));
    await until(async () => (await service.state()).status === 'running', 'No running race');
    display.ws.close();
    await delay(80);
    assert.equal((await service.state()).status, 'running');
    control.ws.send(JSON.stringify({ action: 'stop' }));
    await until(async () => (await service.state()).status === 'stopped', 'No confirmed stop');
    const duplicate = launch(t, serverPath, ['--port', String(service.port)]);
    await until(() => duplicate.child.exitCode !== null, 'Occupied port left a hanging process');
    assert.equal(duplicate.child.exitCode, 1);
    assert.match(duplicate.output(), /已被占用/);
    assert.match(duplicate.output(), /--port/);
  },
);

test(
  'external mode and independent mock complete handshake, configure and start',
  { timeout: 15000 },
  async (t) => {
    const service = await start(t, ['--hardware', '--profile', profilePath]);
    assert.equal((await service.state()).connected, false);
    launch(t, mockPath, [`ws://127.0.0.1:${service.port}/hardware`]);
    await until(async () => {
      const state = await service.state();
      return state.handshake && state.clock;
    }, 'External hardware handshake failed');
    const control = await connect(t, service.port);
    control.ws.send(JSON.stringify({ action: 'configure' }));
    await until(async () => (await service.state()).configured, 'External configure failed');
    await until(
      async () => (await service.state()).robots.every((r) => r.pose.valid && r.stopped_confirmed),
      'No stopped starting poses',
    );
    control.ws.send(JSON.stringify({ action: 'start' }));
    await until(async () => (await service.state()).status === 'running', 'External start failed');
    await until(
      async () => (await service.state()).robots.every((r) => r.pose.x_cm > 6.1),
      'No actual external movement',
    );
    control.ws.send(JSON.stringify({ action: 'stop' }));
    await until(
      async () => (await service.state()).status === 'stopped',
      'External stop was not confirmed',
    );
  },
);

test(
  'an oversized WebSocket frame closes only its connection and preserves the service',
  { timeout: 15000 },
  async (t) => {
    const service = await start(t);
    const control = await connect(t, service.port);
    control.ws.send(JSON.stringify({ action: 'configure' }));
    await until(async () => (await service.state()).configured, 'No configuration');
    control.ws.send(JSON.stringify({ action: 'start' }));
    await until(async () => (await service.state()).status === 'running', 'No running race');
    const floor = await connect(t, service.port, '/ui?role=floor');
    floor.ws.send('x'.repeat(8 * 1024 * 1024 + 1));
    await until(() => floor.ws.readyState === WebSocket.CLOSED, 'Invalid frame was not rejected');
    await delay(50);
    assert.equal(service.child.exitCode, null, service.output());
    assert.equal(
      (await service.state()).status,
      'running',
      'Read-only client must not interrupt the controller',
    );
    control.ws.send('x'.repeat(8 * 1024 * 1024 + 1));
    await until(
      () => control.ws.readyState === WebSocket.CLOSED,
      'Invalid controller frame was not rejected',
    );
    await until(
      async () => (await service.state()).status === 'paused',
      'Controller loss must pause the race',
    );
    assert.equal(service.child.exitCode, null, service.output());
  },
);

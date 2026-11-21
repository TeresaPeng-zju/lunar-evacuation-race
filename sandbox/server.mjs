import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { Sandbox } from './engine.mjs';
import { createPhoneGateway } from './phone-gateway.mjs';
import { HardwareSimulator } from './simulator.mjs';
import { manifest } from '../dist/sandbox/geometry.js';

import { parseOptions, HELP } from './options.mjs';

let options,
  profile = null;
try {
  options = parseOptions();
  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (options.profilePath) {
    profile = JSON.parse(await readFile(options.profilePath, 'utf8'));
    if (!profile || typeof profile !== 'object' || Array.isArray(profile))
      throw Error('实测配置必须是 JSON 对象');
  }
} catch (error) {
  console.error(`启动失败：${error.message}\n查看帮助：npm start -- --help`);
  process.exit(1);
}
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const { port, host, mode } = options;
let phoneGateway = null;
let hardware = null,
  simulator = null,
  queue = [],
  controller = null,
  speed = 1;
const game = new Sandbox({
  mode,
  profile,
  send: (m) => {
    phoneGateway?.receive(m);
    if (simulator) queue.push(() => simulator.receive(m));
    else if (hardware?.readyState === WebSocket.OPEN) hardware.send(JSON.stringify(m));
  },
});
function setupSimulator() {
  simulator = new HardwareSimulator((m) => queue.push(() => game.receive(m)));
  game.connect();
  drain();
}
function drain() {
  let guard = 0;
  while (queue.length) {
    if (++guard > 2000) throw Error('MESSAGE_LOOP');
    queue.shift()();
  }
}
function json(res, value, status = 200) {
  res
    .writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    .end(JSON.stringify(value));
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === '/api/state') {
      json(res, game.state());
      return;
    }
    if (url.pathname === '/api/map') {
      json(res, manifest());
      return;
    }
    if (url.pathname === '/api/trace') {
      res.setHeader('Content-Disposition', 'attachment; filename="moonfall-session.json"');
      json(res, {
        exported_at: new Date().toISOString(),
        state: game.state(),
        events: game.log,
        messages: game.wire,
      });
      return;
    }
    const path = resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/sandbox.html' : url.pathname),
    );
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url, 'http://localhost').pathname,
    origin = req.headers.origin;
  if (
    !['/ui', '/hardware'].includes(path) ||
    (origin && !['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(origin))
  ) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
});
sockets.on('connection', (ws, req) => {
  // Protocol errors (including oversized frames) are connection failures, not process failures.
  ws.on('error', (error) => {
    if (hardware === ws || controller === ws) {
      advanceExternalClock();
      game.pause(`连接异常：${error.message}`);
      drain();
    }
    ws.terminate();
  });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/hardware') {
    if (mode !== 'hardware' || hardware) {
      ws.close(1008, 'Hardware slot unavailable');
      return;
    }
    hardware = ws;
    advanceExternalClock();
    game.connect();
    ws.on('message', (raw) => {
      try {
        advanceExternalClock();
        game.receive(JSON.parse(raw.toString()));
      } catch {
        game.pause('非法硬件消息');
      }
    });
    ws.on('close', () => {
      hardware = null;
      game.disconnect();
    });
    return;
  }
  ws.isUI = true;
  ws.isController = url.searchParams.get('role') !== 'floor' && !controller;
  if (ws.isController) controller = ws;
  const send = (value) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  };
  send({ type: 'welcome', controller: ws.isController, mode });
  send({ type: 'state', ...game.state(), speed });
  ws.on('message', (raw) => {
    try {
      advanceExternalClock();
      if (!ws.isController) throw Error('当前窗口只读；请使用主控制窗口');
      const m = JSON.parse(raw.toString()),
        p = m.payload || {};
      switch (m.action) {
        case 'configure':
          game.configure();
          break;
        case 'opening':
          game.chooseOpening(p.robot_id, p.choice);
          break;
        case 'start':
          game.start();
          break;
        case 'final':
          game.chooseFinal(p.robot_id, p.choice);
          break;
        case 'rock':
          game.attack(p.robot_id);
          break;
        case 'pause':
          game.pause();
          break;
        case 'query':
          game.query();
          break;
        case 'resume':
          game.resume();
          break;
        case 'stop':
          game.stop();
          break;
        case 'reset':
          if (!['idle', 'finished', 'stopped'].includes(game.status))
            throw Error('重置前须停止并收到停稳回执');
          game.reset();
          if (mode === 'simulation') setupSimulator();
          else if (hardware) {
            game.connect();
          }
          break;
        case 'speed':
          if (!simulator || ![1, 4, 8].includes(p.value)) throw Error('仅内置模拟支持时间加速');
          speed = p.value;
          break;
        case 'aftershock':
          if (
            !simulator ||
            game.status !== 'idle' ||
            !['random', 'stable', 'collapse'].includes(p.value)
          )
            throw Error('只能在内置模拟待机时设置余震');
          game.forcedAftershock = p.value;
          break;
        case 'inject':
          if (!simulator) throw Error('故障注入仅用于模拟器');
          if (p.fault === 'clear') simulator.faults = {};
          else if (
            ['drop_pose', 'invalid_pose', 'reject_next_route', 'drop_results'].includes(p.fault)
          )
            simulator.faults[p.fault] = true;
          else throw Error('未知故障');
          break;
        default:
          throw Error('未知操作');
      }
      drain();
      send({ type: 'action.result', ok: true, action: m.action });
    } catch (e) {
      send({ type: 'action.result', ok: false, error: e.message });
    }
  });
  ws.on('close', () => {
    if (controller === ws) {
      controller = null;
      game.pause('主控制窗口断开，等待工作人员核对');
      drain();
    }
  });
});
let last = performance.now(),
  acc = 0,
  lastBroadcast = 0;
function advanceExternalClock() {
  if (mode !== 'hardware') return;
  const now = performance.now(),
    dt = now - last;
  last = now;
  game.tick(dt);
}
const timer = setInterval(() => {
  const now = performance.now(),
    delta = now - last;
  if (mode === 'simulation') {
    last = now;
    acc += Math.min(delta, 200) * speed;
    let count = 0;
    while (acc >= 20 && count++ < 100) {
      game.tick(20);
      drain();
      simulator.tick(20);
      drain();
      acc -= 20;
    }
  } else {
    advanceExternalClock();
  }
  if (now - lastBroadcast >= 50) {
    lastBroadcast = now;
    const msg = JSON.stringify({ type: 'state', ...game.state(), speed });
    for (const ws of sockets.clients)
      if (ws.isUI && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 500000) ws.send(msg);
  }
}, 20);
if (mode === 'simulation') setupSimulator();
phoneGateway = createPhoneGateway({
  game, drain, advance: advanceExternalClock,
  port: Number(process.env.MOONFALL_PHONE_PORT || (port + 2)),
});
server.on('error', (error) => {
  clearInterval(timer);
  if (error.code === 'EADDRINUSE') {
    console.error(
      `启动失败：端口 ${port} 已被占用。先检查是否已有联调服务，或指定其他端口：\n${mode === 'hardware' ? 'npm run hardware' : 'npm start'} -- --port ${port < 65535 ? port + 1 : 4174}`,
    );
  } else {
    console.error(`启动失败：${error.message}`);
  }
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(`
Moonfall · ${mode === 'hardware' ? '外部硬件模式（等待适配器连接）' : '内置无电机模拟器'}
控制屏   http://${host}:${port}/
行驶屏   http://${host}:${port}/sandbox.html?floor=1
硬件接口 ws://${host}:${port}/hardware${mode === 'hardware' ? '' : '（仅外部模式接收连接）'}
3D 游戏  http://${host}:${port}/index.html
模型库   http://${host}:${port}/library.html
美术样板 http://${host}:${port}/visual-lab.html

${options.profilePath ? `实测配置 ${options.profilePath}（发车前仍须通过握手校验）` : '未载入实测配置。默认模拟参数不能作为实车验收结果。'}
接入说明 docs/hardware-integration.md
Ctrl+C 停止服务
`),
);
function shutdown() {
  phoneGateway?.server.close();
  phoneGateway?.server.closeAllConnections();
  game.stop();
  drain();
  clearInterval(timer);
  for (const ws of sockets.clients) ws.close();
  server.close();
  // A stale browser socket must not keep the local server alive indefinitely.
  const deadline = setTimeout(() => {
    for (const ws of sockets.clients) ws.terminate();
    server.closeAllConnections();
  }, 1500);
  deadline.unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

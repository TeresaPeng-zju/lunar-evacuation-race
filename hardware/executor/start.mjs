import WebSocket from 'ws';
import { readFile } from 'node:fs/promises';
import { DualExecutor } from './executor.mjs';
import { SimulatedIO } from './simulated-io.mjs';
import { RoverIO } from './rover-io.mjs';

const args = process.argv.slice(2);
const live = args[0] === '--live';
if ((live && !args[1]) || args.length > (live ? 3 : 1))
  throw Error('用法：npm run executor -- [--live 实测配置.json] [ws://127.0.0.1:4174/hardware]');
const endpoint = new URL(args[live ? 2 : 0] ?? 'ws://127.0.0.1:4174/hardware');
if (
  endpoint.protocol !== 'ws:' ||
  !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
  endpoint.pathname !== '/hardware'
)
  throw Error('请使用本机游戏的 /hardware 地址');
const io = live ? new RoverIO(JSON.parse(await readFile(args[1], 'utf8'))) : new SimulatedIO();
const socket = new WebSocket(endpoint);
const executor = new DualExecutor((m) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
}, io);
let last = performance.now();
function advance() {
  const now = performance.now();
  executor.tick(now - last);
  last = now;
}
const timer = setInterval(advance, 20);
socket.on('open', () =>
  console.log('双车执行器 · ' + (live ? '实车 UDP' : '模拟电机和定位') + ' · ' + endpoint),
);
socket.on('message', (raw) => {
  try {
    advance();
    executor.receive(JSON.parse(raw));
  } catch (e) {
    console.error(e.message);
    shutdown();
  }
});
socket.on('error', (e) => console.error(e.message));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  executor.stopBoth();
  io.close?.();
  socket.terminate();
}
socket.on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

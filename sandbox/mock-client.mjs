import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';
import { HardwareSimulator } from './simulator.mjs';
const endpoint = process.argv[2] || 'ws://127.0.0.1:4174/hardware';
const ws = new WebSocket(endpoint),
  adapter = new HardwareSimulator((m) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  });
ws.on('open', () => console.log(`External hardware simulator: ${endpoint} (no motors)`));
ws.on('message', (raw) => {
  advance();
  adapter.receive(JSON.parse(raw.toString()));
});
ws.on('error', (e) => console.error(e.message));
let last = performance.now();
function advance() {
  const now = performance.now();
  adapter.tick(now - last);
  last = now;
}
const timer = setInterval(advance, 20);
ws.on('close', () => {
  clearInterval(timer);
  adapter.localFault('DISCONNECTED');
  console.log('Disconnected; stopped. No automatic replay.');
});
process.on('SIGINT', () => ws.close());

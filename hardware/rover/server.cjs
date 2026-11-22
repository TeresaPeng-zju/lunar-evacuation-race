const http = require('node:http');
const udp = require('node:dgram').createSocket('udp4');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');

const defaultIP = process.env.ROVER_IP || '192.168.116.122';
const port = Number(process.env.PORT || 4183);
const origin = 'http://127.0.0.1:' + port;
const page = fs.readFileSync(__dirname + '/index.html');
const directions = new Map(Object.entries({
  forward: [1, 1], back: [-1, -1], left: [-1, 1], right: [1, -1]
}));
let driver;
let lastPulse = 0;
const lastSeen = new Map();
const pending = new Map();

function target(url) {
  const ip = url.searchParams.get('ip') ?? defaultIP;
  if (!require('node:net').isIPv4(ip)) return null;
  const [a,b,c,d] = ip.split('.').map(Number);
  return d !== 255 && d !== 0 &&
    (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31))
    ? ip : null;
}

async function queryStatus(ip) {
  try {
    const reply = await fetch('http://' + ip + '/status', {
      signal: AbortSignal.timeout(5000),
      headers: {Connection: 'close'}
    });
    if (reply.ok) {
      const state = await reply.json();
      if (Number.isFinite(state.L) && Number.isFinite(state.R)) {
        lastSeen.set(ip, Date.now());
        return state;
      }
    }
  } catch {}
  return null;
}

function stop(client = driver) {
  if (client) udp.send('0,0', 8888, client.roverIP);
  if (driver === client || driver?.roverIP === client?.roverIP) driver = null;
}
udp.on('error', err => console.error(err.message));
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== '127.0.0.1:' + port) return res.writeHead(403).end();
  const url = new URL(req.url, origin);
  if (url.pathname === '/') return res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(page);
  if (url.pathname !== '/status') return res.writeHead(404).end();
  const ip = target(url);
  if (!ip) return res.writeHead(400).end();
  if (!pending.has(ip)) pending.set(ip, queryStatus(ip).finally(() => pending.delete(ip)));
  const state = await pending.get(ip);
  res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ip,state,lastSeen:lastSeen.get(ip) ?? null}));
});
const ws = new WebSocketServer({noServer: true, maxPayload:512});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, origin);
  const ip = target(url);
  const cameraOrigin = req.headers.origin === 'http://127.0.0.1:4182';
  if ((!cameraOrigin && req.headers.origin !== origin) || url.pathname !== '/control' || !ip) return socket.destroy();
  ws.handleUpgrade(req,socket,head,client => { client.roverIP = ip; client.navigation = cameraOrigin; ws.emit('connection',client); });
});
ws.on('connection', client => {
  if (client.navigation) {
    queryStatus(client.roverIP).then(state => {
      if (client.readyState !== 1) return;
      client.ready = Boolean(state && state.L === 0 && state.R === 0);
      client.send(JSON.stringify({ready:client.ready}));
    });
  }
  client.on('error', () => { if (driver === client) stop(); });
  client.on('close', () => { if (driver === client) stop(); });
  client.on('message', raw => {
    let cmd;
    try { cmd = JSON.parse(raw); } catch { return; }
    if (cmd?.direction === 'stop') { stop(client); return; }
    if (!Number.isFinite(cmd?.time) || Math.abs(Date.now()-cmd.time)>250) return;
    if (client.navigation && !client.ready) return;
    const signs = directions.get(cmd.direction);
    let wheels;
    if (signs && Number.isInteger(cmd.power) && cmd.power >= 1 && cmd.power <= 100) {
      wheels = signs.map(sign => sign * cmd.power);
    } else if (client.navigation) {
      wheels = [cmd.left, cmd.right];
    } else return;
    if (!wheels.every(n => Number.isInteger(n) && Math.abs(n) <= 100)) return;
    if (driver && driver !== client) {
      if (client.navigation) client.close(1008,'busy');
      return;
    }
    driver = client;
    lastPulse = Date.now();
    udp.send(wheels.join(','),8888,client.roverIP);
  });
});
setInterval(() => { if (driver && Date.now()-lastPulse > 240) stop(); },40);
server.listen(port,'127.0.0.1', () => console.log(origin));

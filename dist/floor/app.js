import { FloorArena } from './renderer.js';
const $ = (id) => document.getElementById(id),
  arena = new FloorArena($('floor-map'));
let state = null,
  ws,
  lastAt = 0,
  connected = false,
  renderError = null,
  hideTimer;
arena.debug = new URLSearchParams(location.search).has('debug');
function activity() {
  document.body.classList.remove('hide-tools');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => document.body.classList.add('hide-tools'), 3500);
}
document.addEventListener('pointermove', activity);
activity();
$('fullscreen').onclick = () =>
  document.documentElement.requestFullscreen().catch((e) => {
    renderError = e.message;
  });
$('debug').onclick = () => {
  arena.debug = !arena.debug;
};
arena.ready
  .then(() => {
    $('load-status').hidden = true;
  })
  .catch((e) => {
    $('load-status').textContent = e.message;
    renderError = e.message;
  });
function connect() {
  ws = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ui?role=floor`,
  );
  ws.onopen = () => (connected = true);
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.type === 'state') {
      state = m;
      lastAt = performance.now();
    }
  };
  ws.onclose = () => {
    connected = false;
    setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
}
function frame() {
  const stale = !connected || !lastAt || performance.now() - lastAt > 1000;
  const fault = renderError || (stale ? '连接中断 · 保留当前赛区' : state?.fault);
  $('floor-tools').classList.toggle('fault', !!fault);
  $('floor-status').textContent = fault || '月面主赛区 · 59.8 × 33.6 cm';
  if (state) arena.draw(state);
  requestAnimationFrame(frame);
}
window.moonfallFloor = {
  snapshot: () => state && structuredClone(state),
  world: () => arena.diagnostics(),
};
window.moonfallSandbox = {
  snapshot: () => state && structuredClone(state),
  controller: () => false,
};
connect();
frame();

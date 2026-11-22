import { ROBOTS, CY, ENVELOPE, routeFor, rockSite } from './geometry.js';
import { LunarWorld } from '../ruins-world.js';
import { toView } from '../display/map.js';
const $ = (id) => document.getElementById(id),
  floor = new URLSearchParams(location.search).has('floor');
document.body.classList.toggle('floor', floor);
let world = null,
  view = null,
  worldError = null;
try {
  if (!floor) world = new LunarWorld($('control-map'), { physical: true });
} catch (e) {
  worldError = '3D 地图不可用：' + e.message;
}
world?.ready.catch((e) => {
  worldError = e.message;
});
for (const b of document.querySelectorAll('[data-view]'))
  b.onclick = () => world?.setView(b.dataset.view);
function frame() {
  if (world && view && !worldError) {
    try {
      world.update(view);
    } catch (e) {
      worldError = '3D 地图不可用：' + e.message;
    }
  }
  if (!floor) {
    const stale = lastReceived && performance.now() - lastReceived > 1000;
    $('world-notice').textContent =
      worldError || (stale ? '连接中断 · 保留最后位置' : state?.fault || '');
  }
  requestAnimationFrame(frame);
}

const names = { 'rover-blue': '蓝方', 'rover-gold': '黄方' },
  colors = { 'rover-blue': '#77bbf5', 'rover-gold': '#dfb66b' };
const labels = {
  idle: '待机 · 配置与选路',
  starting: '正在准备路线',
  running: '比赛进行中',
  paused: '已暂停',
  stopping: '正在确认停机',
  stopped: '双车已停止',
  finished: '本局完成',
};
const phaseLabels = {
  IDLE: '待机',
  RUNNING: '行驶',
  TURNING: '原地回转',
  READY: '等待激活',
  PARKED: '已停稳',
};
let state = null,
  controller = false,
  ws,
  toastTimer,
  lastEvents = '',
  lastReceived = 0,
  reconnect;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const time = (ms) =>
  `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${((ms / 1000) % 60).toFixed(2).padStart(5, '0')}`;
function notify(text) {
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}
function send(action, payload = {}) {
  if (ws?.readyState !== WebSocket.OPEN) {
    notify('本地服务未连接');
    return;
  }
  ws.send(JSON.stringify({ action, payload }));
}
function connect() {
  ws = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ui?role=${floor ? 'floor' : 'control'}`,
  );
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    lastReceived = performance.now();
    if (m.type === 'welcome') {
      if (!floor) {
        const url = new URL('/', location.href);
        url.port = m.phonePort ?? (Number(location.port) + 2);
        url.search = 'view=summary';
        const summary = $('reader-summary');
        if (summary.src !== url.href) summary.src = url.href;
        summary.hidden = false;
      }
      controller = m.controller;
      $('authority').textContent = controller ? '主控' : '只读窗口';
    } else if (m.type === 'state') {
      if (world && state?.match_id !== m.match_id) world.resetEffects();
      state = m;
      try {
        view = toView(m);
      } catch (e) {
        worldError = e.message;
      }
      render();
    } else if (m.type === 'action.result' && !m.ok) notify(m.error);
  };
  ws.onclose = () => {
    controller = false;
    $('connection').textContent = '服务已断开 · 不会自动恢复运动';
    $('connection').classList.remove('live');
    $('floor-status').textContent = '连接丢失 · 保留最后道路，等待核对';
    clearTimeout(reconnect);
    reconnect = setTimeout(connect, 2000);
  };
  ws.onerror = () => {};
}
$('players').innerHTML = ROBOTS.map(
  (id, i) =>
    `<div class="player ${i ? 'gold' : ''}"><h3>${names[id]} / ROVER 0${i + 1}</h3><div class="route-choice">${[
      ['beacon', '信标回廊'],
      ['outer', '废弃栈道'],
    ]
      .map(
        ([choice, label]) =>
          `<button data-choice="${choice}" data-kind="opening" data-robot="${id}">${label}</button>`,
      )
      .join('')}</div><div class="route-choice">${[
      ['safe', '归航环路'],
      ['risk', '碎隙捷径'],
    ]
      .map(
        ([choice, label]) =>
          `<button data-choice="${choice}" data-kind="final" data-robot="${id}">${label}</button>`,
      )
      .join(
        '',
      )}</div><button class="rock-btn" data-rock="${id}">向对手投落石</button><p class="rock-note" id="rock-${id}"></p></div>`,
).join('');
document
  .querySelectorAll('[data-action]')
  .forEach((b) => b.addEventListener('click', () => send(b.dataset.action)));
document
  .querySelectorAll('[data-choice]')
  .forEach((b) =>
    b.addEventListener('click', () =>
      send(b.dataset.kind, { robot_id: b.dataset.robot, choice: b.dataset.choice }),
    ),
  );
document
  .querySelectorAll('[data-rock]')
  .forEach((b) => b.addEventListener('click', () => send('rock', { robot_id: b.dataset.rock })));
document
  .querySelectorAll('[data-inject]')
  .forEach((b) => b.addEventListener('click', () => send('inject', { fault: b.dataset.inject })));
$('speed').onchange = (e) => send('speed', { value: Number(e.target.value) });
$('aftershock').onchange = (e) => send('aftershock', { value: e.target.value });
$('envelopes').onchange = () => state && draw();
$('fullscreen').onclick = () =>
  document.documentElement.requestFullscreen().catch((e) => notify(e.message));
const dCache = new Map();
function path(id, key) {
  const cacheKey = id + key;
  if (!dCache.has(cacheKey))
    dCache.set(
      cacheKey,
      routeFor(id, key)
        .waypoints_cm.map((p, i) => `${i ? 'L' : 'M'}${p.x_cm.toFixed(3)} ${p.y_cm.toFixed(3)}`)
        .join(''),
    );
  return dCache.get(cacheKey);
}
const text = (x, y, t, color = '#8ea2b2', size = 0.6) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="sans-serif">${esc(t)}</text>`;
function draw() {
  $('board').innerHTML =
    `<defs><pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#23303a" stroke-width=".04"/></pattern></defs><rect width="59.8" height="33.6" fill="#101920"/><rect width="59.8" height="33.6" fill="url(#grid)"/>` +
    state.robots
      .map((r, i) => {
        const id = r.robot_id,
          cy = CY[id],
          col = colors[id];
        const key = r.route_key || `s1_${r.opening}`,
          pending = r.plans[r.stage_id]?.key;
        const route = path(id, key),
          site = rockSite(r.stage_id, r.opening, id);
        let content = `<path d="${route}" fill="none" stroke="${i ? '#2e2d2a' : '#22323d'}" stroke-width="${ENVELOPE * 2}" stroke-linejoin="round" stroke-linecap="round"/><path d="${route}" fill="none" stroke="${col}" stroke-width=".11" opacity=".85"/>`;
        if (pending && pending !== key)
          content += `<path d="${path(id, pending)}" fill="none" stroke="${col}" stroke-width=".15" stroke-dasharray=".3 .3"/>`;
        content +=
          text(1, cy - 6.7, `${i ? '02 黄车道' : '01 蓝车道'}  /  第 ${r.stage_id} 段`, col, 0.7) +
          text(45, cy - 6.7, phaseLabels[r.phase] || r.phase, col, 0.65);
        if (r.stage_id === 1) {
          if (r.opening === 'beacon') {
            content +=
              `<circle cx="15" cy="${cy - 3}" r=".8" fill="${r.beacon ? '#9fdcc9' : '#2b6c6f'}"/>` +
              text(13, cy - 4.8, '信标', col, 0.55);
            content += `<path d="M21 ${cy - 4}v2" stroke="${r.gate ? '#86e1ba' : '#c69175'}" stroke-width=".25"/>`;
          }
          content += `<circle cx="53.8" cy="${cy}" r="${ENVELOPE}" stroke="${col}" fill="none" stroke-width=".08" stroke-dasharray=".3 .3"/>`;
        }
        if (r.stage_id === 2)
          content +=
            `<path d="M51.8 ${cy - 2}v4" stroke="#8abcc0" stroke-width=".15"/>` +
            text(41, cy - 3.2, '月震触发线  ←', col) +
            `<circle cx="16" cy="${cy}" r="${ENVELOPE}" stroke="${col}" fill="none" stroke-width=".08" stroke-dasharray=".3 .3"/>`;
        if (r.stage_id === 3) {
          content +=
            `<rect x="51" y="${cy - 0.8}" width="3.3" height="1.6" fill="#a6d4b3" fill-opacity=".25"/><path d="M51 ${cy - 3}v6" stroke="#c0e3ce" stroke-width=".15"/>` +
            text(48.5, cy - 4, '终点', '#b9d8c4') +
            `<path d="M53.3 ${cy}h1 M53.8 ${cy - 0.5}v1" stroke="#e5e8e6" stroke-width=".12"/>`;
          if (r.final === 'risk')
            content +=
              `<circle cx="32" cy="${cy}" r=".45" fill="#a1d0d8"/>` +
              text(
                28,
                cy + 4.5,
                state.aftershock === 'collapse'
                  ? '余震：塌陷'
                  : state.aftershock === 'stable'
                    ? '余震：稳定'
                    : '震源点',
                col,
              );
        }
        if ([1, 3].includes(r.stage_id) && !r.rock)
          content += `<circle cx="${site.center_cm[0]}" cy="${site.center_cm[1]}" r=".5" fill="none" stroke="#ac9276" stroke-width=".08" stroke-dasharray=".12 .12"/>`;
        if (r.rock && !r.rock.done && r.rock.stage_id === r.stage_id) {
          const [x, y] = r.rock.center_cm;
          content +=
            `<circle cx="${x}" cy="${y}" r=".5" fill="${r.rock.active ? '#cf8a62' : '#f2c889'}" stroke="#f0cfb1" stroke-width=".08"/>` +
            text(x - 2, y - 1.1, r.rock.active ? '落石封路' : '2 秒预警', '#ebbd91', 0.55);
        }
        if (!floor) {
          const p = r.pose;
          content += `<g transform="translate(${p.x_cm} ${p.y_cm}) rotate(${p.heading_deg})">${$('envelopes').checked ? `<circle r="${ENVELOPE}" fill="none" stroke="${col}" stroke-width=".06" stroke-dasharray=".25 .25" opacity=".6"/>` : ''}<rect x="-3" y="-3" width="6" height="6" rx=".3" fill="#121c24" fill-opacity=".9" stroke="${r.pose.valid ? col : '#bd6363'}" stroke-width=".17"/><path d="M-.8 -1.3L1 0l-1.8 1.3" fill="none" stroke="${col}" stroke-width=".25"/><circle r=".15" fill="${col}"/></g>`;
        }
        return content;
      })
      .join('') +
    `<path d="M0 16.8H59.8" stroke="#5d6a73" stroke-width=".07" stroke-dasharray=".4 .4"/><rect x=".04" y=".04" width="59.72" height="33.52" fill="none" stroke="#627583" stroke-width=".08"/>`;
}
function render() {
  if (document.querySelector('.physical-inspector')?.open) draw();
  const s = state;
  $('time').textContent = time(s.elapsed_ms);
  $('status').textContent = labels[s.status] || s.status;
  $('mode').textContent = s.mode === 'simulation' ? '内置模拟器' : '外部硬件接口';
  $('speed-label').textContent = `${s.speed}×`;
  $('connection').textContent = s.connected
    ? s.handshake
      ? '硬件握手完成 · 本地服务在线'
      : '等待硬件握手'
    : '等待外部硬件连接';
  $('connection').classList.toggle('live', s.connected && s.handshake);
  $('floor-status').textContent =
    `${labels[s.status]} · ${s.calibration_id || '未标定'} · ${time(s.elapsed_ms)}`;
  if (floor) return;
  $('notice').classList.toggle('fault', !!s.fault);
  $('notice').textContent = s.fault
    ? `暂停原因：${s.fault}`
    : s.winner
      ? `${s.winner === 'tie' ? '双车并列' : names[s.winner] + '率先'}抵达；车辆继续按路线安全停车。`
      : s.mode === 'simulation'
        ? '当前为理想运动模拟。屏面 59.8 × 33.6 cm，车体 6 × 6 cm；实车参数须由硬件端验证。'
        : `外部接口模式 · ${s.actuators_enabled ? '实体执行器' : '无电机适配器'} · ${s.parameters_verified ? '已载入实测参数' : '尚未载入实测参数，实体发车受限'}`;
  $('rosters').innerHTML = s.robots
    .map(
      (r, i) =>
        `<article class="roster ${i ? 'gold' : ''}"><header><h3>${names[r.robot_id]} / 第 ${r.stage_id} 段</h3><span>${phaseLabels[r.phase] || r.phase} · r${r.route_revision}</span></header><div class="coords">${r.pose.x_cm.toFixed(2)}, ${r.pose.y_cm.toFixed(2)} <small>cm</small>　${r.pose.heading_deg.toFixed(1)}<small>°</small></div><p>${r.pose.valid ? '定位有效' : '定位无效'} · ${r.last_pose_ms === null ? '无采集帧' : Math.round(s.now_ms - r.last_pose_ms) + ' ms'} · ${r.stopped_confirmed ? '停稳确认' : '运动中 / 待确认'}<br>${r.route_key || '等待路线准备'}</p></article>`,
    )
    .join('');
  $('progress').innerHTML = s.robots
    .map((r, i) => {
      const total = routeFor(r.robot_id, r.route_key || `s1_${r.opening}`).length_cm,
        percent = ((r.stage_id - 1 + Math.min(1, r.s_cm / total)) / 3) * 100;
      return `<div class="track-label"><span>${names[r.robot_id]}　${r.stage_id === 1 ? '开局路线 →' : r.stage_id === 2 ? '月震衔接 ←' : '最后撤离 →'}</span><span>${r.finished_ms === null ? '驶向飞船' : time(r.finish_elapsed_ms) + ' 抵达'}</span></div><div class="progressbar ${i ? 'gold' : ''}"><i style="width:${percent}%"></i></div>`;
    })
    .join('');
  $('choice-window').textContent =
    s.quake_ms === null
      ? '等待月震'
      : s.locked
        ? '末段已公开'
        : `${(s.choice_remaining_ms / 1000).toFixed(1)} 秒 · 秘密选路`;
  for (const b of document.querySelectorAll('[data-choice]')) {
    const r = s.robots.find((r) => r.robot_id === b.dataset.robot);
    b.disabled =
      !controller ||
      (b.dataset.kind === 'opening'
        ? s.status !== 'idle'
        : s.status !== 'running' || s.quake_ms === null || s.locked || r.submitted);
    b.classList.toggle(
      'selected',
      b.dataset.choice === (b.dataset.kind === 'opening' ? r.opening : r.final),
    );
  }
  for (const b of document.querySelectorAll('[data-rock]')) {
    const r = s.robots.find((r) => r.robot_id === b.dataset.rock);
    b.disabled = !controller || !r.legal_rock;
    b.textContent = !r.card
      ? '落石已使用'
      : r.card_pending
        ? '等待路线确认…'
        : r.legal_rock?.stage === 3
          ? '预约对手第三段落石'
          : '向对手投落石';
    $(`rock-${r.robot_id}`).textContent = !r.card
      ? '本局一张 · 已扣卡'
      : r.card_pending
        ? '收到 armed 后扣卡'
        : r.legal_rock
          ? `可用 · 对手第 ${r.legal_rock.stage} 段${r.legal_rock.remaining_cm === null ? '入口' : `，距分叉 ${r.legal_rock.remaining_cm.toFixed(1)} cm`}`
          : s.status === 'running'
            ? '暂无安全落点 · 卡牌保留'
            : '开赛后可投放';
  }
  const enabled = {
    configure: s.status === 'idle' && s.handshake && s.clock,
    start: s.status === 'idle' && s.configured,
    pause: ['running', 'starting'].includes(s.status),
    stop: !['stopped', 'stopping'].includes(s.status),
    query: s.connected,
    resume: s.status === 'paused' && s.snapshot_ok,
    reset: ['idle', 'stopped', 'finished'].includes(s.status),
  };
  for (const [id, ok] of Object.entries(enabled)) $(id).disabled = !controller || !ok;
  $('simulation-tools').hidden = s.mode !== 'simulation';
  $('aftershock').disabled = !controller || s.status !== 'idle';
  $('speed').disabled = !controller;
  document.querySelectorAll('[data-inject]').forEach((b) => (b.disabled = !controller));
  $('link-info').innerHTML = [
    ['协议', s.protocol],
    ['地图版本', s.map_revision],
    ['标定', s.calibration_id || '未提供'],
    ['时钟误差', s.clock ? `± ${s.clock.uncertainty_ms.toFixed(1)} ms` : '未同步'],
    ['WebSocket', `${location.host}/hardware`],
    ['已记录消息', s.wire_count],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
    .join('');
  $('commands').innerHTML = s.commands
    .slice()
    .reverse()
    .map((c) => `<div><span>${esc(c.type)}</span><span>${esc(c.status)}</span></div>`)
    .join('');
  const events = JSON.stringify(s.events);
  if (events !== lastEvents) {
    lastEvents = events;
    $('events').innerHTML = s.events
      .map(
        (e) =>
          `<div class="event ${esc(e.type)}"><time>${time(e.time_ms)}</time><span>${esc(e.text)}</span></div>`,
      )
      .join('');
  }
}
setInterval(() => {
  if (lastReceived && performance.now() - lastReceived > 1000) {
    $('connection').textContent = '状态更新中断 · 请检查服务';
    $('floor-status').textContent = '状态更新中断 · 保留最后道路';
  }
}, 500);
connect();

// Read-only diagnostics for two-screen acceptance checks.
window.moonfallSandbox = {
  snapshot: () => state && structuredClone(state),
  controller: () => controller,
  world: () => world?.diagnostics(),
};

if (!floor) frame();
document.querySelector('.physical-inspector').addEventListener('toggle', () => state && draw());

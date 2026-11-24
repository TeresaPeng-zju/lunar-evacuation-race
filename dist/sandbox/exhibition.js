// Presentation only. All actions continue through app.js and the authoritative engine.
export function createExhibition({ getState, onRouteFeedback }) {
  const $ = (id) => document.getElementById(id);
  let previous = null,
    queue = [],
    activeUntil = 0,
    hiddenTimer;
  const openingConfirmed = new Set();
  const borders = new Map();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function borderFor(player) {
    if (borders.has(player)) return borders.get(player);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('panel-flow');
    svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 6; i++) {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('pathLength', '100');
      rect.setAttribute('rx', '2');
      rect.style.setProperty('--offset', `${i * 2}px`);
      rect.style.setProperty('--end-offset', `${i * 2 - 100}px`);
      rect.style.opacity = [0.95, 0.65, 0.4, 0.25, 0.12, 0.06][i];
      svg.append(rect);
    }
    const flash = document.createElementNS(ns, 'rect');
    flash.classList.add('panel-confirm');
    flash.setAttribute('rx', '2');
    svg.append(flash);
    player.prepend(svg);
    new ResizeObserver(() => {
      for (const rect of svg.children) {
        rect.setAttribute('x', '1');
        rect.setAttribute('y', '1');
        rect.setAttribute('width', Math.max(0, player.clientWidth - 2));
        rect.setAttribute('height', Math.max(0, player.clientHeight - 2));
      }
    }).observe(player);
    borders.set(player, flash);
    return flash;
  }
  function confirmPanel(id) {
    const player = document.querySelector(`[data-player="${id}"]`);
    if (!player) return;
    const flash = borderFor(player);
    flash.getAnimations().forEach((a) => a.cancel());
    if (!reducedMotion()) flash.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 650 });
  }
  function confirmOpening(id, choice, match) {
    const s = getState();
    if (!s || s.match_id !== match || s.status !== 'idle') return;
    openingConfirmed.add(id);
    confirmPanel(id);
    onRouteFeedback?.(id, `s1_${choice}`);
  }
  const banner = $('race-announcement');
  const names = { 'rover-blue': '蓝方', 'rover-gold': '黄方' };
  function setAdmin(enabled) {
    document.body.classList.toggle('exhibition', !enabled);
    document.body.classList.toggle('admin-mode', enabled);
    const adminLabel = enabled ? '返回赛场' : '管理设置';
    $('admin-toggle').setAttribute('aria-label', adminLabel);
    $('admin-toggle').setAttribute('title', `${adminLabel}（A）`);
    $('admin-toggle').dataset.tooltip = adminLabel;
    $('admin-toggle').setAttribute('aria-pressed', String(enabled));
    const url = new URL(location.href);
    enabled ? url.searchParams.set('admin', '1') : url.searchParams.delete('admin');
    history.replaceState(null, '', url);
    activity();
  }
  function activity() {
    document.body.classList.add('show-venue-tools');
    clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => document.body.classList.remove('show-venue-tools'), 2600);
  }
  $('admin-toggle').onclick = () => setAdmin(!document.body.classList.contains('admin-mode'));
  $('venue-fullscreen').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => activity());
  };
  document.addEventListener('pointermove', activity);
  document.addEventListener('keydown', (e) => {
    if (e.repeat || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'a') {
      e.preventDefault();
      $('admin-toggle').click();
    }
    if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('venue-fullscreen').click();
    }
  });
  setAdmin(new URLSearchParams(location.search).get('admin') === '1');
  function announce(title, subtitle, team = '') {
    queue.push({ title, subtitle, team });
  }
  function paintAnnouncement(now) {
    if (now < activeUntil) return;
    const next = queue.shift();
    banner.hidden = !next;
    if (!next) return;
    banner.dataset.team = next.team;
    $('announcement-title').textContent = next.title;
    $('announcement-detail').textContent = next.subtitle;
    banner.getAnimations().forEach((a) => a.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      banner.animate(
        [
          { opacity: 0, transform: 'translateY(-12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 350 },
      );
    activeUntil = now + 2600;
  }
  function update(s, controller) {
    const first = !previous || previous.match_id !== s.match_id;
    if (first) {
      openingConfirmed.clear();
      queue = [];
      activeUntil = 0;
      banner.hidden = true;
    }
    const opening = s.status === 'idle';
    const choosing = s.status === 'running' && s.quake_ms !== null && !s.locked;
    document.body.classList.toggle('opening-choice', opening);
    document.body.classList.toggle('final-choice', choosing);
    document.body.dataset.raceStatus = s.status;
    const secs = Math.floor(s.elapsed_ms / 1000);
    $('venue-time').textContent =
      `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    $('venue-time').hidden = opening;
    $('venue-phase').textContent = choosing
      ? `月震选路 · ${(s.choice_remaining_ms / 1000).toFixed(1)} 秒`
      : s.status === 'paused'
        ? '比赛暂停'
        : s.status === 'stopping'
          ? '正在停靠'
          : s.status === 'stopped'
            ? '比赛已停止'
            : '';
    $('venue-phase').hidden = !$('venue-phase').textContent;
    $('venue-choices').classList.toggle('readonly', !controller);
    for (const r of s.robots) {
      const player = document.querySelector(`[data-player="${r.robot_id}"]`);
      borderFor(player);
      const confirmed = opening ? openingConfirmed.has(r.robot_id) : r.submitted;
      player.classList.toggle(
        'awaiting-choice',
        controller && ((opening && !confirmed) || (choosing && !r.submitted)),
      );
      player.classList.toggle('selection-confirmed', (opening || choosing) && !!confirmed);
      const otherReady = s.robots
        .filter((other) => other.robot_id !== r.robot_id)
        .every((other) => (opening ? openingConfirmed.has(other.robot_id) : other.submitted));
      const canRock = s.status === 'running' && !!r.legal_rock && r.card;
      player.classList.toggle('offer-rock', canRock);
      player.classList.toggle('offer-choice', opening || choosing);
      player.classList.toggle('choice-submitted', choosing && r.submitted);
      player.querySelector('.venue-player-hint').textContent = opening
        ? confirmed
          ? otherReady
            ? '已选路'
            : '等待对方'
          : '出发选路'
        : choosing
          ? r.submitted
            ? otherReady
              ? '已选路 · 已密封'
              : '等待对方 · 已密封'
            : '末段选路'
          : '落石可用';
    }
    if (!first) {
      if (previous.status === 'starting' && s.status === 'running')
        announce('撤离行动开始', '驶向飞船停靠区');
      for (const r of s.robots) {
        const old = previous.robots.find((p) => p.robot_id === r.robot_id);
        if (!old) continue;
        const submitted = !old.submitted && r.submitted;
        const revealed = !old.final && r.final && s.locked;
        if (submitted) confirmPanel(r.robot_id);
        if (submitted || revealed) {
          const choice = revealed ? r.final : null;
          const target = choice
            ? document.querySelector(`[data-player="${r.robot_id}"] [data-choice="${choice}"]`)
            : document.querySelector(`[data-player="${r.robot_id}"] .venue-player-heading`);
          if (target && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            target.animate(
              [
                { filter: 'brightness(1.5)', transform: 'translateY(1px)' },
                { filter: 'brightness(1)', transform: 'translateY(0)' },
              ],
              { duration: 220 },
            );
          }
          // Final choices remain secret until the existing authoritative reveal.
          if (revealed) onRouteFeedback?.(r.robot_id, r.final === 'safe' ? 's3_safe' : 's3_stable');
        }
        if (!old.beacon && r.beacon)
          announce(`${names[r.robot_id]}抵达信标回廊！`, '信标已激活 · 个人舱门开启', r.robot_id);
        if (!old.rock && r.rock && !r.rock.done)
          announce(`${names[r.robot_id]}前方落石预警`, '2 秒后封路 · 进入绕行路线', r.robot_id);
      }
      if (previous.quake_ms === null && s.quake_ms !== null)
        announce('月震来袭', '7 秒秘密选路 · 双方同时决策');
      if (!previous.locked && s.locked)
        announce(
          '撤离路线已锁定',
          s.robots
            .map((r) => `${names[r.robot_id]} · ${r.final === 'risk' ? '碎隙捷径' : '归航环路'}`)
            .join('　 /　 '),
        );
      if (!previous.aftershock && s.aftershock)
        announce(
          s.aftershock === 'collapse' ? '余震 · 断层塌陷' : '余震 · 路面稳定',
          s.aftershock === 'collapse' ? '碎隙捷径切换至绕行道路' : '继续驶向飞船',
        );
    }
    const result = $('venue-result');
    result.hidden = !s.winner;
    if (s.winner) {
      queue = [];
      banner.hidden = true;
      result.dataset.team = s.winner;
      $('result-title').textContent =
        s.winner === 'tie' ? '双方同时抵达' : `${names[s.winner]}率先撤离！`;
      $('result-detail').textContent =
        s.status === 'finished' ? '双车已停靠 · 本局结束' : '继续驶入停靠区';
      $('result-times').textContent = s.robots
        .map(
          (r) =>
            `${names[r.robot_id]}  ${r.finish_elapsed_ms == null ? '驶向飞船中' : (r.finish_elapsed_ms / 1000).toFixed(2) + ' 秒'}`,
        )
        .join('　 /　 ');
    } else paintAnnouncement(performance.now());
    previous = structuredClone(s);
  }
  // Banner lifetime follows wall time; queued events only originate from live state transitions.
  setInterval(() => {
    if (!getState()?.winner) paintAnnouncement(performance.now());
  }, 150);
  return { update, confirmOpening, showRace: () => setAdmin(false) };
}

import { randomUUID } from 'node:crypto';
import {
  BOARD,
  ROBOTS,
  CY,
  MAP_REVISION,
  LIMITS,
  ENVELOPE,
  routeFor,
  rockSite,
  manifest,
  project,
  angleDiff,
} from '../dist/sandbox/geometry.js';
import { CONFIG as RULES } from '../dist/shared/rules.js';
import { PROTOCOL, CAPABILITIES, wrap, validEnvelope, finitePose } from './protocol.mjs';
const uid = (prefix) => `${prefix}-${randomUUID()}`;
const clone = (x) => structuredClone(x);
const activeStatuses = ['starting', 'running'];

// Authoritative physical-game adapter. The existing 3D race engine is left intact.
// This core never integrates motor positions: only validated pose.frame may move a car.
export class Sandbox {
  constructor({ send = () => {}, mode = 'simulation', profile = null, random = Math.random } = {}) {
    this.send = send;
    this.mode = mode;
    this.profile = profile;
    this.random = random;
    this.now = 0;
    this.seq = 0;
    this.session = null;
    this.link = false;
    this.hello = null;
    this.sync = null;
    this.lastSeq = 0;
    this.commands = new Map();
    this.jobs = new Map();
    this.pings = new Map();
    this.wire = [];
    this.log = [];
    this.cards = new Map();
    this.poseFrame = -1;
    this.forcedAftershock = 'random';
    this.reset();
  }
  reset() {
    if (activeStatuses.includes(this.status) || this.status === 'paused')
      throw Error('先停止并确认双车停稳，再重置');
    this.match = uid('match');
    this.status = 'idle';
    this.elapsed = 0;
    this.quake = null;
    this.locked = false;
    this.aftershock = null;
    this.winner = null;
    this.fault = null;
    this.log = [];
    this.wire = [];
    this.resumeStatus = null;
    this.snapshotOK = false;
    this.commands.clear();
    this.jobs.clear();
    this.cards.clear();
    this.configured = false;
    this.robots = Object.fromEntries(
      ROBOTS.map((id) => [
        id,
        {
          robot_id: id,
          opening: 'beacon',
          secret: null,
          final: null,
          card: true,
          card_pending: false,
          stage_id: 1,
          stage_instances: { 1: uid('stage1'), 2: uid('stage2'), 3: uid('stage3') },
          route_revision: 0,
          route_key: null,
          next_revision: 0,
          plans: {},
          s_cm: 0,
          phase: 'IDLE',
          pose: { x_cm: 6, y_cm: CY[id], heading_deg: 0, valid: false },
          last_pose_ms: null,
          last_capture_ms: null,
          stopped_confirmed: false,
          beacon: false,
          gate: false,
          rock: null,
          finished_ms: null,
          parked: false,
          handoff_id: null,
        },
      ]),
    );
    this.event('reset', '新一局已创建；等待配置与路线准备');
  }
  event(type, text, data = {}) {
    this.log.unshift({ time_ms: this.elapsed, type, text, ...data });
    this.log = this.log.slice(0, 300);
  }
  trace(direction, m) {
    this.wire.push({ direction, ...clone(m) });
    if (this.wire.length > 15000) this.wire.splice(0, 1000);
  }
  emit(type, payload) {
    if (!this.link) return;
    const m = wrap(type, payload, this.session, this.match, ++this.seq, this.now);
    this.trace('game_to_hardware', m);
    this.send(m);
    return m;
  }
  command(type, payload = {}, context = {}) {
    const command_id = uid('cmd'),
      p = { ...payload, command_id };
    this.commands.set(command_id, {
      type,
      payload: p,
      context,
      created: this.now,
      status: 'sent',
      deadline: this.now + (context.timeout_ms || LIMITS.command_timeout_ms),
    });
    this.emit(type, p);
    return command_id;
  }
  connect() {
    if (this.link) this.disconnect('硬件会话被替换');
    this.link = true;
    this.session = uid('session');
    this.seq = 0;
    this.lastSeq = 0;
    this.poseFrame = -1;
    this.hello = null;
    this.sync = null;
    this.configured = false;
    this.snapshotOK = false;
    this.emit('hello', {
      role: 'game',
      supported_protocols: [PROTOCOL],
      required_capabilities: CAPABILITIES,
      mode: this.mode,
    });
    this.event('connection', '硬件连接，等待能力协商与校时');
  }
  disconnect(reason = '硬件连接断开') {
    if (activeStatuses.includes(this.status) || this.status === 'paused') this.pause(reason);
    this.link = false;
    this.hello = null;
    this.sync = null;
    this.snapshotOK = false;
    this.event('disconnect', reason);
  }
  receive(m) {
    if (
      !validEnvelope(m) ||
      m.session_id !== this.session ||
      m.match_id !== this.match ||
      m.seq <= this.lastSeq
    )
      return false;
    this.lastSeq = m.seq;
    this.trace('hardware_to_game', m);
    const p = m.payload;
    try {
      switch (m.type) {
        case 'hardware.hello': {
          const required = p.adapter_mode === 'camera' && p.actuators_enabled === false
            ? ['pose.frame','route.preview'] : CAPABILITIES;
          if (!required.every((x) => p.capabilities?.includes(x)))
            throw Error('硬件缺少三段模式必需能力');
          if (p.board?.width_cm !== BOARD.width_cm || p.board?.height_cm !== BOARD.height_cm)
            throw Error('棋盘尺寸不匹配');
          if (!ROBOTS.every((id) => p.robot_ids?.includes(id))) throw Error('robot_id 不匹配');
          this.hello = clone(p);
          this.ping();
          break;
        }
        case 'pong': {
          const t1 = this.pings.get(p.ping_id);
          if (t1 === undefined || p.t1_game_mono_ms !== t1) break;
          this.pings.delete(p.ping_id);
          const { t2_hw_mono_ms: t2, t3_hw_mono_ms: t3 } = p;
          if (!Number.isFinite(t2) || !Number.isFinite(t3) || t3 < t2) throw Error('非法校时数据');
          const rtt = this.now - t1 - (t3 - t2);
          if (rtt < -0.01 || rtt > 60) throw Error('校时不确定度超限');
          this.sync = {
            offset_ms: (t1 - t2 + (this.now - t3)) / 2,
            uncertainty_ms: Math.max(0, rtt / 2),
            at_ms: this.now,
          };
          break;
        }
        case 'command.result':
          this.result(p);
          break;
        case 'pose.frame':
          this.poses(p);
          break;
        case 'robot.status':
          this.robotStatus(p);
          break;
        case 'hardware.snapshot':
          this.reconcile(p);
          break;
        case 'card.detected':
          this.card(p);
          break;
        case 'fault':
          this.pause(`${p.code || 'HARDWARE_FAULT'}：${p.detail || '硬件端故障'}`);
          break;
      }
      return true;
    } catch (e) {
      this.event('rejected', e.message);
      if (activeStatuses.includes(this.status)) this.pause(e.message);
      return false;
    }
  }
  ping() {
    const ping_id = uid('ping');
    this.pings.set(ping_id, this.now);
    this.emit('ping', { ping_id, t1_game_mono_ms: this.now });
  }
  assertReady() {
    if (!this.link || !this.hello || !this.sync) throw Error('硬件握手或校时尚未完成');
    if (this.hello.actuators_enabled !== false) {
      const p = this.profile;
      if (
        !p?.parameters_verified ||
        !p.calibration_id ||
        p.calibration_id !== this.hello.calibration_id ||
        !this.hello.parameters_verified
      )
        throw Error('实车参数与标定未验证：禁止发车');
      if (
        !Array.isArray(this.hello.body_cm) ||
        this.hello.body_cm.length !== 2 ||
        !this.hello.body_cm.every((n) => Number.isFinite(n) && n > 0 && n <= 6) ||
        this.hello.turn_in_place !== true ||
        !(this.hello.pose_hz >= 20)
      )
        throw Error('车体外廓、原地回转能力或定位频率不满足方案');
      if (
        p.map_revision !== MAP_REVISION ||
        p.board?.width_cm !== 59.8 ||
        p.board?.height_cm !== 33.6 ||
        p.max_speed_cm_s !== 2 ||
        p.combined_error_cm > 0.8 ||
        p.braking_distance_cm > 2 ||
        p.pose_stale_ms !== 150 ||
        !(p.tie_ms >= 100)
      )
        throw Error('实测参数不满足本版几何与时序预算');
      if (
        !['combined_error_cm', 'braking_distance_cm', 'tie_ms'].every(
          (k) => Number.isFinite(p[k]) && p[k] >= 0,
        )
      )
        throw Error('实测参数必须为有效数值');
    }
  }
  configure() {
    if (this.status !== 'idle') throw Error('只能在待机配置');
    this.assertReady();
    this.configured = false;
    this.configAcks = 0;
    this.command(
      'map.configure',
      {
        ...manifest(),
        parameters_verified: !!this.profile?.parameters_verified,
        calibration_id: this.hello.calibration_id,
      },
      { kind: 'config', timeout_ms: 5000 },
    );
    this.command(
      'match.configure',
      {
        limits: LIMITS,
        parameters_verified: !!this.profile?.parameters_verified,
        stage_instances: ROBOTS.map((id) => ({
          robot_id: id,
          stage_instances: this.robots[id].stage_instances,
        })),
        tie_ms: this.profile?.tie_ms || 100,
      },
      { kind: 'config' },
    );
    this.previewOpeningRoutes();
  }
  previewOpeningRoutes() {
    if (this.hello?.adapter_mode === 'camera') this.emit('route.preview', {
      routes: ROBOTS.map(id => routeFor(id, 's1_' + this.robots[id].opening)),
    });
  }
  chooseOpening(id, choice) {
    if (this.status !== 'idle' || !['beacon', 'outer'].includes(choice) || !this.robots[id])
      throw Error('开局路线已锁定或无效');
    this.robots[id].opening = choice;
    this.previewOpeningRoutes();
  }
  start() {
    if (this.hello?.adapter_mode === 'camera') throw Error('相机实测联调：仅预览路线和定位');
    if (this.status !== 'idle' || !this.configured) throw Error('请先配置地图并等待硬件回执');
    this.assertReady();
    if (
      ROBOTS.some((id) => {
        const r = this.robots[id];
        return (
          !r.pose.valid ||
          this.now - r.last_pose_ms > 150 ||
          !r.stopped_confirmed ||
          Math.hypot(r.pose.x_cm - 6, r.pose.y_cm - CY[id]) > 0.5 ||
          Math.abs(angleDiff(r.pose.heading_deg, 0)) > 5
        );
      })
    )
      throw Error('双车必须定位有效、停稳并位于起点 (6, cy)，朝右');
    this.status = 'starting';
    this.startCommandSent = false;
    this.handoffAcks = 0;
    for (const id of ROBOTS) {
      this.prepare(id, 1, `s1_${this.robots[id].opening}`, { kind: 'initial' });
      this.prepare(id, 2, 's2', { kind: 'preload' });
      for (const [from, to, x, heading] of [
        [1, 2, 53.8, -180],
        [2, 3, 16, 0],
      ])
        this.command(
          'handoff.configure',
          {
            robot_id: id,
            handoff_id: `${this.match}/${id}/${from}-${to}`,
            from_stage: from,
            to_stage: to,
            from_instance: this.robots[id].stage_instances[from],
            to_instance: this.robots[id].stage_instances[to],
            center_cm: [x, CY[id]],
            target_heading_deg: heading,
            position_tolerance_cm: 0.5,
            heading_tolerance_deg: 5,
            next_route_slot: to,
          },
          { kind: 'handoff-config' },
        );
    }
  }
  maybeStart() {
    if (
      this.status === 'starting' &&
      !this.startCommandSent &&
      this.handoffAcks === 4 &&
      ROBOTS.every((id) => [1, 2].every((s) => this.robots[id].plans[s]?.armed))
    ) {
      this.startCommandSent = true;
      this.command(
        'match.start',
        { robot_ids: ROBOTS, start_at_hw_mono_ms: this.now - this.sync.offset_ms + 100 },
        { kind: 'start' },
      );
    }
  }
  prepare(id, stage, key, context) {
    const r = this.robots[id],
      previous = r.plans[stage],
      job = {
        id: uid('routejob'),
        robot_id: id,
        stage_id: stage,
        key,
        revision: ++r.next_revision,
        stage_instance_id: r.stage_instances[stage],
        context,
        armed: false,
        applied: false,
        expected_revision: previous?.revision || 0,
        route: routeFor(id, key),
      };
    this.jobs.set(job.id, job);
    job.prepare_command = this.command(
      'route.prepare',
      {
        robot_id: id,
        stage_id: stage,
        stage_instance_id: job.stage_instance_id,
        route_revision: job.revision,
        expected_route_revision: job.expected_revision,
        route: job.route,
        switch_at_cm: context.fork || null,
        requires_decision_at_x_cm:
          key.startsWith('s3_stable') && r.final === 'risk' && !this.aftershock ? 37 : null,
        blocked_edge_ids: key.endsWith('_rock')
          ? [rockSite(stage, r.opening, id).blocked_edge_id]
          : [],
      },
      { kind: 'prepare', job: job.id },
    );
    return job;
  }
  result(p) {
    const cmd = this.commands.get(p.command_id);
    if (!cmd || cmd.status === p.status) return;
    if (['completed', 'rejected'].includes(cmd.status)) return;
    const accepted = {
      'route.prepare': ['prepared', 'rejected'],
      'route.commit': ['armed', 'applied', 'rejected'],
      'route.activate': ['applied', 'rejected'],
      'match.start': ['applied', 'rejected'],
      'robot.resume': ['applied', 'rejected'],
    }[cmd.type] || ['completed', 'rejected'];
    if (!accepted.includes(p.status)) throw Error(`错误回执 ${cmd.type}/${p.status}`);
    const c = cmd.context,
      job = this.jobs.get(c.job);
    if (p.status === 'rejected') {
      cmd.status = 'rejected';
      this.event('command_rejected', `${cmd.type} 被拒绝：${p.reason || '未知原因'}`);
      if (job?.context.kind === 'rock') {
        this.robots[job.context.attacker].card_pending = false;
        if (!job.armed) {
          if (job.context.card_event)
            this.emit('card.result', {
              event_id: job.context.card_event,
              accepted: false,
              consumed: false,
              reason: p.reason,
            });
          return;
        }
      }
      this.pause(`命令被拒绝：${cmd.type}`);
      return;
    }
    if (c.kind === 'prepare') {
      if (
        !p.prepared_id ||
        !Number.isFinite(p.length_cm) ||
        !Array.isArray(p.execution_path_cm) ||
        p.execution_path_cm.length !== job.route.waypoints_cm.length ||
        p.execution_path_cm.some(
          (q, i) =>
            !finitePose(q) ||
            Math.hypot(
              q.x_cm - job.route.waypoints_cm[i].x_cm,
              q.y_cm - job.route.waypoints_cm[i].y_cm,
            ) > 0.01 ||
            Math.abs(angleDiff(q.heading_deg, job.route.waypoints_cm[i].heading_deg)) > 0.1,
        ) ||
        Math.abs(p.length_cm - job.route.length_cm) > 0.02
      )
        throw Error('硬件执行轨迹与批准路线不符');
      cmd.status = 'prepared';
      job.prepared_id = p.prepared_id;
      job.commit_command = this.command(
        'route.commit',
        {
          prepared_id: p.prepared_id,
          robot_id: job.robot_id,
          stage_id: job.stage_id,
          stage_instance_id: job.stage_instance_id,
          route_revision: job.revision,
          expected_route_revision: job.expected_revision,
          switch_at_cm: job.context.fork || null,
          warning_ms: job.context.kind === 'rock' ? 2000 : 0,
          deadline_hw_mono_ms: this.now - this.sync.offset_ms + 700,
        },
        { kind: 'commit', job: job.id },
      );
      return;
    }
    if (c.kind === 'commit') {
      if (p.route_revision !== job.revision || p.robot_id !== job.robot_id)
        throw Error('路线回执目标或版本错误');
      if (p.status === 'armed') {
        if (job.context.kind === 'rock' && !this.rockStillSafe(job)) {
          this.pause('落石准备过晚，结果待核对；卡牌未扣');
          return;
        }
        cmd.status = 'armed';
        job.armed = true;
        this.robots[job.robot_id].plans[job.stage_id] = job;
        if (job.context.kind === 'rock') {
          const a = this.robots[job.context.attacker];
          a.card = false;
          a.card_pending = false;
          this.robots[job.robot_id].rock = {
            ...job.context.site,
            armed_at_ms: this.elapsed,
            active: false,
            done: false,
            attacker: job.context.attacker,
          };
          this.event(
            'rock',
            `${job.context.attacker} 投石成功，封锁对手第 ${job.stage_id} 段，预警 2 秒`,
          );
          if (job.context.card_event)
            this.emit('card.result', {
              event_id: job.context.card_event,
              accepted: true,
              consumed: true,
            });
        }
        this.maybeStart();
        return;
      }
      if (!job.armed) throw Error('未 armed 即 applied');
      this.apply(job);
      cmd.status = 'applied';
      return;
    }
    if (c.kind === 'activate') {
      this.apply(job);
      cmd.status = 'applied';
      return;
    }
    // Validate terminal receipts before recording success. A partial receipt must not
    // prevent a later valid receipt from completing a stop, or release a stopped race.
    if (
      (c.kind === 'pause' || c.kind === 'stop') &&
      (!Array.isArray(p.robots) ||
        !ROBOTS.every((id) =>
          p.robots.some((r) => r?.robot_id === id && r.stopped_confirmed === true),
        ))
    )
      throw Error('缺少双车真实停稳确认');
    if (c.kind === 'start' && this.status !== 'starting') throw Error('过期发车回执');
    if (c.kind === 'resume' && this.status !== 'paused') throw Error('过期恢复回执');
    cmd.status = p.status;
    if (c.kind === 'config') {
      if (++this.configAcks === 2) {
        this.configured = true;
        this.event('configured', '地图与比赛参数已确认');
      }
    } else if (c.kind === 'handoff-config') {
      this.handoffAcks++;
      this.maybeStart();
    } else if (c.kind === 'start') {
      this.status = 'running';
      this.elapsed = 0;
      this.event('start', '双车发车');
    } else if (c.kind === 'pause' || c.kind === 'stop') {
      ROBOTS.forEach((id) => (this.robots[id].stopped_confirmed = true));
      if (c.kind === 'stop') this.status = 'stopped';
    } else if (c.kind === 'resume') {
      for (const r of Object.values(this.robots))
        if (r.phase === 'TURNING') r.turn_started_ms += this.now - this.paused_since_ms;
      this.status = this.resumeStatus || 'running';
      this.fault = null;
      this.snapshotOK = false;
      this.event('resume', '状态核对通过，人工恢复');
      for (const r of Object.values(this.robots))
        if (r.phase === 'READY') {
          const next = r.plans[r.stage_id + 1];
          if (next?.armed)
            this.command(
              'route.activate',
              {
                robot_id: r.robot_id,
                prepared_id: next.prepared_id,
                route_revision: next.revision,
                stage_id: next.stage_id,
                stage_instance_id: next.stage_instance_id,
                handoff_id: r.handoff_id,
              },
              { kind: 'activate', job: next.id },
            );
        }
    }
  }
  apply(job) {
    const r = this.robots[job.robot_id];
    if (!activeStatuses.includes(this.status)) throw Error('暂停或停止期间不得激活路线');
    if (!job.armed || r.plans[job.stage_id]?.revision !== job.revision)
      throw Error('激活未锁定或旧版本路线');
    if (job.stage_id !== r.stage_id && !(job.stage_id === r.stage_id + 1 && r.phase === 'READY'))
      throw Error('非法跨段');
    if (job.context.fork && r.stage_id === job.stage_id) {
      const q = job.context.fork;
      if (Math.hypot(r.pose.x_cm - q[0], r.pose.y_cm - q[1]) > 0.8)
        throw Error('未在批准分叉点激活路线');
    }
    r.stage_id = job.stage_id;
    r.route_key = job.key;
    r.route_revision = job.revision;
    r.s_cm = project(job.route, r.pose).s_cm;
    r.phase = 'RUNNING';
    r.stopped_confirmed = false;
    job.applied = true;
    this.event(
      'route_applied',
      `${job.robot_id} 第 ${job.stage_id} 段路线生效：${job.key} / r${job.revision}`,
    );
  }
  poses(p) {
    if (
      !this.sync ||
      !Number.isSafeInteger(p.frame_id) ||
      p.frame_id <= this.poseFrame ||
      !Number.isFinite(p.captured_mono_ms) ||
      !Array.isArray(p.robots)
    )
      return;
    const captured = p.captured_mono_ms + this.sync.offset_ms,
      age = this.now - captured;
    if (age > 150 || age < -this.sync.uncertainty_ms - 5) {
      if (activeStatuses.includes(this.status)) this.pause('定位帧过期或时钟异常');
      return;
    }
    this.poseFrame = p.frame_id;
    for (const q of p.robots) {
      const r = this.robots[q.robot_id];
      if (!r) continue;
      if (!finitePose(q) || q.valid !== true || q.in_bounds !== true) {
        r.pose.valid = false;
        if (activeStatuses.includes(this.status)) this.pause(`${q.robot_id} 定位无效`);
        continue;
      }
      if (q.calibration_id !== this.hello?.calibration_id || q.map_revision !== MAP_REVISION)
        throw Error('定位标定或地图版本不一致');
      if (r.last_capture_ms !== null && captured <= r.last_capture_ms) continue;
      if (this.hello?.adapter_mode !== 'camera' &&
        Math.min(
          q.x_cm,
          59.8 - q.x_cm,
          q.y_cm - (CY[q.robot_id] - 8.4),
          CY[q.robot_id] + 8.4 - q.y_cm,
        ) <
        ENVELOPE - 1e-6
      )
        throw Error('车体及误差包络越界');
      if (activeStatuses.includes(this.status) || this.status === 'paused') {
        if (
          q.stage_id !== r.stage_id ||
          q.stage_instance_id !== r.stage_instances[r.stage_id] ||
          q.route_revision !== r.route_revision
        )
          throw Error('定位段实例或路线版本不一致');
        if (r.route_key && r.phase === 'RUNNING') {
          const pr = project(routeFor(q.robot_id, r.route_key), q);
          if (
            pr.distance_cm > 0.8 ||
            pr.s_cm < r.s_cm - 0.25 ||
            pr.s_cm - r.s_cm >
              Math.max(0.4, ((captured - (r.last_capture_ms ?? captured)) / 1000) * 2 + 0.2)
          )
            throw Error('定位偏离批准路线或进度跳跃');
          const pending = r.plans[r.stage_id];
          if (pending?.armed && pending.revision !== r.route_revision && pending.context.fork) {
            const [x_cm, y_cm] = pending.context.fork;
            if (pr.s_cm > project(routeFor(q.robot_id, r.route_key), { x_cm, y_cm }).s_cm + 0.15)
              throw Error('越过分叉点仍未收到路线 applied，停止核对');
          }
          r.s_cm = pr.s_cm;
        }
      }
      const prev = r.pose;
      r.pose = { ...q };
      r.last_pose_ms = this.now;
      r.last_capture_ms = captured;
      r.stopped_confirmed = q.stopped_confirmed === true;
      if (this.status === 'running') this.triggers(r, prev, captured);
    }
    this.resolveWinner();
  }
  triggers(r, prev, captured) {
    if (r.phase !== 'RUNNING' || !prev.valid) return;
    const p = r.pose,
      cy = CY[r.robot_id];
    if (r.stage_id === 1 && r.opening === 'beacon') {
      if (!r.beacon && Math.hypot(p.x_cm - 15, p.y_cm - (cy - 3)) <= 0.8) {
        r.beacon = true;
        r.gate = true;
        this.emit('game.event', {
          event_id: uid('beacon'),
          kind: 'beacon',
          robot_id: r.robot_id,
          stage_id: 1,
          gate_open: true,
        });
        this.event('beacon', `${r.robot_id} 实际经过信标，个人舱门开启`);
      }
      if (!r.beacon && p.x_cm > 20) throw Error('未取得信标权限，不得通过舱门');
      if (r.gate && p.x_cm > 21 + ENVELOPE) {
        r.gate = false;
        this.event('gate', `${r.robot_id} 整车通过，个人舱门关闭`);
      }
    }
    if (
      r.stage_id === 2 &&
      prev.x_cm > 51.8 &&
      p.x_cm <= 51.8 &&
      Math.abs(p.y_cm - cy) <= 0.8 &&
      this.quake === null
    ) {
      this.quake = this.elapsed;
      this.event('quake', '月震触发：双方共享 7 秒秘密选路');
    }
    if (
      r.stage_id === 3 &&
      r.final === 'risk' &&
      this.aftershock === null &&
      prev.x_cm < 32 &&
      p.x_cm >= 32 &&
      Math.abs(p.y_cm - cy) <= 0.8
    ) {
      this.aftershock =
        this.forcedAftershock === 'random'
          ? this.random() < RULES.collapseProbability
            ? 'collapse'
            : 'stable'
          : this.forcedAftershock;
      this.event(
        'aftershock',
        `共享余震：${this.aftershock === 'collapse' ? '塌陷，改走绕行' : '稳定'}`,
      );
      for (const id of ROBOTS) {
        const other = this.robots[id];
        if (other.final === 'risk')
          this.prepare(id, 3, `s3_${this.aftershock}${other.rock?.stage_id === 3 ? '_rock' : ''}`, {
            kind: 'aftershock',
            fork: [37, CY[id]],
            deadline: this.now + 500,
          });
      }
    }
    if (
      r.rock &&
      !r.rock.done &&
      r.stage_id === r.rock.stage_id &&
      r.route_key?.endsWith('_rock') &&
      p.x_cm - r.rock.merge_cm[0] > ENVELOPE &&
      Math.hypot(p.x_cm - r.rock.center_cm[0], p.y_cm - r.rock.center_cm[1]) > ENVELOPE + 0.5
    ) {
      r.rock.done = true;
      r.rock.active = false;
      this.event('rock_clear', `${r.robot_id} 整车通过汇合截面，障碍解除`);
    }
    if (
      r.stage_id === 3 &&
      r.finished_ms === null &&
      prev.x_cm < 51 &&
      p.x_cm >= 51 &&
      p.x_cm <= 54.3 &&
      Math.abs(p.y_cm - cy) <= 0.8 &&
      Math.abs(angleDiff(p.heading_deg, 0)) <= 10
    ) {
      r.finished_ms = captured;
      r.finish_elapsed_ms = this.elapsed;
      this.event('finish', `${r.robot_id} 实际进入终点判定区；继续驶向停车点`);
    }
  }
  resolveWinner() {
    if (this.winner) return;
    const [a, b] = ROBOTS.map((id) => this.robots[id]),
      tie = this.profile?.tie_ms || 100;
    if (a.finished_ms !== null && b.finished_ms !== null)
      this.winner =
        Math.abs(a.finished_ms - b.finished_ms) <= tie
          ? 'tie'
          : a.finished_ms < b.finished_ms
            ? a.robot_id
            : b.robot_id;
    else {
      const first = [a, b].find((r) => r.finished_ms !== null);
      if (first && this.status === 'running' && this.now - first.finished_ms > tie + 150)
        this.winner = first.robot_id;
    }
    if (this.winner)
      this.event('winner', this.winner === 'tie' ? '双车并列抵达' : `${this.winner} 率先抵达`);
  }
  robotStatus(p) {
    const r = this.robots[p.robot_id];
    if (
      !r ||
      p.stage_id !== r.stage_id ||
      p.stage_instance_id !== r.stage_instances[r.stage_id] ||
      p.route_revision !== r.route_revision
    )
      return;
    if (
      !this.sync ||
      !Number.isFinite(p.occurred_hw_mono_ms) ||
      this.now - (p.occurred_hw_mono_ms + this.sync.offset_ms) > 150 ||
      !r.pose.valid ||
      this.now - r.last_pose_ms > 150
    )
      throw Error('回转或停车状态过期，缺少有效定位');
    if (
      !finitePose(p.pose) ||
      Math.hypot(p.pose.x_cm - r.pose.x_cm, p.pose.y_cm - r.pose.y_cm) > 0.5
    )
      throw Error('回转或停车回执与最新定位不符');
    if (p.state === 'PARKED') {
      if (
        r.stage_id !== 3 ||
        r.finished_ms === null ||
        !p.stopped_confirmed ||
        !finitePose(p.pose) ||
        Math.hypot(p.pose.x_cm - 53.8, p.pose.y_cm - CY[p.robot_id]) > 0.5
      )
        throw Error('停车回执未达到停车点');
      r.parked = true;
      r.stopped_confirmed = true;
      r.phase = 'PARKED';
      if (ROBOTS.every((id) => this.robots[id].parked)) {
        this.status = 'finished';
        this.resolveWinner();
        this.event('parked', '两辆车均已停稳，本局结束');
      }
      return;
    }
    if (r.stage_id === 3 || !['TURNING', 'READY'].includes(p.state)) return;
    const expected = `${this.match}/${p.robot_id}/${r.stage_id}-${r.stage_id + 1}`,
      x = r.stage_id === 1 ? 53.8 : 16,
      heading = r.stage_id === 1 ? -180 : 0;
    if (
      p.handoff_id !== expected ||
      !finitePose(p.pose) ||
      Math.hypot(p.pose.x_cm - x, p.pose.y_cm - CY[p.robot_id]) > 0.5
    )
      throw Error('回转位置或 handoff_id 不符');
    if (!['running', 'paused'].includes(this.status)) return;
    if (p.state === 'TURNING') {
      if (r.phase !== 'RUNNING') return;
      r.phase = 'TURNING';
      r.turn_started_ms = this.now;
      r.handoff_id = expected;
      this.event('turn', `${p.robot_id} 原地回转；另一车独立前进`);
    } else {
      if (
        r.phase !== 'TURNING' ||
        !p.stopped_confirmed ||
        Math.abs(angleDiff(p.pose.heading_deg, heading)) > 5
      )
        throw Error('没有真实回转完成回执');
      const next = r.plans[r.stage_id + 1];
      if (!next?.armed) throw Error('下一段路线尚未 armed');
      r.phase = 'READY';
      r.pose = { ...r.pose, ...p.pose };
      r.stopped_confirmed = true;
      if (this.status === 'running')
        this.command(
          'route.activate',
          {
            robot_id: r.robot_id,
            prepared_id: next.prepared_id,
            route_revision: next.revision,
            stage_id: next.stage_id,
            stage_instance_id: next.stage_instance_id,
            handoff_id: expected,
          },
          { kind: 'activate', job: next.id },
        );
    }
  }
  chooseFinal(id, choice) {
    if (
      this.status !== 'running' ||
      this.quake === null ||
      this.locked ||
      !['safe', 'risk'].includes(choice) ||
      !this.robots[id]
    )
      throw Error('不在秘密选路窗口');
    const r = this.robots[id];
    if (r.secret) throw Error('已提交，不能修改');
    r.secret = choice;
    if (ROBOTS.every((id) => this.robots[id].secret)) this.lockFinal();
  }
  lockFinal() {
    if (this.locked) return;
    this.locked = true;
    for (const id of ROBOTS) {
      const r = this.robots[id];
      r.final = r.secret || 'safe';
      this.prepare(id, 3, `s3_${r.final === 'safe' ? 'safe' : 'stable'}`, { kind: 'preload' });
    }
    this.event('choice', '末段路线同时公开；未选默认归航环路');
  }
  legalRock(attacker) {
    const a = this.robots[attacker];
    if (this.status !== 'running' || !a?.card || a.card_pending) return null;
    const r = this.robots[ROBOTS.find((id) => id !== attacker)];
    if (r.rock || r.parked) return null;
    for (const stage of [...(r.stage_id === 1 ? [1] : []), ...(this.locked ? [3] : [])]) {
      const plan = r.plans[stage];
      if (
        !plan?.armed ||
        [...this.jobs.values()].some(
          (j) =>
            j.robot_id === r.robot_id &&
            j.stage_id === stage &&
            !j.armed &&
            !['rejected'].includes(this.commands.get(j.prepare_command)?.status) &&
            !['rejected'].includes(this.commands.get(j.commit_command)?.status),
        )
      )
        continue;
      const site = rockSite(stage, r.opening, r.robot_id),
        forkS = project(plan.route, { x_cm: site.fork_cm[0], y_cm: site.fork_cm[1] }).s_cm;
      const remaining = r.stage_id < stage ? Infinity : forkS - r.s_cm;
      if (remaining < 6 || r.phase !== 'RUNNING') continue;
      return {
        target: r.robot_id,
        stage,
        site,
        forkS,
        remaining_cm: Number.isFinite(remaining) ? remaining : null,
        key: `${plan.key}_rock`,
      };
    }
    return null;
  }
  attack(id, card_event = null) {
    const legal = this.legalRock(id);
    if (!legal) throw Error('无安全落点，卡牌保留');
    this.robots[id].card_pending = true;
    this.prepare(legal.target, legal.stage, legal.key, {
      kind: 'rock',
      attacker: id,
      site: legal.site,
      fork: legal.site.fork_cm,
      card_event,
    });
    this.event('rock_prepare', '正在准备绕行，收到 armed 后才扣卡');
    return legal;
  }
  rockStillSafe(job) {
    const r = this.robots[job.robot_id];
    return (
      r.stage_id < job.stage_id ||
      (r.stage_id === job.stage_id &&
        project(job.route, { x_cm: job.context.fork[0], y_cm: job.context.fork[1] }).s_cm -
          r.s_cm >=
          4.4)
    );
  }
  card(p) {
    if (
      !p.event_id ||
      !p.presence_id ||
      !ROBOTS.includes(p.robot_id) ||
      !Number.isFinite(p.captured_mono_ms)
    )
      throw Error('卡牌事件缺少标识');
    const age = this.now - (p.captured_mono_ms + this.sync.offset_ms);
    if (age > 150 || age < -5) throw Error('卡牌识别已过期');
    const key = `${p.robot_id}/${p.presence_id}`;
    if (this.cards.has(key)) {
      this.emit('card.result', {
        event_id: p.event_id,
        accepted: false,
        consumed: false,
        reason: 'DUPLICATE_PRESENCE',
      });
      return;
    }
    this.cards.set(key, p.event_id);
    try {
      if (p.card_id === 'rock') {
        this.attack(p.robot_id, p.event_id);
        return;
      }
      if (['beacon', 'outer'].includes(p.card_id)) this.chooseOpening(p.robot_id, p.card_id);
      else this.chooseFinal(p.robot_id, p.card_id);
      this.emit('card.result', { event_id: p.event_id, accepted: true, consumed: false });
    } catch (e) {
      this.emit('card.result', {
        event_id: p.event_id,
        accepted: false,
        consumed: false,
        reason: e.message,
      });
    }
  }
  pause(reason = '工作人员暂停') {
    if (!activeStatuses.includes(this.status) && this.status !== 'paused') return;
    if (this.status !== 'paused') this.resumeStatus = this.status;
    else return;
    this.status = 'paused';
    this.paused_since_ms = this.now;
    this.fault = reason;
    this.snapshotOK = false;
    this.event('pause', reason);
    this.command(
      'robot.pause',
      { robot_ids: ROBOTS, reason, freeze_pending_activations: true },
      { kind: 'pause' },
    );
  }
  stop() {
    if (this.status === 'stopped') return;
    this.status = 'stopping';
    this.snapshotOK = false;
    this.command(
      'robot.stop',
      { robot_ids: ROBOTS, cancel_routes: true, reason: 'OPERATOR_STOP' },
      { kind: 'stop' },
    );
  }
  query() {
    this.snapshotOK = false;
    this.command('state.query', { robot_ids: ROBOTS }, { kind: 'query' });
  }
  reconcile(p) {
    const cmd = this.commands.get(p.reply_to_command_id);
    if (cmd?.type !== 'state.query') return;
    cmd.status = 'completed';
    this.snapshotOK = false;
    if (
      p.map_revision !== MAP_REVISION ||
      p.calibration_id !== this.hello?.calibration_id ||
      !Array.isArray(p.robots)
    )
      return;
    this.snapshotOK =
      this.status === 'paused' &&
      ROBOTS.every((id) => {
        const q = p.robots.find((v) => v.robot_id === id),
          r = this.robots[id];
        return (
          q?.stopped_confirmed &&
          q.stage_id === r.stage_id &&
          q.stage_instance_id === r.stage_instances[r.stage_id] &&
          q.route_revision === r.route_revision &&
          finitePose(q.pose) &&
          Math.hypot(q.pose.x_cm - r.pose.x_cm, q.pose.y_cm - r.pose.y_cm) <= 0.5 &&
          q.pending_revisions?.join(',') ===
            Object.values(r.plans)
              .map((j) => j.revision)
              .join(',')
        );
      });
    this.event(
      'snapshot',
      this.snapshotOK ? '快照一致，可人工恢复' : '快照未通过；保持停止，禁止重放旧指令',
    );
  }
  resume() {
    this.assertReady();
    if (
      this.status !== 'paused' ||
      !this.snapshotOK ||
      ROBOTS.some(
        (id) => !this.robots[id].pose.valid || this.now - this.robots[id].last_pose_ms > 150,
      )
    )
      throw Error('请先获取一致且定位新鲜的停机快照');
    if (
      [...this.commands.values()].some(
        (c) => ['sent', 'unknown'].includes(c.status) && c.type !== 'state.query',
      )
    )
      throw Error('存在结果未知的命令，禁止恢复');
    this.command(
      'robot.resume',
      {
        robot_ids: ROBOTS,
        expected: ROBOTS.map((id) => ({
          robot_id: id,
          stage_id: this.robots[id].stage_id,
          route_revision: this.robots[id].route_revision,
        })),
      },
      { kind: 'resume' },
    );
  }
  tick(dt) {
    this.now += dt;
    if (this.status === 'running') {
      this.elapsed += dt;
      if (
        this.quake !== null &&
        !this.locked &&
        this.elapsed - this.quake >= RULES.choiceWindow * 1000
      )
        this.lockFinal();
      for (const r of Object.values(this.robots)) {
        if (r.rock && !r.rock.done) r.rock.active = this.elapsed - r.rock.armed_at_ms >= 2000;
        if (r.phase === 'TURNING' && this.now - r.turn_started_ms > 5000)
          this.pause(`${r.robot_id} 回转完成回执超过 5 秒`);
        if (!r.parked && (r.last_pose_ms === null || this.now - r.last_pose_ms > 150))
          this.pause(`${r.robot_id} 定位超过 150 ms 未更新`);
      }
      for (const job of this.jobs.values())
        if (job.context.deadline && this.now > job.context.deadline && !job.armed)
          this.pause('余震分支确认超过 500 ms');
      this.resolveWinner();
    }
    for (const c of this.commands.values())
      if (c.status === 'sent' && this.now > c.deadline) {
        c.status = 'unknown';
        if (['running', 'starting'].includes(this.status))
          this.pause(`${c.type} 回执超时；先查询，禁止重放`);
      }
    if (this.link && this.now - (this.lastHeartbeat || 0) >= 100) {
      this.lastHeartbeat = this.now;
      this.emit('heartbeat', { state: this.status, elapsed_ms: this.elapsed });
    }
  }
  state() {
    return {
      protocol: PROTOCOL,
      mode: this.mode,
      match_id: this.match,
      session_id: this.session,
      map_revision: MAP_REVISION,
      board: BOARD,
      limits: LIMITS,
      now_ms: this.now,
      elapsed_ms: this.elapsed,
      status: this.status,
      connected: this.link,
      handshake: !!this.hello,
      clock: this.sync,
      configured: this.configured,
      actuators_enabled: this.hello?.actuators_enabled !== false,
      adapter_mode: this.hello?.adapter_mode || null,
      calibration_id: this.hello?.calibration_id || null,
      parameters_verified: !!this.profile?.parameters_verified,
      fault: this.fault,
      snapshot_ok: this.snapshotOK,
      quake_ms: this.quake,
      choice_remaining_ms:
        this.quake === null
          ? null
          : this.locked
            ? 0
            : Math.max(0, 7000 - (this.elapsed - this.quake)),
      locked: this.locked,
      aftershock: this.aftershock,
      winner: this.winner,
      robots: ROBOTS.map((id) => {
        const r = this.robots[id];
        const { secret, plans, ...publicR } = r;
        return {
          ...publicR,
          pose: {...r.pose, valid: r.pose.valid && this.link && this.now-r.last_pose_ms<=150},
          submitted: !!secret,
          plans: Object.fromEntries(
            Object.entries(plans).map(([s, j]) => [
              s,
              { key: j.key, revision: j.revision, armed: j.armed },
            ]),
          ),
          legal_rock: this.legalRock(id),
        };
      }),
      events: this.log.slice(0, 70),
      commands: [...this.commands.entries()]
        .slice(-24)
        .map(([id, c]) => ({ command_id: id, type: c.type, status: c.status })),
      wire_count: this.wire.length,
    };
  }
}

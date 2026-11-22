import { createHash, randomUUID } from 'node:crypto';
import {
  BOARD,
  ROBOTS,
  CY,
  MAP_REVISION,
  routeFor,
  project,
  sample,
  LIMITS,
  angleDiff,
} from '../dist/sandbox/geometry.js';
import { CAPABILITIES, wrap, validEnvelope } from './protocol.mjs';
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;

// Shared route transactions, session sequencing, and per-robot stage slots.
export class RouteProtocol {
  constructor(send = () => {}) {
    this.send = send;
    this.clockId = 'hardware-simulator';
    this.calibrationId = 'sim-calibration-v03';
    this.live = false;
    this.now = 100000;
    this.seq = 0;
    this.session = null;
    this.match = null;
    this.lastSeq = 0;
    this.frame = 0;
    this.prepared = new Map();
    this.results = new Map();
    this.robots = {};
    this.running = false;
    this.paused = false;
    this.activeTime = 0;
    this.faults = {};
    this.handoffs = new Map();
    this.resetVehicles();
  }
  resetVehicles() {
    for (const id of ROBOTS)
      this.robots[id] = {
        id,
        stage: 1,
        revision: 0,
        instances: {},
        pose: { x_cm: 6, y_cm: CY[id], heading_deg: 0 },
        s: 0,
        slots: {},
        current: null,
        phase: 'IDLE',
        stopped: true,
      };
  }
  emit(type, payload) {
    this.send(wrap(type, payload, this.session, this.match, ++this.seq, this.now, this.clockId));
  }
  result(command, status, extra = {}) {
    const p = { command_id: command, status, occurred_hw_mono_ms: this.now, ...extra };
    const old = this.results.get(command);
    if (old) old.reply = p;
    if (!this.faults.drop_results) this.emit('command.result', p);
  }
  receive(m) {
    if (!validEnvelope(m)) return;
    const p = m.payload;
    if (m.type === 'hello') {
      if (this.running) this.localFault('SESSION_REPLACED');
      this.prepared.clear();
      this.results.clear();
      this.handoffs.clear();
      this.startCommand = null;
      this.resetVehicles();
      this.running = this.paused = false;
      this.map = null;
      this.activeTime = this.frame = 0;
      this.faults = {};
      this.session = m.session_id;
      this.match = m.match_id;
      this.lastSeq = m.seq;
      this.seq = 0;
      this.emit('hardware.hello', {
        capabilities: CAPABILITIES,
        board: BOARD,
        robot_ids: ROBOTS,
        calibration_id: this.calibrationId,
        parameters_verified: this.live,
        actuators_enabled: this.live,
        body_cm: [6, 6],
        turn_in_place: true,
        pose_hz: 20,
        clock_id: this.clockId,
      });
      return;
    }
    if (m.session_id !== this.session || m.match_id !== this.match || m.seq <= this.lastSeq) return;
    this.lastSeq = m.seq;
    if (m.type === 'ping') {
      this.emit('pong', { ...p, t2_hw_mono_ms: this.now, t3_hw_mono_ms: this.now });
      return;
    }
    if (m.type === 'heartbeat') {
      this.lastHeartbeat = this.now;
      return;
    }
    if (!p.command_id) return;
    const digest = createHash('sha256')
      .update(JSON.stringify(canonical({ type: m.type, payload: p })))
      .digest('hex');
    if (this.results.has(p.command_id)) {
      const old = this.results.get(p.command_id);
      if (old.digest !== digest)
        this.emit('command.result', {
          command_id: p.command_id,
          status: 'rejected',
          reason: 'COMMAND_ID_CONTENT_MISMATCH',
        });
      else if (old.reply) this.emit('command.result', old.reply);
      return;
    }
    this.results.set(p.command_id, { digest });
    try {
      const r = this.robots[p.robot_id];
      switch (m.type) {
        case 'map.configure':
          if (p.map_revision !== MAP_REVISION) throw Error('MAP_MISMATCH');
          this.map = p;
          this.result(p.command_id, 'completed');
          break;
        case 'match.configure':
          for (const s of p.stage_instances) this.robots[s.robot_id].instances = s.stage_instances;
          this.result(p.command_id, 'completed');
          this.frameNow();
          break;
        case 'route.prepare': {
          if (this.faults.reject_next_route) {
            delete this.faults.reject_next_route;
            throw Error('INJECTED_ROUTE_REJECTION');
          }
          if (
            !r ||
            r.instances[p.stage_id] !== p.stage_instance_id ||
            p.expected_route_revision !== (r.slots[p.stage_id]?.route_revision || 0)
          )
            throw Error('EXPECTED_ROUTE_MISMATCH');
          const route = routeFor(p.robot_id, p.route.key);
          if (JSON.stringify(route) !== JSON.stringify(p.route))
            throw Error('ROUTE_CONTENT_MISMATCH');
          const prepared_id = randomUUID();
          this.prepared.set(prepared_id, { ...p, prepared_id, created_ms: this.now, route });
          this.result(p.command_id, 'prepared', {
            prepared_id,
            execution_path_cm: route.waypoints_cm,
            length_cm: route.length_cm,
            expires_hw_mono_ms: this.now + 5000,
          });
          break;
        }
        case 'route.commit': {
          const plan = this.prepared.get(p.prepared_id);
          if (
            !plan ||
            !r ||
            plan.robot_id !== p.robot_id ||
            plan.route_revision !== p.route_revision ||
            plan.stage_instance_id !== p.stage_instance_id ||
            this.now > p.deadline_hw_mono_ms ||
            this.now - plan.created_ms > 5000
          )
            throw Error('INVALID_OR_EXPIRED_PREPARED');
          if (p.expected_route_revision !== (r.slots[p.stage_id]?.route_revision || 0))
            throw Error('EXPECTED_ROUTE_MISMATCH');
          if (p.switch_at_cm && r.stage === p.stage_id && r.current) {
            const s = project(r.current.route, {
              x_cm: p.switch_at_cm[0],
              y_cm: p.switch_at_cm[1],
            }).s_cm;
            if (s - r.s < (p.warning_ms ? 4.4 : 0.2)) throw Error('TOO_LATE_TO_SWITCH');
          }
          Object.assign(plan, {
            commit_id: p.command_id,
            armed_at: this.activeTime,
            warning_ms: p.warning_ms,
            switch_at_cm: p.switch_at_cm,
          });
          r.slots[p.stage_id] = plan;
          this.result(p.command_id, 'armed', { robot_id: r.id, route_revision: p.route_revision });
          break;
        }
        case 'handoff.configure':
          this.handoffs.set(`${p.robot_id}/${p.from_stage}`, p);
          this.result(p.command_id, 'completed');
          break;
        case 'match.start': {
          if (
            ROBOTS.some(
              (id) =>
                !this.robots[id].slots[1] || !this.robots[id].slots[2] || !this.robots[id].stopped,
            )
          )
            throw Error('NOT_PREPARED');
          this.startCommand = p;
          break;
        }
        case 'route.activate': {
          const plan = r?.slots[p.stage_id];
          if (!plan || plan.prepared_id !== p.prepared_id || r.phase !== 'READY' || this.paused)
            throw Error('HANDOFF_NOT_READY');
          const h = this.handoffs.get(`${r.id}/${r.stage}`);
          if (p.handoff_id !== h.handoff_id) throw Error('HANDOFF_MISMATCH');
          this.activate(r, plan, p.command_id);
          break;
        }
        case 'robot.pause':
        case 'robot.stop':
          this.paused = true;
          this.startCommand = null;
          if (m.type === 'robot.stop') {
            this.running = false;
            for (const q of Object.values(this.robots)) q.slots = {};
          }
          this.stopForCommand(p.command_id);
          break;
        case 'state.query':
          this.emit('hardware.snapshot', {
            reply_to_command_id: p.command_id,
            map_revision: MAP_REVISION,
            calibration_id: this.calibrationId,
            robots: ROBOTS.map((id) => {
              const q = this.robots[id];
              return {
                robot_id: id,
                stage_id: q.stage,
                stage_instance_id: q.instances[q.stage],
                route_revision: q.revision,
                stopped_confirmed: q.stopped,
                pose: q.pose,
                pending_revisions: Object.values(q.slots).map((x) => x.route_revision),
              };
            }),
          });
          break;
        case 'robot.resume':
          if (Object.values(this.faults).some(Boolean)) throw Error('FAULT_STILL_ACTIVE');
          if (
            !this.paused ||
            p.expected.some((x) => {
              const q = this.robots[x.robot_id];
              return (
                !q || q.stage !== x.stage_id || q.revision !== x.route_revision || !q.slots[q.stage]
              );
            })
          )
            throw Error('RESUME_STATE_MISMATCH');
          this.paused = false;
          this.running = true;
          this.result(p.command_id, 'applied');
          break;
        default:
          throw Error('UNKNOWN_COMMAND');
      }
    } catch (e) {
      this.result(p.command_id, 'rejected', { reason: e.message });
    }
  }
  stopForCommand(id) {
    for (const q of Object.values(this.robots)) q.stopped = true;
    this.result(id, 'completed', {
      robots: ROBOTS.map((robot_id) => ({ robot_id, stopped_confirmed: true })),
    });
  }
  activate(r, plan, reply = plan.commit_id) {
    r.current = plan;
    r.stage = plan.stage_id;
    r.revision = plan.route_revision;
    r.s = project(plan.route, r.pose).s_cm;
    r.phase = 'RUNNING';
    r.stopped = false;
    this.result(reply, 'applied', { robot_id: r.id, route_revision: r.revision });
  }
  status(r, state) {
    this.emit('robot.status', {
      robot_id: r.id,
      stage_id: r.stage,
      stage_instance_id: r.instances[r.stage],
      route_revision: r.revision,
      state,
      handoff_id: this.handoffs.get(`${r.id}/${r.stage}`)?.handoff_id,
      pose: { ...r.pose },
      stopped_confirmed: r.stopped,
      occurred_hw_mono_ms: this.now,
    });
  }
  localFault(code) {
    if (this.paused) return;
    this.paused = true;
    for (const r of Object.values(this.robots)) r.stopped = true;
    this.emit('fault', { code, stopped_confirmed: true });
  }
  advanceClock(dt) {
    this.now += dt;
    if (this.running && !this.paused && this.now - (this.lastHeartbeat || this.now) > 500)
      this.localFault('LOCAL_HEARTBEAT_TIMEOUT');
    if (this.startCommand && !this.paused && this.now >= this.startCommand.start_at_hw_mono_ms) {
      const p = this.startCommand;
      this.startCommand = null;
      this.running = true;
      this.paused = false;
      this.result(p.command_id, 'applied');
      for (const id of ROBOTS) this.activate(this.robots[id], this.robots[id].slots[1]);
    }
  }
}

// Ideal simulator used by the game sandbox. No motor driver.
export class HardwareSimulator extends RouteProtocol {
  tick(dt) {
    this.advanceClock(dt);
    if (this.running && !this.paused) {
      this.activeTime += dt;
      for (const r of Object.values(this.robots)) {
        if (r.phase === 'RUNNING') {
          r.stopped = false;
          let next = Math.min(r.current.route.length_cm, r.s + (2 * dt) / 1000);
          const pending = r.slots[r.stage];
          if (pending !== r.current && pending?.switch_at_cm) {
            const forkS = project(r.current.route, {
              x_cm: pending.switch_at_cm[0],
              y_cm: pending.switch_at_cm[1],
            }).s_cm;
            if (next >= forkS) {
              if (this.activeTime - pending.armed_at < pending.warning_ms) {
                this.localFault('WARNING_NOT_COMPLETE');
                break;
              }
              r.s = forkS;
              r.pose = sample(r.current.route, r.s);
              this.frameNow();
              this.activate(r, pending);
              next = r.s; // no jump or replay of travelled prefix
            }
          }
          if (
            r.current.requires_decision_at_x_cm &&
            sample(r.current.route, next).x_cm >= 37 &&
            pending === r.current
          ) {
            this.localFault('AFTERSHOCK_UNRESOLVED');
            break;
          }
          r.s = next;
          r.pose = sample(r.current.route, r.s);
          if (r.s >= r.current.route.length_cm - 1e-8) {
            r.stopped = true;
            this.frameNow();
            if (r.stage === 3) {
              r.phase = 'PARKED';
              this.status(r, 'PARKED');
            } else {
              if (!r.slots[r.stage + 1] || !this.handoffs.has(`${r.id}/${r.stage}`)) {
                this.localFault('NEXT_STAGE_NOT_PREPARED');
                break;
              }
              r.phase = 'TURNING';
              r.turnElapsed = 0;
              r.turnFrom = r.pose.heading_deg;
              this.status(r, 'TURNING');
            }
          }
        } else if (r.phase === 'TURNING') {
          r.turnElapsed += dt;
          r.stopped = false;
          const target = this.handoffs.get(`${r.id}/${r.stage}`).target_heading_deg;
          r.pose.heading_deg = angleDiff(
            r.turnFrom +
              angleDiff(target, r.turnFrom) * Math.min(1, r.turnElapsed / LIMITS.turn_ms),
            0,
          );
          if (r.turnElapsed >= LIMITS.turn_ms) {
            r.phase = 'READY';
            r.stopped = true;
            this.frameNow();
            this.status(r, 'READY');
          }
        }
      }
    }
    if (this.now - (this.lastFrame || 0) >= 50) {
      this.lastFrame = this.now;
      this.frameNow();
    }
  }
  frameNow() {
    if (!this.session || !this.map) return;
    this.emit('pose.frame', {
      frame_id: ++this.frame,
      captured_mono_ms: this.now,
      robots: ROBOTS.filter((id) => !(this.faults.drop_pose && id === 'rover-blue')).map((id) => {
        const r = this.robots[id];
        return {
          robot_id: id,
          ...r.pose,
          valid: !(this.faults.invalid_pose && id === 'rover-blue'),
          in_bounds: true,
          stopped_confirmed: r.stopped,
          stage_id: r.stage,
          stage_instance_id: r.instances[r.stage],
          route_revision: r.revision,
          map_revision: MAP_REVISION,
          calibration_id: this.calibrationId,
          quality: 1,
        };
      }),
    });
  }
}

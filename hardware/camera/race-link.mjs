// Hardware-interface client for camera commissioning. Coordinates are measured on the board.
export class CameraGameLink {
  constructor(send, showRoutes, calibrationId, clock = () => performance.now()) {
    this.send = send;
    this.showRoutes = showRoutes;
    this.calibration = calibrationId;
    this.clock = clock;
  }
  emit(type, payload) {
    this.send({ protocol: 'lunar-hw/0.3-sandbox', type, payload, session_id: this.session,
      match_id: this.match, seq: ++this.seq, clock_id: 'camera-page', sent_mono_ms: this.clock() });
  }
  receive(m) {
    if (m.protocol !== 'lunar-hw/0.3-sandbox') return;
    const p = m.payload;
    if (m.type === 'hello') {
      this.session = m.session_id; this.match = m.match_id; this.seq = 0; this.frame = 0;
      this.instances = null; this.map = null; this.lastSeq = m.seq; this.lastStamp = -Infinity;
      this.showRoutes([]);
      this.emit('hardware.hello', { adapter_mode: 'camera', capabilities: ['pose.frame','route.preview'],
        board: {width_cm:59.8,height_cm:33.6}, robot_ids:['rover-blue','rover-gold'],
        calibration_id:this.calibration, parameters_verified:false, actuators_enabled:false });
      return;
    }
    if (m.session_id !== this.session || m.match_id !== this.match || m.seq <= this.lastSeq) return;
    this.lastSeq = m.seq;
    if (m.type === 'ping') {
      this.emit('pong', {...p,t2_hw_mono_ms:this.clock(),t3_hw_mono_ms:this.clock()});
      return;
    }
    if (m.type === 'route.preview') { this.showRoutes(p.routes); return; }
    if (!p.command_id) return;
    let status = 'completed';
    if (m.type === 'map.configure' && p.calibration_id === this.calibration) this.map = p.map_revision;
    else if (m.type === 'match.configure' && this.map) this.instances = p.stage_instances;
    else status = 'rejected';
    this.emit('command.result',{command_id:p.command_id,status,occurred_hw_mono_ms:this.clock(),
      ...(status==='rejected'?{reason:'CAMERA_PREVIEW_ONLY'}:{})});
  }
  publish(stamp, measurements) {
    if (!this.instances || !Number.isFinite(stamp) || stamp<=this.lastStamp) return;
    this.lastStamp = stamp;
    const robots = this.instances.map(({robot_id,stage_instances}) => {
      const p = measurements[robot_id];
      return {robot_id,stage_id:1,stage_instance_id:stage_instances[1],route_revision:0,
        map_revision:this.map,calibration_id:this.calibration,stopped_confirmed:false,
        ...(p ? {x_cm:p.x,y_cm:p.y,heading_deg:((p.heading*180/Math.PI%360+540)%360)-180,
          valid:true,in_bounds:p.x>=0&&p.x<=59.8&&p.y>=0&&p.y<=33.6,quality:1}
          : {valid:false,in_bounds:false,quality:0})};
    });
    this.emit('pose.frame',{frame_id:++this.frame,captured_mono_ms:stamp,robots});
  }
}

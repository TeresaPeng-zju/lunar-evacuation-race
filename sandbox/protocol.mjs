export const PROTOCOL = 'lunar-hw/0.3-sandbox';
export const CAPABILITIES = [
  'pose.frame',
  'route.prepare',
  'route.commit',
  'route.activate',
  'handoff.configure',
  'independent_stages',
  'combined_routes',
  'local_watchdog',
];
export function validEnvelope(m) {
  return (
    m &&
    m.protocol === PROTOCOL &&
    typeof m.type === 'string' &&
    Number.isSafeInteger(m.seq) &&
    m.seq > 0 &&
    Number.isFinite(m.sent_mono_ms) &&
    m.payload &&
    typeof m.payload === 'object'
  );
}
export function wrap(type, payload, session, match, seq, now, clock = 'game') {
  return {
    protocol: PROTOCOL,
    type,
    session_id: session,
    match_id: match,
    seq,
    clock_id: clock,
    sent_mono_ms: now,
    payload,
  };
}
export const finitePose = (p) =>
  p && Number.isFinite(p.x_cm) && Number.isFinite(p.y_cm) && Number.isFinite(p.heading_deg);

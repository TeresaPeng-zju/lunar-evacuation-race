import { LunarWorld } from './ruins-world.js';
import { toView } from './display/map.js';
import { refineLocalRoadMaterial } from './local-refinement.js';
const params = new URLSearchParams(location.search);
const world = new LunarWorld(document.querySelector('canvas'), {
  physical: true,
  art: params.get('view') === 'station' ? 'production' : 'legacy',
  look: params.get('look') || 'unified',
  localRefinement: params.get('refinement') === 'local',
});
await world.ready;
if (params.get('view') === 'station')
  world.stationCamera = await fetch('./assets/production/station-camera.json').then((r) =>
    r.json(),
  );
if (world.localRefinement) refineLocalRoadMaterial(world);
const state = await fetch('/api/state').then((r) => r.json());
const view = toView(state);
world.controls.enabled = false;
function camera() {
  if (params.get('view') === 'station') {
    world.setView('station');
  } else if (params.get('view') === 'overview') {
    world.setView('overview');
  } else {
    world.mode = 'review';
    const a = world.width / world.height;
    const close = params.get('view') === 'building';
    const span = close ? 7.4 : 24;
    world.controls.target.set(...(close ? [-54, 4.5, 17] : [-46, 2.8, 26]));
    world.camera.position.set(...(close ? [-35, 22, 43] : [-9, 61, 91]));
    world.camera.zoom = 1;
    world.camera.left = -span * a;
    world.camera.right = span * a;
    world.camera.top = span;
    world.camera.bottom = -span;
    world.camera.lookAt(world.controls.target);
    world.camera.updateProjectionMatrix();
    world.controls.update();
  }
}
camera();
window.addEventListener('resize', () => requestAnimationFrame(camera));
function frame() {
  camera();
  world.update(view);
  requestAnimationFrame(frame);
}
frame();
document.querySelector('#status').textContent =
  `${world.localRefinement ? '局部候选' : '此前光照版'} · 实时 WebGL · 不控制比赛`;
window.lookReview = {
  world,
  snapshot: () => ({
    ...world.diagnostics(),
    camera: {
      position: world.camera.position.toArray(),
      target: world.controls.target.toArray(),
      frustum: [world.camera.left, world.camera.right, world.camera.top, world.camera.bottom],
    },
  }),
};

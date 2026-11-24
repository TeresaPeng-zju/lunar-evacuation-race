// Historical comparison entry; the same finish is now used globally in production.
import { applyRoadFinish } from './lunar-surface.js';
export function refineLocalRoadMaterial(world) {
  applyRoadFinish(world, { local: true });
}

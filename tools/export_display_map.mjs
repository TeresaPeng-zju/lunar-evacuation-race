import { writeFileSync } from 'node:fs';
import { roadNetwork, worldXY, ROBOTS, MAP_REVISION } from '../dist/display/map.js';
import { CY } from '../dist/sandbox/geometry.js';
import { elevation } from '../dist/ruins-map.js';
const anchors = ROBOTS.map((robot, id) =>
  Object.fromEntries(
    Object.entries({
      beacon: [1, 15, -3],
      gate: [1, 21, -3],
      finish: [3, 51, 0],
      parking: [3, 53.8, 0],
      quake: [2, 51.8, 0],
      source: [3, 32, 0],
    }).map(([key, [stage, x, y]]) => {
      const xy = worldXY(stage, [x, CY[robot] + y], robot);
      return [key, [...xy, elevation(...xy)]];
    }),
  ),
);
writeFileSync(
  new URL('../dist/assets/dual-screen/map.json', import.meta.url),
  JSON.stringify(
    { schema: 'moonfall-display/1', map_revision: MAP_REVISION, roads: roadNetwork(), anchors },
    null,
    2,
  ),
);

import { writeFileSync } from 'node:fs';
import { manifest } from '../dist/sandbox/geometry.js';
const map = manifest();
writeFileSync(
  new URL('../dist/assets/floor-arena/layout.json', import.meta.url),
  JSON.stringify(
    {
      ...map,
      render: {
        camera: 'orthographic_top',
        width: 3840,
        height: 2158,
        road_width_cm: 6.6,
        origin: 'top_left',
        source: 'canonical physical geometry; no camera projection transform',
      },
    },
    null,
    2,
  ),
);

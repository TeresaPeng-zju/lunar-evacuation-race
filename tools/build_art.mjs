// Runtime requires only Node. Blender is needed solely to reproduce maintained art assets.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const blender =
  process.env.MOONFALL_BLENDER ||
  (existsSync('/Applications/Blender.app/Contents/MacOS/Blender')
    ? '/Applications/Blender.app/Contents/MacOS/Blender'
    : 'blender');
const scripts = process.argv.includes('--station-review')
  ? ['tools/render_station_study.py']
  : [
      'tools/refine_local_scene.py',
      'tools/build_production_scene.py',
      'tools/render_floor_arena.py',
    ];
for (const script of scripts) {
  console.log(`Moonfall assets: ${script}`);
  const result = spawnSync(
    blender,
    ['--background', '--python-exit-code', '1', '--python', script],
    { cwd, stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || `Blender exited ${result.status}`);
    process.exit(result.status || 1);
  }
}
console.log(
  process.argv.includes('--station-review')
    ? 'Station editable study and matched-camera Cycles renders saved.'
    : 'Maintained GLBs and three orthographic floor plates rebuilt. No gameplay maps or protocol files generated or changed.',
);

// Playwright CLI run-code; start the local server and open any page on that origin.
async (page) => {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1056 });
  const samples = {};
  for (const look of ['baseline', 'unified']) {
    await page.goto(`${base}/look-review.html?look=${look}`);
    await page.waitForFunction(() => window.lookReview?.world.loaded);
    await page.waitForTimeout(1200);
    samples[look] = await page.evaluate(async () => {
      const w = lookReview.world, xz = [], xyz = [];
      let invertedNormals = 0;
      for (const road of w.roads) {
        const p = road.geometry.attributes.position, n = road.geometry.attributes.normal;
        for (let i = 0; i < p.count; i++) {
          xz.push(p.getX(i), p.getZ(i));
          xyz.push(p.getY(i));
          if (n.getY(i) < 0) invertedNormals++;
        }
      }
      const hash = await crypto.subtle.digest('SHA-256', new Float32Array(xz).buffer);
      return {
        ...lookReview.snapshot(), invertedNormals, vertexCount: xz.length / 2,
        footprintSHA256: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join(''),
        heights: xyz,
      };
    });
    await page.locator('canvas').screenshot({ path: `work/look-review/verified-${look}.png` });
  }
  const checks = [];
  const check = (name, passed) => { checks.push({ name, passed }); if (!passed) throw Error(name); };
  const a = samples.baseline, b = samples.unified;
  check('identical camera, target and frustum', JSON.stringify(a.camera) === JSON.stringify(b.camera));
  check('identical road X/Z footprint', a.footprintSHA256 === b.footprintSHA256);
  check('identical road vertex and edge counts', a.vertexCount === b.vertexCount && a.roadEdges === b.roadEdges);
  check('all corrected road normals face upward', a.invertedNormals > 0 && b.invertedNormals === 0);
  check('rover positions unchanged', JSON.stringify(a.roverPositions) === JSON.stringify(b.roverPositions));
  check('no browser or asset errors', !errors.length && !a.errors.length && !b.errors.length);
  const maxHeightCorrection = Math.max(...a.heights.map((h, i) => Math.abs(h - b.heights[i])));
  check('all road heights unchanged', maxHeightCorrection === 0);
  delete a.heights; delete b.heights;
  await page.setViewportSize({ width: 3456, height: 1942 });
  await page.goto(`${base}/look-review.html?look=unified&view=overview`);
  await page.waitForFunction(() => window.lookReview?.world.loaded);
  await page.waitForTimeout(2500);
  const highResolution = await page.evaluate(() => lookReview.snapshot());
  check('3.5K display retains adaptive render budget', highResolution.renderSize[0] * highResolution.renderSize[1] <= 1800000);
  return { checks, samples, highResolution, maxHeightCorrection, errors };
}

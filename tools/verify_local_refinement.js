// Run via playwright-cli run-code --filename=tools/verify_local_refinement.js.
async (page) => {
  const base = new URL(page.url()).origin;
  const errors = [], mutations = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!['GET', 'HEAD'].includes(r.method())) mutations.push(r.url()); });
  await page.setViewportSize({ width: 1600, height: 1056 });
  const samples = {};
  const out = '/Users/teresapeng/Documents/Codex/2026-11-19/bang/outputs/moonfall-local-refinement';
  for (const [name, query] of [['before', ''], ['after', '&refinement=local']]) {
    await page.goto(`${base}/look-review.html?look=unified${query}`);
    await page.waitForFunction(() => window.lookReview?.world.loaded);
    // Sample stable rendering after shader compilation and image decoding.
    await page.waitForTimeout(4500);
    samples[name] = await page.evaluate(async () => {
      const w = lookReview.world, coords = [], materials = {};
      for (const road of w.roads) coords.push(...road.geometry.attributes.position.array);
      const hash = await crypto.subtle.digest('SHA-256', new Float32Array(coords).buffer);
      w.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (['Lunar regolith / Moon04 PBR', 'Weathered titanium'].includes(m.name))
            materials[m.name] = { color:m.color.toArray(), normalScale:m.normalScale?.toArray(),
              map:!!m.map,normal:!!m.normalMap,roughnessMap:!!m.roughnessMap,ao:!!m.aoMap };
        }
      });
      return { ...lookReview.snapshot(), candidate:w.localRefinement,
        roadXYZHash:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),
        roadVertexCount:coords.length/3, materials,
        lighting:{exposure:w.renderer.toneMappingExposure,sun:w.sun.color.toArray(),intensity:w.sun.intensity,position:w.sun.position.toArray(),shadow:w.sun.shadow.mapSize.toArray(),ao:w.ao.blendIntensity,environment:w.scene.environmentIntensity},
      };
    });
    await page.locator('canvas').screenshot({ path:`${out}/${name}.png` });
  }
  const a=samples.before,b=samples.after,checks=[];
  const check=(name,passed)=>{checks.push({name,passed});if(!passed)throw Error(name);};
  check('identical camera and framing',JSON.stringify(a.camera)===JSON.stringify(b.camera));
  check('identical 1600 x 1000 image size',a.viewport.join(',')==='1600,1000'&&b.viewport.join(',')==='1600,1000');
  check('all road XYZ vertices unchanged',a.roadXYZHash===b.roadXYZHash&&a.roadVertexCount===b.roadVertexCount);
  check('all 164 display edges unchanged',a.roadEdges===164&&b.roadEdges===164);
  check('rover position unchanged',JSON.stringify(a.roverPositions)===JSON.stringify(b.roverPositions));
  check('accepted lighting unchanged',JSON.stringify(a.lighting)===JSON.stringify(b.lighting));
  check('existing material maps and grading retained',JSON.stringify(a.materials)===JSON.stringify(b.materials));
  check('candidate is opt-in',a.candidate===false&&b.candidate===true);
  for (const [name,query] of [['building-before',''],['building-closeup','&refinement=local']]) {
    await page.goto(`${base}/look-review.html?look=unified&view=building${query}`);
    await page.waitForFunction(()=>window.lookReview?.world.loaded);
    await page.waitForTimeout(1200);
    await page.locator('canvas').screenshot({path:`${out}/${name}.png`});
  }
  check('read-only review sends no state mutations',mutations.length===0);
  check('no browser or loading errors',!errors.length&&!a.errors.length&&!b.errors.length);
  await page.goto(`${base}/look-review.html?look=unified&refinement=local`);
  await page.waitForFunction(()=>window.lookReview?.world.loaded);
  return {checks,samples,errors,mutations};
}

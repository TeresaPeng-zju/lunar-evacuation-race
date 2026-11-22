async (page) => {
  const base = new URL(page.url()).origin;
  const control = page,
    context = page.context();
  const floor =
    context.pages().find((p) => new URL(p.url()).pathname === '/floor.html') ||
    (await context.newPage());
  const errors = [];
  for (const p of [control, floor]) p.on('pageerror', (e) => errors.push(e.message));
  await control.goto(base + '/sandbox.html');
  await control.waitForFunction(
    () => moonfallSandbox.controller() && moonfallSandbox.world()?.ready,
    null,
    { timeout: 60000 },
  );
  await floor.setViewportSize({ width: 1920, height: 1080 });
  await floor.goto(base + '/floor.html');
  await floor.waitForFunction(() => moonfallFloor.world().ready && moonfallFloor.snapshot(), null, {
    timeout: 60000,
  });
  const checks = [];
  const check = (name, ok, details = null) => {
    checks.push({ name, ok, details });
    if (!ok) throw Error(name + ' ' + JSON.stringify(details));
  };
  const wait = (fn) => control.waitForFunction(fn, null, { timeout: 45000 });
  const snapshot = () =>
    control.evaluate(() => ({ state: moonfallSandbox.snapshot(), world: moonfallSandbox.world() }));
  const shot = async (name) => {
    await control.screenshot({ path: `work/arena-proof/${name}-computer.png` });
    await floor.screenshot({ path: `work/arena-proof/${name}-floor.png` });
  };
  const sync = async (name) => {
    const a = await snapshot(),
      b = await floor.evaluate(() => ({
        state: moonfallFloor.snapshot(),
        world: moonfallFloor.world(),
      }));
    check(name + ' same match', a.state.match_id === b.state.match_id);
    check(name + ' same clock', Math.abs(a.state.elapsed_ms - b.state.elapsed_ms) < 700);
    check(
      name + ' same route and stage',
      a.state.robots.every(
        (r, i) =>
          r.stage_id === b.state.robots[i].stage_id && r.route_key === b.state.robots[i].route_key,
      ),
    );
    check(
      name + ' real floor layers',
      b.world.layers.includes('existing-glb-facilities') &&
        b.world.layers.includes('lunar-terrain'),
    );
    check(name + ' no rendering errors', !a.world.errors.length && !b.world.errors.length);
    return a;
  };
  check('floor read-only', !(await floor.evaluate(() => moonfallSandbox.controller())));
  check(
    'floor does not default to debug grid or virtual robot',
    (await floor.evaluate(() => moonfallFloor.world().debug)) === false,
  );
  check(
    'computer contains full 3D map and player controls',
    (await control.locator('#control-map').isVisible()) &&
      (await control.locator('#players').isVisible()),
  );
  const viewport = await floor.locator('#arena').boundingBox();
  check(
    'floor preserves 59.8 / 33.6 aspect',
    Math.abs(viewport.width / viewport.height - 59.8 / 33.6) < 0.002,
    viewport,
  );
  for (const outcome of ['stable', 'collapse']) {
    const status = (await snapshot()).state.status;
    if (status !== 'idle') {
      await control.locator('#reset').click();
      await wait(() => moonfallSandbox.snapshot().status === 'idle');
    }
    await control.locator('#configure').click();
    await control.locator('[data-choice="outer"][data-robot="rover-gold"]').click();
    await control.locator('#aftershock').selectOption(outcome);
    await control.locator('#speed').selectOption('4');
    await control.locator('#start').click();
    await wait(() => moonfallSandbox.snapshot().status === 'running');
    await control.locator('[data-rock="rover-gold"]').click();
    await wait(() => moonfallSandbox.snapshot().robots[0].rock);
    if (outcome === 'stable') await shot('01-rock-warning');
    await wait(
      () =>
        moonfallSandbox.snapshot().robots[0].beacon && moonfallSandbox.snapshot().robots[0].gate,
    );
    check(
      'physical beacon and gate activated on arrival',
      (await floor.evaluate(() => moonfallFloor.snapshot())).robots[0].beacon,
    );
    if (outcome === 'stable') await shot('02-open-gate');
    await wait(() => moonfallSandbox.snapshot().robots[0].route_key === 's1_beacon_rock');
    await sync(outcome + ' real bypass');
    await wait(() => new Set(moonfallSandbox.snapshot().robots.map((r) => r.stage_id)).size === 2);
    await control.locator('#pause').click();
    await wait(() => moonfallSandbox.snapshot().status === 'paused');
    await control.waitForTimeout(160);
    const before = await floor.evaluate(() => moonfallFloor.world());
    await control.waitForTimeout(350);
    const after = await floor.evaluate(() => moonfallFloor.world());
    check('independent stage artwork', new Set(after.stages).size === 2, after.stages);
    check(
      'pause freezes both screens',
      before.elapsed_ms === after.elapsed_ms &&
        (await snapshot()).state.elapsed_ms === after.elapsed_ms,
    );
    if (outcome === 'stable') await shot('03-independent-sectors');
    await control.locator('#query').click();
    await control.locator('#resume').click();
    await wait(() => moonfallSandbox.snapshot().quake_ms !== null);
    await control.locator('[data-choice="risk"][data-robot="rover-blue"]').click();
    check(
      'final choices remain secret before lock',
      (await snapshot()).state.robots.every((r) => r.final === null),
    );
    await control
      .locator(`[data-choice="${outcome === 'stable' ? 'safe' : 'risk'}"][data-robot="rover-gold"]`)
      .click();
    await wait(() => moonfallSandbox.snapshot().locked);
    await control.locator('[data-rock="rover-blue"]').click();
    await wait(() => moonfallSandbox.snapshot().robots[1].rock?.stage_id === 3);
    await control.waitForTimeout(100);
    const reserve = await floor.evaluate(() => ({
      s: moonfallFloor.snapshot(),
      w: moonfallFloor.world(),
    }));
    check(
      'future rock never drawn on current second sector',
      reserve.s.robots[1].stage_id === 2 && reserve.w.rocks[1] === false,
    );
    await wait(() => moonfallSandbox.snapshot().aftershock !== null);
    check('shared aftershock ' + outcome, (await snapshot()).state.aftershock === outcome);
    if (outcome === 'collapse') {
      await wait(() =>
        moonfallSandbox.snapshot().robots.some((r) => r.route_key === 's3_collapse_rock'),
      );
      await shot('04-collapse-bypass');
    }
    await wait(() => moonfallSandbox.snapshot().status === 'finished');
    const done = await sync(outcome + ' finish');
    check(
      'authoritative finish and both parked',
      !!done.state.winner && done.state.robots.every((r) => r.parked && r.finished_ms !== null),
    );
    await shot('05-' + outcome + '-finish');
  }
  await control.locator('#reset').click();
  await wait(() => moonfallSandbox.snapshot().status === 'idle');
  await control.waitForTimeout(150);
  check(
    'restart clears rocks',
    (await floor.evaluate(() => moonfallFloor.world())).rocks.every((v) => !v),
  );
  await floor.reload();
  await floor.waitForFunction(() => moonfallFloor.world().ready);
  check(
    'reloading floor does not take control',
    await control.evaluate(() => moonfallSandbox.controller()),
  );
  await floor.locator('#debug').click();
  check('optional coordinate inspection', await floor.evaluate(() => moonfallFloor.world().debug));
  await floor.locator('#debug').click();
  await control.waitForTimeout(3800);
  await shot('06-ready');
  check('no browser exceptions', errors.length === 0, errors);
  return {
    checks,
    errors,
    computer: await snapshot(),
    floor: await floor.evaluate(() => moonfallFloor.world()),
  };
}

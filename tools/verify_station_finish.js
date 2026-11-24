async (page) => {
  const root = 'http://127.0.0.1:4177',
    out = '/Users/teresapeng/Documents/Codex/2026-11-19/bang/outputs/moonfall-station-study';
  const checks = [],
    errors = [],
    failed = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('response', (r) => {
      if (r.status() >= 400) failed.push(r.url());
    });
  };
  watch(page);
  const check = (name, ok, details) => {
    checks.push({ name, ok, details });
    if (!ok) throw Error(name + JSON.stringify(details));
  };
  const wait = (fn) => page.waitForFunction(fn, null, { timeout: 120000 });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(root + '/?inspect=station');
  await wait(
    () => window.moonfallSandbox?.world()?.mode === 'station' && moonfallSandbox.controller(),
  );
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out + '/game-after.png' });
  check(
    'actual game loads station camera and preserved roads',
    await page.evaluate(
      () =>
        moonfallSandbox.world().roadEdges === 164 && moonfallSandbox.world().errors.length === 0,
    ),
  );
  await page.keyboard.press('a');
  await page.locator('[data-view="overview"]').click();
  await page.locator('#aftershock').selectOption('collapse');
  await page.locator('[data-robot="rover-gold"][data-choice="outer"]').click();
  await page.locator('[data-quick-start]').first().click();
  await wait(() => moonfallSandbox.snapshot().status === 'running');
  const floor = await page.context().newPage();
  watch(floor);
  await floor.setViewportSize({ width: 1920, height: 1080 });
  await floor.goto(root + '/floor.html');
  await floor.waitForFunction(() => window.moonfallFloor?.world()?.ready);
  await page.locator('[data-rock="rover-gold"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[0].beacon);
  check(
    'real arrival activates beacon',
    await page.evaluate(() => moonfallSandbox.snapshot().robots[0].beacon),
  );
  await wait(() => moonfallSandbox.snapshot().quake_ms !== null);
  await page.locator('[data-robot="rover-blue"][data-choice="risk"]').click();
  await page.locator('[data-robot="rover-gold"][data-choice="safe"]').click();
  await wait(() => moonfallSandbox.snapshot().locked);
  await wait(() => moonfallSandbox.snapshot().status === 'finished');
  const done = await page.evaluate(() => moonfallSandbox.snapshot());
  check(
    'shared collapse and both actual parked finishes',
    done.aftershock === 'collapse' && done.robots.every((r) => r.parked),
    done.robots.map((r) => ({ route: r.final, finish: r.finish_elapsed_ms })),
  );
  check(
    'rock warning and reroute preserved',
    done.events.some((e) => e.type === 'rock'),
    done.events.filter((e) => e.type === 'rock'),
  );
  await floor.reload();
  await floor.waitForFunction(
    () => moonfallFloor.snapshot()?.status === 'finished' && moonfallFloor.world().ready,
  );
  const fs = await floor.evaluate(() => moonfallFloor.snapshot());
  check(
    'floor reload recovers same winner and positions',
    fs.winner === done.winner &&
      fs.match_id === done.match_id &&
      JSON.stringify(fs.robots.map((r) => r.pose)) ===
        JSON.stringify(done.robots.map((r) => r.pose)),
  );
  await page.screenshot({ path: out + '/game-result.png' });
  await page.keyboard.press('a');
  await page.locator('#reset').click();
  await wait(() => moonfallSandbox.snapshot().status === 'idle');
  await page.locator('#aftershock').selectOption('random');
  await page.keyboard.press('a');
  check('restart restores choices', await page.locator('.opening-routes').first().isVisible());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out + '/panorama.png' });
  await floor.locator('#floor-map').screenshot({ path: out + '/floor.png' });
  check('no browser exceptions or resource failures', !errors.length && !failed.length, {
    errors,
    failed,
  });
  await floor.close();
  return { checks, errors, failed, realHardwareTested: false };
}

async (page) => {
  const out = '/Users/teresapeng/Documents/Codex/2026-11-19/bang/outputs/moonfall-instrument-hud';
  const checks = [],
    errors = [],
    failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  const check = (name, ok, details) => {
    checks.push({ name, ok, details });
    if (!ok) throw Error(name + ' ' + JSON.stringify(details));
  };
  const wait = (fn) => page.waitForFunction(fn, null, { timeout: 120000 });
  await page.reload();
  await wait(() => moonfallSandbox.controller() && moonfallSandbox.world()?.ready);
  await page.keyboard.press('a');
  await page.locator('[data-view="overview"]').click();
  await page.keyboard.press('a');
  await page.setViewportSize({ width: 1920, height: 1080 });
  const initial = await page.locator('.player').evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }),
  );
  check(
    'modules one third shorter than previous 140px',
    initial.every((r) => r.height <= 100 && r.height >= 85),
    initial,
  );
  check(
    'button hit targets at least 44px',
    await page
      .locator('.opening-routes button')
      .evaluateAll((es) => es.every((e) => e.getBoundingClientRect().height >= 44)),
  );
  const blue = page.locator('[data-robot="rover-blue"][data-choice="outer"]');
  const gold = page.locator('[data-robot="rover-gold"][data-choice="outer"]');
  await blue.click();
  await wait(() => moonfallSandbox.snapshot().robots[0].opening === 'outer');
  check(
    'blue state drives route feedback',
    await page.evaluate(
      () =>
        moonfallSandbox.world().routePulses[0]?.prefix === 's1_outer' &&
        moonfallSandbox.world().routePulses[0]?.age_ms < 1000,
    ),
  );
  await gold.click();
  await wait(() => moonfallSandbox.snapshot().robots[1].opening === 'outer');
  check(
    'gold state drives route feedback',
    await page.evaluate(
      () =>
        moonfallSandbox.world().routePulses[1]?.prefix === 's1_outer' &&
        moonfallSandbox.world().routePulses[1]?.age_ms < 1000,
    ),
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus = await gold.evaluate((e) => {
    const s = getComputedStyle(e);
    return {
      focus: e.matches(':focus-visible'),
      outline: s.outlineColor,
      border: s.borderColor,
      bg: s.backgroundColor,
      pressed: e.getAttribute('aria-pressed'),
    };
  });
  check(
    'gold keyboard focus and selection use warm gold',
    focus.focus && focus.outline === 'rgb(218, 187, 130)' && focus.pressed === 'true',
    focus,
  );
  await gold.hover();
  const hover = await gold.evaluate((e) => getComputedStyle(e).borderColor);
  await page.waitForTimeout(180);
  check(
    'gold hover never inherits cyan',
    (await gold.evaluate((e) => getComputedStyle(e).borderColor)) === 'rgb(218, 187, 130)',
    hover,
  );
  await page.screenshot({ animations: 'disabled', path: out + '/selected-and-focus.png' });
  await page.mouse.move(960, 600);
  await page.waitForTimeout(1100);
  check(
    'selection flash expires without looping',
    await page.evaluate(() => moonfallSandbox.world().routePulses.every((p) => p.age_ms > 950)),
  );
  // Restore blue beacon route; yellow remains on outer route. Both are real server updates.
  await page.locator('[data-robot="rover-blue"][data-choice="beacon"]').click();
  await page.keyboard.press('a');
  await page.locator('#configure').click();
  await page.locator('#aftershock').selectOption('stable');
  await page.locator('#start').click();
  await wait(() => moonfallSandbox.snapshot().status === 'running');
  await page.keyboard.press('a');
  await page.locator('[data-rock="rover-gold"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[0].beacon);
  await page.screenshot({ animations: 'disabled', path: out + '/in-race.png' });
  await wait(() => moonfallSandbox.snapshot().quake_ms !== null);
  await page.locator('[data-robot="rover-blue"][data-choice="risk"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[0].submitted);
  check(
    'secret submission does not reveal the route',
    await page.evaluate(
      () =>
        moonfallSandbox.snapshot().robots[0].final === null &&
        moonfallSandbox.world().routePulses[0]?.prefix === 's1_beacon',
    ),
  );
  await page.locator('[data-robot="rover-gold"][data-choice="safe"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[1].submitted);
  await page.screenshot({ animations: 'disabled', path: out + '/secret-selection.png' });
  await wait(() => moonfallSandbox.snapshot().locked);
  check(
    'both final routes flash only on authoritative reveal',
    await page.evaluate(
      () =>
        moonfallSandbox.world().routePulses[0]?.prefix === 's3_stable' &&
        moonfallSandbox.world().routePulses[1]?.prefix === 's3_safe',
    ),
  );
  await page.screenshot({ animations: 'disabled', path: out + '/routes-revealed.png' });
  await wait(() => moonfallSandbox.snapshot().status === 'finished');
  check(
    'both chosen routes finish and park',
    await page.evaluate(
      () =>
        moonfallSandbox.snapshot().robots.every((r) => r.parked) &&
        moonfallSandbox.snapshot().robots[0].final === 'risk' &&
        moonfallSandbox.snapshot().robots[1].final === 'safe',
    ),
  );
  check('result remains visible', await page.locator('#venue-result').isVisible());
  await page.screenshot({ animations: 'disabled', path: out + '/result.png' });
  await page.keyboard.press('a');
  await page.locator('#reset').click();
  await wait(() => moonfallSandbox.snapshot().status === 'idle');
  await page.locator('#aftershock').selectOption('random');
  await page.keyboard.press('a');
  check(
    'reset restores controls and clears flashes',
    (await page.locator('.opening-routes').first().isVisible()) &&
      (await page.evaluate(() => moonfallSandbox.world().routePulses.every((p) => p === null))),
  );
  const verifyLabels = async (size, minimum = 2) => {
    await page.setViewportSize(size);
    await page.waitForTimeout(600);
    const result = await page.locator('.instrument-label').evaluateAll((es) => {
      const rs = es
        .filter((e) => !e.hidden && e.offsetWidth)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.textContent };
        });
      const clash = (a, b) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      return {
        labels: rs,
        inside: rs.every(
          (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= innerWidth && r.y + r.h <= innerHeight,
        ),
        overlap: rs.some((a, i) => rs.some((b, j) => i < j && clash(a, b))),
      };
    });
    check(
      `labels stay readable at ${size.width}`,
      result.inside && !result.overlap && result.labels.length >= minimum,
      result,
    );
  };
  await verifyLabels({ width: 3456, height: 1944 });
  await page.screenshot({ animations: 'disabled', path: out + '/full-interface-3.5k.png' });
  await verifyLabels({ width: 900, height: 700 });
  await page.screenshot({ animations: 'disabled', path: out + '/small-layout.png' });
  // Zoom and orbit use the existing camera controls; check edge clipping rather than moving anchors.
  await page.mouse.move(450, 300);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(700);
  await verifyLabels({ width: 900, height: 700 }, 0);
  await page.keyboard.press('a');
  await page.locator('[data-view="overview"]').click();
  await page.keyboard.press('a');
  await verifyLabels({ width: 1920, height: 1080 });
  await page.waitForTimeout(2800);
  await page.screenshot({ animations: 'disabled', path: out + '/full-interface.png' });
  const readonly = await page.context().newPage();
  await readonly.goto(new URL(page.url()).origin + '/');
  await readonly.waitForFunction(() => moonfallSandbox.snapshot() && !moonfallSandbox.controller());
  const disabled = await readonly
    .locator('[data-robot="rover-gold"][data-choice="beacon"]')
    .evaluate((e) => ({
      disabled: e.disabled,
      opacity: getComputedStyle(e).opacity,
      color: getComputedStyle(e).color,
      height: e.getBoundingClientRect().height,
    }));
  check(
    'read-only disabled controls remain legible and cannot send actions',
    disabled.disabled && disabled.opacity === '1' && disabled.height >= 44,
    disabled,
  );
  await readonly.close();
  check('no page or resource errors', !errors.length && !failed.length, { errors, failed });
  return { checks, errors, failed, realHardwareTested: false };
};

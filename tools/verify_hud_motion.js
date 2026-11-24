async (page) => {
  const out = '/Users/teresapeng/Documents/Codex/2026-11-19/bang/outputs/moonfall-hud-motion';
  const checks = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    if (!ok) throw Error(name + ' ' + JSON.stringify(detail));
  };
  const wait = (fn) => page.waitForFunction(fn, null, { timeout: 120000 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await wait(() => window.moonfallSandbox?.controller() && moonfallSandbox.world()?.ready);
  await page.keyboard.press('a');
  await page.locator('[data-view="overview"]').click();
  await page.keyboard.press('a');
  await page.waitForTimeout(1000);
  check('both panels await opening choice', (await page.locator('.awaiting-choice').count()) === 2);
  const dash = await page
    .locator('.awaiting-choice .panel-flow rect')
    .first()
    .evaluate((e) => ({
      offset: getComputedStyle(e).strokeDashoffset,
      duration: getComputedStyle(e).animationDuration,
    }));
  await page.waitForTimeout(500);
  check(
    'perimeter moves on 5.6s cycle',
    dash.duration === '5.6s' &&
      dash.offset !==
        (await page
          .locator('.awaiting-choice .panel-flow rect')
          .first()
          .evaluate((e) => getComputedStyle(e).strokeDashoffset)),
    dash,
  );
  await page.screenshot({ path: out + '/waiting.png' });
  await page.screencast.start({
    path: out + '/selection-feedback.webm',
    size: { width: 1920, height: 1080 },
    fps: 30,
  });
  await page.screencast.showActions({
    duration: 450,
    style: {
      title: 'display:none',
      point: 'width:10px;height:10px;border-radius:50%;background:rgba(210,226,232,.5)',
    },
  });
  await page.waitForTimeout(5600);
  await page.locator('[data-robot="rover-blue"][data-choice="beacon"]').click();
  await wait(() =>
    document.querySelector('[data-player="rover-blue"]').classList.contains('selection-confirmed'),
  );
  check(
    'click default route is acknowledged and pulses map',
    await page.evaluate(() => moonfallSandbox.world().routePulses[0]?.prefix === 's1_beacon'),
  );
  check(
    'blue stops orbit, waits for opponent',
    (await page.locator('.awaiting-choice').count()) === 1 &&
      (await page.locator('[data-player="rover-blue"] .venue-player-hint').textContent()) ===
        '等待对方',
  );
  await page.waitForTimeout(2200);
  await page.locator('[data-robot="rover-gold"][data-choice="outer"]').click();
  await wait(() => document.querySelectorAll('.selection-confirmed').length === 2);
  check(
    'gold confirms independently',
    (await page.locator('.awaiting-choice').count()) === 0 &&
      (await page.evaluate(() => moonfallSandbox.world().routePulses[1]?.prefix === 's1_outer')),
  );
  await page.waitForTimeout(2200);
  await page.locator('[data-robot="rover-blue"][data-choice="outer"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[0].opening === 'outer');
  check(
    'reselection uses actual chosen route',
    await page.evaluate(() => moonfallSandbox.world().routePulses[0]?.prefix === 's1_outer'),
  );
  await page.waitForTimeout(1600);
  await page.locator('[data-robot="rover-blue"][data-choice="beacon"]').click();
  await page.waitForTimeout(2000);
  check(
    'confirmed border stays static',
    await page.evaluate(() =>
      [...document.querySelectorAll('.panel-flow')].every(
        (e) => e.getAnimations({ subtree: true }).length === 0,
      ),
    ),
  );
  await page.locator('#admin-toggle').focus();
  await page.waitForTimeout(900);
  check(
    'admin accessible tooltip',
    (await page.locator('#admin-toggle').getAttribute('aria-label')) === '管理设置',
  );
  await page.screenshot({ path: out + '/selected.png' });
  await page.screencast.stop();
  await page.keyboard.press('a');
  await page.locator('[data-quick-start]').first().click();
  await wait(() => moonfallSandbox.snapshot().status === 'running');
  await wait(() => moonfallSandbox.snapshot().quake_ms !== null);
  check(
    'next phase resumes both waiting traces',
    (await page.locator('.awaiting-choice').count()) === 2,
  );
  await page.locator('[data-robot="rover-blue"][data-choice="risk"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[0].submitted);
  check(
    'secret choice stops trace without revealing path',
    (await page.locator('.awaiting-choice').count()) === 1 &&
      (await page.evaluate(
        () =>
          moonfallSandbox.snapshot().robots[0].final === null &&
          moonfallSandbox.world().routePulses[0].prefix === 's1_beacon',
      )),
  );
  await page.locator('[data-robot="rover-gold"][data-choice="safe"]').click();
  await wait(() => moonfallSandbox.snapshot().robots[1].submitted);
  await page.screenshot({ path: out + '/next-stage.png' });
  await wait(() => moonfallSandbox.snapshot().locked);
  check(
    'final routes highlight only at reveal',
    await page.evaluate(
      () =>
        moonfallSandbox.world().routePulses[0]?.prefix === 's3_stable' &&
        moonfallSandbox.world().routePulses[1]?.prefix === 's3_safe',
    ),
  );
  await wait(() => moonfallSandbox.snapshot().status === 'finished');
  check(
    'both cars finish',
    await page.evaluate(() => moonfallSandbox.snapshot().robots.every((r) => r.parked)),
  );
  await page.keyboard.press('a');
  await page.locator('#reset').click();
  await wait(() => moonfallSandbox.snapshot().status === 'idle');
  await page.keyboard.press('a');
  check('new match restores waiting', (await page.locator('.awaiting-choice').count()) === 2);
  for (const size of [
    { width: 3456, height: 1944 },
    { width: 900, height: 700 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    const bounds = await page.evaluate(() => {
      const svg = document.querySelector('.instrument-leaders');
      const { width, height } = svg.viewBox.baseVal;
      const labels = [...document.querySelectorAll('.instrument-label')]
        .filter((e) => !e.hidden)
        .map((e) => ({
          x: parseFloat(e.style.left),
          y: parseFloat(e.style.top),
          w: e.offsetWidth,
          h: e.offsetHeight,
        }));
      const paths = [...svg.querySelectorAll('g')]
        .filter((e) => e.style.display !== 'none')
        .map((e) => e.getBBox());
      return {
        count: labels.length,
        inside: labels.every(
          (r) => r.x >= 24 && r.y >= 24 && r.x + r.w <= width - 24 && r.y + r.h <= height - 24,
        ),
        lines: paths.every(
          (r) =>
            r.x >= 21 && r.y >= 21 && r.x + r.width <= width - 21 && r.y + r.height <= height - 21,
        ),
      };
    });
    check(
      'labels and leaders within safe frame ' + size.width,
      bounds.inside && bounds.lines,
      bounds,
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(
    'reduced motion has no orbit',
    await page
      .locator('.awaiting-choice .panel-flow rect')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName === 'none'),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const readonly = await page.context().newPage();
  await readonly.goto(new URL(page.url()).origin + '/');
  await readonly.waitForFunction(() => window.moonfallSandbox?.snapshot());
  check(
    'readonly does not invite choices',
    (await readonly.locator('.awaiting-choice').count()) === 0,
  );
  await readonly.close();
  check('no browser exceptions', !errors.length, errors);
  return { checks, errors, realHardwareTested: false };
}

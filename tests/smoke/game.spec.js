// Browser smoke test: does the real game load and run in a real browser?
// "Smoke test" comes from electronics: switch it on and check nothing catches fire.

import { test, expect } from '@playwright/test';

// Headless browsers draw 3D in software, which is slow. Use the lowest graphics
// settings and a smaller window so the test doesn't crawl.
test.use({ viewport: { width: 960, height: 540 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fireteam.settings', JSON.stringify({ version: 1, values: { quality: 'low' } }));
  });
});

test('the game loads, runs without errors, and the player can walk', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });

  await page.goto('/?autostart');
  await page.waitForFunction(() => window.fireteam?.ready, null, { timeout: 30_000 });
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();

  // Wait until the game loop has run a while (the player has landed), then hold W.
  await page.waitForFunction(() => window.fireteam.loop.tick > 30, null, { timeout: 30_000 });
  const start = await page.evaluate(() => ({ ...window.fireteam.player.state.pos }));
  const startTick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 60, startTick, { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => ({ ...window.fireteam.player.state.pos }));
  expect(start.z - end.z, 'walked north').toBeGreaterThan(1.5);

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(problems).toEqual([]);
});

test('a controller: the menus, walking, turning and pausing', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  // A pretend controller the test can push around (browsers can't fake a real one).
  await page.addInitScript(() => {
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.testPad = {
      press(i, on) { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp++; },
      axes(a) { pad.axes = a; pad.timestamp++; },
    };
    navigator.getGamepads = () => [pad, null, null, null];
  });
  await page.goto('/?nolock');
  await page.waitForFunction(() => window.fireteam?.ready && window.fireteam.flow.is('title'), null, { timeout: 30_000 });
  // Start (on the title screen) plays.
  await page.evaluate(() => window.testPad.press(9, true));
  await page.waitForFunction(() => window.fireteam.flow.is('playing'), null, { timeout: 15_000 });
  await page.evaluate(() => window.testPad.press(9, false));
  await page.waitForFunction(() => window.fireteam.loop.tick > 30, null, { timeout: 30_000 });
  const start = await page.evaluate(() => ({ ...window.fireteam.player.state.pos, yaw: window.fireteam.input.yaw }));
  await page.evaluate(() => window.testPad.axes([0, -1, 0.7, 0])); // forward, and turn right
  const tick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 60, tick, { timeout: 30_000 });
  await page.evaluate(() => window.testPad.axes([0, 0, 0, 0]));
  const end = await page.evaluate(() => ({ ...window.fireteam.player.state.pos, yaw: window.fireteam.input.yaw }));
  expect(Math.hypot(end.x - start.x, end.z - start.z), 'walked').toBeGreaterThan(1.5);
  expect(start.yaw - end.yaw, 'turned right').toBeGreaterThan(0.2);
  expect(await page.evaluate(() => window.fireteam.input.device)).toBe('pad');
  // Start pauses; the D-pad moves between the pause menu's buttons; B resumes.
  await page.evaluate(() => window.testPad.press(9, true));
  await page.waitForFunction(() => window.fireteam.flow.is('paused'), null, { timeout: 15_000 });
  await page.evaluate(() => { window.testPad.press(9, false); window.testPad.press(13, true); });
  await page.waitForFunction(() => document.activeElement?.tagName === 'BUTTON', null, { timeout: 15_000 });
  await page.evaluate(() => { window.testPad.press(13, false); window.testPad.press(1, true); });
  await page.waitForFunction(() => window.fireteam.flow.is('playing'), null, { timeout: 15_000 });
  expect(problems).toEqual([]);
});

test('the title screen and settings open', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.fireteam?.ready, null, { timeout: 30_000 });
  await expect(page.locator('#title')).toBeVisible();
  await page.click('#btnSettingsT');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settingsForm .setting')).toHaveCount(20);
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.click('#btnSettingsDone');
  await expect(page.locator('#settings')).toBeHidden();
  await page.screenshot({ path: 'test-results/title.png' });
});

test('shooting works: ammo goes down, a target gets hit, the kill house timer starts', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });

  await page.goto('/?autostart');
  await page.waitForFunction(() => window.fireteam?.ready && window.fireteam.loop.tick > 40, null, { timeout: 30_000 });

  // Stand in the range's second lane, 5 m from the 10 m target, and aim at its chest.
  // (From the 10 m line, hip-fire spread meant a burst of six could all miss now
  // and then: about one run in eight failed, on luck alone.)
  await page.evaluate(() => {
    const f = window.fireteam;
    window.hits = 0;
    f.events.on('target:hit', () => window.hits++);
    f.player.teleport([44.5, 0, -12], 0);
    f.input.setLook(0, Math.atan2(1.18 - 1.68, 5));
  });
  await page.waitForFunction(() => window.fireteam.soldier.arsenal.current.status === 'ready', null, { timeout: 30_000 });
  const startTick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.mouse.down();
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 20, startTick, { timeout: 30_000 });
  await page.mouse.up();
  const after = await page.evaluate(() => ({ mag: window.fireteam.soldier.arsenal.current.mag, hits: window.hits }));
  expect(after.mag).toBeLessThan(30);
  expect(after.hits).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/range.png' });

  // Step onto the kill house start pad, then off it.
  await page.evaluate(() => window.fireteam.player.teleport([-30, 0, 12.5], Math.PI));
  await page.waitForFunction(() => window.fireteam.course.state === 'ready', null, { timeout: 30_000 });
  await page.evaluate(() => window.fireteam.player.teleport([-30, 0, 15.5], Math.PI));
  await page.waitForFunction(() => window.fireteam.course.state === 'running', null, { timeout: 30_000 });
  await expect(page.locator('#course')).toBeVisible();
  await page.screenshot({ path: 'test-results/killhouse.png' });

  expect(problems).toEqual([]);
});

test('the Compound: you can drop an enemy, and the rest fight back', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });

  await page.goto('/?map=compound&autostart');
  await page.waitForFunction(() => window.fireteam?.ready && window.fireteam.loop.tick > 30, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.fireteam.enemies.list.length)).toBe(16);
  // The soldiers are the animated, skinned characters (render/character.js), not the fallback,
  // and their skeletons move (the idle clip breathes).
  expect(await page.evaluate(() => window.fireteam.assets.failed)).toEqual([]);
  const bone = () => page.evaluate(() => {
    const v = [...window.fireteam.mission.enemiesView.views.values()][0];
    return { kind: v.model.kind, q: v.model.bone('spine_02').quaternion.toArray() };
  });
  const before = await bone();
  expect(before.kind).toBe('skinned');
  await page.waitForTimeout(500);
  expect((await bone()).q).not.toEqual(before.q);

  // Hold everyone still, step in 3.5 m in front of the gate guard, and aim at their chest.
  await page.evaluate(() => {
    const f = window.fireteam;
    f.health.godMode = true; // the test shouldn't fail just because we lost a fight
    f.enemies.options.freeze = true;
    window.enemyShots = 0;
    f.events.on('weapon:fire', (e) => { if (e.owner !== 0) window.enemyShots++; });
    const guard = f.enemies.list[0];
    f.soldier.teleport([guard.pos.x, 0, guard.pos.z + 3.5], 0);
    f.input.setLook(0, Math.atan2(1.15 - 1.68, 3.5));
  });
  await page.waitForFunction(() => window.fireteam.soldier.arsenal.current.status === 'ready', null, { timeout: 30_000 });
  const startTick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.mouse.down();
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 45, startTick, { timeout: 30_000 });
  await page.mouse.up();
  await page.waitForFunction(() => window.fireteam.enemies.alive.length === 15, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.fireteam.ragdolls.count)).toBeGreaterThan(0);
  await expect(page.locator('#feed')).toContainText('down');
  await page.screenshot({ path: 'test-results/compound-kill.png' });

  // Now let them fight: someone should shoot at us.
  await page.evaluate(() => { window.fireteam.enemies.options.freeze = false; });
  await page.waitForFunction(() => window.enemyShots > 0, null, { timeout: 90_000 });
  await expect(page.locator('#course')).toContainText('hostiles left');
  await page.screenshot({ path: 'test-results/compound-fight.png' });

  expect(problems).toEqual([]);
});

test('the Harbour: a mission loads, you can walk, the objective shows, and it draws in few batches', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });

  await page.goto('/?map=harbour-rescue&autostart');
  await page.waitForFunction(() => window.fireteam?.ready && window.fireteam.loop.tick > 30, null, { timeout: 90_000 });
  await expect(page.locator('#course')).toBeVisible();
  await expect(page.locator('#course')).toHaveClass(/mission/);
  await expect(page.locator('#courseInfo')).toHaveText('Find the hostage and free them');
  // "One of these buildings": a "?" over each place the hostage might be.
  await expect(page.locator('#marks .mark.search:visible')).toHaveCount(3);
  await expect(page.locator('#grenades')).toContainText('●●');
  expect(await page.evaluate(() => window.fireteam.soldier.arsenal.current.reserve)).toBeGreaterThan(0);

  const start = await page.evaluate(() => ({ ...window.fireteam.player.state.pos }));
  const startTick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 60, startTick, { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => ({ ...window.fireteam.player.state.pos }));
  expect(Math.hypot(end.x - start.x, end.z - start.z), 'walked').toBeGreaterThan(1.5);

  // DRAW CALLS: how many times one frame asks the graphics card to draw something
  // (lesson 16). The level is joined into batches per material and 32 m tile; this
  // catches it being drawn piece by piece again (that was about 365 here).
  const calls = await page.evaluate(() => {
    const f = window.fireteam, r = f.view.renderer;
    r.info.autoReset = false;
    r.info.reset();
    r.render(f.view.scene, f.view.camera);
    r.info.autoReset = true;
    return r.info.render.calls;
  });
  expect(calls).toBeLessThan(260);
  await page.screenshot({ path: 'test-results/harbour.png' });
  expect(problems).toEqual([]);
});

test('changing map needs no page reload, and leaves nothing behind', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });

  await page.goto('/?map=proving-ground');
  await page.waitForFunction(() => window.fireteam?.ready && window.fireteam.loop.tick > 10, null, { timeout: 30_000 });
  await page.evaluate(() => { window.samePage = true; }); // a reload would wipe this
  const measure = () => page.evaluate(() => {
    const f = window.fireteam;
    return {
      children: f.view.scene.children.length,
      geometries: f.view.renderer.info.memory.geometries,
      textures: f.view.renderer.info.memory.textures,
      slots: document.querySelectorAll('#slots span').length,
      panels: document.querySelectorAll('.lil-gui.root').length,
      marks: document.querySelectorAll('#marks > *').length,
      loops: f.audio.loops,
    };
  });
  const before = await measure();

  // A mission, with the helicopter in the air (its rotor is a looping sound that must stop).
  await page.click('[data-map="harbour-rescue"]');
  await page.waitForFunction(() => window.fireteam.map === 'harbour-rescue' && window.fireteam.session?.operation, null, { timeout: 90_000 });
  await page.evaluate(() => {
    const sim = window.fireteam.mission.sim;
    const me = sim.player(0);
    sim.operation.spots()[0].done(me);                 // the hostage: freed
    sim.operation.spots().find((s) => s.kind === 'radio').done(me); // the helicopter: called
    sim.operation.objective.heli.t = 45;               // ...and nearly here
  });
  await page.waitForFunction(() => window.fireteam.mission.heli.state.here && window.fireteam.audio.loops === 1, null, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/map-harbour.png' });

  await page.click('#mapCompound');
  await page.waitForFunction(() => window.fireteam.map === 'compound' && window.fireteam.enemies?.list.length === 16, null, { timeout: 60_000 });
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#mapCompound')).toHaveAttribute('aria-checked', 'true');
  expect(page.url()).toContain('map=compound');
  await page.screenshot({ path: 'test-results/map-compound.png' });

  await page.click('#mapProving');
  await page.waitForFunction(() => window.fireteam.map === 'proving-ground', null, { timeout: 60_000 });
  const tick = await page.evaluate(() => window.fireteam.loop.tick);
  await page.waitForFunction((t) => window.fireteam.loop.tick > t + 10, tick, { timeout: 30_000 });
  const after = await measure();

  expect(await page.evaluate(() => window.samePage)).toBe(true);
  // Same scenery as at the start: the Compound's meshes, HUD bits and tuning panel are all gone.
  expect(after.children).toBe(before.children);
  expect(after.slots).toBe(before.slots);
  expect(after.panels).toBe(before.panels);
  expect(after.marks).toBe(before.marks);
  expect(after.loops).toBe(0); // no rotor still turning on the practice range
  expect(after.geometries).toBeLessThanOrEqual(before.geometries + 2);
  expect(after.textures).toBeLessThanOrEqual(before.textures + 2);
  expect(problems).toEqual([]);
});

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

test('the title screen and settings open', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.fireteam?.ready, null, { timeout: 30_000 });
  await expect(page.locator('#title')).toBeVisible();
  await page.click('#btnSettingsT');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settingsForm .setting')).toHaveCount(13);
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

  // Stand at the range's second lane and aim at the 10 m target's chest.
  await page.evaluate(() => {
    const f = window.fireteam;
    window.hits = 0;
    f.events.on('target:hit', () => window.hits++);
    f.player.teleport([44.5, 0, -5.2], 0);
    f.input.setLook(0, Math.atan2(1.18 - 1.68, 11.8));
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

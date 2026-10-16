// Co-op in two browser tabs, talking over BroadcastChannel (?net=local), so it
// needs no internet: one tab hosts, the other joins with the room code, they
// start the Compound together, the friend walks (the host sees it) and shoots
// an enemy (it goes down on both screens).

import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 800, height: 450 } });
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('fireteam.settings', JSON.stringify({ version: 1, values: { quality: 'low' } }));
  });
});

const watch = (page, name, problems) => {
  page.on('pageerror', (err) => problems.push(`${name} page error: ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`${name} console error: ${msg.text()}`); });
};

test('co-op in two tabs: host, join, play the Compound together', async ({ context }) => {
  test.setTimeout(180_000);
  const problems = [];
  const host = await context.newPage();
  const friend = await context.newPage();
  watch(host, 'host', problems);
  watch(friend, 'friend', problems);

  // ---- the host opens a room
  await host.goto('/?net=local&map=compound&nolock');
  await host.waitForFunction(() => window.fireteam?.ready, null, { timeout: 60_000 });
  await host.locator('#callsign').fill('Alpha');
  await host.locator('#callsign').press('Tab');
  await host.click('#btnHost');
  await expect(host.locator('#roomCode')).toHaveText(/^[A-Z]{5}$/, { timeout: 10_000 });
  const code = await host.locator('#roomCode').textContent();

  // ---- the friend follows the invite link
  await friend.goto(`/?net=local&map=proving-ground&nolock&join=${code}`);
  await friend.waitForFunction(() => window.fireteam?.ready, null, { timeout: 60_000 });
  await expect(friend.locator('#join')).toBeVisible();
  await expect(friend.locator('#joinCode')).toHaveValue(code);
  await friend.locator('#callsign').evaluate((el) => { el.value = 'Bravo'; el.dispatchEvent(new Event('change')); });
  await friend.click('#btnJoinGo');
  await expect(friend.locator('#lobby')).toBeVisible();
  await expect(host.locator('#roster li:not(.empty)')).toHaveCount(2);
  await expect(host.locator('#roster')).toContainText('Bravo');
  await expect(friend.locator('#roster')).toContainText('Alpha');
  await expect(friend.locator('#btnStart')).toBeHidden(); // only the host starts
  await host.screenshot({ path: 'test-results/coop-lobby.png' });

  // ---- start: both load the Compound; the host adds the friend's soldier
  await host.click('#btnStart');
  await host.waitForFunction(() => window.fireteam.session?.clients?.size === 1, null, { timeout: 60_000 });
  await friend.waitForFunction(() => window.fireteam.session?.role === 'client' && window.fireteam.session.stats.snapshots > 10, null, { timeout: 60_000 });
  await expect(friend.locator('#hud')).toBeVisible();
  expect(await friend.evaluate(() => window.fireteam.map)).toBe('compound');

  // ---- the friend walks forward; the host sees them move
  const before = await host.evaluate(() => ({ ...window.fireteam.session.sim.player(1).soldier.state.pos }));
  // (Hold W until the host has seen it: two software-drawn 3D tabs share one CPU
  // here, so the game can run slower than real time.)
  await friend.keyboard.down('KeyW');
  await host.waitForFunction((b) => {
    const p = window.fireteam.session.sim.player(1).soldier.state.pos;
    return Math.hypot(p.x - b.x, p.z - b.z) > 1.5;
  }, before, { timeout: 30_000 });
  await friend.keyboard.up('KeyW');
  // ...and the host's screen shows a teammate.
  expect(await host.evaluate(() => window.fireteam.mission.teammatesView.views.size)).toBe(1);

  // ---- the friend shoots the (frozen) gate guard; it goes down on both screens
  await host.evaluate(() => {
    const f = window.fireteam;
    f.enemies.options.freeze = true;
    const p = f.session.sim.player(1);
    p.health.godMode = true;
    const guard = f.enemies.list[0];
    p.soldier.teleport([guard.pos.x, 0, guard.pos.z + 3.5], 0);
  });
  await friend.waitForFunction(() => {
    const s = window.fireteam.session;
    const g = s.enemies.list[0].view.pos;
    const me = s.local.soldier.state.pos;
    return Math.hypot(me.x - g.x, me.z - g.z) < 4;
  }, null, { timeout: 15_000 });
  await friend.evaluate(() => {
    const f = window.fireteam;
    const s = f.session;
    const g = s.enemies.list[0].view.pos;
    const me = s.local.soldier;
    const eye = { x: me.state.pos.x, y: me.state.pos.y + me.body.eyeHeight(), z: me.state.pos.z };
    const dx = g.x - eye.x, dy = g.y + 1.2 - eye.y, dz = g.z - eye.z;
    f.input.setLook(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  });
  await friend.waitForFunction(() => window.fireteam.soldier.arsenal.current.status === 'ready', null, { timeout: 15_000 });
  // Pull the trigger with a plain DOM event: the test browser's own mouse press
  // reports a jump in mouse position, which (without mouse capture) would turn the view.
  await friend.evaluate(() => dispatchEvent(new MouseEvent('mousedown', { button: 0 })));
  await host.waitForFunction(() => window.fireteam.enemies.list[0].dead, null, { timeout: 15_000 });
  await friend.evaluate(() => dispatchEvent(new MouseEvent('mouseup', { button: 0 })));
  await friend.waitForFunction(() => window.fireteam.session.enemies.list[0].view.dead, null, { timeout: 15_000 });
  expect(await host.evaluate(() => window.fireteam.encounter.players.get(1)?.kills)).toBe(1);
  await friend.screenshot({ path: 'test-results/coop-friend.png' });
  await host.screenshot({ path: 'test-results/coop-host.png' });

  // ---- the friend goes down; the host revives them
  await host.evaluate(() => {
    const f = window.fireteam;
    const friendP = f.session.sim.player(1);
    friendP.health.godMode = false;
    friendP.health.damage(500);
    const at = friendP.soldier.state.pos;
    f.soldier.teleport([at.x + 1, 0, at.z], Math.PI / 2); // right beside them
  });
  await expect(friend.locator('#coopDown')).toBeVisible({ timeout: 15_000 });
  await expect(friend.locator('#coopDownTitle')).toHaveText("You're down");
  await expect(friend.locator('#coopDownInfo')).toContainText('Bleeding out in');
  await expect(host.locator('#squad')).toContainText('Down');
  await expect(host.locator('#marks')).toContainText('Hold F to revive', { timeout: 15_000 });
  await host.screenshot({ path: 'test-results/coop-revive.png' });
  await host.keyboard.down('KeyF');
  await host.waitForFunction(() => !window.fireteam.session.sim.player(1).health.state.down, null, { timeout: 30_000 });
  await host.keyboard.up('KeyF');
  await expect(friend.locator('#coopDown')).toBeHidden({ timeout: 15_000 });
  await expect(host.locator('#feed')).toContainText('back up');

  // ---- the friend pings the ground; the host sees the marker
  await friend.evaluate(() => window.fireteam.input.setLook(0, -0.5));
  await friend.keyboard.press('KeyZ');
  await expect(host.locator('#marks')).toContainText('Here', { timeout: 15_000 });

  // ---- the friend leaves; the host carries on alone
  await friend.evaluate(() => window.fireteam.flow.go('paused'));
  await expect(friend.locator('#btnQuit')).toHaveText('Leave game');
  await expect(friend.locator('#btnRespawn')).toBeHidden(); // only the host restarts a co-op game
  // (A DOM click: with two busy, software-drawn 3D tabs, the test browser's
  // simulated mouse can land on a stale picture of the page.)
  await friend.locator('#btnQuit').dispatchEvent('click');
  await host.waitForFunction(() => window.fireteam.session.clients.size === 0, null, { timeout: 15_000 });
  await expect(friend.locator('#title')).toBeVisible();

  expect(problems).toEqual([]);
});

test("voice plumbing: your microphone lights you up; a teammate's voice goes through the radio or nearby path", async ({ page }) => {
  const problems = [];
  watch(page, 'page', problems);
  await page.goto('/?net=local&nolock&map=proving-ground');
  await page.waitForFunction(() => window.fireteam?.ready, null, { timeout: 60_000 });
  await page.click('#btnHost');
  await expect(page.locator('#roomCode')).toHaveText(/^[A-Z]{5}$/, { timeout: 10_000 });
  await page.waitForFunction(() => window.fireteam.voice?.hasMic, null, { timeout: 15_000 });
  // The pretend microphone beeps: your own light comes on in the roster.
  await expect(page.locator('#roster li[data-slot="0"].talking')).toHaveCount(1, { timeout: 15_000 });

  // Feed that same microphone in as teammate 2's voice.
  await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    window.fireteam.voice.hear(1, stream);
  });
  await page.waitForFunction(() => window.fireteam.voice.levels(1)?.level > 0.01, null, { timeout: 15_000 });
  // In the lobby everyone is "nearby"; on the radio, the voice moves to the radio path.
  await page.waitForFunction(() => window.fireteam.voice.levels(1).near > 0.9, null, { timeout: 5_000 });
  await page.evaluate(() => window.fireteam.voice.setTalkerRadio(1, true));
  await page.waitForFunction(() => {
    const l = window.fireteam.voice.levels(1);
    return l.radio > 0.9 && l.near < 0.1;
  }, null, { timeout: 5_000 });
  // Muted: silence on both.
  await page.evaluate(() => window.fireteam.voice.mute(1, true));
  await page.waitForFunction(() => {
    const l = window.fireteam.voice.levels(1);
    return l.radio < 0.05 && l.near < 0.05;
  }, null, { timeout: 5_000 });
  await expect(page.locator('#lobbyInfo')).toContainText('needs the online game'); // no voice links over ?net=local
  expect(problems).toEqual([]);
});

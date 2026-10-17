// Progression (game/profile.js, game/xp.js): ranks and gun levels from XP,
// unlocks, saving and backup codes, and XP counted from the game's own events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile, defaultProfile, cleanProfile, backupCode, readBackupCode, rankOf, gunLevelOf, xpForRank,
  isUnlocked, unlockHint, newUnlocks, rankProgress, RANK_UNLOCKS, GUN_LEVEL_UNLOCKS, PROGRESSION,
} from '../../src/game/profile.js';
import { createXpTracker, XP } from '../../src/game/xp.js';
import { createEvents } from '../../src/core/events.js';

/** A pretend localStorage. */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('ranks and gun levels grow with XP, each one a bit further than the last', () => {
  assert.equal(rankOf(0), 1);
  assert.equal(rankOf(xpForRank(2) - 1), 1);
  assert.equal(rankOf(xpForRank(2)), 2);
  assert.ok(xpForRank(3) - xpForRank(2) > xpForRank(2) - xpForRank(1), 'each rank needs more than the one before');
  assert.equal(rankOf(1e9), PROGRESSION.maxRank);
  assert.equal(gunLevelOf(0), 1);
  assert.equal(gunLevelOf(1e9), PROGRESSION.maxGunLevel);
});

test('you start with the carbine, the pistol and the supply drop; rank and gun levels unlock the rest', () => {
  const p = defaultProfile();
  for (const item of ['carbine', 'pistol', 'supply']) assert.ok(isUnlocked(p, item), item);
  for (const item of Object.keys(RANK_UNLOCKS)) assert.ok(!isUnlocked(p, item), `${item} starts locked`);
  assert.equal(unlockHint(p, 'shotgun'), `Rank ${RANK_UNLOCKS.shotgun}`);
  assert.ok(!isUnlocked(p, 'reddot', 'carbine'));
  const q = structuredClone(p);
  q.xp = xpForRank(RANK_UNLOCKS.shotgun);
  q.guns.carbine.xp = 1e6;
  assert.ok(isUnlocked(q, 'shotgun') && isUnlocked(q, 'smg'));
  assert.ok(isUnlocked(q, 'scope', 'carbine') && !isUnlocked(q, 'reddot', 'smg'), 'gun levels belong to each gun');
  const got = newUnlocks(p, q).map((u) => u.gun ? `${u.gun}:${u.item}` : u.item);
  assert.ok(got.includes('shotgun') && got.includes('carbine:reddot') && !got.includes('dmr'), got.join(' '));
  assert.deepEqual(rankProgress(p), { rank: 1, into: 0, needed: xpForRank(2), max: false });
  assert.equal(Object.keys(GUN_LEVEL_UNLOCKS).length, 9);
});

test('a saved profile is checked before it is trusted, and a locked choice falls back', () => {
  const p = cleanProfile({
    xp: -50, guns: { carbine: { xp: 'lots' }, smg: { xp: 400.7 } }, hacked: true,
    loadout: { primary: 'dmr', callin: 'mortar', attachments: { carbine: { optic: 'scope', muzzle: 'banana' } } },
  });
  assert.equal(p.xp, 0);
  assert.equal(p.guns.carbine.xp, 0);
  assert.equal(p.guns.smg.xp, 400);
  assert.equal(p.hacked, undefined);
  assert.equal(p.loadout.primary, 'carbine', 'the DMR is locked at rank 1');
  assert.equal(p.loadout.callin, 'supply');
  assert.deepEqual(p.loadout.attachments, {}, 'a level-10 scope on a level-1 carbine is refused');
  assert.deepEqual(cleanProfile(null), defaultProfile());
  assert.deepEqual(cleanProfile('rubbish'), defaultProfile());
});

test('the profile saves itself, and a broken save never stops the game', () => {
  const storage = memoryStorage();
  const a = createProfile({ storage });
  const change = a.award(xpForRank(2) + 10, 'carbine');
  assert.equal(change.rankUp, 2);
  assert.ok(change.unlocks.some((u) => u.item === 'smg'));
  assert.ok(a.setLoadout({ primary: 'smg' }));
  assert.ok(!a.setLoadout({ primary: 'dmr' }), 'locked: refused');
  const b = createProfile({ storage });
  assert.equal(b.data.xp, a.data.xp);
  assert.equal(b.data.loadout.primary, 'smg');
  storage.setItem('fireteam.profile', '{ this is not json');
  assert.deepEqual(createProfile({ storage }).data, defaultProfile());
  assert.deepEqual(createProfile({ storage: null }).data, defaultProfile(), 'no storage at all (a private window)');
});

test('a backup code carries a profile to another browser, and a typo is caught before it does any harm', () => {
  const a = createProfile({ storage: memoryStorage() });
  a.award(5000, 'smg');
  a.setLoadout({ primary: 'smg' });
  const code = a.backupCode();
  assert.match(code, /^FT1-[A-Za-z0-9_-]+-[0-9A-Z]{4}$/);
  const b = createProfile({ storage: memoryStorage() });
  b.restore(`  ${code}\n`); // pasted with stray spaces
  assert.deepEqual(b.data, a.data);
  // One character changed in the middle: refused, and b keeps what it had.
  const i = 10;
  const typo = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  assert.throws(() => b.restore(typo), /mistake/);
  assert.throws(() => b.restore('hello'), /FT1-/);
  assert.deepEqual(b.data, a.data);
  assert.deepEqual(readBackupCode(backupCode(defaultProfile())), defaultProfile());
});

test('XP is counted from the game\'s own events, only your own, with the night and difficulty bonuses', () => {
  const events = createEvents();
  const profile = createProfile({ storage: memoryStorage() });
  const changes = [];
  const t = createXpTracker({ events, me: 1, profile, difficulty: 'veteran', night: true, onChange: (c) => changes.push(c) });
  const k = XP.difficulty.veteran * XP.night;
  events.emit('enemy:down', { owner: 1, weapon: 'carbine', headshot: true });
  events.emit('enemy:down', { owner: 0, weapon: 'carbine', headshot: false }); // a teammate's kill: not yours
  events.emit('target:hit', { owner: 1, weapon: 'smg', kind: 'enemy', damage: 95 });
  events.emit('target:hit', { owner: 1, weapon: 'smg', kind: 'paper', damage: 500 }); // practice targets don't count
  events.emit('player:revive', { by: 1, owner: 0 });
  events.emit('objective:complete', { kind: 'rescue' });
  events.emit('mission:complete', { id: 'harbour-rescue-night' });
  const s = t.summary;
  const expect = Math.round(XP.kill * k) + Math.round(XP.headshot * k) + Math.round(XP.revive * k) + Math.round(XP.stage * k) + Math.round(XP.mission * k);
  assert.equal(s.total, expect);
  assert.equal(profile.data.xp, expect, 'banked as it was earned');
  assert.equal(profile.data.guns.carbine.xp, Math.round(XP.kill * k) + Math.round(XP.headshot * k));
  assert.equal(profile.data.guns.smg.xp, 9, '95 damage: 9 gun XP (the 5 left over carries to the next hit)');
  assert.equal(profile.data.stats.kills, 1);
  assert.equal(profile.data.stats.headshots, 1);
  assert.ok(s.lines.find((l) => l.reason === 'mission'));
  t.dispose();
  events.emit('enemy:down', { owner: 1, weapon: 'carbine' });
  assert.equal(profile.data.xp, expect, 'stops counting once disposed');
  assert.ok(changes.length >= 5);
});

test('an attachment is only kept in its own slot, on a gun it fits', () => {
  const a = createProfile({ storage: memoryStorage() });
  a.award(1e6, 'shotgun');
  assert.ok(!a.setLoadout({ attachments: { shotgun: { optic: 'scope' } } }), 'a scope doesn\'t fit a shotgun');
  assert.ok(!a.setLoadout({ attachments: { shotgun: { optic: 'suppressor' } } }), 'a suppressor isn\'t an optic');
  assert.ok(a.setLoadout({ attachments: { shotgun: { optic: 'holo', muzzle: 'suppressor' } } }));
  assert.deepEqual(a.data.loadout.attachments.shotgun, { optic: 'holo', muzzle: 'suppressor' });
});

test('fitting attachments in any order works (regression: the same picks in another order were refused)', () => {
  const a = createProfile({ storage: memoryStorage() });
  a.award(1e6, 'smg');
  a.awardGun('carbine', 1e6);
  assert.ok(a.setLoadout({ attachments: { smg: { mag: 'extended' } } }));
  assert.ok(a.setLoadout({ attachments: { carbine: { under: 'foregrip' } } }), 'a second gun after the first');
  assert.ok(a.setLoadout({ attachments: { carbine: { under: 'foregrip', optic: 'reddot' } } }), 'a slot before an earlier one');
  assert.deepEqual(a.data.loadout.attachments, { carbine: { optic: 'reddot', under: 'foregrip' }, smg: { mag: 'extended' } });
  assert.ok(a.setLoadout({ attachments: { carbine: { optic: 'reddot', under: undefined } } }), 'taking one off');
  assert.deepEqual(a.data.loadout.attachments.carbine, { optic: 'reddot' });
});

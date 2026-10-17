// Attachments (weapons/attachments.js): data that changes a gun's numbers, and
// the parts drawn on the gun (render/gun-models.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS, FITS, SLOTS, RELOAD_TIMES, fits, withAttachments, loadoutDefs } from '../../src/weapons/attachments.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';
import { createArsenal } from '../../src/weapons/arsenal.js';
import { NOISE } from '../../src/ai/noise.js';
import { GUN_LEVEL_UNLOCKS } from '../../src/game/profile.js';
import { buildGun } from '../../src/render/gun-models.js';

const get = (o, path) => path.split('.').reduce((v, k) => v[k], o);

test('every attachment changes exactly the numbers its row says, on every gun it fits', () => {
  for (const [gun, list] of Object.entries(FITS)) {
    const def = WEAPONS[gun];
    for (const a of list) {
      const att = ATTACHMENTS[a];
      const out = withAttachments(def, { [att.slot]: a });
      assert.equal(out.attachments[att.slot], a, `${gun} + ${a}`);
      for (const [path, how, value] of att.mods) {
        if (path === 'reload') {
          // Every reload time the gun has, whichever kind of reload it is.
          const times = RELOAD_TIMES.filter((t) => typeof def.reload[t] === 'number');
          assert.ok(times.length >= 2, `${gun} has reload times`);
          for (const t of times) assert.equal(out.reload[t], def.reload[t] * value, `${gun} + ${a}: reload.${t}`);
          continue;
        }
        const before = path === 'noise' ? (def.noise ?? NOISE.gunshot) : get(def, path);
        const want = (x) => (how === 'mul' ? x * value : value);
        const expect = Array.isArray(before) ? before.map(want) : path === 'mag' ? Math.round(want(before)) : want(before);
        assert.deepEqual(get(out, path), expect, `${gun} + ${a}: ${path}`);
      }
      for (const [k, v] of Object.entries(att.flags)) assert.equal(out[k], v, `${gun} + ${a}: ${k}`);
    }
  }
});

test('the table is never changed, and no (or nonsense) picks give back the table\'s own row', () => {
  const before = structuredClone({ ...WEAPONS.carbine, model: null });
  const out = withAttachments(WEAPONS.carbine, { optic: 'scope', muzzle: 'suppressor', mag: 'extended', under: 'foregrip' });
  assert.deepEqual({ ...WEAPONS.carbine, model: null }, before);
  assert.equal(out.model, WEAPONS.carbine.model, 'the drawing is shared, not copied');
  assert.equal(withAttachments(WEAPONS.carbine, {}), WEAPONS.carbine);
  assert.equal(withAttachments(WEAPONS.carbine, undefined), WEAPONS.carbine);
  // A suppressor in the optic slot, a banana, and a scope on the shotgun: all ignored.
  assert.equal(withAttachments(WEAPONS.carbine, { optic: 'suppressor', muzzle: 'banana' }), WEAPONS.carbine);
  assert.equal(withAttachments(WEAPONS.shotgun, { optic: 'scope' }), WEAPONS.shotgun);
  assert.ok(!fits('shotgun', 'scope') && fits('carbine', 'scope') && !fits('carbine', 'nope'));
});

test('the same picks always build the same gun (both computers in co-op must agree)', () => {
  const picks = { optic: 'holo', muzzle: 'compensator', mag: 'fastmag', under: 'laser' };
  const a = withAttachments(WEAPONS.smg, picks);
  const b = withAttachments(WEAPONS.smg, { ...picks });
  assert.deepEqual({ ...a, model: null }, { ...b, model: null });
});

test('a fast mag keeps the reload sounds in time with the quicker reload', () => {
  const out = withAttachments(WEAPONS.carbine, { mag: 'fastmag' });
  const k = out.reload.tactical / WEAPONS.carbine.reload.tactical;
  assert.ok(Math.abs(k - 0.75) < 1e-9);
  for (const [kind, cues] of Object.entries(WEAPONS.carbine.reload.cues)) {
    cues.forEach(([t, s], i) => assert.deepEqual(out.reload.cues[kind][i], [t * k, s]));
  }
});

test('an arsenal built from a loadout carries the fitted guns', () => {
  const ars = createArsenal({ loadout: [{ id: 'carbine', attachments: { mag: 'extended', muzzle: 'suppressor' } }, 'pistol'] });
  assert.deepEqual(ars.guns.map((g) => g.def.id), ['carbine', 'pistol']);
  assert.equal(ars.guns[0].def.mag, Math.round(WEAPONS.carbine.mag * 1.5));
  assert.equal(ars.guns[0].mag, ars.guns[0].def.mag, 'starts with the bigger magazine full');
  assert.ok(ars.guns[0].def.suppressed);
  assert.equal(ars.guns[1].def, WEAPONS.pistol);
  assert.equal(loadoutDefs(['smg'])[0], WEAPONS.smg);
});

test('every attachment is unlocked by a gun level, and every gun takes at least one per slot it has', () => {
  for (const a of Object.keys(ATTACHMENTS)) assert.ok(GUN_LEVEL_UNLOCKS[a] >= 2, `${a} has a gun level`);
  for (const [gun, list] of Object.entries(FITS)) {
    assert.ok(WEAPONS[gun], gun);
    for (const a of list) assert.ok(SLOTS.includes(ATTACHMENTS[a].slot));
  }
});

test('attachments are drawn: a suppressor moves the muzzle forward, a scope gives the scope view', () => {
  const plain = buildGun(WEAPONS.carbine);
  const fitted = buildGun(withAttachments(WEAPONS.carbine, { optic: 'scope', muzzle: 'suppressor', under: 'laser' }));
  assert.ok(fitted.group.children.length > plain.group.children.length, 'more parts');
  assert.ok(fitted.muzzle.z < plain.muzzle.z - 0.1, 'the flash comes out of the end of the suppressor');
  assert.equal(fitted.reticle, 'scope');
  assert.ok(fitted.laser, 'the laser has a point the beam comes from');
  assert.equal(buildGun(WEAPONS.dmr).reticle, 'scope', 'the DMR has its scope built in');
  // The magazine grows (and still drops out in one piece when you reload).
  const ext = buildGun(withAttachments(WEAPONS.carbine, { mag: 'extended' }));
  if (plain.parts.mag) assert.ok(ext.parts.mag.children.length > plain.parts.mag.children.length);
});

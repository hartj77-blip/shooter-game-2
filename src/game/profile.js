// Your profile: rank, XP, each gun's level, your loadout. Saved in this browser.
//
// Progress is the long game: every mission earns XP (game/xp.js), XP raises
// your RANK, and your rank unlocks guns and call-ins. Each gun also earns its
// own XP when you use it, which raises its LEVEL and unlocks its attachments
// ("use it to improve it"). All the numbers are in the tables below.
//
// Saving: like the settings (core/settings.js), the profile lives in
// localStorage, and anything loaded is checked before it's trusted (an old
// version, a hand-edited value, half a save). A BACKUP CODE copies it to
// another browser: the profile as text, plus a short checksum so a typo is
// caught before it overwrites anything. Like the check digit on a bank card.
//
// No DOM, no three.js: this runs in Node (the storage is handed in).

import { ATTACHMENTS, fits } from '../weapons/attachments.js';

export const PROFILE_VERSION = 1;
const STORAGE_KEY = 'fireteam.profile';

export const GUN_IDS = ['carbine', 'smg', 'shotgun', 'dmr', 'pistol'];
export const PRIMARIES = ['carbine', 'smg', 'shotgun', 'dmr'];
export const CALLIN_IDS = ['supply', 'recon', 'smoke', 'mortar'];
export const ATTACHMENT_SLOTS = ['optic', 'muzzle', 'mag', 'under'];

// ---------------------------------------------------------------- the tables

export const PROGRESSION = {
  maxRank: 20,
  rankStep: 1500,   // XP from rank 1 to 2...
  rankGrowth: 500,  // ...and each rank after needs this much more
  maxGunLevel: 10,
  gunStep: 600,     // gun XP from level 1 to 2...
  gunGrowth: 200,   // ...and this much more each level
};

/** What your rank unlocks (everything else in GUN_IDS / CALLIN_IDS is yours from the start). */
export const RANK_UNLOCKS = {
  smg: 2, recon: 3, shotgun: 4, smoke: 5, dmr: 6, mortar: 8,
};

/** What a gun's level unlocks for it, in order (weapons/attachments.js says which fit which gun). */
export const GUN_LEVEL_UNLOCKS = {
  reddot: 2, extended: 3, foregrip: 4, suppressor: 5, holo: 6, fastmag: 7, compensator: 8, laser: 9, scope: 10,
};

/** Total XP needed to reach rank `r` (rank 1 needs 0). */
export function xpForRank(r, P = PROGRESSION) {
  const n = Math.max(0, r - 1);
  return n * P.rankStep + (P.rankGrowth * n * (n - 1)) / 2;
}
/** Total gun XP needed to reach level `l`. */
export function xpForGunLevel(l, P = PROGRESSION) {
  const n = Math.max(0, l - 1);
  return n * P.gunStep + (P.gunGrowth * n * (n - 1)) / 2;
}
const levelFrom = (xp, max, need) => {
  let l = 1;
  while (l < max && xp >= need(l + 1)) l++;
  return l;
};
export const rankOf = (xp, P = PROGRESSION) => levelFrom(xp, P.maxRank, (r) => xpForRank(r, P));
export const gunLevelOf = (xp, P = PROGRESSION) => levelFrom(xp, P.maxGunLevel, (l) => xpForGunLevel(l, P));

// ---------------------------------------------------------------- a fresh profile, and checking a loaded one

export function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    xp: 0,
    guns: Object.fromEntries(GUN_IDS.map((id) => [id, { xp: 0 }])),
    loadout: { primary: 'carbine', callin: 'supply', attachments: {} },
    stats: { missions: 0, kills: 0, headshots: 0, revives: 0 },
  };
}

const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/**
 * Any saved shape (older, edited, broken) into a valid profile. Unknown keys go,
 * bad numbers become 0, a locked or unknown choice falls back to the default.
 */
export function cleanProfile(data) {
  const p = defaultProfile();
  if (!data || typeof data !== 'object') return p;
  const d = migrate(data);
  p.xp = num(d.xp);
  for (const id of GUN_IDS) p.guns[id].xp = num(d.guns?.[id]?.xp);
  for (const k of Object.keys(p.stats)) p.stats[k] = num(d.stats?.[k]);
  const L = d.loadout ?? {};
  if (PRIMARIES.includes(L.primary) && isUnlocked(p, L.primary)) p.loadout.primary = L.primary;
  if (CALLIN_IDS.includes(L.callin) && isUnlocked(p, L.callin)) p.loadout.callin = L.callin;
  for (const gun of GUN_IDS) {
    const picks = L.attachments?.[gun];
    if (!picks || typeof picks !== 'object') continue;
    const clean = {};
    for (const slot of ATTACHMENT_SLOTS) {
      const a = picks[slot];
      // It must be unlocked, belong in this slot, and fit this gun (weapons/attachments.js).
      if (typeof a === 'string' && a in GUN_LEVEL_UNLOCKS && gunLevel(p, gun) >= GUN_LEVEL_UNLOCKS[a]
        && ATTACHMENTS[a]?.slot === slot && fits(gun, a)) clean[slot] = a;
    }
    if (Object.keys(clean).length) p.loadout.attachments[gun] = clean;
  }
  return p;
}

/**
 * Older saves, upgraded one version at a time. (Version 1 is the first; when
 * the shape changes, add a step here, so nobody's progress is ever lost.)
 */
export function migrate(data) {
  const d = { ...data };
  if (!Number.isFinite(d.version)) d.version = 1;
  // if (d.version === 1) { ...change the shape...; d.version = 2; }
  return d;
}

// ---------------------------------------------------------------- questions about a profile

export const rank = (p) => rankOf(p.xp);
export const gunLevel = (p, gun) => gunLevelOf(p.guns[gun]?.xp ?? 0);

/** Is a gun, call-in or attachment (for `gun`) unlocked? */
export function isUnlocked(p, item, gun = null) {
  if (item in RANK_UNLOCKS) return rank(p) >= RANK_UNLOCKS[item];
  if (item in GUN_LEVEL_UNLOCKS) return !!gun && gunLevel(p, gun) >= GUN_LEVEL_UNLOCKS[item];
  return GUN_IDS.includes(item) || CALLIN_IDS.includes(item);
}

/** What `item` needs, in words, if it's locked ("Rank 4", "Carbine level 6"), or null. */
export function unlockHint(p, item, gun = null) {
  if (isUnlocked(p, item, gun)) return null;
  if (item in RANK_UNLOCKS) return `Rank ${RANK_UNLOCKS[item]}`;
  if (item in GUN_LEVEL_UNLOCKS) return `Level ${GUN_LEVEL_UNLOCKS[item]}`;
  return null;
}

/** Progress within the current rank (for an XP bar): { rank, into, needed, next }. */
export function rankProgress(p) {
  const r = rank(p);
  const from = xpForRank(r), to = xpForRank(r + 1);
  return r >= PROGRESSION.maxRank
    ? { rank: r, into: 0, needed: 0, max: true }
    : { rank: r, into: p.xp - from, needed: to - from, max: false };
}

export function gunProgress(p, gun) {
  const xp = p.guns[gun]?.xp ?? 0;
  const l = gunLevelOf(xp);
  const from = xpForGunLevel(l), to = xpForGunLevel(l + 1);
  return l >= PROGRESSION.maxGunLevel
    ? { level: l, into: 0, needed: 0, max: true }
    : { level: l, into: xp - from, needed: to - from, max: false };
}

/** Everything that unlocks between two profiles (for "New: SMG!" after a mission). */
export function newUnlocks(before, after) {
  const out = [];
  for (const [item, r] of Object.entries(RANK_UNLOCKS)) if (rank(before) < r && rank(after) >= r) out.push({ item });
  for (const gun of GUN_IDS) {
    for (const [item, l] of Object.entries(GUN_LEVEL_UNLOCKS)) {
      if (gunLevel(before, gun) < l && gunLevel(after, gun) >= l) out.push({ item, gun });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the backup code

// FNV-1a: a quick, well-mixed 32-bit fingerprint of some text. Not a secret:
// it only catches mistakes (a missing letter, a swapped pair).
function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).slice(-4).padStart(4, '0').toUpperCase();
}
const toBase64Url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** The profile as a code to copy: FT1-<data>-<check>. */
export function backupCode(p) {
  const body = toBase64Url(JSON.stringify(cleanProfile(p)));
  return `FT1-${body}-${checksum(body)}`;
}

/** A code back into a profile, or throws an Error saying what's wrong (in words for the player). */
export function readBackupCode(code) {
  const m = /^FT1-([A-Za-z0-9_-]+)-([0-9A-Z]{4})$/.exec(String(code ?? '').trim().replace(/\s+/g, ''));
  if (!m) throw new Error("That doesn't look like a Fireteam backup code (they start with FT1-).");
  if (checksum(m[1]) !== m[2]) throw new Error('That code has a mistake in it: check it was copied whole.');
  let data;
  try { data = JSON.parse(fromBase64Url(m[1])); } catch { throw new Error('That code is damaged.'); }
  return cleanProfile(data);
}

/**
 * The guns your loadout gives you, as the arsenal wants them (weapons/arsenal.js):
 * your primary and the pistol, each with its attachments.
 */
export function loadoutFor(p) {
  const L = p.loadout;
  const entry = (id) => (L.attachments[id] ? { id, attachments: { ...L.attachments[id] } } : id);
  return [entry(L.primary), entry('pistol')];
}

// ---------------------------------------------------------------- the profile store

/**
 * The saved profile, with ways to earn XP and change the loadout. Saves after every change.
 * @param {object} [opts]
 * @param {Storage|null} [opts.storage] localStorage, or a stand-in (tests)
 */
export function createProfile({ storage = safeStorage() } = {}) {
  let p = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? cleanProfile(JSON.parse(raw)) : defaultProfile();
    } catch {
      return defaultProfile(); // a broken save must never stop the game starting
    }
  }
  function save() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* not saved, that's all */ }
    for (const fn of listeners) fn(p);
  }

  return {
    get data() { return p; },
    get rank() { return rank(p); },
    /**
     * Earn XP (and, if `gun` is given, the same for that gun). Returns what changed:
     * { rankUp: number|null, unlocks: [{ item, gun? }] }.
     */
    award(xp, gun = null) {
      const before = structuredClone(p);
      p.xp += num(xp);
      if (gun && p.guns[gun]) p.guns[gun].xp += num(xp);
      save();
      return { rankUp: rank(p) > rank(before) ? rank(p) : null, unlocks: newUnlocks(before, p) };
    },
    /** Gun XP only (damage done with it). */
    awardGun(gun, xp) {
      if (!p.guns[gun] || !(xp > 0)) return { unlocks: [] };
      const before = structuredClone(p);
      p.guns[gun].xp += num(xp);
      save();
      return { unlocks: newUnlocks(before, p) };
    },
    count(stat, n = 1) {
      if (stat in p.stats) { p.stats[stat] += n; save(); }
    },
    /** Change the loadout (locked choices are refused). Returns true if it took. */
    setLoadout(change) {
      const wanted = { ...p.loadout, ...change, attachments: { ...p.loadout.attachments, ...(change.attachments ?? {}) } };
      const next = cleanProfile({ ...p, loadout: wanted });
      // A locked or unknown choice is refused outright: cleaning would quietly
      // swap it for the default, and you'd lose the gun you had.
      if (JSON.stringify(next.loadout) !== JSON.stringify(cleanLoadout(wanted))) return false;
      if (JSON.stringify(next.loadout) === JSON.stringify(p.loadout)) return false;
      p = next;
      save();
      return true;
    },
    backupCode: () => backupCode(p),
    /** Replace this profile with one from a backup code (throws if the code is bad). */
    restore(code) {
      p = readBackupCode(code);
      save();
    },
    reset() { p = defaultProfile(); save(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** A loadout as cleanProfile would store it (empty attachment picks dropped), for comparing. */
function cleanLoadout(L) {
  // In the same order cleanProfile writes them (guns, then slots), or the same
  // picks written in another order would look like a different loadout.
  const attachments = {};
  for (const gun of GUN_IDS) {
    const picks = L.attachments?.[gun] ?? {};
    const kept = Object.fromEntries(ATTACHMENT_SLOTS.filter((slot) => picks[slot]).map((slot) => [slot, picks[slot]]));
    if (Object.keys(kept).length) attachments[gun] = kept;
  }
  return { primary: L.primary, callin: L.callin, attachments };
}

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

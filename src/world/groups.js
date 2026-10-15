// Collision groups: a guest list for every kind of physics question.
//
// The world holds three kinds of collider:
//   WORLD      the level and the practice targets (Rapier's default: "member of everything")
//   CHARACTER  the invisible upright cylinder each soldier moves with
//   HITBOX     the head, body and limb boxes that bullets actually hit
//
// Each kind of question only "sees" some of them:
//   MOVE    walking, standing up, mantling, ground checks: world + characters
//           (you can't walk through a wall or a person, and your own hitboxes never trip you)
//   BULLET  shots: world + hitboxes (the fat movement cylinder would catch bullets
//           meant to whistle past someone's head)
//   SIGHT   enemy eyesight and hearing checks: world only (soldiers don't hide each other)
//   LEVEL   mapping the level for enemies (the same as SIGHT, under a clearer name)
//
// Rapier packs a group into one 32-bit number: the top 16 bits say which groups
// a collider is a member of, the bottom 16 say which groups it's willing to meet.
// Two things interact only if each is a member of something the other accepts.

export const WORLD = 0x0001;
export const CHARACTER = 0x0002;
export const HITBOX = 0x0004;

const ALL = 0xffff;

/** Pack "member of" and "meets" into Rapier's single number. */
export const groups = (memberOf, meets) => ((memberOf << 16) | meets) >>> 0;

// What colliders are.
export const CHARACTER_GROUPS = groups(CHARACTER, ALL);
export const HITBOX_GROUPS = groups(HITBOX, ALL);

// What questions see.
export const MOVE = groups(ALL, WORLD | CHARACTER);
export const BULLET = groups(ALL, WORLD | HITBOX);
export const SIGHT = groups(ALL, WORLD);
// The level's own shapes only: used when mapping the level for enemies (ai/nav-grid.js).
export const LEVEL = groups(ALL, WORLD);

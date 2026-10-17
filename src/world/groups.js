// Collision groups: a guest list for every kind of physics question.
//
// The world holds five kinds of collider:
//   WORLD      the level and the practice targets (Rapier's default: "member of everything")
//   CHARACTER  the invisible upright cylinder each soldier moves with
//   HITBOX     the head, body and limb boxes that bullets actually hit
//   BOUNDARY   invisible walls at the edge of a map (along a quay, so nobody falls in the sea)
//   ESCORT     the body of someone you escort (the hostage): they bump into you, you walk
//              through them, so a follower at your heels never gets in your way (and two
//              computers never disagree about a bump, lesson 12)
//   SMOKE      a smoke screen's clouds (game/callins.js): they block eyes, nothing else
//
// Each kind of question only "sees" some of them:
//   MOVE    walking, standing up, ground checks: world + characters + boundaries
//           (you can't walk through a wall or a person, and your own hitboxes never trip you)
//   BULLET  shots: world + hitboxes (the fat movement cylinder would catch bullets
//           meant to whistle past someone's head)
//   SIGHT   eyesight (enemies', aim assist): world + smoke (soldiers don't hide each other,
//           a smoke screen does; bullets fly straight through it, you shoot blind)
//   LEVEL   the level's own shapes: mapping it for enemies, finding ledges to climb,
//           grenades, and whether a wall muffles a sound (smoke doesn't)
//
// Rapier packs a group into one 32-bit number: the top 16 bits say which groups
// a collider is a member of, the bottom 16 say which groups it's willing to meet.
// Two things interact only if each is a member of something the other accepts.

export const WORLD = 0x0001;
export const CHARACTER = 0x0002;
export const HITBOX = 0x0004;
export const BOUNDARY = 0x0008;
export const ESCORT = 0x0010;
export const SMOKE = 0x0020;

const ALL = 0xffff;

/** Pack "member of" and "meets" into Rapier's single number. */
export const groups = (memberOf, meets) => ((memberOf << 16) | meets) >>> 0;

// What colliders are.
export const CHARACTER_GROUPS = groups(CHARACTER, ALL);
export const HITBOX_GROUPS = groups(HITBOX, ALL);
export const BOUNDARY_GROUPS = groups(BOUNDARY, ALL);
export const ESCORT_GROUPS = groups(ESCORT, ALL);
export const SMOKE_GROUPS = groups(SMOKE, ALL);

// What questions see.
export const MOVE = groups(ALL, WORLD | CHARACTER | BOUNDARY);
export const BULLET = groups(ALL, WORLD | HITBOX);
export const SIGHT = groups(ALL, WORLD | SMOKE);
// The level's own shapes only: used when mapping the level for enemies (ai/nav-grid.js).
export const LEVEL = groups(ALL, WORLD);

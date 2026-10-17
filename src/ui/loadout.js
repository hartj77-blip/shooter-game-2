// The Loadout screen: choose your gun, fit its attachments, pick a call-in,
// and copy or restore your backup code.
//
// It only reads and changes the profile (game/profile.js), which saves itself
// and refuses anything locked, so this file never decides what's allowed: a
// locked choice is drawn greyed out with what unlocks it ("Rank 4", "Level 6").
// The next mission builds your guns from the profile (src/mission.js).
//
// Everything on it is a button, so the mouse, the keyboard (Tab, Enter) and a
// controller (the D-pad moves the focus: src/main.js) all work the same way.

import { PRIMARIES, CALLIN_IDS, unlockHint, rankProgress, gunProgress } from '../game/profile.js';
import { ATTACHMENTS, FITS, SLOTS } from '../weapons/attachments.js';
import { ATTACHMENT_NAMES, CALLIN_NAMES, CALLIN_INFO, gunName, describeAttachment } from './names.js';

const SLOT_NAMES = { optic: 'Optic', muzzle: 'Muzzle', mag: 'Magazine', under: 'Underbarrel' };
const fmt = (n) => n.toLocaleString('en-GB');

/**
 * @param {object} opts
 * @param {object} opts.profile  game/profile.js createProfile()
 * @param {Document} [opts.doc]
 */
export function createLoadoutScreen({ profile, doc = document }) {
  const screen = doc.getElementById('loadout');
  const body = doc.getElementById('loadoutBody');
  const rankText = doc.getElementById('loadoutRank');
  const rankBar = doc.getElementById('loadoutRankBar');
  const codeOut = doc.getElementById('backupOut');
  const codeIn = doc.getElementById('backupIn');
  const codeNote = doc.getElementById('backupNote');
  let editing = 'primary'; // whose attachments are shown: your primary, or the pistol
  let onClose = null;

  /** A row of choice buttons. Each choice: { key, label, sub, locked, chosen, pick }. */
  function chips(title, choices, info = '') {
    const row = doc.createElement('div');
    row.className = 'loadout-row';
    const h = doc.createElement('h3');
    h.textContent = title;
    const list = doc.createElement('div');
    list.className = 'chips';
    for (const c of choices) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.key = c.key;
      b.setAttribute('aria-pressed', String(!!c.chosen));
      b.disabled = !!c.locked;
      b.textContent = c.label;
      const small = doc.createElement('small');
      small.textContent = c.locked ? `🔒 ${c.locked}` : (c.sub ?? '');
      if (small.textContent) b.append(small);
      b.addEventListener('click', () => { if (!c.locked) c.pick(); });
      list.append(b);
    }
    row.append(h, list);
    if (info) {
      const p = doc.createElement('p');
      p.className = 'muted loadout-info';
      p.textContent = info;
      row.append(p);
    }
    return row;
  }

  function render() {
    const p = profile.data;
    const L = p.loadout;
    // Keep the focus on the same choice after redrawing (a controller user would lose their place).
    const focusKey = body.contains(doc.activeElement) ? doc.activeElement.dataset.key : null;

    const r = rankProgress(p);
    rankText.textContent = r.max ? `Rank ${r.rank} · ${fmt(p.xp)} XP` : `Rank ${r.rank} · ${fmt(r.into)} / ${fmt(r.needed)} XP to rank ${r.rank + 1}`;
    rankBar.style.width = r.max ? '100%' : `${Math.round((r.into / r.needed) * 100)}%`;

    body.replaceChildren();
    // ---- your gun
    body.append(chips('Primary', PRIMARIES.map((id) => ({
      key: `gun:${id}`, label: gunName(id), sub: `Level ${gunProgress(p, id).level}`,
      locked: unlockHint(p, id), chosen: L.primary === id,
      pick: () => { profile.setLoadout({ primary: id }); editing = 'primary'; },
    }))));

    // ---- attachments, for the primary or the pistol
    const gun = editing === 'pistol' ? 'pistol' : L.primary;
    body.append(chips('Attachments for', [L.primary, 'pistol'].map((id, i) => ({
      key: `edit:${i}`, label: gunName(id), chosen: gun === id, pick: () => { editing = i ? 'pistol' : 'primary'; render(); },
    }))));
    const g = gunProgress(p, gun);
    const level = doc.createElement('p');
    level.className = 'muted loadout-level';
    level.textContent = g.max ? `${gunName(gun)}: level ${g.level} (the top)` : `${gunName(gun)}: level ${g.level} · ${fmt(g.into)} / ${fmt(g.needed)} XP to level ${g.level + 1}. Use it to level it up.`;
    body.append(level);
    const picks = L.attachments[gun] ?? {};
    for (const slot of SLOTS) {
      const options = (FITS[gun] ?? []).filter((a) => ATTACHMENTS[a].slot === slot);
      if (!options.length) continue;
      const set = (a) => profile.setLoadout({ attachments: { [gun]: { ...picks, [slot]: a ?? undefined } } });
      const chosen = picks[slot];
      body.append(chips(SLOT_NAMES[slot], [
        { key: `${slot}:none`, label: 'None', chosen: !chosen, pick: () => set(null) },
        ...options.map((a) => ({
          key: `${slot}:${a}`, label: ATTACHMENT_NAMES[a], locked: unlockHint(p, a, gun), chosen: chosen === a, pick: () => set(a),
        })),
      ], chosen ? describeAttachment(ATTACHMENTS[chosen]).join(' · ') : ''));
    }

    // ---- call-in
    body.append(chips('Call-in', CALLIN_IDS.map((id) => ({
      key: `callin:${id}`, label: CALLIN_NAMES[id], locked: unlockHint(p, id), chosen: L.callin === id,
      pick: () => profile.setLoadout({ callin: id }),
    })), CALLIN_INFO[L.callin] ?? ''));

    if (focusKey) body.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  // ---- the backup code
  doc.getElementById('btnBackupCopy').addEventListener('click', async () => {
    const code = profile.backupCode();
    codeOut.value = code;
    codeOut.hidden = false;
    codeOut.select();
    try {
      await navigator.clipboard.writeText(code);
      codeNote.textContent = 'Copied. Keep it somewhere safe, and paste it into Restore on another browser.';
    } catch {
      codeNote.textContent = 'Select the code above and copy it (Ctrl+C).';
    }
  });
  doc.getElementById('btnBackupRestore').addEventListener('click', () => {
    try {
      profile.restore(codeIn.value);
      codeIn.value = '';
      codeNote.textContent = `Restored: rank ${rankProgress(profile.data).rank}.`;
    } catch (err) {
      codeNote.textContent = err.message; // the profile is unchanged
    }
  });

  profile.onChange(() => { if (!screen.hidden) render(); });

  return {
    /** Show it; `back` runs when it closes. */
    open(back = null) {
      onClose = back;
      editing = 'primary';
      codeOut.hidden = true;
      codeNote.textContent = '';
      render();
      screen.hidden = false;
      body.querySelector('button[aria-pressed="true"]')?.focus();
    },
    close() {
      screen.hidden = true;
      onClose?.();
      onClose = null;
    },
    isOpen: () => !screen.hidden,
  };
}

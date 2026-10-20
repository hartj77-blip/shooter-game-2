// The mission modifier switches (game/modifiers.js), on the title screen and
// in the lobby. Toggle buttons; on the lobby only the host can press them.

import { MODIFIERS, cleanModifiers } from '../game/modifiers.js';

/**
 * Draw the switches into `box`.
 * @param {HTMLElement} box
 * @param {string[]} on        the modifiers that are on
 * @param {Function|null} set  (list) => void when one is pressed; null = read-only
 */
export function renderModifiers(box, on, set) {
  const list = cleanModifiers(on);
  box.replaceChildren(...Object.entries(MODIFIERS).map(([id, m]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.mod = id;
    b.title = m.text;
    b.setAttribute('aria-pressed', String(list.includes(id)));
    b.disabled = !set;
    b.textContent = m.name;
    const small = document.createElement('small');
    small.textContent = `+${Math.round(m.xp * 100)}% XP`;
    b.append(small);
    b.addEventListener('click', () => set?.(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    return b;
  }));
}

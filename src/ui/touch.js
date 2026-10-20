// Touch controls: play on a phone or tablet.
//
// The left half of the screen is a stick: put your thumb down anywhere there
// and drag (the stick appears where you touched, so you never have to find
// it). The right half turns the view as you drag. Buttons along the right edge
// press the same actions as the keys (core/input.js `touch`), so the game
// itself can't tell a thumb from a keyboard. Like a TV remote with the same
// buttons as the TV: different hands, same channels.
//
// Shown on touch screens (or with ?touch in the address). Browser only.

const BUTTONS = [
  // [action, label, hold?]  hold: pressed while your finger is down (fire, aim, use)
  ['fire', 'FIRE', true],
  ['ads', 'AIM', true],
  ['jump', 'JUMP', false],
  ['crouch', 'CROUCH', false],
  ['reload', 'RELOAD', false],
  ['interact', 'USE', true],
  ['grenade', 'NADE', false],
  ['callin', 'CALL', false],
  ['next', 'GUN', false],
];

/**
 * @param {object} opts
 * @param {object} opts.input     core/input.js
 * @param {Function} opts.onPause the pause button
 * @param {object} [opts.tuning]  stick size and look speed
 */
export function createTouchControls({ input, onPause, tuning = { stick: 60, lookSpeed: 0.006 } }) {
  const layer = document.createElement('div');
  layer.className = 'touch';
  layer.innerHTML = '<div class="touch-stick" hidden><i></i></div><div class="touch-buttons"></div><button type="button" class="touch-pause">II</button>';
  document.body.append(layer);
  const stick = layer.querySelector('.touch-stick');
  const knob = stick.querySelector('i');
  const buttons = layer.querySelector('.touch-buttons');
  let moveId = null, lookId = null;
  const origin = { x: 0, y: 0 };
  const last = { x: 0, y: 0 };

  for (const [action, label, hold] of BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (action === 'next') input.touch.wheel(1);
      else input.touch.press(action);
      if (!hold) setTimeout(() => input.touch.release(action), 80);
    }, { passive: false });
    if (hold) b.addEventListener('touchend', (e) => { e.preventDefault(); input.touch.release(action); });
    buttons.append(b);
  }
  layer.querySelector('.touch-pause').addEventListener('click', () => onPause());

  layer.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2 && moveId === null) {
        moveId = t.identifier;
        origin.x = t.clientX;
        origin.y = t.clientY;
        stick.style.left = `${t.clientX}px`;
        stick.style.top = `${t.clientY}px`;
        stick.hidden = false;
      } else if (lookId === null) {
        lookId = t.identifier;
        last.x = t.clientX;
        last.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  layer.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
        const d = Math.hypot(dx, dy), k = d > tuning.stick ? tuning.stick / d : 1;
        knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        input.touch.move((dx * k) / tuning.stick, (-dy * k) / tuning.stick);
      } else if (t.identifier === lookId) {
        input.touch.look((t.clientX - last.x) * tuning.lookSpeed, (t.clientY - last.y) * tuning.lookSpeed);
        last.x = t.clientX;
        last.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        stick.hidden = true;
        knob.style.transform = '';
        input.touch.move(0, 0);
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  layer.addEventListener('touchend', end);
  layer.addEventListener('touchcancel', end);

  return {
    /** Only while playing: in menus the screen's own buttons take the taps. */
    show(on) { layer.classList.toggle('on', on); if (!on) input.touch.move(0, 0); },
    dispose() { layer.remove(); },
  };
}

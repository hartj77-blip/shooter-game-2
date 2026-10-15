// The HUD (heads-up display): everything drawn on top of the 3D view while you play.
// It's plain HTML and CSS rather than 3D, which keeps text crisp and cheap to update.

const MODE_LABEL = { mantle: 'CLIMB', slide: 'SLIDE', air: 'AIR' };

export function createHud({ player, settings, loop, input }) {
  const el = (id) => document.getElementById(id);
  const root = el('hud');
  const speed = el('rSpeed');
  const mode = el('rMode');
  const readout = el('readout');
  const crosshair = el('crosshair');
  const hint = el('hint');
  const fps = el('fps');

  const touchScreen = matchMedia('(pointer: coarse)');
  let lastText = '';
  let lastMode = '';
  let fpsTimer = 0;

  function modeName(s) {
    if (MODE_LABEL[s.mode]) return MODE_LABEL[s.mode];
    if (s.crouched) return 'CROUCH';
    if (s.sprinting) return 'SPRINT';
    return s.speed > 0.3 ? 'WALK' : 'STAND';
  }

  function setHint(text) {
    if (text === lastText) return;
    lastText = text;
    hint.textContent = text;
    hint.classList.toggle('on', !!text);
  }

  return {
    show(on) { root.hidden = !on; },

    update(dt, { playing }) {
      const s = player.state;
      readout.hidden = !settings.showReadout;
      speed.textContent = s.speed.toFixed(1);
      const m = modeName(s);
      if (m !== lastMode) {
        lastMode = m;
        mode.textContent = m;
        mode.dataset.mode = m.toLowerCase();
      }

      // The crosshair opens up when you move fast or leave the ground. Once we
      // have guns this will show how accurate your next shot is.
      const spread = 4 + Math.min(s.speed, 10) * 1.1 + (s.grounded ? 0 : 8);
      crosshair.style.setProperty('--spread', `${spread.toFixed(1)}px`);

      if (playing && !input.isLocked() && !touchScreen.matches) setHint('Click to capture the mouse');
      else if (s.standBlocked) setHint('No room to stand up');
      else setHint('');

      fps.hidden = !settings.showFps;
      fpsTimer -= dt;
      if (settings.showFps && fpsTimer <= 0) {
        fpsTimer = 0.25;
        const st = loop.stats;
        fps.textContent = `${st.fps} fps · update ${st.updateMs.toFixed(1)} ms · draw ${st.renderMs.toFixed(1)} ms`;
      }
    },
  };
}

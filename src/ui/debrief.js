// The debrief: how the mission went, shown once the helicopter lifts off.
//
// The time (and your best for this mission and squad size), each objective
// with a tick, the squad's numbers, and in co-op everyone's own row. XP and
// unlocks come later (milestone 7); for now it's the story of the mission.
//
// Fills in the #debrief screen; main.js shows it and wires its buttons.

const formatTime = (t) => {
  if (!Number.isFinite(t)) return '–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
const STAGE_NAMES = {
  rescue: 'Rescue the hostage', intel: 'Steal the intel', sabotage: 'Destroy the caches', hold: 'Hold the line', extract: 'Extraction',
};

/**
 * @param {object} r        the mission:complete payload (game/operation.js results)
 * @param {object} mission  levels/missions.js
 * @param {object} opts
 * @param {(owner:number) => string} opts.nameOf
 * @param {'solo'|'host'|'client'} opts.role
 */
export function fillDebrief(r, mission, { nameOf, role }) {
  const el = (id) => document.getElementById(id);
  el('debriefKind').textContent = `${mission.kind} · mission complete`;
  el('debriefTitle').textContent = mission.title;
  const result = el('debriefResult');
  result.textContent = r.record && r.previous ? 'New best time!' : r.record ? 'Extracted. Your first time through.' : 'Extracted. Everyone’s home.';
  result.classList.remove('failed');

  const rows = [
    ['Time', formatTime(r.time)],
    ['Best', formatTime(r.best)],
    ...mission.stages.map((s) => [STAGE_NAMES[s.kind] ?? s.kind, '✓', 'done']),
    ['Enemies down', String(r.kills)],
    ['Headshots', String(r.headshots)],
    ['Accuracy', `${Math.round(r.accuracy * 100)}%`],
    ['Damage taken', String(r.damageTaken)],
    ['Checkpoint retries', String(r.retries ?? 0)],
  ];
  el('debriefList').replaceChildren(...rows.flatMap(([k, v, cls]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    if (cls) dd.className = cls;
    return [dt, dd];
  }));

  // Everyone's own numbers (names only ever reach the page as text).
  const table = el('debriefPlayers');
  const players = [...(r.players ?? [])].sort((a, b) => a.owner - b.owner);
  table.hidden = players.length < 2;
  const row = (cells, tag = 'td') => {
    const tr = document.createElement('tr');
    for (const c of cells) {
      const cell = document.createElement(tag);
      cell.textContent = c;
      tr.append(cell);
    }
    return tr;
  };
  table.replaceChildren(
    row(['', 'Kills', 'Accuracy', 'Downs', 'Revives'], 'th'),
    ...players.map((p) => row([nameOf(p.owner), String(p.kills), `${Math.round(p.accuracy * 100)}%`, String(p.downs), String(p.revives)])),
  );

  el('debriefNote').textContent = role === 'client'
    ? 'The host decides what’s next. XP and unlocks arrive in milestone 7.'
    : 'XP and unlocks arrive in milestone 7.';
  el('btnAgain').hidden = role === 'client';
  el('btnDebriefLobby').hidden = role === 'solo';
  el('btnDebriefLobby').textContent = role === 'client' ? 'Leave game' : 'Back to lobby';
  el('btnDebriefTitle').hidden = role !== 'solo';
}

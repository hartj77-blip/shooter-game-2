// The debrief: how the mission went, shown once the helicopter lifts off.
//
// The time (and your best for this mission and squad size), each objective
// with a tick, the squad's numbers, and in co-op everyone's own row. Then
// your XP from this mission (game/xp.js), your rank bar, and anything new it
// unlocked.
//
// Fills in the #debrief screen; main.js shows it and wires its buttons.

import { rankProgress, gunProgress } from '../game/profile.js';
import { gunName } from './names.js';

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
 * @param {object} [opts.xp]       game/xp.js summary for this mission
 * @param {object} [opts.profile]  game/profile.js data, after the XP went in
 * @param {string[]} [opts.unlocks] what this mission unlocked, in words
 */
export function fillDebrief(r, mission, { nameOf, role, xp = null, profile = null, unlocks = [] }) {
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

  fillXp(el('debriefXp'), xp, profile, unlocks);
  el('debriefNote').textContent = role === 'client' ? 'The host decides what’s next.' : '';
  el('btnAgain').hidden = role === 'client';
  el('btnDebriefLobby').hidden = role === 'solo';
  el('btnDebriefLobby').textContent = role === 'client' ? 'Leave game' : 'Back to lobby';
  el('btnDebriefTitle').hidden = role !== 'solo';
}

const fmt = (n) => Math.round(n).toLocaleString('en-GB');

/** Your XP: each reason, the total, the rank bar, and each gun you used. */
function fillXp(box, xp, profile, unlocks) {
  box.hidden = !xp || !profile;
  if (box.hidden) return;
  const parts = [];
  const h = document.createElement('h3');
  h.textContent = `+${fmt(xp.total)} XP${xp.multiplier !== 1 ? ` (×${xp.multiplier.toFixed(2).replace(/\.?0+$/, '')})` : ''}`;
  parts.push(h);
  const dl = document.createElement('dl');
  dl.className = 'debrief-list';
  for (const line of xp.lines) {
    const dt = document.createElement('dt');
    dt.textContent = line.label;
    const dd = document.createElement('dd');
    dd.textContent = `+${fmt(line.xp)}`;
    dl.append(dt, dd);
  }
  for (const g of xp.guns) {
    const dt = document.createElement('dt');
    const p = gunProgress(profile, g.gun);
    dt.textContent = `${gunName(g.gun)} · level ${p.level}`;
    const dd = document.createElement('dd');
    dd.textContent = `+${fmt(g.xp)}`;
    dl.append(dt, dd);
  }
  parts.push(dl);
  const r = rankProgress(profile);
  const label = document.createElement('p');
  label.className = 'muted small';
  label.textContent = r.max ? `Rank ${r.rank} (the top)` : `Rank ${r.rank} · ${fmt(r.into)} / ${fmt(r.needed)} XP to rank ${r.rank + 1}`;
  const bar = document.createElement('div');
  bar.className = 'xp-bar';
  const fill = document.createElement('i');
  fill.style.width = `${r.max ? 100 : Math.round((100 * r.into) / Math.max(1, r.needed))}%`;
  bar.append(fill);
  parts.push(bar, label);
  for (const u of unlocks) {
    const p = document.createElement('p');
    p.className = 'new';
    p.textContent = `New: ${u}`;
    parts.push(p);
  }
  box.replaceChildren(...parts);
}

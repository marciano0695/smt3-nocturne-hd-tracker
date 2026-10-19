import type { GameData, Milestone, ObtainRow, ObtainStatus, PlayerState } from './types';

/** Adds a Magatama at its first skill; one already owned keeps its progress. */
export function addMagatama(state: PlayerState, name: string, nextIndex = 0): PlayerState {
  if (Object.hasOwn(state.magatama, name)) return state;
  return { ...state, magatama: { ...state.magatama, [name]: { nextIndex, history: [] } } };
}

/** Magatama got by hand at a milestone (bought, picked up), not the one it rewards. */
export function getsAt(data: GameData, milestone: Milestone): string[] {
  return data.magatama
    .filter((m) => m.milestones?.includes(milestone.id) && milestone.magatama !== m.name)
    .map((m) => m.name);
}

const LAST = Number.MAX_SAFE_INTEGER - 1;

/** Every Magatama in the order the player's story list reaches it. */
export function obtainOrder(state: PlayerState, data: GameData): ObtainRow[] {
  const position = new Map(state.story.milestones.map((m, i) => [m.id, i]));
  const byId = new Map(state.story.milestones.map((m) => [m.id, m]));
  const othersOwned = (name: string) =>
    data.magatama.every((m) => m.name === name || Object.hasOwn(state.magatama, m.name));
  const target = new Set(state.build.target);

  const rows = data.magatama.map((m) => {
    const ids = m.milestones ?? [];
    const milestones = ids.flatMap((id) => byId.get(id) ?? []);
    const how: ObtainRow['how'] =
      ids.length === 0 ? 'start' : milestones.some((x) => x.magatama === m.name) ? 'reward' : 'get';
    let status: ObtainStatus;
    if (Object.hasOwn(state.magatama, m.name)) status = 'owned';
    else if (m.needsOthers && !othersOwned(m.name)) status = 'later';
    // A milestone the player deleted shouldn't hide the Magatama for good.
    else if (milestones.length === 0 || milestones.some((x) => x.available || x.done)) {
      status = 'now';
    } else status = 'later';
    const row: ObtainRow = {
      name: m.name,
      how,
      milestones,
      status,
      targets: m.skills.map((s) => s.name).filter((s) => target.has(s)),
    };
    // Start first, then story order; unplaced ones and those needing all others go last.
    const first = milestones[0];
    let rank = first ? (position.get(first.id) ?? LAST) : LAST;
    if (ids.length === 0) rank = -1;
    else if (m.needsOthers) rank = LAST + 1;
    return { row, rank, order: data.dataOrder.get(m.name) ?? 0 };
  });
  return rows.sort((a, b) => a.rank - b.rank || a.order - b.order).map((r) => r.row);
}

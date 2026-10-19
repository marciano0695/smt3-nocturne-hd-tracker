import type { Evolution, EvolutionGuide, OwnedDemon, PlayerState } from './types';

export type EvolutionStatus =
  | { kind: 'none' }
  | { kind: 'waiting-level'; levelsToGo: number }
  | { kind: 'waiting-skills' }
  | { kind: 'ready' };

/** The evolution a demon goes through next, matched by name ignoring case. */
export function evolutionFor(name: string, guide: EvolutionGuide): Evolution | undefined {
  const key = name.trim().toLowerCase();
  return guide.evolutions.find((e) => e.from.toLowerCase() === key);
}

/** Lowest Demi-fiend level that lets the demon take its evolved form. */
export function minDemiFiendLevel(evolution: Evolution, guide: EvolutionGuide): number {
  return Math.max(1, evolution.toLevel - guide.demiFiendLevelGap);
}

export function evolutionStatus(
  demon: OwnedDemon,
  playerLevel: number,
  guide: EvolutionGuide,
): EvolutionStatus {
  const evolution = evolutionFor(demon.name, guide);
  if (!evolution) return { kind: 'none' };
  const levelsToGo = minDemiFiendLevel(evolution, guide) - playerLevel;
  if (levelsToGo > 0) return { kind: 'waiting-level', levelsToGo };
  if (!demon.skillsDone) return { kind: 'waiting-skills' };
  return { kind: 'ready' };
}

const ORDER: Record<EvolutionStatus['kind'], number> = {
  ready: 0,
  'waiting-skills': 1,
  'waiting-level': 2,
  none: 3,
};

/** Ready demons first, then those closest to evolving; ties keep the player's order. */
export function sortDemons(
  demons: OwnedDemon[],
  playerLevel: number,
  guide: EvolutionGuide,
): OwnedDemon[] {
  const rank = (d: OwnedDemon) => {
    const s = evolutionStatus(d, playerLevel, guide);
    return ORDER[s.kind] * 1000 + (s.kind === 'waiting-level' ? s.levelsToGo : 0);
  };
  return demons
    .map((d, i) => ({ d, i, r: rank(d) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.d);
}

function nextId(demons: OwnedDemon[]): string {
  const used = demons.map((d) => Number(/^demon-(\d+)$/.exec(d.id)?.[1] ?? 0));
  return `demon-${Math.max(0, ...used) + 1}`;
}

export function addDemon(state: PlayerState, name: string, level: number): PlayerState {
  const demons = state.demons ?? [];
  const demon: OwnedDemon = { id: nextId(demons), name: name.trim(), level, skillsDone: false };
  return { ...state, demons: [...demons, demon] };
}

export function updateDemon(
  state: PlayerState,
  id: string,
  patch: Partial<Omit<OwnedDemon, 'id'>>,
): PlayerState {
  return {
    ...state,
    demons: (state.demons ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
  };
}

export function removeDemon(state: PlayerState, id: string): PlayerState {
  return { ...state, demons: (state.demons ?? []).filter((d) => d.id !== id) };
}

/**
 * Turns the demon into its evolved form. The guides describe e.g. a Pixie becoming a
 * "Lv. 10 High Pixie", so it starts at the evolved form's level at least. The new form
 * still has skills to learn, so the checkbox is cleared for the next evolution in a chain.
 */
export function evolveDemon(state: PlayerState, id: string, guide: EvolutionGuide): PlayerState {
  const demon = state.demons?.find((d) => d.id === id);
  const evolution = demon && evolutionFor(demon.name, guide);
  if (!demon || !evolution) return state;
  return updateDemon(state, id, {
    name: evolution.to,
    level: Math.max(demon.level, evolution.toLevel),
    skillsDone: false,
  });
}

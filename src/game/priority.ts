import type { Build } from './types';

// Lists stay far shorter than this, so tiers never overlap.
const TIER = 10_000;

/**
 * How much a current skill is worth keeping; lower is overwritten first.
 * Order: other skills < wishlist (from the end) < interimKeep (from the end) < target (never).
 */
export function keepRank(skill: string, build: Build): number {
  if (build.target.includes(skill)) return Number.POSITIVE_INFINITY;
  const keep = build.interimKeep.indexOf(skill);
  if (keep !== -1) return 2 * TIER - keep;
  const wish = build.wishlist.indexOf(skill);
  if (wish !== -1) return TIER - wish;
  return 0;
}

/** Slot indices that may be overwritten, lowest priority first. Target skills are never included. */
export function replacementOrder(skills: readonly string[], build: Build): number[] {
  return skills
    .map((skill, slot) => ({ slot, rank: keepRank(skill, build) }))
    .filter(({ rank }) => rank !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.rank - b.rank || a.slot - b.slot)
    .map(({ slot }) => slot);
}

/** Slot the scheduler would overwrite to make room, or null when every skill is a target. */
export function chooseReplacementSlot(skills: readonly string[], build: Build): number | null {
  return replacementOrder(skills, build)[0] ?? null;
}

/** Whether `incoming` is worth more than the skill currently in `slot`. */
export function beats(incoming: string, current: string, build: Build): boolean {
  return keepRank(incoming, build) > keepRank(current, build);
}

import { LEVEL_ALLOWANCE } from './story';
import type { GrindSpot, GrindTier, LevelingGuide, PlayerState, SpotStatus } from './types';

// Game8: farming stops paying off once you are 6 to 10 levels above an area; take the cautious end.
export const OUT_LEVELED_MARGIN = 6;

/** Whether the story has reached a spot, and whether the player's level suits it. */
export function spotStatus(spot: GrindSpot, guide: LevelingGuide, state: PlayerState): SpotStatus {
  const milestone = spot.unlockedBy
    ? state.story.milestones.find((m) => m.id === spot.unlockedBy)
    : undefined;
  // A milestone the player deleted or renamed shouldn't hide the spot for good.
  if (milestone && !milestone.available && !milestone.done) return 'locked';
  if (spot.anyLevel) return 'ready';
  const tier = guide.tiers.find((t) => t.id === spot.tier);
  if (!tier) return 'ready';
  if (state.level < tier.min - LEVEL_ALLOWANCE) return 'under';
  if (state.level > tier.max + OUT_LEVELED_MARGIN) return 'past';
  return 'ready';
}

/** Spots that are open and suit the player's level right now. */
export function readySpots(guide: LevelingGuide, state: PlayerState): GrindSpot[] {
  return guide.spots.filter((s) => spotStatus(s, guide, state) === 'ready');
}

/** Tiers whose range holds the player's level, or the nearest one when none does. */
export function currentTiers(guide: LevelingGuide, level: number): GrindTier[] {
  const inside = guide.tiers.filter((t) => level >= t.min && level <= t.max);
  if (inside.length > 0 || guide.tiers.length === 0) return inside;
  const distance = (t: GrindTier) => (level < t.min ? t.min - level : level - t.max);
  return [guide.tiers.reduce((best, t) => (distance(t) < distance(best) ? t : best))];
}

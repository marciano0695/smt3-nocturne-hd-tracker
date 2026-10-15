import { STATS } from './types';
import type { Build, PlayerState, Rules, Stat, StatGuide } from './types';

export interface StatProjection {
  /** Level reached by this level-up. */
  level: number;
  /** Stat that gets this level's points; null once every stat is capped. */
  stat: Stat | null;
  /** Stats after this level-up. */
  stats: Record<Stat, number>;
}

export interface StatProgressRow {
  stat: Stat;
  value: number;
  target: number | null;
  cap: number;
  reached: boolean;
  /** Level at which the plan reaches the target; null without a target or if not by the max level. */
  projectedLevel: number | null;
}

function targetOf(build: Build, stat: Stat): number | null {
  const target = build.statTargets[stat];
  return typeof target === 'number' && Number.isFinite(target) ? target : null;
}

// JavaScript's % keeps the sign of the dividend, which would give a negative index below level 2.
function modulo(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** First item with the lowest key, so candidates listed in STATS order break ties in that order. */
function lowestBy<T>(items: readonly T[], key: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestKey = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const k = key(item);
    if (best === undefined || k < bestKey) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

/** Stats after giving one level's points to `stat`, never past the cap. */
export function addStatPoints(
  stats: Record<Stat, number>,
  stat: Stat,
  rules: Rules,
): Record<Stat, number> {
  return { ...stats, [stat]: Math.min(rules.statCap, stats[stat] + rules.statPointsPerLevel) };
}

/** Stat for one level-up following a repeating pattern, skipping stats that reached their target. */
function patternStat(
  stats: Record<Stat, number>,
  newLevel: number,
  pattern: readonly Stat[],
  build: Build,
  rules: Rules,
): Stat | null {
  const belowCap = (stat: Stat) => stats[stat] < rules.statCap;
  // A stat without a target never counts as reached, so the pattern keeps feeding it until the cap.
  const open = (stat: Stat) => {
    const target = targetOf(build, stat);
    return belowCap(stat) && (target === null || stats[stat] < target);
  };

  if (pattern.length > 0) {
    // The level picks the pattern position, so there is no cursor to store or to break with manual edits.
    const start = modulo(newLevel - 2, pattern.length);
    for (let i = 0; i < pattern.length; i++) {
      const stat = pattern[(start + i) % pattern.length];
      if (stat !== undefined && open(stat)) return stat;
    }
  }

  const targeted: { stat: Stat; target: number }[] = [];
  for (const stat of STATS) {
    const target = targetOf(build, stat);
    if (target !== null && belowCap(stat)) targeted.push({ stat, target });
  }
  // Targets left out of the pattern still get filled, furthest behind first.
  const behind = targeted.filter(({ stat, target }) => stats[stat] < target);
  if (behind.length > 0) {
    return lowestBy(behind, ({ stat, target }) => stats[stat] / target)?.stat ?? null;
  }
  // Every target is met: CLAUDE.md asks for the lowest of the targeted stats.
  if (targeted.length > 0) return lowestBy(targeted, ({ stat }) => stats[stat])?.stat ?? null;
  return lowestBy(STATS.filter(belowCap), (stat) => stats[stat]) ?? null;
}

/** The guide phase that covers a level; the last phase runs on past its untilLevel. */
export function guidePattern(guide: StatGuide, level: number): Stat[] {
  const phase =
    guide.phases.find((p) => p.untilLevel === null || level <= p.untilLevel) ?? guide.phases.at(-1);
  return phase?.pattern ?? [];
}

/**
 * The guide's ideal stats at every level: index = level, from `guide.start` at level 1.
 * Uses the build's targets and the cap, so the curve stops feeding a stat once it is done.
 */
export function guideCurve(guide: StatGuide, build: Build, rules: Rules): Record<Stat, number>[] {
  const curve: Record<Stat, number>[] = [];
  let stats = { ...guide.start };
  curve[1] = stats;
  for (let level = 2; level <= rules.maxLevel; level++) {
    const stat = patternStat(stats, level, guidePattern(guide, level), build, rules);
    stats = stat === null ? { ...stats } : addStatPoints(stats, stat, rules);
    curve[level] = stats;
  }
  return curve;
}

// The curve only depends on the guide, targets and rules, so it is shared by every level of a projection.
interface CachedCurve {
  guide: StatGuide;
  targets: Build['statTargets'];
  rules: Rules;
  curve: Record<Stat, number>[];
}
const curveCache = new WeakMap<Build, CachedCurve>();

function cachedCurve(guide: StatGuide, build: Build, rules: Rules): Record<Stat, number>[] {
  const hit = curveCache.get(build);
  if (hit && hit.guide === guide && hit.targets === build.statTargets && hit.rules === rules) {
    return hit.curve;
  }
  const curve = guideCurve(guide, build, rules);
  curveCache.set(build, { guide, targets: build.statTargets, rules, curve });
  return curve;
}

/** Ideal stats from the build's guide at a level, or null without a guide. */
export function guideStatsAt(
  build: Build,
  rules: Rules,
  level: number,
): Record<Stat, number> | null {
  if (!build.statGuide) return null;
  const curve = cachedCurve(build.statGuide, build, rules);
  return curve[Math.max(1, Math.min(level, rules.maxLevel))] ?? null;
}

/** Stat that should get the points of the level-up reaching `newLevel`; null when every stat is capped. */
export function suggestStat(
  stats: Record<Stat, number>,
  newLevel: number,
  build: Build,
  rules: Rules,
): Stat | null {
  const guide = build.statGuide;
  if (!guide) return patternStat(stats, newLevel, build.statPattern, build, rules);

  // Steer the actual stats toward the guide: the stat furthest below its curve gets the point.
  const ideal = guideStatsAt(build, rules, newLevel);
  const pattern = guidePattern(guide, newLevel);
  const open = (stat: Stat) => {
    const target = targetOf(build, stat);
    return stats[stat] < rules.statCap && (target === null || stats[stat] < target);
  };
  let best: Stat | null = null;
  let bestGap = 0;
  // The guide's own pick for this level goes first, so ties follow the guide's rhythm.
  const guidePick = ideal ? patternStat(stats, newLevel, pattern, build, rules) : null;
  const order = guidePick ? [guidePick, ...STATS.filter((s) => s !== guidePick)] : [...STATS];
  for (const stat of order) {
    const gap = (ideal?.[stat] ?? 0) - stats[stat];
    if (open(stat) && gap > bestGap) {
      best = stat;
      bestGap = gap;
    }
  }
  // Ahead of the guide everywhere: keep following its pattern for this phase.
  return best ?? patternStat(stats, newLevel, pattern, build, rules);
}

/** One row per level-up from `state.level + 1` to `toLevel`, following the stat suggestions. */
export function projectStats(
  state: PlayerState,
  rules: Rules,
  toLevel: number = rules.maxLevel,
): StatProjection[] {
  const last = Math.min(toLevel, rules.maxLevel);
  const rows: StatProjection[] = [];
  let stats = { ...state.stats };
  for (let level = state.level + 1; level <= last; level++) {
    const stat = suggestStat(stats, level, state.build, rules);
    stats = stat === null ? { ...stats } : addStatPoints(stats, stat, rules);
    rows.push({ level, stat, stats });
  }
  return rows;
}

export function statProgress(state: PlayerState, rules: Rules): StatProgressRow[] {
  const projection = projectStats(state, rules);
  return STATS.map((stat) => {
    const value = state.stats[stat];
    const target = targetOf(state.build, stat);
    const reached = target !== null && value >= target;
    let projectedLevel: number | null = null;
    if (reached) projectedLevel = state.level;
    else if (target !== null) {
      projectedLevel = projection.find((row) => row.stats[stat] >= target)?.level ?? null;
    }
    return { stat, value, target, cap: rules.statCap, reached, projectedLevel };
  });
}

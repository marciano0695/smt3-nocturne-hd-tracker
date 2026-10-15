import { canLearnAt, isUnlocked, levelRequirement, ownedInDataOrder, skillAt } from './data';
import { beats, chooseReplacementSlot } from './priority';
import type { Build, GameData, PlanStep, PlayerState, StepAction, StepReason } from './types';

export interface ScheduleOptions {
  /** Last level to plan, inclusive. Defaults to, and never goes past, `rules.maxLevel`. */
  toLevel?: number;
}

/** 1: next skill is a target, 2: a later one is, 3: heads for a wishlist skill, 4: anything else. */
export type CandidatePriority = 1 | 2 | 3 | 4;

/** An owned Magatama that can teach its next skill at the level being planned. */
export interface Candidate {
  magatama: string;
  /** Index of the skill it would teach. */
  index: number;
  skill: string;
  priority: CandidatePriority;
  /** Target or wishlist skill it works toward; null at priority 4. */
  toward: string | null;
  /** Earliest level `toward` is learned with this Magatama on every level-up (Infinity while locked). */
  completion: number;
  /** Level-ups with this Magatama needed to reach `toward`, counting it. */
  steps: number;
}

// The parts of the save that level-ups change; the scheduler mutates only this private copy.
interface Sim {
  skills: string[];
  /** Owned Magatama in data order -> index of its next pending skill. */
  next: Map<string, number>;
  labyrinthComplete: boolean;
}

interface Placement {
  slot: number;
  replaces: string | null;
}

const REASONS: Record<CandidatePriority, StepReason> = {
  1: 'target',
  2: 'toward-target',
  3: 'wishlist',
  4: 'free',
};

/**
 * Level at which skill `toIndex` is learned at the earliest when this Magatama is equipped on
 * every level-up from `startLevel`, starting at skill `fromIndex`. Infinity while a skill on the
 * way is locked or missing.
 */
export function completionLevel(
  data: GameData,
  magatama: string,
  fromIndex: number,
  toIndex: number,
  startLevel: number,
  labyrinthComplete: boolean,
): number {
  let level = startLevel;
  for (let i = fromIndex; i <= toIndex; i++) {
    const skill = skillAt(data, magatama, i);
    if (!skill || !isUnlocked(skill, labyrinthComplete)) return Number.POSITIVE_INFINITY;
    level = Math.max(level, levelRequirement(skill));
    // One skill per level-up, so the next one comes a level later at the earliest.
    if (i < toIndex) level += 1;
  }
  return level;
}

function startSim(state: PlayerState, data: GameData): Sim {
  const next = new Map<string, number>();
  for (const name of ownedInDataOrder(state, data)) {
    const progress = state.magatama[name];
    // A name missing from the data (typo, removed entry) cannot teach anything.
    if (progress && data.magatamaByName.has(name)) next.set(name, progress.nextIndex);
  }
  return { skills: [...state.skills], next, labyrinthComplete: state.labyrinthComplete };
}

// Where a skill would go if offered now, or null when it would be declined.
function placement(
  skill: string,
  skills: readonly string[],
  build: Build,
  maxSkills: number,
): Placement | null {
  if (skills.includes(skill)) return null;
  if (skills.length < maxSkills) return { slot: skills.length, replaces: null };
  const slot = chooseReplacementSlot(skills, build);
  const current = slot === null ? undefined : skills[slot];
  // Targets beat everything but targets; unlisted skills beat nothing, so they only fill free slots.
  if (slot === null || current === undefined || !beats(skill, current, build)) return null;
  return { slot, replaces: current };
}

function rank(sim: Sim, build: Build, data: GameData, level: number): Candidate[] {
  const known = new Set(sim.skills);
  const isPendingTarget = (name: string) => build.target.includes(name) && !known.has(name);
  // Walking toward a wishlist skill that would then be declined would lose it for good.
  const isWanted = (name: string) =>
    build.wishlist.includes(name) &&
    placement(name, sim.skills, build, data.rules.maxSkills) !== null;

  const candidates: Candidate[] = [];
  for (const [magatama, index] of sim.next) {
    const skills = data.magatamaByName.get(magatama)?.skills ?? [];
    const next = skills[index];
    if (!next || !canLearnAt(next, level, sim.labyrinthComplete)) continue;

    const firstFrom = (from: number, test: (name: string) => boolean) =>
      skills.findIndex((s, i) => i >= from && test(s.name));
    const candidate = (priority: CandidatePriority, at: number): Candidate => ({
      magatama,
      index,
      skill: next.name,
      priority,
      toward: skills[at]?.name ?? null,
      completion: completionLevel(data, magatama, index, at, level, sim.labyrinthComplete),
      steps: at - index + 1,
    });

    // The first pending target in list order is the one this Magatama reaches first.
    const target = isPendingTarget(next.name) ? index : firstFrom(index + 1, isPendingTarget);
    const wish = target === -1 ? firstFrom(index, isWanted) : -1;
    if (target !== -1) candidates.push(candidate(target === index ? 1 : 2, target));
    else if (wish !== -1) candidates.push(candidate(3, wish));
    else {
      candidates.push({
        magatama,
        index,
        skill: next.name,
        priority: 4,
        toward: null,
        completion: level,
        steps: 1,
      });
    }
  }

  const wishRank = (c: Candidate) =>
    c.priority === 3 && c.toward !== null ? build.wishlist.indexOf(c.toward) : 0;
  const order = (c: Candidate) => data.dataOrder.get(c.magatama) ?? Number.MAX_SAFE_INTEGER;
  return candidates.sort(
    (a, b) =>
      a.priority - b.priority ||
      compare(a.completion, b.completion) ||
      a.steps - b.steps ||
      wishRank(a) - wishRank(b) ||
      order(a) - order(b),
  );
}

// Subtraction would give NaN for two Infinity completions.
function compare(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function idle(level: number, reason: StepReason, action: StepAction): PlanStep {
  return {
    level,
    magatama: null,
    skill: null,
    reason,
    action,
    slot: null,
    replaces: null,
    toward: null,
  };
}

function planLevel(sim: Sim, build: Build, data: GameData, level: number): PlanStep {
  const ranked = rank(sim, build, data, level);
  const best = ranked[0];
  if (!best) return idle(level, 'none', 'none');

  const maxSkills = data.rules.maxSkills;
  // On a free level any Magatama will do, so one is named only when its skill fills an empty slot;
  // otherwise no pointer moves and every Magatama keeps its skills for later.
  const chosen =
    best.priority === 4
      ? ranked.find((c) => placement(c.skill, sim.skills, build, maxSkills) !== null)
      : best;
  if (!chosen) return idle(level, 'free', 'decline');

  const placed = placement(chosen.skill, sim.skills, build, maxSkills);
  // Declined skills are passed too: the Magatama moves on either way.
  sim.next.set(chosen.magatama, chosen.index + 1);
  if (placed) sim.skills[placed.slot] = chosen.skill;
  return {
    level,
    magatama: chosen.magatama,
    skill: chosen.skill,
    reason: REASONS[chosen.priority],
    action: placed ? 'learn' : 'decline',
    slot: placed?.slot ?? null,
    replaces: placed?.replaces ?? null,
    toward: chosen.toward,
  };
}

/** Simulates level-ups from `state.level + 1`, one step per level, choosing a Magatama for each. */
export function schedule(
  state: PlayerState,
  data: GameData,
  options: ScheduleOptions = {},
): PlanStep[] {
  const toLevel = Math.min(options.toLevel ?? data.rules.maxLevel, data.rules.maxLevel);
  const sim = startSim(state, data);
  const plan: PlanStep[] = [];
  for (let level = state.level + 1; level <= toLevel; level++) {
    plan.push(planLevel(sim, state.build, data, level));
  }
  return plan;
}

/** The planned level-ups that learn a target skill, soonest first. */
export function upcomingTargets(plan: PlanStep[], target: readonly string[]): PlanStep[] {
  return plan.filter((s) => s.action === 'learn' && s.skill !== null && target.includes(s.skill));
}

/** The planned level-up that overwrites `skill`, if any. */
export function replacedAt(plan: PlanStep[], skill: string): PlanStep | undefined {
  return plan.find((s) => s.action === 'learn' && s.replaces === skill);
}

/** Owned Magatama that can teach something at the next level-up, best first, as `schedule` ranks them. */
export function rankCandidates(state: PlayerState, data: GameData): Candidate[] {
  return rank(startSim(state, data), state.build, data, state.level + 1);
}

import { canLearnAt, nextPending } from './data';
import { beats, chooseReplacementSlot } from './priority';
import { addStatPoints, suggestStat } from './statPlan';
import type {
  GameData,
  HistoryEntry,
  LevelUpChoice,
  Offer,
  PlanStep,
  PlayerState,
  SkillChoice,
} from './types';

/** How to handle an offered skill. */
export interface SkillDecision {
  skillChoice: SkillChoice;
  replaceSlot: number | null;
}

// hasOwn so a name like "constructor" never counts as owned.
function owns(state: PlayerState, magatama: string | null): boolean {
  return magatama !== null && Object.hasOwn(state.magatama, magatama);
}

/**
 * Skill the Magatama teaches on the level-up that reaches `newLevel`, or null when nothing is learned:
 * no such owned Magatama, every skill passed, or the next one's requirement not met yet.
 */
export function offerAt(
  state: PlayerState,
  data: GameData,
  magatama: string | null,
  newLevel: number,
): Offer | null {
  if (magatama === null || !owns(state, magatama)) return null;
  const pending = nextPending(state, data, magatama);
  return pending && canLearnAt(pending.skill, newLevel, state.labyrinthComplete) ? pending : null;
}

/** The scheduler's decision for a single offered skill. */
export function defaultSkillChoice(
  state: PlayerState,
  data: GameData,
  offer: Offer,
): SkillDecision {
  const { skills, build } = state;
  const skill = offer.skill.name;
  if (skills.includes(skill)) return { skillChoice: 'decline', replaceSlot: null };
  if (skills.length < data.rules.maxSkills) return { skillChoice: 'learn', replaceSlot: null };
  if (build.target.includes(skill) || build.wishlist.includes(skill)) {
    const slot = chooseReplacementSlot(skills, build);
    const current = slot === null ? undefined : skills[slot];
    // A target outranks every replaceable skill; a wishlist skill must outrank the weakest one.
    if (slot !== null && current !== undefined && beats(skill, current, build)) {
      return { skillChoice: 'replace', replaceSlot: slot };
    }
  }
  return { skillChoice: 'decline', replaceSlot: null };
}

function skillChoiceError(
  state: PlayerState,
  data: GameData,
  offer: Offer,
  { skillChoice, replaceSlot }: Pick<LevelUpChoice, 'skillChoice' | 'replaceSlot'>,
): string | null {
  const skill = offer.skill.name;
  if (skillChoice === null) {
    return `${offer.magatama} offers ${skill}: learn it, replace a skill with it or decline it.`;
  }
  if (skillChoice === 'decline') return null;
  if (state.skills.includes(skill)) return `You already know ${skill}.`;
  if (skillChoice === 'learn') {
    return state.skills.length < data.rules.maxSkills
      ? null
      : `All ${data.rules.maxSkills} skill slots are full: replace a skill with ${skill} or decline it.`;
  }
  const validSlot =
    replaceSlot !== null &&
    Number.isInteger(replaceSlot) &&
    replaceSlot >= 0 &&
    replaceSlot < state.skills.length;
  return validSlot ? null : `Choose which skill ${skill} replaces.`;
}

// A plan computed before a manual edit can be stale, so it is followed only while it still fits the save.
function decisionFromStep(
  state: PlayerState,
  data: GameData,
  offer: Offer,
  step: PlanStep,
): SkillDecision | null {
  let decision: SkillDecision;
  if (step.action === 'decline') decision = { skillChoice: 'decline', replaceSlot: null };
  else if (step.action === 'learn' && step.replaces === null) {
    decision = { skillChoice: 'learn', replaceSlot: null };
  } else if (
    step.action === 'learn' &&
    step.slot !== null &&
    state.skills[step.slot] === step.replaces
  ) {
    decision = { skillChoice: 'replace', replaceSlot: step.slot };
  } else return null;
  return skillChoiceError(state, data, offer, decision) === null ? decision : null;
}

/** Pre-fills the level-up dialog from the plan's next step, falling back to the equipped Magatama. */
export function suggestLevelUp(
  state: PlayerState,
  data: GameData,
  nextStep: PlanStep | undefined,
): LevelUpChoice {
  const newLevel = state.level + 1;
  const step =
    nextStep?.level === newLevel && owns(state, nextStep.magatama) ? nextStep : undefined;
  const magatama = step?.magatama ?? (owns(state, state.equipped) ? state.equipped : null);
  const stat = suggestStat(state.stats, newLevel, state.build, data.rules);
  const offer = offerAt(state, data, magatama, newLevel);
  if (!offer) return { magatama, skillChoice: null, replaceSlot: null, stat };
  const planned =
    step?.skill === offer.skill.name ? decisionFromStep(state, data, offer, step) : null;
  return { magatama, ...(planned ?? defaultSkillChoice(state, data, offer)), stat };
}

/** Plain-language reason the level-up can't be applied, or null when it can. */
export function validateLevelUp(
  state: PlayerState,
  data: GameData,
  choice: LevelUpChoice,
): string | null {
  const { rules } = data;
  if (state.level >= rules.maxLevel) return `Already at the maximum level (${rules.maxLevel}).`;
  if (choice.magatama !== null && !owns(state, choice.magatama)) {
    return `${choice.magatama} is not one of your Magatama.`;
  }
  const offer = offerAt(state, data, choice.magatama, state.level + 1);
  const skillError = offer ? skillChoiceError(state, data, offer, choice) : null;
  if (skillError !== null) return skillError;
  // The cap is an unverified assumption, but it holds until the player edits rules.json.
  if (choice.stat !== null && state.stats[choice.stat] >= rules.statCap) {
    return `${choice.stat} is already at the cap of ${rules.statCap}.`;
  }
  return null;
}

/** The state after the level-up; throws the validation message when the choice is invalid. */
export function applyLevelUp(
  state: PlayerState,
  data: GameData,
  choice: LevelUpChoice,
): PlayerState {
  const error = validateLevelUp(state, data, choice);
  if (error !== null) throw new Error(error);
  const level = state.level + 1;
  const next: PlayerState = { ...state, level, equipped: choice.magatama };
  const offer = offerAt(state, data, choice.magatama, level);
  const progress = offer ? state.magatama[offer.magatama] : undefined;
  // Without an offer the pointer stays put, so the skill is offered again once its level is reached.
  if (offer && progress) {
    const skill = offer.skill.name;
    const entry: HistoryEntry = {
      skill,
      level,
      result: choice.skillChoice === 'decline' ? 'declined' : 'learned',
    };
    if (choice.skillChoice === 'learn') next.skills = [...state.skills, skill];
    const slot = choice.replaceSlot;
    if (choice.skillChoice === 'replace' && slot !== null) {
      entry.replaced = state.skills[slot];
      next.skills = state.skills.map((current, i) => (i === slot ? skill : current));
    }
    // Declined skills advance the pointer too: they are gone for good.
    next.magatama = {
      ...state.magatama,
      [offer.magatama]: {
        nextIndex: progress.nextIndex + 1,
        history: [...progress.history, entry],
      },
    };
  }
  if (choice.stat !== null) next.stats = addStatPoints(state.stats, choice.stat, data.rules);
  return next;
}

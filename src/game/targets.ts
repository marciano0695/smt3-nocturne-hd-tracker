import { findSkill } from './data';
import { completionLevel } from './scheduler';
import type { GameData, LateWindow, PlanStep, PlayerState, TargetInfo } from './types';
import { chainGate } from './windows';

/** Build-planner status of every target skill, in build order. */
export function targetStatuses(
  state: PlayerState,
  data: GameData,
  plan: PlanStep[],
  windows: LateWindow[],
): TargetInfo[] {
  return [...new Set(state.build.target)].map((skill): TargetInfo => {
    const source = findSkill(data, skill);
    if (!source) {
      return {
        skill,
        magatama: null,
        owned: false,
        stepsRemaining: null,
        earliestLevel: null,
        status: { kind: 'unknown' },
      };
    }
    const progress = state.magatama[source.magatama];
    const owned = progress !== undefined;
    const base = { skill, magatama: source.magatama, owned };
    if (state.skills.includes(skill)) {
      return { ...base, stepsRemaining: 0, earliestLevel: null, status: { kind: 'learned' } };
    }
    if (!progress) {
      const window = windows.find((w) => w.target === skill) ?? null;
      return {
        ...base,
        stepsRemaining: source.index + 1,
        earliestLevel: window?.end ?? null,
        status: { kind: 'waiting', window },
      };
    }
    if (progress.nextIndex > source.index) {
      return { ...base, stepsRemaining: null, earliestLevel: null, status: { kind: 'missed' } };
    }
    const stepsRemaining = source.index - progress.nextIndex + 1;
    const gate = chainGate(
      data,
      source.magatama,
      progress.nextIndex,
      source.index,
      state.labyrinthComplete,
    );
    if (gate !== null) {
      return { ...base, stepsRemaining, earliestLevel: null, status: { kind: 'blocked', gate } };
    }
    const earliestLevel = completionLevel(
      data,
      source.magatama,
      progress.nextIndex,
      source.index,
      state.level + 1,
      state.labyrinthComplete,
    );
    const step = plan.find((s) => s.skill === skill && s.action === 'learn');
    return {
      ...base,
      stepsRemaining,
      earliestLevel,
      status: step ? { kind: 'scheduled', level: step.level } : { kind: 'unscheduled' },
    };
  });
}

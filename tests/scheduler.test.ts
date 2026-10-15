import { describe, expect, it } from 'vite-plus/test';
import { createGameData } from '../src/game/data';
import { completionLevel, rankCandidates, schedule } from '../src/game/scheduler';
import type { PlanStep, PlayerState, SkillData } from '../src/game/types';
import { fixture22, gameData, newGameSeed } from './helpers';

const row = (s: PlanStep) => [s.level, s.magatama, s.skill, s.action, s.replaces];

const stepAt = (plan: PlanStep[], level: number) => plan.find((s) => s.level === level);

function owning(state: PlayerState, progress: Record<string, number>): PlayerState {
  const magatama = Object.fromEntries(
    Object.entries(progress).map(([name, nextIndex]) => [name, { nextIndex, history: [] }]),
  );
  return { ...state, magatama };
}

function ownAll(state: PlayerState): PlayerState {
  return owning(state, Object.fromEntries(gameData.magatama.map((m) => [m.name, 0])));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Applies the plan to a skill list, checking that every learn uses the slot it claims.
function replay(start: readonly string[], plan: PlanStep[]): string[] {
  const skills = [...start];
  for (const step of plan) {
    if (step.action !== 'learn' || step.skill === null || step.slot === null) continue;
    const claimed = step.replaces === null ? skills.length : skills.indexOf(step.replaces);
    expect(step.slot).toBe(claimed);
    skills[step.slot] = step.skill;
  }
  return skills;
}

describe('completionLevel', () => {
  it('walks consecutive level-ups, waiting for each requirement', () => {
    expect(completionLevel(gameData, 'Hifumi', 0, 2, 23, false)).toBe(25);
    expect(completionLevel(gameData, 'Hifumi', 0, 2, 24, false)).toBe(26);
    expect(completionLevel(gameData, 'Kamudo', 2, 3, 25, false)).toBe(29);
    expect(completionLevel(gameData, 'Djed', 0, 3, 23, false)).toBe(45);
  });

  it('is Infinity while a skill on the way is locked', () => {
    expect(completionLevel(gameData, 'Marogareh', 0, 5, 3, false)).toBe(Number.POSITIVE_INFINITY);
    expect(completionLevel(gameData, 'Marogareh', 0, 5, 3, true)).toBe(21);
  });

  it('treats a null level as no requirement', () => {
    expect(completionLevel(gameData, 'Masakados', 0, 6, 2, false)).toBe(8);
  });

  it('is Infinity for a Magatama or skill that is not in the data', () => {
    expect(completionLevel(gameData, 'Nope', 0, 0, 2, false)).toBe(Number.POSITIVE_INFINITY);
    expect(completionLevel(gameData, 'Ankh', 0, 9, 2, false)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('schedule from the level 22 save', () => {
  it('reproduces the acceptance table for levels 23 to 29', () => {
    const plan = schedule(fixture22(), gameData);
    expect(plan.slice(0, 7).map(row)).toEqual([
      [23, 'Kamudo', 'Focus', 'learn', 'Ice Breath'],
      [24, 'Hifumi', 'Tornado', 'decline', null],
      [25, 'Hifumi', 'Force Boost', 'decline', null],
      [26, 'Hifumi', 'War Cry', 'learn', 'Analyze'],
      [27, 'Kamudo', "Mind's Eye", 'decline', null],
      [28, null, null, 'decline', null],
      [29, 'Kamudo', 'Might', 'learn', 'Tarunda'],
    ]);
  });

  it('explains each step with a reason, the skill it works toward and the slot', () => {
    const plan = schedule(fixture22(), gameData);
    expect(plan.slice(0, 7).map((s) => [s.reason, s.toward, s.slot])).toEqual([
      ['target', 'Focus', 7],
      ['toward-target', 'War Cry', null],
      ['toward-target', 'War Cry', null],
      ['target', 'War Cry', 1],
      ['toward-target', 'Might', null],
      ['free', null, null],
      ['target', 'Might', 2],
    ]);
  });

  it('plans every level up to 99, with free levels once the owned targets are learned', () => {
    const plan = schedule(fixture22(), gameData);
    expect(plan.map((s) => s.level)).toEqual(Array.from({ length: 77 }, (_, i) => 23 + i));
    for (const step of plan.slice(7)) {
      expect(step).toEqual({
        level: step.level,
        magatama: null,
        skill: null,
        reason: 'free',
        action: 'decline',
        slot: null,
        replaces: null,
        toward: null,
      });
    }
  });

  it('learns Pierce at the next level-up once the Labyrinth is complete', () => {
    const plan = schedule({ ...fixture22(), labyrinthComplete: true }, gameData);
    expect(plan.slice(0, 7).map(row)).toEqual([
      [23, 'Marogareh', 'Pierce', 'learn', 'Ice Breath'],
      [24, 'Kamudo', 'Focus', 'learn', 'Analyze'],
      [25, 'Hifumi', 'Tornado', 'decline', null],
      [26, 'Hifumi', 'Force Boost', 'decline', null],
      [27, 'Hifumi', 'War Cry', 'learn', 'Tarunda'],
      [28, 'Kamudo', "Mind's Eye", 'decline', null],
      [29, 'Kamudo', 'Might', 'learn', 'Counter'],
    ]);
  });

  it('declines a skill the Demi-fiend already knows instead of duplicating it', () => {
    const state = fixture22();
    state.skills[7] = 'Focus';
    const plan = schedule(state, gameData);
    expect(stepAt(plan, 26)).toMatchObject({
      magatama: 'Kamudo',
      skill: 'Focus',
      reason: 'toward-target',
      action: 'decline',
    });
    expect(plan.filter((s) => s.skill === 'Focus' && s.action === 'learn')).toEqual([]);
    expect(stepAt(plan, 29)).toMatchObject({ skill: 'Might', action: 'learn' });
  });
});

describe('schedule from the new-game seed', () => {
  it('starts at level 1 with no skills', () => {
    const seed = newGameSeed();
    expect(seed.level).toBe(1);
    expect(seed.skills).toEqual([]);
  });

  it('schedules Marogareh for Lunge at level 3 and Analyze at level 4', () => {
    const plan = schedule(newGameSeed(), gameData);
    expect(plan[0]).toMatchObject({ level: 2, magatama: null, reason: 'none', action: 'none' });
    expect(stepAt(plan, 3)).toEqual({
      level: 3,
      magatama: 'Marogareh',
      skill: 'Lunge',
      reason: 'toward-target',
      action: 'learn',
      slot: 0,
      replaces: null,
      toward: 'Pierce',
    });
    expect(stepAt(plan, 4)).toMatchObject({
      magatama: 'Marogareh',
      skill: 'Analyze',
      action: 'learn',
      slot: 1,
    });
  });

  it('waits for each requirement without moving the pointer, then for the Labyrinth', () => {
    const plan = schedule(newGameSeed(), gameData);
    const taught = plan.filter((s) => s.action !== 'none');
    expect(taught.map((s) => [s.level, s.skill, s.action, s.slot])).toEqual([
      [3, 'Lunge', 'learn', 0],
      [4, 'Analyze', 'learn', 1],
      [6, 'Life Bonus', 'learn', 2],
      [10, 'Berserk', 'learn', 3],
      [20, 'Counter', 'learn', 4],
    ]);
    expect(plan.filter((s) => s.action === 'none').every((s) => s.reason === 'none')).toBe(true);
  });
});

describe('Pierce and the Labyrinth', () => {
  it('never schedules Pierce while the Labyrinth is not complete', () => {
    for (const state of [fixture22(), newGameSeed(), ownAll(newGameSeed())]) {
      const plan = schedule(state, gameData);
      expect(plan.at(-1)?.level).toBe(99);
      expect(plan.some((s) => s.skill === 'Pierce')).toBe(false);
    }
  });

  it('with Marogareh at Pierce as the only Magatama, waits for the Labyrinth', () => {
    const state = owning(fixture22(), { Marogareh: 5 });
    expect(schedule(state, gameData).every((s) => s.reason === 'none')).toBe(true);

    const plan = schedule({ ...state, labyrinthComplete: true }, gameData);
    expect(plan[0]).toMatchObject({
      level: 23,
      magatama: 'Marogareh',
      skill: 'Pierce',
      reason: 'target',
      action: 'learn',
      slot: 7,
      replaces: 'Ice Breath',
    });
    expect(plan.slice(1).every((s) => s.reason === 'none')).toBe(true);
  });
});

describe('replacements', () => {
  const mixed: PlayerState = {
    ...fixture22(),
    labyrinthComplete: true,
    skills: ['Focus', 'Lunge', 'War Cry', 'Sukunda', 'Rakunda', 'Counter', 'Heat Wave', 'Tarunda'],
    magatama: {
      ...fixture22().magatama,
      Kamudo: { nextIndex: 2, history: [] },
      Hifumi: { nextIndex: 3, history: [] },
    },
  };
  const wishful: PlayerState = {
    ...ownAll(fixture22()),
    labyrinthComplete: true,
    build: { ...fixture22().build, wishlist: ['Media', 'Fire Boost', 'Void Force'] },
  };
  const cases: [string, PlayerState][] = [
    ['level 22 save', fixture22()],
    ['level 22 save, Labyrinth complete', { ...fixture22(), labyrinthComplete: true }],
    ['new-game seed', newGameSeed()],
    ['every Magatama from level 1', { ...ownAll(newGameSeed()), labyrinthComplete: true }],
    ['with a wishlist', wishful],
    ['full slots mixing targets and others', mixed],
  ];

  for (const [name, state] of cases) {
    it(`never overwrites a target skill (${name})`, () => {
      const plan = schedule(state, gameData);
      const replaced = plan.flatMap((s) => (s.replaces === null ? [] : [s.replaces]));
      expect(replaced.filter((skill) => state.build.target.includes(skill))).toEqual([]);

      const final = replay(state.skills, plan);
      expect(final.length).toBeLessThanOrEqual(gameData.rules.maxSkills);
      expect(new Set(final).size).toBe(final.length);
      for (const target of state.build.target.filter((t) => state.skills.includes(t))) {
        expect(final).toContain(target);
      }
    });
  }

  it('overwrites the lowest-priority interim skill when the slots mix targets and others', () => {
    const plan = schedule(mixed, gameData);
    expect(stepAt(plan, 23)).toMatchObject({ skill: 'Pierce', slot: 7, replaces: 'Tarunda' });
    expect(stepAt(plan, 29)).toMatchObject({ skill: 'Might', slot: 5, replaces: 'Counter' });
  });

  it('learns all eight targets when every Magatama is owned from level 1', () => {
    const state = { ...ownAll(newGameSeed()), labyrinthComplete: true };
    const final = replay(state.skills, schedule(state, gameData));
    expect(final.toSorted()).toEqual(state.build.target.toSorted());
  });

  it('declines a target when every slot already holds a target', () => {
    const targets = ['Focus', 'Endure', 'Freikugel', 'Pierce', 'Deadly Fury', 'Might', 'War Cry'];
    const state: PlayerState = {
      ...owning(fixture22(), { Iyomante: 3 }),
      level: 35,
      skills: [...targets, 'Rakukaja'],
      build: { ...fixture22().build, target: [...targets, 'Rakukaja', 'Life Aid'] },
    };
    expect(schedule(state, gameData)[0]).toEqual({
      level: 36,
      magatama: 'Iyomante',
      skill: 'Life Aid',
      reason: 'target',
      action: 'decline',
      slot: null,
      replaces: null,
      toward: 'Life Aid',
    });
  });
});

describe('wishlist', () => {
  const build = { ...fixture22().build, interimKeep: [], wishlist: ['Media'] };

  it('learns a wishlist skill into a free slot ahead of other free levels', () => {
    const state: PlayerState = {
      ...owning(fixture22(), { Wadatsumi: 1, Ankh: 2 }),
      level: 19,
      skills: ['Lunge', 'Analyze'],
      build,
    };
    expect(schedule(state, gameData)[0]).toEqual({
      level: 20,
      magatama: 'Ankh',
      skill: 'Media',
      reason: 'wishlist',
      action: 'learn',
      slot: 2,
      replaces: null,
      toward: 'Media',
    });
  });

  it('walks a Magatama toward a later wishlist skill', () => {
    const state: PlayerState = {
      ...owning(fixture22(), { Wadatsumi: 1, Ankh: 0 }),
      level: 11,
      skills: [],
      build,
    };
    expect(schedule(state, gameData)[0]).toMatchObject({
      level: 12,
      magatama: 'Ankh',
      skill: 'Dia',
      reason: 'wishlist',
      action: 'learn',
      toward: 'Media',
    });
  });

  it('replaces an unlisted skill with a wishlist skill when the slots are full', () => {
    const state: PlayerState = {
      ...owning(fixture22(), { Ankh: 2 }),
      build: { ...fixture22().build, wishlist: ['Media'] },
    };
    const plan = schedule(state, gameData);
    expect(plan[0]).toEqual({
      level: 23,
      magatama: 'Ankh',
      skill: 'Media',
      reason: 'wishlist',
      action: 'learn',
      slot: 7,
      replaces: 'Ice Breath',
      toward: 'Media',
    });
  });

  it('is not pursued when only interimKeep skills could make room', () => {
    const base = fixture22();
    for (const nextIndex of [0, 2]) {
      const state: PlayerState = {
        ...owning(base, { Ankh: nextIndex }),
        skills: base.skills.map((s) => (s === 'Ice Breath' ? 'Focus' : s)),
        build: { ...base.build, wishlist: ['Media'] },
      };
      const plan = schedule(state, gameData);
      expect(plan.some((s) => s.magatama === 'Ankh')).toBe(false);
      expect(plan.every((s) => s.reason === 'free' && s.action === 'decline')).toBe(true);
    }
  });

  it('prefers the earlier completion, then the higher wishlist entry', () => {
    const start: PlayerState = { ...owning(fixture22(), { Ankh: 0, Shiranui: 0 }), level: 9 };
    const tied = { ...start, skills: [], build: { ...build, wishlist: ['Fire Breath', 'Dia'] } };
    expect(
      schedule(tied, gameData)
        .map((s) => s.skill)
        .slice(0, 2),
    ).toEqual(['Fire Breath', 'Dia']);

    const nearer = { ...tied, build: { ...build, wishlist: ['Media', 'Fire Breath'] } };
    expect(schedule(nearer, gameData)[0]).toMatchObject({
      magatama: 'Shiranui',
      skill: 'Fire Breath',
      toward: 'Fire Breath',
    });
  });
});

describe('free levels', () => {
  it('fills an empty slot from the first candidate in data order', () => {
    const state: PlayerState = {
      ...owning(newGameSeed(), { Ankh: 0, Masakados: 0 }),
      level: 4,
      skills: ['Lunge', 'Analyze'],
    };
    const plan = schedule(state, gameData);
    expect(plan[0]).toEqual({
      level: 5,
      magatama: 'Ankh',
      skill: 'Dia',
      reason: 'free',
      action: 'learn',
      slot: 2,
      replaces: null,
      toward: null,
    });
    expect(plan[1]).toMatchObject({ magatama: 'Masakados', skill: 'Megidolaon', slot: 3 });
  });

  it('skips a candidate whose skill is already known when filling a slot', () => {
    const state: PlayerState = {
      ...owning(newGameSeed(), { Ankh: 0, Masakados: 0 }),
      level: 4,
      skills: ['Dia'],
    };
    expect(schedule(state, gameData)[0]).toMatchObject({
      magatama: 'Masakados',
      skill: 'Megidolaon',
      action: 'learn',
      slot: 1,
    });
  });
});

describe('candidate ranking', () => {
  // Made-up Magatama: the shipped data has no case where only the step count breaks a tie.
  const skill = (name: string, level: number): SkillData => ({
    name,
    level,
    cost: '',
    type: '',
    effect: '',
  });
  const synthetic = createGameData(
    [
      { name: 'Test A', skills: [skill('A1', 10), skill('A2', 12), skill('A3', 13)] },
      { name: 'Test B', skills: [skill('B1', 10), skill('B2', 13)] },
    ],
    gameData.rules,
  );

  it('breaks a completion tie by the fewest remaining steps, before data order', () => {
    const state: PlayerState = {
      ...owning(newGameSeed(), { 'Test A': 0, 'Test B': 0 }),
      level: 9,
      build: { ...newGameSeed().build, target: ['A3', 'B2'] },
    };
    expect(
      rankCandidates(state, synthetic).map((c) => [c.magatama, c.completion, c.steps]),
    ).toEqual([
      ['Test B', 13, 2],
      ['Test A', 13, 3],
    ]);
    expect(schedule(state, synthetic)[0]).toMatchObject({ magatama: 'Test B', toward: 'B2' });
  });

  it('ranks the level 22 save the way the scheduler picks', () => {
    const ranked = rankCandidates(fixture22(), gameData);
    expect(
      ranked.map((c) => [c.magatama, c.skill, c.priority, c.toward, c.completion, c.steps]),
    ).toEqual([
      ['Kamudo', 'Focus', 1, 'Focus', 23, 1],
      ['Hifumi', 'Tornado', 2, 'War Cry', 25, 3],
      ['Wadatsumi', 'Mana Bonus', 4, null, 23, 1],
      ['Ankh', 'Dia', 4, null, 23, 1],
      ['Shiranui', 'Fire Breath', 4, null, 23, 1],
    ]);
  });
});

describe('options and inputs', () => {
  it('stops at toLevel and never plans past the max level', () => {
    expect(schedule(fixture22(), gameData, { toLevel: 25 }).map((s) => s.level)).toEqual([
      23, 24, 25,
    ]);
    expect(schedule(fixture22(), gameData, { toLevel: 150 }).at(-1)?.level).toBe(99);
  });

  it('returns nothing at the max level or when toLevel is already reached', () => {
    expect(schedule({ ...fixture22(), level: 99 }, gameData)).toEqual([]);
    expect(schedule(fixture22(), gameData, { toLevel: 22 })).toEqual([]);
  });

  it('ignores owned Magatama that are not in the data', () => {
    const state = fixture22();
    state.magatama['Not A Magatama'] = { nextIndex: 0, history: [] };
    expect(schedule(state, gameData)).toEqual(schedule(fixture22(), gameData));
  });

  it('does not mutate its input', () => {
    for (const state of [fixture22(), newGameSeed(), { ...ownAll(newGameSeed()), level: 1 }]) {
      const before = structuredClone(state);
      deepFreeze(state);
      expect(() => schedule(state, gameData)).not.toThrow();
      expect(() => rankCandidates(state, gameData)).not.toThrow();
      expect(state).toEqual(before);
    }
  });
});

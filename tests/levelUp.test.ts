import { describe, expect, it } from 'vite-plus/test';
import { createGameData, skillAt } from '../src/game/data';
import {
  applyLevelUp,
  defaultSkillChoice,
  offerAt,
  suggestLevelUp,
  validateLevelUp,
} from '../src/game/levelUp';
import type { LevelUpChoice, Offer, PlanStep, PlayerState, Rules } from '../src/game/types';
import { fixture22, gameData, newGameSeed } from './helpers';

// Literal rules so these tests don't change when the player edits data/rules.json.
const RULES: Rules = {
  maxLevel: 99,
  maxSkills: 8,
  statCap: 40,
  statPointsPerLevel: 1,
  assumptions: [],
};
const data = createGameData(gameData.magatama, RULES);

const FIXTURE_SKILLS = [
  'Lunge',
  'Analyze',
  'Tarunda',
  'Sukunda',
  'Rakunda',
  'Counter',
  'Heat Wave',
  'Ice Breath',
];

// The scheduler's step for level 23 of the level 22 save (CLAUDE.md acceptance table).
const FOCUS_STEP: PlanStep = {
  level: 23,
  magatama: 'Kamudo',
  skill: 'Focus',
  reason: 'target',
  action: 'learn',
  slot: 7,
  replaces: 'Ice Breath',
  toward: 'Focus',
};

// The level-up that follows FOCUS_STEP.
const FOCUS: LevelUpChoice = {
  magatama: 'Kamudo',
  skillChoice: 'replace',
  replaceSlot: 7,
  stat: 'STR',
};

function choice(fields: Partial<LevelUpChoice>): LevelUpChoice {
  return { magatama: null, skillChoice: null, replaceSlot: null, stat: null, ...fields };
}

function offerOf(magatama: string, index: number): Offer {
  const skill = skillAt(data, magatama, index);
  if (!skill) throw new Error(`${magatama} has no skill at index ${index}`);
  return { magatama, index, skill };
}

function owning(state: PlayerState, magatama: string, nextIndex: number): PlayerState {
  return { ...state, magatama: { ...state.magatama, [magatama]: { nextIndex, history: [] } } };
}

describe('offerAt', () => {
  it('offers the next pending skill once its level is reached', () => {
    expect(offerAt(fixture22(), data, 'Kamudo', 23)).toMatchObject({
      magatama: 'Kamudo',
      index: 1,
      skill: { name: 'Focus', level: 23 },
    });
  });

  it('offers nothing while the next skill needs a higher level', () => {
    // Iyomante's Life Aid needs level 36.
    expect(offerAt(fixture22(), data, 'Iyomante', 23)).toBeNull();
    expect(offerAt(fixture22(), data, 'Iyomante', 36)).toMatchObject({
      index: 3,
      skill: { name: 'Life Aid' },
    });
  });

  it('offers null-level Masakados skills at any level', () => {
    const state = owning(newGameSeed(), 'Masakados', 0);
    expect(offerAt(state, data, 'Masakados', 2)).toMatchObject({
      index: 0,
      skill: { name: 'Megidolaon' },
    });
    expect(offerAt(owning(state, 'Masakados', 6), data, 'Masakados', 2)?.skill.name).toBe(
      'Phys Repel',
    );
  });

  it('offers Pierce only once the Labyrinth is complete', () => {
    const state = fixture22();
    expect(offerAt(state, data, 'Marogareh', 23)).toBeNull();
    expect(offerAt(state, data, 'Marogareh', 99)).toBeNull();
    expect(offerAt({ ...state, labyrinthComplete: true }, data, 'Marogareh', 23)).toMatchObject({
      index: 5,
      skill: { name: 'Pierce' },
    });
  });

  it.each([
    ['no Magatama', null],
    ['a Magatama the player does not own', 'Djed'],
    ['an owned Magatama missing from the data', 'Not A Magatama'],
    ['a Magatama whose skills have all been passed', 'Ankh'],
  ])('offers nothing for %s', (_, magatama) => {
    const state = owning(owning(fixture22(), 'Not A Magatama', 0), 'Ankh', 3);
    expect(offerAt(state, data, magatama, 50)).toBeNull();
  });
});

describe('defaultSkillChoice', () => {
  it('declines a skill already known, even with a free slot', () => {
    const state = { ...newGameSeed(), skills: ['Tornado'] };
    expect(defaultSkillChoice(state, data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'decline',
      replaceSlot: null,
    });
  });

  it('learns any new skill into a free slot', () => {
    // Tornado is neither a target nor on the wishlist.
    const state = { ...fixture22(), skills: FIXTURE_SKILLS.slice(0, 7) };
    expect(defaultSkillChoice(state, data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'learn',
      replaceSlot: null,
    });
  });

  it('replaces the lowest-priority skill to make room for a target', () => {
    // Ice Breath is not in interimKeep, so it goes first.
    expect(defaultSkillChoice(fixture22(), data, offerOf('Kamudo', 1))).toEqual({
      skillChoice: 'replace',
      replaceSlot: 7,
    });
    // Without Ice Breath, Analyze is the lowest: it is last in interimKeep.
    const afterFocus = { ...fixture22(), skills: [...FIXTURE_SKILLS.slice(0, 7), 'Focus'] };
    expect(defaultSkillChoice(afterFocus, data, offerOf('Hifumi', 2))).toEqual({
      skillChoice: 'replace',
      replaceSlot: 1,
    });
  });

  it('declines a target when every current skill is a target too', () => {
    const skills = [
      'Endure',
      'Freikugel',
      'Pierce',
      'Deadly Fury',
      'Might',
      'War Cry',
      'Rakukaja',
      'Megidolaon',
    ];
    const base = fixture22();
    const state = { ...base, skills, build: { ...base.build, target: [...skills, 'Focus'] } };
    expect(defaultSkillChoice(state, data, offerOf('Kamudo', 1))).toEqual({
      skillChoice: 'decline',
      replaceSlot: null,
    });
  });

  it('replaces for a wishlist skill only when it beats the weakest current skill', () => {
    const base = fixture22();
    const wishing = { ...base, build: { ...base.build, wishlist: ['Tornado'] } };
    expect(defaultSkillChoice(wishing, data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'replace',
      replaceSlot: 7,
    });
    // Every interimKeep skill outranks the wishlist.
    const keepingAll = {
      ...wishing,
      build: { ...wishing.build, interimKeep: [...base.build.interimKeep, 'Ice Breath'] },
    };
    expect(defaultSkillChoice(keepingAll, data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'decline',
      replaceSlot: null,
    });
  });

  it('declines any other skill when the slots are full', () => {
    expect(defaultSkillChoice(fixture22(), data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'decline',
      replaceSlot: null,
    });
  });

  it('declines a skill that is only in interimKeep when the slots are full', () => {
    // interimKeep ranks skills already held; it does not make a new skill worth a slot.
    const base = fixture22();
    const state = {
      ...base,
      build: { ...base.build, interimKeep: [...base.build.interimKeep, 'Tornado'] },
    };
    expect(defaultSkillChoice(state, data, offerOf('Hifumi', 0))).toEqual({
      skillChoice: 'decline',
      replaceSlot: null,
    });
  });
});

describe('suggestLevelUp', () => {
  it('pre-fills the planned Focus step of the level 22 save', () => {
    expect(suggestLevelUp(fixture22(), data, FOCUS_STEP)).toEqual(FOCUS);
  });

  it('follows a planned decline even with a free slot', () => {
    const state = { ...newGameSeed(), level: 2 };
    const step: PlanStep = {
      level: 3,
      magatama: 'Marogareh',
      skill: 'Lunge',
      reason: 'free',
      action: 'decline',
      slot: null,
      replaces: null,
      toward: null,
    };
    expect(suggestLevelUp(state, data, step)).toEqual({
      magatama: 'Marogareh',
      skillChoice: 'decline',
      replaceSlot: null,
      stat: 'STR',
    });
  });

  it('follows a planned learn into a free slot', () => {
    const state = { ...newGameSeed(), level: 2 };
    const step: PlanStep = {
      level: 3,
      magatama: 'Marogareh',
      skill: 'Lunge',
      reason: 'free',
      action: 'learn',
      slot: 0,
      replaces: null,
      toward: null,
    };
    expect(suggestLevelUp(state, data, step)).toEqual({
      magatama: 'Marogareh',
      skillChoice: 'learn',
      replaceSlot: null,
      stat: 'STR',
    });
  });

  it('ignores a step for another level and uses the equipped Magatama', () => {
    const state = { ...fixture22(), equipped: 'Kamudo' };
    const later: PlanStep = { ...FOCUS_STEP, level: 24, magatama: 'Hifumi', skill: 'Force Boost' };
    expect(suggestLevelUp(state, data, later)).toEqual(FOCUS);
  });

  it('ignores a step naming a Magatama the player does not own', () => {
    const state = { ...fixture22(), equipped: 'Hifumi' };
    const unowned: PlanStep = { ...FOCUS_STEP, magatama: 'Djed', skill: 'Tarukaja' };
    expect(suggestLevelUp(state, data, unowned)).toEqual({
      magatama: 'Hifumi',
      skillChoice: 'decline',
      replaceSlot: null,
      stat: 'STR',
    });
  });

  it('uses the default choice for the equipped Magatama when there is no plan', () => {
    const state = { ...fixture22(), equipped: 'Kamudo' };
    expect(suggestLevelUp(state, data, undefined)).toEqual(FOCUS);
  });

  it('chooses no Magatama when none is planned or equipped', () => {
    expect(suggestLevelUp(fixture22(), data, undefined)).toEqual({
      magatama: null,
      skillChoice: null,
      replaceSlot: null,
      stat: 'STR',
    });
  });

  it('keeps the equipped Magatama on a free level, with no skill choice when it teaches nothing', () => {
    const state = { ...fixture22(), equipped: 'Iyomante' };
    const free: PlanStep = {
      level: 23,
      magatama: null,
      skill: null,
      reason: 'free',
      action: 'decline',
      slot: null,
      replaces: null,
      toward: null,
    };
    expect(suggestLevelUp(state, data, free)).toEqual({
      magatama: 'Iyomante',
      skillChoice: null,
      replaceSlot: null,
      stat: 'STR',
    });
  });

  it('falls back to the default choice when the planned slot holds another skill', () => {
    // Slot 7 now holds Lunge, an interimKeep skill the plan never meant to overwrite.
    const reordered = {
      ...fixture22(),
      skills: ['Ice Breath', ...FIXTURE_SKILLS.slice(1, 7), 'Lunge'],
    };
    expect(suggestLevelUp(reordered, data, FOCUS_STEP)).toEqual({ ...FOCUS, replaceSlot: 0 });
  });

  it('never turns a planned learn into a replace, even when its slot is stale', () => {
    const state = { ...owning(newGameSeed(), 'Marogareh', 1), level: 3, skills: ['Lunge'] };
    const step: PlanStep = {
      level: 4,
      magatama: 'Marogareh',
      skill: 'Analyze',
      reason: 'free',
      action: 'learn',
      slot: 0,
      replaces: null,
      toward: null,
    };
    expect(suggestLevelUp(state, data, step)).toEqual({
      magatama: 'Marogareh',
      skillChoice: 'learn',
      replaceSlot: null,
      stat: 'VIT',
    });
  });

  it('falls back to the default choice when the planned skill is no longer on offer', () => {
    // Kamudo moved on to Mind's Eye after the plan was made.
    const moved = { ...owning(fixture22(), 'Kamudo', 2), level: 24 };
    expect(suggestLevelUp(moved, data, { ...FOCUS_STEP, level: 25 })).toEqual({
      magatama: 'Kamudo',
      skillChoice: 'decline',
      replaceSlot: null,
      stat: 'VIT',
    });
  });
});

describe('validateLevelUp', () => {
  it('accepts a valid replace, learn, decline or a level-up that teaches nothing', () => {
    expect(validateLevelUp(fixture22(), data, FOCUS)).toBeNull();
    const seed = { ...newGameSeed(), level: 2 };
    expect(
      validateLevelUp(seed, data, choice({ magatama: 'Marogareh', skillChoice: 'learn' })),
    ).toBeNull();
    expect(
      validateLevelUp(fixture22(), data, choice({ magatama: 'Hifumi', skillChoice: 'decline' })),
    ).toBeNull();
    expect(validateLevelUp(fixture22(), data, choice({ magatama: 'Iyomante' }))).toBeNull();
    expect(validateLevelUp(fixture22(), data, choice({}))).toBeNull();
  });

  it('rejects a level-up from the max level', () => {
    expect(validateLevelUp({ ...fixture22(), level: 98 }, data, FOCUS)).toBeNull();
    expect(validateLevelUp({ ...fixture22(), level: 99 }, data, FOCUS)).toContain('99');
  });

  it('rejects a Magatama the player does not own', () => {
    expect(validateLevelUp(fixture22(), data, { ...FOCUS, magatama: 'Djed' })).toContain('Djed');
  });

  it('asks for a decision when a skill is on offer', () => {
    expect(validateLevelUp(fixture22(), data, { ...FOCUS, skillChoice: null })).toContain('Focus');
  });

  it('rejects learning into a full set of skills', () => {
    const learn = { ...FOCUS, skillChoice: 'learn', replaceSlot: null } as const;
    expect(validateLevelUp(fixture22(), data, learn)).toContain('Focus');
  });

  it.each([null, -1, 8, 1.5])('rejects replacing slot %s', (replaceSlot) => {
    expect(validateLevelUp(fixture22(), data, { ...FOCUS, replaceSlot })).toContain('Focus');
  });

  it('rejects learning or replacing with a skill already known', () => {
    // Seven skills, so a plain learn would otherwise fit.
    const knowsFocus = { ...fixture22(), skills: [...FIXTURE_SKILLS.slice(0, 6), 'Focus'] };
    const learn = { ...FOCUS, skillChoice: 'learn', replaceSlot: null } as const;
    expect(validateLevelUp(knowsFocus, data, learn)).toContain('Focus');
    expect(validateLevelUp(knowsFocus, data, { ...FOCUS, replaceSlot: 0 })).toContain('Focus');
    const decline = { ...FOCUS, skillChoice: 'decline', replaceSlot: null } as const;
    expect(validateLevelUp(knowsFocus, data, decline)).toBeNull();
  });

  it('rejects a point in a stat already at the cap', () => {
    const capped = { ...fixture22(), stats: { STR: 40, MAG: 2, VIT: 7, AGI: 10, LUC: 2 } };
    expect(validateLevelUp(capped, data, FOCUS)).toContain('STR');
    expect(validateLevelUp(capped, data, { ...FOCUS, stat: 'VIT' })).toBeNull();
    expect(validateLevelUp(capped, data, { ...FOCUS, stat: null })).toBeNull();
  });

  it('takes the cap from the rules', () => {
    const capped = { ...fixture22(), stats: { STR: 40, MAG: 2, VIT: 7, AGI: 10, LUC: 2 } };
    const higherCap = createGameData(gameData.magatama, { ...RULES, statCap: 45 });
    expect(validateLevelUp(capped, higherCap, FOCUS)).toBeNull();
  });

  it('ignores the skill choice when nothing is on offer', () => {
    // Life Aid needs level 36, so this 'learn' into a full set has nothing to learn.
    const learn = choice({ magatama: 'Iyomante', skillChoice: 'learn' });
    expect(validateLevelUp(fixture22(), data, learn)).toBeNull();
  });
});

describe('applyLevelUp', () => {
  it('learns nothing and keeps the pointer when the next skill needs a higher level', () => {
    // CLAUDE.md acceptance test: Iyomante's Life Aid needs level 36.
    const next = applyLevelUp(fixture22(), data, choice({ magatama: 'Iyomante', stat: 'STR' }));
    expect(next.level).toBe(23);
    expect(next.equipped).toBe('Iyomante');
    expect(next.skills).toEqual(FIXTURE_SKILLS);
    expect(next.magatama.Iyomante).toEqual({ nextIndex: 3, history: [] });
    expect(next.stats).toEqual({ STR: 12, MAG: 2, VIT: 7, AGI: 10, LUC: 2 });
  });

  it("learns nothing from Kamudo after Focus until Mind's Eye's level 25", () => {
    const at23 = applyLevelUp(fixture22(), data, FOCUS);
    const at24 = applyLevelUp(at23, data, choice({ magatama: 'Kamudo', stat: 'STR' }));
    expect(at24.level).toBe(24);
    expect(at24.skills).toEqual(at23.skills);
    expect(at24.magatama.Kamudo).toEqual({
      nextIndex: 2,
      history: [{ skill: 'Focus', level: 23, result: 'learned', replaced: 'Ice Breath' }],
    });
  });

  it('learns Lunge into a free slot on the new-game level-up from 2 to 3', () => {
    const state = { ...newGameSeed(), level: 2 };
    const next = applyLevelUp(
      state,
      data,
      choice({ magatama: 'Marogareh', skillChoice: 'learn', stat: 'STR' }),
    );
    expect(next.level).toBe(3);
    expect(next.skills).toEqual(['Lunge']);
    expect(next.magatama.Marogareh).toEqual({
      nextIndex: 1,
      history: [{ skill: 'Lunge', level: 3, result: 'learned' }],
    });
    expect(next.stats).toEqual({ STR: 3, MAG: 2, VIT: 2, AGI: 2, LUC: 2 });
  });

  it('replaces the chosen slot in place and records the skill it overwrote', () => {
    const next = applyLevelUp(fixture22(), data, FOCUS);
    expect(next.equipped).toBe('Kamudo');
    expect(next.skills).toEqual([
      'Lunge',
      'Analyze',
      'Tarunda',
      'Sukunda',
      'Rakunda',
      'Counter',
      'Heat Wave',
      'Focus',
    ]);
    expect(next.magatama.Kamudo).toEqual({
      nextIndex: 2,
      history: [{ skill: 'Focus', level: 23, result: 'learned', replaced: 'Ice Breath' }],
    });
  });

  it('keeps the skills on a decline but records it and moves the pointer on', () => {
    const decline = choice({ magatama: 'Hifumi', skillChoice: 'decline' });
    const at23 = applyLevelUp(fixture22(), data, decline);
    const at24 = applyLevelUp(at23, data, decline);
    expect(at24.skills).toEqual(FIXTURE_SKILLS);
    expect(at24.magatama.Hifumi).toEqual({
      nextIndex: 2,
      history: [
        { skill: 'Tornado', level: 23, result: 'declined' },
        { skill: 'Force Boost', level: 24, result: 'declined' },
      ],
    });
  });

  it('gives the stat point to the chosen stat, or to none', () => {
    const vit = applyLevelUp(fixture22(), data, choice({ magatama: 'Iyomante', stat: 'VIT' }));
    expect(vit.stats).toEqual({ STR: 11, MAG: 2, VIT: 8, AGI: 10, LUC: 2 });
    const none = applyLevelUp(fixture22(), data, choice({ magatama: 'Iyomante' }));
    expect(none.stats).toEqual({ STR: 11, MAG: 2, VIT: 7, AGI: 10, LUC: 2 });
  });

  it('adds rules.statPointsPerLevel without passing the cap', () => {
    const twoPoints = createGameData(gameData.magatama, { ...RULES, statPointsPerLevel: 2 });
    expect(applyLevelUp(fixture22(), twoPoints, choice({ stat: 'VIT' })).stats.VIT).toBe(9);
    const nearCap = { ...fixture22(), stats: { STR: 11, MAG: 2, VIT: 39, AGI: 10, LUC: 2 } };
    expect(applyLevelUp(nearCap, twoPoints, choice({ stat: 'VIT' })).stats.VIT).toBe(40);
  });

  it('can reach the max level but not go past it', () => {
    const at99 = applyLevelUp({ ...fixture22(), level: 98 }, data, FOCUS);
    expect(at99.level).toBe(99);
    expect(() => applyLevelUp(at99, data, choice({}))).toThrow('99');
  });

  it('throws the validation message for an invalid choice', () => {
    const unowned = { ...FOCUS, magatama: 'Djed' };
    const message = validateLevelUp(fixture22(), data, unowned);
    expect(message).not.toBeNull();
    expect(() => applyLevelUp(fixture22(), data, unowned)).toThrow(message ?? '');
  });

  const mutationCases: [string, PlayerState, LevelUpChoice][] = [
    [
      'a learn',
      { ...newGameSeed(), level: 2 },
      choice({ magatama: 'Marogareh', skillChoice: 'learn', stat: 'STR' }),
    ],
    ['a replace', fixture22(), FOCUS],
    ['a decline', fixture22(), choice({ magatama: 'Hifumi', skillChoice: 'decline', stat: 'VIT' })],
    ['a level-up that teaches nothing', fixture22(), choice({ magatama: 'Iyomante', stat: 'AGI' })],
  ];

  it.each(mutationCases)('does not change the state it is given on %s', (_, state, levelUp) => {
    const before = structuredClone(state);
    applyLevelUp(state, data, levelUp);
    expect(state).toEqual(before);
  });
});

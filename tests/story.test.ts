import { describe, expect, it } from 'vite-plus/test';
import storyJson from '../data/story.json';
import {
  TOWER_ID,
  addMilestone,
  allKalpasDone,
  changedAnchors,
  endings,
  flowchart,
  lockedSlot,
  mergeMissingMilestones,
  moveMilestone,
  nextFreeSlot,
  recommendNext,
  recordHardSave,
  removeMilestone,
  removeSaveSlot,
  setEndingSeen,
  setMilestoneAvailable,
  setMilestoneDone,
  pendingReward,
  syncAnchors,
  updateMilestone,
  upsertSaveSlot,
} from '../src/game/story';
import type { Milestone, MilestoneKind, PlayerState, StoryState } from '../src/game/types';
import { emptyStory, fixture22, newGameSeed } from './helpers';

const HS1_TITLE = "Hard save 1: before Lucifer's final offer";
const HS2_TITLE = 'Hard save 2: before the Reason choice';
const KALPAS = ['kalpa-1', 'kalpa-2', 'kalpa-3', 'kalpa-4', 'kalpa-5'];
const HS2_ENDINGS = [
  'ending-shijima',
  'ending-musubi',
  'ending-yosuga',
  'ending-freedom',
  'ending-tranquility',
];

// The app validates data/story.json in the persistence module; tests only need its contents.
function fullStory(): StoryState {
  const { milestones, saveSlots, endingsSeen } = structuredClone(storyJson);
  return { milestones, saveSlots, endingsSeen } as StoryState;
}

const isChapter = (m: Milestone) => m.kind === 'story' && m.id !== TOWER_ID;

// A fixed two-save plan for the rule and mechanics tests, so editing story.json never breaks them:
// the Labyrinth and side content from the data, plus hard save 1, the Tower, hard save 2 and the endings.
function seedStory(): StoryState {
  const story = fullStory();
  const keep = story.milestones.filter(
    (m) => m.kind === 'labyrinth' || m.kind === 'fiend' || m.kind === 'side',
  );
  const keptIds = new Set(keep.map((m) => m.id));
  const strip = (m: Milestone): Milestone => {
    const requires = (m.requires ?? []).filter((r) => keptIds.has(r) || r === 'hs1');
    const { requires: _old, ...rest } = m;
    return requires.length > 0 ? { ...rest, requires } : rest;
  };
  const anchor = (
    id: string,
    title: string,
    kind: MilestoneKind,
    requires: string[],
    verified = true,
  ) => ({ id, title, kind, available: false, done: false, verified, requires }) as Milestone;
  story.milestones = [
    ...keep.map(strip),
    anchor('hs1', HS1_TITLE, 'hardsave', ['kalpa-5']),
    anchor('ending-true-demon', 'True Demon ending', 'ending', ['hs1']),
    anchor(TOWER_ID, 'Tower of Kagutsuchi', 'story', ['hs1']),
    anchor('hs2', HS2_TITLE, 'hardsave', [TOWER_ID], false),
    anchor('ending-shijima', 'Shijima ending', 'ending', ['hs2']),
    anchor('ending-musubi', 'Musubi ending', 'ending', ['hs2']),
    anchor('ending-yosuga', 'Yosuga ending', 'ending', ['hs2']),
    anchor('ending-freedom', 'Freedom ending', 'ending', ['hs2'], false),
    anchor('ending-tranquility', 'Tranquility ending', 'ending', ['hs2'], false),
  ];
  return story;
}

/** The level 22 save (labyrinth not complete) with the given story. */
function player(story: StoryState, fields: Partial<PlayerState> = {}): PlayerState {
  return { ...fixture22(), ...fields, story };
}

function get(story: StoryState, id: string): Milestone {
  const found = story.milestones.find((m) => m.id === id);
  if (!found) throw new Error(`No milestone "${id}"`);
  return found;
}

// Setup edits a fresh copy in place, before the code under test ever sees it.
function edit(story: StoryState, id: string, fields: Partial<Milestone>): void {
  Object.assign(get(story, id), fields);
}

function custom(id: string, kind: MilestoneKind, fields: Partial<Milestone> = {}): Milestone {
  return { id, title: id, kind, available: false, done: false, verified: true, ...fields };
}

function storyOf(...milestones: Milestone[]): StoryState {
  return { ...emptyStory(), milestones };
}

function withSlots(...slots: number[]): StoryState {
  return {
    ...emptyStory(),
    saveSlots: slots.map((slot) => ({ slot, label: `Save ${slot}`, locked: false })),
  };
}

function ids(list: readonly { id: string }[]): string[] {
  return list.map((m) => m.id);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('recommendNext', () => {
  it('warns about the Tower on a new game: it is the only story milestone and the Labyrinth is not complete', () => {
    const r = recommendNext({ ...newGameSeed(), story: seedStory() });
    expect(r).toEqual({
      rule: 3,
      kind: 'tower-warning',
      title: expect.any(String),
      reason: expect.any(String),
      milestoneId: TOWER_ID,
      suggestedSlot: null,
      levelGap: null,
      alternativeId: null,
    });
    expect(r.reason).toMatch(/True Demon/);
    expect(r.reason).toMatch(/Pierce/);
    expect(r.reason).not.toMatch(/mark the Labyrinth complete/i);
  });

  it('rule 1: an open hard save asks for the first unused slot, never to be overwritten', () => {
    const story = seedStory();
    edit(story, 'hs1', { available: true });
    story.saveSlots = [
      { slot: 1, label: 'Main save', locked: false },
      { slot: 2, label: 'Before the boss', locked: false },
      { slot: 4, label: 'Old save', locked: false },
    ];
    const r = recommendNext(player(story));
    expect(r).toEqual({
      rule: 1,
      kind: 'hardsave',
      title: 'Hard save now in a new slot',
      reason: expect.any(String),
      milestoneId: 'hs1',
      suggestedSlot: 3,
      levelGap: null,
      alternativeId: null,
    });
    expect(r.reason).toContain(HS1_TITLE);
    expect(r.reason).toMatch(/never overwrite/i);
  });

  it('rule 1: the first open hard save in list order wins', () => {
    const story = seedStory();
    edit(story, 'hs2', { available: true });
    edit(story, 'hs1', { available: true });
    expect(recommendNext(player(story))).toMatchObject({ rule: 1, milestoneId: 'hs1' });
  });

  it('rule 1 beats Labyrinth content', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true });
    edit(story, 'hs2', { available: true });
    expect(recommendNext(player(story))).toMatchObject({ rule: 1, milestoneId: 'hs2' });
  });

  it('rule 1 skips hard saves that are done or not available', () => {
    const story = seedStory();
    edit(story, 'hs1', { available: true, done: true });
    edit(story, 'kalpa-1', { available: true });
    expect(recommendNext(player(story))).toMatchObject({ rule: 2, milestoneId: 'kalpa-1' });
  });

  it('rule 2: recommends Labyrinth content when the level is at most 3 under its recommended level', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true, recommendedLevel: 25 });
    expect(recommendNext(player(story, { level: 22 }))).toEqual({
      rule: 2,
      kind: 'labyrinth',
      title: 'Labyrinth of Amala: Kalpa 1',
      reason: expect.any(String),
      milestoneId: 'kalpa-1',
      suggestedSlot: null,
      levelGap: null,
      alternativeId: null,
    });
  });

  it('rule 2: more than 3 levels under means level up first, showing the gap', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true, recommendedLevel: 26 });
    const r = recommendNext(player(story, { level: 22 }));
    expect(r).toEqual({
      rule: 2,
      kind: 'level-up',
      title: 'Level up or do side quests first',
      reason: expect.any(String),
      milestoneId: 'kalpa-1',
      suggestedSlot: null,
      levelGap: 4,
      alternativeId: null,
    });
    expect(r.reason).toMatch(/\b22\b/);
    expect(r.reason).toMatch(/\b26\b/);
    expect(r.reason).toMatch(/within 3 levels/);
  });

  it('on Hard, uses the Hard level instead of the Normal one', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true, recommendedLevel: 20, recommendedLevelHard: 28 });
    const hard = recommendNext(player(story, { level: 22, difficulty: 'hard' }));
    expect(hard).toMatchObject({ rule: 2, kind: 'level-up', levelGap: 6 });
    expect(hard.reason).toMatch(/28 on Hard/);
    // The Hard level is ignored on Normal.
    expect(recommendNext(player(story, { level: 22 }))).toMatchObject({ kind: 'labyrinth' });
  });

  it('on Hard, falls back to the Normal level when no Hard level is set', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', {
      available: true,
      recommendedLevel: 26,
      recommendedLevelHard: undefined,
    });
    const r = recommendNext(player(story, { level: 22, difficulty: 'hard' }));
    expect(r).toMatchObject({ kind: 'level-up', levelGap: 4 });
    expect(r.reason).toMatch(/no Hard level set/);
  });

  it('rule 4: on Hard, a side quest counts as at your level by its Hard level', () => {
    const story = storyOf(
      custom('side-a', 'side', { available: true, recommendedLevel: 20, recommendedLevelHard: 25 }),
    );
    expect(recommendNext(player(story, { level: 22 }))).toMatchObject({ rule: 4 });
    expect(recommendNext(player(story, { level: 22, difficulty: 'hard' }))).not.toMatchObject({
      rule: 4,
    });
  });

  it('rule 2: content without a recommended level is always within reach', () => {
    const story = seedStory();
    edit(story, 'fiend-matador', { available: true });
    expect(recommendNext(player(story, { level: 1 }))).toMatchObject({
      rule: 2,
      kind: 'labyrinth',
      milestoneId: 'fiend-matador',
    });
  });

  it('rule 2: picks the first item in list order that the level allows', () => {
    const story = seedStory();
    edit(story, 'kalpa-2', { available: true, recommendedLevel: 40 });
    edit(story, 'kalpa-3', { available: true, done: true, recommendedLevel: 10 });
    edit(story, 'fiend-daisoujou', { available: true, recommendedLevel: 20 });
    edit(story, 'fiend-hell-biker', { available: true });
    expect(recommendNext(player(story, { level: 22 }))).toMatchObject({
      kind: 'labyrinth',
      milestoneId: 'fiend-daisoujou',
    });
  });

  it('rule 2: when under-levelled for all of it, points at the lowest recommended level', () => {
    const story = seedStory();
    edit(story, 'kalpa-3', { available: true, recommendedLevel: 30 });
    edit(story, 'fiend-white-rider', { available: true, recommendedLevel: 20 });
    edit(story, 'fiend-red-rider', { available: true, recommendedLevel: 20 });
    expect(recommendNext(player(story, { level: 10 }))).toMatchObject({
      rule: 2,
      kind: 'level-up',
      milestoneId: 'fiend-white-rider',
      levelGap: 10,
    });
  });

  it('rule 2 skips Labyrinth content that is done or not available', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true, done: true });
    edit(story, 'kalpa-2', { recommendedLevel: 1 });
    expect(recommendNext(player(story))).toMatchObject({ rule: 3, kind: 'tower-warning' });
  });

  it('rule 2 under-levelled still beats side quests', () => {
    const story = seedStory();
    edit(story, 'kalpa-1', { available: true, recommendedLevel: 50 });
    story.milestones.push(custom('errand', 'side', { available: true }));
    expect(recommendNext(player(story))).toMatchObject({ rule: 2, kind: 'level-up' });
  });

  it('rule 3: once every Kalpa is checked off, says to mark the Labyrinth complete', () => {
    const story = seedStory();
    for (const id of KALPAS) edit(story, id, { available: true, done: true });
    const r = recommendNext(player(story));
    expect(r).toMatchObject({ rule: 3, kind: 'tower-warning' });
    expect(r.reason).toMatch(/mark the Labyrinth complete/i);
  });

  it('rule 3 does not fire once the Labyrinth is complete', () => {
    expect(recommendNext(player(seedStory(), { labyrinthComplete: true }))).toMatchObject({
      rule: 5,
      kind: 'story',
    });
  });

  it('rule 3 does not fire while another story milestone comes before the Tower', () => {
    const story = seedStory();
    story.milestones.unshift(custom('opening', 'story', { title: 'Opening chapter' }));
    expect(recommendNext(player(story))).toMatchObject({
      rule: 5,
      kind: 'story',
      milestoneId: 'opening',
    });
  });

  it('rule 3 beats side quests', () => {
    const story = seedStory();
    story.milestones.push(custom('errand', 'side', { available: true }));
    expect(recommendNext(player(story))).toMatchObject({ rule: 3 });
  });

  it('rule 4: the first open side quest at or under the player level, with the story as the alternative', () => {
    const story = seedStory();
    story.milestones.push(
      custom('side-high', 'side', { title: 'Too hard', available: true, recommendedLevel: 23 }),
      custom('side-closed', 'side', { title: 'Not open yet', recommendedLevel: 10 }),
      custom('side-done', 'side', { title: 'Already done', available: true, done: true }),
      custom('side-ok', 'side', { title: 'Right level', available: true, recommendedLevel: 22 }),
      custom('side-any', 'side', { title: 'Any level', available: true }),
    );
    expect(recommendNext(player(story, { level: 22, labyrinthComplete: true }))).toEqual({
      rule: 4,
      kind: 'side-quest',
      title: 'Right level',
      reason: expect.any(String),
      milestoneId: 'side-ok',
      suggestedSlot: null,
      levelGap: null,
      alternativeId: TOWER_ID,
    });
  });

  it('rule 4: a side quest without a recommended level counts at any level', () => {
    const story = seedStory();
    story.milestones.push(custom('errand', 'side', { available: true }));
    expect(recommendNext(player(story, { level: 1, labyrinthComplete: true }))).toMatchObject({
      rule: 4,
      milestoneId: 'errand',
    });
  });

  it('rule 4: no alternative when no story milestone is left', () => {
    const story = storyOf(custom('errand', 'side', { available: true }));
    expect(recommendNext(player(story))).toMatchObject({
      rule: 4,
      milestoneId: 'errand',
      alternativeId: null,
    });
  });

  it('rule 5: the next story milestone, even before it is marked available', () => {
    expect(recommendNext(player(seedStory(), { labyrinthComplete: true }))).toEqual({
      rule: 5,
      kind: 'story',
      title: get(seedStory(), TOWER_ID).title,
      reason: expect.any(String),
      milestoneId: TOWER_ID,
      suggestedSlot: null,
      levelGap: null,
      alternativeId: null,
    });
  });

  it('rule 5: mentions the recommended level of the next story milestone', () => {
    const story = storyOf(custom('chapter', 'story', { recommendedLevel: 30 }));
    const r = recommendNext(player(story, { level: 22 }));
    expect(r).toMatchObject({ rule: 5, kind: 'story', milestoneId: 'chapter' });
    expect(r.reason).toMatch(/\b30\b/);
  });

  it('rule 5: with the story done, falls back to the first open hard save or ending', () => {
    const story = seedStory();
    for (const id of ['hs1', 'ending-true-demon', TOWER_ID, 'hs2']) edit(story, id, { done: true });
    expect(recommendNext(player(story, { labyrinthComplete: true }))).toEqual({
      rule: 5,
      kind: 'story',
      title: 'Shijima ending',
      reason: expect.any(String),
      milestoneId: 'ending-shijima',
      suggestedSlot: null,
      levelGap: null,
      alternativeId: null,
    });
  });

  it('rule 5: the ending fallback says which hard save slot to load', () => {
    const story = seedStory();
    for (const id of ['hs1', 'ending-true-demon', TOWER_ID, 'hs2']) edit(story, id, { done: true });
    story.saveSlots = [{ slot: 2, label: HS2_TITLE, milestoneId: 'hs2', locked: true }];
    expect(recommendNext(player(story, { labyrinthComplete: true })).reason).toContain('slot 2');
  });

  it('rule 5: all done when every milestone is done', () => {
    const story = seedStory();
    for (const m of story.milestones) m.done = true;
    expect(recommendNext(player(story))).toEqual({
      rule: 5,
      kind: 'all-done',
      title: expect.any(String),
      reason: expect.any(String),
      milestoneId: null,
      suggestedSlot: null,
      levelGap: null,
      alternativeId: null,
    });
  });

  it('rule 5: all done still counts the optional milestones left open', () => {
    const story = seedStory();
    for (const m of story.milestones) m.done = !['fiend-matador', 'fiend-trumpeter'].includes(m.id);
    const r = recommendNext(player(story));
    expect(r.kind).toBe('all-done');
    expect(r.reason).toMatch(/\b2\b/);
  });

  it('rule 5: all done for an empty checklist', () => {
    expect(recommendNext(player(emptyStory()))).toMatchObject({ rule: 5, kind: 'all-done' });
  });
});

describe('requires cascade', () => {
  it('walks from Kalpa 5 to hard save 2', () => {
    let state = player(seedStory());

    state = setMilestoneDone(state, 'kalpa-5', true);
    expect(get(state.story, 'hs1').available).toBe(true);
    expect(recommendNext(state)).toMatchObject({
      rule: 1,
      kind: 'hardsave',
      milestoneId: 'hs1',
      suggestedSlot: 1,
    });

    state = recordHardSave(state, 'hs1', 1);
    expect(get(state.story, 'hs1').done).toBe(true);
    expect(state.story.saveSlots).toEqual([
      { slot: 1, label: HS1_TITLE, milestoneId: 'hs1', locked: true },
    ]);
    expect(get(state.story, 'ending-true-demon').available).toBe(true);
    expect(get(state.story, TOWER_ID).available).toBe(true);
    expect(get(state.story, 'hs2').available).toBe(false);
    expect(recommendNext(state).kind).toBe('tower-warning');

    state = setMilestoneDone(state, TOWER_ID, true);
    expect(get(state.story, 'hs2').available).toBe(true);
    expect(recommendNext(state)).toMatchObject({
      rule: 1,
      kind: 'hardsave',
      milestoneId: 'hs2',
      suggestedSlot: 2,
    });
  });

  it('needs every listed milestone to be done', () => {
    const story = storyOf(
      custom('a', 'story'),
      custom('b', 'story'),
      custom('c', 'story', { requires: ['a', 'b'] }),
    );
    let state = setMilestoneDone(player(story), 'a', true);
    expect(get(state.story, 'c').available).toBe(false);
    state = setMilestoneDone(state, 'b', true);
    expect(get(state.story, 'c').available).toBe(true);
  });

  it('never unsets availability when a milestone is unmarked', () => {
    let state = setMilestoneDone(player(seedStory()), 'kalpa-5', true);
    state = setMilestoneDone(state, 'kalpa-5', false);
    expect(get(state.story, 'kalpa-5').done).toBe(false);
    expect(get(state.story, 'hs1').available).toBe(true);
  });

  it('leaves milestones without requirements to the player', () => {
    const story = storyOf(
      custom('a', 'story'),
      custom('empty', 'side', { requires: [] }),
      custom('none', 'side'),
    );
    const state = setMilestoneDone(player(story), 'a', true);
    expect(get(state.story, 'empty').available).toBe(false);
    expect(get(state.story, 'none').available).toBe(false);
  });

  it('never unlocks a milestone that requires an unknown id', () => {
    const story = storyOf(custom('a', 'story'), custom('c', 'story', { requires: ['a', 'ghost'] }));
    const state = setMilestoneDone(player(story), 'a', true);
    expect(get(state.story, 'c').available).toBe(false);
  });

  it('does not change labyrinthComplete, even with every Kalpa done', () => {
    let state = player(seedStory());
    for (const id of KALPAS) state = setMilestoneDone(state, id, true);
    expect(allKalpasDone(state.story)).toBe(true);
    expect(state.labyrinthComplete).toBe(false);
  });

  it('setMilestoneAvailable toggles availability only', () => {
    let state = setMilestoneAvailable(player(seedStory()), 'kalpa-1', true);
    expect(get(state.story, 'kalpa-1')).toMatchObject({ available: true, done: false });
    state = setMilestoneAvailable(state, 'kalpa-1', false);
    expect(get(state.story, 'kalpa-1').available).toBe(false);
  });
});

describe('save slots', () => {
  it('nextFreeSlot is the smallest slot number no save uses', () => {
    expect(nextFreeSlot(emptyStory())).toBe(1);
    expect(nextFreeSlot(withSlots(1, 2, 4))).toBe(3);
    expect(nextFreeSlot(withSlots(2, 3))).toBe(1);
  });

  it('lockedSlot returns only locked entries', () => {
    const story: StoryState = {
      ...emptyStory(),
      saveSlots: [
        { slot: 1, label: HS1_TITLE, milestoneId: 'hs1', locked: true },
        { slot: 2, label: 'Main save', locked: false },
      ],
    };
    expect(lockedSlot(story, 1)).toEqual({
      slot: 1,
      label: HS1_TITLE,
      milestoneId: 'hs1',
      locked: true,
    });
    expect(lockedSlot(story, 2)).toBeNull();
    expect(lockedSlot(story, 3)).toBeNull();
  });

  it('recordHardSave refuses a slot locked for another hard save and names it', () => {
    const state = recordHardSave(player(seedStory()), 'hs1', 1);
    expect(() => recordHardSave(state, 'hs2', 1)).toThrow(HS1_TITLE);
  });

  it('recordHardSave overwrites a locked slot when forced', () => {
    let state = recordHardSave(player(seedStory()), 'hs1', 1);
    state = recordHardSave(state, 'hs2', 1, { force: true });
    expect(state.story.saveSlots).toEqual([
      { slot: 1, label: HS2_TITLE, milestoneId: 'hs2', locked: true },
    ]);
    expect(get(state.story, 'hs2').done).toBe(true);
  });

  it('recordHardSave can record a hard save into its own slot again', () => {
    let state = recordHardSave(player(seedStory()), 'hs1', 1);
    state = recordHardSave(state, 'hs1', 1);
    expect(state.story.saveSlots).toEqual([
      { slot: 1, label: HS1_TITLE, milestoneId: 'hs1', locked: true },
    ]);
  });

  it('recordHardSave reuses an unlocked slot', () => {
    const story = seedStory();
    story.saveSlots = [{ slot: 1, label: 'Main save', locked: false }];
    expect(recordHardSave(player(story), 'hs1', 1).story.saveSlots).toEqual([
      { slot: 1, label: HS1_TITLE, milestoneId: 'hs1', locked: true },
    ]);
  });

  it('recordHardSave protects a locked slot that has no milestone', () => {
    const story = seedStory();
    story.saveSlots = [{ slot: 1, label: 'Backup before the boss', locked: true }];
    expect(() => recordHardSave(player(story), 'hs1', 1)).toThrow('Backup before the boss');
  });

  it('upsertSaveSlot keeps slots in slot order', () => {
    let state = upsertSaveSlot(player(emptyStory()), { slot: 3, label: 'C', locked: false });
    state = upsertSaveSlot(state, { slot: 1, label: 'A', locked: false });
    expect(state.story.saveSlots.map((s) => s.slot)).toEqual([1, 3]);
  });

  it('upsertSaveSlot replaces an unlocked slot', () => {
    const state = upsertSaveSlot(player(withSlots(1, 2)), { slot: 2, label: 'New', locked: true });
    expect(state.story.saveSlots).toEqual([
      { slot: 1, label: 'Save 1', locked: false },
      { slot: 2, label: 'New', locked: true },
    ]);
  });

  it('upsertSaveSlot refuses to replace a slot locked for another milestone unless forced', () => {
    const state = recordHardSave(player(seedStory()), 'hs1', 1);
    const entry = { slot: 1, label: 'Main save', locked: false };
    expect(() => upsertSaveSlot(state, entry)).toThrow(HS1_TITLE);
    expect(upsertSaveSlot(state, entry, { force: true }).story.saveSlots).toEqual([entry]);
  });

  it('upsertSaveSlot lets a locked hard save slot be relabelled', () => {
    const state = recordHardSave(player(seedStory()), 'hs1', 1);
    const entry = { slot: 1, label: 'HS1, keep forever', milestoneId: 'hs1', locked: true };
    expect(upsertSaveSlot(state, entry).story.saveSlots).toEqual([entry]);
  });

  it('removeSaveSlot removes the entry with that number', () => {
    const state = removeSaveSlot(player(withSlots(1, 2, 3)), 2);
    expect(state.story.saveSlots.map((s) => s.slot)).toEqual([1, 3]);
  });
});

describe('endings', () => {
  it('lists the six endings in list order', () => {
    expect(ids(endings(seedStory()))).toEqual(['ending-true-demon', ...HS2_ENDINGS]);
  });

  it('marking an ending done records it as seen, in the order seen, once', () => {
    let state = setMilestoneDone(player(seedStory()), 'ending-musubi', true);
    state = setMilestoneDone(state, 'ending-shijima', true);
    state = setMilestoneDone(state, 'ending-musubi', true);
    expect(state.story.endingsSeen).toEqual(['ending-musubi', 'ending-shijima']);
  });

  it('unmarking an ending removes it from endingsSeen', () => {
    let state = setMilestoneDone(player(seedStory()), 'ending-musubi', true);
    state = setMilestoneDone(state, 'ending-musubi', false);
    expect(state.story.endingsSeen).toEqual([]);
    expect(get(state.story, 'ending-musubi').done).toBe(false);
  });

  it('marking other milestones done leaves endingsSeen alone', () => {
    const state = setMilestoneDone(player(seedStory()), 'kalpa-1', true);
    expect(state.story.endingsSeen).toEqual([]);
  });

  it('setEndingSeen marks the ending done and seen, and can undo it', () => {
    let state = setEndingSeen(player(seedStory()), 'ending-yosuga', true);
    expect(get(state.story, 'ending-yosuga').done).toBe(true);
    expect(state.story.endingsSeen).toEqual(['ending-yosuga']);
    state = setEndingSeen(state, 'ending-yosuga', false);
    expect(get(state.story, 'ending-yosuga').done).toBe(false);
    expect(state.story.endingsSeen).toEqual([]);
  });

  it('setEndingSeen ignores milestones that are not endings', () => {
    const state = player(seedStory());
    expect(setEndingSeen(state, 'hs1', true)).toBe(state);
  });
});

describe('addMilestone', () => {
  it('appends a milestone the player wrote: not available, not done, verified', () => {
    const state = addMilestone(player(seedStory()), { title: 'Side errand', kind: 'side' });
    expect(state.story.milestones).toHaveLength(seedStory().milestones.length + 1);
    expect(state.story.milestones.at(-1)).toEqual({
      id: 'side-errand',
      title: 'Side errand',
      kind: 'side',
      available: false,
      done: false,
      verified: true,
    });
  });

  it('keeps the optional fields it is given', () => {
    const state = addMilestone(player(seedStory()), {
      title: 'Boss fight',
      kind: 'story',
      recommendedLevel: 30,
      notes: 'Bring healing items',
      available: true,
      verified: false,
      requires: ['kalpa-1'],
    });
    expect(state.story.milestones.at(-1)).toEqual({
      id: 'boss-fight',
      title: 'Boss fight',
      kind: 'story',
      recommendedLevel: 30,
      notes: 'Bring healing items',
      available: true,
      done: false,
      verified: false,
      requires: ['kalpa-1'],
    });
  });

  it('makes the id unique with -2, -3, ...', () => {
    let state = player(seedStory());
    state = addMilestone(state, { title: 'Kalpa 1', kind: 'labyrinth' });
    state = addMilestone(state, { title: 'Kalpa 1!', kind: 'labyrinth' });
    expect(ids(state.story.milestones).slice(-2)).toEqual(['kalpa-1-2', 'kalpa-1-3']);
  });

  it('builds the id from the trimmed title without accents or punctuation', () => {
    let state = player(emptyStory());
    state = addMilestone(state, { title: "  Ask the old man's friend (again)  ", kind: 'side' });
    state = addMilestone(state, { title: 'Ask the old man’s friend (again)', kind: 'side' });
    state = addMilestone(state, { title: 'Missão secundária', kind: 'side' });
    state = addMilestone(state, { title: '???', kind: 'side' });
    expect(ids(state.story.milestones)).toEqual([
      'ask-the-old-mans-friend-again',
      'ask-the-old-mans-friend-again-2',
      'missao-secundaria',
      'milestone',
    ]);
    expect(state.story.milestones[0]?.title).toBe("Ask the old man's friend (again)");
  });

  it('inserts at the given position, clamped to the list', () => {
    let state = player(seedStory());
    state = addMilestone(state, { title: 'First', kind: 'story' }, 0);
    state = addMilestone(state, { title: 'Third', kind: 'story' }, 2);
    state = addMilestone(state, { title: 'Last', kind: 'story' }, 999);
    const [seed0] = ids(seedStory().milestones);
    expect(ids(state.story.milestones).slice(0, 3)).toEqual(['first', seed0, 'third']);
    expect(state.story.milestones.at(-1)?.id).toBe('last');
  });
});

describe('updateMilestone', () => {
  it('patches fields and never changes the id', () => {
    const patch = { title: 'Kalpa 1 (first visit)', recommendedLevel: 24, id: 'renamed' };
    const state = updateMilestone(player(seedStory()), 'kalpa-1', patch);
    expect(get(state.story, 'kalpa-1')).toEqual({
      ...get(seedStory(), 'kalpa-1'),
      title: 'Kalpa 1 (first visit)',
      recommendedLevel: 24,
    });
  });

  it('applies done like setMilestoneDone', () => {
    let state = updateMilestone(player(seedStory()), 'kalpa-5', { done: true });
    expect(get(state.story, 'hs1').available).toBe(true);
    state = updateMilestone(state, 'ending-yosuga', { done: true });
    expect(state.story.endingsSeen).toEqual(['ending-yosuga']);
  });

  it('keeps endingsSeen in sync when the kind changes', () => {
    let state = setMilestoneDone(player(seedStory()), 'ending-yosuga', true);
    state = updateMilestone(state, 'ending-yosuga', { kind: 'side' });
    expect(state.story.endingsSeen).toEqual([]);
    state = updateMilestone(state, 'ending-yosuga', { kind: 'ending' });
    expect(state.story.endingsSeen).toEqual(['ending-yosuga']);
  });
});

describe('removeMilestone', () => {
  it('drops the milestone and its links, but keeps its locked save slot', () => {
    let state = setMilestoneDone(player(seedStory()), 'kalpa-5', true);
    state = recordHardSave(state, 'hs1', 1);
    state = removeMilestone(state, 'hs1');
    expect(ids(state.story.milestones)).not.toContain('hs1');
    expect(get(state.story, 'ending-true-demon').requires).toEqual([]);
    expect(get(state.story, TOWER_ID).requires).toEqual([]);
    expect(state.story.saveSlots).toEqual([{ slot: 1, label: HS1_TITLE, locked: true }]);
  });

  it('keeps the other requirements', () => {
    const story = storyOf(
      custom('a', 'story'),
      custom('b', 'story'),
      custom('c', 'story', { requires: ['a', 'b'] }),
    );
    expect(get(removeMilestone(player(story), 'a').story, 'c').requires).toEqual(['b']);
  });

  it('removes a seen ending from endingsSeen', () => {
    let state = setMilestoneDone(player(seedStory()), 'ending-musubi', true);
    state = removeMilestone(state, 'ending-musubi');
    expect(state.story.endingsSeen).toEqual([]);
  });
});

describe('moveMilestone', () => {
  it('moves a milestone forward to the given index', () => {
    const [a, b, c, d] = ids(seedStory().milestones);
    const state = moveMilestone(player(seedStory()), a!, 2);
    expect(ids(state.story.milestones).slice(0, 4)).toEqual([b, c, a, d]);
    expect(state.story.milestones).toHaveLength(seedStory().milestones.length);
  });

  it('moves a milestone back to the given index', () => {
    const state = moveMilestone(player(seedStory()), 'hs1', 0);
    expect(ids(state.story.milestones).slice(0, 2)).toEqual([
      'hs1',
      ids(seedStory().milestones)[0],
    ]);
  });

  it('clamps the index to the list', () => {
    let state = moveMilestone(player(seedStory()), 'kalpa-1', 99);
    expect(state.story.milestones.at(-1)?.id).toBe('kalpa-1');
    state = moveMilestone(state, 'ending-tranquility', -5);
    expect(state.story.milestones[0]?.id).toBe('ending-tranquility');
  });
});

describe('mergeMissingMilestones', () => {
  it('appends the seed milestones that are missing and reports their ids', () => {
    let state = updateMilestone(player(seedStory()), 'kalpa-1', { title: 'My Kalpa 1' });
    state = removeMilestone(removeMilestone(state, 'hs2'), 'ending-musubi');
    const result = mergeMissingMilestones(state, seedStory());
    expect(result.added).toEqual(['hs2', 'ending-musubi']);
    expect(ids(result.state.story.milestones).slice(-2)).toEqual(['hs2', 'ending-musubi']);
    expect(result.state.story.milestones).toHaveLength(seedStory().milestones.length);
    expect(get(result.state.story, 'kalpa-1').title).toBe('My Kalpa 1');
  });

  it('links a restored milestone back to the milestones that require it in the seed', () => {
    const { state } = mergeMissingMilestones(
      removeMilestone(player(seedStory()), 'hs2'),
      seedStory(),
    );
    expect(get(state.story, 'ending-shijima').requires).toEqual(['hs2']);
    expect(
      ids(flowchart(state.story).branches.find((b) => b.save.id === 'hs2')?.endings ?? []),
    ).toEqual(HS2_ENDINGS);
  });

  it('marks a restored milestone available when its requirements are already done', () => {
    let state = setMilestoneDone(player(seedStory()), TOWER_ID, true);
    state = removeMilestone(state, 'hs2');
    const { state: restored } = mergeMissingMilestones(state, seedStory());
    expect(get(restored.story, 'hs2').available).toBe(true);
    expect(recommendNext(restored)).toMatchObject({ rule: 1, milestoneId: 'hs2' });
  });

  it('copies the seed milestones instead of sharing them', () => {
    const seed = deepFreeze(seedStory());
    const { state } = mergeMissingMilestones(removeMilestone(player(seedStory()), 'hs2'), seed);
    // Writing to a milestone shared with the frozen seed would throw.
    get(state.story, 'hs2').title = 'Edited';
    expect(get(seed, 'hs2').title).toBe(HS2_TITLE);
  });

  it('returns the same state when nothing is missing', () => {
    const state = player(seedStory());
    const result = mergeMissingMilestones(state, seedStory());
    expect(result.state).toBe(state);
    expect(result.added).toEqual([]);
  });
});

describe('syncAnchors', () => {
  it('refreshes anchor text, adds missing anchors and keeps progress', () => {
    let state = setMilestoneDone(player(seedStory()), 'kalpa-5', true);
    state = updateMilestone(state, 'hs1', {
      title: 'Old title',
      notes: 'old',
      recommendedLevel: 70,
    });
    state = removeMilestone(state, 'ending-musubi');
    expect(changedAnchors(state.story, seedStory())).toEqual(['hs1']);

    const result = syncAnchors(state, seedStory());
    expect(result.updated).toEqual(['hs1']);
    expect(result.added).toEqual(['ending-musubi']);
    const hs1 = get(result.state.story, 'hs1');
    expect(hs1).toMatchObject({ title: HS1_TITLE, available: true, recommendedLevel: 70 });
    expect(hs1.notes).toBe(get(seedStory(), 'hs1').notes);
    expect(get(result.state.story, 'kalpa-5').done).toBe(true);
    expect(changedAnchors(result.state.story, seedStory())).toEqual([]);
  });

  it("leaves the player's own milestones alone", () => {
    const state = addMilestone(player(seedStory()), { title: 'Mine', kind: 'story', notes: 'x' });
    const result = syncAnchors(state, seedStory());
    expect(result).toMatchObject({ added: [], updated: [] });
    expect(result.state).toBe(state);
  });
});

describe('full walkthrough', () => {
  it('starts a new game at the first chapter, with the Tower warning only when the Tower is next', () => {
    const state = { ...newGameSeed(), story: fullStory() };
    expect(recommendNext(state)).toMatchObject({
      rule: 5,
      kind: 'story',
      milestoneId: 'story-shinjuku-medical-center',
    });
    let late = state;
    // Every chapter and hard save done: the Tower is all that's left of the story.
    for (const m of fullStory().milestones.filter((x) => isChapter(x) || x.kind === 'hardsave')) {
      late = setMilestoneDone(late, m.id, true);
    }
    // A player who reached the Tower without ever opening the Labyrinth.
    for (const m of late.story.milestones.filter(
      (x) => x.kind === 'labyrinth' || x.kind === 'fiend',
    )) {
      late = setMilestoneAvailable(late, m.id, false);
    }
    expect(recommendNext(late)).toMatchObject({ rule: 3, kind: 'tower-warning' });
  });

  it('opens each chapter when the previous one is done, and Matador with Ginza', () => {
    let state = { ...newGameSeed(), story: fullStory() };
    expect(get(state.story, 'story-shinjuku-medical-center').available).toBe(true);
    state = setMilestoneDone(state, 'story-shinjuku-medical-center', true);
    expect(state.magatama.Wadatsumi).toBeDefined();
    expect(get(state.story, 'story-shibuya-amala-network').available).toBe(true);
    state = setMilestoneDone(state, 'story-shibuya-amala-network', true);
    expect(get(state.story, 'story-ginza').available).toBe(true);
    expect(get(state.story, 'fiend-matador').available).toBe(true);
    expect(recommendNext(state)).toMatchObject({ rule: 2, milestoneId: 'fiend-matador' });
  });

  it('places every requirement before the milestone that needs it', () => {
    const order = ids(fullStory().milestones);
    for (const m of fullStory().milestones) {
      for (const r of m.requires ?? []) {
        expect(order.indexOf(r), `${m.id} requires ${r}`).toBeGreaterThanOrEqual(0);
        expect(order.indexOf(r)).toBeLessThan(order.indexOf(m.id));
      }
    }
  });
});

describe('Labyrinth order', () => {
  it('interleaves Fiends and Kalpas in the order their Candelabra open them', () => {
    const steps = ids(
      seedStory().milestones.filter((m) => m.kind === 'labyrinth' || m.kind === 'fiend'),
    );
    expect(steps).toEqual([
      'fiend-matador',
      'kalpa-1',
      'fiend-daisoujou',
      'fiend-hell-biker',
      'kalpa-2',
      'fiend-white-rider',
      'fiend-red-rider',
      'fiend-black-rider',
      'kalpa-3',
      'fiend-raidou-dante',
      'fiend-pale-rider',
      'fiend-mother-harlot',
      'fiend-trumpeter',
      'kalpa-4',
      'kalpa-5',
    ]);
  });

  it('opens each Kalpa once its Candelabra are in hand', () => {
    let state = setMilestoneDone(player(seedStory()), 'fiend-matador', true);
    expect(get(state.story, 'kalpa-1').available).toBe(true);
    state = setMilestoneDone(state, 'kalpa-1', true);
    state = setMilestoneDone(state, 'fiend-daisoujou', true);
    expect(get(state.story, 'kalpa-2').available).toBe(false);
    state = setMilestoneDone(state, 'fiend-hell-biker', true);
    expect(get(state.story, 'kalpa-2').available).toBe(true);
  });

  it('syncs the new requirements into an older checklist', () => {
    const old = updateMilestone(player(seedStory()), 'kalpa-2', { requires: undefined });
    const { state } = syncAnchors(old, seedStory());
    expect(get(state.story, 'kalpa-2').requires).toEqual([
      'kalpa-1',
      'fiend-daisoujou',
      'fiend-hell-biker',
    ]);
  });
});

describe('Magatama rewards', () => {
  it('adds the reward Magatama when a side quest is done, and keeps it when unchecked', () => {
    const state = player(seedStory());
    const quest = get(state.story, 'side-black-frost');
    expect(quest.magatama).toBe('Satan');
    expect(pendingReward(state, quest)).toBe('Satan');
    let next = setMilestoneDone(state, 'side-black-frost', true);
    expect(next.magatama.Satan).toEqual({ nextIndex: 0, history: [] });
    next = setMilestoneDone(next, 'side-black-frost', false);
    expect(next.magatama.Satan).toBeDefined();
  });

  it('never resets the progress of a Magatama already owned', () => {
    const state = {
      ...player(seedStory()),
      magatama: { ...fixture22().magatama, Satan: { nextIndex: 2, history: [] } },
    };
    expect(setMilestoneDone(state, 'side-black-frost', true).magatama.Satan?.nextIndex).toBe(2);
    expect(pendingReward(state, get(state.story, 'side-black-frost'))).toBeNull();
  });
});

describe('syncAnchors order and rewards', () => {
  it("fills rewards and missing levels, keeps the player's levels, and restores the anchor order", () => {
    let state = player(seedStory());
    state = updateMilestone(state, 'side-black-frost', {
      magatama: undefined,
      recommendedLevel: undefined,
    });
    state = updateMilestone(state, 'side-mara', { recommendedLevel: 45 });
    state = moveMilestone(state, 'side-bandou-shrine', 0);
    state = addMilestone(state, { title: 'My chapter', kind: 'story' }, 1);
    const result = syncAnchors(state, seedStory());
    expect(result.reordered).toBe(true);
    expect(get(result.state.story, 'side-black-frost')).toMatchObject({
      magatama: 'Satan',
      recommendedLevel: 40,
    });
    expect(get(result.state.story, 'side-mara').recommendedLevel).toBe(45);
    expect(ids(result.state.story.milestones).slice(0, 2)).toEqual([
      ids(seedStory().milestones)[0],
      'my-chapter',
    ]);
    expect(ids(result.state.story.milestones.filter((m) => m.kind === 'side')).at(-1)).toBe(
      'side-bandou-shrine',
    );
  });
});

describe('allKalpasDone', () => {
  it('is true only once every Kalpa is done', () => {
    const story = seedStory();
    expect(allKalpasDone(story)).toBe(false);
    for (const id of KALPAS.slice(0, 4)) edit(story, id, { done: true });
    expect(allKalpasDone(story)).toBe(false);
    edit(story, 'kalpa-5', { done: true });
    expect(allKalpasDone(story)).toBe(true);
  });

  it('ignores other Labyrinth milestones', () => {
    const story = seedStory();
    for (const id of KALPAS) edit(story, id, { done: true });
    story.milestones.push(custom('amala-extra', 'labyrinth'));
    expect(allKalpasDone(story)).toBe(true);
  });

  it('is false when there are no Kalpas', () => {
    expect(allKalpasDone(emptyStory())).toBe(false);
  });
});

describe('flowchart', () => {
  it('lists each hard save in order with the endings that branch from it', () => {
    const chart = flowchart(seedStory());
    expect(chart.branches.map((b) => [b.save.id, ids(b.endings)])).toEqual([
      ['hs1', ['ending-true-demon']],
      ['hs2', HS2_ENDINGS],
    ]);
    expect(chart.branches[0]?.save).toEqual({
      id: 'hs1',
      title: HS1_TITLE,
      choice: null,
      kind: 'hardsave',
      done: false,
      available: false,
      verified: true,
      slot: null,
    });
    expect(chart.unlinked).toEqual([]);
  });

  it('shows the slot each hard save was recorded in', () => {
    const state = recordHardSave(player(seedStory()), 'hs1', 3);
    const [first] = flowchart(state.story).branches;
    expect(first?.save).toMatchObject({ done: true, slot: 3 });
    expect(first?.endings[0]).toMatchObject({
      id: 'ending-true-demon',
      available: true,
      slot: null,
    });
  });

  it('is empty for a story without hard saves', () => {
    expect(flowchart(emptyStory())).toEqual({ branches: [], unlinked: [] });
  });

  it('lists endings that no hard save leads to', () => {
    const story = storyOf(custom('ending-x', 'ending'));
    expect(ids(flowchart(story).unlinked)).toEqual(['ending-x']);
  });
});

describe('the all-endings plan in story.json', () => {
  it('says what to do at every save and for every ending', () => {
    const plan = fullStory().milestones.filter((m) => m.kind === 'hardsave' || m.kind === 'ending');
    expect(plan.filter((m) => !m.choice).map((m) => m.id)).toEqual([]);
    expect(ids(endings(fullStory()))[0]).toBe('ending-true-demon');
  });

  it('puts one hard save before each ending choice, in play order', () => {
    const chart = flowchart(fullStory());
    expect(chart.branches.map((b) => [b.save.id, ids(b.endings)])).toEqual([
      ['hs-yuko', ['ending-tranquility']],
      ['hs-isamu', ['ending-musubi']],
      ['hs-chiaki', ['ending-yosuga']],
      ['hs2', ['ending-shijima']],
      ['hs1', ['ending-true-demon', 'ending-freedom']],
    ]);
    expect(chart.unlinked).toEqual([]);
  });

  it('opens each hard save on the main line and asks for a new slot each time', () => {
    let state = { ...newGameSeed(), story: fullStory() };
    const chapters = ids(fullStory().milestones.filter(isChapter));
    for (const id of chapters.slice(0, chapters.indexOf('story-amala-network-revisited') + 1)) {
      state = setMilestoneDone(state, id, true);
    }
    expect(get(state.story, 'hs-yuko').available).toBe(true);
    expect(recommendNext(state)).toMatchObject({
      rule: 1,
      milestoneId: 'hs-yuko',
      suggestedSlot: 1,
    });
    state = recordHardSave(state, 'hs-yuko', 1);
    expect(get(state.story, 'ending-tranquility').available).toBe(true);
    expect(recommendNext(state).milestoneId).not.toBe('hs-yuko');
  });

  it('keeps the Tower after the last hard save and Kalpa 5 after the save before Metatron', () => {
    const order = ids(fullStory().milestones);
    expect(order.indexOf('hs1')).toBeLessThan(order.indexOf('kalpa-5'));
    expect(order.indexOf('hs1')).toBeLessThan(order.indexOf(TOWER_ID));
    expect(get(fullStory(), TOWER_ID).requires).toEqual(['hs1']);
  });
});

describe('purity', () => {
  it('returns the same state for unknown ids', () => {
    const state = player(seedStory());
    expect(setMilestoneDone(state, 'nope', true)).toBe(state);
    expect(setMilestoneAvailable(state, 'nope', true)).toBe(state);
    expect(setEndingSeen(state, 'nope', true)).toBe(state);
    expect(recordHardSave(state, 'nope', 1)).toBe(state);
    expect(removeSaveSlot(state, 9)).toBe(state);
    expect(updateMilestone(state, 'nope', { title: 'X' })).toBe(state);
    expect(removeMilestone(state, 'nope')).toBe(state);
    expect(moveMilestone(state, 'nope', 0)).toBe(state);
  });

  it('never mutates its inputs', () => {
    const story = seedStory();
    story.saveSlots = [{ slot: 1, label: 'Main save', locked: false }];
    edit(story, 'hs1', { available: true });
    // Any write to the frozen input throws in strict mode.
    const state = deepFreeze(player(story));
    const before = structuredClone(state);

    recommendNext(state);
    flowchart(state.story);
    setMilestoneDone(state, 'kalpa-5', true);
    setMilestoneDone(state, 'ending-shijima', true);
    setMilestoneAvailable(state, 'kalpa-1', true);
    setEndingSeen(state, 'ending-musubi', true);
    recordHardSave(state, 'hs1', 2);
    upsertSaveSlot(state, { slot: 3, label: 'Backup', locked: true });
    upsertSaveSlot(state, { slot: 1, label: 'Renamed', locked: false });
    removeSaveSlot(state, 1);
    addMilestone(state, { title: 'Side errand', kind: 'side', requires: ['hs1'] }, 0);
    updateMilestone(state, 'kalpa-1', { title: 'Renamed', done: true });
    removeMilestone(state, 'hs1');
    moveMilestone(state, 'hs1', 0);
    mergeMissingMilestones(removeMilestone(state, 'hs2'), deepFreeze(seedStory()));

    expect(state).toEqual(before);
  });
});

import { addMagatama } from './obtain';
import type {
  Difficulty,
  Milestone,
  MilestoneKind,
  PlayerState,
  Recommendation,
  SaveSlot,
  StoryState,
} from './types';

export const TOWER_ID = 'tower-of-kagutsuchi';

export interface NewMilestone {
  title: string;
  kind: MilestoneKind;
  recommendedLevel?: number;
  recommendedLevelHard?: number;
  notes?: string;
  available?: boolean;
  verified?: boolean;
  requires?: string[];
}

export interface FlowNode {
  id: string;
  title: string;
  choice: string | null;
  kind: MilestoneKind;
  done: boolean;
  available: boolean;
  verified: boolean;
  slot: number | null;
}

/** A hard save and the endings that branch from it; the main line carries on to the next save. */
export interface FlowBranch {
  save: FlowNode;
  endings: FlowNode[];
}

export interface Flowchart {
  /** Hard saves in play order. */
  branches: FlowBranch[];
  /** Endings that no hard save leads to (requires none of them). */
  unlinked: FlowNode[];
}

// Content is worth tackling from this many levels under its recommended level.
export const LEVEL_ALLOWANCE = 3;
const MAIN_PATH: MilestoneKind[] = ['story', 'hardsave', 'ending'];

function recommendation(
  rule: Recommendation['rule'],
  kind: Recommendation['kind'],
  title: string,
  reason: string,
  fields: Partial<Recommendation> = {},
): Recommendation {
  return {
    rule,
    kind,
    title,
    reason,
    milestoneId: null,
    suggestedSlot: null,
    levelGap: null,
    alternativeId: null,
    ...fields,
  };
}

function slotOf(story: StoryState, milestoneId: string): number | null {
  return story.saveSlots.find((s) => s.milestoneId === milestoneId)?.slot ?? null;
}

/** The level the advice goes by; on Hard, milestones without a Hard level fall back to Normal. */
export function levelFor(m: Milestone, difficulty: Difficulty | undefined): number | undefined {
  return difficulty === 'hard'
    ? (m.recommendedLevelHard ?? m.recommendedLevel)
    : m.recommendedLevel;
}

function describeLevel(m: Milestone, difficulty: Difficulty | undefined): string {
  const lv = levelFor(m, difficulty);
  if (difficulty !== 'hard') return `${lv}`;
  return m.recommendedLevelHard !== undefined
    ? `${lv} on Hard`
    : `${lv} (Normal; no Hard level set)`;
}

/** Dashboard "What next?": the first matching rule from CLAUDE.md, with its reason. */
export function recommendNext(state: PlayerState): Recommendation {
  const { story, level, difficulty } = state;
  const open = (m: Milestone) => m.available && !m.done;
  const rec = (m: Milestone) => levelFor(m, difficulty);
  const recText = (m: Milestone) => describeLevel(m, difficulty);

  const hardSave = story.milestones.find((m) => m.kind === 'hardsave' && open(m));
  if (hardSave) {
    const slot = nextFreeSlot(story);
    return recommendation(
      1,
      'hardsave',
      'Hard save now in a new slot',
      `You've reached "${hardSave.title}". Save in slot ${slot}, a slot no other save uses, and never overwrite it.`,
      { milestoneId: hardSave.id, suggestedSlot: slot },
    );
  }

  const labyrinth = story.milestones.filter(
    (m) => (m.kind === 'labyrinth' || m.kind === 'fiend') && open(m),
  );
  const ready = labyrinth.find((m) => {
    const lv = rec(m);
    return lv === undefined || level >= lv - LEVEL_ALLOWANCE;
  });
  if (ready) {
    const why =
      rec(ready) === undefined
        ? 'It is open and has no recommended level set.'
        : `It is open and you are level ${level}, close enough to its recommended level ${recText(ready)}.`;
    return recommendation(2, 'labyrinth', ready.title, why, { milestoneId: ready.id });
  }
  if (labyrinth.length > 0) {
    // Every open item has a level here, otherwise it would have been ready.
    const lowest = labyrinth.reduce((a, b) => ((rec(b) ?? 0) < (rec(a) ?? 0) ? b : a));
    const recommended = rec(lowest) ?? level;
    return recommendation(
      2,
      'level-up',
      'Level up or do side quests first',
      `You are level ${level}; "${lowest.title}" is recommended at level ${recText(lowest)}. Being within 3 levels of it is enough.`,
      { milestoneId: lowest.id, levelGap: recommended - level },
    );
  }

  const nextStory = story.milestones.find((m) => m.kind === 'story' && !m.done);
  if (!state.labyrinthComplete && nextStory?.id === TOWER_ID) {
    const kalpasDone = allKalpasDone(story);
    return recommendation(
      3,
      'tower-warning',
      'Finish the Labyrinth before the Tower',
      kalpasDone
        ? 'The next story milestone is the Tower of Kagutsuchi. Every Kalpa is checked off: mark the Labyrinth complete if you finished it. The True Demon ending and Pierce need it.'
        : 'The next story milestone is the Tower of Kagutsuchi. Finish the Labyrinth of Amala first: the True Demon ending and Pierce need it.',
      { milestoneId: TOWER_ID },
    );
  }

  const side = story.milestones.find((m) => m.kind === 'side' && open(m) && (rec(m) ?? 0) <= level);
  if (side) {
    return recommendation(
      4,
      'side-quest',
      side.title,
      nextStory
        ? `A side quest at your level is open. Or continue the story: "${nextStory.title}".`
        : 'A side quest at your level is open.',
      { milestoneId: side.id, alternativeId: nextStory?.id ?? null },
    );
  }

  if (nextStory) {
    const why =
      rec(nextStory) === undefined
        ? 'This is the next story milestone.'
        : `This is the next story milestone, recommended at level ${recText(nextStory)} (you are level ${level}).`;
    return recommendation(5, 'story', nextStory.title, why, { milestoneId: nextStory.id });
  }

  const remaining = story.milestones.find((m) => MAIN_PATH.includes(m.kind) && !m.done);
  if (remaining) {
    // Endings branch from a hard save, so say which slot to load.
    const from = (remaining.requires ?? [])
      .map((id) => ({ id, slot: slotOf(story, id) }))
      .find((r) => r.slot !== null);
    const title = story.milestones.find((m) => m.id === from?.id)?.title;
    const why =
      from && title
        ? `Load "${title}" from slot ${from.slot} and go for it.`
        : 'This is the next milestone left on the main path.';
    return recommendation(5, 'story', remaining.title, why, { milestoneId: remaining.id });
  }

  const optional = story.milestones.filter((m) => !m.done).length;
  return recommendation(
    5,
    'all-done',
    'Everything on the main path is done',
    optional > 0
      ? `${optional} optional milestone${optional === 1 ? '' : 's'} still open. Add more in the Story planner if you want.`
      : 'Every milestone is checked off. Add more in the Story planner if you want.',
  );
}

/** Smallest slot number no save uses yet. */
export function nextFreeSlot(story: StoryState): number {
  const used = new Set(story.saveSlots.map((s) => s.slot));
  let slot = 1;
  while (used.has(slot)) slot++;
  return slot;
}

export function lockedSlot(story: StoryState, slot: number): SaveSlot | null {
  return story.saveSlots.find((s) => s.slot === slot && s.locked) ?? null;
}

function withStory(state: PlayerState, story: Partial<StoryState>): PlayerState {
  return { ...state, story: { ...state.story, ...story } };
}

// Keeps endingsSeen equal to the done endings, in the order they were first seen.
function syncEndings(story: StoryState): string[] {
  const doneEndings = story.milestones.filter((m) => m.kind === 'ending' && m.done);
  const doneIds = new Set(doneEndings.map((m) => m.id));
  const seen = story.endingsSeen.filter((id) => doneIds.has(id));
  for (const m of doneEndings) if (!seen.includes(m.id)) seen.push(m.id);
  return seen;
}

// Availability only ever switches on, so a player's manual choice is never undone.
function cascade(milestones: Milestone[]): Milestone[] {
  const done = new Set(milestones.filter((m) => m.done).map((m) => m.id));
  return milestones.map((m) =>
    !m.available && m.requires && m.requires.length > 0 && m.requires.every((id) => done.has(id))
      ? { ...m, available: true }
      : m,
  );
}

function finish(state: PlayerState, milestones: Milestone[]): PlayerState {
  const next = cascade(milestones);
  return withStory(state, {
    milestones: next,
    endingsSeen: syncEndings({ ...state.story, milestones: next }),
  });
}

export function setMilestoneDone(state: PlayerState, id: string, done: boolean): PlayerState {
  const milestone = state.story.milestones.find((m) => m.id === id);
  if (!milestone) return state;
  const next = finish(
    state,
    state.story.milestones.map((m) => (m.id === id ? { ...m, done } : m)),
  );
  // Getting the reward means owning the Magatama; unchecking keeps it, so no progress is lost.
  const reward = milestone.magatama;
  return done && reward ? addMagatama(next, reward) : next;
}

/** Reward Magatama of a milestone that the player doesn't own yet, if any. */
export function pendingReward(state: PlayerState, milestone: Milestone): string | null {
  const reward = milestone.magatama;
  return reward && !Object.hasOwn(state.magatama, reward) ? reward : null;
}

export function setMilestoneAvailable(
  state: PlayerState,
  id: string,
  available: boolean,
): PlayerState {
  if (!state.story.milestones.some((m) => m.id === id)) return state;
  return withStory(state, {
    milestones: state.story.milestones.map((m) => (m.id === id ? { ...m, available } : m)),
  });
}

export function setEndingSeen(state: PlayerState, id: string, seen: boolean): PlayerState {
  const milestone = state.story.milestones.find((m) => m.id === id);
  if (milestone?.kind !== 'ending') return state;
  return setMilestoneDone(state, id, seen);
}

function guardSlot(story: StoryState, entry: SaveSlot, force: boolean): void {
  const existing = lockedSlot(story, entry.slot);
  if (!existing || force || existing.milestoneId === entry.milestoneId) return;
  throw new Error(
    `Slot ${entry.slot} holds "${existing.label}", a locked save. Overwriting it would lose that save. Use another slot.`,
  );
}

function putSlot(slots: SaveSlot[], entry: SaveSlot): SaveSlot[] {
  return [...slots.filter((s) => s.slot !== entry.slot), entry].sort((a, b) => a.slot - b.slot);
}

/** Records a hard save in a slot, locking it. Throws before overwriting another locked save. */
export function recordHardSave(
  state: PlayerState,
  milestoneId: string,
  slot: number,
  options: { force?: boolean } = {},
): PlayerState {
  const milestone = state.story.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return state;
  const entry: SaveSlot = { slot, label: milestone.title, milestoneId, locked: true };
  guardSlot(state.story, entry, options.force === true);
  const saved = withStory(state, { saveSlots: putSlot(state.story.saveSlots, entry) });
  return setMilestoneDone(saved, milestoneId, true);
}

export function upsertSaveSlot(
  state: PlayerState,
  slot: SaveSlot,
  options: { force?: boolean } = {},
): PlayerState {
  guardSlot(state.story, slot, options.force === true);
  return withStory(state, { saveSlots: putSlot(state.story.saveSlots, { ...slot }) });
}

export function removeSaveSlot(state: PlayerState, slotNumber: number): PlayerState {
  if (!state.story.saveSlots.some((s) => s.slot === slotNumber)) return state;
  return withStory(state, {
    saveSlots: state.story.saveSlots.filter((s) => s.slot !== slotNumber),
  });
}

function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'milestone';
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, length));

export function addMilestone(
  state: PlayerState,
  input: NewMilestone,
  position?: number,
): PlayerState {
  const title = input.title.trim();
  const id = uniqueId(slugify(title), new Set(state.story.milestones.map((m) => m.id)));
  const milestone: Milestone = {
    id,
    title,
    kind: input.kind,
    available: input.available ?? false,
    done: false,
    // The player wrote it, so it needs no "unverified" tag.
    verified: input.verified ?? true,
  };
  if (input.recommendedLevel !== undefined) milestone.recommendedLevel = input.recommendedLevel;
  if (input.recommendedLevelHard !== undefined) {
    milestone.recommendedLevelHard = input.recommendedLevelHard;
  }
  if (input.notes !== undefined) milestone.notes = input.notes;
  if (input.requires !== undefined) milestone.requires = [...input.requires];
  const list = [...state.story.milestones];
  list.splice(clampIndex(position ?? list.length, list.length), 0, milestone);
  return withStory(state, { milestones: list });
}

export function updateMilestone(
  state: PlayerState,
  id: string,
  patch: Partial<Omit<Milestone, 'id'>>,
): PlayerState {
  if (!state.story.milestones.some((m) => m.id === id)) return state;
  // The id is the milestone's identity for links and save slots; it never changes.
  const { id: _ignored, ...fields } = patch as Partial<Milestone>;
  return finish(
    state,
    state.story.milestones.map((m) => (m.id === id ? { ...m, ...fields } : m)),
  );
}

export function removeMilestone(state: PlayerState, id: string): PlayerState {
  if (!state.story.milestones.some((m) => m.id === id)) return state;
  const milestones = state.story.milestones
    .filter((m) => m.id !== id)
    .map((m) =>
      m.requires?.includes(id) ? { ...m, requires: m.requires.filter((r) => r !== id) } : m,
    );
  // The save itself still exists in the game, so the slot stays, just unlinked.
  const saveSlots = state.story.saveSlots.map((s) => {
    if (s.milestoneId !== id) return s;
    const { milestoneId: _unlinked, ...rest } = s;
    return rest;
  });
  return withStory(state, {
    milestones,
    saveSlots,
    endingsSeen: state.story.endingsSeen.filter((e) => e !== id),
  });
}

export function moveMilestone(state: PlayerState, id: string, toIndex: number): PlayerState {
  const from = state.story.milestones.findIndex((m) => m.id === id);
  if (from === -1) return state;
  const list = [...state.story.milestones];
  const [moved] = list.splice(from, 1);
  if (!moved) return state;
  list.splice(clampIndex(toIndex, list.length), 0, moved);
  return withStory(state, { milestones: list });
}

/** Anchors from story.json whose title, notes or kind differ from the player's copy. */
export function changedAnchors(story: StoryState, seed: StoryState): string[] {
  return seed.milestones
    .filter((m) => {
      const mine = story.milestones.find((x) => x.id === m.id);
      return (
        mine !== undefined &&
        (mine.title !== m.title ||
          mine.notes !== m.notes ||
          mine.kind !== m.kind ||
          mine.magatama !== m.magatama ||
          mine.choice !== m.choice ||
          (mine.requires ?? []).join('|') !== (m.requires ?? []).join('|') ||
          (mine.recommendedLevel === undefined && m.recommendedLevel !== undefined) ||
          (mine.recommendedLevelHard === undefined && m.recommendedLevelHard !== undefined))
      );
    })
    .map((m) => m.id);
}

/**
 * Brings anchors up to date with story.json: adds missing ones, refreshes title, notes, kind,
 * reward and requirements of existing ones, and restores their order. Progress, availability,
 * the player's levels and confirmations are kept.
 */
export function syncAnchors(
  state: PlayerState,
  seed: StoryState,
): { state: PlayerState; added: string[]; updated: string[]; reordered: boolean } {
  const updated = changedAnchors(state.story, seed);
  const seedById = new Map(seed.milestones.map((m) => [m.id, m]));
  let next = state;
  if (updated.length > 0) {
    next = finish(
      state,
      state.story.milestones.map((m) => {
        const fresh = seedById.get(m.id);
        if (!fresh || !updated.includes(m.id)) return m;
        const refreshed: Milestone = { ...m, title: fresh.title, kind: fresh.kind };
        if (fresh.notes === undefined) delete refreshed.notes;
        else refreshed.notes = fresh.notes;
        if (fresh.magatama === undefined) delete refreshed.magatama;
        else refreshed.magatama = fresh.magatama;
        if (fresh.choice === undefined) delete refreshed.choice;
        else refreshed.choice = fresh.choice;
        if (fresh.requires === undefined) delete refreshed.requires;
        else refreshed.requires = [...fresh.requires];
        // A level the player set is theirs; story.json only fills a missing one.
        if (refreshed.recommendedLevel === undefined && fresh.recommendedLevel !== undefined) {
          refreshed.recommendedLevel = fresh.recommendedLevel;
        }
        if (
          refreshed.recommendedLevelHard === undefined &&
          fresh.recommendedLevelHard !== undefined
        ) {
          refreshed.recommendedLevelHard = fresh.recommendedLevelHard;
        }
        return refreshed;
      }),
    );
  }
  const merged = mergeMissingMilestones(next, seed);
  const ordered = orderAnchors(merged.state, seed);
  return { state: ordered, added: merged.added, updated, reordered: ordered !== merged.state };
}

/** Whether the anchors in the checklist are in a different order than in story.json. */
export function anchorsOutOfOrder(story: StoryState, seed: StoryState): boolean {
  const seedIds = seed.milestones.map((m) => m.id);
  const mine = story.milestones.map((m) => m.id).filter((id) => seedIds.includes(id));
  return mine.join('|') !== seedIds.filter((id) => mine.includes(id)).join('|');
}

// Anchors take story.json's order within the slots they occupy; the player's own milestones stay put.
function orderAnchors(state: PlayerState, seed: StoryState): PlayerState {
  if (!anchorsOutOfOrder(state.story, seed)) return state;
  const rank = new Map(seed.milestones.map((m, i) => [m.id, i]));
  const anchors = state.story.milestones
    .filter((m) => rank.has(m.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  let next = 0;
  const milestones = state.story.milestones.map((m) =>
    rank.has(m.id) ? (anchors[next++] ?? m) : m,
  );
  return withStory(state, { milestones });
}

/** Restores anchors from story.json that the player deleted, relinking what depends on them. */
export function mergeMissingMilestones(
  state: PlayerState,
  seed: StoryState,
): { state: PlayerState; added: string[] } {
  const present = new Set(state.story.milestones.map((m) => m.id));
  const missing = seed.milestones.filter((m) => !present.has(m.id));
  if (missing.length === 0) return { state, added: [] };
  const added = missing.map((m) => m.id);
  const seedById = new Map(seed.milestones.map((m) => [m.id, m]));
  const relinked = state.story.milestones.map((m) => {
    const lost = (seedById.get(m.id)?.requires ?? []).filter(
      (r) => added.includes(r) && !(m.requires ?? []).includes(r),
    );
    return lost.length > 0 ? { ...m, requires: [...(m.requires ?? []), ...lost] } : m;
  });
  const restored = missing.map((m) => structuredClone(m));
  return { state: finish(state, [...relinked, ...restored]), added };
}

export function allKalpasDone(story: StoryState): boolean {
  const kalpas = story.milestones.filter(
    (m) => m.kind === 'labyrinth' && m.id.startsWith('kalpa-'),
  );
  return kalpas.length > 0 && kalpas.every((m) => m.done);
}

export function endings(story: StoryState): Milestone[] {
  return story.milestones.filter((m) => m.kind === 'ending');
}

/** The hard saves in play order and the endings that branch from each, for the dashboard diagram. */
export function flowchart(story: StoryState): Flowchart {
  const node = (m: Milestone): FlowNode => ({
    id: m.id,
    title: m.title,
    choice: m.choice ?? null,
    kind: m.kind,
    done: m.done,
    available: m.available,
    verified: m.verified,
    slot: slotOf(story, m.id),
  });
  const saves = story.milestones.filter((m) => m.kind === 'hardsave');
  const saveIds = new Set(saves.map((m) => m.id));
  // An ending branches from the hard save it requires.
  const branches = saves.map((save) => ({
    save: node(save),
    endings: endings(story)
      .filter((e) => e.requires?.includes(save.id))
      .map(node),
  }));
  const unlinked = endings(story)
    .filter((e) => !(e.requires ?? []).some((r) => saveIds.has(r)))
    .map(node);
  return { branches, unlinked };
}

import { parseStatGuide, type Parsed } from './data';
import {
  STATS,
  type Build,
  type GameData,
  type HistoryEntry,
  type MagatamaProgress,
  type Milestone,
  type MilestoneKind,
  type PlayerState,
  type Rules,
  type SaveFile,
  type SaveSlot,
  type Stat,
  type StoryState,
} from './types';

export const STORAGE_KEY = 'nocturne-tracker:save';
export const BACKUP_KEY = 'nocturne-tracker:backup';
export const RECOVERY_PREFIX = 'nocturne-tracker:unreadable:';
export const UNDO_LIMIT = 30;
const SCHEMA_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KINDS: readonly MilestoneKind[] = [
  'story',
  'labyrinth',
  'fiend',
  'side',
  'hardsave',
  'ending',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isStat = (value: unknown): value is Stat => STATS.includes(value as Stat);
const isNonNegInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function stringList(value: unknown, field: string, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${field} was not a list and was emptied`);
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      warnings.push(`${field}: dropped an entry that is not a name`);
      continue;
    }
    if (!out.includes(item.trim())) out.push(item.trim());
  }
  return out;
}

function parseMilestone(raw: unknown, errors: string[]): Milestone | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') {
    errors.push('a milestone has no id and was skipped');
    return null;
  }
  if (typeof raw.title !== 'string' || !KINDS.includes(raw.kind as MilestoneKind)) {
    errors.push(`milestone "${raw.id}" has no title or an unknown kind and was skipped`);
    return null;
  }
  const m: Milestone = {
    id: raw.id,
    title: raw.title,
    kind: raw.kind as MilestoneKind,
    available: raw.available === true,
    done: raw.done === true,
    verified: raw.verified !== false,
  };
  if (isNonNegInt(raw.recommendedLevel)) m.recommendedLevel = raw.recommendedLevel;
  if (typeof raw.notes === 'string') m.notes = raw.notes;
  if (typeof raw.magatama === 'string' && raw.magatama !== '') m.magatama = raw.magatama;
  if (typeof raw.choice === 'string' && raw.choice !== '') m.choice = raw.choice;
  if (Array.isArray(raw.requires)) {
    m.requires = raw.requires.filter((r): r is string => typeof r === 'string');
  }
  return m;
}

function parseSlot(raw: unknown, errors: string[]): SaveSlot | null {
  if (!isRecord(raw) || !isNonNegInt(raw.slot)) {
    errors.push('a save slot without a slot number was skipped');
    return null;
  }
  const slot: SaveSlot = {
    slot: raw.slot,
    label: typeof raw.label === 'string' ? raw.label : '',
    locked: raw.locked === true,
  };
  if (typeof raw.milestoneId === 'string') slot.milestoneId = raw.milestoneId;
  return slot;
}

/** Validates story.json-shaped input; bad entries are skipped with an error each. */
export function parseStory(json: unknown): Parsed<StoryState> {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return {
      value: { milestones: [], saveSlots: [], endingsSeen: [] },
      errors: ['story is not an object'],
    };
  }
  const milestones: Milestone[] = [];
  for (const raw of Array.isArray(json.milestones) ? json.milestones : []) {
    const m = parseMilestone(raw, errors);
    if (!m) continue;
    if (milestones.some((x) => x.id === m.id)) {
      errors.push(`milestone id "${m.id}" is used twice; the second one was skipped`);
      continue;
    }
    milestones.push(m);
  }
  const saveSlots: SaveSlot[] = [];
  for (const raw of Array.isArray(json.saveSlots) ? json.saveSlots : []) {
    const s = parseSlot(raw, errors);
    if (!s) continue;
    if (saveSlots.some((x) => x.slot === s.slot)) {
      errors.push(`save slot ${s.slot} is listed twice; the second one was skipped`);
      continue;
    }
    saveSlots.push(s);
  }
  const endingsSeen = Array.isArray(json.endingsSeen)
    ? [...new Set(json.endingsSeen.filter((e): e is string => typeof e === 'string'))]
    : [];
  return { value: { milestones, saveSlots, endingsSeen }, errors };
}

function parseHistory(raw: unknown, name: string, warnings: string[]): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const h of raw) {
    if (
      isRecord(h) &&
      typeof h.skill === 'string' &&
      isNonNegInt(h.level) &&
      (h.result === 'learned' || h.result === 'declined')
    ) {
      const entry: HistoryEntry = { skill: h.skill, level: h.level, result: h.result };
      if (typeof h.replaced === 'string') entry.replaced = h.replaced;
      out.push(entry);
    } else {
      warnings.push(`${name}: dropped an unreadable history entry`);
    }
  }
  return out;
}

function parseBuild(raw: unknown, warnings: string[]): Build {
  const b = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push('build plan was missing and starts empty');
  const statPattern: Stat[] = [];
  if (Array.isArray(b.statPattern)) {
    for (const s of b.statPattern) {
      if (isStat(s)) statPattern.push(s);
      else warnings.push(`build.statPattern: dropped "${String(s)}", not a stat`);
    }
  }
  const statTargets: Partial<Record<Stat, number>> = {};
  if (isRecord(b.statTargets)) {
    for (const [stat, value] of Object.entries(b.statTargets)) {
      if (isStat(stat) && isNonNegInt(value)) statTargets[stat] = value;
      else warnings.push(`build.statTargets: dropped "${stat}"`);
    }
  }
  const build: Build = {
    target: stringList(b.target, 'build.target', warnings),
    interimKeep: stringList(b.interimKeep, 'build.interimKeep', warnings),
    wishlist: stringList(b.wishlist, 'build.wishlist', warnings),
    statPattern,
    statTargets,
  };
  if (b.statGuide !== undefined && b.statGuide !== null) {
    const errors: string[] = [];
    const guide = parseStatGuide(b.statGuide, 'build.statGuide', errors);
    // An unreadable guide falls back to the stat pattern rather than blocking the whole save.
    if (guide) build.statGuide = guide;
    else warnings.push(...errors, 'the stat guide was dropped; the stat pattern is used instead');
  }
  return build;
}

/** Coerces anything into a valid PlayerState, reporting each fix. Never throws. */
export function normalizeState(
  raw: unknown,
  data: GameData,
  fallbackStory: StoryState,
): Parsed<PlayerState> {
  const warnings: string[] = [];
  const r = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push('the save was not an object; a blank state was used');
  const { rules } = data;

  let level = 1;
  if (typeof r.level === 'number' && Number.isFinite(r.level)) {
    level = Math.min(rules.maxLevel, Math.max(1, Math.round(r.level)));
    if (level !== r.level) warnings.push(`level ${r.level} was changed to ${level}`);
  } else {
    warnings.push('level was missing and set to 1');
  }

  const rawStats = isRecord(r.stats) ? r.stats : {};
  const stats = {} as Record<Stat, number>;
  for (const stat of STATS) {
    const v = rawStats[stat];
    if (isNonNegInt(v)) stats[stat] = v;
    else {
      stats[stat] = 0;
      warnings.push(`${stat} was missing or invalid and set to 0`);
    }
  }

  let skills = stringList(r.skills, 'skills', warnings);
  if (skills.length > rules.maxSkills) {
    warnings.push(
      `only ${rules.maxSkills} skills fit; dropped ${skills.slice(rules.maxSkills).join(', ')}`,
    );
    skills = skills.slice(0, rules.maxSkills);
  }

  const magatama: Record<string, MagatamaProgress> = {};
  if (isRecord(r.magatama)) {
    for (const [name, p] of Object.entries(r.magatama)) {
      const known = data.magatamaByName.get(name);
      // Kept even when unknown: it may be a typo in magatama.json the player will fix.
      if (!known)
        warnings.push(
          `Magatama "${name}" is not in magatama.json; kept, but it cannot be scheduled`,
        );
      const count = known?.skills.length ?? Number.MAX_SAFE_INTEGER;
      const progress = isRecord(p) ? p : {};
      let nextIndex = 0;
      if (typeof progress.nextIndex === 'number' && Number.isFinite(progress.nextIndex)) {
        nextIndex = Math.min(count, Math.max(0, Math.round(progress.nextIndex)));
        if (nextIndex !== progress.nextIndex)
          warnings.push(`${name}: progress was changed to ${nextIndex}`);
      } else {
        warnings.push(`${name}: progress was missing and set to the first skill`);
      }
      magatama[name] = { nextIndex, history: parseHistory(progress.history, name, warnings) };
    }
  }

  let equipped: string | null = null;
  if (typeof r.equipped === 'string' && r.equipped !== '') equipped = r.equipped;
  else if (r.equipped !== null && r.equipped !== undefined)
    warnings.push('equipped was invalid and cleared');

  let story = structuredClone(fallbackStory);
  if (r.story !== undefined) {
    const parsed = parseStory(r.story);
    story = parsed.value;
    warnings.push(...parsed.errors.map((e) => `story: ${e}`));
  }

  return {
    value: {
      level,
      stats,
      skills,
      equipped,
      magatama,
      labyrinthComplete: r.labyrinthComplete === true,
      build: parseBuild(r.build, warnings),
      story,
    },
    errors: warnings,
  };
}

/** New game from data/new-game.json and data/story.json; the story starts with nothing done. */
export function createNewGameState(
  seedJson: unknown,
  storyJson: unknown,
  data: GameData,
): Parsed<PlayerState> {
  const story = parseStory(storyJson);
  const fresh: StoryState = {
    milestones: story.value.milestones.map((m) => ({ ...m, done: false })),
    saveSlots: [],
    endingsSeen: [],
  };
  const seed = isRecord(seedJson) ? { ...seedJson, story: undefined } : seedJson;
  const state = normalizeState(seed, data, fresh);
  return {
    value: state.value,
    errors: [
      ...story.errors.map((e) => `data/story.json: ${e}`),
      ...state.errors.map((e) => `data/new-game.json: ${e}`),
    ],
  };
}

export function createSaveFile(state: PlayerState, now: Date, previous?: SaveFile): SaveFile {
  return {
    app: 'nocturne-tracker',
    schemaVersion: SCHEMA_VERSION,
    savedAt: now.toISOString(),
    state,
    undo: previous?.undo ?? [],
    confirmedAssumptions: previous?.confirmedAssumptions ?? [],
  };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save, null, 2);
}

export type ParseResult =
  | { ok: true; save: SaveFile; warnings: string[] }
  | { ok: false; error: string };

/** Reads an export (or a bare PlayerState file). Never guesses at a newer format. */
export function parseSaveText(
  text: string,
  data: GameData,
  fallbackStory: StoryState,
  now: Date,
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!isRecord(json)) return { ok: false, error: 'This file does not contain a save.' };

  const isSaveFile = json.app === 'nocturne-tracker' || 'state' in json;
  if (!isSaveFile) {
    const state = normalizeState(json, data, fallbackStory);
    return { ok: true, save: createSaveFile(state.value, now), warnings: state.errors };
  }
  if (typeof json.schemaVersion === 'number' && json.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This save was made by a newer version of the tracker (format ${json.schemaVersion}).`,
    };
  }
  const state = normalizeState(json.state, data, fallbackStory);
  const warnings = [...state.errors];
  const undo: PlayerState[] = [];
  if (Array.isArray(json.undo)) {
    for (const snapshot of json.undo) {
      if (!isRecord(snapshot)) {
        warnings.push('an unreadable undo snapshot was dropped');
        continue;
      }
      undo.push(normalizeState(snapshot, data, fallbackStory).value);
    }
  }
  const savedAt =
    typeof json.savedAt === 'string' && !Number.isNaN(Date.parse(json.savedAt))
      ? json.savedAt
      : now.toISOString();
  return {
    ok: true,
    save: {
      app: 'nocturne-tracker',
      schemaVersion: SCHEMA_VERSION,
      savedAt,
      state: state.value,
      undo: undo.slice(-UNDO_LIMIT),
      confirmedAssumptions: Array.isArray(json.confirmedAssumptions)
        ? [...new Set(json.confirmedAssumptions.filter((a): a is string => typeof a === 'string'))]
        : [],
    },
    warnings,
  };
}

export function exportFileName(save: SaveFile): string {
  const d = new Date(save.savedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `nocturne-tracker-${stamp}-lv${save.state.level}.json`;
}

export type LoadResult = {
  save: SaveFile;
  status: 'loaded' | 'new' | 'recovered';
  warnings: string[];
  recoveryKey?: string;
};

export function loadSave(
  storage: StorageLike,
  data: GameData,
  fallbackStory: StoryState,
  createNew: () => SaveFile,
  now: Date,
): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      save: createNew(),
      status: 'new',
      warnings: ['Browser storage is unavailable, so changes will not be kept. Use Export JSON.'],
    };
  }
  if (text === null) return { save: createNew(), status: 'new', warnings: [] };
  const parsed = parseSaveText(text, data, fallbackStory, now);
  if (parsed.ok) return { save: parsed.save, status: 'loaded', warnings: parsed.warnings };

  // Keep the unreadable text before anything can overwrite the main key.
  const recoveryKey = RECOVERY_PREFIX + now.toISOString();
  const warnings = [`The stored save could not be read (${parsed.error}).`];
  try {
    storage.setItem(recoveryKey, text);
  } catch {
    warnings.push(
      'It could not be copied aside either; download it from Settings before changing anything.',
    );
  }
  return { save: createNew(), status: 'recovered', warnings, recoveryKey };
}

export function writeSave(
  storage: StorageLike,
  save: SaveFile,
): { ok: true } | { ok: false; error: string } {
  try {
    storage.setItem(STORAGE_KEY, serializeSave(save));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Copies the stored save aside before an import or reset replaces it. */
export function backupCurrent(storage: StorageLike): void {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text !== null) storage.setItem(BACKUP_KEY, text);
  } catch {
    // Nothing more can be done without storage; the caller still has Export JSON.
  }
}

export function recordLevelUp(save: SaveFile, after: PlayerState, now: Date): SaveFile {
  return {
    ...save,
    savedAt: now.toISOString(),
    state: after,
    undo: [...save.undo, save.state].slice(-UNDO_LIMIT),
  };
}

export function undoLastLevelUp(save: SaveFile, now: Date): SaveFile | null {
  const previous = save.undo.at(-1);
  if (!previous) return null;
  return { ...save, savedAt: now.toISOString(), state: previous, undo: save.undo.slice(0, -1) };
}

export function replaceState(save: SaveFile, state: PlayerState, now: Date): SaveFile {
  return { ...save, savedAt: now.toISOString(), state };
}

export function isAssumptionVerified(id: string, save: SaveFile, rules: Rules): boolean {
  return (
    save.confirmedAssumptions.includes(id) ||
    rules.assumptions.some((a) => a.id === id && a.verified)
  );
}

export function setAssumptionConfirmed(
  save: SaveFile,
  id: string,
  confirmed: boolean,
  now: Date,
): SaveFile {
  const rest = save.confirmedAssumptions.filter((a) => a !== id);
  return {
    ...save,
    savedAt: now.toISOString(),
    confirmedAssumptions: confirmed ? [...rest, id] : rest,
  };
}

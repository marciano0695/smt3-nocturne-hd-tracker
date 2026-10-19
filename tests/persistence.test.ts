import { describe, expect, it } from 'vite-plus/test';
import newGameJson from '../data/new-game.json';
import storyJson from '../data/story.json';
import {
  BACKUP_KEY,
  RECOVERY_PREFIX,
  STORAGE_KEY,
  UNDO_LIMIT,
  backupCurrent,
  createNewGameState,
  createSaveFile,
  exportFileName,
  isAssumptionVerified,
  loadSave,
  normalizeState,
  parseSaveText,
  parseStory,
  recordLevelUp,
  serializeSave,
  setAssumptionConfirmed,
  undoLastLevelUp,
  writeSave,
  type StorageLike,
} from '../src/game/persistence';
import { recordHardSave, setMilestoneDone } from '../src/game/story';
import type { PlayerState, SaveFile } from '../src/game/types';
import fixtureJson from './fixtures/save-level22.json';
import { fixture22, gameData } from './helpers';

const NOW = new Date('2026-10-15T13:42:00Z');
const seedStory = () => parseStory(storyJson).value;

class MemoryStorage implements StorageLike {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

function richSave(): SaveFile {
  let state: PlayerState = { ...fixture22(), story: seedStory() };
  state = setMilestoneDone(state, 'kalpa-5', true);
  state = recordHardSave(state, 'hs1', 3);
  state = setMilestoneDone(state, 'ending-true-demon', true);
  state.story.saveSlots.push({ slot: 1, label: 'Main save', locked: false });
  state.story.milestones.push({
    id: 'errand',
    title: 'Errand',
    kind: 'side',
    recommendedLevel: 0,
    recommendedLevelHard: 4,
    notes: '',
    available: true,
    done: false,
    verified: true,
    requires: [],
  });
  state.magatama.Kamudo = {
    nextIndex: 2,
    history: [{ skill: 'Focus', level: 23, result: 'learned', replaced: 'Ice Breath' }],
  };
  state.equipped = 'Kamudo';
  state.difficulty = 'hard';
  state.demons = [{ id: 'demon-1', name: 'Pixie', level: 7, skillsDone: true }];
  state.build.wishlist = ['Media'];
  state.build.statGuide = {
    id: 'g',
    name: 'Guide',
    source: 'test',
    start: { STR: 2, MAG: 2, VIT: 2, AGI: 2, LUC: 2 },
    phases: [
      { untilLevel: 30, pattern: ['STR', 'VIT'] },
      { untilLevel: null, pattern: ['STR'] },
    ],
  };
  const save = createSaveFile(state, NOW);
  return {
    ...save,
    undo: [fixture22(), { ...fixture22(), level: 21 }],
    confirmedAssumptions: ['stat-cap'],
  };
}

describe('export and import', () => {
  it('round-trips the full state', () => {
    const save = richSave();
    const parsed = parseSaveText(serializeSave(save), gameData, seedStory(), NOW);
    expect(parsed).toEqual({ ok: true, save, warnings: [] });
  });

  it('imports the bare level 22 fixture with the fallback story', () => {
    const parsed = parseSaveText(JSON.stringify(fixtureJson), gameData, seedStory(), NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.state.level).toBe(22);
    expect(parsed.save.state.skills).toEqual(fixtureJson.skills);
    expect(parsed.save.state.story).toEqual(seedStory());
    expect(parsed.warnings).toEqual([]);
  });

  it('treats a missing or unknown difficulty as Normal', () => {
    expect(normalizeState(fixtureJson, gameData, seedStory()).value.difficulty).toBeUndefined();
    const odd = normalizeState({ ...fixtureJson, difficulty: 'lunatic' }, gameData, seedStory());
    expect(odd.value.difficulty).toBeUndefined();
    expect(odd.errors).toContain('difficulty "lunatic" is unknown and was set to Normal');
  });

  it('keeps a save without demons valid and drops malformed demons', () => {
    expect(normalizeState(fixtureJson, gameData, seedStory()).value.demons).toBeUndefined();
    const odd = normalizeState(
      {
        ...fixtureJson,
        demons: [
          { id: 'a', name: 'Pixie', level: 120, skillsDone: true },
          { id: 'a', name: 'Inugami', level: 12 },
          { level: 3 },
        ],
      },
      gameData,
      seedStory(),
    );
    expect(odd.value.demons).toEqual([
      { id: 'a', name: 'Pixie', level: 99, skillsDone: true },
      { id: 'a-2', name: 'Inugami', level: 12, skillsDone: false },
    ]);
    expect(odd.errors).toEqual([
      'Pixie: level 120 was changed to 99',
      'a demon with no name was dropped',
    ]);
  });

  it('rejects invalid JSON, non-objects and newer formats', () => {
    expect(parseSaveText('{nope', gameData, seedStory(), NOW).ok).toBe(false);
    expect(parseSaveText('[1,2]', gameData, seedStory(), NOW).ok).toBe(false);
    const newer = JSON.stringify({ ...richSave(), schemaVersion: 2 });
    expect(parseSaveText(newer, gameData, seedStory(), NOW)).toMatchObject({ ok: false });
  });

  it('caps undo snapshots, keeping the newest', () => {
    const save = {
      ...richSave(),
      undo: Array.from({ length: 40 }, (_, i) => ({ ...fixture22(), level: i + 1 })),
    };
    const parsed = parseSaveText(serializeSave(save), gameData, seedStory(), NOW);
    expect(parsed.ok && parsed.save.undo.map((s) => s.level)).toEqual(
      Array.from({ length: UNDO_LIMIT }, (_, i) => i + 11),
    );
  });

  it('names export files after the save time and level', () => {
    const name = exportFileName(richSave());
    expect(name).toMatch(/^nocturne-tracker-2026-10-15-\d{4}-lv22\.json$/);
  });
});

describe('new game', () => {
  it('starts at level 1 with no skills, Marogareh and nothing done', () => {
    const { value, errors } = createNewGameState(newGameJson, storyJson, gameData);
    expect(errors).toEqual([]);
    expect(value.level).toBe(1);
    expect(value.skills).toEqual([]);
    expect(value.magatama).toEqual({ Marogareh: { nextIndex: 0, history: [] } });
    expect(value.equipped).toBe('Marogareh');
    expect(value.story.milestones).toHaveLength(storyJson.milestones.length);
    expect(value.story.milestones.every((m) => !m.done)).toBe(true);
    expect(value.story.saveSlots).toEqual([]);
  });
});

describe('normalizeState', () => {
  it('fixes bad input and reports every fix, without throwing', () => {
    const { value, errors } = normalizeState(
      {
        level: 150,
        stats: { STR: 'x', MAG: 2, VIT: 3, AGI: -1 },
        skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'A', 7],
        equipped: 5,
        magatama: {
          Kamudo: { nextIndex: 40 },
          Kamudoo: { nextIndex: 1, history: [{ bad: true }] },
        },
        build: { target: 'Focus', statPattern: ['STR', 'POW'], statTargets: { STR: 40, XYZ: 1 } },
      },
      gameData,
      seedStory(),
    );
    expect(value.level).toBe(99);
    expect(value.stats).toEqual({ STR: 0, MAG: 2, VIT: 3, AGI: 0, LUC: 0 });
    expect(value.skills).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(value.equipped).toBeNull();
    expect(value.magatama).toEqual({
      Kamudo: { nextIndex: 4, history: [] },
      Kamudoo: { nextIndex: 1, history: [] },
    });
    expect(value.build).toEqual({
      target: [],
      interimKeep: [],
      wishlist: [],
      statPattern: ['STR'],
      statTargets: { STR: 40 },
    });
    expect(errors.some((e) => e.includes('Kamudoo'))).toBe(true);
    expect(errors.length).toBeGreaterThan(8);
  });

  it('drops an unreadable stat guide with a warning', () => {
    const { value, errors } = normalizeState(
      {
        ...fixtureJson,
        build: { ...fixtureJson.build, statGuide: { id: 'x', name: 'x', phases: [] } },
      },
      gameData,
      seedStory(),
    );
    expect(value.build.statGuide).toBeUndefined();
    expect(errors.some((e) => e.includes('stat guide'))).toBe(true);
  });

  it('never throws on hostile input', () => {
    for (const raw of [null, 42, 'save', [], { story: 'x' }, { magatama: [1] }, { stats: null }]) {
      expect(() => normalizeState(raw, gameData, seedStory())).not.toThrow();
    }
  });
});

describe('storage', () => {
  const fresh = () => createSaveFile({ ...fixture22(), level: 1 }, NOW);

  it('creates a new save when nothing is stored', () => {
    const result = loadSave(new MemoryStorage(), gameData, seedStory(), fresh, NOW);
    expect(result.status).toBe('new');
  });

  it('loads what was written', () => {
    const storage = new MemoryStorage();
    expect(writeSave(storage, richSave())).toEqual({ ok: true });
    const result = loadSave(storage, gameData, seedStory(), fresh, NOW);
    expect(result).toMatchObject({ status: 'loaded', warnings: [] });
    expect(result.save).toEqual(richSave());
  });

  it('copies an unreadable save aside before starting over', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{broken');
    const result = loadSave(storage, gameData, seedStory(), fresh, NOW);
    expect(result.status).toBe('recovered');
    expect(result.recoveryKey).toBe(RECOVERY_PREFIX + NOW.toISOString());
    expect(storage.getItem(result.recoveryKey!)).toBe('{broken');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
  });

  it('survives storage that throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(loadSave(broken, gameData, seedStory(), fresh, NOW)).toMatchObject({ status: 'new' });
    expect(writeSave(broken, richSave())).toEqual({ ok: false, error: 'QuotaExceededError' });
    expect(() => backupCurrent(broken)).not.toThrow();
  });

  it('backs up the stored save', () => {
    const storage = new MemoryStorage();
    writeSave(storage, richSave());
    backupCurrent(storage);
    expect(storage.getItem(BACKUP_KEY)).toBe(storage.getItem(STORAGE_KEY));
  });
});

describe('undo and assumptions', () => {
  it('undoes level-ups newest first and caps the stack', () => {
    let save = createSaveFile(fixture22(), NOW);
    for (let level = 23; level < 23 + UNDO_LIMIT + 5; level++) {
      save = recordLevelUp(save, { ...save.state, level }, NOW);
    }
    expect(save.undo).toHaveLength(UNDO_LIMIT);
    const undone = undoLastLevelUp(save, NOW)!;
    expect(undone.state.level).toBe(save.state.level - 1);
    expect(undoLastLevelUp(createSaveFile(fixture22(), NOW), NOW)).toBeNull();
  });

  it('tracks assumptions confirmed by the player', () => {
    const save = createSaveFile(fixture22(), NOW);
    // Own rules, so the test doesn't depend on what the player has verified in rules.json.
    const rules = {
      ...gameData.rules,
      assumptions: [{ id: 'stat-cap', text: 'Cap 40.', verified: false }],
    };
    expect(isAssumptionVerified('stat-cap', save, rules)).toBe(false);
    const confirmed = setAssumptionConfirmed(save, 'stat-cap', true, NOW);
    expect(isAssumptionVerified('stat-cap', confirmed, rules)).toBe(true);
    expect(setAssumptionConfirmed(confirmed, 'stat-cap', false, NOW).confirmedAssumptions).toEqual(
      [],
    );
  });
});

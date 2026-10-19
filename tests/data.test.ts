import { describe, expect, it } from 'vite-plus/test';
import levelingJson from '../data/leveling.json';
import magatamaJson from '../data/magatama.json';
import rulesJson from '../data/rules.json';
import storyJson from '../data/story.json';
import {
  canLearnAt,
  createGameData,
  findSkill,
  parseLevelingFile,
  parseMagatamaFile,
  parseRules,
} from '../src/game/data';
import { chooseReplacementSlot, replacementOrder } from '../src/game/priority';

const magatama = parseMagatamaFile(magatamaJson);
const rules = parseRules(rulesJson);
const data = createGameData(magatama.value, rules.value);

describe('data files', () => {
  it('parse without errors', () => {
    expect(magatama.errors).toEqual([]);
    expect(rules.errors).toEqual([]);
    expect(data.magatama.length).toBe(25);
  });

  it('teach every skill from exactly one Magatama', () => {
    const shared = [...data.skillSources].filter(([, sources]) => sources.length > 1);
    expect(shared.map(([name]) => name)).toEqual([]);
  });

  it('gate Pierce behind the Labyrinth and leave Masakados unrestricted', () => {
    const pierce = findSkill(data, 'Pierce');
    expect(pierce?.magatama).toBe('Marogareh');
    expect(canLearnAt(pierce!.skill, 99, false)).toBe(false);
    expect(canLearnAt(pierce!.skill, 2, true)).toBe(true);
    for (const skill of data.magatamaByName.get('Masakados')!.skills) {
      expect(canLearnAt(skill, 2, false)).toBe(true);
    }
  });

  it('reads where to get each Magatama and its alignment', () => {
    expect(data.magatama.every((m) => m.obtain && m.alignment)).toBe(true);
    expect(data.magatamaByName.get('Djed')).toMatchObject({ alignment: 'dark' });
    const bad = parseMagatamaFile({ magatama: [{ name: 'X', alignment: 'evil', skills: [] }] });
    expect(bad.value).toEqual([{ name: 'X', skills: [] }]);
    expect(bad.errors).toHaveLength(1);
  });

  it('rewards only Magatama that exist, in story.json side quests', () => {
    const rewards = storyJson.milestones.flatMap((m) =>
      'magatama' in m && typeof m.magatama === 'string' ? [m.magatama] : [],
    );
    expect(rewards.length).toBeGreaterThan(0);
    expect(rewards.filter((name) => !data.magatamaByName.has(name))).toEqual([]);
  });

  it('links every Magatama but the starting one to real story milestones', () => {
    const ids = new Set(storyJson.milestones.map((m) => m.id));
    const unlinked = data.magatama.filter((m) => !m.milestones).map((m) => m.name);
    expect(unlinked).toEqual(['Marogareh']);
    const broken = data.magatama.flatMap((m) => (m.milestones ?? []).filter((id) => !ids.has(id)));
    expect(broken).toEqual([]);
    expect(data.magatamaByName.get('Ankh')?.milestones).toEqual([
      'story-shibuya-amala-network',
      'story-ginza',
    ]);
  });

  it('links each story.json reward back to the milestone that gives it', () => {
    const mismatched = storyJson.milestones.flatMap((m) =>
      'magatama' in m &&
      typeof m.magatama === 'string' &&
      !data.magatamaByName.get(m.magatama)?.milestones?.includes(m.id)
        ? [m.magatama]
        : [],
    );
    expect(mismatched).toEqual([]);
  });

  it('reports a bad Magatama milestone link instead of throwing', () => {
    const bad = parseMagatamaFile({ magatama: [{ name: 'X', milestone: 3, skills: [] }] });
    expect(bad.value).toEqual([{ name: 'X', skills: [] }]);
    expect(bad.errors).toHaveLength(1);
  });

  it('reads the leveling guide, opening each spot with a real story milestone', () => {
    const leveling = parseLevelingFile(levelingJson);
    expect(leveling.errors).toEqual([]);
    expect(leveling.value.spots.length).toBe(8);
    const ids = new Set(storyJson.milestones.map((m) => m.id));
    const openers = leveling.value.spots.flatMap((s) => (s.unlockedBy ? [s.unlockedBy] : []));
    expect(openers.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('reports bad leveling entries instead of throwing', () => {
    const parsed = parseLevelingFile({
      tiers: [{ id: 'early', title: 'Early', min: 15, max: 30 }, { id: 'x' }],
      spots: [{ id: 'a', name: 'A', tier: 'nope' }, {}, { id: 'b', name: 'B', tier: 'early' }],
      tips: [{ title: 'T' }],
    });
    expect(parsed.value.spots.map((s) => s.id)).toEqual(['b']);
    expect(parsed.errors).toHaveLength(4);
    expect(parseLevelingFile(null).errors).toEqual(['leveling.json has no "tiers" list']);
  });

  it('reports bad entries instead of throwing', () => {
    const parsed = parseMagatamaFile({ magatama: [{ name: 'X', skills: [{ level: 3 }] }, {}] });
    expect(parsed.value).toEqual([{ name: 'X', skills: [] }]);
    expect(parsed.errors.length).toBe(2);
  });
});

describe('replacement priority', () => {
  const build = {
    target: ['Focus'],
    interimKeep: ['Heat Wave', 'Lunge', 'Analyze'],
    wishlist: ['Media'],
    statPattern: [],
    statTargets: {},
  };

  it('replaces other skills first, then wishlist, then interimKeep from the end, never targets', () => {
    const skills = ['Focus', 'Lunge', 'Media', 'Analyze', 'Ice Breath', 'Heat Wave'];
    expect(replacementOrder(skills, build)).toEqual([4, 2, 3, 1, 5]);
    expect(chooseReplacementSlot(skills, build)).toBe(4);
    expect(chooseReplacementSlot(['Focus'], build)).toBeNull();
  });
});

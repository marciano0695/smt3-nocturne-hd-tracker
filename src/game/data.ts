import {
  STATS,
  type Assumption,
  type GameData,
  type MagatamaData,
  type Offer,
  type PlayerState,
  type Rules,
  type SkillData,
  type SkillSource,
  type Stat,
  type StatGuide,
  type StatGuidePhase,
} from './types';

export const UNLOCK_LABELS: Record<string, string> = {
  labyrinth_complete: 'Labyrinth complete',
};

export const DEFAULT_RULES: Rules = {
  maxLevel: 99,
  maxSkills: 8,
  statCap: 40,
  statPointsPerLevel: 1,
  assumptions: [],
};

export interface Parsed<T> {
  value: T;
  /** Problems found in the player-edited file; bad entries are skipped, not fatal. */
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSkill(raw: unknown, where: string, errors: string[]): SkillData | null {
  if (!isRecord(raw)) {
    errors.push(`${where} is not an object`);
    return null;
  }
  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    errors.push(`${where} has no name`);
    return null;
  }
  const level = raw.level ?? null;
  if (level !== null && (typeof level !== 'number' || !Number.isInteger(level))) {
    errors.push(`${where} (${raw.name}) has a level that is not a whole number or null`);
    return null;
  }
  const skill: SkillData = {
    name: raw.name.trim(),
    level,
    cost: typeof raw.cost === 'string' ? raw.cost : '',
    type: typeof raw.type === 'string' ? raw.type : '',
    effect: typeof raw.effect === 'string' ? raw.effect : '',
  };
  if (typeof raw.unlock === 'string' && raw.unlock !== '') skill.unlock = raw.unlock;
  return skill;
}

/** Validates data/magatama.json. Accepts the file object or its `magatama` array. */
export function parseMagatamaFile(json: unknown): Parsed<MagatamaData[]> {
  const errors: string[] = [];
  const list = isRecord(json) ? json.magatama : json;
  if (!Array.isArray(list)) {
    return { value: [], errors: ['magatama.json has no "magatama" list'] };
  }
  const seen = new Set<string>();
  const value: MagatamaData[] = [];
  list.forEach((raw, i) => {
    const where = `magatama[${i}]`;
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name.trim() === '') {
      errors.push(`${where} has no name`);
      return;
    }
    const name = raw.name.trim();
    if (seen.has(name)) {
      errors.push(`${where}: Magatama "${name}" is listed twice; the second entry is ignored`);
      return;
    }
    seen.add(name);
    const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
    if (!Array.isArray(raw.skills)) errors.push(`${where} (${name}) has no "skills" list`);
    const skills: SkillData[] = [];
    rawSkills.forEach((s, j) => {
      const skill = parseSkill(s, `${name} skill ${j + 1}`, errors);
      if (skill) skills.push(skill);
    });
    const magatama: MagatamaData = { name, skills };
    if (raw.alignment === 'light' || raw.alignment === 'neutral' || raw.alignment === 'dark') {
      magatama.alignment = raw.alignment;
    } else if (raw.alignment !== undefined) {
      errors.push(`${name}: alignment must be "light", "neutral" or "dark"`);
    }
    if (typeof raw.obtain === 'string' && raw.obtain.trim() !== '')
      magatama.obtain = raw.obtain.trim();
    value.push(magatama);
  });
  return { value, errors };
}

/** Validates one stat guide; returns null (with an error) when it can't be used. */
export function parseStatGuide(raw: unknown, where: string, errors: string[]): StatGuide | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    errors.push(`${where} has no id or name`);
    return null;
  }
  const start = {} as Record<Stat, number>;
  const rawStart = isRecord(raw.start) ? raw.start : {};
  for (const stat of STATS) {
    const v = rawStart[stat];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      errors.push(`${where} (${raw.name}): start.${stat} must be a whole number`);
      return null;
    }
    start[stat] = v;
  }
  const phases: StatGuidePhase[] = [];
  for (const p of Array.isArray(raw.phases) ? raw.phases : []) {
    const untilLevel = isRecord(p) ? p.untilLevel : undefined;
    const pattern = isRecord(p) && Array.isArray(p.pattern) ? p.pattern : null;
    const validUntil =
      untilLevel === null ||
      (typeof untilLevel === 'number' && Number.isInteger(untilLevel) && untilLevel > 0);
    if (
      !validUntil ||
      !pattern ||
      pattern.length === 0 ||
      !pattern.every((s) => STATS.includes(s as Stat))
    ) {
      errors.push(
        `${where} (${raw.name}): a phase needs untilLevel (a level or null) and a pattern of stats`,
      );
      return null;
    }
    phases.push({ untilLevel: untilLevel as number | null, pattern: pattern as Stat[] });
  }
  if (phases.length === 0) {
    errors.push(`${where} (${raw.name}) has no phases`);
    return null;
  }
  const guide: StatGuide = { id: raw.id, name: raw.name, start, phases };
  if (typeof raw.source === 'string') guide.source = raw.source;
  return guide;
}

/** Validates data/stat-guides.json. */
export function parseStatGuidesFile(json: unknown): Parsed<StatGuide[]> {
  const errors: string[] = [];
  const list = isRecord(json) && Array.isArray(json.guides) ? json.guides : [];
  if (list.length === 0) errors.push('stat-guides.json has no "guides" list');
  const value = list
    .map((g, i) => parseStatGuide(g, `guides[${i}]`, errors))
    .filter((g): g is StatGuide => g !== null);
  return { value, errors };
}

/** Validates data/rules.json, falling back to defaults for missing or bad fields. */
export function parseRules(json: unknown): Parsed<Rules> {
  const errors: string[] = [];
  if (!isRecord(json))
    return { value: { ...DEFAULT_RULES }, errors: ['rules.json is not an object'] };
  const positiveInt = (
    key: 'maxLevel' | 'maxSkills' | 'statCap' | 'statPointsPerLevel',
  ): number => {
    const v = json[key];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
    if (v !== undefined) errors.push(`rules.json: "${key}" must be a positive whole number`);
    return DEFAULT_RULES[key];
  };
  const assumptions: Assumption[] = [];
  if (Array.isArray(json.assumptions)) {
    for (const a of json.assumptions) {
      if (isRecord(a) && typeof a.id === 'string' && typeof a.text === 'string') {
        assumptions.push({ id: a.id, text: a.text, verified: a.verified === true });
      } else {
        errors.push('rules.json: an assumption is missing "id" or "text"');
      }
    }
  }
  return {
    value: {
      maxLevel: positiveInt('maxLevel'),
      maxSkills: positiveInt('maxSkills'),
      statCap: positiveInt('statCap'),
      statPointsPerLevel: positiveInt('statPointsPerLevel'),
      assumptions,
    },
    errors,
  };
}

export function createGameData(magatama: MagatamaData[], rules: Rules = DEFAULT_RULES): GameData {
  const magatamaByName = new Map<string, MagatamaData>();
  const skillSources = new Map<string, SkillSource[]>();
  const dataOrder = new Map<string, number>();
  magatama.forEach((m, i) => {
    magatamaByName.set(m.name, m);
    dataOrder.set(m.name, i);
    m.skills.forEach((skill, index) => {
      const sources = skillSources.get(skill.name) ?? [];
      sources.push({ magatama: m.name, index, skill });
      skillSources.set(skill.name, sources);
    });
  });
  return { magatama, rules, magatamaByName, skillSources, dataOrder };
}

/** First Magatama that teaches the skill, or null if the skill is not in the data. */
export function findSkill(data: GameData, name: string): SkillSource | null {
  return data.skillSources.get(name)?.[0] ?? null;
}

export function skillAt(data: GameData, magatama: string, index: number): SkillData | null {
  return data.magatamaByName.get(magatama)?.skills[index] ?? null;
}

/** Level requirement as a number; skills with `level: null` have none. */
export function levelRequirement(skill: SkillData): number {
  return skill.level ?? 0;
}

// Unknown unlock conditions count as unmet so a typo never schedules a skill too early.
export function isUnlocked(skill: SkillData, labyrinthComplete: boolean): boolean {
  if (skill.unlock === undefined) return true;
  if (skill.unlock === 'labyrinth_complete') return labyrinthComplete;
  return false;
}

/** Whether a level-up that reaches `level` can teach this skill. */
export function canLearnAt(skill: SkillData, level: number, labyrinthComplete: boolean): boolean {
  return levelRequirement(skill) <= level && isUnlocked(skill, labyrinthComplete);
}

/** The owned Magatama's next pending skill, whether or not its requirement is met yet. */
export function nextPending(state: PlayerState, data: GameData, magatama: string): Offer | null {
  const progress = state.magatama[magatama];
  if (!progress) return null;
  const skill = skillAt(data, magatama, progress.nextIndex);
  return skill ? { magatama, index: progress.nextIndex, skill } : null;
}

/** Magatama the player owns, in data order (unknown names last, alphabetically). */
export function ownedInDataOrder(state: PlayerState, data: GameData): string[] {
  const rank = (name: string) => data.dataOrder.get(name) ?? Number.MAX_SAFE_INTEGER;
  return Object.keys(state.magatama).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function unlockLabel(unlock: string): string {
  return UNLOCK_LABELS[unlock] ?? unlock;
}

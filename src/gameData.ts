import levelingJson from '../data/leveling.json';
import magatamaJson from '../data/magatama.json';
import newGameJson from '../data/new-game.json';
import rulesJson from '../data/rules.json';
import statGuidesJson from '../data/stat-guides.json';
import storyJson from '../data/story.json';
import {
  createGameData,
  parseLevelingFile,
  parseMagatamaFile,
  parseRules,
  parseStatGuidesFile,
} from './game/data';

const magatama = parseMagatamaFile(magatamaJson);
const rules = parseRules(rulesJson);
const guides = parseStatGuidesFile(statGuidesJson);
const leveling = parseLevelingFile(levelingJson);

/** Recommended stat curves from data/stat-guides.json. */
export const statGuides = guides.value;

/** Where to grind EXP, from data/leveling.json. */
export const levelingGuide = leveling.value;

/** Game data loaded from data/*.json, validated and indexed. */
export const gameData = createGameData(magatama.value, rules.value);

/** Problems in the player-edited JSON files, shown in the UI instead of crashing. */
export const dataErrors: string[] = [
  ...magatama.errors.map((e) => `data/magatama.json: ${e}`),
  ...rules.errors.map((e) => `data/rules.json: ${e}`),
  ...guides.errors.map((e) => `data/stat-guides.json: ${e}`),
  ...leveling.errors.map((e) => `data/leveling.json: ${e}`),
];

// Seeds are validated by the persistence module when a new game is created.
export const newGameSeed: unknown = newGameJson;
export const storySeed: unknown = storyJson;

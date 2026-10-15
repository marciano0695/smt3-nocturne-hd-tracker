import magatamaJson from '../data/magatama.json';
import newGameJson from '../data/new-game.json';
import rulesJson from '../data/rules.json';
import statGuidesJson from '../data/stat-guides.json';
import storyJson from '../data/story.json';
import { createGameData, parseMagatamaFile, parseRules, parseStatGuidesFile } from './game/data';

const magatama = parseMagatamaFile(magatamaJson);
const rules = parseRules(rulesJson);
const guides = parseStatGuidesFile(statGuidesJson);

/** Recommended stat curves from data/stat-guides.json. */
export const statGuides = guides.value;

/** Game data loaded from data/*.json, validated and indexed. */
export const gameData = createGameData(magatama.value, rules.value);

/** Problems in the player-edited JSON files, shown in the UI instead of crashing. */
export const dataErrors: string[] = [
  ...magatama.errors.map((e) => `data/magatama.json: ${e}`),
  ...rules.errors.map((e) => `data/rules.json: ${e}`),
  ...guides.errors.map((e) => `data/stat-guides.json: ${e}`),
];

// Seeds are validated by the persistence module when a new game is created.
export const newGameSeed: unknown = newGameJson;
export const storySeed: unknown = storyJson;

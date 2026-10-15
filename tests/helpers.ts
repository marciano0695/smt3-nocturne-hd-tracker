import magatamaJson from '../data/magatama.json';
import newGameJson from '../data/new-game.json';
import rulesJson from '../data/rules.json';
import { createGameData, parseMagatamaFile, parseRules } from '../src/game/data';
import type { GameData, PlayerState, StoryState } from '../src/game/types';
import fixture22Json from './fixtures/save-level22.json';

/** Game data from the real data/*.json files. */
export const gameData: GameData = createGameData(
  parseMagatamaFile(magatamaJson).value,
  parseRules(rulesJson).value,
);

export function emptyStory(): StoryState {
  return { milestones: [], saveSlots: [], endingsSeen: [] };
}

// Fresh deep copies so a test can mutate its state without leaking into others.

/** The player's level 22 save (tests only), with an empty story checklist. */
export function fixture22(): PlayerState {
  return { ...structuredClone(fixture22Json), story: emptyStory() } as PlayerState;
}

/** The new-game seed from data/new-game.json, with an empty story checklist. */
export function newGameSeed(): PlayerState {
  const seed = structuredClone(newGameJson);
  return {
    level: seed.level,
    stats: seed.stats,
    skills: seed.skills,
    equipped: seed.equipped,
    magatama: seed.magatama,
    labyrinthComplete: seed.labyrinthComplete,
    build: seed.build,
    story: emptyStory(),
  } as PlayerState;
}

import { describe, expect, it } from 'vite-plus/test';
import levelingJson from '../data/leveling.json';
import storyJson from '../data/story.json';
import { parseLevelingFile } from '../src/game/data';
import { currentTiers, readySpots, spotStatus } from '../src/game/leveling';
import { setMilestoneDone } from '../src/game/story';
import type { GrindSpot, LevelingGuide, PlayerState, StoryState } from '../src/game/types';
import { fixture22, newGameSeed } from './helpers';

const guide = parseLevelingFile(levelingJson).value;

function fullStory(): StoryState {
  const { milestones, saveSlots, endingsSeen } = structuredClone(storyJson);
  return { milestones, saveSlots, endingsSeen } as StoryState;
}

const spot = (id: string) => guide.spots.find((s) => s.id === id)!;
const atLevel = (state: PlayerState, level: number): PlayerState => ({ ...state, level });

// A one-tier guide with a single spot, so the level boundaries don't depend on the data file.
const tiny: LevelingGuide = {
  source: '',
  tiers: [{ id: 'mid', title: 'Mid', min: 35, max: 60 }],
  spots: [],
  tips: [],
};
const free: GrindSpot = {
  id: 'x',
  name: 'X',
  tier: 'mid',
  anyLevel: false,
  unlockedBy: null,
  enemies: [],
  tips: [],
  dlc: false,
};

describe('grinding spot status', () => {
  it('is under-leveled more than 3 levels below the tier, out-leveled more than 6 above', () => {
    const state = newGameSeed();
    expect(spotStatus(free, tiny, atLevel(state, 31))).toBe('under');
    expect(spotStatus(free, tiny, atLevel(state, 32))).toBe('ready');
    expect(spotStatus(free, tiny, atLevel(state, 66))).toBe('ready');
    expect(spotStatus(free, tiny, atLevel(state, 67))).toBe('past');
  });

  it('never marks an any-level spot as under- or out-leveled', () => {
    const anyLevel = { ...free, anyLevel: true };
    expect(spotStatus(anyLevel, tiny, atLevel(newGameSeed(), 1))).toBe('ready');
    expect(spotStatus(anyLevel, tiny, atLevel(newGameSeed(), 99))).toBe('ready');
  });

  it('treats a missing opening milestone as reachable', () => {
    const state = atLevel(newGameSeed(), 40);
    expect(spotStatus({ ...free, unlockedBy: 'no-such-milestone' }, tiny, state)).toBe('ready');
  });

  it('locks every spot but Yoyogi Park on a new game', () => {
    const state = { ...newGameSeed(), story: fullStory() };
    const open = guide.spots.filter((s) => spotStatus(s, guide, state) !== 'locked');
    expect(open.map((s) => s.id)).toEqual(['yoyogi-park']);
  });

  it('opens the Radio Tower once Ginza is reached, and suits the level 22 save', () => {
    let state: PlayerState = { ...fixture22(), story: fullStory() };
    expect(spotStatus(spot('radio-tower'), guide, state)).toBe('locked');
    state = setMilestoneDone(state, 'story-shinjuku-medical-center', true);
    state = setMilestoneDone(state, 'story-shibuya-amala-network', true);
    expect(spotStatus(spot('radio-tower'), guide, state)).toBe('ready');
    expect(spotStatus(spot('kabukicho-prison'), guide, state)).toBe('locked');
    expect(readySpots(guide, state).map((s) => s.id)).toEqual([
      'radio-tower',
      'demifiend-birthplace',
    ]);
  });
});

describe('current tier', () => {
  it('picks every tier holding the level, or the nearest one', () => {
    expect(currentTiers(guide, 22).map((t) => t.id)).toEqual(['early']);
    expect(currentTiers(guide, 55).map((t) => t.id)).toEqual(['mid', 'late']);
    expect(currentTiers(guide, 1).map((t) => t.id)).toEqual(['early']);
    expect(currentTiers(guide, 33).map((t) => t.id)).toEqual(['mid']);
    expect(currentTiers(guide, 99).map((t) => t.id)).toEqual(['late']);
  });
});

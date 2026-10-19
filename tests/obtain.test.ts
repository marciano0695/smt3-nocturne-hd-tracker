import { describe, expect, it } from 'vite-plus/test';
import storyJson from '../data/story.json';
import { addMagatama, getsAt, obtainOrder } from '../src/game/obtain';
import { moveMilestone, setMilestoneAvailable } from '../src/game/story';
import type { PlayerState, StoryState } from '../src/game/types';
import { gameData, newGameSeed } from './helpers';

function fullStory(): StoryState {
  const { milestones, saveSlots, endingsSeen } = structuredClone(storyJson);
  return { milestones, saveSlots, endingsSeen } as StoryState;
}

const newGame = (): PlayerState => ({ ...newGameSeed(), story: fullStory() });
const names = (state: PlayerState) => obtainOrder(state, gameData).map((r) => r.name);
const row = (state: PlayerState, name: string) =>
  obtainOrder(state, gameData).find((r) => r.name === name)!;
const milestone = (state: PlayerState, id: string) =>
  state.story.milestones.find((m) => m.id === id)!;

describe('Magatama obtain order', () => {
  it('follows the story from a new game, starting with Marogareh and ending with Masakados', () => {
    const state = newGame();
    const order = names(state);
    expect(order).toHaveLength(25);
    expect(order.slice(0, 7)).toEqual([
      'Marogareh',
      'Wadatsumi',
      'Ankh',
      'Iyomante',
      'Shiranui',
      'Hifumi',
      'Kamudo',
    ]);
    expect(order.slice(-2)).toEqual(['Kailash', 'Masakados']);
    expect(row(state, 'Marogareh')).toMatchObject({ how: 'start', status: 'owned' });
    expect(row(state, 'Wadatsumi')).toMatchObject({ how: 'reward', status: 'now' });
    expect(row(state, 'Iyomante')).toMatchObject({ how: 'get', status: 'later' });
  });

  it('follows the player reordering their milestones', () => {
    let state = newGame();
    const ginza = state.story.milestones.findIndex((m) => m.id === 'story-ginza');
    state = moveMilestone(state, 'story-shibuya-amala-network', ginza);
    // Ankh is still listed first at Shibuya, which now comes after Ginza.
    expect(names(state).slice(1, 7)).toEqual([
      'Wadatsumi',
      'Hifumi',
      'Kamudo',
      'Ankh',
      'Iyomante',
      'Shiranui',
    ]);
  });

  it('marks a shop Magatama to get once its milestone opens, and owned once added', () => {
    let state = setMilestoneAvailable(newGame(), 'story-shibuya-amala-network', true);
    expect(row(state, 'Iyomante').status).toBe('now');
    state = addMagatama(state, 'Iyomante');
    expect(row(state, 'Iyomante').status).toBe('owned');
    expect(state.magatama.Iyomante).toEqual({ nextIndex: 0, history: [] });
  });

  it('opens Ankh at either Shibuya or Ginza', () => {
    expect(row(newGame(), 'Ankh').status).toBe('later');
    const shibuya = setMilestoneAvailable(newGame(), 'story-shibuya-amala-network', true);
    expect(row(shibuya, 'Ankh').status).toBe('now');
    const ginza = setMilestoneAvailable(newGame(), 'story-ginza', true);
    expect(row(ginza, 'Ankh').status).toBe('now');
  });

  it('keeps Masakados for later until every other Magatama is owned', () => {
    let state = setMilestoneAvailable(newGame(), 'side-bandou-shrine', true);
    for (const m of gameData.magatama) {
      if (m.name !== 'Masakados' && m.name !== 'Kailash') state = addMagatama(state, m.name);
    }
    expect(row(state, 'Masakados').status).toBe('later');
    state = addMagatama(state, 'Kailash');
    expect(row(state, 'Masakados').status).toBe('now');
  });

  it("doesn't hide a Magatama whose milestone the player deleted", () => {
    const state = newGame();
    state.story.milestones = state.story.milestones.filter((m) => m.id !== 'side-puzzle-boy');
    expect(names(state).at(-2)).toBe('Geis');
    expect(row(state, 'Geis')).toMatchObject({ status: 'now', milestones: [] });
  });

  it('lists the build targets each Magatama teaches', () => {
    const state = newGame();
    expect(row(state, 'Kamudo').targets).toEqual(['Focus', 'Might']);
    expect(row(state, 'Satan').targets).toEqual(['Deadly Fury']);
  });

  it("names what to get at a milestone, leaving out the milestone's own reward", () => {
    const state = newGame();
    expect(getsAt(gameData, milestone(state, 'story-shibuya-amala-network'))).toEqual([
      'Ankh',
      'Iyomante',
      'Shiranui',
    ]);
    expect(getsAt(gameData, milestone(state, 'story-ginza'))).toEqual(['Ankh', 'Hifumi', 'Kamudo']);
    expect(getsAt(gameData, milestone(state, 'story-asakusa-obelisk'))).toEqual([
      'Nirvana',
      'Gehenna',
    ]);
    expect(getsAt(gameData, milestone(state, 'story-shinjuku-medical-center'))).toEqual([]);
  });
});

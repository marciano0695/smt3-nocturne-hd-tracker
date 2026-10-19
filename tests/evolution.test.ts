import { describe, expect, it } from 'vite-plus/test';
import evolutionsJson from '../data/evolutions.json';
import { parseEvolutionsFile } from '../src/game/data';
import {
  addDemon,
  evolutionFor,
  evolutionStatus,
  evolveDemon,
  minDemiFiendLevel,
  removeDemon,
  sortDemons,
  updateDemon,
} from '../src/game/evolution';
import type { OwnedDemon, PlayerState } from '../src/game/types';
import { newGameSeed } from './helpers';

const parsed = parseEvolutionsFile(evolutionsJson);
const guide = parsed.value;

const evo = (from: string) => evolutionFor(from, guide)!;
const demon = (name: string, skillsDone = false): OwnedDemon => ({
  id: 'd',
  name,
  level: 5,
  skillsDone,
});

describe('data/evolutions.json', () => {
  it('loads with no errors', () => {
    expect(parsed.errors).toEqual([]);
    expect(guide.evolutions.length).toBe(evolutionsJson.evolutions.length);
    expect(guide.sources.length).toBeGreaterThan(0);
  });

  it('skips malformed rows and reports them', () => {
    const bad = parseEvolutionsFile({
      demiFiendLevelGap: 4,
      evolutions: [
        { from: 'A', to: 'B', toLevel: 10, group: 'regular' },
        { from: 'C', toLevel: 10, group: 'regular' },
        { from: 'D', to: 'E', toLevel: 'ten', group: 'regular' },
        { from: 'F', to: 'G', toLevel: 10, group: 'odd' },
        { from: 'a', to: 'H', toLevel: 12, group: 'regular' },
      ],
    });
    expect(bad.value.evolutions.map((e) => e.from)).toEqual(['A']);
    expect(bad.errors).toHaveLength(4);
  });

  it('falls back to a gap of 0 when the gap is missing', () => {
    const odd = parseEvolutionsFile({ evolutions: [] });
    expect(odd.value.demiFiendLevelGap).toBe(0);
    expect(odd.errors.length).toBe(2);
  });
});

describe('minDemiFiendLevel', () => {
  it('is the evolved level minus the gap from the data', () => {
    expect(guide.demiFiendLevelGap).toBe(4);
    expect(minDemiFiendLevel(evo('Inugami'), guide)).toBe(evo('Inugami').toLevel - 4);
    expect(minDemiFiendLevel(evo('Inugami'), guide)).toBe(18);
    expect(minDemiFiendLevel(evo('High Pixie'), guide)).toBe(52);
  });

  it('matches demon names ignoring case', () => {
    expect(evolutionFor('  pixie ', guide)?.to).toBe('High Pixie');
    expect(evolutionFor('Lucifer', guide)).toBeUndefined();
  });
});

describe('evolutionStatus', () => {
  const need = minDemiFiendLevel(evo('Pixie'), guide);

  it('waits for the Demi-fiend level, counting the levels to go', () => {
    expect(evolutionStatus(demon('Pixie', true), need - 3, guide)).toEqual({
      kind: 'waiting-level',
      levelsToGo: 3,
    });
  });

  it('waits for the skills once the level is met', () => {
    expect(evolutionStatus(demon('Pixie'), need, guide)).toEqual({ kind: 'waiting-skills' });
  });

  it('is ready with both met', () => {
    expect(evolutionStatus(demon('Pixie', true), need, guide)).toEqual({ kind: 'ready' });
  });

  it('is none for a demon that does not evolve', () => {
    expect(evolutionStatus(demon('Lucifer', true), 99, guide)).toEqual({ kind: 'none' });
  });
});

describe('party edits', () => {
  const withPixie = (): PlayerState => addDemon(newGameSeed(), 'Pixie', 5);

  it('adds demons with fresh ids and skills not done', () => {
    const state = addDemon(withPixie(), 'Inugami', 12);
    expect(state.demons).toEqual([
      { id: 'demon-1', name: 'Pixie', level: 5, skillsDone: false },
      { id: 'demon-2', name: 'Inugami', level: 12, skillsDone: false },
    ]);
  });

  it('updates and removes a demon by id', () => {
    let state = updateDemon(withPixie(), 'demon-1', { skillsDone: true, level: 8 });
    expect(state.demons?.[0]).toMatchObject({ level: 8, skillsDone: true });
    state = removeDemon(state, 'demon-1');
    expect(state.demons).toEqual([]);
  });

  it('evolves Pixie into High Pixie, then points at Queen Mab', () => {
    const ready = updateDemon(withPixie(), 'demon-1', { skillsDone: true });
    const state = evolveDemon(ready, 'demon-1', guide);
    const evolved = state.demons![0]!;
    expect(evolved).toEqual({
      id: 'demon-1',
      name: 'High Pixie',
      level: evo('Pixie').toLevel,
      skillsDone: false,
    });
    expect(evolutionFor(evolved.name, guide)?.to).toBe('Queen Mab');
  });

  it('leaves a demon that does not evolve unchanged', () => {
    const state = addDemon(newGameSeed(), 'Lucifer', 90);
    expect(evolveDemon(state, 'demon-1', guide)).toBe(state);
  });

  it('sorts ready demons first, then the closest to evolving', () => {
    const list: OwnedDemon[] = [
      { id: 'a', name: 'Lucifer', level: 90, skillsDone: true },
      { id: 'b', name: 'High Pixie', level: 40, skillsDone: true },
      { id: 'c', name: 'Inugami', level: 15, skillsDone: false },
      { id: 'd', name: 'Pixie', level: 8, skillsDone: true },
      { id: 'e', name: 'Dis', level: 25, skillsDone: true },
    ];
    expect(sortDemons(list, 20, guide).map((d) => d.id)).toEqual(['d', 'c', 'e', 'b', 'a']);
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { createGameData } from '../src/game/data';
import type { LateWindow, PlayerState } from '../src/game/types';
import { lateWindows } from '../src/game/windows';
import { fixture22, gameData } from './helpers';

const row = (w: LateWindow) => [w.magatama, w.levelUpsNeeded, w.target, w.label];

function withTargets(state: PlayerState, target: string[]): PlayerState {
  return { ...state, build: { ...state.build, target } };
}

// null removes the Magatama from the save, as if the player never got it.
function withProgress(state: PlayerState, magatama: string, nextIndex: number | null): PlayerState {
  const rest = Object.fromEntries(
    Object.entries(state.magatama).filter(([name]) => name !== magatama),
  );
  return {
    ...state,
    magatama: nextIndex === null ? rest : { ...rest, [magatama]: { nextIndex, history: [] } },
  };
}

describe('lateWindows', () => {
  it('reproduces the late-Magatama table from the level 22 save', () => {
    const windows = lateWindows(fixture22(), gameData);
    expect(windows.map(row)).toEqual([
      ['Djed', 4, 'Rakukaja', 'Level-ups to 42–45'],
      ['Vimana', 1, 'Endure', 'Any level-up from 50'],
      ['Satan', 5, 'Deadly Fury', 'Level-ups to 61–65'],
      ['Kailash', 4, 'Freikugel', 'Level-ups to 77–80'],
      ['Marogareh', 1, 'Pierce', 'First level-up after Labyrinth complete'],
    ]);
    expect(windows.map((w) => [w.owned, w.gate, w.start, w.end])).toEqual([
      [false, null, 42, 45],
      [false, null, 50, 50],
      [false, null, 61, 65],
      [false, null, 77, 80],
      [true, 'labyrinth_complete', null, null],
    ]);
    expect(windows.every((w) => w.overlapsWith.length === 0)).toBe(true);
  });

  it('turns a late Magatama into the next N level-ups', () => {
    const windows = lateWindows({ ...fixture22(), level: 50 }, gameData);
    expect(windows.find((w) => w.magatama === 'Djed')).toMatchObject({
      label: 'Next 4 level-ups',
      start: 51,
      end: 54,
    });
    expect(windows.find((w) => w.magatama === 'Vimana')).toMatchObject({
      label: 'Next level-up',
      start: 51,
      end: 51,
    });
  });

  it('flags overlapping windows on both rows', () => {
    const state = fixture22();
    const windows = lateWindows(withTargets(state, [...state.build.target, 'Mediarama']), gameData);
    expect(
      windows.slice(0, 2).map((w) => [w.target, w.start, w.end, w.label, w.overlapsWith]),
    ).toEqual([
      ['Mediarama', 41, 44, 'Level-ups to 41–44', ['Rakukaja']],
      ['Rakukaja', 42, 45, 'Level-ups to 42–45', ['Mediarama']],
    ]);
    expect(windows.slice(2).every((w) => w.overlapsWith.length === 0)).toBe(true);

    const late = lateWindows({ ...fixture22(), level: 50 }, gameData);
    expect(late.slice(0, 2).map((w) => [w.target, w.overlapsWith])).toEqual([
      ['Endure', ['Rakukaja']],
      ['Rakukaja', ['Endure']],
    ]);
  });

  it('never flags two targets of the same Magatama, nor gated rows', () => {
    const state = withTargets(fixture22(), ['Tarukaja', 'Rakukaja', 'Pierce']);
    const windows = lateWindows(withProgress(state, 'Marogareh', 4), gameData);
    expect(windows.map((w) => [w.target, w.start, w.end, w.overlapsWith])).toEqual([
      ['Tarukaja', 42, 42, []],
      ['Rakukaja', 42, 45, []],
      ['Pierce', null, null, []],
    ]);
  });

  it('handles Masakados skills, which have no level requirement', () => {
    const windows = lateWindows(withTargets(fixture22(), ['Phys Repel', 'Megidolaon']), gameData);
    expect(windows.map((w) => [...row(w), w.start, w.end])).toEqual([
      ['Masakados', 1, 'Megidolaon', 'Next level-up', 23, 23],
      ['Masakados', 7, 'Phys Repel', 'Next 7 level-ups', 23, 29],
    ]);
  });

  it('describes a gated chain with earlier steps', () => {
    const state = fixture22();
    const label = (s: PlayerState) =>
      lateWindows(s, gameData).find((w) => w.target === 'Pierce')?.label;
    expect(label(withProgress(state, 'Marogareh', 4))).toBe(
      'First level-up after Labyrinth complete, after 1 earlier step',
    );
    expect(label(withProgress(state, 'Marogareh', 3))).toBe(
      'First level-up after Labyrinth complete, after 2 earlier steps',
    );
    expect(lateWindows(withProgress(state, 'Marogareh', null), gameData).at(-1)).toMatchObject({
      magatama: 'Marogareh',
      owned: false,
      levelUpsNeeded: 6,
      gate: 'labyrinth_complete',
      label: 'First level-up after Labyrinth complete, after 5 earlier steps',
    });
  });

  it('opens the gate once the Labyrinth is complete', () => {
    const state = { ...fixture22(), labyrinthComplete: true };
    expect(lateWindows(state, gameData).some((w) => w.target === 'Pierce')).toBe(false);
    expect(
      lateWindows(withProgress(state, 'Marogareh', null), gameData).find(
        (w) => w.target === 'Pierce',
      ),
    ).toMatchObject({ owned: false, gate: null, start: 23, end: 28, label: 'Next 6 level-ups' });
  });

  it('leaves out targets that are learned, unknown, missed or planned by the scheduler', () => {
    const state = withTargets(fixture22(), ['Rakukaja', 'Rajunda', 'Pierce', 'Endure', 'Endure']);
    expect(lateWindows(state, gameData).map((w) => w.target)).toEqual([
      'Rakukaja',
      'Endure',
      'Pierce',
    ]);
    const learned = {
      ...state,
      skills: state.skills.map((s) => (s === 'Ice Breath' ? 'Rakukaja' : s)),
    };
    const missed = withProgress(learned, 'Marogareh', 6);
    const planned = withProgress(missed, 'Vimana', 0);
    expect(lateWindows(learned, gameData).map((w) => w.target)).toEqual(['Endure', 'Pierce']);
    expect(lateWindows(missed, gameData).map((w) => w.target)).toEqual(['Endure']);
    expect(lateWindows(planned, gameData)).toEqual([]);
  });

  it('reads levels from the data instead of hard-coding them', () => {
    const magatama = structuredClone(gameData.magatama);
    for (const m of magatama) {
      for (const skill of m.skills) {
        if (skill.name === 'Rakukaja') skill.level = 50;
      }
    }
    const windows = lateWindows(fixture22(), createGameData(magatama, gameData.rules));
    expect(
      windows.slice(0, 2).map((w) => [w.target, w.start, w.end, w.label, w.overlapsWith]),
    ).toEqual([
      ['Rakukaja', 47, 50, 'Level-ups to 47–50', ['Endure']],
      ['Endure', 50, 50, 'Any level-up from 50', ['Rakukaja']],
    ]);
    expect(lateWindows(fixture22(), gameData)[0]?.end).toBe(45);
  });

  it('does not mutate its input', () => {
    const state = fixture22();
    const before = structuredClone(state);
    lateWindows(state, gameData);
    expect(state).toEqual(before);
  });
});

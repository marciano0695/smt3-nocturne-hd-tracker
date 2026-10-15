import { describe, expect, it } from 'vite-plus/test';
import { schedule } from '../src/game/scheduler';
import { targetStatuses } from '../src/game/targets';
import type { PlayerState, TargetInfo } from '../src/game/types';
import { lateWindows } from '../src/game/windows';
import { fixture22, gameData } from './helpers';

function statuses(state: PlayerState, toLevel?: number): TargetInfo[] {
  const plan = schedule(state, gameData, toLevel === undefined ? {} : { toLevel });
  return targetStatuses(state, gameData, plan, lateWindows(state, gameData));
}

const find = (rows: TargetInfo[], skill: string) => rows.find((r) => r.skill === skill);

describe('targetStatuses', () => {
  it('reports every target of the level 22 save, in build order', () => {
    const state = fixture22();
    const windows = lateWindows(state, gameData);
    const windowOf = (magatama: string) => {
      const window = windows.find((w) => w.magatama === magatama);
      expect(window).toBeDefined();
      return window ?? null;
    };
    expect(targetStatuses(state, gameData, schedule(state, gameData), windows)).toEqual([
      {
        skill: 'Focus',
        magatama: 'Kamudo',
        owned: true,
        stepsRemaining: 1,
        earliestLevel: 23,
        status: { kind: 'scheduled', level: 23 },
      },
      {
        skill: 'Endure',
        magatama: 'Vimana',
        owned: false,
        stepsRemaining: 1,
        earliestLevel: 50,
        status: { kind: 'waiting', window: windowOf('Vimana') },
      },
      {
        skill: 'Freikugel',
        magatama: 'Kailash',
        owned: false,
        stepsRemaining: 4,
        earliestLevel: 80,
        status: { kind: 'waiting', window: windowOf('Kailash') },
      },
      {
        skill: 'Pierce',
        magatama: 'Marogareh',
        owned: true,
        stepsRemaining: 1,
        earliestLevel: null,
        status: { kind: 'blocked', gate: 'labyrinth_complete' },
      },
      {
        skill: 'Deadly Fury',
        magatama: 'Satan',
        owned: false,
        stepsRemaining: 5,
        earliestLevel: 65,
        status: { kind: 'waiting', window: windowOf('Satan') },
      },
      {
        skill: 'Might',
        magatama: 'Kamudo',
        owned: true,
        stepsRemaining: 3,
        earliestLevel: 29,
        status: { kind: 'scheduled', level: 29 },
      },
      {
        skill: 'War Cry',
        magatama: 'Hifumi',
        owned: true,
        stepsRemaining: 3,
        earliestLevel: 25,
        status: { kind: 'scheduled', level: 26 },
      },
      {
        skill: 'Rakukaja',
        magatama: 'Djed',
        owned: false,
        stepsRemaining: 4,
        earliestLevel: 45,
        status: { kind: 'waiting', window: windowOf('Djed') },
      },
    ]);
  });

  it('schedules Pierce at the next level-up once the Labyrinth is complete', () => {
    const rows = statuses({ ...fixture22(), labyrinthComplete: true });
    expect(find(rows, 'Pierce')).toEqual({
      skill: 'Pierce',
      magatama: 'Marogareh',
      owned: true,
      stepsRemaining: 1,
      earliestLevel: 23,
      status: { kind: 'scheduled', level: 23 },
    });
    expect(['Focus', 'War Cry', 'Might'].map((s) => find(rows, s)?.status)).toEqual([
      { kind: 'scheduled', level: 24 },
      { kind: 'scheduled', level: 27 },
      { kind: 'scheduled', level: 29 },
    ]);
  });

  it('marks a target the Demi-fiend already has as learned', () => {
    const state = fixture22();
    state.skills[7] = 'Focus';
    state.magatama.Kamudo = { nextIndex: 2, history: [] };
    expect(find(statuses(state), 'Focus')).toEqual({
      skill: 'Focus',
      magatama: 'Kamudo',
      owned: true,
      stepsRemaining: 0,
      earliestLevel: null,
      status: { kind: 'learned' },
    });
  });

  it('marks a target passed by its Magatama as missed', () => {
    const state = fixture22();
    state.magatama.Hifumi = { nextIndex: 3, history: [] };
    expect(find(statuses(state), 'War Cry')).toEqual({
      skill: 'War Cry',
      magatama: 'Hifumi',
      owned: true,
      stepsRemaining: null,
      earliestLevel: null,
      status: { kind: 'missed' },
    });
  });

  it('marks a target that is not in the data as unknown', () => {
    const state = fixture22();
    state.build.target = ['Rajunda', ...state.build.target.slice(1)];
    expect(statuses(state)[0]).toEqual({
      skill: 'Rajunda',
      magatama: null,
      owned: false,
      stepsRemaining: null,
      earliestLevel: null,
      status: { kind: 'unknown' },
    });
  });

  it('marks a reachable target the plan does not learn as unscheduled', () => {
    expect(find(statuses(fixture22(), 25), 'Might')).toMatchObject({
      stepsRemaining: 3,
      earliestLevel: 29,
      status: { kind: 'unscheduled' },
    });
  });

  it('waits on a gated Magatama the player does not own yet', () => {
    const state = fixture22();
    delete state.magatama.Marogareh;
    const pierce = find(statuses(state), 'Pierce');
    expect(pierce).toMatchObject({
      magatama: 'Marogareh',
      owned: false,
      stepsRemaining: 6,
      earliestLevel: null,
    });
    expect(pierce?.status).toMatchObject({
      kind: 'waiting',
      window: { gate: 'labyrinth_complete', start: null, end: null },
    });
  });

  it('waits without a window when none is given', () => {
    const state = fixture22();
    const rows = targetStatuses(state, gameData, schedule(state, gameData), []);
    expect(find(rows, 'Endure')).toMatchObject({
      stepsRemaining: 1,
      earliestLevel: null,
      status: { kind: 'waiting', window: null },
    });
  });

  it('lists each target once', () => {
    const state = fixture22();
    state.build.target = ['Focus', 'Might', 'Focus'];
    expect(statuses(state).map((r) => r.skill)).toEqual(['Focus', 'Might']);
  });

  it('does not mutate its inputs', () => {
    const state = fixture22();
    const plan = schedule(state, gameData);
    const windows = lateWindows(state, gameData);
    const before = structuredClone({ state, plan, windows });
    targetStatuses(state, gameData, plan, windows);
    expect({ state, plan, windows }).toEqual(before);
  });
});

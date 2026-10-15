import { describe, expect, it } from 'vite-plus/test';
import statGuidesJson from '../data/stat-guides.json';
import { parseStatGuidesFile } from '../src/game/data';
import {
  guideCurve,
  guidePattern,
  guideStatsAt,
  projectStats,
  statProgress,
  suggestStat,
} from '../src/game/statPlan';
import type { Build, PlayerState, Rules, Stat } from '../src/game/types';
import { fixture22, gameData, newGameSeed } from './helpers';

// Literal rules so these tests don't change when the player edits data/rules.json.
const RULES: Rules = {
  maxLevel: 99,
  maxSkills: 8,
  statCap: 40,
  statPointsPerLevel: 1,
  assumptions: [],
};

// The stat plan of the level 22 save.
const BUILD: Build = {
  target: [],
  interimKeep: [],
  wishlist: [],
  statPattern: ['STR', 'STR', 'VIT'],
  statTargets: { STR: 40, VIT: 30, AGI: 20 },
};

function statsOf(values: Partial<Record<Stat, number>>): Record<Stat, number> {
  return { STR: 2, MAG: 2, VIT: 2, AGI: 2, LUC: 2, ...values };
}

function buildWith(changes: Partial<Build>): Build {
  return { ...BUILD, ...changes };
}

function total(stats: Record<Stat, number>): number {
  return stats.STR + stats.MAG + stats.VIT + stats.AGI + stats.LUC;
}

describe('suggestStat', () => {
  it('follows STR, STR, VIT from the level 22 save', () => {
    const { stats, build } = fixture22();
    const levels = [23, 24, 25, 26, 27, 28];
    expect(levels.map((level) => suggestStat(stats, level, build, RULES))).toEqual([
      'STR',
      'STR',
      'VIT',
      'STR',
      'STR',
      'VIT',
    ]);
  });

  it('starts the pattern at the level-up from 1 to 2', () => {
    const { stats, build } = newGameSeed();
    expect([2, 3, 4, 5].map((level) => suggestStat(stats, level, build, RULES))).toEqual([
      'STR',
      'STR',
      'VIT',
      'STR',
    ]);
  });

  it('still walks the whole pattern for a level typed in below 2', () => {
    // Level 1 sits on the VIT position; with STR done, only a full walk finds VIT.
    const strDone = buildWith({ statTargets: { STR: 12, VIT: 30, AGI: 20 } });
    expect(suggestStat(statsOf({ STR: 12 }), 1, strDone, RULES)).toBe('VIT');
  });

  it('skips a pattern stat that reached its target and moves on in the pattern', () => {
    const strDone = buildWith({ statTargets: { STR: 12, VIT: 30, AGI: 20 } });
    expect(suggestStat(statsOf({ STR: 12, VIT: 7 }), 23, strDone, RULES)).toBe('VIT');
    // Level 25 is the VIT position, so the walk wraps round to STR.
    const vitDone = buildWith({ statTargets: { STR: 40, VIT: 7, AGI: 20 } });
    expect(suggestStat(statsOf({ STR: 11, VIT: 7 }), 25, vitDone, RULES)).toBe('STR');
  });

  it('keeps feeding a pattern stat that has no target', () => {
    const build = buildWith({ statPattern: ['LUC'], statTargets: {} });
    expect(suggestStat(statsOf({ LUC: 39 }), 30, build, RULES)).toBe('LUC');
  });

  it('gives AGI, targeted but not in the pattern, the points once STR and VIT are done', () => {
    const stats = statsOf({ STR: 40, VIT: 30, AGI: 10 });
    expect([23, 24, 25].map((level) => suggestStat(stats, level, BUILD, RULES))).toEqual([
      'AGI',
      'AGI',
      'AGI',
    ]);
  });

  it('favours the unfinished target furthest behind in proportion to its target', () => {
    const build = buildWith({ statPattern: ['STR'] });
    // VIT is at 50% of its target and AGI at 60%, so VIT wins although AGI is lower.
    expect(suggestStat(statsOf({ STR: 40, VIT: 15, AGI: 12 }), 30, build, RULES)).toBe('VIT');
    // Both at 50%: STATS order breaks the tie.
    expect(suggestStat(statsOf({ STR: 40, VIT: 15, AGI: 10 }), 30, build, RULES)).toBe('VIT');
  });

  it('suggests the lowest targeted stat once every target is met', () => {
    // MAG and LUC are lower but have no target.
    expect(suggestStat(statsOf({ STR: 40, VIT: 30, AGI: 20 }), 30, BUILD, RULES)).toBe('AGI');
    expect(suggestStat(statsOf({ STR: 40, VIT: 30, AGI: 30 }), 30, BUILD, RULES)).toBe('VIT');
  });

  it('never suggests a stat at the cap', () => {
    // A target above the cap is never reached, so only the cap can stop STR here.
    const overCap = buildWith({ statPattern: ['STR'], statTargets: { STR: 50 } });
    expect(suggestStat(statsOf({ STR: 40 }), 30, overCap, RULES)).toBe('MAG');
    const noTarget = buildWith({ statPattern: ['MAG'], statTargets: {} });
    const stats = statsOf({ STR: 5, MAG: 40, VIT: 3, AGI: 3, LUC: 3 });
    expect(suggestStat(stats, 30, noTarget, RULES)).toBe('VIT');
  });

  it('takes the cap from the rules', () => {
    const overCap = buildWith({ statPattern: ['STR'], statTargets: { STR: 50 } });
    expect(suggestStat(statsOf({ STR: 40 }), 30, overCap, { ...RULES, statCap: 45 })).toBe('STR');
  });

  it('falls back to the lowest stat below the cap when every targeted stat is capped', () => {
    const stats = statsOf({ STR: 40, MAG: 10, VIT: 40, AGI: 40, LUC: 5 });
    expect(suggestStat(stats, 30, BUILD, RULES)).toBe('LUC');
  });

  it('suggests nothing when every stat is capped', () => {
    const stats = statsOf({ STR: 40, MAG: 40, VIT: 40, AGI: 40, LUC: 40 });
    expect(suggestStat(stats, 30, BUILD, RULES)).toBeNull();
  });

  it('works with an empty pattern', () => {
    const { stats } = fixture22();
    // STR 11/40, VIT 7/30, AGI 10/20: VIT is furthest behind.
    expect(suggestStat(stats, 23, buildWith({ statPattern: [] }), RULES)).toBe('VIT');
    expect(suggestStat(stats, 23, buildWith({ statPattern: [], statTargets: {} }), RULES)).toBe(
      'MAG',
    );
  });
});

describe('projectStats', () => {
  it('projects one row per level from the next level up to the max level', () => {
    const rows = projectStats(fixture22(), RULES);
    expect(rows).toHaveLength(77);
    expect(rows[0]?.level).toBe(23);
    expect(rows.at(-1)?.level).toBe(99);
  });

  it('applies each suggested point before suggesting the next one', () => {
    expect(projectStats(fixture22(), RULES, 25)).toEqual([
      { level: 23, stat: 'STR', stats: { STR: 12, MAG: 2, VIT: 7, AGI: 10, LUC: 2 } },
      { level: 24, stat: 'STR', stats: { STR: 13, MAG: 2, VIT: 7, AGI: 10, LUC: 2 } },
      { level: 25, stat: 'VIT', stats: { STR: 13, MAG: 2, VIT: 8, AGI: 10, LUC: 2 } },
    ]);
  });

  it('takes the level 22 save to STR 40, VIT 33 and AGI 32 by level 99', () => {
    expect(projectStats(fixture22(), RULES).at(-1)?.stats).toEqual({
      STR: 40,
      MAG: 2,
      VIT: 33,
      AGI: 32,
      LUC: 2,
    });
  });

  it('gives exactly one point per level and never exceeds the cap', () => {
    const state = fixture22();
    const rows = projectStats(state, RULES);
    expect(rows.map((row) => total(row.stats))).toEqual(
      rows.map((_, i) => total(state.stats) + i + 1),
    );
    expect(Math.max(...rows.flatMap((row) => Object.values(row.stats)))).toBeLessThanOrEqual(40);
  });

  it('stops giving points once every stat is capped', () => {
    const state: PlayerState = {
      ...fixture22(),
      level: 90,
      stats: { STR: 40, MAG: 40, VIT: 40, AGI: 39, LUC: 38 },
    };
    const rows = projectStats(state, RULES);
    expect(rows.map((row) => row.stat)).toEqual([
      'AGI',
      'LUC',
      'LUC',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(rows.at(-1)?.stats).toEqual({ STR: 40, MAG: 40, VIT: 40, AGI: 40, LUC: 40 });
  });

  it('stops at toLevel and never projects past the max level', () => {
    expect(projectStats(fixture22(), RULES, 22)).toEqual([]);
    expect(projectStats(fixture22(), RULES, 120)).toHaveLength(77);
  });

  it('adds rules.statPointsPerLevel each level without passing the cap', () => {
    const rules = { ...RULES, statPointsPerLevel: 2 };
    expect(projectStats(fixture22(), rules, 23)[0]?.stats.STR).toBe(13);
    const nearCap = { ...fixture22(), stats: { STR: 39, MAG: 2, VIT: 7, AGI: 10, LUC: 2 } };
    expect(projectStats(nearCap, rules, 23)[0]?.stats.STR).toBe(40);
  });

  it('does not change the state it projects from', () => {
    const state = fixture22();
    const before = structuredClone(state);
    projectStats(state, RULES);
    expect(state).toEqual(before);
  });
});

describe('statProgress', () => {
  it('reports each stat against its target and the level the plan reaches it', () => {
    expect(statProgress(fixture22(), RULES)).toEqual([
      { stat: 'STR', value: 11, target: 40, cap: 40, reached: false, projectedLevel: 65 },
      { stat: 'MAG', value: 2, target: null, cap: 40, reached: false, projectedLevel: null },
      { stat: 'VIT', value: 7, target: 30, cap: 40, reached: false, projectedLevel: 74 },
      { stat: 'AGI', value: 10, target: 20, cap: 40, reached: false, projectedLevel: 84 },
      { stat: 'LUC', value: 2, target: null, cap: 40, reached: false, projectedLevel: null },
    ]);
  });

  it('gives the current level for a target already reached', () => {
    const state = {
      ...fixture22(),
      level: 50,
      stats: { STR: 40, MAG: 2, VIT: 30, AGI: 12, LUC: 2 },
    };
    expect(statProgress(state, RULES)).toEqual([
      { stat: 'STR', value: 40, target: 40, cap: 40, reached: true, projectedLevel: 50 },
      { stat: 'MAG', value: 2, target: null, cap: 40, reached: false, projectedLevel: null },
      { stat: 'VIT', value: 30, target: 30, cap: 40, reached: true, projectedLevel: 50 },
      { stat: 'AGI', value: 12, target: 20, cap: 40, reached: false, projectedLevel: 58 },
      { stat: 'LUC', value: 2, target: null, cap: 40, reached: false, projectedLevel: null },
    ]);
  });

  it('gives no projected level when the plan cannot reach a target by the max level', () => {
    const late = { ...fixture22(), level: 95 };
    expect(statProgress(late, RULES).map((row) => row.projectedLevel)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    const overCap = { ...fixture22(), build: buildWith({ statTargets: { STR: 50 } }) };
    expect(statProgress(overCap, RULES)[0]).toEqual({
      stat: 'STR',
      value: 11,
      target: 50,
      cap: 40,
      reached: false,
      projectedLevel: null,
    });
  });
});

describe('stat guide', () => {
  const guides = parseStatGuidesFile(statGuidesJson);
  const guide = guides.value[0]!;
  const withGuide = (state: PlayerState): PlayerState => ({
    ...state,
    build: { ...state.build, statGuide: guide },
  });

  it('loads data/stat-guides.json', () => {
    expect(guides.errors).toEqual([]);
    expect(guide.phases.map((p) => p.untilLevel)).toEqual([30, null]);
  });

  it('builds the 2/2/1 curve with Agility on every fifth level until 30', () => {
    const state = withGuide(newGameSeed());
    const curve = guideCurve(guide, state.build, gameData.rules);
    expect(curve[30]).toMatchObject({ STR: 14, VIT: 13, AGI: 8 });
    const agiLevels = [];
    for (let level = 2; level <= 30; level++) {
      if (curve[level]!.AGI > curve[level - 1]!.AGI) agiLevels.push(level);
    }
    expect(agiLevels).toEqual([5, 10, 15, 20, 25, 30]);
    // After 30 the guide turns to Strength.
    expect(curve[45]).toMatchObject({ STR: 25, VIT: 17, AGI: 8 });
  });

  it('follows the guide exactly from a new game', () => {
    const state = withGuide(newGameSeed());
    const curve = guideCurve(guide, state.build, gameData.rules);
    for (const row of projectStats(state, gameData.rules))
      expect(row.stats).toEqual(curve[row.level]);
  });

  it('feeds the stat furthest behind the guide and lets a stat that is ahead wait', () => {
    // Level 22 save: STR 11, VIT 7, AGI 10. The guide wants 11/10/6 at level 22.
    const state = withGuide(fixture22());
    const rows = projectStats(state, gameData.rules, 40);
    expect(rows[0]?.stat).toBe('VIT');
    expect(rows.filter((r) => r.level <= 30).every((r) => r.stat !== 'AGI')).toBe(true);
    // Agility stays where the save had it; Strength and Vitality close in on the curve. The save
    // spent its points differently, so they can end at most one point off.
    const curve = guideCurve(guide, state.build, gameData.rules);
    const at40 = rows.at(-1)!.stats;
    expect(at40.AGI).toBe(10);
    expect(Math.abs(at40.STR - curve[40]!.STR)).toBeLessThanOrEqual(1);
    expect(Math.abs(at40.VIT - curve[40]!.VIT)).toBeLessThanOrEqual(1);
  });

  it('follows the guide pattern when ahead of the curve everywhere', () => {
    const state = withGuide({
      ...fixture22(),
      stats: { STR: 30, MAG: 2, VIT: 25, AGI: 15, LUC: 2 },
    });
    expect(guideStatsAt(state.build, gameData.rules, 23)?.STR).toBeLessThan(30);
    expect(suggestStat(state.stats, 23, state.build, gameData.rules)).toBe(
      guidePattern(guide, 23)[(23 - 2) % guidePattern(guide, 23).length],
    );
  });

  it('still respects targets and the cap', () => {
    const state = withGuide({
      ...fixture22(),
      level: 60,
      stats: { STR: 40, MAG: 2, VIT: 10, AGI: 10, LUC: 2 },
    });
    state.build.statTargets = { STR: 40, VIT: 12, AGI: 20 };
    const rows = projectStats(state, gameData.rules, 70);
    expect(rows.every((r) => r.stats.STR === 40)).toBe(true);
    expect(rows.map((r) => r.stats.VIT).at(-1)).toBe(12);
  });
});

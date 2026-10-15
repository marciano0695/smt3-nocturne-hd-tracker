import { findSkill, isUnlocked, skillAt, unlockLabel } from './data';
import { completionLevel } from './scheduler';
import type { GameData, LateWindow, PlayerState } from './types';

/** First unmet unlock condition between two skills of a Magatama, or null. */
export function chainGate(
  data: GameData,
  magatama: string,
  fromIndex: number,
  toIndex: number,
  labyrinthComplete: boolean,
): string | null {
  for (let i = fromIndex; i <= toIndex; i++) {
    const skill = skillAt(data, magatama, i);
    if (skill?.unlock !== undefined && !isUnlocked(skill, labyrinthComplete)) return skill.unlock;
  }
  return null;
}

function label(
  gate: string | null,
  n: number,
  start: number,
  end: number,
  nextLevel: number,
): string {
  if (gate !== null) {
    const first = `First level-up after ${unlockLabel(gate)}`;
    if (n === 1) return first;
    return `${first}, after ${n - 1} earlier step${n - 1 === 1 ? '' : 's'}`;
  }
  if (n === 1) return end === nextLevel ? 'Next level-up' : `Any level-up from ${end}`;
  return start === nextLevel ? `Next ${n} level-ups` : `Level-ups to ${start}–${end}`;
}

/**
 * Target skills the scheduler can't plan yet: their Magatama isn't owned, or an unlock
 * condition (the Labyrinth) blocks the way. Each row gives the earliest window for them.
 */
export function lateWindows(state: PlayerState, data: GameData): LateWindow[] {
  const nextLevel = state.level + 1;
  const rows: LateWindow[] = [];
  for (const target of new Set(state.build.target)) {
    const source = findSkill(data, target);
    if (!source || state.skills.includes(target)) continue;
    const progress = state.magatama[source.magatama];
    const owned = progress !== undefined;
    const startIndex = progress?.nextIndex ?? 0;
    // Behind the pointer: declined or passed, gone for good.
    if (startIndex > source.index) continue;
    const gate = chainGate(
      data,
      source.magatama,
      startIndex,
      source.index,
      state.labyrinthComplete,
    );
    // Owned and reachable: the scheduler plans it, so it isn't late.
    if (owned && gate === null) continue;

    const n = source.index - startIndex + 1;
    let start: number | null = null;
    let end: number | null = null;
    if (gate === null) {
      end = completionLevel(data, source.magatama, startIndex, source.index, nextLevel, true);
      // The consecutive level-ups that end at the earliest completion.
      start = end - n + 1;
    }
    rows.push({
      magatama: source.magatama,
      target,
      owned,
      levelUpsNeeded: n,
      gate,
      start,
      end,
      label:
        gate === null ? label(null, n, start!, end!, nextLevel) : label(gate, n, 0, 0, nextLevel),
      overlapsWith: [],
    });
  }

  for (const row of rows) {
    if (row.start === null || row.end === null) continue;
    row.overlapsWith = rows
      .filter(
        (other) =>
          other.magatama !== row.magatama &&
          other.start !== null &&
          other.end !== null &&
          other.start <= row.end! &&
          row.start! <= other.end,
      )
      .map((other) => other.target);
  }

  const order = (name: string) => data.dataOrder.get(name) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort((a, b) => {
    if ((a.gate === null) !== (b.gate === null)) return a.gate === null ? -1 : 1;
    return (
      (a.end ?? 0) - (b.end ?? 0) ||
      (a.start ?? 0) - (b.start ?? 0) ||
      order(a.magatama) - order(b.magatama)
    );
  });
}

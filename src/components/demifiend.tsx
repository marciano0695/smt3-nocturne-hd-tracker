import { useState, type ReactNode } from 'react';
import {
  findSkill,
  isUnlocked,
  levelRequirement,
  nextPending,
  ownedInDataOrder,
  unlockLabel,
} from '../game/data';
import { defaultSkillChoice, offerAt, suggestLevelUp, validateLevelUp } from '../game/levelUp';
import { addMagatama, obtainOrder } from '../game/obtain';
import { replacedAt } from '../game/scheduler';
import { suggestStat } from '../game/statPlan';
import {
  STATS,
  type GameData,
  type LevelUpChoice,
  type PlanStep,
  type PlayerState,
  type SkillChoice,
  type Stat,
} from '../game/types';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { AssumptionTag, Button, Dialog, Empty, Field, IconButton, Tag, Unverified } from './ui';

const ALIGNMENT_LABEL = { light: 'Light', neutral: 'Neutral', dark: 'Dark' } as const;

export function AlignmentTag({ name }: { name: string }) {
  const { data } = useStore();
  const alignment = data.magatamaByName.get(name)?.alignment;
  return alignment ? <Tag>{ALIGNMENT_LABEL[alignment]}</Tag> : null;
}

/** Where to get a Magatama, from the player's notes in magatama.json; unverified until confirmed. */
export function MagatamaSource({ name, withAlignment }: { name: string; withAlignment?: boolean }) {
  const { data, isVerified, confirmAssumption } = useStore();
  const m = data.magatamaByName.get(name);
  if (!m?.obtain) return null;
  const id = `obtain:${name}`;
  return (
    <span className="source">
      {withAlignment && <AlignmentTag name={name} />}
      <span>{m.obtain}</span>
      {!isVerified(id) && (
        <Unverified text={`${name}: ${m.obtain}`} onConfirm={() => confirmAssumption(id, true)} />
      )}
    </span>
  );
}

/** The 8 skill slots; target-build skills stand out. */
export function SkillSlots({ compact }: { compact?: boolean }) {
  const { state, data, plan } = useStore();
  const { target, interimKeep } = state.build;
  const slots = Array.from({ length: data.rules.maxSkills }, (_, i) => state.skills[i] ?? null);
  const held = state.skills.filter((s) => target.includes(s)).length;
  return (
    <div className="slots-wrap">
      <p className="slots-count">
        <span className="meter" aria-hidden="true">
          {target.map((t, i) => (
            <i key={t} className={i < held ? 'is-on' : undefined} />
          ))}
        </span>
        <span>
          Target skills held: <strong className="num">{held}</strong> of{' '}
          <span className="num">{target.length}</span>
        </span>
      </p>
      <ol className={`slots${compact ? ' slots-compact' : ''}`} aria-label="Skill slots">
        {slots.map((skill, i) => {
          const isTarget = skill !== null && target.includes(skill);
          const info = skill ? findSkill(data, skill)?.skill : undefined;
          const out = skill && !isTarget ? replacedAt(plan, skill) : undefined;
          const keep = skill ? interimKeep.indexOf(skill) : -1;
          return (
            <li
              key={i}
              className={`slot${skill ? '' : ' slot-empty'}${isTarget ? ' slot-target' : ''}`}
            >
              <span className="slot-num num">{i + 1}</span>
              <span className="slot-name">{skill ?? 'Empty'}</span>
              {skill && (
                <span className="slot-sub">
                  {isTarget ? (
                    <span className="slot-mark">Target</span>
                  ) : out ? (
                    <span className="slot-out">
                      Out at <span className="num">{out.level}</span> for {out.skill}
                    </span>
                  ) : keep >= 0 ? (
                    <span>
                      Keep, priority <span className="num">{keep + 1}</span>
                    </span>
                  ) : (
                    <span>Not kept</span>
                  )}
                  {!compact && info && <span className="slot-meta">{info.cost}</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The next level-ups as a line of nodes; target learns are the filled ones. */
export function ScheduleTimeline({ count = 10 }: { count?: number }) {
  const { plan, state } = useStore();
  const steps = plan.slice(0, count);
  if (steps.length === 0) return null;
  return (
    <div className="timeline">
      <ol aria-label="Next level-ups">
        {steps.map((step, i) => {
          const isTarget =
            step.action === 'learn' &&
            step.skill !== null &&
            state.build.target.includes(step.skill);
          const kind = isTarget ? 'is-target' : step.action === 'learn' ? 'is-learn' : 'is-idle';
          const label = step.skill ?? (step.reason === 'free' ? 'free' : 'nothing');
          return (
            <li key={step.level} className={`tl ${kind}${i === 0 ? ' is-next' : ''}`}>
              <span className="tl-level num">{step.level}</span>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-skill">{label}</span>
              <span className="visually-hidden">
                {step.magatama
                  ? `${step.magatama}, ${step.action === 'learn' ? 'learn' : 'decline'}${isTarget ? ', target skill' : ''}`
                  : step.reason === 'free'
                    ? 'free level'
                    : 'nothing to learn'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="tl-legend">
        <span>
          <i className="is-target" aria-hidden="true" />
          Learn a target skill
        </span>
        <span>
          <i className="is-learn" aria-hidden="true" />
          Learn another skill
        </span>
        <span>
          <i aria-hidden="true" />
          Decline or free level
        </span>
      </p>
    </div>
  );
}

/** Why a Magatama teaches nothing at a level, in plain words. */
export function nothingReason(
  state: PlayerState,
  data: GameData,
  magatama: string | null,
  newLevel: number,
): string {
  if (magatama === null) return 'No Magatama equipped: nothing is learned.';
  const pending = nextPending(state, data, magatama);
  if (!pending) return `${magatama} has taught every skill: nothing is learned.`;
  if (pending.skill.unlock && !isUnlocked(pending.skill, state.labyrinthComplete)) {
    return `${pending.skill.name} needs ${unlockLabel(pending.skill.unlock)}: nothing is learned and ${magatama} keeps it for later.`;
  }
  return `${pending.skill.name} needs level ${levelRequirement(pending.skill)}: nothing is learned at ${newLevel} and ${magatama} keeps it for later.`;
}

export function LevelUpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <LevelUpForm onClose={onClose} /> : null;
}

function LevelUpForm({ onClose }: { onClose: () => void }) {
  const { state, data, plan, levelUp } = useStore();
  const newLevel = state.level + 1;
  const [choice, setChoice] = useState<LevelUpChoice>(() => suggestLevelUp(state, data, plan[0]));
  const [error, setError] = useState<string | null>(null);
  const offer = offerAt(state, data, choice.magatama, newLevel);
  const suggestedStat = suggestStat(state.stats, newLevel, state.build, data.rules);
  const step = plan[0];
  const full = state.skills.length >= data.rules.maxSkills;
  const owned = ownedInDataOrder(state, data).filter((m) => data.magatamaByName.has(m));

  const pickMagatama = (magatama: string | null) => {
    const next = offerAt(state, data, magatama, newLevel);
    const decision = next ? defaultSkillChoice(state, data, next) : null;
    setChoice({
      ...choice,
      magatama,
      skillChoice: decision?.skillChoice ?? null,
      replaceSlot: decision?.replaceSlot ?? null,
    });
    setError(null);
  };

  const submit = () => {
    const problem = validateLevelUp(state, data, choice) ?? levelUp(choice);
    if (problem) setError(problem);
    else onClose();
  };

  if (state.level >= data.rules.maxLevel) {
    return (
      <Dialog open title="Level up" onClose={onClose}>
        <p>The Demi-fiend is already at the maximum level ({data.rules.maxLevel}).</p>
      </Dialog>
    );
  }

  const optionLabel = (m: string) => {
    const o = offerAt(state, data, m, newLevel);
    if (o) return `${m}: ${o.skill.name}`;
    const p = nextPending(state, data, m);
    return p ? `${m}: nothing (${p.skill.name} later)` : `${m}: nothing left`;
  };

  return (
    <Dialog
      open
      wide
      title={`Level up to ${newLevel}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={submit}>
            Level up to {newLevel}
          </Button>
        </>
      }
    >
      <div className="levelup">
        <Field label="Equipped Magatama" hint={step ? <PlanHint step={step} /> : undefined}>
          <select
            value={choice.magatama ?? ''}
            onChange={(e) => pickMagatama(e.target.value || null)}
          >
            <option value="">None equipped</option>
            {owned.map((m) => (
              <option key={m} value={m}>
                {optionLabel(m)}
              </option>
            ))}
          </select>
        </Field>

        {offer ? (
          <fieldset className="choice-group">
            <legend>
              {choice.magatama} teaches <strong>{offer.skill.name}</strong>
              {state.build.target.includes(offer.skill.name) && <Tag tone="primary">target</Tag>}
            </legend>
            <p className="skill-effect">
              {offer.skill.effect} <span className="muted">({offer.skill.cost})</span>
            </p>
            <Radio
              name="skill"
              value="learn"
              checked={choice.skillChoice === 'learn'}
              disabled={full}
              onPick={(v) =>
                setChoice({ ...choice, skillChoice: v as SkillChoice, replaceSlot: null })
              }
              label={
                full ? 'Learn into a free slot (all 8 slots are full)' : 'Learn into a free slot'
              }
            />
            <Radio
              name="skill"
              value="replace"
              checked={choice.skillChoice === 'replace'}
              disabled={state.skills.length === 0}
              onPick={() =>
                setChoice({
                  ...choice,
                  skillChoice: 'replace',
                  replaceSlot:
                    choice.replaceSlot ?? defaultSkillChoice(state, data, offer).replaceSlot ?? 0,
                })
              }
              label="Learn and replace"
            >
              {choice.skillChoice === 'replace' && (
                <select
                  aria-label="Skill to replace"
                  value={choice.replaceSlot ?? 0}
                  onChange={(e) => setChoice({ ...choice, replaceSlot: Number(e.target.value) })}
                >
                  {state.skills.map((s, i) => (
                    <option key={s} value={i}>
                      {s}
                      {state.build.target.includes(s) ? ' (target!)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </Radio>
            <Radio
              name="skill"
              value="decline"
              checked={choice.skillChoice === 'decline'}
              onPick={() => setChoice({ ...choice, skillChoice: 'decline', replaceSlot: null })}
              label="Decline"
            >
              {choice.skillChoice === 'decline' && (
                <span className="decline-note">
                  Gone for good: {choice.magatama} moves on to its next skill.{' '}
                  <AssumptionTag id="declined-skill-gone" />
                </span>
              )}
            </Radio>
          </fieldset>
        ) : (
          <p className="nothing">{nothingReason(state, data, choice.magatama, newLevel)}</p>
        )}

        <fieldset className="choice-group">
          <legend>
            Stat point <AssumptionTag id="stat-cap" />
          </legend>
          <div className="stat-picks">
            {STATS.map((stat: Stat) => {
              const capped = state.stats[stat] >= data.rules.statCap;
              return (
                <label
                  key={stat}
                  className={`stat-pick${choice.stat === stat ? ' is-picked' : ''}`}
                >
                  <input
                    type="radio"
                    name="stat"
                    value={stat}
                    checked={choice.stat === stat}
                    disabled={capped}
                    onChange={() => setChoice({ ...choice, stat })}
                  />
                  <span className="stat-pick-name">{stat}</span>
                  <span className="num">
                    {state.stats[stat]} → {capped ? state.stats[stat] : state.stats[stat] + 1}
                  </span>
                  {stat === suggestedStat && <span className="stat-pick-hint">plan</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function PlanHint({ step }: { step: PlanStep }) {
  if (step.reason === 'none') return <>The plan: nothing can be learned at this level.</>;
  if (step.magatama === null) return <>The plan: a free level, any Magatama will do.</>;
  return (
    <>
      The plan: {step.magatama}, {step.action === 'learn' ? 'learn' : 'decline'} {step.skill}
      {step.replaces ? ` (replaces ${step.replaces})` : ''}.
    </>
  );
}

function Radio({
  name,
  value,
  checked,
  disabled,
  label,
  onPick,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  onPick: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className={`radio${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}>
      <label>
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onPick(value)}
        />
        {label}
      </label>
      {children}
    </div>
  );
}

/** Plan rows with consecutive idle levels folded into one range row. */
type Row = { from: number; to: number; step: PlanStep };

function groupPlan(plan: PlanStep[]): Row[] {
  const rows: Row[] = [];
  for (const step of plan) {
    const last = rows.at(-1);
    const idle = step.magatama === null;
    if (
      last &&
      idle &&
      last.step.magatama === null &&
      last.step.reason === step.reason &&
      last.to === step.level - 1
    ) {
      last.to = step.level;
    } else rows.push({ from: step.level, to: step.level, step });
  }
  return rows;
}

const REASON_TEXT: Record<PlanStep['reason'], string> = {
  target: 'target',
  'toward-target': 'toward',
  wishlist: 'wishlist',
  free: 'free level',
  none: 'no skill',
};

export function ScheduleTable({ limit }: { limit?: number }) {
  const { plan, state } = useStore();
  const [all, setAll] = useState(false);
  const rows = groupPlan(plan);
  const shown = limit && !all ? rows.slice(0, limit) : rows;
  if (rows.length === 0)
    return <Empty>The Demi-fiend is at the maximum level. Nothing left to plan.</Empty>;
  return (
    <>
      <table className="plan">
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Magatama</th>
            <th scope="col">Skill</th>
            <th scope="col">Action</th>
            <th scope="col">Replaces</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ from, to, step }) => {
            const target = step.skill !== null && state.build.target.includes(step.skill);
            const idle = step.magatama === null;
            return (
              <tr key={from} className={`${idle ? 'is-idle' : ''}${target ? ' is-target' : ''}`}>
                <td className="num plan-level" data-label="Level">
                  {from === to ? from : `${from}–${to}`}
                </td>
                <td data-label="Magatama">
                  {step.magatama ?? (step.reason === 'free' ? 'any' : '—')}
                </td>
                <td data-label="Skill">
                  {step.skill ?? (step.reason === 'free' ? 'free level' : 'nothing to learn')}
                  {!idle && (
                    <span className="plan-reason">
                      {step.reason === 'target'
                        ? 'target'
                        : step.toward
                          ? `${REASON_TEXT[step.reason]} ${step.toward}`
                          : REASON_TEXT[step.reason]}
                    </span>
                  )}
                </td>
                <td data-label="Action">
                  {step.action === 'learn' ? (
                    <Tag tone={target ? 'primary' : 'success'}>Learn</Tag>
                  ) : step.action === 'decline' ? (
                    <Tag>Decline</Tag>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td data-label="Replaces">{step.replaces ?? <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {limit && rows.length > limit && (
        <Button small variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${rows.length} rows`}
        </Button>
      )}
    </>
  );
}

export function WindowsTable() {
  const { windows } = useStore();
  if (windows.length === 0) {
    return (
      <Empty>
        Every target is either learned or on an owned Magatama the schedule already covers.
      </Empty>
    );
  }
  return (
    <table className="plan windows">
      <thead>
        <tr>
          <th scope="col">Magatama</th>
          <th scope="col">Level-ups needed</th>
          <th scope="col">Target</th>
          <th scope="col">Earliest window</th>
        </tr>
      </thead>
      <tbody>
        {windows.map((w) => (
          <tr key={w.target}>
            <td data-label="Magatama">
              <span className="windows-name">
                {w.magatama} {w.owned ? <Tag>owned</Tag> : <AlignmentTag name={w.magatama} />}
              </span>
              {!w.owned && <MagatamaSource name={w.magatama} />}
            </td>
            <td className="num" data-label="Level-ups">
              {w.levelUpsNeeded}
            </td>
            <td data-label="Target">{w.target}</td>
            <td data-label="Window">
              {w.label}
              {w.overlapsWith.length > 0 && (
                <span className="overlap">
                  <Tag tone="warning" icon="warning">
                    overlaps {w.overlapsWith.join(', ')}
                  </Tag>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatPlan() {
  const { stats, state, data } = useStore();
  const next = suggestStat(state.stats, state.level + 1, state.build, data.rules);
  return (
    <div className="statplan">
      <p className="statplan-next">
        Next point: <strong>{next ?? 'none (all capped)'}</strong>
        <span className="muted">
          {' '}
          ·{' '}
          {state.build.statGuide
            ? `following ${state.build.statGuide.name}`
            : `pattern ${state.build.statPattern.join(', ') || 'not set'}`}{' '}
          · cap {data.rules.statCap}{' '}
        </span>
        <AssumptionTag id="stat-cap" />
      </p>
      <ul className="statbars">
        {stats.map((row) => {
          const pct = Math.min(100, (row.value / row.cap) * 100);
          const targetPct =
            row.target === null ? null : Math.min(100, (row.target / row.cap) * 100);
          return (
            <li key={row.stat} className={`statbar${row.reached ? ' is-reached' : ''}`}>
              <span className="statbar-name">{row.stat}</span>
              <span className="statbar-track" aria-hidden="true">
                <span className="statbar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
                {targetPct !== null && (
                  <span className="statbar-target" style={{ left: `${targetPct}%` }} />
                )}
              </span>
              <span className="statbar-value num">
                {row.value}
                {row.target !== null && <span className="muted"> / {row.target}</span>}
              </span>
              <span className="statbar-when muted">
                {row.target === null
                  ? 'no target'
                  : row.reached
                    ? 'target reached'
                    : row.projectedLevel
                      ? `by level ${row.projectedLevel}`
                      : 'not by level 99'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const OBTAIN_STATUS = {
  owned: { label: 'owned', tone: 'success' },
  now: { label: 'get now', tone: 'accent' },
  later: { label: 'later', tone: 'neutral' },
} as const;

/** How many Magatama the player owns, out of every one in magatama.json. */
export function ownedCount(state: PlayerState, data: GameData): string {
  const owned = data.magatama.filter((m) => Object.hasOwn(state.magatama, m.name)).length;
  return `${owned}/${data.magatama.length} owned`;
}

/** Every Magatama in the order the story reaches it, with where and how to get it. */
export function ObtainList() {
  const { state, data, update } = useStore();
  const rows = obtainOrder(state, data);
  return (
    <ol className="obtain-list">
      {rows.map((row, i) => {
        const status = OBTAIN_STATUS[row.status];
        const where = row.milestones.map((m) => m.title).join(' or ');
        return (
          <li key={row.name} className={`obtain obtain-${row.status}`}>
            <span className="obtain-num num">{i + 1}</span>
            <div className="obtain-main">
              <span className="magatama-name">
                {row.name}
                <AlignmentTag name={row.name} />
                <Tag tone={status.tone}>{status.label}</Tag>
                {row.targets.map((skill) => (
                  <Tag key={skill} tone="primary">
                    target: {skill}
                  </Tag>
                ))}
              </span>
              {row.how === 'start' ? (
                <span className="obtain-where muted">From the start</span>
              ) : (
                where && (
                  <span className="obtain-where muted">
                    {row.how === 'reward' ? 'Reward from' : 'During'} {where}
                  </span>
                )
              )}
              <MagatamaSource name={row.name} />
            </div>
            {row.status === 'now' && (
              <Button
                small
                icon="plus"
                onClick={() =>
                  update(
                    (s) => addMagatama(s, row.name),
                    `${row.name} added. The schedule now includes it.`,
                  )
                }
              >
                Got it
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Owned Magatama with their next skill; progress is editable for missed logs. */
export function MagatamaList() {
  const { state, data, update } = useStore();
  const [adding, setAdding] = useState(false);
  const owned = ownedInDataOrder(state, data);
  const newLevel = state.level + 1;
  return (
    <>
      <ul className="magatama-list">
        {owned.map((name) => {
          const m = data.magatamaByName.get(name);
          const progress = state.magatama[name];
          const pending = nextPending(state, data, name);
          const ready = offerAt(state, data, name, newLevel) !== null;
          let when = 'all skills passed';
          if (pending) {
            if (pending.skill.unlock && !state.labyrinthComplete)
              when = `needs ${unlockLabel(pending.skill.unlock)}`;
            else if (ready) when = 'ready at next level-up';
            else when = `level ${levelRequirement(pending.skill)}`;
          }
          return (
            <li key={name} className="magatama">
              <div className="magatama-main">
                <span className="magatama-name">
                  {name}
                  <AlignmentTag name={name} />
                  {state.equipped === name && <Tag tone="accent">equipped</Tag>}
                  {!m && <Tag tone="danger">not in magatama.json</Tag>}
                </span>
                <span className="magatama-next">
                  {pending ? (
                    <>
                      Next: <strong>{pending.skill.name}</strong>
                      {state.build.target.includes(pending.skill.name) && (
                        <Tag tone="primary">target</Tag>
                      )}
                    </>
                  ) : (
                    'Nothing left to learn'
                  )}
                  <span className={ready ? 'ready' : 'muted'}> · {when}</span>
                </span>
              </div>
              {m && progress && (
                <select
                  className="magatama-progress"
                  aria-label={`${name}: next pending skill`}
                  value={progress.nextIndex}
                  onChange={(e) =>
                    update(
                      (s) => ({
                        ...s,
                        magatama: {
                          ...s.magatama,
                          [name]: { ...progress, nextIndex: Number(e.target.value) },
                        },
                      }),
                      `${name} progress updated.`,
                    )
                  }
                >
                  {m.skills.map((skill, i) => (
                    <option key={skill.name} value={i}>
                      Next: {skill.name} (Lv {skill.level ?? '—'})
                    </option>
                  ))}
                  <option value={m.skills.length}>All skills passed</option>
                </select>
              )}
            </li>
          );
        })}
      </ul>
      <Button icon="plus" onClick={() => setAdding(true)}>
        Add Magatama
      </Button>
      <AddMagatamaDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function AddMagatamaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, data, update } = useStore();
  const available = data.magatama.filter((m) => !state.magatama[m.name]);
  const [name, setName] = useState('');
  const [index, setIndex] = useState(0);
  const chosen = data.magatamaByName.get(name) ?? available[0];
  const add = () => {
    if (!chosen) return;
    update(
      (s) => addMagatama(s, chosen.name, index),
      `${chosen.name} added. The schedule now includes it.`,
    );
    setName('');
    setIndex(0);
    onClose();
  };
  return (
    <Dialog
      open={open}
      title="Add Magatama"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={add} disabled={!chosen}>
            Add {chosen?.name}
          </Button>
        </>
      }
    >
      {available.length === 0 ? (
        <Empty>You own every Magatama in magatama.json.</Empty>
      ) : (
        <div className="form-stack">
          <Field label="Magatama">
            <select
              value={chosen?.name ?? ''}
              onChange={(e) => {
                setName(e.target.value);
                setIndex(0);
              }}
            >
              {available.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {chosen && <MagatamaSource name={chosen.name} withAlignment />}
          {chosen && (
            <Field
              label="Progress"
              hint="Pick the next skill it will teach. Usually the first one for a new Magatama."
            >
              <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                {chosen.skills.map((skill, i) => (
                  <option key={skill.name} value={i}>
                    Next: {skill.name} (Lv {skill.level ?? '—'})
                    {state.build.target.includes(skill.name) ? ' · target' : ''}
                  </option>
                ))}
                <option value={chosen.skills.length}>All skills passed</option>
              </select>
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** The one Level up entry point: a tab-bar button on phones, a rail button with Undo on desktop. */
export function LevelUpActions({ layout }: { layout: 'rail' | 'tab' }) {
  const { state, data } = useStore();
  const [open, setOpen] = useState(false);
  const atMax = state.level >= data.rules.maxLevel;
  return (
    <>
      {layout === 'tab' ? (
        <button
          type="button"
          className="tab-levelup"
          onClick={() => setOpen(true)}
          disabled={atMax}
        >
          <Icon name="up" size={20} />
          <span>Level up</span>
        </button>
      ) : (
        <div className="levelup-actions">
          <Button variant="primary" icon="up" onClick={() => setOpen(true)} disabled={atMax}>
            {atMax ? 'Max level' : `Level up to ${state.level + 1}`}
          </Button>
          <UndoLevelUpButton />
        </div>
      )}
      <LevelUpDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function UndoLevelUpButton() {
  const { save, state, undoLevelUp } = useStore();
  if (save.undo.length === 0) return null;
  return (
    <Button variant="ghost" icon="undo" onClick={undoLevelUp}>
      Undo level {state.level}
    </Button>
  );
}

export function RemoveMagatamaButton({ name }: { name: string }) {
  const { update } = useStore();
  return (
    <IconButton
      icon="trash"
      label={`Remove ${name}`}
      onClick={() =>
        update((s) => {
          const { [name]: _removed, ...rest } = s.magatama;
          return { ...s, magatama: rest, equipped: s.equipped === name ? null : s.equipped };
        }, `${name} removed.`)
      }
    />
  );
}

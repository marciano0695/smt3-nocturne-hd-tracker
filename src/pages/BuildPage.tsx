import { useDeferredValue, useState } from 'react';
import { AlignmentTag, MagatamaSource } from '../components/demifiend';
import { ReorderList } from '../components/ReorderList';
import {
  AccordionGroup,
  Button,
  Empty,
  Field,
  PageHeader,
  Section,
  Tag,
  type Tone,
} from '../components/ui';
import { unlockLabel } from '../game/data';
import { guideStatsAt } from '../game/statPlan';
import { statGuides } from '../gameData';
import { STATS, type Build, type Stat, type TargetInfo } from '../game/types';
import { useStore } from '../state/store';

function statusText(info: TargetInfo): { tone: Tone; text: string } {
  const s = info.status;
  switch (s.kind) {
    case 'learned':
      return { tone: 'success', text: 'Learned' };
    case 'scheduled':
      return { tone: 'accent', text: `Scheduled at level ${s.level}` };
    case 'waiting':
      return {
        tone: 'neutral',
        text: s.window ? `Waiting for Magatama · ${s.window.label}` : 'Waiting for Magatama',
      };
    case 'blocked':
      return { tone: 'warning', text: `Blocked by ${unlockLabel(s.gate)}` };
    case 'missed':
      return { tone: 'danger', text: 'Missed: declined or passed' };
    case 'unknown':
      return { tone: 'danger', text: 'Not in magatama.json' };
    case 'unscheduled':
      return { tone: 'warning', text: 'Not scheduled by level 99' };
  }
}

function useBuild(): [Build, (patch: Partial<Build>) => void] {
  const { state, update } = useStore();
  return [state.build, (patch) => update((s) => ({ ...s, build: { ...s.build, ...patch } }))];
}

function Targets() {
  const { targets, data } = useStore();
  const [build, setBuild] = useBuild();
  return (
    <>
      <p className="muted">
        <span className="num">{build.target.length}</span> of {data.rules.maxSkills} target skills
        chosen.
      </p>
      {targets.length === 0 ? (
        <Empty>No target skills yet. Pick up to {data.rules.maxSkills} from the list below.</Empty>
      ) : (
        <ul className="targets">
          {targets.map((t) => {
            const { tone, text } = statusText(t);
            return (
              <li key={t.skill} className="target">
                <div className="target-main">
                  <span className="target-name">{t.skill}</span>
                  <Tag tone={tone}>{text}</Tag>
                </div>
                <dl className="target-facts">
                  <div>
                    <dt>Magatama</dt>
                    <dd>
                      {t.magatama ?? '—'}{' '}
                      {t.magatama && (
                        <span className="muted">({t.owned ? 'owned' : 'not owned'})</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Level-ups left</dt>
                    <dd className="num">{t.stepsRemaining ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Earliest level</dt>
                    <dd className="num">{t.earliestLevel ?? '—'}</dd>
                  </div>
                </dl>
                {t.status.kind === 'waiting' && t.magatama && (
                  <p className="target-source">
                    <span className="muted">Get {t.magatama}: </span>
                    <MagatamaSource name={t.magatama} />
                  </p>
                )}
                <Button
                  small
                  variant="ghost"
                  icon="close"
                  onClick={() => setBuild({ target: build.target.filter((x) => x !== t.skill) })}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function SkillPicker() {
  const { data, state } = useStore();
  const [build, setBuild] = useBuild();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const full = build.target.length >= data.rules.maxSkills;
  const toggle = (list: 'target' | 'wishlist', skill: string) =>
    setBuild({
      [list]: build[list].includes(skill)
        ? build[list].filter((x) => x !== skill)
        : [...build[list], skill],
    });
  const groups = data.magatama
    .map((m) => ({
      name: m.name,
      skills: m.skills.filter(
        (s) =>
          !deferred ||
          s.name.toLowerCase().includes(deferred) ||
          m.name.toLowerCase().includes(deferred) ||
          s.type.toLowerCase().includes(deferred) ||
          s.effect.toLowerCase().includes(deferred),
      ),
    }))
    .filter((g) => g.skills.length > 0);
  return (
    <div className="picker">
      <Field label="Search skills">
        <input
          type="search"
          value={query}
          placeholder="Name, Magatama, type or effect"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {groups.length === 0 && <Empty>No skill matches "{query}".</Empty>}
      {groups.map((g) => {
        const body = (
          <>
            {!state.magatama[g.name] && (
              <p className="picker-source">
                <MagatamaSource name={g.name} />
              </p>
            )}
            <ul>
              {g.skills.map((s) => {
                const isTarget = build.target.includes(s.name);
                const isWish = build.wishlist.includes(s.name);
                return (
                  <li key={s.name} className={`picker-skill${isTarget ? ' is-target' : ''}`}>
                    <div className="picker-info">
                      <span className="picker-name">{s.name}</span>
                      <span className="picker-meta">
                        <span className="num">Lv {s.level ?? '—'}</span> · {s.cost} · {s.type}
                        {s.unlock && <> · needs {unlockLabel(s.unlock)}</>}
                      </span>
                      <span className="picker-effect">{s.effect}</span>
                    </div>
                    <div className="picker-actions">
                      <Button
                        small
                        variant={isTarget ? 'primary' : 'secondary'}
                        aria-pressed={isTarget}
                        disabled={!isTarget && full}
                        onClick={() => toggle('target', s.name)}
                      >
                        {isTarget ? 'Target ✓' : 'Target'}
                      </Button>
                      <Button
                        small
                        variant={isWish ? 'primary' : 'ghost'}
                        aria-pressed={isWish}
                        onClick={() => toggle('wishlist', s.name)}
                      >
                        {isWish ? 'Wishlist ✓' : 'Wishlist'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        );
        const targets = g.skills.filter((s) => build.target.includes(s.name)).length;
        // While searching, every match stays visible; otherwise each Magatama is a closed accordion.
        return deferred ? (
          <section key={g.name} className="picker-group" aria-label={g.name}>
            <h3>
              {g.name} <AlignmentTag name={g.name} />
              {state.magatama[g.name] && <Tag tone="accent">owned</Tag>}
            </h3>
            {body}
          </section>
        ) : (
          <AccordionGroup
            key={g.name}
            id={`picker:${g.name}`}
            defaultOpen={false}
            title={
              <>
                {g.name} <AlignmentTag name={g.name} />
                {state.magatama[g.name] && <Tag tone="accent">owned</Tag>}
              </>
            }
            meta={
              targets > 0
                ? `${targets} target${targets === 1 ? '' : 's'}`
                : `${g.skills.length} skills`
            }
          >
            <div className="picker-group">{body}</div>
          </AccordionGroup>
        );
      })}
    </div>
  );
}

function Priorities() {
  const { state } = useStore();
  const [build, setBuild] = useBuild();
  const addable = state.skills.filter(
    (s) => !build.target.includes(s) && !build.interimKeep.includes(s),
  );
  return (
    <div className="priorities">
      <div>
        <h3>Keep until replaced</h3>
        <p className="muted">
          Highest priority first. When a target needs a slot, skills not listed go first, then this
          list from the bottom.
        </p>
        {build.interimKeep.length === 0 ? (
          <Empty>Nothing kept yet.</Empty>
        ) : (
          <ReorderList
            label="Keep until replaced"
            items={build.interimKeep}
            onChange={(interimKeep) => setBuild({ interimKeep })}
          />
        )}
        {addable.length > 0 && (
          <div className="chip-row">
            <span className="muted">Add a current skill:</span>
            {addable.map((s) => (
              <Button
                key={s}
                small
                icon="plus"
                onClick={() => setBuild({ interimKeep: [...build.interimKeep, s] })}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3>Wishlist</h3>
        <p className="muted">
          Optional skills to pick up on free levels. Add them from the skill list.
        </p>
        {build.wishlist.length === 0 ? (
          <Empty>The wishlist is empty.</Empty>
        ) : (
          <ReorderList
            label="Wishlist"
            items={build.wishlist}
            onChange={(wishlist) => setBuild({ wishlist })}
          />
        )}
      </div>
    </div>
  );
}

function GuideStatus() {
  const { state, data } = useStore();
  const ideal = guideStatsAt(state.build, data.rules, state.level);
  if (!ideal) return null;
  const rows = STATS.filter(
    (s) =>
      ideal[s] !== state.stats[s] ||
      state.build.statGuide?.phases.some((p) => p.pattern.includes(s)),
  );
  return (
    <table className="plan guide-status">
      <caption className="muted">You compared with the guide at level {state.level}</caption>
      <thead>
        <tr>
          <th scope="col">Stat</th>
          <th scope="col">You</th>
          <th scope="col">Guide</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const gap = state.stats[s] - ideal[s];
          return (
            <tr key={s}>
              <td data-label="Stat">{s}</td>
              <td className="num" data-label="You">
                {state.stats[s]}
              </td>
              <td className="num" data-label="Guide">
                {ideal[s]}
              </td>
              <td data-label="Status">
                {gap === 0 ? (
                  <Tag tone="success">on track</Tag>
                ) : gap < 0 ? (
                  <Tag tone="warning">{-gap} behind</Tag>
                ) : (
                  <Tag tone="accent">{gap} ahead</Tag>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Allocation() {
  const { data } = useStore();
  const [build, setBuild] = useBuild();
  const guide = build.statGuide;
  const pickGuide = (id: string) => {
    const preset = statGuides.find((g) => g.id === id);
    if (preset) setBuild({ statGuide: structuredClone(preset) });
  };
  return (
    <div>
      <h3>How points are allocated</h3>
      <div className="filters" role="group" aria-label="Stat allocation">
        <button
          type="button"
          className="filter"
          aria-pressed={guide !== undefined}
          disabled={statGuides.length === 0}
          onClick={() => !guide && statGuides[0] && pickGuide(statGuides[0].id)}
        >
          Follow a guide
        </button>
        <button
          type="button"
          className="filter"
          aria-pressed={guide === undefined}
          onClick={() => setBuild({ statGuide: undefined })}
        >
          Repeating pattern
        </button>
      </div>
      {guide ? (
        <div className="form-stack guide">
          <p className="muted">
            Each level-up's point goes to the stat furthest behind the guide, so your current values
            steer the plan. Stats ahead of the guide wait until the others catch up. Targets and the
            cap still apply.
          </p>
          {statGuides.length > 1 && (
            <Field label="Guide">
              <select value={guide.id} onChange={(e) => pickGuide(e.target.value)}>
                {statGuides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p>
            <strong>{guide.name}</strong>
            {guide.source && <span className="muted"> · {guide.source}</span>}
          </p>
          <ol className="guide-phases">
            {guide.phases.map((phase, i) => {
              const from =
                i === 0 ? 2 : (guide.phases[i - 1]?.untilLevel ?? data.rules.maxLevel) + 1;
              return (
                <li key={i}>
                  <span className="num">
                    Levels {from}–{phase.untilLevel === null ? data.rules.maxLevel : ''}
                  </span>
                  {phase.untilLevel !== null && (
                    <input
                      type="number"
                      className="guide-until"
                      aria-label={`Phase ${i + 1} ends at level`}
                      min={from}
                      max={data.rules.maxLevel}
                      value={phase.untilLevel}
                      onChange={(e) => {
                        const untilLevel = Math.max(
                          from,
                          Math.min(data.rules.maxLevel, Math.round(Number(e.target.value)) || from),
                        );
                        setBuild({
                          statGuide: {
                            ...guide,
                            phases: guide.phases.map((p, j) =>
                              j === i ? { ...p, untilLevel } : p,
                            ),
                          },
                        });
                      }}
                    />
                  )}
                  <span>: {phase.pattern.join(', ')}</span>
                </li>
              );
            })}
          </ol>
          <GuideStatus />
          <p className="muted">
            Phase patterns are edited in data/stat-guides.json; choose the guide again to reload it.
          </p>
        </div>
      ) : (
        <>
          <p className="muted">Repeats in order, skipping stats that reached their target.</p>
          {build.statPattern.length === 0 ? (
            <Empty>No pattern: points go to the stat furthest from its target.</Empty>
          ) : (
            <ReorderList
              label="Stat pattern"
              items={build.statPattern}
              onChange={(items) => setBuild({ statPattern: items as Stat[] })}
            />
          )}
          <div className="chip-row">
            <span className="muted">Add:</span>
            {STATS.map((s) => (
              <Button
                key={s}
                small
                icon="plus"
                onClick={() => setBuild({ statPattern: [...build.statPattern, s] })}
              >
                {s}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stats() {
  const { data } = useStore();
  const [build, setBuild] = useBuild();
  return (
    <div className="priorities">
      <Allocation />
      <div>
        <h3>Stat targets</h3>
        <p className="muted">Leave empty for no target. Cap {data.rules.statCap}.</p>
        <div className="stat-targets">
          {STATS.map((s) => (
            <Field key={s} label={s}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={data.rules.statCap}
                value={build.statTargets[s] ?? ''}
                onChange={(e) => {
                  const next = { ...build.statTargets };
                  const v =
                    e.target.value === ''
                      ? null
                      : Math.max(
                          0,
                          Math.min(data.rules.statCap, Math.round(Number(e.target.value))),
                        );
                  if (v === null || Number.isNaN(v)) delete next[s];
                  else next[s] = v;
                  setBuild({ statTargets: next });
                }}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BuildPage() {
  return (
    <div className="page">
      <PageHeader title="Build planner" />
      <Section
        title="Target build"
        description="The final 8 skills. They drive the whole schedule."
      >
        <Targets />
      </Section>
      <Section title="Priorities">
        <Priorities />
      </Section>
      <Section title="Stats">
        <Stats />
      </Section>
      <Section title="All skills" description="Grouped by Magatama, in learning order.">
        <SkillPicker />
      </Section>
    </div>
  );
}

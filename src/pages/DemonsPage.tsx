import { useDeferredValue, useId, useState, type FormEvent } from 'react';
import {
  AccordionGroup,
  AssumptionTag,
  Button,
  Empty,
  Field,
  IconButton,
  NumberInput,
  PageHeader,
  Section,
  Tag,
  Unverified,
  type Tone,
} from '../components/ui';
import {
  addDemon,
  evolutionFor,
  evolutionStatus,
  evolveDemon,
  minDemiFiendLevel,
  removeDemon,
  sortDemons,
  updateDemon,
  type EvolutionStatus,
} from '../game/evolution';
import type { Evolution, EvolutionGroup, OwnedDemon } from '../game/types';
import { evolutionGuide as guide } from '../gameData';
import { useStore } from '../state/store';

const GROUPS: { id: EvolutionGroup; title: string }[] = [
  { id: 'regular', title: 'Regular' },
  { id: 'neutral', title: 'Neutral' },
  { id: 'story', title: 'Story' },
];

function statusTag(status: EvolutionStatus): { label: string; tone: Tone } {
  switch (status.kind) {
    case 'ready':
      return { label: 'Ready to evolve', tone: 'success' };
    case 'waiting-skills':
      return { label: 'Learn its remaining skills', tone: 'accent' };
    case 'waiting-level':
      return {
        label: `${status.levelsToGo} level${status.levelsToGo === 1 ? '' : 's'} to go`,
        tone: 'neutral',
      };
    case 'none':
      return { label: "Doesn't evolve", tone: 'neutral' };
  }
}

function EvolutionVerified({ evolution }: { evolution: Evolution }) {
  const { isVerified, confirmAssumption } = useStore();
  const id = `evolution:${evolution.from}`;
  if (evolution.verified || isVerified(id)) return null;
  return (
    <Unverified
      text={`${evolution.from} evolves into ${evolution.to} (Lv ${evolution.toLevel}): from the Samurai Gamers and Game8 guides.`}
      onConfirm={() => confirmAssumption(id, true)}
    />
  );
}

function DemonCard({ demon }: { demon: OwnedDemon }) {
  const { state, data, update } = useStore();
  const evolution = evolutionFor(demon.name, guide);
  const status = evolutionStatus(demon, state.level, guide);
  const tag = statusTag(status);
  return (
    <li className={`demon is-${status.kind}`}>
      <div className="demon-head">
        <span className="demon-name">{demon.name}</span>
        <Tag tone={tag.tone}>{tag.label}</Tag>
        {evolution && <EvolutionVerified evolution={evolution} />}
      </div>
      {evolution ? (
        <p className="demon-into">
          Evolves into <strong>{evolution.to}</strong> (Lv{' '}
          <span className="num">{evolution.toLevel}</span>) · needs Demi-fiend Lv{' '}
          <span className="num">{minDemiFiendLevel(evolution, guide)}</span>
          {evolution.condition && <span className="demon-condition"> · {evolution.condition}</span>}
        </p>
      ) : (
        <p className="demon-into muted">Not in data/evolutions.json.</p>
      )}
      <div className="demon-controls">
        <span className="demon-level">
          <span aria-hidden="true">Lv</span>
          <NumberInput
            min={1}
            max={data.rules.maxLevel}
            value={demon.level}
            aria-label={`${demon.name}: level`}
            onValueChange={(v) => {
              if (v === null) return;
              const level = Math.min(data.rules.maxLevel, Math.max(1, Math.round(v)));
              update((s) => updateDemon(s, demon.id, { level }));
            }}
          />
        </span>
        {evolution && (
          <label className="switch-row demon-skills">
            <input
              type="checkbox"
              checked={demon.skillsDone}
              onChange={(e) =>
                update((s) => updateDemon(s, demon.id, { skillsDone: e.target.checked }))
              }
            />
            <span>All skills learned</span>
          </label>
        )}
        <span className="demon-actions">
          {evolution && status.kind === 'ready' && (
            <Button
              small
              variant="primary"
              icon="up"
              onClick={() =>
                update(
                  (s) => evolveDemon(s, demon.id, guide),
                  `${demon.name} evolved into ${evolution.to}.`,
                )
              }
            >
              Evolve
            </Button>
          )}
          <IconButton
            icon="trash"
            label={`Remove ${demon.name}`}
            onClick={() => update((s) => removeDemon(s, demon.id), `${demon.name} removed.`)}
          />
        </span>
      </div>
    </li>
  );
}

// Every name the guide knows, for the add form's suggestions.
const DEMON_NAMES = [...new Set(guide.evolutions.flatMap((e) => [e.from, e.to]))].sort();

function AddDemonForm() {
  const { update, data } = useStore();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<number | null>(1);
  const listId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean === '') return;
    const lvl = Math.min(data.rules.maxLevel, Math.max(1, Math.round(level ?? 1)));
    update((s) => addDemon(s, clean, lvl), `${clean} added.`);
    setName('');
    setLevel(1);
  };
  return (
    <form className="demon-add" onSubmit={submit}>
      <Field label="Demon">
        <input
          list={listId}
          value={name}
          placeholder="e.g. Pixie"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id={listId}>
          {DEMON_NAMES.map((n) => (
            <option key={n} value={n} aria-label={n} />
          ))}
        </datalist>
      </Field>
      <Field label="Level">
        <NumberInput min={1} max={data.rules.maxLevel} value={level} onValueChange={setLevel} />
      </Field>
      <Button type="submit" icon="plus" disabled={name.trim() === ''}>
        Add demon
      </Button>
    </form>
  );
}

function MyDemons() {
  const { state } = useStore();
  const demons = sortDemons(state.demons ?? [], state.level, guide);
  return (
    <>
      {demons.length === 0 ? (
        <Empty>
          No demons tracked yet. Add the ones in your party to see when they can evolve.
        </Empty>
      ) : (
        <ul className="demons">
          {demons.map((d) => (
            <DemonCard key={d.id} demon={d} />
          ))}
        </ul>
      )}
      <AddDemonForm />
    </>
  );
}

function EvolutionRow({ evolution }: { evolution: Evolution }) {
  const { state } = useStore();
  const need = minDemiFiendLevel(evolution, guide);
  return (
    <li className="evolution">
      <div className="evolution-head">
        <span className="evolution-names">
          {evolution.from} <span className="muted">{evolution.fromRace}</span>
          <span className="evolution-arrow" aria-label="evolves into">
            →
          </span>
          {evolution.to} <span className="muted">{evolution.toRace}</span>
        </span>
        <span className="milestone-tags">
          <Tag>
            Lv <span className="num">{evolution.toLevel}</span>
          </Tag>
          <Tag tone={state.level >= need ? 'success' : 'neutral'}>
            Demi-fiend Lv <span className="num">{need}</span>
          </Tag>
          <EvolutionVerified evolution={evolution} />
        </span>
      </div>
      {evolution.condition && <p className="evolution-note">{evolution.condition}</p>}
      {evolution.notes && <p className="evolution-note muted">{evolution.notes}</p>}
    </li>
  );
}

function EvolutionList() {
  const { state } = useStore();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query).trim().toLowerCase();
  const matches = guide.evolutions.filter((e) =>
    [e.from, e.fromRace, e.to, e.toRace].some((v) => v.toLowerCase().includes(q)),
  );
  return (
    <div className="evolutions">
      <Field label="Search demons">
        <input
          type="search"
          value={query}
          placeholder="Demon or race"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {matches.length === 0 && <Empty>No demon matches "{query}".</Empty>}
      <div className="groups">
        {GROUPS.map((g) => {
          const rows = matches.filter((e) => e.group === g.id);
          if (rows.length === 0) return null;
          const open = rows.filter((e) => state.level >= minDemiFiendLevel(e, guide)).length;
          return (
            <AccordionGroup
              key={g.id}
              id={`evolutions:${g.id}`}
              title={g.title}
              meta={`${rows.length} · ${open} open at your level`}
              defaultOpen={g.id !== 'story'}
            >
              <ul className="evolution-list">
                {rows.map((e) => (
                  <EvolutionRow key={e.from} evolution={e} />
                ))}
              </ul>
            </AccordionGroup>
          );
        })}
      </div>
      {guide.sources.length > 0 && (
        <ul className="source evolution-sources">
          {guide.sources.map((s) => (
            <li key={s}>Source: {s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DemonsPage() {
  return (
    <div className="page">
      <PageHeader title="Demons" />
      <Section
        title="My demons"
        description={
          <>
            A demon evolves on a level-up once it has learned all its skills{' '}
            <AssumptionTag id="evolution-skills-first" /> and the Demi-fiend's level is at least the
            evolved form's level minus {guide.demiFiendLevelGap}{' '}
            <AssumptionTag id="evolution-level-gap" />.
          </>
        }
      >
        <MyDemons />
      </Section>
      <Section
        title="Evolution list"
        description="Every demon that evolves, with the level of its evolved form."
      >
        <EvolutionList />
      </Section>
    </div>
  );
}

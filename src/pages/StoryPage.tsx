import { useState } from 'react';
import { EndingsTracker, Flowchart, NextMove } from '../components/story';
import {
  AccordionGroup,
  Button,
  ConfirmDialog,
  Empty,
  Field,
  IconButton,
  NotesToggle,
  PageHeader,
  Section,
  Tag,
  Unverified,
} from '../components/ui';
import {
  addMilestone,
  allKalpasDone,
  lockedSlot,
  moveMilestone,
  nextFreeSlot,
  pendingReward,
  removeMilestone,
  removeSaveSlot,
  setMilestoneAvailable,
  setMilestoneDone,
  updateMilestone,
  upsertSaveSlot,
} from '../game/story';
import type { Milestone, MilestoneKind, SaveSlot } from '../game/types';
import { useStore } from '../state/store';

const KINDS: { kind: MilestoneKind; label: string }[] = [
  { kind: 'story', label: 'Story' },
  { kind: 'labyrinth', label: 'Labyrinth' },
  { kind: 'fiend', label: 'Fiend' },
  { kind: 'side', label: 'Side' },
  { kind: 'hardsave', label: 'Hard save' },
  { kind: 'ending', label: 'Ending' },
];
const kindLabel = (k: MilestoneKind) => KINDS.find((x) => x.kind === k)?.label ?? k;

function LabStep({ m }: { m: Milestone }) {
  const { update } = useStore();
  const [showNotes, setShowNotes] = useState(false);
  const title = m.title.replace(/^Labyrinth of Amala: |^Fiend: /, '');
  return (
    <li className={`lab-step lab-${m.kind}${m.done ? ' is-done' : ''}`}>
      <div className="lab-step-main">
        <label>
          <input
            type="checkbox"
            checked={m.done}
            onChange={(e) => update((s) => setMilestoneDone(s, m.id, e.target.checked))}
          />
          <span>{title}</span>
        </label>
        {m.notes && (
          <NotesToggle open={showNotes} onToggle={() => setShowNotes(!showNotes)} label={title} />
        )}
        <Tag tone={m.kind === 'labyrinth' ? 'primary' : 'neutral'}>
          {m.kind === 'labyrinth' ? 'Kalpa' : 'Fiend'}
        </Tag>
        {m.recommendedLevel !== undefined && <Tag>Lv {m.recommendedLevel}</Tag>}
        {m.available && !m.done && <Tag tone="accent">available</Tag>}
        {!m.verified && (
          <Unverified
            text={`${m.title}: ${m.notes ?? 'unconfirmed for the HD Remaster.'} (The Fiend list is unverified for the HD Remaster.)`}
            onConfirm={() => update((s) => updateMilestone(s, m.id, { verified: true }))}
          />
        )}
      </div>
      {m.notes && showNotes && <p className="lab-step-notes">{m.notes}</p>}
    </li>
  );
}

const doneCount = (items: Milestone[]) =>
  `${items.filter((m) => m.done).length}/${items.length} done`;

function Labyrinth() {
  const { state, update } = useStore();
  // Fiends and Kalpas interleave: each Kalpa opens with Candelabra from the Fiends before it.
  const steps = state.story.milestones.filter((m) => m.kind === 'labyrinth' || m.kind === 'fiend');
  const prompt = allKalpasDone(state.story) && !state.labyrinthComplete;
  // One group per Kalpa, holding the Fiends whose Candelabra open it.
  const groups: { id: string; title: string; items: Milestone[] }[] = [];
  let pending: Milestone[] = [];
  for (const m of steps) {
    pending.push(m);
    if (m.kind === 'labyrinth') {
      groups.push({
        id: m.id,
        title: m.title.replace(/^Labyrinth of Amala: /, ''),
        items: pending,
      });
      pending = [];
    }
  }
  if (pending.length > 0) groups.push({ id: 'more', title: 'More', items: pending });
  const nextId = steps.find((m) => !m.done)?.id;
  return (
    <div className="labyrinth">
      <label className="switch-row">
        <input
          type="checkbox"
          aria-label="Labyrinth complete"
          checked={state.labyrinthComplete}
          onChange={(e) => update((s) => ({ ...s, labyrinthComplete: e.target.checked }))}
        />
        <span>
          <strong>Labyrinth complete</strong>
          <span className="muted"> · needed for the True Demon ending, unlocks Pierce</span>
        </span>
      </label>
      {prompt && (
        <p className="form-warning">
          Every Kalpa is checked off. If you finished the Labyrinth, mark it complete above: the
          schedule then plans Pierce.
        </p>
      )}
      {groups.length === 0 ? (
        <Empty>No Labyrinth or Fiend milestones.</Empty>
      ) : (
        <div className="groups">
          {groups.map((g) => {
            const current = g.items.some((m) => m.id === nextId);
            return (
              <AccordionGroup
                key={g.id}
                id={`lab:${g.id}`}
                title={g.title}
                meta={doneCount(g.items)}
                defaultOpen={current}
                current={current}
              >
                <ul className="checklist">
                  {g.items.map((m) => (
                    <LabStep key={m.id} m={m} />
                  ))}
                </ul>
              </AccordionGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MilestoneRow({ m, index, count }: { m: Milestone; index: number; count: number }) {
  const { state, update } = useStore();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  return (
    <li className={`milestone${m.done ? ' is-done' : ''}`}>
      <div className="milestone-main">
        <label className="milestone-check">
          <input
            type="checkbox"
            checked={m.done}
            aria-label={`${m.title} done`}
            onChange={(e) => {
              const reward = e.target.checked ? pendingReward(state, m) : null;
              update(
                (s) => setMilestoneDone(s, m.id, e.target.checked),
                reward
                  ? `${reward} added to your Magatama. The schedule now includes it.`
                  : undefined,
              );
            }}
          />
          <span className="milestone-title">{m.title}</span>
        </label>
        {m.notes && !editing && (
          <NotesToggle open={showNotes} onToggle={() => setShowNotes(!showNotes)} label={m.title} />
        )}
        <span className="milestone-tags">
          <Tag
            tone={m.kind === 'hardsave' ? 'primary' : 'neutral'}
            icon={m.kind === 'hardsave' ? 'lock' : undefined}
          >
            {kindLabel(m.kind)}
          </Tag>
          {m.recommendedLevel !== undefined && <Tag>Lv {m.recommendedLevel}</Tag>}
          {m.magatama && (
            <Tag tone={state.magatama[m.magatama] ? 'success' : 'neutral'}>
              Reward: {m.magatama}
              {state.magatama[m.magatama] ? ' (owned)' : ''}
            </Tag>
          )}
          {!m.done && (m.available ? <Tag tone="accent">available</Tag> : null)}
          {!m.verified && (
            <Unverified
              text={`${m.title}: ${m.notes ?? 'this milestone is an assumption.'}`}
              onConfirm={() => update((s) => updateMilestone(s, m.id, { verified: true }))}
            />
          )}
        </span>
        <span className="milestone-actions">
          <IconButton
            icon="up"
            label={`Move ${m.title} up`}
            disabled={index === 0}
            onClick={() => update((s) => moveMilestone(s, m.id, index - 1))}
          />
          <IconButton
            icon="down"
            label={`Move ${m.title} down`}
            disabled={index === count - 1}
            onClick={() => update((s) => moveMilestone(s, m.id, index + 1))}
          />
          <IconButton icon="edit" label={`Edit ${m.title}`} onClick={() => setEditing(!editing)} />
          <IconButton icon="trash" label={`Delete ${m.title}`} onClick={() => setRemoving(true)} />
        </span>
      </div>
      {m.notes && !editing && showNotes && <p className="milestone-notes">{m.notes}</p>}
      {editing && <MilestoneForm initial={m} onDone={() => setEditing(false)} />}
      <ConfirmDialog
        open={removing}
        title="Delete milestone?"
        confirmLabel="Delete"
        danger
        onConfirm={() => update((s) => removeMilestone(s, m.id), `"${m.title}" deleted.`)}
        onClose={() => setRemoving(false)}
      >
        <p>
          "{m.title}" will be removed from the checklist. Anchors from story.json can be restored in
          Settings.
        </p>
      </ConfirmDialog>
    </li>
  );
}

function MilestoneForm({ initial, onDone }: { initial?: Milestone; onDone: () => void }) {
  const { update, state } = useStore();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<MilestoneKind>(initial?.kind ?? 'story');
  const [level, setLevel] = useState(initial?.recommendedLevel?.toString() ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [available, setAvailable] = useState(initial?.available ?? false);
  const [position, setPosition] = useState(state.story.milestones.length);
  const submit = () => {
    if (!title.trim()) return;
    const recommendedLevel = level === '' ? undefined : Math.max(1, Math.round(Number(level)));
    if (initial) {
      update((s) => {
        let next = updateMilestone(s, initial.id, {
          title: title.trim(),
          kind,
          notes: notes || undefined,
          recommendedLevel,
        });
        next = setMilestoneAvailable(next, initial.id, available);
        return next;
      }, 'Milestone updated.');
    } else {
      update(
        (s) =>
          addMilestone(
            s,
            { title, kind, notes: notes || undefined, recommendedLevel, available },
            position,
          ),
        `"${title.trim()}" added.`,
      );
      setTitle('');
      setNotes('');
      setLevel('');
    }
    onDone();
  };
  return (
    <form
      className="milestone-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Kind">
        <select value={kind} onChange={(e) => setKind(e.target.value as MilestoneKind)}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Recommended level" hint="Optional">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        />
      </Field>
      {!initial && (
        <Field label="Position">
          <select value={position} onChange={(e) => setPosition(Number(e.target.value))}>
            {state.story.milestones.map((m, i) => (
              <option key={m.id} value={i}>
                Before "{m.title}"
              </option>
            ))}
            <option value={state.story.milestones.length}>At the end</option>
          </select>
        </Field>
      )}
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
        />
        <span>Available now</span>
      </label>
      <div className="form-actions">
        <Button type="submit" variant="primary" icon={initial ? 'check' : 'plus'}>
          {initial ? 'Save' : 'Add milestone'}
        </Button>
        {initial && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type Filter = 'all' | 'open' | MilestoneKind;

type Row = { m: Milestone; index: number };

/** Splits the list into chapters: each story milestone starts one, and the endings get their own. */
function chapters(rows: Row[]): { id: string; title: string; items: Row[] }[] {
  const groups: { id: string; title: string; items: Row[] }[] = [];
  for (const row of rows) {
    const { m } = row;
    const startsGroup =
      m.kind === 'story' || (m.kind === 'ending' && groups.at(-1)?.id !== 'endings');
    if (startsGroup || groups.length === 0) {
      const isEndings = m.kind === 'ending';
      groups.push({
        id: isEndings ? 'endings' : startsGroup ? m.id : 'start',
        title: isEndings ? 'Endings' : startsGroup ? m.title : 'Before the story',
        items: [],
      });
    }
    groups.at(-1)?.items.push(row);
  }
  return groups;
}

function Milestones() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const list = state.story.milestones;
  const shown = list
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => filter === 'all' || (filter === 'open' ? !m.done : m.kind === filter));
  // Grouping by chapter only makes sense when every kind is listed.
  const grouped = filter === 'all' || filter === 'open';
  const nextId = list.find((m) => !m.done)?.id;
  return (
    <>
      <div className="filters" role="group" aria-label="Filter milestones">
        {(['all', 'open', ...KINDS.map((k) => k.kind)] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className="filter"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'open' ? 'Not done' : kindLabel(f)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty>Nothing here. Add your story progress below.</Empty>
      ) : grouped ? (
        <div className="groups">
          {chapters(shown).map((g) => {
            const current = g.items.some(({ m }) => m.id === nextId);
            return (
              <AccordionGroup
                key={g.id}
                id={`chapter:${g.id}`}
                title={g.title}
                meta={doneCount(g.items.map(({ m }) => m))}
                defaultOpen={current}
                current={current}
              >
                <ol className="milestones">
                  {g.items.map(({ m, index }) => (
                    <MilestoneRow key={m.id} m={m} index={index} count={list.length} />
                  ))}
                </ol>
              </AccordionGroup>
            );
          })}
        </div>
      ) : (
        <ol className="milestones">
          {shown.map(({ m, index }) => (
            <MilestoneRow key={m.id} m={m} index={index} count={list.length} />
          ))}
        </ol>
      )}
      {adding ? (
        <MilestoneForm onDone={() => setAdding(false)} />
      ) : (
        <Button icon="plus" onClick={() => setAdding(true)}>
          Add milestone
        </Button>
      )}
    </>
  );
}

function SaveSlots() {
  const { state, update } = useStore();
  const [slot, setSlot] = useState(() => nextFreeSlot(state.story));
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<SaveSlot | null>(null);
  const [unlocking, setUnlocking] = useState<SaveSlot | null>(null);
  const put = (entry: SaveSlot, force = false) =>
    update((s) => upsertSaveSlot(s, entry, { force }), `Slot ${entry.slot} saved.`);
  const tryPut = (entry: SaveSlot) => {
    const locked = lockedSlot(state.story, entry.slot);
    if (locked && locked.milestoneId !== entry.milestoneId) setPending(entry);
    else put(entry);
  };
  return (
    <>
      {state.story.saveSlots.length === 0 ? (
        <Empty>No save slots recorded. Hard saves are recorded from the "What next?" card.</Empty>
      ) : (
        <ul className="slots-list">
          {state.story.saveSlots.map((s) => (
            <li key={s.slot} className={s.locked ? 'is-locked' : ''}>
              <span className="num slots-list-num">Slot {s.slot}</span>
              <span className="slots-list-label">{s.label || 'Untitled'}</span>
              {s.locked ? (
                <Tag tone="primary" icon="lock">
                  locked
                </Tag>
              ) : (
                <Tag>free to reuse</Tag>
              )}
              <span className="milestone-actions">
                <Button
                  small
                  variant="ghost"
                  icon="lock"
                  onClick={() => (s.locked ? setUnlocking(s) : put({ ...s, locked: true }))}
                >
                  {s.locked ? 'Unlock' : 'Lock'}
                </Button>
                {!s.locked && (
                  <IconButton
                    icon="trash"
                    label={`Forget slot ${s.slot}`}
                    onClick={() => update((st) => removeSaveSlot(st, s.slot))}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="slot-form"
        onSubmit={(e) => {
          e.preventDefault();
          tryPut({ slot, label: label.trim(), locked: false });
          setLabel('');
        }}
      >
        <Field label="Slot">
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={slot}
            onChange={(e) => setSlot(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="What's in it">
          <input
            value={label}
            placeholder="e.g. Main save"
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Button type="submit" icon="save">
          Record slot
        </Button>
      </form>
      <ConfirmDialog
        open={pending !== null}
        title={`Reuse locked slot ${pending?.slot}?`}
        confirmLabel="Reuse it anyway"
        danger
        onConfirm={() => pending && put(pending, true)}
        onClose={() => setPending(null)}
      >
        <p>
          Slot {pending?.slot} holds the locked save "
          {lockedSlot(state.story, pending?.slot ?? -1)?.label}". Saving over it in the game loses
          that branch for good.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={unlocking !== null}
        title={`Unlock slot ${unlocking?.slot}?`}
        confirmLabel="Unlock"
        danger
        onConfirm={() => unlocking && put({ ...unlocking, locked: false }, true)}
        onClose={() => setUnlocking(null)}
      >
        <p>
          "{unlocking?.label}" will no longer be protected. Only unlock it if that save is no longer
          needed.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function StoryPage() {
  return (
    <div className="page">
      <PageHeader title="Story planner" />
      <NextMove />
      <Section title="Labyrinth of Amala">
        <Labyrinth />
      </Section>
      <Section
        title="Milestones"
        description="In play order. Add your own story progress; only the anchors below come with the app."
      >
        <Milestones />
      </Section>
      <Section
        title="Save slots"
        description="Hard-save slots are locked and must never be overwritten."
      >
        <SaveSlots />
      </Section>
      <Section title="Endings">
        <div className="endings-grid">
          <EndingsTracker />
          <Flowchart />
        </div>
      </Section>
    </div>
  );
}

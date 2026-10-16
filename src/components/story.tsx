import { useState } from 'react';
import { readySpots } from '../game/leveling';
import {
  endings,
  flowchart,
  lockedSlot,
  pendingReward,
  recordHardSave,
  setEndingSeen,
  setMilestoneDone,
  type FlowNode,
} from '../game/story';
import type { Recommendation } from '../game/types';
import { levelingGuide } from '../gameData';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { LEVELING_HREF } from './leveling';
import { Button, ConfirmDialog, Field, NumberInput, Unverified } from './ui';

const KIND_LABEL: Record<Recommendation['kind'], string> = {
  hardsave: 'Irreversible moment',
  labyrinth: 'Fiends and the Labyrinth',
  'level-up': 'Not yet',
  'tower-warning': 'Before the Tower',
  'side-quest': 'Side quest',
  story: 'Story',
  'all-done': 'Checklist',
};

/** "What next?": the first matching rule, its reason and the matching action. */
export function NextMove() {
  const { recommendation: r, state, update } = useStore();
  const milestone = state.story.milestones.find((m) => m.id === r.milestoneId);
  const alternative = state.story.milestones.find((m) => m.id === r.alternativeId);
  return (
    <article className={`next-move next-${r.kind}`} aria-live="polite">
      <p className="next-kind">{KIND_LABEL[r.kind]}</p>
      <h2 className="next-title">{r.title}</h2>
      <p className="next-reason">{r.reason}</p>
      {r.kind === 'level-up' && r.levelGap !== null && (
        <p className="next-gap num">
          {r.levelGap} level{r.levelGap === 1 ? '' : 's'} below the recommended level
        </p>
      )}
      {r.kind === 'level-up' && <GrindLink />}
      {milestone?.notes && r.kind !== 'hardsave' && <p className="next-notes">{milestone.notes}</p>}
      {r.kind === 'hardsave' && r.milestoneId && r.suggestedSlot !== null && (
        <HardSaveForm milestoneId={r.milestoneId} suggestedSlot={r.suggestedSlot} />
      )}
      {milestone && r.kind !== 'hardsave' && r.kind !== 'level-up' && (
        <div className="next-actions">
          <Button
            variant="secondary"
            icon="check"
            onClick={() =>
              update(
                (s) => setMilestoneDone(s, milestone.id, true),
                pendingReward(state, milestone)
                  ? `"${milestone.title}" done. ${milestone.magatama} added to your Magatama.`
                  : `"${milestone.title}" marked done.`,
              )
            }
          >
            Mark done
          </Button>
          {alternative && <span className="muted">Or the story: {alternative.title}</span>}
        </div>
      )}
      {r.kind === 'tower-warning' && (
        <a className="next-link" href="#/story">
          Open the Labyrinth checklist
        </a>
      )}
    </article>
  );
}

function GrindLink() {
  const { state } = useStore();
  const ready = readySpots(levelingGuide, state).length;
  return (
    <a className="next-link" href={LEVELING_HREF}>
      See where to level up{ready > 0 && ` (${ready} good for you now)`}
    </a>
  );
}

function HardSaveForm({
  milestoneId,
  suggestedSlot,
}: {
  milestoneId: string;
  suggestedSlot: number;
}) {
  const { state, update } = useStore();
  const [slot, setSlot] = useState(suggestedSlot);
  const [confirming, setConfirming] = useState(false);
  const locked = lockedSlot(state.story, slot);
  const conflict = locked && locked.milestoneId !== milestoneId ? locked : null;
  const record = (force: boolean) =>
    update(
      (s) => recordHardSave(s, milestoneId, slot, { force }),
      `Hard save recorded in slot ${slot} and locked.`,
    );
  return (
    <form
      className="hardsave-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (conflict) setConfirming(true);
        else record(false);
      }}
    >
      <Field label="Save slot used" hint="A new slot, never used before. It will be locked.">
        <NumberInput
          min={1}
          value={slot}
          onValueChange={(v) => v !== null && setSlot(Math.max(1, Math.round(v)))}
        />
      </Field>
      <Button type="submit" variant="primary" icon="lock">
        I saved in slot {slot}
      </Button>
      {conflict && (
        <p className="form-warning" role="alert">
          <Icon name="warning" size={16} /> Slot {slot} holds the locked save "{conflict.label}".
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Overwrite slot ${slot}?`}
        confirmLabel="Overwrite it anyway"
        danger
        onConfirm={() => record(true)}
        onClose={() => setConfirming(false)}
      >
        <p>
          Slot {slot} holds "{conflict?.label}". Overwriting it in the game loses that branch for
          good. Pick another slot unless that save is already gone.
        </p>
      </ConfirmDialog>
    </form>
  );
}

/** The six endings, checked when seen. */
export function EndingsTracker() {
  const { state, update } = useStore();
  const list = endings(state.story);
  const seen = list.filter((m) => m.done).length;
  return (
    <div className="endings">
      <p className="endings-count num">
        {seen} of {list.length} seen
      </p>
      <ul className="endings-list">
        {list.map((m, i) => (
          <li key={m.id} className={m.done ? 'is-seen' : ''}>
            <label>
              <input
                type="checkbox"
                checked={m.done}
                onChange={(e) => update((s) => setEndingSeen(s, m.id, e.target.checked))}
              />
              <span className="ending-label">
                <span>
                  <span className="num ending-order">{i + 1}.</span>{' '}
                  {m.title.replace(/ ending$/, '')}
                </span>
                {m.choice && <span className="ending-choice">{m.choice}</span>}
              </span>
            </label>
            {!m.verified && (
              <Unverified
                text={m.notes ?? `${m.title} is an assumption.`}
                onConfirm={() =>
                  update((s) => ({
                    ...s,
                    story: {
                      ...s.story,
                      milestones: s.story.milestones.map((x) =>
                        x.id === m.id ? { ...x, verified: true } : x,
                      ),
                    },
                  }))
                }
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Node({ node, hint }: { node: FlowNode; hint?: string }) {
  const state = node.done ? 'is-done' : node.available ? 'is-open' : '';
  return (
    <div className={`flow-node flow-${node.kind} ${state}`}>
      <span className="flow-title">
        {node.done && <Icon name="check" size={14} />}
        {node.title}
      </span>
      {node.kind === 'hardsave' && (
        <span className="flow-slot">
          {node.slot !== null ? (
            <>
              <Icon name="lock" size={12} /> slot {node.slot}
            </>
          ) : (
            'not saved yet'
          )}
        </span>
      )}
      {node.choice && <span className="flow-choice">{node.choice}</span>}
      {hint && <span className="flow-hint">{hint}</span>}
      {!node.verified && <span className="flow-unverified">unverified</span>}
    </div>
  );
}

/** Mini flowchart: the main line runs through each hard save, and an ending branches off each one. */
export function Flowchart() {
  const { state } = useStore();
  const chart = flowchart(state.story);
  if (chart.branches.length === 0) {
    return (
      <p className="muted">
        No hard saves in the checklist. Restore them from story.json in Settings.
      </p>
    );
  }
  return (
    <div className="flow" role="group" aria-label="Hard saves and ending branches">
      <ol className="flow-steps">
        {chart.branches.map(({ save, endings: leaves }, i) => (
          <li key={save.id} className="flow-step">
            <span className="flow-step-num num" aria-hidden="true">
              {i + 1}
            </span>
            <Node
              node={{
                ...save,
                title: `Save ${i + 1} in a new slot ${save.title.replace(/^Hard save: /, '')}`,
              }}
            />
            {leaves.length > 0 && (
              <div className="flow-leaves" aria-label={`Endings from ${save.title}`}>
                {leaves.map((n) => (
                  <Node key={n.id} node={n} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <ol className="flow-howto">
        <li>
          Play normally on your main save. At each numbered point, first save in a new slot you
          never overwrite, then give the main-line answer and keep going.
        </li>
        <li>Finish the game on your main save: that's the True Demon ending.</li>
        <li>
          Then load the saves from the last back to the first. Each one: give the other answer and
          play to the end for its ending. Save those runs in other slots, never over a numbered one.
        </li>
      </ol>
      {chart.unlinked.length > 0 && (
        <div className="flow-leaves">
          {chart.unlinked.map((n) => (
            <Node key={n.id} node={n} />
          ))}
        </div>
      )}
    </div>
  );
}

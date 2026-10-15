import { useRef, useState } from 'react';
import { RemoveMagatamaButton } from '../components/demifiend';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  NumberInput,
  PageHeader,
  Section,
  Tag,
} from '../components/ui';
import { ownedInDataOrder } from '../game/data';
import {
  BACKUP_KEY,
  exportFileName,
  normalizeState,
  parseSaveText,
  serializeSave,
  type ParseResult,
} from '../game/persistence';
import { anchorsOutOfOrder, changedAnchors, syncAnchors } from '../game/story';
import { STATS, type PlayerState, type SaveFile } from '../game/types';
import { seedStory, useStore } from '../state/store';
import { useTheme, type ThemeChoice } from '../state/theme';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Theme() {
  const [theme, setTheme] = useTheme();
  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'Match the system' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  return (
    <div className="filters" role="group" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="filter"
          aria-pressed={theme === o.value}
          onClick={() => setTheme(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Backup() {
  const { save, data, storage, recoveryKey, replaceSave } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const backup = storage.getItem(BACKUP_KEY);
  const recovery = recoveryKey ? storage.getItem(recoveryKey) : null;

  const readFile = async (file: File) => {
    setPreview(parseSaveText(await file.text(), data, seedStory, new Date()));
  };

  return (
    <div className="backup">
      <div className="backup-actions">
        <Button
          variant="primary"
          icon="download"
          onClick={() => download(exportFileName(save), serializeSave(save))}
        >
          Export JSON
        </Button>
        <Button icon="upload" onClick={() => input.current?.click()}>
          Import JSON
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted">
        Saved automatically in this browser after every change. Export now and then: it is the only
        copy that survives clearing the browser.
      </p>
      {backup && (
        <p className="muted">
          A backup of the save before the last import or new game is kept.{' '}
          <button
            type="button"
            className="link"
            onClick={() => download('nocturne-tracker-backup.json', backup)}
          >
            Download it
          </button>
        </p>
      )}
      {recovery && (
        <p className="form-warning" role="alert">
          The stored save could not be read and was set aside.{' '}
          <button
            type="button"
            className="link"
            onClick={() => download('nocturne-tracker-unreadable.json', recovery)}
          >
            Download the unreadable data
          </button>
        </p>
      )}
      <Dialog
        open={preview !== null}
        title="Import save"
        onClose={() => setPreview(null)}
        footer={
          preview?.ok ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  replaceSave(preview.save, 'Save imported. The previous one was backed up.');
                  setPreview(null);
                }}
              >
                Replace current save
              </Button>
            </>
          ) : undefined
        }
      >
        {preview && !preview.ok && <p className="form-error">{preview.error}</p>}
        {preview?.ok && <ImportSummary save={preview.save} warnings={preview.warnings} />}
      </Dialog>
    </div>
  );
}

function ImportSummary({ save, warnings }: { save: SaveFile; warnings: string[] }) {
  const s = save.state;
  return (
    <div className="form-stack">
      <p>
        Level <strong className="num">{s.level}</strong> · {s.skills.length} skills ·{' '}
        {Object.keys(s.magatama).length} Magatama ·{' '}
        {s.story.milestones.filter((m) => m.done).length} milestones done.
      </p>
      <p className="muted">Skills: {s.skills.join(', ') || 'none'}</p>
      {warnings.length > 0 && (
        <div className="form-warning">
          <p>Fixed while reading the file:</p>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p>This replaces the current save. The current one is backed up first.</p>
    </div>
  );
}

type Draft = Pick<PlayerState, 'level' | 'stats' | 'equipped' | 'labyrinthComplete'> & {
  skills: string[];
};

function EditSave() {
  const { state, data, update } = useStore();
  const toDraft = (s: PlayerState): Draft => ({
    level: s.level,
    stats: { ...s.stats },
    skills: Array.from({ length: data.rules.maxSkills }, (_, i) => s.skills[i] ?? ''),
    equipped: s.equipped,
    labyrinthComplete: s.labyrinthComplete,
  });
  const [draft, setDraft] = useState(() => toDraft(state));
  const [issues, setIssues] = useState<string[]>([]);
  const owned = ownedInDataOrder(state, data);
  const save = () => {
    const raw = { ...state, ...draft, skills: draft.skills.filter(Boolean) };
    const { value, errors } = normalizeState(raw, data, state.story);
    setIssues(errors);
    update(() => value, errors.length ? 'Saved with fixes, see below.' : 'Save updated.');
    setDraft(toDraft(value));
  };
  return (
    <form
      className="edit-save"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="edit-grid">
        <Field label="Level">
          <NumberInput
            min={1}
            max={data.rules.maxLevel}
            value={draft.level}
            onValueChange={(level) => level !== null && setDraft({ ...draft, level })}
          />
        </Field>
        {STATS.map((s) => (
          <Field key={s} label={s}>
            <NumberInput
              min={0}
              value={draft.stats[s]}
              onValueChange={(v) =>
                v !== null && setDraft({ ...draft, stats: { ...draft.stats, [s]: v } })
              }
            />
          </Field>
        ))}
      </div>
      <fieldset className="edit-skills">
        <legend>Skills</legend>
        {draft.skills.map((skill, i) => (
          <Field key={i} label={`Slot ${i + 1}`}>
            <select
              value={skill}
              onChange={(e) => {
                const skills = [...draft.skills];
                skills[i] = e.target.value;
                setDraft({ ...draft, skills });
              }}
            >
              <option value="">Empty</option>
              {skill && !data.skillSources.has(skill) && (
                <option value={skill}>{skill} (not in data)</option>
              )}
              {data.magatama.map((m) => (
                <optgroup key={m.name} label={m.name}>
                  {m.skills.map((s) => (
                    <option
                      key={s.name}
                      value={s.name}
                      disabled={s.name !== skill && draft.skills.includes(s.name)}
                    >
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        ))}
      </fieldset>
      <div className="edit-grid">
        <Field label="Equipped Magatama">
          <select
            value={draft.equipped ?? ''}
            onChange={(e) => setDraft({ ...draft, equipped: e.target.value || null })}
          >
            <option value="">None</option>
            {owned.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft.labyrinthComplete}
            onChange={(e) => setDraft({ ...draft, labyrinthComplete: e.target.checked })}
          />
          <span>Labyrinth complete</span>
        </label>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" icon="save">
          Save changes
        </Button>
        <Button variant="ghost" onClick={() => setDraft(toDraft(state))}>
          Discard
        </Button>
      </div>
      {issues.length > 0 && (
        <ul className="form-warning">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="edit-owned">
        <h3>Owned Magatama</h3>
        <p className="muted">
          Progress and adding new Magatama live on the <a href="#/demifiend">Demi-fiend</a> page.
          Remove one here if it was added by mistake.
        </p>
        <ul className="chip-row">
          {owned.map((m) => (
            <li key={m} className="chip">
              {m} <RemoveMagatamaButton name={m} />
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

function Assumptions() {
  const { data, isVerified, confirmAssumption } = useStore();
  return (
    <ul className="assumptions">
      {data.rules.assumptions.map((a) => {
        const verified = isVerified(a.id);
        return (
          <li key={a.id}>
            <span>{a.text}</span>
            {verified ? (
              <Tag tone="success" icon="check">
                verified
              </Tag>
            ) : (
              <Tag tone="warning">unverified</Tag>
            )}
            {!a.verified && (
              <Button small variant="ghost" onClick={() => confirmAssumption(a.id, !verified)}>
                {verified ? 'Mark unverified' : 'Mark verified'}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DangerZone() {
  const { state, update, newGame, notify } = useStore();
  const [confirming, setConfirming] = useState(false);
  const missing = seedStory.milestones.filter(
    (m) => !state.story.milestones.some((x) => x.id === m.id),
  );
  const changed = changedAnchors(state.story, seedStory);
  const outOfOrder = anchorsOutOfOrder(state.story, seedStory);
  const pending = missing.length + changed.length + (outOfOrder ? 1 : 0);
  return (
    <div className="form-stack">
      <div>
        <Button
          icon="story"
          disabled={pending === 0}
          onClick={() => {
            update((s) => syncAnchors(s, seedStory).state);
            notify(
              `Checklist synced: ${missing.length} added, ${changed.length} updated${outOfOrder ? ', order fixed' : ''}. Your progress was kept.`,
            );
          }}
        >
          Sync checklist with story.json
        </Button>
        <p className="muted">
          {pending === 0
            ? 'Your checklist matches story.json.'
            : [
                missing.length > 0 && `New: ${missing.map((m) => m.title).join(', ')}.`,
                changed.length > 0 &&
                  `Updated: ${changed.length} milestone(s) (text, rewards or levels).`,
                outOfOrder && 'The order of the anchors changed.',
                'Done, available, your own levels and confirmations are kept.',
              ]
                .filter(Boolean)
                .join(' ')}
        </p>
      </div>
      <div>
        <Button variant="danger" icon="trash" onClick={() => setConfirming(true)}>
          Start a new game
        </Button>
        <p className="muted">
          Resets everything to the new-game seed. The current save is backed up first.
        </p>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Start a new game?"
        confirmLabel="Start a new game"
        danger
        onConfirm={newGame}
        onClose={() => setConfirming(false)}
      >
        <p>
          Level {state.level}, your skills, build and story checklist are replaced by the new-game
          seed. Export first if you might want them back; a backup is also kept in this browser.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <Section title="Save and backup">
        <Backup />
      </Section>
      <Section
        id="edit"
        title="Edit current save"
        description="Correct anything the tracker got out of step with: level, stats, skills, the Labyrinth."
      >
        <EditSave />
      </Section>
      <Section
        title="Assumptions"
        description="Mechanics the schedule relies on that are not confirmed yet. Edit data/rules.json to change them."
      >
        <Assumptions />
      </Section>
      <Section title="Appearance">
        <Theme />
      </Section>
      <Section title="Checklist and reset">
        <DangerZone />
      </Section>
    </div>
  );
}

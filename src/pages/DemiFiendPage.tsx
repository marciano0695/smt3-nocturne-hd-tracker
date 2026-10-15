import {
  MagatamaList,
  ScheduleTable,
  ScheduleTimeline,
  SkillSlots,
  StatPlan,
  UndoLevelUpButton,
  WindowsTable,
} from '../components/demifiend';
import { PageHeader, Section, Tag } from '../components/ui';
import { STATS } from '../game/types';
import { useStore } from '../state/store';

function CurrentState() {
  const { state } = useStore();
  return (
    <div className="current">
      <div className="current-level">
        <span className="current-level-label">Level</span>
        <span className="current-level-value num">{state.level}</span>
      </div>
      <dl className="current-stats">
        {STATS.map((stat) => (
          <div key={stat}>
            <dt>{stat}</dt>
            <dd className="num">{state.stats[stat]}</dd>
          </div>
        ))}
      </dl>
      <div className="current-meta">
        <span>
          Equipped: <strong>{state.equipped ?? 'none'}</strong>
        </span>
        <span>
          Labyrinth:{' '}
          {state.labyrinthComplete ? <Tag tone="success">complete</Tag> : <Tag>not complete</Tag>}
        </span>
      </div>
    </div>
  );
}

export function DemiFiendPage() {
  return (
    <div className="page">
      <PageHeader title="Demi-fiend">
        <UndoLevelUpButton />
      </PageHeader>
      <Section title="Current state" actions={<a href="#/settings">Edit current save</a>}>
        <CurrentState />
        <SkillSlots />
      </Section>
      <Section
        title="Skill schedule"
        description="Which Magatama to equip at each level-up, from the build plan."
      >
        <ScheduleTimeline />
        <ScheduleTable limit={14} />
      </Section>
      <Section
        title="Late Magatama"
        description="Target skills on Magatama you don't own yet, or blocked by the Labyrinth."
      >
        <WindowsTable />
      </Section>
      <Section title="Stat plan">
        <StatPlan />
      </Section>
      <Section
        title="Owned Magatama"
        description="Fix progress here if you forgot to log a level-up."
      >
        <MagatamaList />
      </Section>
    </div>
  );
}

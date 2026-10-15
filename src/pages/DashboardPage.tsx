import { ScheduleTimeline, SkillSlots } from '../components/demifiend';
import { EndingsTracker, Flowchart, NextMove } from '../components/story';
import { Section } from '../components/ui';
import { suggestStat } from '../game/statPlan';
import { useStore } from '../state/store';

function NextLevelUp() {
  const { plan, state, data } = useStore();
  const step = plan[0];
  const stat = suggestStat(state.stats, state.level + 1, state.build, data.rules);
  if (!step) return <p>The Demi-fiend is at the maximum level.</p>;
  return (
    <div className="next-levelup">
      <p className="next-levelup-line">
        <span className="num next-levelup-level">
          <span className="visually-hidden">Level </span>
          {step.level}
        </span>
        {step.magatama === null ? (
          <span>
            {step.reason === 'free'
              ? 'Free level: any Magatama will do.'
              : 'Nothing can be learned this level.'}
          </span>
        ) : (
          <span>
            Equip <strong>{step.magatama}</strong>, {step.action === 'learn' ? 'learn' : 'decline'}{' '}
            <strong>{step.skill}</strong>
            {step.replaces && <> (replaces {step.replaces})</>}
          </span>
        )}
        {stat && <span className="muted">+1 {stat}</span>}
      </p>
      <ScheduleTimeline count={8} />
    </div>
  );
}

export function DashboardPage() {
  return (
    <div className="page page-dashboard">
      <NextMove />
      <div className="dash-grid">
        <Section title="Next level-up" actions={<a href="#/demifiend">Full schedule</a>}>
          <NextLevelUp />
        </Section>
        <Section title="Skills" actions={<a href="#/demifiend">Details</a>}>
          <SkillSlots compact />
        </Section>
      </div>
      <Section title="Endings" description="Five hard saves, six endings, one save file.">
        <div className="endings-grid">
          <EndingsTracker />
          <Flowchart />
        </div>
      </Section>
    </div>
  );
}

import { LevelUpActions, SkillSlots } from '../components/demifiend';
import { EndingsTracker, Flowchart, NextMove } from '../components/story';
import { Section } from '../components/ui';
import { suggestStat } from '../game/statPlan';
import { useStore } from '../state/store';

function NextLevelUp() {
  const { plan, state, data } = useStore();
  const step = plan[0];
  const stat = suggestStat(state.stats, state.level + 1, state.build, data.rules);
  const upcoming = plan
    .filter((s) => s.action === 'learn' && s.skill && state.build.target.includes(s.skill))
    .slice(0, 3);
  if (!step) return <p>The Demi-fiend is at the maximum level.</p>;
  return (
    <div className="next-levelup">
      <p className="next-levelup-line">
        <span className="num next-levelup-level">Lv {step.level}</span>
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
        {stat && <span className="muted">· +1 {stat}</span>}
      </p>
      {upcoming.length > 0 && (
        <p className="muted">
          Next targets:{' '}
          {upcoming.map((s, i) => (
            <span key={s.level}>
              {i > 0 && ', '}
              {s.skill} at <span className="num">{s.level}</span>
            </span>
          ))}
        </p>
      )}
      <LevelUpActions />
    </div>
  );
}

export function DashboardPage() {
  return (
    <div className="page page-dashboard">
      <NextMove />
      <div className="dash-grid">
        <Section title="Next level-up">
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

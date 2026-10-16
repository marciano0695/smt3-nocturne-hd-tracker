import { currentTiers, spotStatus } from '../game/leveling';
import type { GrindSpot, LevelingGuide as Guide, SpotStatus } from '../game/types';
import { levelingGuide } from '../gameData';
import { useStore } from '../state/store';
import { AccordionGroup, Tag, Unverified, type Tone } from './ui';

/** Link target that opens and scrolls to the leveling section on the Story page. */
export const LEVELING_HREF = '#/story/leveling';

const STATUS: Record<SpotStatus, { label: string; tone: Tone }> = {
  ready: { label: 'Good for you now', tone: 'success' },
  under: { label: 'Under-leveled', tone: 'warning' },
  past: { label: 'Out-leveled', tone: 'neutral' },
  locked: { label: 'Not reached yet', tone: 'neutral' },
};

function DlcTag() {
  return <Tag tone="accent">DLC</Tag>;
}

function Spot({ spot, guide }: { spot: GrindSpot; guide: Guide }) {
  const { state, isVerified, confirmAssumption } = useStore();
  const status = spotStatus(spot, guide, state);
  const opener = state.story.milestones.find((m) => m.id === spot.unlockedBy);
  const id = `grind:${spot.id}`;
  return (
    <li className={`spot is-${status}`}>
      <div className="spot-head">
        <span className="spot-name">{spot.name}</span>
        <span className="milestone-tags">
          <Tag tone={STATUS[status].tone}>{STATUS[status].label}</Tag>
          {spot.dlc && <DlcTag />}
          {!isVerified(id) && (
            <Unverified
              text={`${spot.name}: from Game8's leveling guide.`}
              onConfirm={() => confirmAssumption(id, true)}
            />
          )}
        </span>
      </div>
      {status === 'locked' && opener && <p className="spot-when">Opens with “{opener.title}”.</p>}
      {spot.when && <p className="spot-when">{spot.when}</p>}
      {spot.enemies.length > 0 && (
        <p className="spot-enemies">
          <span className="spot-label">Enemies</span> {spot.enemies.join(' · ')}
        </p>
      )}
      {spot.tips.length > 0 && (
        <ul className="spot-tips">
          {spot.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Best places to grind EXP, grouped by game stage, marked against the player's save. */
export function LevelingGuide({ guide = levelingGuide }: { guide?: Guide }) {
  const { state } = useStore();
  const now = new Set(currentTiers(guide, state.level).map((t) => t.id));
  return (
    <div className="leveling">
      <div className="groups">
        {guide.tiers.map((tier) => {
          const spots = guide.spots.filter((s) => s.tier === tier.id);
          if (spots.length === 0) return null;
          const ready = spots.filter((s) => spotStatus(s, guide, state) === 'ready').length;
          return (
            <AccordionGroup
              key={tier.id}
              id={`grind:${tier.id}`}
              title={tier.title}
              meta={`Lv ${tier.min}–${tier.max}+ · ${ready}/${spots.length} good now`}
              defaultOpen={now.has(tier.id)}
              current={now.has(tier.id)}
            >
              <ul className="spots">
                {spots.map((s) => (
                  <Spot key={s.id} spot={s} guide={guide} />
                ))}
              </ul>
            </AccordionGroup>
          );
        })}
      </div>
      {guide.tips.length > 0 && (
        <>
          <h3 className="leveling-subhead">Tips</h3>
          <ul className="leveling-tips">
            {guide.tips.map((tip) => (
              <li key={tip.title}>
                <strong>{tip.title}</strong> {tip.dlc && <DlcTag />} <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {guide.source && <p className="source leveling-source">Source: {guide.source}</p>}
    </div>
  );
}

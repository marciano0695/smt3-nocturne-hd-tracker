export type Stat = 'STR' | 'MAG' | 'VIT' | 'AGI' | 'LUC';

export const STATS: readonly Stat[] = ['STR', 'MAG', 'VIT', 'AGI', 'LUC'];

// Game data is passed into the pure logic so tests and the player's JSON edits go through the same code.
export interface SkillData {
  name: string;
  /** Minimum level to learn it; null means no level requirement. */
  level: number | null;
  /** Extra unlock condition, e.g. "labyrinth_complete" for Pierce. */
  unlock?: string;
  cost: string;
  type: string;
  effect: string;
}

export type Alignment = 'light' | 'neutral' | 'dark';

export interface MagatamaData {
  name: string;
  alignment?: Alignment;
  /** How to get it, from the player's notes. */
  obtain?: string;
  /** Already in learning order. */
  skills: SkillData[];
}

export interface Assumption {
  id: string;
  text: string;
  verified: boolean;
}

export interface Rules {
  maxLevel: number;
  maxSkills: number;
  statCap: number;
  statPointsPerLevel: number;
  assumptions: Assumption[];
}

export interface SkillSource {
  magatama: string;
  /** Position in that Magatama's skill list. */
  index: number;
  skill: SkillData;
}

export interface GameData {
  /** In data-file order, which is also the scheduler's final tie-break. */
  magatama: MagatamaData[];
  rules: Rules;
  magatamaByName: Map<string, MagatamaData>;
  /** Skill name → every Magatama that teaches it (one entry in the shipped data). */
  skillSources: Map<string, SkillSource[]>;
  /** Magatama name → index in `magatama`. */
  dataOrder: Map<string, number>;
}

export type LearnResult = 'learned' | 'declined';

export interface HistoryEntry {
  skill: string;
  level: number;
  result: LearnResult;
  /** Skill that was overwritten when learning into a full set. */
  replaced?: string;
}

export interface MagatamaProgress {
  /** Index into the Magatama's skill list of the next pending skill. */
  nextIndex: number;
  history: HistoryEntry[];
}

export interface StatGuidePhase {
  /** Last level this phase covers; null runs to the max level. */
  untilLevel: number | null;
  /** Repeating allocation while this phase lasts. */
  pattern: Stat[];
}

/** A recommended stat curve; the tracker steers the player's actual stats toward it. */
export interface StatGuide {
  id: string;
  name: string;
  /** Where the advice comes from, shown to the player. */
  source?: string;
  /** Stats the curve starts from at level 1. */
  start: Record<Stat, number>;
  phases: StatGuidePhase[];
}

export interface GrindTier {
  id: string;
  title: string;
  min: number;
  max: number;
}

/** A place to grind EXP, from data/leveling.json. */
export interface GrindSpot {
  id: string;
  name: string;
  tier: string;
  /** Worth farming at any level, so never out-leveled. */
  anyLevel: boolean;
  /** Story milestone that opens the area; null = always reachable. */
  unlockedBy: string | null;
  when?: string;
  enemies: string[];
  tips: string[];
  dlc: boolean;
}

export interface GrindTip {
  title: string;
  text: string;
  dlc: boolean;
}

export interface LevelingGuide {
  source: string;
  tiers: GrindTier[];
  spots: GrindSpot[];
  tips: GrindTip[];
}

export type SpotStatus = 'locked' | 'under' | 'ready' | 'past';

export interface Build {
  /** Final 8 skills. */
  target: string[];
  /** Skills worth keeping until replaced, highest priority first. */
  interimKeep: string[];
  /** Optional interim skills to pick up on free levels, highest priority first. */
  wishlist: string[];
  /** Repeating stat allocation pattern. */
  statPattern: Stat[];
  statTargets: Partial<Record<Stat, number>>;
  /** When set, each point goes to the stat furthest behind this guide instead of following statPattern. */
  statGuide?: StatGuide;
}

export type MilestoneKind = 'story' | 'labyrinth' | 'fiend' | 'side' | 'hardsave' | 'ending';

export type Difficulty = 'normal' | 'hard';

export interface Milestone {
  id: string;
  title: string;
  kind: MilestoneKind;
  recommendedLevel?: number;
  /** Entered by the player: the guides only publish levels for Normal. */
  recommendedLevelHard?: number;
  available: boolean;
  done: boolean;
  verified: boolean;
  notes?: string;
  /** When every listed milestone is done, this one is marked available automatically. */
  requires?: string[];
  /** Magatama this milestone rewards; marking it done adds it to the owned Magatama. */
  magatama?: string;
  /** What to do here: a hard save's main-line answer, or how an ending is reached from its save. */
  choice?: string;
}

export interface SaveSlot {
  slot: number;
  label: string;
  milestoneId?: string;
  /** Hard-save slots are locked: the UI warns before reusing them. */
  locked: boolean;
}

export interface StoryState {
  milestones: Milestone[];
  saveSlots: SaveSlot[];
  /** Ids of ending milestones the player has seen. */
  endingsSeen: string[];
}

export interface PlayerState {
  level: number;
  stats: Record<Stat, number>;
  /** Current skills in slot order, max `rules.maxSkills`. */
  skills: string[];
  equipped: string | null;
  /** Only Magatama the player owns. */
  magatama: Record<string, MagatamaProgress>;
  labyrinthComplete: boolean;
  /** Missing means Normal, so older saves and fixtures stay valid. */
  difficulty?: Difficulty;
  build: Build;
  story: StoryState;
}

/** What is persisted to localStorage and written by Export JSON. */
export interface SaveFile {
  app: 'nocturne-tracker';
  schemaVersion: 1;
  /** ISO timestamp of the last change. */
  savedAt: string;
  state: PlayerState;
  /** Snapshots taken right before each level-up, oldest first (capped). */
  undo: PlayerState[];
  /** Assumption ids the player confirmed in the UI. */
  confirmedAssumptions: string[];
}

/**
 * target        - the next skill is a target skill (priority 1)
 * toward-target - a later skill of this Magatama is a pending target (priority 2)
 * wishlist      - progresses toward a wishlist skill (priority 3)
 * free          - nothing needed: any Magatama will do (priority 4)
 * none          - no owned Magatama can teach anything at this level (priority 5)
 */
export type StepReason = 'target' | 'toward-target' | 'wishlist' | 'free' | 'none';

export type StepAction = 'learn' | 'decline' | 'none';

export interface PlanStep {
  /** Level reached by this level-up. */
  level: number;
  /** Magatama to equip; null when any will do ('free' with no empty slot) or none can teach ('none'). */
  magatama: string | null;
  /** Skill taught at this level-up; null whenever `magatama` is null. */
  skill: string | null;
  reason: StepReason;
  action: StepAction;
  /** Slot index the skill goes into when learned. */
  slot: number | null;
  /** Skill overwritten when the slots were full. */
  replaces: string | null;
  /** Target or wishlist skill this step works toward. */
  toward: string | null;
}

export interface LateWindow {
  magatama: string;
  target: string;
  owned: boolean;
  levelUpsNeeded: number;
  /** Unmet unlock condition blocking the target, e.g. "labyrinth_complete". */
  gate: string | null;
  /** First level of the earliest window; null when gated. */
  start: number | null;
  /** Level at which the target is learned at the earliest; null when gated. */
  end: number | null;
  /** e.g. "Level-ups to 42–45", "Any level-up from 50", "First level-up after Labyrinth complete". */
  label: string;
  /** Targets on other Magatama whose windows overlap this one. */
  overlapsWith: string[];
}

export type TargetStatus =
  | { kind: 'learned' }
  | { kind: 'scheduled'; level: number }
  | { kind: 'waiting'; window: LateWindow | null }
  | { kind: 'blocked'; gate: string }
  | { kind: 'missed' }
  | { kind: 'unknown' }
  | { kind: 'unscheduled' };

export interface TargetInfo {
  skill: string;
  magatama: string | null;
  owned: boolean;
  /** Level-ups with that Magatama still needed, counting the target itself. */
  stepsRemaining: number | null;
  /** Earliest level it can be learned ignoring other Magatama; null when unknown or gated. */
  earliestLevel: number | null;
  status: TargetStatus;
}

export interface Offer {
  magatama: string;
  index: number;
  skill: SkillData;
}

export type SkillChoice = 'learn' | 'replace' | 'decline';

export interface LevelUpChoice {
  /** Magatama equipped for this level-up (null = none). */
  magatama: string | null;
  /** How to handle the offered skill; ignored when nothing is offered. */
  skillChoice: SkillChoice | null;
  /** Slot to overwrite when skillChoice is 'replace'. */
  replaceSlot: number | null;
  /** Stat that receives this level's point. */
  stat: Stat | null;
}

export type RecommendationKind =
  | 'hardsave' // rule 1
  | 'labyrinth' // rule 2, level is fine
  | 'level-up' // rule 2, under-levelled
  | 'tower-warning' // rule 3
  | 'side-quest' // rule 4
  | 'story' // rule 5
  | 'all-done'; // rule 5 with nothing left

export interface Recommendation {
  rule: 1 | 2 | 3 | 4 | 5;
  kind: RecommendationKind;
  title: string;
  /** Why this rule matched, in plain language. */
  reason: string;
  milestoneId: string | null;
  /** Rule 1: first save slot number not used yet. */
  suggestedSlot: number | null;
  /** Rule 2 when under-levelled: levels still missing. */
  levelGap: number | null;
  /** Rule 4: the next story milestone, offered as the alternative. */
  alternativeId: string | null;
}

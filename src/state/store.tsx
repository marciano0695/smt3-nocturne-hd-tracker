import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { applyLevelUp, validateLevelUp } from '../game/levelUp';
import {
  STORAGE_KEY,
  backupCurrent,
  createNewGameState,
  createSaveFile,
  isAssumptionVerified,
  loadSave,
  parseSaveText,
  parseStory,
  recordLevelUp,
  replaceState,
  setAssumptionConfirmed,
  undoLastLevelUp,
  writeSave,
  type StorageLike,
} from '../game/persistence';
import { schedule } from '../game/scheduler';
import { statProgress, type StatProgressRow } from '../game/statPlan';
import { recommendNext } from '../game/story';
import { targetStatuses } from '../game/targets';
import type {
  GameData,
  LateWindow,
  LevelUpChoice,
  PlanStep,
  PlayerState,
  Recommendation,
  SaveFile,
  StoryState,
  TargetInfo,
} from '../game/types';
import { lateWindows } from '../game/windows';
import { dataErrors, gameData, newGameSeed, statGuides, storySeed } from '../gameData';

// localStorage can throw on access (privacy modes); the app then runs on memory and Export.
function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem(STORAGE_KEY);
    return s;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

/** The story checklist from data/story.json, used for new games and imports without a story. */
export const seedStory: StoryState = parseStory(storySeed).value;

export function createNewSave(): SaveFile {
  const state = createNewGameState(newGameSeed, storySeed, gameData).value;
  const guideId = (newGameSeed as { statGuideId?: unknown }).statGuideId;
  const guide = statGuides.find((g) => g.id === guideId);
  if (guide) state.build = { ...state.build, statGuide: structuredClone(guide) };
  return createSaveFile(state, new Date());
}

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface Store {
  save: SaveFile;
  state: PlayerState;
  data: GameData;
  plan: PlanStep[];
  windows: LateWindow[];
  targets: TargetInfo[];
  recommendation: Recommendation;
  stats: StatProgressRow[];
  /** Problems to show the player: unreadable data files, load fixes, storage failures. */
  notices: string[];
  recoveryKey: string | null;
  storage: StorageLike;
  toast: Toast | null;
  levelUp: (choice: LevelUpChoice) => string | null;
  undoLevelUp: () => void;
  update: (change: (state: PlayerState) => PlayerState, message?: string) => void;
  replaceSave: (save: SaveFile, message: string) => void;
  newGame: () => void;
  confirmAssumption: (id: string, confirmed: boolean) => void;
  isVerified: (id: string) => boolean;
  notify: (message: string, action?: Toast['action']) => void;
  dismissToast: () => void;
  dismissNotices: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(() => browserStorage() ?? memoryStorage, []);
  const [initial] = useState(() =>
    loadSave(storage, gameData, seedStory, createNewSave, new Date()),
  );
  const [save, setSave] = useState(initial.save);
  const [notices, setNotices] = useState<string[]>(() => [
    ...dataErrors,
    ...(storage === memoryStorage
      ? ['Browser storage is unavailable here, so nothing is kept after closing. Use Export JSON.']
      : []),
    ...initial.warnings,
  ]);
  const [toast, setToast] = useState<Toast | null>(null);
  // Only write after a change made in this tab, so loading never overwrites anything.
  const dirty = useRef(false);
  const toastId = useRef(0);

  useEffect(() => {
    if (!dirty.current) return;
    const result = writeSave(storage, save);
    if (!result.ok) {
      setNotices((n) => [
        ...n.filter((x) => !x.startsWith('Could not save')),
        `Could not save to browser storage (${result.error}). Export JSON to keep your changes.`,
      ]);
    }
  }, [save, storage]);

  // Another tab changed the save: follow it instead of overwriting it later.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      const parsed = parseSaveText(e.newValue, gameData, seedStory, new Date());
      if (parsed.ok) {
        dirty.current = false;
        setSave(parsed.save);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const notify = useCallback((message: string, action?: Toast['action']) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, action });
  }, []);

  const commit = useCallback((next: (s: SaveFile) => SaveFile) => {
    dirty.current = true;
    setSave(next);
  }, []);

  const undoLevelUp = useCallback(() => {
    commit((s) => undoLastLevelUp(s, new Date()) ?? s);
    notify('Last level-up undone.');
  }, [commit, notify]);

  const levelUp = useCallback(
    (choice: LevelUpChoice) => {
      const error = validateLevelUp(save.state, gameData, choice);
      if (error) return error;
      const after = applyLevelUp(save.state, gameData, choice);
      commit((s) => recordLevelUp(s, after, new Date()));
      notify(`Level ${after.level} saved.`, { label: 'Undo', run: undoLevelUp });
      return null;
    },
    [save.state, commit, notify, undoLevelUp],
  );

  const update = useCallback(
    (change: (state: PlayerState) => PlayerState, message?: string) => {
      commit((s) => {
        const next = change(s.state);
        return next === s.state ? s : replaceState(s, next, new Date());
      });
      if (message) notify(message);
    },
    [commit, notify],
  );

  const replaceSave = useCallback(
    (next: SaveFile, message: string) => {
      backupCurrent(storage);
      commit(() => next);
      notify(message);
    },
    [storage, commit, notify],
  );

  const derived = useMemo(() => {
    const state = save.state;
    const plan = schedule(state, gameData);
    const windows = lateWindows(state, gameData);
    return {
      plan,
      windows,
      targets: targetStatuses(state, gameData, plan, windows),
      recommendation: recommendNext(state),
      stats: statProgress(state, gameData.rules),
    };
  }, [save.state]);

  const value: Store = {
    save,
    state: save.state,
    data: gameData,
    ...derived,
    notices,
    recoveryKey: initial.recoveryKey ?? null,
    storage,
    toast,
    levelUp,
    undoLevelUp,
    update,
    replaceSave,
    newGame: () =>
      replaceSave(createNewSave(), 'New game started. The previous save was backed up.'),
    confirmAssumption: (id, confirmed) =>
      commit((s) => setAssumptionConfirmed(s, id, confirmed, new Date())),
    isVerified: (id) => isAssumptionVerified(id, save, gameData.rules),
    notify,
    dismissToast: () => setToast(null),
    dismissNotices: () => setNotices([]),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

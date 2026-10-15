# Nocturne Tracker: project context

A personal tracker for one playthrough of **Shin Megami Tensei III: Nocturne HD Remaster**. The player wants to see every ending from a single save file and build a strength-focused Demi-fiend. The app has three features:

1. **Story planner**: where to make hard saves, and whether to do story, Labyrinth of Amala or side content next.
2. **Demi-fiend tracker**: current level, stats and skills, plus a schedule of which Magatama to equip at each upcoming level-up.
3. **Build planner**: the final 8-skill build, which drives the schedule.

## Ground rules for Claude Code

- **Do not invent game facts.** All game data comes from `data/magatama.json` and from this file. Story content not listed here must be added by the player through the UI, never generated.
- Anything marked **(verify)** is an assumption. Show it in the UI with a small "unverified" tag until the player confirms it.
- Keep all game data in editable JSON files so the player can fix mistakes without touching code.
- Ask the player before changing the stack or adding dependencies beyond those listed.

## Stack

- [Vite+](https://viteplus.dev) (`vite-plus`, CLI `vp`) + React + TypeScript, single-page app, run locally with `npm run dev`
- Vite+ is the whole toolchain: Vite (dev server and build), Vitest (tests), Oxlint + Oxfmt + TypeScript type-checking (`vp check`). Don't install `vite`, `vitest`, `typescript`, ESLint or Prettier separately.
  - All tool config lives in `vite.config.ts` (`import { defineConfig } from 'vite-plus'`), including the `test`, `lint` and `fmt` blocks. No `vitest.config.ts`, `.oxlintrc.json` or `.oxfmtrc.json`.
  - Tests import from `vite-plus/test`, not `vitest`.
  - `package.json` `overrides` alias `vite` to `@voidzero-dev/vite-plus-core` and pin `vitest` to the version Vite+ bundles (`vp toolchain vitest`). Update them together with `vite-plus`.
  - `fmt` ignores `data/**` and `tests/fixtures/**` so the player's hand-edited JSON keeps its layout.
- Dependencies: `react`, `react-dom`; dev: `vite-plus`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.
- Commands: `npm run dev` (`vp dev`), `npm test` (`vp test`, runs once; `npm run test:watch` to watch), `npm run check` (`vp check`: format, lint, type-check; `npm run fix` to auto-fix), `npm run build` (`vp build`), `npm run preview`.
- State persisted in `localStorage`, with **Export JSON / Import JSON** buttons as backup (the player's save data must never be lost)
- Vitest (via `vp test`) for unit tests of the scheduler and recommendation logic
- No backend. Plain CSS or CSS modules. Works on desktop and phone widths. Light and dark mode.

## Game mechanics the logic depends on

- The Demi-fiend gains **1 stat point per level**. Stats: STR, MAG, VIT, AGI, LUC. Cap 40 per stat (verify). Max level 99.
- Each Magatama has an **ordered** skill list (`data/magatama.json`, already in learning order).
- On each level-up, the equipped Magatama teaches its **next pending skill**, but only if the new level is **≥ that skill's level requirement**. Otherwise nothing is learned that level-up. One skill per level-up at most.
- The Demi-fiend holds **8 skills max**. When full, the player either replaces an existing skill or declines the new one. A declined skill still counts as passed and the Magatama moves on to its next skill (verify). Treat declined skills as gone for good.
- Skills with `level: null` have no level requirement. **Pierce** (Marogareh) requires `labyrinthComplete === true`. Masakados skills have no requirement.
- Skills already learned or declined advance a Magatama's progress pointer. Store progress per Magatama as the index of the next pending skill.

## Data model

```ts
type Stat = "STR" | "MAG" | "VIT" | "AGI" | "LUC";

interface PlayerState {
  level: number;
  stats: Record<Stat, number>;
  skills: string[];                      // max 8, current skills
  equipped: string | null;               // Magatama name
  magatama: Record<string, {             // only Magatama the player owns
    nextIndex: number;                   // index into the skill list of the next pending skill
    history: { skill: string; level: number; result: "learned" | "declined" }[];
  }>;
  labyrinthComplete: boolean;
  build: {
    target: string[];                    // final 8 skills
    interimKeep: string[];               // skills worth keeping until replaced, highest priority first
    wishlist: string[];                  // optional interim skills to pick up on free levels
    statPattern: Stat[];                 // repeating allocation pattern
    statTargets: Partial<Record<Stat, number>>;
  };
  story: StoryState;                     // see Feature 1
}
```

## Seed state (new game)

The app starts at the beginning of a new game. The player will enter their real progress later, so manual editing of every field (level, stats, skills, owned Magatama and their progress, story checklist) must be easy, ideally with an **"Edit current save"** form in Settings.

```json
{
  "level": 1,
  "stats": { "STR": 2, "MAG": 2, "VIT": 2, "AGI": 2, "LUC": 2 },
  "skills": [],
  "equipped": "Marogareh",
  "magatama": {
    "Marogareh": { "nextIndex": 0, "history": [] }
  },
  "labyrinthComplete": false,
  "build": {
    "target": ["Focus", "Endure", "Freikugel", "Pierce", "Deadly Fury", "Might", "War Cry", "Rakukaja"],
    "interimKeep": [],
    "wishlist": [],
    "statPattern": ["STR", "STR", "VIT"],
    "statTargets": { "STR": 40, "VIT": 30, "AGI": 20 }
  }
}
```

Starting stats of 2 each and Marogareh as the only starting Magatama are assumptions (verify). The story checklist starts with nothing done.

## Test fixture (the player's level 22 save)

Save this as `tests/fixtures/save-level22.json` and use it **only in tests**, not as the app's starting state. The player listed "Rajunda", which isn't a Nocturne skill; it is assumed to be **Rakunda** (Iyomante, level 16).

```json
{
  "level": 22,
  "stats": { "STR": 11, "MAG": 2, "VIT": 7, "AGI": 10, "LUC": 2 },
  "skills": ["Lunge", "Analyze", "Tarunda", "Sukunda", "Rakunda", "Counter", "Heat Wave", "Ice Breath"],
  "equipped": null,
  "magatama": {
    "Marogareh": { "nextIndex": 5, "history": [] },
    "Wadatsumi": { "nextIndex": 1, "history": [] },
    "Ankh":      { "nextIndex": 0, "history": [] },
    "Iyomante":  { "nextIndex": 3, "history": [] },
    "Shiranui":  { "nextIndex": 0, "history": [] },
    "Hifumi":    { "nextIndex": 0, "history": [] },
    "Kamudo":    { "nextIndex": 1, "history": [] }
  },
  "labyrinthComplete": false,
  "build": {
    "target": ["Focus", "Endure", "Freikugel", "Pierce", "Deadly Fury", "Might", "War Cry", "Rakukaja"],
    "interimKeep": ["Heat Wave", "Lunge", "Rakunda", "Sukunda", "Counter", "Tarunda", "Analyze"],
    "wishlist": [],
    "statPattern": ["STR", "STR", "VIT"],
    "statTargets": { "STR": 40, "VIT": 30, "AGI": 20 }
  }
}
```

The player gets new Magatama during the game. The UI needs an **"Add Magatama"** action (pick from the list in `magatama.json`, set its progress) so the schedule updates.

## Feature 1: Story planner

### Content (`data/story.json`, editable)

`data/story.json` holds the full playthrough in order (story chapters, Fiends, Kalpas, side quests, hard saves, endings), researched by the player with Claude from the Samurai Gamers, Game8 and RPG Site HD Remaster guides. Everything from those guides is `verified: false` until the player confirms it in-game. The player can add or edit anything in the UI.

**All-endings plan (one save file).** The guides agree that each ending is locked by a choice made before the Tower, so there is one hard save (a new slot, never overwritten) before each choice. The main line refuses every choice and carries on; each ending is played to the end from its own save:

| Hard save (id) | Branch from it | Main line continues with |
|---|---|---|
| Before Yuko's questions, end of Yoyogi Park revisited (`hs-yuko`) | "...I'm terrified." twice → **Tranquility** (the guides' "Demon"/neutral ending) | "I can take it." twice |
| Before Isamu's question, Amala Temple (`hs-isamu`) | agree → **Musubi** | refuse |
| Before the Hall of Mirrors, Mifunashiro (`hs-chiaki`) | agree with Chiaki → **Yosuga** | refuse |
| Before Hikawa, Diet Building (`hs2`) | "Fine by me" → **Shijima** | "Can't do that." (keeps Freedom) |
| Before Metatron, Kalpa 5 (`hs1`) | beat Metatron, finish the Labyrinth → **True Demon** | reload, leave Kalpa 5 unfinished, go to the Tower → **Freedom** |

- Finishing the Labyrinth (Metatron in Kalpa 5) before entering the Tower locks True Demon regardless of other choices; entering the Tower first locks the Labyrinth.
- The first Reason flags (Shijima and Yosuga at Mantra HQ, Musubi at Amala Network revisited) don't lock anything; take all three.
- Sources disagree on whether Musubi's second flag is at Amala Temple (Game8) or the Mifunashiro Hall of Mirrors (Samurai Gamers); `hs-chiaki` covers both.
- **Labyrinth of Amala**: Fiends and Kalpas interleave, because each Kalpa opens with Candelabra (Game8: Menorahs) from the Fiends before it: Matador → Kalpa 1 → Daisoujou, Hell Biker → Kalpa 2 → White, Red, Black Rider → Kalpa 3 (Raidou/Dante at its end) → Pale Rider, Mother Harlot, Trumpeter → Kalpa 4 → Kalpa 5. Completing it is required for the True Demon ending and unlocks Pierce.

### State

```ts
interface StoryState {
  milestones: { id: string; title: string; kind: "story" | "labyrinth" | "fiend" | "side" | "hardsave" | "ending";
                recommendedLevel?: number; available: boolean; done: boolean; verified: boolean; notes?: string }[];
  saveSlots: { slot: number; label: string; milestoneId?: string; locked: boolean }[];
  endingsSeen: string[];
}
```

### "What next?" recommendation (Dashboard)

Evaluate these rules in order and show the first match, plus the reason:

1. **Next milestone is a hard save** → big banner: "Hard save now in a new slot" with the slot to use. Hard-save slots are shown as locked and the UI warns before reusing one.
2. **Labyrinth content (Kalpa or Fiend) is available and not done**:
   - If the player's level is at least its `recommendedLevel` minus 3 (or no level is set) → recommend the Labyrinth.
   - Otherwise → recommend side quests or leveling first, and show the gap.
3. **Labyrinth not complete and the next story milestone is the Tower of Kagutsuchi** → warning that the Labyrinth must be finished first (True Demon ending and Pierce).
4. **An available side quest has a recommendedLevel ≤ player level** → mention it as an option.
5. Otherwise → recommend the next story milestone.

Also show an endings tracker (6 endings, checked when seen) and a mini flowchart of the hard saves and the ending that branches from each.

## Feature 2: Demi-fiend tracker and skill schedule

### Current state panel

Level, stats, the 8 skill slots (target-build skills highlighted), equipped Magatama, owned Magatama with their next skill and its level.

### Level-up flow

A **Level up** button:

1. Pre-selects the Magatama recommended by the scheduler (player can change it).
2. Shows the skill that Magatama will teach at the new level, or "nothing learned" if the requirement isn't met.
3. If a skill is offered: Learn into a free slot, Learn and replace (with the scheduler's suggested slot pre-selected) or Decline.
4. Suggests a stat point from the stat plan; the player confirms or picks another.
5. Saves and recalculates the schedule. Include **Undo last level-up**.

Also allow manual edits to everything (level, stats, skills, progress) for when the player forgets to log.

### Scheduler

Simulate future level-ups from `level + 1` to 99 using owned Magatama. At each level `L`, a Magatama is a **candidate** if its next pending skill has `level ≤ L` (or no level requirement with its unlock condition met). Pick by priority:

1. A candidate whose next skill **is a target skill**.
2. A candidate whose later skills include a pending target skill. Tie-break: the target that can be **completed earliest** (simulate consecutive steps: `lvl = max(lvl, req)` per step, next step at `lvl + 1`), then fewer remaining steps.
3. A candidate that progresses toward a wishlist skill.
4. Any candidate (a "free level").
5. No candidate: "no skill this level."

For each planned step, choose an action:

- Target skill → **Learn**. If slots are full, replace the non-target skill with the **lowest** priority: skills not in `interimKeep` first, then `interimKeep` from the end of the list. Never replace a target skill.
- Wishlist skill → learn if a slot is free or it beats the lowest-priority kept skill, else decline.
- Anything else → **Decline** (unless a slot is free).

Show the plan as a table: Level, Magatama, Skill, Action, Replaces.

### Late-Magatama windows

For each target skill on a Magatama the player **doesn't own yet**, show how many level-ups it needs and the earliest window, so the player knows what to expect:

| Magatama | Level-ups needed | Target | Earliest window |
|---|---|---|---|
| Djed | 4 | Rakukaja | Level-ups to 42–45 |
| Vimana | 1 | Endure | Any level-up from 50 |
| Satan | 5 | Deadly Fury | Level-ups to 61–65 |
| Kailash | 4 | Freikugel | Level-ups to 77–80 |
| Marogareh | 1 | Pierce | First level-up after Labyrinth complete |

Compute these from the data, don't hard-code them. If the player gets a Magatama late, the window becomes "the next N level-ups." Flag when two windows overlap.

### Stat plan

Repeat `statPattern` (default STR, STR, VIT), skipping any stat that reached its target. When all targets are met, suggest the lowest of the targeted stats. Show a progress bar per stat. Magatama can change stats, so the player always enters actual values.

## Feature 3: Build planner

- Pick 8 target skills from the full skill list (searchable, grouped by Magatama, showing level, cost and effect).
- For each target, show: source Magatama, owned or not, steps remaining, earliest level, and status (learned, scheduled at level X, waiting for Magatama, blocked by Labyrinth).
- Edit `interimKeep` (drag to reorder), `wishlist`, `statPattern` and `statTargets`.
- Changing anything here recalculates the schedule immediately.

## Acceptance tests (Vitest, run with `npm test`)

From the level 22 test fixture (`tests/fixtures/save-level22.json`), the scheduler must produce:

| Level | Magatama | Skill | Action |
|---|---|---|---|
| 23 | Kamudo | Focus | Learn, replace Ice Breath |
| 24 | Hifumi | Tornado | Decline |
| 25 | Hifumi | Force Boost | Decline |
| 26 | Hifumi | War Cry | Learn, replace Analyze |
| 27 | Kamudo | Mind's Eye | Decline |
| 28 | any | free level | Decline |
| 29 | Kamudo | Might | Learn, replace Tarunda |

Also test:

- From the new-game seed, Marogareh is scheduled for Lunge at level 3 and Analyze at level 4, and the app starts at level 1 with no skills.
- The late-Magatama window table above is reproduced from the data.
- Pierce is never scheduled while `labyrinthComplete` is false, and is scheduled at the next level-up once it's true.
- A target skill is never chosen as a replacement.
- Level-up with a Magatama whose next skill needs a higher level learns nothing and doesn't advance the pointer.
- Export then import round-trips the full state.

## Suggested build order

1. Data loading, types, the new-game seed and the level 22 test fixture
2. Scheduler and tests
3. Demi-fiend panel and level-up flow
4. Build planner
5. Story planner and dashboard recommendation
6. Export/import and polish

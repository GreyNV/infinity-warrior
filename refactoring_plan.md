# Infinity Warrior Refactoring Plan

## 1) Objective and Refactoring North Star
Ship faster by making the codebase easier to reason about, safer to tune, and easier to test without changing game feel unexpectedly.

Refactoring priorities:
1. Keep simulation deterministic and rendering-agnostic.
2. Reduce duplicated formula wiring between simulation/UI/persistence.
3. Create stable module boundaries so balance iterations are low-risk.
4. Make progression and combat changes verifiable with lightweight scripted checks.

## 2) Quick Review Snapshot (Current Risks)

1. **`src/simulation.js` is carrying too many responsibilities** (state schema, movement, encounter spawning, combat, leveling, cultivation flow, world helpers, rarity rolls, and stat bookkeeping), which increases accidental coupling and regression risk.
2. **State shape contracts are implicit**, so UI and persistence rely on shared assumptions instead of explicit adapters.
3. **UI rendering in `src/main.js` uses large inline template functions**, mixing domain lookups with markup generation and event binding logic.
4. **Persistence and offline progression logic is useful but tightly bound to simulation state internals**, making schema migrations harder.
5. **No dedicated automated test folder yet**; current validation is mostly syntax/smoke runs.

## 3) Target Module Architecture

### 3.1 Simulation Domain Split
Create a `src/sim/` directory and split into single-purpose files:
- `state.js`: baseline state factories and schema version helpers.
- `combat.js`: damage, attack intervals, combat resolution.
- `world.js`: hex movement, reveal, spawn chance, chain logic, biome selection.
- `progression.js`: XP thresholds, level-up processors, prestige logic.
- `cultivation.js`: flow distribution, essence conversion, body/mind/spirit progression.
- `tick.js`: top-level deterministic tick orchestrator.

Why: isolates balancing edits to focused modules and prevents “one large file” regression cascades.

### 3.2 Shared Read Model Layer
Add `src/selectors/` for computed display values used by both renderer and UI:
- `player-selectors.js` (overall power, attack speed, max HP, regen).
- `enemy-selectors.js` (preview enemy stats at depth and active enemy fallback).
- `progress-selectors.js` (progress ratios, threshold displays).

Why: removes duplicate math paths across `main.js`, render helpers, and persistence summary text.

### 3.3 UI Composition Split
Split `src/main.js` into:
- `app/create-game-app.js` (runtime loop, autosave, wiring).
- `ui/dom.js` (DOM querying + element cache).
- `ui/tabs/*.js` (character, battle, cultivation, stats tab renderers).
- `ui/events.js` (tab/mode/slider binding).

Why: simpler event lifecycle management and cleaner handoff for future UI additions.

## 4) Refactoring Milestones (Execution Order)

### Milestone A — Safe Extraction Foundation
1. Add `src/sim/` modules with pure function exports while keeping current API surface (`simulateTick`, `createInitialSimulationState`) as compatibility wrappers.
2. Move helper clusters first (threshold and formula helpers), then move orchestration logic.
3. Keep one integration file exporting current names to avoid breaking imports.

**Done criteria:** `main.js` works with unchanged behavior and smoke scripts pass.

### Milestone B — State Contract + Migration Guardrails
1. Introduce a small `STATE_VERSION` and migration map in persistence.
2. Add explicit normalize/validate routines for loaded state slices (`run`, `persistent`, `world`, `cultivation`, `statistics`).
3. Centralize defaults in one place (state factory), not duplicated across persistence fallbacks.

**Done criteria:** old saves load through migration path and malformed fields are clamped.

### Milestone C — UI/Selector Cleanup
1. Move `renderCharacterTab`, `renderBattleTab`, `renderCultivationTab`, and `renderStatsTab` into `src/ui/tabs/`.
2. Replace direct inline calculations in UI with selector calls.
3. Keep pub-sub but type event names in a constants map (`EVENTS.SIM_TICK`, etc.).

**Done criteria:** `main.js` becomes mostly composition/wiring and <250 lines.

### Milestone D — Deterministic Test Harness
1. Add lightweight Node tests under `tests/` for progression thresholds, spawn pity behavior, defeat reset invariants, and offline parity rules.
2. Add seeded RNG support to world/combat rolls for deterministic test runs.
3. Add `npm` scripts (or shell scripts) for `check`, `test:sim`, `test:persistence`.

**Done criteria:** repeatable simulation tests run in CI/local without browser dependency.

### Milestone E — Performance and UX Safety Pass
1. Minimize repeated `innerHTML` full replacement for large sections by updating only changed panels.
2. Prevent duplicate slider listeners on rerender by binding once and syncing value only.
3. Audit structured cloning in tick path for hot-loop cost and switch to targeted immutable updates where practical.

**Done criteria:** frame pacing stable under long sessions and no listener leak warnings.

## 5) Suggested Task Breakdown for Next 2 Iterations

### Iteration 1 (high confidence)
1. Extract simulation helpers into `src/sim/progression.js`, `src/sim/combat.js`, `src/sim/world.js`.
2. Introduce selector layer and migrate character tab calculations.
3. Add first deterministic tests for XP thresholds + defeat reset.

### Iteration 2 (stability hardening)
1. Implement persistence state versioning + migrations.
2. Split UI tabs into separate modules and reduce `main.js` scope.
3. Add seeded RNG and pity/chain spawn tests.

## 6) Agent Handoff Character Sheet (from `AGENTS.md`)

Use this as operating context for refactor execution:
- **Role:** experienced game designer + JavaScript developer focused on implementation-ready, shippable increments.
- **Preferred style:** clear structured Markdown, explain why, keep examples practical.
- **Stack:** browser runtime, vanilla JavaScript, Canvas 2D, localStorage persistence, no external frameworks.
- **Project constraints:** configurable formulas, deterministic simulation, simulation/render separation, legible feedback.
- **Workflow:** check `progress.txt` before changes, implement, append concise changelog, run lightweight validation.

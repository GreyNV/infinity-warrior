# Infinity Warrior — Next Development Phase Plan (Refactor-First)

## 1) Phase Objective (Why this phase exists)
Build a reusable, scalable architecture that keeps simulation deterministic while making each feature change low-risk.

This phase prioritizes:
1. **Single-purpose modules/functions** so balancing edits stay localized.
2. **Low-argument APIs** (object parameters when >2 inputs) to reduce call-site mistakes.
3. **OOP orchestration shells** around pure simulation functions for extensibility.
4. **Shared read-model selectors** so UI, renderer, and persistence stop duplicating formulas.

## 2) Current Infrastructure Snapshot
The project already has strong foundations:
- Simulation helper extraction exists in `src/sim/` (`combat.js`, `progression.js`, `world.js`, `index.js`).
- App loop orchestration and pub-sub exist in `src/main.js`.
- Persistence and offline progression exist in `src/persistence.js`.
- Formula/config centralization exists in `src/config.js`.

Primary gaps to close next:
1. `src/main.js` still mixes orchestration, DOM composition, and tab-level rendering.
2. State contracts are still implied across simulation/UI/persistence.
3. Repeated derived-stat math still appears in multiple layers.
4. Persistence versioning is minimal and not migration-oriented.

## 3) Architectural Target for This Phase

### 3.1 Domain + Application Layers
- **Domain (pure functions):** `src/sim/*`, no DOM access, deterministic math only.
- **Application (OOP controllers):** classes that coordinate state updates and IO boundaries.
- **Presentation (UI/render):** tab presenters + selector-driven read models.

### 3.2 Proposed OOP Infrastructure
1. `GameSession` (application root)
   - owns runtime state, clock, autosave cadence, and lifecycle (`start`, `pause`, `step`).
2. `SimulationEngine`
   - wraps `simulateTick` and exposes deterministic stepping + batched event output.
3. `UiController`
   - handles tab switching, mode switching, and one-time event bindings.
4. `SaveController`
   - owns serialization, schema version checks, migration dispatch, and offline apply.
5. `EventBus` (keep existing pattern)
   - typed event constants and payload contracts.

Why: this gives reusable boundaries for future additions (upgrades, milestones, automation) without expanding one mega-file.

## 4) Function Design Rules (Enforced in this phase)
1. **Single responsibility per function** (one transformation or one side effect).
2. **Max 2 positional params**; use object params otherwise:
   - `applyOfflineProgress({ state, elapsedMs, config })`
   - `renderCharacterTab({ state, selectors, config })`
3. **No hidden mutation across layers**:
   - domain returns values; controllers decide assignment.
4. **Deterministic domain APIs**:
   - all randomness enters through injected RNG functions.

## 5) Execution Plan (Milestone sequence)

### Milestone 1 — State Contract + Selector Layer
1. Add `src/state/schema.js` for canonical shape + defaults.
2. Add `src/state/validate.js` for load-time clamping/normalization.
3. Add `src/selectors/player.js`, `src/selectors/enemy.js`, `src/selectors/progression.js`.
4. Replace inline UI calculations with selectors.

**Done when:** UI and renderer use selectors for derived stats, and load path uses shared schema normalization.

### Milestone 2 — Main Loop OOP Split
1. Create `src/app/game-session.js` (`GameSession` class).
2. Create `src/app/simulation-engine.js` (`SimulationEngine` class).
3. Create `src/app/ui-controller.js` for DOM events + tab routing.
4. Reduce `src/main.js` to composition/bootstrap only.

**Done when:** `src/main.js` is a thin wiring file and all runtime behavior is preserved.

### Milestone 3 — Persistence Hardening
1. Introduce `SAVE_VERSION` migration map (`v1 -> v2 ...`).
2. Move offline progression helpers into focused modules:
   - `src/persistence/offline.js`
   - `src/persistence/migrations.js`
3. Add guardrails for malformed saves with explicit fallback reports.

**Done when:** older saves migrate automatically and corrupted slices recover safely.

### Milestone 4 — Deterministic Test Harness
1. Add `tests/sim/progression.test.js` for threshold and prestige parity checks.
2. Add `tests/sim/reset.test.js` for defeat reset invariants.
3. Add `tests/persistence/offline.test.js` for offline gain parity/limits.
4. Add seeded RNG helper for reproducible world/combat tests.

**Done when:** repeatable non-browser tests verify progression and persistence invariants.

## 6) Practical Interfaces (Implementation-ready examples)

```js
// Object-parameter style keeps call sites readable and extensible.
export function resolveCombatStep({ state, config, dtMs, rng }) {
  // pure deterministic combat calculations
}
```

```js
export class SimulationEngine {
  constructor({ config, tickFn }) {
    this.config = config;
    this.tickFn = tickFn;
  }

  step({ state, dtMs }) {
    const nextState = this.tickFn(state, dtMs, this.config);
    return { nextState, events: nextState.combatLog };
  }
}
```

```js
export function selectCharacterPanelModel({ state, config }) {
  return {
    attack: /* derived */ 0,
    maxHp: /* derived */ 0,
    regen: /* derived */ 0
  };
}
```

## 7) Pacing + Delivery (2-week slice)
1. **Days 1-3:** Milestone 1 (schema + selectors).
2. **Days 4-6:** Milestone 2 (OOP split of app loop/UI controller).
3. **Days 7-9:** Milestone 3 (persistence migration scaffolding).
4. **Days 10-12:** Milestone 4 (deterministic tests + seeded RNG).
5. **Days 13-14:** bugfix buffer + tuning verification.

## 8) Risk Controls
1. Keep compatibility exports in `src/simulation.js` until migration is complete.
2. Refactor in vertical slices (one tab + one selector set at a time).
3. Run smoke checks after each slice (`node --check` + deterministic sim script).
4. Use event payload snapshots to detect accidental contract drift.

## 9) Agent Character Sheet (Operational Handoff)
Use this to align future contributors quickly:
- **Role:** experienced game designer + JavaScript developer shipping practical MVP increments.
- **Preferred style:** clear structured Markdown, explain why, practical examples over heavy abstraction.
- **Stack:** browser + vanilla JavaScript + Canvas 2D + localStorage.
- **Constraints:** deterministic simulation, rendering separation, configurable formulas, legible feedback.
- **Workflow:** check `progress.txt`, implement/update, append concise log, run lightweight validation.

Source of truth: `AGENTS.md`.

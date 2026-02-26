# Infinity Warrior — Next Development Phase Plan (Refactor-First)

**Ownership:** Technical architecture and refactor roadmap.

**Status legend:** `Planned` · `In Progress` · `Done` · `Deprecated`

## Completed Foundations
- Simulation helper extraction exists in `src/sim/` (`combat.js`, `progression.js`, `world.js`, `index.js`).
- App loop orchestration and pub-sub exist in `src/main.js`.
- Persistence and offline progression exist in `src/persistence.js`.
- Formula/config centralization exists in `src/config.js`.

## 1) Phase Objective (Why this phase exists)
Build a reusable, scalable architecture that keeps simulation deterministic while making each feature change low-risk.

This phase prioritizes:
1. **Single-purpose modules/functions** so balancing edits stay localized.
2. **Low-argument APIs** (object parameters when >2 inputs) to reduce call-site mistakes.
3. **OOP orchestration shells** around pure simulation functions for extensibility.
4. **Shared read-model selectors** so UI, renderer, and persistence stop duplicating formulas.

## 2) Current Infrastructure Snapshot
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

## 5) Contract Section — Canonical State + Event Payloads

Why this matters: explicit contracts reduce accidental drift between simulation, UI, and persistence, which keeps balancing and refactors safer.

### 5.1 Canonical State Slices (Required fields)

| Slice | Required fields | Purpose |
| --- | --- | --- |
| `run` | `currentHp`, `maxHp`, `xp`, `xpToNext`, `level`, `floor`, `activityMode` | Volatile in-run player progression and activity state. |
| `persistent` | `essence`, `strengthPrestigeLevel`, `endurancePrestigeLevel`, `strengthPrestigeXp`, `endurancePrestigeXp`, `lastSavedAt` | Cross-run progression and save metadata that survives defeat resets. |
| `world` | `seed`, `floorIndex`, `zoneId`, `encounterId`, `scaledDifficulty` | Deterministic world-generation identity + pacing context. |
| `resources` | `gold`, `essence`, `dust`, `shards` | Numeric currencies used by upgrades/crafting/progression sinks. |
| `unlocks` | `tabs`, `modes`, `upgrades`, `automation` | Capability flags/lists that gate UI and system behavior. |
| `cultivation` | `selectedFlow`, `flowRates`, `efficiency`, `lastTickGain` | Meditation/cultivation tuning inputs and outputs. |
| `statistics` | `totalDamageDealt`, `totalDamageTaken`, `kills`, `deaths`, `highestFloor` | Lifetime and run analytics for UX feedback and balancing. |
| `enemy` | `id`, `name`, `level`, `currentHp`, `maxHp`, `attack`, `defense`, `isBoss` | Active encounter combat target model. |
| `combatTimers` | `playerAttackMs`, `enemyAttackMs`, `regenMs`, `elapsedMs` | Accumulators that normalize real-time tick combat cadence. |

### 5.2 Event Payload Contract (Key emitted events)

| Event key | Required payload keys | Types | Semantic meaning |
| --- | --- | --- | --- |
| `combat:player_hit` | `timestamp`, `floor`, `enemyId`, `damage`, `enemyCurrentHp`, `isCrit` | `number`, `number`, `string`, `number`, `number`, `boolean` | Player dealt damage to current enemy; drives damage floaters and DPS logging. |
| `combat:enemy_hit` | `timestamp`, `floor`, `damage`, `playerCurrentHp`, `source` | `number`, `number`, `number`, `number`, `string` | Enemy dealt damage to player; drives hurt feedback and survival metrics. |
| `combat:victory` | `timestamp`, `floor`, `enemyId`, `rewards`, `nextFloor` | `number`, `number`, `string`, `object`, `number` | Enemy defeated; reward grant and progression to next encounter/floor. |
| `combat:defeat` | `timestamp`, `floor`, `enemyId`, `lostRunLevel`, `resetToFloor` | `number`, `number`, `string`, `number`, `number` | Player defeated; run reset flow while persistent state remains. |
| `mode:switched` | `timestamp`, `fromMode`, `toMode`, `reason` | `number`, `string`, `string`, `string` | Activity mode changed (e.g., combat ↔ cultivation), updates simulation branching. |
| `ui:tab_switched` | `timestamp`, `fromTab`, `toTab`, `source` | `number`, `string`, `string`, `string` | Active UI tab changed from user/system action for view routing and analytics. |

### 5.3 Invariant Rules (Must always hold)

1. **Non-negative resource invariant**
   - All values in `resources` and `persistent.essence` are clamped at `>= 0` after every simulation step and load/migration pass.
2. **Flow-rate normalization invariant**
   - `sum(cultivation.flowRates) === 1` when cultivation is active; if sum is zero/invalid, apply deterministic fallback distribution.
3. **Activity mode validity invariant**
   - `run.activityMode` must be one of canonical mode keys (`combat`, `cultivation`, `idle`). Unknown values are normalized to `idle`.
4. **Combat HP bounds invariant**
   - `0 <= run.currentHp <= run.maxHp` and `0 <= enemy.currentHp <= enemy.maxHp` at all times.
5. **Timer monotonicity invariant**
   - `combatTimers.*Ms` accumulators are never negative and only increase by `dt` or reset by exact interval subtraction.
6. **Unlocked surface invariant**
   - Every unlocked `tab`/`mode` entry in `unlocks` must map to a known presenter/simulation handler.

### 5.4 Breaking-Change Protocol (State/event contract updates)

1. **Version bump and changelog:** increment save/schema or event contract version and log the delta in `progress.txt` + refactor notes.
2. **Consumer impact audit:** identify all direct consumers (selectors, presenters, persistence, analytics) and update them in the same PR.
3. **Compatibility window:** add temporary adapters/default fillers for removed/renamed fields until all call sites are migrated.
4. **Validation update:** update schema validators, invariant checks, and payload tests/snapshots to enforce the new shape.
5. **Deprecation cleanup:** remove adapters only after one release cycle (or explicit milestone) confirms no remaining legacy consumers.

## 6) Execution Plan (Milestone sequence)

### [Planned] Milestone 1 — State Contract + Selector Layer
1. Add `src/state/schema.js` for canonical shape + defaults.
2. Add `src/state/validate.js` for load-time clamping/normalization.
3. Add `src/selectors/player.js`, `src/selectors/enemy.js`, `src/selectors/progression.js`.
4. Replace inline UI calculations with selectors.

**Done when:** UI and renderer use selectors for derived stats, and load path uses shared schema normalization.

### [Planned] Milestone 2 — Main Loop OOP Split
1. Create `src/app/game-session.js` (`GameSession` class).
2. Create `src/app/simulation-engine.js` (`SimulationEngine` class).
3. Create `src/app/ui-controller.js` for DOM events + tab routing.
4. Reduce `src/main.js` to composition/bootstrap only.

**Done when:** `src/main.js` is a thin wiring file and all runtime behavior is preserved.

### [Planned] Milestone 3 — Persistence Hardening
1. Introduce `SAVE_VERSION` migration map (`v1 -> v2 ...`).
2. Move offline progression helpers into focused modules:
   - `src/persistence/offline.js`
   - `src/persistence/migrations.js`
3. Add guardrails for malformed saves with explicit fallback reports.

**Done when:** older saves migrate automatically and corrupted slices recover safely.

### [Planned] Milestone 4 — Deterministic Test Harness
1. Add `tests/sim/progression.test.js` for threshold and prestige parity checks.
2. Add `tests/sim/reset.test.js` for defeat reset invariants.
3. Add `tests/persistence/offline.test.js` for offline gain parity/limits.
4. Add seeded RNG helper for reproducible world/combat tests.

**Done when:** repeatable non-browser tests verify progression and persistence invariants.

## 7) Practical Interfaces (Implementation-ready examples)

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

## 8) Pacing + Delivery (2-week slice)
1. **Days 1-3:** Milestone 1 (schema + selectors).
2. **Days 4-6:** Milestone 2 (OOP split of app loop/UI controller).
3. **Days 7-9:** Milestone 3 (persistence migration scaffolding).
4. **Days 10-12:** Milestone 4 (deterministic tests + seeded RNG).
5. **Days 13-14:** bugfix buffer + tuning verification.

## 9) Risk Controls
1. Keep compatibility exports in `src/simulation.js` until migration is complete.
2. Refactor in vertical slices (one tab + one selector set at a time).
3. Run smoke checks after each slice (`node --check` + deterministic sim script).
4. Use event payload snapshots to detect accidental contract drift.

## 10) Agent Character Sheet (Operational Handoff)
Use this to align future contributors quickly:
- **Role:** experienced game designer + JavaScript developer shipping practical MVP increments.
- **Preferred style:** clear structured Markdown, explain why, practical examples over heavy abstraction.
- **Stack:** browser + vanilla JavaScript + Canvas 2D + localStorage.
- **Constraints:** deterministic simulation, rendering separation, configurable formulas, legible feedback.
- **Workflow:** check `progress.txt`, implement/update, append concise log, run lightweight validation.

Source of truth: `AGENTS.md`.

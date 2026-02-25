# Infinity Tower — Development Plan (MVP First)

## Current Implementation Alignment (Confirmed Live Systems)
This plan is aligned to the gameplay terminology and systems currently described in `README.md`.

1. **Reveal spawn chance ramping is live** (pity-based reveal/encounter generation with guaranteed spawn after enough misses).
2. **Biome + rarity enemy modifiers are live** (encounters inherit biome theme and rarity tier to alter stats/identity).
3. **Battle/Cultivation activity modes are live** (mode switch changes progression behavior while encounter resolution remains deterministic).
4. **Persistence + offline flow are live** (localStorage save/load with timestamp-based offline gains and summary flow).

## Agent Character Sheet Context (From `AGENTS.md`)
Use these constraints when extending this plan so handoffs stay consistent:

- **Role:** experienced game designer + JavaScript developer optimizing for shippable MVP slices.
- **Style:** concise, structured Markdown with practical implementation detail and clear rationale.
- **Stack:** browser + vanilla JS + Canvas 2D + localStorage JSON persistence.
- **Constraints:** deterministic simulation separated from rendering, configurable formulas/constants, legible combat/progression feedback.
- **Workflow:** check `progress.txt`, implement/update docs, append concise change log, run lightweight validation.

---

## 0) Concept Summary and Core Loop
**Concept:**
*Infinity Tower* is now framed around **travel depth progression**, not a single floor-by-floor encounter ladder. The player auto-travels, reveals tiles, builds/clears encounter chains, and converts short-term run growth into persistent progression and Essence-backed long-term scaling.

**Core loop (depth/travel/reveal/encounter chain):**
1. Continue travel through hex directions and increase effective depth pressure.
2. Trigger reveal checks; spawn chance ramps using pity so encounters reliably appear.
3. Build encounter chains from reveal results (including deeper-chain pressure and multi-enemy pacing).
4. Resolve deterministic combat ticks against biome/rarity-modified enemies.
5. Convert combat actions into run growth + persistent growth (and Essence flow).
6. Repeat to push higher travel depth and improve re-entry speed after setbacks.

**Why this works:** short travel/combat loops maintain momentum while depth and persistent gains create visible medium- and long-term goals.

---

## 1) Game Mechanics (MVP Rules, Scope-Aligned)
1. **Travel + Reveal Encounter Generation**
   - Travel advances world exploration state instead of only incrementing a floor counter.
   - Reveal checks use pity/ramping spawn chance so droughts are bounded.
   - Encounter chains can include variable pressure at higher depth.
2. **Combat-Driven Attribute XP**
   - Damage dealt/taken drives run progression systems.
   - Persistent tracks gain reduced or parity-aligned XP by configured rule set.
   - Combat remains fixed-timestep deterministic for tuning and replayability.
3. **Activity Modes**
   - **Battle mode:** active encounter progression and combat resource flow.
   - **Cultivation mode:** progression focus shifts while encounter/travel logic follows current implementation pause/resolve rules.
4. **Setbacks and Recovery**
   - Run state can reset while persistent progress and key resources remain.
   - Re-entry speed improves through persistent progression + Essence-backed upgrades.

---

## 2) Resource and Progression System
### Primary state slices and resources
- **`run`:** short-term levels, temporary combat performance, run-local XP state.
- **`persistent`:** long-term progression that survives setbacks.
- **`world`:** travel/reveal/depth context and best-depth tracking.
- **`resources`:** Essence and other spendable progression currencies.
- **`enemy`:** active encounter target profile (biome, rarity, combat values).
- **`combatTimers`:** deterministic cadence state for attacks/intervals.

### Progression layers
1. **Run progression (short-term):** moment-to-moment combat growth.
2. **Persistent progression (long-term):** prestige/cultivation/meta layers retained across resets.
3. **Depth milestone progression:** unlock pacing tied to travel depth and `world.bestDepth`.

**Terminology update:** replace legacy “floor record” references with **`world.bestDepth`** and related travel-depth concepts.

---

## 3) Visual/UI Feedback (Minimal Geometric Direction)
1. Keep Canvas entities geometric and readable (circle/square/line pulses).
2. Display encounter identity with biome/rarity color coding.
3. Show clear deltas and bars for run/persistent growth changes.
4. Prioritize compact HUD readability for depth, chain pressure, Essence flow, and activity mode.

---

## 4) Formulas and Balance Targets (Config-Driven)
Use config objects for all pacing constants so balancing is low-friction:

- Reveal pity/ramp parameters (spawn chance floor, ramp per miss, guaranteed threshold).
- Biome + rarity modifiers (HP/attack/reward multipliers).
- Run XP and persistent XP curves.
- Essence reward curves vs depth.
- Encounter chain pressure controls at deeper travel levels.

**Balance objective:** every short session should produce visible run progression plus at least one meaningful persistent gain window.

---

## 5) Architecture Notes
1. Keep simulation deterministic and rendering-agnostic.
2. Keep functions single-purpose and favor object-parameter APIs when argument count grows.
3. Keep save payload/versioning explicit and migration-safe.
4. Route UI updates from stable state/event contracts, not ad hoc renderer state.

---

## 6) Tick and Render Loop
- **Simulation:** fixed-step tick updates for combat, travel/reveal transitions, timers, and progression.
- **Rendering:** `requestAnimationFrame` for smooth feedback and mode-aware UI.
- **Offline:** timestamp delta converted via capped simulation/economy rules.

---

## 7) MVP Milestones (Updated Framing)
1. Lock state schema contract for `run` / `persistent` / `world` / `resources` / `enemy` / `combatTimers`.
2. Finalize travel+reveal encounter generation and depth pacing.
3. Finalize biome/rarity modifier tuning and encounter readability.
4. Finalize battle/cultivation mode transitions and UX clarity.
5. Finalize persistence + offline return summary and edge-case handling.
6. Perform targeted balance pass for first 10-minute retention loop.

---

## 8) Archived Design Notes (Outdated Framing)
The following were valid in earlier planning drafts but are no longer canonical for implementation terminology:

- **Archived:** “single enemy per floor” assumption.
- **Archived:** “climb floor N → N+1” as the primary progression framing.
- **Archived:** “floor reset to 1” language as the default narrative for setbacks.
- **Replacement framing:** depth/travel/reveal/encounter-chain progression, with state and milestones centered on `world.bestDepth` and travel depth concepts.

---

## 9) Save/Load + Offline Notes
1. Persist schema with version and `lastSeenTimestamp`.
2. Restore deterministic state slices plus UI-safe defaults.
3. Apply capped offline conversion for Essence/cultivation/progression flows.
4. Present a compact “while away” delta summary to preserve clarity and trust.

---

## 10) Acceptance Criteria (Exact State Identifiers)
A plan update is considered complete when all criteria below are true:

1. **`run`** terminology is used for short-term progression; no canonical section depends on floor-only framing.
2. **`persistent`** terminology is used for retained progression and reset-surviving systems.
3. **`world`** explicitly references travel depth and `world.bestDepth` (not floor record wording).
4. **`resources`** is used for Essence/currency framing in progression and offline sections.
5. **`enemy`** is documented as biome/rarity-modified encounter state, not a floor-only placeholder.
6. **`combatTimers`** is explicitly included in deterministic simulation/tick contract language.
7. Archived assumptions (single-floor enemy / floor-reset framing) are clearly marked under **Archived Design Notes**.

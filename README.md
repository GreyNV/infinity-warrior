# Infinity Warrior

A minimalist browser incremental game prototype built with vanilla JavaScript + Canvas.

## Current Scope (As Implemented)

The current playable slice is no longer the original floor-only clicker outline. It now centers on **hex-travel encounters**, short combat chains, and persistent growth loops.

### Gameplay Loop Snapshot
1. The player auto-travels through hex directions and reveals new tiles.
2. Reveals use a pity-based spawn system to generate encounters (guaranteed after enough misses).
3. Enemies inherit biome theme + rarity tier, which modify stats and visual identity.
4. Combat resolves in deterministic simulation ticks (movement, attack intervals, damage exchange).
5. Strength/Endurance gain run XP from combat actions, while prestige tracks gain reduced persistent XP.
6. Defeat resets run stats/progress while preserving persistent progression and Essence.
7. Cultivation unlocks Body/Mind/Spirit progression, converting Essence flow into regen, attack-speed, and Ki-cap growth.

## Agent Character Sheet (Operational Context)

Use `AGENTS.md` as the working role definition for planning/implementation:
- **Role:** experienced game designer + JavaScript developer focused on shippable MVP steps.
- **Style:** clear Markdown, implementation-ready guidance, explain the “why”.
- **Stack:** browser + vanilla JS + Canvas 2D + localStorage persistence.
- **Constraints:** deterministic simulation separated from rendering, configurable formulas, legible feedback.
- **Workflow:** check `progress.txt` first, implement, log concise change note, run lightweight validation.

## New MVP Plan (Scope-Aligned)

This plan reflects current code reality and focuses on shipping a coherent MVP quickly.

### 1) Stabilize the Core Simulation Contract
- Freeze state schema (`run`, `persistent`, `world`, `resources`, `combatTimers`, `enemy`).
- Document event payloads emitted to renderer/UI.
- Add regression smoke checks for encounter generation, reset behavior, and level-up edge cases.
- Why: reliable contracts reduce accidental pacing and UI breakage during iteration.

### 2) Finish Persistence + Offline Progression
- Implement versioned save/load through `localStorage`.
- Save run + persistent slices with timestamps.
- On load, grant capped offline gains for Essence and cultivation flow.
- Show a small “while away” summary panel.
- Why: persistence is mandatory for incremental retention and practical playtesting.

### 3) Lock the HUD for Readability
- Keep one always-visible compact panel: floor/best, depth, chain, essence, STR/END/Mind/Body/Spirit.
- Add explicit progress bars for run XP, prestige XP, and cultivation essence thresholds.
- Surface biome + rarity as color-coded badges during encounters.
- Why: clarity improves player motivation and makes balance tuning measurable.

### 4) Add a Minimal Upgrade Layer
- Add config-driven Essence upgrades (e.g., XP gain multiplier, essence gain multiplier, flow efficiency).
- Implement purchase validation, escalating costs, and caps.
- Render a simple upgrade panel (name, level, cost, effect delta).
- Why: upgrades add agency and smooth reset frustration.

### 5) Integrate Milestone Unlocks
- Unlock cultivation tab and automation features via depth/best-floor milestones.
- Add small UX boosts (auto-resume travel after combat, optional speed toggle).
- Keep thresholds in config only.
- Why: milestone rewards create medium-term goals without new systems.

### 6) Ship MVP Balance Pass
- Run repeated 5–10 minute loops.
- Tune spawn pity, rarity weights, XP curves, prestige gain, and cultivation scaling.
- Capture a short tuning changelog with before/after constants.
- Why: MVP success depends on momentum and avoiding progression dead zones.

## Recommended Immediate Backlog (Next 3 Tasks)
1. ✅ Implemented `saveGame/loadGame/applyOfflineProgress` module with schema versioning.
2. Add progress bars + combat badges in UI for run XP/prestige XP/rarity visibility.
3. Add first 3 Essence upgrades and wire purchase actions to simulation state.

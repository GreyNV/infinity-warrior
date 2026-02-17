# Infinity Warrior

## Ordered Next Steps (Execution Plan)

1. **Create the configurable simulation core (combat + progression formulas).**
   - Build a `config` object for enemy scaling, XP curves, prestige gain, and timing constants.
   - Implement deterministic tick-based combat functions (no rendering dependency).
   - Why first: all balance, progression, and later UI depend on stable simulation outputs.

2. **Implement state model + reset logic for run vs persistent progression.**
   - Add explicit state slices for run stats (STR/END levels + XP), persistent prestige tracks, essence, floor, and record.
   - Implement victory flow and defeat-reset flow (reset run stats to baseline, retain essence + prestige).
   - Why second: this is the core identity loop and must be correct before interface work.

3. **Add level-up and prestige progression handlers.**
   - Process Strength XP from damage dealt and Endurance XP from damage taken.
   - Process reduced-gain prestige XP for both attributes and resolve threshold-based level-ups.
   - Why third: this creates the short-term and long-term rewards that drive retention.

4. **Build a minimal Canvas combat view with readable feedback.**
   - Draw geometric entities (player circle, enemy square), HP bars, hit flashes, and damage/XP popups.
   - Keep rendering as a consumer of simulation state only.
   - Why fourth: visual clarity validates the loop quickly without blocking on advanced art/UI.

5. **Create the core HUD and progression panels.**
   - Show floor, current stats, prestige levels, essence totals, and next-threshold progress bars.
   - Include obvious color coding for run vs persistent gains.
   - Why fifth: players need legible goals and deltas to understand improvement.

6. **Implement Essence upgrade purchasing with config-driven definitions.**
   - Add upgrade registry (cost growth, effect scaling, caps) and spending logic.
   - Start with XP gain and essence economy boosters from the design plan.
   - Why sixth: spending choices add agency and smooth post-reset pacing.

7. **Add autosave/load with versioned localStorage payload.**
   - Persist run state, persistent state, resources, timestamps, and schema version.
   - Autosave on interval and visibility/unload transitions.
   - Why seventh: protects player progress and enables reliable iteration testing.

8. **Implement capped offline progression and return summary modal.**
   - On load, compute elapsed time and grant capped condensed rewards (essence + optional prestige XP).
   - Present concise “while you were away” breakdown.
   - Why eighth: boosts return motivation while keeping economy controlled.

9. **Add milestone unlock flags + lightweight QoL automation.**
   - Unlock auto-retry/auto-upgrade and optional speed controls at floor milestones.
   - Keep all unlock thresholds in config for fast balance tuning.
   - Why ninth: improves session flow once the base loop is proven.

10. **Run a short balancing pass and document tuning knobs.**
   - Execute multiple 5–10 minute play loops and adjust high-impact constants (XP curves, prestige coefficients, essence rewards, upgrade costs).
   - Record before/after values and observed pacing outcomes.
   - Why tenth: ensures MVP feels rewarding and avoids dead zones before expansion.

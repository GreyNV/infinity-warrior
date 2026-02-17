# Infinity Tower — Development Plan (MVP First)

## 0) Concept Summary and Core Loop
**Concept:**
*Infinity Tower* is a minimalist incremental game where the player climbs infinite floors through short auto-resolved encounters. The run starts with two core growth attributes — **Strength** and **Endurance** — that gain experience directly from combat events (damage dealt and damage taken). The player builds persistent prestige tracks for all basic stats — **Strength Prestige** and **Endurance Prestige** — which survive defeat resets, while **Essence** is earned from victories and accumulated across resets for meta progression.

**Core loop (engagement driver):**
1. Start/continue climb on current floor from run level 1 stats.
2. Resolve combat automatically; each hit grants Strength/Endurance XP from actual damage values.
3. Win to gain Essence and advance; lose to trigger run reset back to level 1.
4. Keep accumulated Essence and permanent prestige progress for all basic stats.
5. Spend resources and re-climb faster using persistent gains.
6. Repeat to push higher floors and improve long-term scaling.

**Why this works:** quick win cycles + visible number growth + simple but satisfying feedback = strong “one more floor” motivation.

---

## 1) Game Mechanics (Clear MVP Rules)
1. **Floor Encounters**
   - Each floor has one enemy generated from floor number.
   - Combat is auto-simulated in fixed ticks.
   - Player and enemy exchange damage until one reaches 0 HP.
2. **Combat-Driven Attribute XP**
   - Every attack grants **Strength XP = damage dealt**.
   - Every received hit grants **Endurance XP = damage received**.
   - Every attack also grants **Strength Prestige XP** using a reduced gain coefficient.
   - Every received hit also grants **Endurance Prestige XP** using its own reduced gain coefficient.
3. **Win/Lose Outcome**
   - Win: gain Essence and floor increment.
   - Lose: run reset to floor 1 + base run levels (Strength/Endurance run levels reset), but all prestige levels and Essence are retained.
4. **Progress Gate**
   - Enemy scaling outpaces fresh run stats.
   - Permanent prestige + stored Essence create faster re-climbs after each defeat.

**Engagement reinforcement:** deterministic loop with rising challenge gives predictable goals and reward anticipation.

---

## 2) Resource and Progression System
### Primary resources
- **Strength XP:** gained from damage dealt; levels run Strength.
- **Endurance XP:** gained from damage received; levels run Endurance.
- **Strength Prestige XP:** gained on each attack with slower scaling; increases permanent Strength Prestige level.
- **Endurance Prestige XP:** gained on each received hit with slower scaling; increases permanent Endurance Prestige level.
- **Essence:** awarded for successful fights and kept across resets.
- **Floor Record:** highest floor reached; used for unlock pacing.

### Progression layers
1. **Run progression (short-term):** Strength and Endurance run levels rise during combat, then reset on defeat.
2. **Persistent progression (long-term):** Strength/Endurance Prestige levels and Essence persist across defeats.
3. **Milestone unlocks:** floor-based unlocks for QoL and additional systems.

**Engagement reinforcement:** two-layer progression prevents stagnation and creates both short and long goals.

---

## 3) Player Stats and Upgrade System
### Core stats
- `strengthLevel` (run)
- `enduranceLevel` (run)
- `strengthPrestigeLevel` (persistent)
- `endurancePrestigeLevel` (persistent)
- `maxHp` (derived from Endurance + Endurance Prestige)
- `attack` (derived from Strength + Strength Prestige bonus)
- `attackSpeed` (optional secondary)
- `essenceGainMult` (from upgrades/prestige)

### Upgrade categories
1. **Run curve helpers:** improve XP conversion efficiency (e.g., +% Strength XP gain).
2. **Essence economy boosters:** +Essence gain per victory.
3. **Persistence boosters:** amplify Strength/Endurance Prestige contribution to derived stats.
4. **QoL automation:** auto-retry/auto-upgrade once milestones are reached.

### Example upgrade definition
```js
/**
 * Cost grows exponentially, effect grows additively or multiplicatively.
 */
const upgrades = {
  strengthXpBoost: {
    label: "Combat Discipline",
    baseCost: 20,
    costGrowth: 1.17,
    effectPerLevel: 0.05, // +5% strength XP gain
    maxLevel: 100
  }
};
```

**Engagement reinforcement:** player choices create ownership; visible stat jumps create satisfying feedback loops.

---

## 4) Minimal Shapes-Based Visual Feedback (Canvas 2D)
No sprites, only geometric primitives:
- **Player:** blue circle.
- **Enemy:** red square.
- **Attack event:** white line flash between entities.
- **Damage popup:** floating text `-12` and tiny XP text `+12 STR XP` / `+6 END XP`.
- **HP bars:** rectangles above entities.
- **Progress ring/bar:** floor encounter completion.

### Canvas example (illustrative only)
```js
/** Draw player and enemy using primitive shapes */
function drawEntities(ctx, state) {
  const { player, enemy } = state;

  // Player (circle)
  ctx.fillStyle = '#4da3ff';
  ctx.beginPath();
  ctx.arc(120, 180, 24, 0, Math.PI * 2);
  ctx.fill();

  // Enemy (square)
  ctx.fillStyle = '#ff5b5b';
  ctx.fillRect(280, 156, 48, 48);

  // Hit flash line
  if (state.lastHitMs < 80) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(140, 180);
    ctx.lineTo(280, 180);
    ctx.stroke();
  }
}
```

**Engagement reinforcement:** even simple shape animation gives moment-to-moment clarity and impact.

---

## 5) UI Layout and Feedback Ideas
### Suggested layout
1. **Top bar:** Floor, time played, run speed toggle.
2. **Center panel (Canvas):** live encounter visualization.
3. **Right panel:** Player stats + current modifiers.
4. **Bottom panel:** upgrade buttons and current reset-retained values (Essence, STR/END Prestige).
5. **Toast zone:** “Floor Cleared”, “STR Level Up!”, “END Prestige +X”.

### Feedback patterns
- Color-coded gains: green for income, red for damage.
- Button pulse when affordable.
- Small shake/pulse on enemy when hit.
- Progress bar fill animation on floor clear.

**Engagement reinforcement:** constant UI micro-feedback improves comprehension and reward perception.

---

## 6) Economy Formulas and Balancing Guidelines
### Core formulas (starting point)
```txt
enemyHp(floor)         = 30 * floor^1.35
enemyAttack(floor)     = 4  * floor^1.18
essenceReward(floor)   = 10 * floor^1.20
strengthXpGain(hitDmg) = hitDmg
enduranceXpGain(hitDmg)= hitDmg
strPrestigeXpGain(hitDmg) = hitDmg * 0.08
endPrestigeXpGain(hitDmg) = hitDmg * 0.08
```

### Upgrade cost/effect
```txt
xpToNextRunLevel(level)      = 20 * level^1.30
xpToNextPrestige(level)      = 120 * level^1.55
attackFromStrength           = 5 + strengthLevel*1.8 + strengthPrestigeLevel*0.9
maxHpFromEndurance           = 40 + enduranceLevel*6 + endurancePrestigeLevel*4
```

### Example early-game numbers
- Floor 1 enemy HP: ~30, reward ~10 essence.
- First few hits (~6 dmg) grant ~6 Strength XP per attack and ~0.5 Prestige XP.
- Run Strength level 1→2 target XP: 20; Prestige level 1→2 target XP: 120 (much slower).

### Balancing guidelines
1. First run-level up should occur in first 10–20 seconds.
2. First persistent prestige gains for both STR and END should land in first 2–4 minutes.
3. Defeat-reset loop should feel productive because Essence and Prestige are always retained.
4. If players stall after reset, boost base Essence reward or XP coefficients by 10–15%.

**Engagement reinforcement:** consistent cadence of reward, challenge, and unlocks avoids boredom and frustration.

---

## 7) Architecture and Tech Stack (Vanilla JS)
### Suggested folders
```txt
/src
  /core
    gameState.js
    simulation.js
    economy.js
    saveSystem.js
  /render
    canvasRenderer.js
    uiRenderer.js
  /config
    balance.json
    upgrades.json
  main.js
index.html
styles.css
```

### Module responsibilities
- `gameState`: source of truth + initialization.
- `simulation`: tick updates, combat, floor transitions.
- `economy`: reward/cost/stat formulas.
- `saveSystem`: serialization, migrations, offline rewards.
- `canvasRenderer`: draw entities + effects.
- `uiRenderer`: bind DOM controls and labels.

**Engagement reinforcement:** clean separation enables faster tuning and more frequent player-facing improvements.

---

## 8) Simulation Tick + Rendering Loop Design
### Loop model
- **Simulation:** fixed timestep (e.g., 100ms) for deterministic progression.
- **Rendering:** `requestAnimationFrame` for smooth visuals.
- Use accumulator pattern to handle frame drops.

### Example loop (illustrative)
```js
let last = performance.now();
let acc = 0;
const SIM_DT = 100; // ms

function frame(now) {
  const delta = now - last;
  last = now;
  acc += delta;

  while (acc >= SIM_DT) {
    updateSimulation(SIM_DT);
    acc -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

**Engagement reinforcement:** stable simulation ensures fair progression while render loop keeps action lively.

---

## 9) Initial MVP Tasks / Milestones
1. **Project bootstrap**: HTML/CSS/JS structure + canvas setup.
2. **State model**: player, enemy, floor, resources.
3. **Simulation core**: combat tick, win/loss resolution.
4. **Economy**: reward and upgrade formulas.
5. **UI basics**: resource labels, upgrade buttons.
6. **Canvas feedback**: entity shapes, HP bars, hit flashes.
7. **Save/load**: localStorage serialization + restore.
8. **Reset logic**: on defeat reset floor and run levels, retain Essence + all basic-stat prestige levels.
9. **Offline progress**: timestamp diff and capped Essence + STR/END prestige simulation.
10. **Balance pass 1**: adjust XP thresholds and reset cadence.

---

## 10) Example JS Snippets (Main Loops + Resource System)
```js
/**
 * Minimal simulation tick for one encounter.
 */
function updateSimulation(dtMs, state) {
  const dtSec = dtMs / 1000;

  // Player attack cadence
  state.player.attackTimer += dtSec;
  if (state.player.attackTimer >= 1 / state.player.attackSpeed) {
    state.player.attackTimer = 0;
    const dmg = computePlayerDamage(state); // derived from STR + STR prestige
    state.enemy.hp = Math.max(0, state.enemy.hp - dmg);

    // Damage-dealt progression
    addStrengthXp(state, dmg);
    addStrengthPrestigeXp(state, dmg * 0.08);
  }

  // Enemy attack cadence
  state.enemy.attackTimer += dtSec;
  if (state.enemy.attackTimer >= 1 / state.enemy.attackSpeed) {
    state.enemy.attackTimer = 0;
    const dmgTaken = Math.max(1, state.enemy.attack - state.player.damageReduction);
    state.player.hp = Math.max(0, state.player.hp - dmgTaken);

    // Damage-received progression
    addEnduranceXp(state, dmgTaken);
    addEndurancePrestigeXp(state, dmgTaken * 0.08);
  }

  if (state.enemy.hp <= 0) handleFloorWin(state);
  else if (state.player.hp <= 0) handleDefeatReset(state);
}

function handleFloorWin(state) {
  const reward = Math.floor(10 * Math.pow(state.floor, 1.20) * state.player.essenceGainMult);
  state.resources.essence += reward; // persists across resets
  state.floor += 1;
  state.enemy = createEnemyForFloor(state.floor);
  state.player.hp = getMaxHpFromEndurance(state.player.enduranceLevel);
}

function handleDefeatReset(state) {
  // Persistent values remain
  // - state.resources.essence
  // - state.player.strengthPrestigeLevel
  // - state.player.endurancePrestigeLevel

  state.floor = 1;
  state.player.strengthLevel = 1;
  state.player.enduranceLevel = 1;
  state.player.strengthXp = 0;
  state.player.enduranceXp = 0;
  state.player.hp = getMaxHpFromEndurance(1);
  state.enemy = createEnemyForFloor(1);
}
```

---

## 11) Example JSON Config Structures
```json
{
  "economy": {
    "enemyHpBase": 30,
    "enemyHpExp": 1.35,
    "enemyAtkBase": 4,
    "enemyAtkExp": 1.18,
    "essenceBase": 10,
    "essenceExp": 1.20,
    "strengthPrestigeGain": 0.08,
    "endurancePrestigeGain": 0.08
  },
  "timing": {
    "simulationDtMs": 100,
    "autosaveMs": 10000,
    "offlineCapHours": 8
  },
  "xpCurves": {
    "runBase": 20,
    "runExp": 1.30,
    "prestigeBase": 120,
    "prestigeExp": 1.55
  }
}
```

```json
{
  "upgrades": [
    {
      "id": "strength_xp_gain_1",
      "label": "Combat Discipline",
      "currency": "essence",
      "baseCost": 20,
      "costGrowth": 1.17,
      "effectType": "mul_strength_xp_gain",
      "effectPerLevel": 0.05,
      "maxLevel": 100
    }
  ]
}
```

---

## 12) Tunable Constants + Early-Game Pacing Controls
High-impact constants:
1. `runBase/runExp` XP curve (speed of run STR/END growth)
2. `prestigeBase/prestigeExp` (long-term retention speed for all basic-stat prestige tracks)
3. `strengthPrestigeGain` and `endurancePrestigeGain` coefficients
4. `essenceBase/essenceExp` and upgrade cost growth

### Pacing adjustment playbook
- If early resets feel **punishing**:
  - lower prestige XP threshold (e.g., prestigeBase 120 → 90)
  - increase prestige gain coefficients (0.08 → 0.10)
  - increase Essence reward baseline by 10%
- If progression is **too fast**:
  - raise prestige exponent (1.55 → 1.65)
  - reduce Strength XP conversion from damage (1.0 → 0.85)

Target: defeat-reset should still produce at least one persistent gain every cycle.

---

## 13) Save/Load, Offline Progress, localStorage Notes
### Save payload
- Player run stats (`strengthLevel`, `enduranceLevel`, current XP)
- Persistent stats (`strengthPrestigeLevel`, `strengthPrestigeXp`, `endurancePrestigeLevel`, `endurancePrestigeXp`)
- Resources (`essence`)
- Current floor + run state
- `lastSeenTimestamp`
- Version number for migrations

### Save strategy
- Auto-save every 10s and on visibility change/unload.
- Keep single slot for MVP (`infinityTowerSave_v1`).

### Offline progression
1. On load, compute `elapsed = now - lastSeenTimestamp`.
2. Simulate condensed Essence gain and optional STR/END prestige XP gain.
3. Cap offline time (e.g., 8 hours) to protect economy.
4. Show summary modal: “While away: +12,340 Essence, +180 STR Prestige XP, +165 END Prestige XP”.

**Engagement reinforcement:** players feel rewarded for returning without allowing runaway inflation.

---

## 14) Glossary
- **Floor:** one progression step in the tower.
- **Encounter:** automatic combat event for current floor.
- **Essence:** persistent currency earned on successful fights.
- **Strength Prestige:** permanent Strength track that survives defeat resets.
- **Endurance Prestige:** permanent Endurance track that survives defeat resets.
- **Tick:** fixed simulation update step.
- **Defeat Reset:** losing a fight sends the run back to floor 1 and resets run levels, while persistent values remain.
- **DPS:** damage per second.
- **Reset Baseline:** the floor/stat baseline restored immediately after defeat.

---

## Implementation Notes (What to build first)
1. Build deterministic simulation and formula layer first.
2. Add minimal rendering next for immediate visual feedback.
3. Add upgrade UI and spend loop.
4. Add save/load and then offline rewards.
5. Tune constants with short playtest loops (5–10 minute sessions).

This approach maximizes early playability while keeping the codebase easy to rebalance.

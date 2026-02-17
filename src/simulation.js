import { GAME_CONFIG } from './config.js';

export function createInitialSimulationState(config = GAME_CONFIG) {
  const run = createBaselineRunState();
  const persistent = createBaselinePersistentState();
  const playerStats = buildPlayerStats(run, persistent);

  run.hp = getMaxHp(playerStats, config);

  return {
    floor: 1,
    bestFloor: 1,
    elapsedMs: 0,
    resources: {
      essence: 0
    },
    run,
    persistent,
    combatTimers: {
      playerMs: 0,
      enemyMs: 0
    },
    battlePositions: createInitialBattlePositions(config),
    enemy: createEnemyForFloor(1, config),
    combatLog: []
  };
}

export function simulateTick(state, dtMs = GAME_CONFIG.timing.simulationDtMs, config = GAME_CONFIG) {
  const next = structuredClone(state);
  const events = [];

  if (isCombatOver(next)) {
    return buildTickResult(next, dtMs, events);
  }

  const playerStats = buildPlayerStats(next.run, next.persistent);

  tickMovement({ state: next, dtMs, config });
  tickCombatIntervals({ state: next, dtMs, playerStats, config, events });

  resolveLevelUps({ run: next.run, persistent: next.persistent, config, events });
  resolveEncounterOutcome({ state: next, config, events });

  return buildTickResult(next, dtMs, events);
}

export function createEnemyForFloor(floor, config = GAME_CONFIG) {
  return {
    floor,
    hp: getEnemyMaxHp(floor, config),
    attack: getEnemyAttack(floor, config)
  };
}

export function createInitialBattlePositions(config = GAME_CONFIG) {
  return {
    playerHex: { q: -config.combat.startingHexGap, r: 0 },
    enemyHex: { q: config.combat.startingHexGap, r: 0 },
    movementMs: 0
  };
}

export function createBaselineRunState() {
  return {
    strengthLevel: 1,
    strengthXp: 0,
    enduranceLevel: 1,
    enduranceXp: 0,
    hp: 0
  };
}

export function createBaselinePersistentState() {
  return {
    strengthPrestigeLevel: 0,
    strengthPrestigeXp: 0,
    endurancePrestigeLevel: 0,
    endurancePrestigeXp: 0
  };
}

export function buildPlayerStats(run, persistent) {
  return {
    strengthLevel: run.strengthLevel,
    enduranceLevel: run.enduranceLevel,
    strengthPrestigeLevel: persistent.strengthPrestigeLevel,
    endurancePrestigeLevel: persistent.endurancePrestigeLevel
  };
}

export function getRunXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.runXpBase * Math.pow(level, config.progression.runXpExp));
}

export function getPrestigeXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.prestigeXpBase * Math.pow(level + 1, config.progression.prestigeXpExp));
}

export function getEssenceReward(floor, config = GAME_CONFIG) {
  return Math.floor(config.rewards.essenceBase * Math.pow(floor, config.rewards.essenceExp));
}

export function resolveLevelUps({ run, persistent, config = GAME_CONFIG, events = [] }) {
  processStrengthRunLevelUps({ run, config, events });
  processEnduranceRunLevelUps({ run, config, events });
  processStrengthPrestigeLevelUps({ persistent, config, events });
  processEndurancePrestigeLevelUps({ persistent, config, events });

  const playerStats = buildPlayerStats(run, persistent);
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function applyVictory({ state, config = GAME_CONFIG, events = [] }) {
  const reward = getEssenceReward(state.floor, config);
  state.resources.essence += reward;
  state.floor += 1;
  state.bestFloor = Math.max(state.bestFloor, state.floor);
  state.enemy = createEnemyForFloor(state.floor, config);
  state.battlePositions = createVictoryBattlePositions({
    previousBattlePositions: state.battlePositions,
    config
  });
  state.combatTimers.playerMs = 0;
  state.combatTimers.enemyMs = 0;

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = getMaxHp(playerStats, config);

  events.push({ type: 'victory', reward, nextFloor: state.floor });
}

export function applyDefeatReset({ state, config = GAME_CONFIG, events = [] }) {
  state.floor = 1;
  state.run = createBaselineRunState();

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = getMaxHp(playerStats, config);
  state.enemy = createEnemyForFloor(1, config);
  state.battlePositions = createInitialBattlePositions(config);
  state.combatTimers.playerMs = 0;
  state.combatTimers.enemyMs = 0;

  events.push({ type: 'defeat', resetFloor: state.floor });
}

export function getEncounterOutcome(state) {
  if (state.run.hp <= 0) {
    return 'defeat';
  }

  if (state.enemy.hp <= 0) {
    return 'victory';
  }

  return null;
}

export function isCombatOver(state) {
  return state.run.hp <= 0 || state.enemy.hp <= 0;
}

export function getMaxHp(playerStats, config = GAME_CONFIG) {
  const { playerBaseHp, enduranceHpPerLevel, endurancePrestigeHpPerLevel } = config.combat;
  return Math.floor(
    playerBaseHp +
      (playerStats.enduranceLevel - 1) * enduranceHpPerLevel +
      playerStats.endurancePrestigeLevel * endurancePrestigeHpPerLevel
  );
}

export function getEnemyMaxHp(floor, config = GAME_CONFIG) {
  return Math.floor(config.combat.enemyHpBase * Math.pow(floor, config.combat.enemyHpExp));
}

export function getEnemyAttack(_floor, config = GAME_CONFIG) {
  return Math.floor(config.combat.enemyAttackBase);
}

export function computePlayerDamage(playerStats, config = GAME_CONFIG) {
  const { playerBaseAttack, strengthAttackPerLevel, strengthPrestigeAttackPerLevel, minDamage } = config.combat;

  const rawDamage =
    playerBaseAttack +
    (playerStats.strengthLevel - 1) * strengthAttackPerLevel +
    playerStats.strengthPrestigeLevel * strengthPrestigeAttackPerLevel;

  return Math.max(minDamage, Math.floor(rawDamage));
}

export function computeIncomingDamage({ enemyAttack, config = GAME_CONFIG }) {
  return Math.max(config.combat.minDamage, Math.floor(enemyAttack));
}

export function computeStrengthXpGain(damageDealt, playerStats, config = GAME_CONFIG) {
  const { strengthXpPerDamage, strengthXpBoostPerStrengthPrestigeLevel } = config.progression;
  const prestigeMultiplier = 1 + playerStats.strengthPrestigeLevel * strengthXpBoostPerStrengthPrestigeLevel;
  return Math.floor(damageDealt * strengthXpPerDamage * prestigeMultiplier);
}

export function computeEnduranceXpGain(damageTaken, playerStats, config = GAME_CONFIG) {
  const { enduranceXpPerDamage, enduranceXpBoostPerEndurancePrestigeLevel } = config.progression;
  const prestigeMultiplier = 1 + playerStats.endurancePrestigeLevel * enduranceXpBoostPerEndurancePrestigeLevel;
  return Math.floor(damageTaken * enduranceXpPerDamage * prestigeMultiplier);
}

function buildTickResult(state, dtMs, events) {
  return {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    combatLog: events
  };
}

function applyPlayerAttack({ state, playerStats, config, events }) {
  const playerDamage = computePlayerDamage(playerStats, config);
  const strengthXpGain = computeStrengthXpGain(playerDamage, playerStats, config);
  const strengthPrestigeXpGain = computePrestigeXpGain({
    runXpGain: strengthXpGain,
    gainRate: config.progression.strengthPrestigeGain
  });

  state.run.strengthXp += strengthXpGain;
  state.persistent.strengthPrestigeXp += strengthPrestigeXpGain;
  state.enemy.hp = Math.max(0, state.enemy.hp - playerDamage);

  events.push({ type: 'playerHit', amount: playerDamage, strengthXpGain, strengthPrestigeXpGain });
}

function applyEnemyAttack({ state, playerStats, config, events }) {
  const enemyDamage = computeIncomingDamage({ enemyAttack: state.enemy.attack, config });
  const enduranceXpGain = computeEnduranceXpGain(enemyDamage, playerStats, config);
  const endurancePrestigeXpGain = computePrestigeXpGain({
    runXpGain: enduranceXpGain,
    gainRate: config.progression.endurancePrestigeGain
  });

  state.run.enduranceXp += enduranceXpGain;
  state.persistent.endurancePrestigeXp += endurancePrestigeXpGain;
  state.run.hp = Math.max(0, state.run.hp - enemyDamage);

  events.push({ type: 'enemyHit', amount: enemyDamage, enduranceXpGain, endurancePrestigeXpGain });
}

function tickCombatIntervals({ state, dtMs, playerStats, config, events }) {
  if (!isWithinEffectiveRange(state, config)) {
    state.combatTimers.playerMs = 0;
    state.combatTimers.enemyMs = 0;
    return;
  }

  state.combatTimers.playerMs += dtMs;
  state.combatTimers.enemyMs += dtMs;

  if (consumeInterval({ timerMs: state.combatTimers.playerMs, intervalMs: config.combat.playerAttackIntervalMs })) {
    state.combatTimers.playerMs -= config.combat.playerAttackIntervalMs;
    applyPlayerAttack({ state, playerStats, config, events });
  }

  if (state.enemy.hp <= 0) {
    return;
  }

  if (consumeInterval({ timerMs: state.combatTimers.enemyMs, intervalMs: config.combat.enemyAttackIntervalMs })) {
    state.combatTimers.enemyMs -= config.combat.enemyAttackIntervalMs;
    applyEnemyAttack({ state, playerStats, config, events });
  }
}

function consumeInterval({ timerMs, intervalMs }) {
  return timerMs >= intervalMs;
}

function tickMovement({ state, dtMs, config }) {
  state.battlePositions.movementMs += dtMs;

  while (consumeInterval({ timerMs: state.battlePositions.movementMs, intervalMs: config.combat.movementIntervalMs })) {
    state.battlePositions.movementMs -= config.combat.movementIntervalMs;
    advanceTowardsRange({ battlePositions: state.battlePositions, effectiveRangeHex: config.combat.effectiveRangeHex });
  }
}

function advanceTowardsRange({ battlePositions, effectiveRangeHex }) {
  if (getHexDistance(battlePositions.playerHex, battlePositions.enemyHex) <= effectiveRangeHex) {
    return;
  }

  battlePositions.playerHex = stepHexTowards({ from: battlePositions.playerHex, to: battlePositions.enemyHex });

  if (getHexDistance(battlePositions.playerHex, battlePositions.enemyHex) <= effectiveRangeHex) {
    return;
  }

  battlePositions.enemyHex = stepHexTowards({ from: battlePositions.enemyHex, to: battlePositions.playerHex });
}

function stepHexTowards({ from, to }) {
  const options = [
    { q: from.q + 1, r: from.r },
    { q: from.q - 1, r: from.r },
    { q: from.q, r: from.r + 1 },
    { q: from.q, r: from.r - 1 },
    { q: from.q + 1, r: from.r - 1 },
    { q: from.q - 1, r: from.r + 1 }
  ];

  let best = from;
  let bestDistance = getHexDistance(from, to);

  for (const candidate of options) {
    const distance = getHexDistance(candidate, to);

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function createVictoryBattlePositions({ previousBattlePositions, config }) {
  const playerHex = structuredClone(previousBattlePositions.playerHex);
  const enemyHex = spawnEnemyHexFromPlayer({ playerHex, config });

  return {
    playerHex,
    enemyHex,
    movementMs: 0
  };
}

function spawnEnemyHexFromPlayer({ playerHex, config }) {
  const directions = [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
    { q: 0, r: 1 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
    { q: -1, r: 1 }
  ];

  const randomDirection = directions[Math.floor(Math.random() * directions.length)];

  return {
    q: playerHex.q + randomDirection.q * config.combat.startingHexGap,
    r: playerHex.r + randomDirection.r * config.combat.startingHexGap
  };
}

function isWithinEffectiveRange(state, config) {
  return getHexDistance(state.battlePositions.playerHex, state.battlePositions.enemyHex) <= config.combat.effectiveRangeHex;
}

function getHexDistance(from, to) {
  return (Math.abs(from.q - to.q) + Math.abs(from.r - to.r) + Math.abs((from.q + from.r) - (to.q + to.r))) / 2;
}

function computePrestigeXpGain({ runXpGain, gainRate }) {
  if (runXpGain <= 0 || gainRate <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(runXpGain * gainRate));
}

function processStrengthRunLevelUps({ run, config, events }) {
  while (run.strengthXp >= getRunXpThreshold(run.strengthLevel, config)) {
    const requiredXp = getRunXpThreshold(run.strengthLevel, config);
    run.strengthXp -= requiredXp;
    run.strengthLevel += 1;
    events.push({ type: 'strengthLevelUp', level: run.strengthLevel });
  }
}

function processEnduranceRunLevelUps({ run, config, events }) {
  while (run.enduranceXp >= getRunXpThreshold(run.enduranceLevel, config)) {
    const requiredXp = getRunXpThreshold(run.enduranceLevel, config);
    run.enduranceXp -= requiredXp;
    run.enduranceLevel += 1;
    events.push({ type: 'enduranceLevelUp', level: run.enduranceLevel });
  }
}

function processStrengthPrestigeLevelUps({ persistent, config, events }) {
  while (persistent.strengthPrestigeXp >= getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config);
    persistent.strengthPrestigeXp -= requiredXp;
    persistent.strengthPrestigeLevel += 1;
    events.push({ type: 'strengthPrestigeLevelUp', level: persistent.strengthPrestigeLevel });
  }
}

function processEndurancePrestigeLevelUps({ persistent, config, events }) {
  while (persistent.endurancePrestigeXp >= getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config);
    persistent.endurancePrestigeXp -= requiredXp;
    persistent.endurancePrestigeLevel += 1;
    events.push({ type: 'endurancePrestigeLevelUp', level: persistent.endurancePrestigeLevel });
  }
}

function resolveEncounterOutcome({ state, config, events }) {
  const outcome = getEncounterOutcome(state);

  if (outcome === 'victory') {
    applyVictory({ state, config, events });
    return;
  }

  if (outcome === 'defeat') {
    applyDefeatReset({ state, config, events });
  }
}

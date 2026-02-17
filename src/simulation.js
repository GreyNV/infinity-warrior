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
    enemy: createEnemyForFloor(1, config),
    combatLog: []
  };
}

export function simulateTick(state, dtMs = GAME_CONFIG.timing.simulationDtMs, config = GAME_CONFIG) {
  const next = structuredClone(state);
  const events = [];

  if (isCombatOver(next)) {
    return {
      ...next,
      elapsedMs: next.elapsedMs + dtMs,
      combatLog: events
    };
  }

  const playerStats = buildPlayerStats(next.run, next.persistent);
  const playerDamage = computePlayerDamage(playerStats, config);

  const strengthXpGain = computeStrengthXpGain(playerDamage, playerStats, config);
  const strengthPrestigeXpGain = Math.floor(strengthXpGain * config.progression.strengthPrestigeGain);
  next.run.strengthXp += strengthXpGain;
  next.persistent.strengthPrestigeXp += strengthPrestigeXpGain;

  next.enemy.hp = Math.max(0, next.enemy.hp - playerDamage);
  events.push({ type: 'playerHit', amount: playerDamage, strengthXpGain, strengthPrestigeXpGain });

  if (next.enemy.hp > 0) {
    const enemyDamage = computeEnemyDamage(next.enemy, config);
    const enduranceXpGain = computeEnduranceXpGain(enemyDamage, playerStats, config);
    const endurancePrestigeXpGain = Math.floor(enduranceXpGain * config.progression.endurancePrestigeGain);

    next.run.enduranceXp += enduranceXpGain;
    next.persistent.endurancePrestigeXp += endurancePrestigeXpGain;
    next.run.hp = Math.max(0, next.run.hp - enemyDamage);
    events.push({ type: 'enemyHit', amount: enemyDamage, enduranceXpGain, endurancePrestigeXpGain });
  }

  resolveLevelUps(next.run, next.persistent, config, events);

  const outcome = getEncounterOutcome(next);
  if (outcome === 'victory') {
    applyVictory(next, config, events);
  } else if (outcome === 'defeat') {
    applyDefeatReset(next, config, events);
  }

  return {
    ...next,
    elapsedMs: next.elapsedMs + dtMs,
    combatLog: events
  };
}

export function createEnemyForFloor(floor, config = GAME_CONFIG) {
  return {
    floor,
    hp: getEnemyMaxHp(floor, config),
    attack: getEnemyAttack(floor, config)
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

export function resolveLevelUps(run, persistent, config = GAME_CONFIG, events = []) {
  while (run.strengthXp >= getRunXpThreshold(run.strengthLevel, config)) {
    const requiredXp = getRunXpThreshold(run.strengthLevel, config);
    run.strengthXp -= requiredXp;
    run.strengthLevel += 1;
    events.push({ type: 'strengthLevelUp', level: run.strengthLevel });
  }

  while (run.enduranceXp >= getRunXpThreshold(run.enduranceLevel, config)) {
    const requiredXp = getRunXpThreshold(run.enduranceLevel, config);
    run.enduranceXp -= requiredXp;
    run.enduranceLevel += 1;
    events.push({ type: 'enduranceLevelUp', level: run.enduranceLevel });
  }

  while (persistent.strengthPrestigeXp >= getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config);
    persistent.strengthPrestigeXp -= requiredXp;
    persistent.strengthPrestigeLevel += 1;
    events.push({ type: 'strengthPrestigeLevelUp', level: persistent.strengthPrestigeLevel });
  }

  while (persistent.endurancePrestigeXp >= getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config);
    persistent.endurancePrestigeXp -= requiredXp;
    persistent.endurancePrestigeLevel += 1;
    events.push({ type: 'endurancePrestigeLevelUp', level: persistent.endurancePrestigeLevel });
  }

  const playerStats = buildPlayerStats(run, persistent);
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function applyVictory(state, config = GAME_CONFIG, events = []) {
  const reward = getEssenceReward(state.floor, config);
  state.resources.essence += reward;
  state.floor += 1;
  state.bestFloor = Math.max(state.bestFloor, state.floor);
  state.enemy = createEnemyForFloor(state.floor, config);

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = getMaxHp(playerStats, config);

  events.push({ type: 'victory', reward, nextFloor: state.floor });
}

export function applyDefeatReset(state, config = GAME_CONFIG, events = []) {
  state.floor = 1;
  state.run = createBaselineRunState();
  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = getMaxHp(playerStats, config);
  state.enemy = createEnemyForFloor(1, config);

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

export function getEnemyAttack(floor, config = GAME_CONFIG) {
  return Math.floor(config.combat.enemyAttackBase * Math.pow(floor, config.combat.enemyAttackExp));
}

export function computePlayerDamage(playerStats, config = GAME_CONFIG) {
  const { playerBaseAttack, strengthAttackPerLevel, strengthPrestigeAttackPerLevel, minDamage } = config.combat;

  const raw =
    playerBaseAttack +
    (playerStats.strengthLevel - 1) * strengthAttackPerLevel +
    playerStats.strengthPrestigeLevel * strengthPrestigeAttackPerLevel;

  return Math.max(minDamage, Math.floor(raw));
}

export function computeEnemyDamage(enemy, config = GAME_CONFIG) {
  return Math.max(config.combat.minDamage, Math.floor(enemy.attack));
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

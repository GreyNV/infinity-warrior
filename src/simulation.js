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
    return buildTickResult(next, dtMs, events);
  }

  const tickContext = { state: next, config, events };
  const playerStats = buildPlayerStats(next.run, next.persistent);

  applyPlayerAttack({ tickContext, playerStats });

  if (next.enemy.hp > 0) {
    applyEnemyAttack({ tickContext, playerStats });
  }

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
  processRunLevelUps({ run, stat: 'strength', config, events });
  processRunLevelUps({ run, stat: 'endurance', config, events });
  processPrestigeLevelUps({ persistent, stat: 'strength', config, events });
  processPrestigeLevelUps({ persistent, stat: 'endurance', config, events });

  const playerStats = buildPlayerStats(run, persistent);
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function applyVictory({ state, config = GAME_CONFIG, events = [] }) {
  const reward = getEssenceReward(state.floor, config);
  state.resources.essence += reward;
  state.floor += 1;
  state.bestFloor = Math.max(state.bestFloor, state.floor);
  state.enemy = createEnemyForFloor(state.floor, config);

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

  const rawDamage =
    playerBaseAttack +
    (playerStats.strengthLevel - 1) * strengthAttackPerLevel +
    playerStats.strengthPrestigeLevel * strengthPrestigeAttackPerLevel;

  return Math.max(minDamage, Math.floor(rawDamage));
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

function buildTickResult(state, dtMs, events) {
  return {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    combatLog: events
  };
}

function applyPlayerAttack({ tickContext, playerStats }) {
  const { state, config, events } = tickContext;
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

function applyEnemyAttack({ tickContext, playerStats }) {
  const { state, config, events } = tickContext;
  const enemyDamage = computeEnemyDamage(state.enemy, config);

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

function computePrestigeXpGain({ runXpGain, gainRate }) {
  return Math.floor(runXpGain * gainRate);
}

function processRunLevelUps({ run, stat, config, events }) {
  const xpKey = `${stat}Xp`;
  const levelKey = `${stat}Level`;

  while (run[xpKey] >= getRunXpThreshold(run[levelKey], config)) {
    const requiredXp = getRunXpThreshold(run[levelKey], config);
    run[xpKey] -= requiredXp;
    run[levelKey] += 1;
    events.push({ type: `${stat}LevelUp`, level: run[levelKey] });
  }
}

function processPrestigeLevelUps({ persistent, stat, config, events }) {
  const xpKey = `${stat}PrestigeXp`;
  const levelKey = `${stat}PrestigeLevel`;

  while (persistent[xpKey] >= getPrestigeXpThreshold(persistent[levelKey], config)) {
    const requiredXp = getPrestigeXpThreshold(persistent[levelKey], config);
    persistent[xpKey] -= requiredXp;
    persistent[levelKey] += 1;
    events.push({ type: `${stat}PrestigeLevelUp`, level: persistent[levelKey] });
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

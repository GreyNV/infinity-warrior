import { GAME_CONFIG } from './config.js';
import {
  computeIncomingDamage,
  computePlayerDamage,
  createEnemyForDistance,
  getEncounterOutcome,
  getMaxHp,
  isCombatOver
} from './sim/combat.js';
import {
  computeEnduranceXpGain,
  computeStrengthXpGain,
  getAgilityAttackSpeedMultiplier,
  getAgilityEssenceThreshold,
  getBodyEssenceThreshold,
  getEssenceReward,
  getHpRegenPerSecond,
  getMaxKi,
  getMindAttackSpeedMultiplier,
  getMindEssenceThreshold,
  getPrestigeXpThreshold,
  getRunXpThreshold,
  getSpiritEssenceThreshold,
  normalizeFlowRates,
  resolveLevelUps,
  toCultivationExp,
  updateHighestLevels
} from './sim/progression.js';
import {
  createInitialBattlePositions,
  getEncounterDistanceForDepth,
  isWithinEffectiveRange,
  tickMovement,
  trySpawnEncounter
} from './sim/world.js';

export function createInitialSimulationState(config = GAME_CONFIG) {
  const run = createBaselineRunState();
  const persistent = createBaselinePersistentState();
  const playerStats = buildPlayerStats(run, persistent);
  run.hp = getMaxHp(playerStats, config);

  return {
    elapsedMs: 0,
    resources: { essence: 0 },
    unlocks: { cultivation: false },
    activityMode: 'battle',
    run,
    persistent,
    cultivation: { flowRates: { body: 0.34, mind: 0.33, spirit: 0.33 } },
    world: {
      travelDepth: 0,
      bestDepth: 0,
      revealedHexes: 0,
      pendingEncounters: 0,
      moveDirectionIndex: 0,
      spawnMissStreak: 0
    },
    statistics: createBaselineStatistics(),
    combatTimers: { playerMs: 0, enemyMs: 0 },
    battlePositions: createInitialBattlePositions(config),
    enemy: null,
    combatLog: []
  };
}

export function simulateTick(state, dtMs = GAME_CONFIG.timing.simulationDtMs, config = GAME_CONFIG) {
  const next = structuredClone(state);
  const events = [];
  const playerStats = buildPlayerStats(next.run, next.persistent);

  tickMovement({ state: next, dtMs, config, events });
  tickCombatIntervals({ state: next, dtMs, playerStats, config, events });
  resolveEncounterOutcome({ state: next, config, events });
  processCultivationFlow({ state: next, dtMs, config });
  resolveLevelUps({ run: next.run, persistent: next.persistent, statistics: next.statistics, config, events });
  updateHighestLevels(next.statistics, next.run, next.persistent);

  return {
    ...next,
    elapsedMs: next.elapsedMs + dtMs,
    combatLog: events
  };
}

export function createBaselineRunState() {
  return {
    strengthLevel: 1,
    strengthXp: 0,
    enduranceLevel: 1,
    enduranceXp: 0,
    hp: 0,
    bodyLevel: 0,
    bodyEssence: 0,
    bodyPrestigeLevel: 0,
    bodyPrestigeXp: 0,
    mindLevel: 0,
    mindEssence: 0,
    mindPrestigeLevel: 0,
    mindPrestigeXp: 0,
    spiritLevel: 0,
    spiritEssence: 0,
    spiritPrestigeLevel: 0,
    spiritPrestigeXp: 0,
    ki: 0
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

export function applyVictory({ state, config = GAME_CONFIG, events = [] }) {
  if (!state.enemy) return;

  const reward = getEssenceReward({ distance: state.world.travelDepth, rarity: state.enemy.rarity, config });
  const defeatedEnemy = state.enemy;
  state.resources.essence += reward;

  if (state.world.pendingEncounters > 0) {
    state.world.pendingEncounters -= 1;
    const didSpawn = trySpawnEncounter({ state, config, events, reason: 'chain', spawnChance: getChainSpawnChance(config) });
    if (!didSpawn) state.world.pendingEncounters = 0;
  } else {
    state.enemy = null;
    state.battlePositions.enemyHex = null;
    state.combatTimers.playerMs = 0;
    state.combatTimers.enemyMs = 0;
  }

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = Math.min(getMaxHp(playerStats, config), state.run.hp + getHpRegenPerSecond(state.run, config));
  events.push({ type: 'victory', reward, rarity: defeatedEnemy?.rarity?.label ?? 'Unknown', depth: state.world.travelDepth });

  if (!defeatedEnemy) return;
  state.statistics.totalEnemiesDefeated += 1;
  const rarityKey = defeatedEnemy.rarity?.key;
  if (rarityKey && state.statistics.enemiesDefeatedByRarity[rarityKey] !== undefined) {
    state.statistics.enemiesDefeatedByRarity[rarityKey] += 1;
  }
}

export function applyDefeatReset({ state, config = GAME_CONFIG, events = [] }) {
  const cultivationPrestigeSnapshot = {
    bodyLevel: state.run.bodyPrestigeLevel,
    bodyXp: state.run.bodyPrestigeXp,
    mindLevel: state.run.mindPrestigeLevel,
    mindXp: state.run.mindPrestigeXp,
    spiritLevel: state.run.spiritPrestigeLevel,
    spiritXp: state.run.spiritPrestigeXp
  };

  state.statistics.totalDeaths += 1;
  state.world.travelDepth = 0;
  state.world.pendingEncounters = 0;
  state.world.revealedHexes = 0;
  state.world.moveDirectionIndex = 0;
  state.world.spawnMissStreak = 0;
  state.run = createBaselineRunState();
  state.run.bodyPrestigeLevel = cultivationPrestigeSnapshot.bodyLevel;
  state.run.bodyPrestigeXp = cultivationPrestigeSnapshot.bodyXp;
  state.run.mindPrestigeLevel = cultivationPrestigeSnapshot.mindLevel;
  state.run.mindPrestigeXp = cultivationPrestigeSnapshot.mindXp;
  state.run.spiritPrestigeLevel = cultivationPrestigeSnapshot.spiritLevel;
  state.run.spiritPrestigeXp = cultivationPrestigeSnapshot.spiritXp;
  state.unlocks.cultivation = true;

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = getMaxHp(playerStats, config);
  state.enemy = null;
  state.battlePositions = createInitialBattlePositions(config);
  state.combatTimers.playerMs = 0;
  state.combatTimers.enemyMs = 0;

  events.push({ type: 'defeat' });
}

function createBaselineStatistics() {
  return {
    totalDeaths: 0,
    totalEnemiesDefeated: 0,
    enemiesDefeatedByRarity: {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0
    },
    totalLevelsGained: {
      strength: 0,
      endurance: 0,
      body: 0,
      mind: 0,
      spirit: 0,
      strengthPrestige: 0,
      endurancePrestige: 0,
      bodyPrestige: 0,
      mindPrestige: 0,
      spiritPrestige: 0
    },
    highestLevels: {
      strength: 1,
      endurance: 1,
      body: 0,
      mind: 0,
      spirit: 0,
      strengthPrestige: 0,
      endurancePrestige: 0,
      bodyPrestige: 0,
      mindPrestige: 0,
      spiritPrestige: 0
    }
  };
}

function tickCombatIntervals({ state, dtMs, playerStats, config, events }) {
  if (!state.enemy) return;
  if (!isWithinEffectiveRange(state, config)) return;

  state.combatTimers.playerMs += dtMs;
  state.combatTimers.enemyMs += dtMs;

  const mindMultiplier = getMindAttackSpeedMultiplier({ mindLevel: state.run.mindLevel, config });
  const playerIntervalMs = Math.max(config.combat.minAttackIntervalMs, config.combat.playerAttackIntervalMs / mindMultiplier);

  if (state.combatTimers.playerMs >= playerIntervalMs) {
    state.combatTimers.playerMs -= playerIntervalMs;
    applyPlayerAttack({ state, playerStats, config, events });
  }

  if (!state.enemy || state.enemy.hp <= 0) return;

  if (state.combatTimers.enemyMs >= config.combat.enemyAttackIntervalMs) {
    state.combatTimers.enemyMs -= config.combat.enemyAttackIntervalMs;
    applyEnemyAttack({ state, playerStats, config, events });
  }
}

function applyPlayerAttack({ state, playerStats, config, events }) {
  if (!state.enemy) return;
  const playerDamage = computePlayerDamage(playerStats, config);
  const strengthXpGain = computeStrengthXpGain(playerDamage, playerStats, config);

  state.run.strengthXp += strengthXpGain;
  state.persistent.strengthPrestigeXp += strengthXpGain;
  state.enemy.hp = Math.max(0, state.enemy.hp - playerDamage);

  events.push({ type: 'playerHit', amount: playerDamage, strengthXpGain, strengthPrestigeXpGain: strengthXpGain });
}

function applyEnemyAttack({ state, playerStats, config, events }) {
  if (!state.enemy) return;
  const enemyDamage = computeIncomingDamage({ enemyAttack: state.enemy.attack, config });
  const enduranceXpGain = computeEnduranceXpGain(enemyDamage, playerStats, config);

  state.run.enduranceXp += enduranceXpGain;
  state.persistent.endurancePrestigeXp += enduranceXpGain;
  state.run.hp = Math.max(0, state.run.hp - enemyDamage);

  events.push({ type: 'enemyHit', amount: enemyDamage, enduranceXpGain, endurancePrestigeXpGain: enduranceXpGain });
}

function processCultivationFlow({ state, dtMs, config }) {
  if (state.run.hp <= 0) return;

  const regenHp = getHpRegenPerSecond(state.run, config) * (dtMs / 1000);
  const maxHp = getMaxHp(buildPlayerStats(state.run, state.persistent), config);
  state.run.hp = Math.min(maxHp, state.run.hp + regenHp);

  const maxKi = getMaxKi(state.run, config);
  const kiRegen = (config.cultivation.kiBaseRegenPerSecond + state.run.spiritLevel * 0.002) * (dtMs / 1000);
  state.run.ki = Math.min(maxKi, state.run.ki + kiRegen);

  if (!state.unlocks.cultivation || state.activityMode !== 'cultivation' || state.enemy) return;

  const flowRates = normalizeFlowRates(state.cultivation.flowRates);
  state.cultivation.flowRates = flowRates;
  const totalRequestedEssence = (dtMs / 1000) * config.cultivation.maxFlowEssencePerSecond;
  const spentEssence = Math.min(state.resources.essence, totalRequestedEssence);
  state.resources.essence -= spentEssence;

  const bodyXpGain = toCultivationExp({ allocatedEssence: spentEssence * flowRates.body, prestigeLevel: state.run.bodyPrestigeLevel, config });
  const mindXpGain = toCultivationExp({ allocatedEssence: spentEssence * flowRates.mind, prestigeLevel: state.run.mindPrestigeLevel, config });
  const spiritXpGain = toCultivationExp({ allocatedEssence: spentEssence * flowRates.spirit, prestigeLevel: state.run.spiritPrestigeLevel, config });

  state.run.bodyEssence += bodyXpGain;
  state.run.mindEssence += mindXpGain;
  state.run.spiritEssence += spiritXpGain;
  state.run.bodyPrestigeXp += bodyXpGain;
  state.run.mindPrestigeXp += mindXpGain;
  state.run.spiritPrestigeXp += spiritXpGain;
}

function resolveEncounterOutcome({ state, config, events }) {
  const outcome = getEncounterOutcome(state);
  if (outcome === 'victory') applyVictory({ state, config, events });
  if (outcome === 'defeat') applyDefeatReset({ state, config, events });
}

function getChainSpawnChance(config) {
  return Math.max(0, Math.min(config.world.revealSpawnChanceCap, config.world.revealSpawnChanceBase));
}

export {
  createEnemyForDistance,
  getEncounterDistanceForDepth,
  getEncounterOutcome,
  isCombatOver,
  getMaxHp,
  getRunXpThreshold,
  getPrestigeXpThreshold,
  getEssenceReward,
  getEnemyMaxHp,
  getEnemyAttack,
  computePlayerDamage,
  computeIncomingDamage,
  computeStrengthXpGain,
  computeEnduranceXpGain,
  getAgilityEssenceThreshold,
  getAgilityAttackSpeedMultiplier,
  getBodyEssenceThreshold,
  getMindEssenceThreshold,
  getSpiritEssenceThreshold,
  getMindAttackSpeedMultiplier,
  getHpRegenPerSecond,
  getMaxKi,
  resolveLevelUps
} from './sim/index.js';

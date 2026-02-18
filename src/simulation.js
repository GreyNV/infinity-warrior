import { GAME_CONFIG } from './config.js';

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 }
];

export function createInitialSimulationState(config = GAME_CONFIG) {
  const run = createBaselineRunState();
  const persistent = createBaselinePersistentState();
  const playerStats = buildPlayerStats(run, persistent);
  run.hp = getMaxHp(playerStats, config);

  return {
    floor: 1,
    bestFloor: 1,
    elapsedMs: 0,
    resources: { essence: 0 },
    unlocks: { cultivation: false },
    activityMode: 'battle',
    run,
    persistent,
    cultivation: { flowRates: { body: 0.34, mind: 0.33, spirit: 0.33 } },
    world: {
      travelDepth: 0,
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

  return buildTickResult(next, dtMs, events);
}

export function createEnemyForFloor(floor, config = GAME_CONFIG, options = {}) {
  const { biome = getWorldRegion({ hex: options.hex ?? { q: 0, r: 0 }, config }), rarity = rollRarity(config) } = options;
  const biomeModifier = config.combat.biomeModifiers[biome.key] ?? { hp: 1, attack: 1 };
  const maxHp = Math.max(1, Math.floor(getEnemyMaxHp(floor, config) * biomeModifier.hp * rarity.hp));
  const attack = Math.max(1, Math.floor(getEnemyAttack(floor, config) * biomeModifier.attack * rarity.attack));

  return {
    floor,
    hp: maxHp,
    maxHp,
    attack,
    biome,
    rarity
  };
}

export function createInitialBattlePositions(config = GAME_CONFIG) {
  return {
    playerHex: { q: 0, r: 0 },
    enemyHex: null,
    movementMs: 0
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

export function getRunXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.runXpBase * Math.pow(level, config.progression.runXpExp));
}

export function getPrestigeXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.prestigeXpBase * Math.pow(level + 1, config.progression.prestigeXpExp));
}

export function getEssenceReward(floor, config = GAME_CONFIG) {
  return Math.floor(config.rewards.essenceBase * Math.pow(floor, config.rewards.essenceExp));
}

export function resolveLevelUps({ run, persistent, statistics, config = GAME_CONFIG, events = [] }) {
  processStrengthRunLevelUps({ run, statistics, config, events });
  processEnduranceRunLevelUps({ run, statistics, config, events });
  processStrengthPrestigeLevelUps({ persistent, statistics, config, events });
  processEndurancePrestigeLevelUps({ persistent, statistics, config, events });
  processBodyCultivationLevelUps({ run, statistics, config, events });
  processBodyCultivationPrestigeLevelUps({ run, statistics, config, events });
  processMindCultivationLevelUps({ run, statistics, config, events });
  processMindCultivationPrestigeLevelUps({ run, statistics, config, events });
  processSpiritCultivationLevelUps({ run, statistics, config, events });
  processSpiritCultivationPrestigeLevelUps({ run, statistics, config, events });

  const playerStats = buildPlayerStats(run, persistent);
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function applyVictory({ state, config = GAME_CONFIG, events = [] }) {
  if (!state.enemy) return;

  const reward = getEssenceReward(state.floor, config);
  const defeatedEnemy = state.enemy;
  state.resources.essence += reward;
  state.floor += 1;
  state.bestFloor = Math.max(state.bestFloor, state.floor);

  if (state.world.pendingEncounters > 0) {
    state.world.pendingEncounters -= 1;
    spawnEncounterFromReveal({ state, config, events, reason: 'chain' });
  } else {
    state.enemy = null;
    state.battlePositions.enemyHex = null;
    state.combatTimers.playerMs = 0;
    state.combatTimers.enemyMs = 0;
  }

  const playerStats = buildPlayerStats(state.run, state.persistent);
  state.run.hp = Math.min(getMaxHp(playerStats, config), state.run.hp + getHpRegenPerSecond(state.run, config));
  events.push({ type: 'victory', reward, nextFloor: state.floor });

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

  state.floor = 1;
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

  events.push({ type: 'defeat', resetFloor: state.floor });
}

export function getEncounterOutcome(state) {
  if (state.run.hp <= 0) return 'defeat';
  if (state.enemy && state.enemy.hp <= 0) return 'victory';
  return null;
}

export function isCombatOver(state) {
  return state.run.hp <= 0 || (state.enemy ? state.enemy.hp <= 0 : false);
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
  const floorRamp = Math.pow(Math.max(0, floor - 1), config.combat.enemyAttackExp);
  return Math.floor(config.combat.enemyAttackBase + floorRamp);
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

export function getAgilityEssenceThreshold(level, config = GAME_CONFIG) {
  return getMindEssenceThreshold(level, config);
}

export function getAgilityAttackSpeedMultiplier({ agilityLevel, config = GAME_CONFIG }) {
  return getMindAttackSpeedMultiplier({ mindLevel: agilityLevel, mindPrestigeLevel: 0, config });
}

export function getBodyEssenceThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.cultivation.bodyEssenceBase * Math.pow(level + 1, config.cultivation.bodyEssenceExp));
}

export function getMindEssenceThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.cultivation.mindEssenceBase * Math.pow(level + 1, config.cultivation.mindEssenceExp));
}

export function getSpiritEssenceThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.cultivation.spiritEssenceBase * Math.pow(level + 1, config.cultivation.spiritEssenceExp));
}

export function getMindAttackSpeedMultiplier({ mindLevel, mindPrestigeLevel = 0, config = GAME_CONFIG }) {
  const totalMindLevel = Math.max(0, mindLevel + mindPrestigeLevel);
  const rawMultiplier = 1 + Math.log1p(totalMindLevel) * config.cultivation.mindSpeedLogFactor;
  return Math.min(config.cultivation.maxAttackSpeedMultiplier, rawMultiplier);
}

export function getHpRegenPerSecond(run, config = GAME_CONFIG) {
  const { hpRegenBasePerSecond, hpRegenPerBodyLevel, hpRegenPerBodyPrestigeLevel } = config.cultivation;
  return hpRegenBasePerSecond + run.bodyLevel * hpRegenPerBodyLevel + run.bodyPrestigeLevel * hpRegenPerBodyPrestigeLevel;
}

export function getMaxKi(run, config = GAME_CONFIG) {
  const { kiMaxBase, kiMaxPerSpiritLevel, kiMaxPerSpiritPrestigeLevel } = config.cultivation;
  return kiMaxBase + run.spiritLevel * kiMaxPerSpiritLevel + run.spiritPrestigeLevel * kiMaxPerSpiritPrestigeLevel;
}

function buildTickResult(state, dtMs, events) {
  return {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    combatLog: events
  };
}

function applyPlayerAttack({ state, playerStats, config, events }) {
  if (!state.enemy) return;
  const playerDamage = computePlayerDamage(playerStats, config);
  const strengthXpGain = computeStrengthXpGain(playerDamage, playerStats, config);
  const strengthPrestigeXpGain = computePrestigeXpGain({ runXpGain: strengthXpGain, gainRate: config.progression.strengthPrestigeGain });

  state.run.strengthXp += strengthXpGain;
  state.persistent.strengthPrestigeXp += strengthPrestigeXpGain;
  state.enemy.hp = Math.max(0, state.enemy.hp - playerDamage);

  events.push({ type: 'playerHit', amount: playerDamage, strengthXpGain, strengthPrestigeXpGain });
}

function applyEnemyAttack({ state, playerStats, config, events }) {
  if (!state.enemy) return;
  const enemyDamage = computeIncomingDamage({ enemyAttack: state.enemy.attack, config });
  const enduranceXpGain = computeEnduranceXpGain(enemyDamage, playerStats, config);
  const endurancePrestigeXpGain = computePrestigeXpGain({ runXpGain: enduranceXpGain, gainRate: config.progression.endurancePrestigeGain });

  state.run.enduranceXp += enduranceXpGain;
  state.persistent.endurancePrestigeXp += endurancePrestigeXpGain;
  state.run.hp = Math.max(0, state.run.hp - enemyDamage);

  events.push({ type: 'enemyHit', amount: enemyDamage, enduranceXpGain, endurancePrestigeXpGain });
}

function tickCombatIntervals({ state, dtMs, playerStats, config, events }) {
  if (!state.enemy || !isWithinEffectiveRange(state, config)) {
    state.combatTimers.playerMs = 0;
    state.combatTimers.enemyMs = 0;
    return;
  }

  state.combatTimers.playerMs += dtMs;
  state.combatTimers.enemyMs += dtMs;

  const mindMultiplier = getMindAttackSpeedMultiplier({
    mindLevel: state.run.mindLevel,
    mindPrestigeLevel: state.run.mindPrestigeLevel,
    config
  });
  const playerIntervalMs = Math.max(config.combat.minAttackIntervalMs, config.combat.playerAttackIntervalMs / mindMultiplier);

  if (consumeInterval({ timerMs: state.combatTimers.playerMs, intervalMs: playerIntervalMs })) {
    state.combatTimers.playerMs -= playerIntervalMs;
    applyPlayerAttack({ state, playerStats, config, events });
  }

  if (!state.enemy || state.enemy.hp <= 0) return;

  if (consumeInterval({ timerMs: state.combatTimers.enemyMs, intervalMs: config.combat.enemyAttackIntervalMs })) {
    state.combatTimers.enemyMs -= config.combat.enemyAttackIntervalMs;
    applyEnemyAttack({ state, playerStats, config, events });
  }
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

  const bodyEssence = spentEssence * flowRates.body;
  const mindEssence = spentEssence * flowRates.mind;
  const spiritEssence = spentEssence * flowRates.spirit;

  state.run.bodyEssence += toCultivationExp({ allocatedEssence: bodyEssence, prestigeLevel: state.run.bodyPrestigeLevel, config });
  state.run.mindEssence += toCultivationExp({ allocatedEssence: mindEssence, prestigeLevel: state.run.mindPrestigeLevel, config });
  state.run.spiritEssence += toCultivationExp({ allocatedEssence: spiritEssence, prestigeLevel: state.run.spiritPrestigeLevel, config });
  state.run.bodyPrestigeXp += computePrestigeXpGain({ runXpGain: bodyEssence, gainRate: config.cultivation.cultivationPrestigeGain });
  state.run.mindPrestigeXp += computePrestigeXpGain({ runXpGain: mindEssence, gainRate: config.cultivation.cultivationPrestigeGain });
  state.run.spiritPrestigeXp += computePrestigeXpGain({ runXpGain: spiritEssence, gainRate: config.cultivation.cultivationPrestigeGain });
}

function normalizeFlowRates(flowRates = {}) {
  const body = Math.max(0, Number(flowRates.body) || 0);
  const mind = Math.max(0, Number(flowRates.mind) || 0);
  const spirit = Math.max(0, Number(flowRates.spirit) || 0);
  const total = body + mind + spirit;
  if (total <= 0) return { body: 1 / 3, mind: 1 / 3, spirit: 1 / 3 };

  return {
    body: body / total,
    mind: mind / total,
    spirit: spirit / total
  };
}

function consumeInterval({ timerMs, intervalMs }) {
  return timerMs >= intervalMs;
}

function tickMovement({ state, dtMs, config, events }) {
  if (state.activityMode === 'cultivation' && !state.enemy) return;

  if (state.activityMode === 'cultivation' && state.enemy) {
    state.battlePositions.movementMs += dtMs;

    while (consumeInterval({ timerMs: state.battlePositions.movementMs, intervalMs: config.combat.movementIntervalMs })) {
      state.battlePositions.movementMs -= config.combat.movementIntervalMs;
      advanceTowardsRange({ battlePositions: state.battlePositions, effectiveRangeHex: config.combat.effectiveRangeHex });
    }

    return;
  }

  state.battlePositions.movementMs += dtMs;

  while (consumeInterval({ timerMs: state.battlePositions.movementMs, intervalMs: config.combat.movementIntervalMs })) {
    state.battlePositions.movementMs -= config.combat.movementIntervalMs;

    if (state.enemy) {
      advanceTowardsRange({ battlePositions: state.battlePositions, effectiveRangeHex: config.combat.effectiveRangeHex });
      continue;
    }

    movePlayerForward({ state });
    revealNextHex({ state, config, events });
  }
}

function toCultivationExp({ allocatedEssence, prestigeLevel, config }) {
  if (allocatedEssence <= 0) return 0;
  const multiplier = 1 + Math.max(0, prestigeLevel) * config.cultivation.essenceXpBoostPerPrestigeLevel;
  return allocatedEssence * multiplier;
}

function movePlayerForward({ state }) {
  const direction = HEX_DIRECTIONS[state.world.moveDirectionIndex % HEX_DIRECTIONS.length];
  state.battlePositions.playerHex.q += direction.q;
  state.battlePositions.playerHex.r += direction.r;

  if (Math.random() < 0.2) {
    state.world.moveDirectionIndex = (state.world.moveDirectionIndex + 1 + Math.floor(Math.random() * 2)) % HEX_DIRECTIONS.length;
  }
}

function revealNextHex({ state, config, events }) {
  state.world.revealedHexes += 1;
  state.world.travelDepth = getHexDistance(state.battlePositions.playerHex, { q: 0, r: 0 });

  const spawnChance = getSpawnChance({ missStreak: state.world.spawnMissStreak, config });
  const guaranteedSpawn = state.world.spawnMissStreak >= config.world.revealSpawnGuaranteeMisses;

  if (!guaranteedSpawn && Math.random() > spawnChance) {
    state.world.spawnMissStreak += 1;
    events.push({ type: 'revealHex', spawned: false, depth: state.world.travelDepth, spawnChance });
    return;
  }

  state.world.spawnMissStreak = 0;

  const additionalEncounters = getConsecutiveEncounterCount({ travelDepth: state.world.travelDepth, config });
  state.world.pendingEncounters = Math.max(0, additionalEncounters - 1);
  spawnEncounterFromReveal({ state, config, events, reason: guaranteedSpawn ? 'guarantee' : 'reveal' });
}

function getSpawnChance({ missStreak, config }) {
  const chance = config.world.revealSpawnChanceBase + missStreak * config.world.revealSpawnChanceMissIncrement;
  return Math.max(0, Math.min(config.world.revealSpawnChanceCap, chance));
}

function getConsecutiveEncounterCount({ travelDepth, config }) {
  const stackBonus = Math.floor(travelDepth / Math.max(1, config.world.consecutiveEnemiesDepthStep));
  return config.world.consecutiveEnemiesBase + stackBonus;
}

function spawnEncounterFromReveal({ state, config, events, reason }) {
  const playerHex = state.battlePositions.playerHex;
  const direction = HEX_DIRECTIONS[state.world.moveDirectionIndex % HEX_DIRECTIONS.length];
  const spawnGap = Math.max(config.combat.effectiveRangeHex + 1, config.combat.startingHexGap);
  const enemyHex = {
    q: playerHex.q + direction.q * spawnGap,
    r: playerHex.r + direction.r * spawnGap
  };

  state.battlePositions.enemyHex = enemyHex;
  const biome = getWorldRegion({ hex: enemyHex, config });
  state.enemy = createEnemyForFloor(state.floor, config, { biome, hex: enemyHex });
  state.combatTimers.playerMs = 0;
  state.combatTimers.enemyMs = 0;

  events.push({
    type: 'spawnEnemy',
    reason,
    depth: state.world.travelDepth,
    pendingEncounters: state.world.pendingEncounters,
    rarity: state.enemy.rarity.key,
    biome: biome.name
  });
}

function rollRarity(config) {
  const roll = Math.random();
  let cumulative = 0;

  for (const tier of config.combat.rarityTiers) {
    cumulative += tier.chance;
    if (roll <= cumulative) return tier;
  }

  return config.combat.rarityTiers.at(-1);
}

function getWorldRegion({ hex, config }) {
  const biomes = config.world?.biomes ?? [];
  if (!biomes.length) return { key: 'Unknown', name: 'Unknown', enemyColor: '#f97316' };

  const bandSize = Math.max(1, config.world?.biomeBandSize ?? 8);
  const distance = getHexDistance(hex, { q: 0, r: 0 });
  const directionalShift = Math.floor((hex.q * 2 + hex.r) / bandSize);
  const bandIndex = Math.floor(distance / bandSize) + directionalShift;
  const normalizedIndex = ((bandIndex % biomes.length) + biomes.length) % biomes.length;

  return biomes[normalizedIndex];
}

function advanceTowardsRange({ battlePositions, effectiveRangeHex }) {
  if (!battlePositions.enemyHex) return;
  if (getHexDistance(battlePositions.playerHex, battlePositions.enemyHex) <= effectiveRangeHex) return;

  battlePositions.playerHex = stepHexTowards({ from: battlePositions.playerHex, to: battlePositions.enemyHex });
  if (getHexDistance(battlePositions.playerHex, battlePositions.enemyHex) <= effectiveRangeHex) return;

  battlePositions.enemyHex = stepHexTowards({ from: battlePositions.enemyHex, to: battlePositions.playerHex });
}

function stepHexTowards({ from, to }) {
  let best = from;
  let bestDistance = getHexDistance(from, to);

  for (const dir of HEX_DIRECTIONS) {
    const candidate = { q: from.q + dir.q, r: from.r + dir.r };
    const distance = getHexDistance(candidate, to);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function isWithinEffectiveRange(state, config) {
  return state.enemy && state.battlePositions.enemyHex
    ? getHexDistance(state.battlePositions.playerHex, state.battlePositions.enemyHex) <= config.combat.effectiveRangeHex
    : false;
}

function getHexDistance(from, to) {
  return (Math.abs(from.q - to.q) + Math.abs(from.r - to.r) + Math.abs(from.q + from.r - to.q - to.r)) / 2;
}

function computePrestigeXpGain({ runXpGain, gainRate }) {
  if (runXpGain <= 0 || gainRate <= 0) return 0;
  return Math.max(1, Math.floor(runXpGain * gainRate));
}

function processStrengthRunLevelUps({ run, statistics, config, events }) {
  while (run.strengthXp >= getRunXpThreshold(run.strengthLevel, config)) {
    const requiredXp = getRunXpThreshold(run.strengthLevel, config);
    run.strengthXp -= requiredXp;
    run.strengthLevel += 1;
    if (statistics) statistics.totalLevelsGained.strength += 1;
    events.push({ type: 'strengthLevelUp', level: run.strengthLevel });
  }
}

function processEnduranceRunLevelUps({ run, statistics, config, events }) {
  while (run.enduranceXp >= getRunXpThreshold(run.enduranceLevel, config)) {
    const requiredXp = getRunXpThreshold(run.enduranceLevel, config);
    run.enduranceXp -= requiredXp;
    run.enduranceLevel += 1;
    if (statistics) statistics.totalLevelsGained.endurance += 1;
    events.push({ type: 'enduranceLevelUp', level: run.enduranceLevel });
  }
}

function processStrengthPrestigeLevelUps({ persistent, statistics, config, events }) {
  while (persistent.strengthPrestigeXp >= getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.strengthPrestigeLevel, config);
    persistent.strengthPrestigeXp -= requiredXp;
    persistent.strengthPrestigeLevel += 1;
    if (statistics) statistics.totalLevelsGained.strengthPrestige += 1;
    events.push({ type: 'strengthPrestigeLevelUp', level: persistent.strengthPrestigeLevel });
  }
}

function processEndurancePrestigeLevelUps({ persistent, statistics, config, events }) {
  while (persistent.endurancePrestigeXp >= getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(persistent.endurancePrestigeLevel, config);
    persistent.endurancePrestigeXp -= requiredXp;
    persistent.endurancePrestigeLevel += 1;
    if (statistics) statistics.totalLevelsGained.endurancePrestige += 1;
    events.push({ type: 'endurancePrestigeLevelUp', level: persistent.endurancePrestigeLevel });
  }
}

function processBodyCultivationLevelUps({ run, statistics, config, events }) {
  while (run.bodyEssence >= getBodyEssenceThreshold(run.bodyLevel, config)) {
    const requiredEssence = getBodyEssenceThreshold(run.bodyLevel, config);
    run.bodyEssence -= requiredEssence;
    run.bodyLevel += 1;
    if (statistics) statistics.totalLevelsGained.body += 1;
    events.push({ type: 'bodyLevelUp', level: run.bodyLevel });
  }
}

function processMindCultivationLevelUps({ run, statistics, config, events }) {
  while (run.mindEssence >= getMindEssenceThreshold(run.mindLevel, config)) {
    const requiredEssence = getMindEssenceThreshold(run.mindLevel, config);
    run.mindEssence -= requiredEssence;
    run.mindLevel += 1;
    if (statistics) statistics.totalLevelsGained.mind += 1;
    events.push({ type: 'mindLevelUp', level: run.mindLevel });
  }
}

function processSpiritCultivationLevelUps({ run, statistics, config, events }) {
  while (run.spiritEssence >= getSpiritEssenceThreshold(run.spiritLevel, config)) {
    const requiredEssence = getSpiritEssenceThreshold(run.spiritLevel, config);
    run.spiritEssence -= requiredEssence;
    run.spiritLevel += 1;
    if (statistics) statistics.totalLevelsGained.spirit += 1;
    events.push({ type: 'spiritLevelUp', level: run.spiritLevel });
  }
}

function processBodyCultivationPrestigeLevelUps({ run, statistics, config, events }) {
  while (run.bodyPrestigeXp >= getPrestigeXpThreshold(run.bodyPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(run.bodyPrestigeLevel, config);
    run.bodyPrestigeXp -= requiredXp;
    run.bodyPrestigeLevel += 1;
    if (statistics) statistics.totalLevelsGained.bodyPrestige += 1;
    events.push({ type: 'bodyPrestigeLevelUp', level: run.bodyPrestigeLevel });
  }
}

function processMindCultivationPrestigeLevelUps({ run, statistics, config, events }) {
  while (run.mindPrestigeXp >= getPrestigeXpThreshold(run.mindPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(run.mindPrestigeLevel, config);
    run.mindPrestigeXp -= requiredXp;
    run.mindPrestigeLevel += 1;
    if (statistics) statistics.totalLevelsGained.mindPrestige += 1;
    events.push({ type: 'mindPrestigeLevelUp', level: run.mindPrestigeLevel });
  }
}

function processSpiritCultivationPrestigeLevelUps({ run, statistics, config, events }) {
  while (run.spiritPrestigeXp >= getPrestigeXpThreshold(run.spiritPrestigeLevel, config)) {
    const requiredXp = getPrestigeXpThreshold(run.spiritPrestigeLevel, config);
    run.spiritPrestigeXp -= requiredXp;
    run.spiritPrestigeLevel += 1;
    if (statistics) statistics.totalLevelsGained.spiritPrestige += 1;
    events.push({ type: 'spiritPrestigeLevelUp', level: run.spiritPrestigeLevel });
  }
}


function updateHighestLevels(statistics, run, persistent) {
  if (!statistics) return;
  statistics.highestLevels.strength = Math.max(statistics.highestLevels.strength, run.strengthLevel);
  statistics.highestLevels.endurance = Math.max(statistics.highestLevels.endurance, run.enduranceLevel);
  statistics.highestLevels.body = Math.max(statistics.highestLevels.body, run.bodyLevel);
  statistics.highestLevels.mind = Math.max(statistics.highestLevels.mind, run.mindLevel);
  statistics.highestLevels.spirit = Math.max(statistics.highestLevels.spirit, run.spiritLevel);
  statistics.highestLevels.strengthPrestige = Math.max(statistics.highestLevels.strengthPrestige, persistent.strengthPrestigeLevel);
  statistics.highestLevels.endurancePrestige = Math.max(statistics.highestLevels.endurancePrestige, persistent.endurancePrestigeLevel);
  statistics.highestLevels.bodyPrestige = Math.max(statistics.highestLevels.bodyPrestige, run.bodyPrestigeLevel);
  statistics.highestLevels.mindPrestige = Math.max(statistics.highestLevels.mindPrestige, run.mindPrestigeLevel);
  statistics.highestLevels.spiritPrestige = Math.max(statistics.highestLevels.spiritPrestige, run.spiritPrestigeLevel);
}

function resolveEncounterOutcome({ state, config, events }) {
  const outcome = getEncounterOutcome(state);
  if (outcome === 'victory') applyVictory({ state, config, events });
  if (outcome === 'defeat') applyDefeatReset({ state, config, events });
}

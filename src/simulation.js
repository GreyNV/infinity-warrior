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
    run,
    persistent,
    cultivation: { flowRate: 0 },
    world: {
      travelDepth: 0,
      revealedHexes: 0,
      pendingEncounters: 0,
      moveDirectionIndex: 0,
      spawnMissStreak: 0
    },
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
  processCultivationFlow({ state: next, dtMs, config });
  resolveLevelUps({ run: next.run, persistent: next.persistent, config, events });
  resolveEncounterOutcome({ state: next, config, events });

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
    hp: 0
  };
}

export function createBaselinePersistentState() {
  return {
    strengthPrestigeLevel: 0,
    strengthPrestigeXp: 0,
    endurancePrestigeLevel: 0,
    endurancePrestigeXp: 0,
    agilityLevel: 0,
    agilityEssence: 0
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
  processAgilityCultivationLevelUps({ persistent, config, events });

  const playerStats = buildPlayerStats(run, persistent);
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function applyVictory({ state, config = GAME_CONFIG, events = [] }) {
  if (!state.enemy) return;

  const reward = getEssenceReward(state.floor, config);
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
  state.run.hp = getMaxHp(playerStats, config);
  events.push({ type: 'victory', reward, nextFloor: state.floor });
}

export function applyDefeatReset({ state, config = GAME_CONFIG, events = [] }) {
  state.floor = 1;
  state.world.travelDepth = 0;
  state.world.pendingEncounters = 0;
  state.world.revealedHexes = 0;
  state.world.moveDirectionIndex = 0;
  state.world.spawnMissStreak = 0;
  state.run = createBaselineRunState();
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
  return Math.floor(config.cultivation.agilityEssenceBase * Math.pow(level + 1, config.cultivation.agilityEssenceExp));
}

export function getAgilityAttackSpeedMultiplier({ agilityLevel, config = GAME_CONFIG }) {
  const rawMultiplier = 1 + Math.log1p(Math.max(0, agilityLevel)) * config.cultivation.agilitySpeedLogFactor;
  return Math.min(config.cultivation.maxAttackSpeedMultiplier, rawMultiplier);
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

  const agilityMultiplier = getAgilityAttackSpeedMultiplier({ agilityLevel: state.persistent.agilityLevel, config });
  const playerIntervalMs = Math.max(config.combat.minAttackIntervalMs, config.combat.playerAttackIntervalMs / agilityMultiplier);

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
  if (!state.unlocks.cultivation) return;

  const boundedFlowRate = Math.max(0, Math.min(1, state.cultivation.flowRate));
  const requestedEssence = (dtMs / 1000) * config.cultivation.maxFlowEssencePerSecond * boundedFlowRate;
  const spentEssence = Math.min(state.resources.essence, requestedEssence);

  state.resources.essence -= spentEssence;
  state.persistent.agilityEssence += spentEssence;
}

function consumeInterval({ timerMs, intervalMs }) {
  return timerMs >= intervalMs;
}

function tickMovement({ state, dtMs, config, events }) {
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

function processAgilityCultivationLevelUps({ persistent, config, events }) {
  while (persistent.agilityEssence >= getAgilityEssenceThreshold(persistent.agilityLevel, config)) {
    const requiredEssence = getAgilityEssenceThreshold(persistent.agilityLevel, config);
    persistent.agilityEssence -= requiredEssence;
    persistent.agilityLevel += 1;
    events.push({ type: 'agilityLevelUp', level: persistent.agilityLevel });
  }
}

function resolveEncounterOutcome({ state, config, events }) {
  const outcome = getEncounterOutcome(state);
  if (outcome === 'victory') applyVictory({ state, config, events });
  if (outcome === 'defeat') applyDefeatReset({ state, config, events });
}

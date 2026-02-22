import { GAME_CONFIG } from '../config.js';
import { getMaxHp } from './combat.js';

export function getRunXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.runXpBase * Math.pow(1 + config.progression.runXpGrowthRate, Math.max(0, level - 1)));
}

export function getPrestigeXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.prestigeXpBase * Math.pow(1 + config.progression.prestigeXpGrowthRate, Math.max(0, level)));
}

export function getEssenceReward({ distance, rarity, config = GAME_CONFIG }) {
  const rarityMultiplier = rarity?.essence ?? 1;
  return Math.floor(config.rewards.essenceBase * Math.pow(Math.max(1, distance), config.rewards.essenceExp) * rarityMultiplier);
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
  return getMindAttackSpeedMultiplier({ mindLevel: agilityLevel, config });
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

export function getMindAttackSpeedMultiplier({ mindLevel, config = GAME_CONFIG }) {
  const totalMindLevel = Math.max(0, mindLevel);
  const rawMultiplier =
    1 +
    Math.log1p(totalMindLevel) * config.cultivation.mindSpeedLogFactor +
    totalMindLevel * config.cultivation.mindSpeedPerLevel;
  return Math.min(config.cultivation.maxAttackSpeedMultiplier, rawMultiplier);
}

export function getHpRegenPerSecond(run, config = GAME_CONFIG) {
  const { hpRegenBasePerSecond, hpRegenPerBodyLevel, hpRegenBodyGrowthRate } = config.cultivation;
  const levelProgress = Math.max(0, run.bodyLevel);
  const linearRegen = levelProgress * hpRegenPerBodyLevel;
  return hpRegenBasePerSecond + linearRegen * Math.pow(1 + hpRegenBodyGrowthRate, levelProgress);
}

export function getMaxKi(run, config = GAME_CONFIG) {
  const { kiMaxBase, kiMaxPerSpiritLevel, kiSpiritGrowthRate } = config.cultivation;
  const levelProgress = Math.max(0, run.spiritLevel);
  const linearKiGain = levelProgress * kiMaxPerSpiritLevel;
  return kiMaxBase + linearKiGain * Math.pow(1 + kiSpiritGrowthRate, levelProgress);
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

  const playerStats = {
    strengthLevel: run.strengthLevel,
    enduranceLevel: run.enduranceLevel,
    strengthPrestigeLevel: persistent.strengthPrestigeLevel,
    endurancePrestigeLevel: persistent.endurancePrestigeLevel
  };
  run.hp = Math.min(run.hp, getMaxHp(playerStats, config));
}

export function normalizeFlowRates(flowRates = {}) {
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

export function toCultivationExp({ allocatedEssence, prestigeLevel, config }) {
  if (allocatedEssence <= 0) return 0;
  const multiplier = 1 + Math.max(0, prestigeLevel) * config.cultivation.essenceXpBoostPerPrestigeLevel;
  return allocatedEssence * multiplier;
}

export function updateHighestLevels(statistics, run, persistent) {
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

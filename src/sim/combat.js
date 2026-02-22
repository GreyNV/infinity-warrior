import { GAME_CONFIG } from '../config.js';
import { getWorldRegion } from './world.js';

export function createEnemyForDistance(distance, config = GAME_CONFIG, options = {}) {
  const { biome = getWorldRegion({ hex: options.hex ?? { q: 0, r: 0 }, config }), rarity = rollRarity(config) } = options;
  const biomeModifier = config.combat.biomeModifiers[biome.key] ?? { hp: 1, attack: 1 };
  const currentDepth = Math.max(1, options.currentDepth ?? distance);
  const maxHp = Math.max(1, Math.floor(getEnemyMaxHp({ distance, currentDepth, config }) * biomeModifier.hp * rarity.hp));
  const attack = Math.max(1, Math.floor(getEnemyAttack({ distance, currentDepth, config }) * biomeModifier.attack * rarity.attack));

  return {
    distance,
    hp: maxHp,
    maxHp,
    attack,
    biome,
    rarity
  };
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
  const { playerBaseHp, enduranceHpPerLevel, enduranceHpGrowthRate } = config.combat;
  const levelProgress = Math.max(0, playerStats.enduranceLevel - 1);
  const linearHpGain = levelProgress * enduranceHpPerLevel;
  const scaledHpGain = linearHpGain * Math.pow(1 + enduranceHpGrowthRate, levelProgress);
  return Math.floor(playerBaseHp + scaledHpGain);
}

export function getEnemyMaxHp(distance, config = GAME_CONFIG) {
  const depthContext = normalizeDepthContext(distance, config);
  const logDepth = getLogDepthScale(depthContext.currentDepth);
  const hpScale = 1 + logDepth * config.combat.enemyHpLogFactor + depthContext.currentDepth * config.combat.enemyHpDepthFactor;
  return Math.floor(config.combat.enemyHpBase * Math.pow(hpScale, config.combat.enemyHpExp));
}

export function getEnemyAttack(distance, config = GAME_CONFIG) {
  const depthContext = normalizeDepthContext(distance, config);
  const logDepth = getLogDepthScale(depthContext.currentDepth);
  const attackRamp = Math.pow(
    logDepth * config.combat.enemyAttackLogFactor + depthContext.currentDepth * config.combat.enemyAttackDepthFactor,
    config.combat.enemyAttackExp
  );
  return Math.floor(config.combat.enemyAttackBase + attackRamp);
}

export function computePlayerDamage(playerStats, config = GAME_CONFIG) {
  const { playerBaseAttack, strengthAttackPerLevel, strengthAttackGrowthRate, minDamage } = config.combat;
  const levelProgress = Math.max(0, playerStats.strengthLevel - 1);
  const linearAttackGain = levelProgress * strengthAttackPerLevel;
  const scaledAttackGain = linearAttackGain * Math.pow(1 + strengthAttackGrowthRate, levelProgress);
  const rawDamage = playerBaseAttack + scaledAttackGain;

  return Math.max(minDamage, Math.floor(rawDamage));
}

export function computeIncomingDamage({ enemyAttack, config = GAME_CONFIG }) {
  return Math.max(config.combat.minDamage, Math.floor(enemyAttack));
}

export function rollRarity(config) {
  const roll = Math.random();
  let cumulative = 0;

  for (const tier of config.combat.rarityTiers) {
    cumulative += tier.chance;
    if (roll <= cumulative) return tier;
  }

  return config.combat.rarityTiers.at(-1);
}

function normalizeDepthContext(distanceOrContext, fallbackConfig) {
  if (typeof distanceOrContext === 'number') {
    return { distance: Math.max(1, distanceOrContext), currentDepth: Math.max(1, distanceOrContext), config: fallbackConfig };
  }

  return {
    distance: Math.max(1, distanceOrContext.distance ?? distanceOrContext.currentDepth ?? 1),
    currentDepth: Math.max(1, distanceOrContext.currentDepth ?? distanceOrContext.distance ?? 1),
    config: distanceOrContext.config ?? fallbackConfig
  };
}

function getLogDepthScale(distance) {
  return Math.log1p(Math.max(0, distance));
}

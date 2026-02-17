import { GAME_CONFIG } from './config.js';

export function createInitialSimulationState(config = GAME_CONFIG) {
  const player = {
    strengthLevel: 1,
    enduranceLevel: 1,
    strengthPrestigeLevel: 0,
    endurancePrestigeLevel: 0,
    hp: 0
  };

  player.hp = getMaxHp(player, config);

  return {
    floor: 1,
    elapsedMs: 0,
    player,
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

  const playerDamage = computePlayerDamage(next.player, config);
  const strengthXpGain = computeStrengthXpGain(playerDamage, next.player, config);
  next.enemy.hp = Math.max(0, next.enemy.hp - playerDamage);
  events.push({ type: 'playerHit', amount: playerDamage, strengthXpGain });

  if (next.enemy.hp > 0) {
    const enemyDamage = computeEnemyDamage(next.enemy, config);
    const enduranceXpGain = computeEnduranceXpGain(enemyDamage, next.player, config);
    next.player.hp = Math.max(0, next.player.hp - enemyDamage);
    events.push({ type: 'enemyHit', amount: enemyDamage, enduranceXpGain });
  }

  const outcome = getEncounterOutcome(next);
  if (outcome) {
    events.push({ type: outcome });
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

export function getRunXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.runXpBase * Math.pow(level, config.progression.runXpExp));
}

export function getPrestigeXpThreshold(level, config = GAME_CONFIG) {
  return Math.floor(config.progression.prestigeXpBase * Math.pow(level + 1, config.progression.prestigeXpExp));
}

export function getEssenceReward(floor, config = GAME_CONFIG) {
  return Math.floor(config.rewards.essenceBase * Math.pow(floor, config.rewards.essenceExp));
}

export function getEncounterOutcome(state) {
  if (state.player.hp <= 0) {
    return 'defeat';
  }

  if (state.enemy.hp <= 0) {
    return 'victory';
  }

  return null;
}

export function isCombatOver(state) {
  return state.player.hp <= 0 || state.enemy.hp <= 0;
}

export function getMaxHp(player, config = GAME_CONFIG) {
  const { playerBaseHp, enduranceHpPerLevel, endurancePrestigeHpPerLevel } = config.combat;
  return Math.floor(
    playerBaseHp +
      (player.enduranceLevel - 1) * enduranceHpPerLevel +
      player.endurancePrestigeLevel * endurancePrestigeHpPerLevel
  );
}

export function getEnemyMaxHp(floor, config = GAME_CONFIG) {
  return Math.floor(config.combat.enemyHpBase * Math.pow(floor, config.combat.enemyHpExp));
}

export function getEnemyAttack(floor, config = GAME_CONFIG) {
  return Math.floor(config.combat.enemyAttackBase * Math.pow(floor, config.combat.enemyAttackExp));
}

export function computePlayerDamage(player, config = GAME_CONFIG) {
  const { playerBaseAttack, strengthAttackPerLevel, strengthPrestigeAttackPerLevel, minDamage } = config.combat;

  const raw =
    playerBaseAttack +
    (player.strengthLevel - 1) * strengthAttackPerLevel +
    player.strengthPrestigeLevel * strengthPrestigeAttackPerLevel;

  return Math.max(minDamage, Math.floor(raw));
}

export function computeEnemyDamage(enemy, config = GAME_CONFIG) {
  return Math.max(config.combat.minDamage, Math.floor(enemy.attack));
}

export function computeStrengthXpGain(damageDealt, player, config = GAME_CONFIG) {
  const { strengthXpPerDamage, strengthXpBoostPerStrengthPrestigeLevel } = config.progression;
  const prestigeMultiplier = 1 + player.strengthPrestigeLevel * strengthXpBoostPerStrengthPrestigeLevel;
  return Math.floor(damageDealt * strengthXpPerDamage * prestigeMultiplier);
}

export function computeEnduranceXpGain(damageTaken, player, config = GAME_CONFIG) {
  const { enduranceXpPerDamage, enduranceXpBoostPerEndurancePrestigeLevel } = config.progression;
  const prestigeMultiplier = 1 + player.endurancePrestigeLevel * enduranceXpBoostPerEndurancePrestigeLevel;
  return Math.floor(damageTaken * enduranceXpPerDamage * prestigeMultiplier);
}

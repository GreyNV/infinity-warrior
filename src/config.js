export const GAME_CONFIG = {
  timing: {
    simulationDtMs: 100,
    autosaveMs: 10_000,
    offlineCapHours: 8
  },
  progression: {
    strengthXpPerDamage: 1,
    enduranceXpPerDamage: 1,
    strengthXpBoostPerStrengthPrestigeLevel: 0.02,
    enduranceXpBoostPerEndurancePrestigeLevel: 0.02,
    runXpBase: 20,
    runXpExp: 1.30,
    prestigeXpBase: 120,
    prestigeXpExp: 1.55,
    strengthPrestigeGain: 0.08,
    endurancePrestigeGain: 0.08
  },
  combat: {
    playerAttackIntervalMs: 650,
    enemyAttackIntervalMs: 950,
    movementIntervalMs: 280,
    startingHexGap: 8,
    effectiveRangeHex: 1,
    playerBaseAttack: 6,
    strengthAttackPerLevel: 1.6,
    strengthPrestigeAttackPerLevel: 0.35,
    playerBaseHp: 90,
    enduranceHpPerLevel: 13,
    endurancePrestigeHpPerLevel: 3,
    enemyHpBase: 30,
    enemyHpExp: 1.35,
    enemyAttackBase: 4,
    enemyAttackExp: 1.18,
    minDamage: 1
  },
  rewards: {
    essenceBase: 10,
    essenceExp: 1.20
  }
};

export function createConfig(overrides = {}) {
  return mergeDeep(GAME_CONFIG, overrides);
}

function mergeDeep(base, overrides) {
  if (typeof base !== 'object' || base === null) {
    return overrides ?? base;
  }

  const result = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && key in result) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

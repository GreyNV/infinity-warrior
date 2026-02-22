export const GAME_CONFIG = {
  timing: {
    simulationDtMs: 100,
    autosaveMs: 10_000,
    offlineCapHours: 8
  },
  progression: {
    strengthXpPerDamage: 1,
    enduranceXpPerDamage: 1,
    strengthXpBoostPerStrengthPrestigeLevel: 0.10,
    enduranceXpBoostPerEndurancePrestigeLevel: 0.10,
    runXpBase: 10,
    runXpGrowthRate: 0.15,
    prestigeXpBase: 100,
    prestigeXpGrowthRate: 0.20
  },
  combat: {
    playerAttackIntervalMs: 650,
    minAttackIntervalMs: 220,
    enemyAttackIntervalMs: 950,
    movementIntervalMs: 280,
    startingHexGap: 8,
    effectiveRangeHex: 1,
    playerBaseAttack: 6,
    strengthAttackPerLevel: 1.6,
    strengthAttackGrowthRate: 0.045,
    playerBaseHp: 90,
    enduranceHpPerLevel: 13,
    enduranceHpGrowthRate: 0.04,
    enemyHpBase: 30,
    enemyHpExp: 1.24,
    enemyHpLogFactor: 0.58,
    enemyHpDepthFactor: 0.014,
    enemyAttackBase: 4,
    enemyAttackExp: 1.1,
    enemyAttackLogFactor: 0.78,
    enemyAttackDepthFactor: 0.009,
    minDamage: 1,
    biomeModifiers: {
      IronFlats: { hp: 1.1, attack: 0.95 },
      AshDunes: { hp: 0.9, attack: 1.18 },
      VerdantLattice: { hp: 1.28, attack: 0.88 },
      CrystalVerge: { hp: 1.02, attack: 1.08 }
    },
    rarityTiers: [
      { key: 'common', chance: 0.81, hp: 1, attack: 1, essence: 1, color: '#9ca3af', label: 'Common' },
      { key: 'uncommon', chance: 0.10, hp: 1.35, attack: 1.2, essence: 1.2, color: '#34d399', label: 'Uncommon' },
      { key: 'rare', chance: 0.05, hp: 1.8, attack: 1.45, essence: 1.45, color: '#60a5fa', label: 'Rare' },
      { key: 'epic', chance: 0.03, hp: 2.45, attack: 1.9, essence: 1.85, color: '#c084fc', label: 'Epic' },
      { key: 'legendary', chance: 0.01, hp: 3.4, attack: 2.7, essence: 2.4, color: '#f59e0b', label: 'Legendary' }
    ]
  },
  rewards: {
    essenceBase: 7,
    essenceExp: 1.14
  },
  cultivation: {
    maxFlowEssencePerSecond: 18,
    hpRegenBasePerSecond: 0.8,
    hpRegenPerBodyLevel: 0.22,
    hpRegenBodyGrowthRate: 0.03,
    mindEssenceBase: 28,
    mindEssenceExp: 1.56,
    mindSpeedLogFactor: 0.26,
    mindSpeedPerLevel: 0.01,
    maxAttackSpeedMultiplier: 3,
    bodyEssenceBase: 24,
    bodyEssenceExp: 1.52,
    spiritEssenceBase: 34,
    spiritEssenceExp: 1.58,
    essenceXpBoostPerPrestigeLevel: 0.10,
    kiBaseRegenPerSecond: 0.01,
    kiMaxBase: 1,
    kiMaxPerSpiritLevel: 1,
    kiSpiritGrowthRate: 0.05,
  },
  persistence: {
    offlineEssencePerSecondBase: 0.15,
    offlineEssencePerBestFloor: 0.02,
    offlineEssencePerPrestigeLevel: 0.01,
    offlineFlowEfficiency: 0.8
  },
  world: {
    biomeBandSize: 9,
    revealSpawnChanceBase: 0.25,
    revealSpawnChanceMissIncrement: 0.075,
    revealSpawnChanceCap: 0.9,
    consecutiveEnemiesDepthStep: 12,
    consecutiveEnemiesBase: 1,
    multiEnemyChanceBase: 0.08,
    multiEnemyChanceDepthStep: 10,
    multiEnemyChancePerStep: 0.05,
    multiEnemyChanceCap: 0.45,
    biomes: [
      {
        key: 'IronFlats',
        name: 'Iron Flats',
        fill: '#1f2937',
        accent: '#334155',
        stroke: '#475569',
        enemyColor: '#ef4444'
      },
      {
        key: 'AshDunes',
        name: 'Ash Dunes',
        fill: '#2b1f17',
        accent: '#4a2f1b',
        stroke: '#6b4226',
        enemyColor: '#f97316'
      },
      {
        key: 'VerdantLattice',
        name: 'Verdant Lattice',
        fill: '#15241b',
        accent: '#1f3a2b',
        stroke: '#2f6b4a',
        enemyColor: '#22c55e'
      },
      {
        key: 'CrystalVerge',
        name: 'Crystal Verge',
        fill: '#1a2238',
        accent: '#243053',
        stroke: '#3e4f80',
        enemyColor: '#38bdf8'
      }
    ]
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

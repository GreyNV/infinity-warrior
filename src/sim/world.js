import { GAME_CONFIG } from '../config.js';
import { createEnemyForDistance } from './combat.js';

export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 }
];

export function getEncounterDistanceForDepth({ playerHex, moveDirectionIndex, config = GAME_CONFIG }) {
  const direction = HEX_DIRECTIONS[moveDirectionIndex % HEX_DIRECTIONS.length];
  const spawnGap = Math.max(config.combat.effectiveRangeHex + 1, config.combat.startingHexGap);
  const enemyHex = {
    q: playerHex.q + direction.q * spawnGap,
    r: playerHex.r + direction.r * spawnGap
  };

  return {
    enemyHex,
    encounterDistance: Math.max(1, getHexDistance(enemyHex, { q: 0, r: 0 }))
  };
}

export function createInitialBattlePositions(config = GAME_CONFIG) {
  return {
    playerHex: { q: 0, r: 0 },
    enemyHex: null,
    movementMs: 0
  };
}

export function tickMovement({ state, dtMs, config, events }) {
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

export function isWithinEffectiveRange(state, config) {
  return state.enemy && state.battlePositions.enemyHex
    ? getHexDistance(state.battlePositions.playerHex, state.battlePositions.enemyHex) <= config.combat.effectiveRangeHex
    : false;
}

export function getWorldRegion({ hex, config }) {
  const biomes = config.world?.biomes ?? [];
  if (!biomes.length) return { key: 'Unknown', name: 'Unknown', enemyColor: '#f97316' };

  const bandSize = Math.max(1, config.world?.biomeBandSize ?? 8);
  const distance = getHexDistance(hex, { q: 0, r: 0 });
  const directionalShift = Math.floor((hex.q * 2 + hex.r) / bandSize);
  const bandIndex = Math.floor(distance / bandSize) + directionalShift;
  const normalizedIndex = ((bandIndex % biomes.length) + biomes.length) % biomes.length;

  return biomes[normalizedIndex];
}

export function getHexDistance(from, to) {
  return (Math.abs(from.q - to.q) + Math.abs(from.r - to.r) + Math.abs(from.q + from.r - to.q - to.r)) / 2;
}

function consumeInterval({ timerMs, intervalMs }) {
  return timerMs >= intervalMs;
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
  state.world.bestDepth = Math.max(state.world.bestDepth, state.world.travelDepth);

  const spawnChance = getSpawnChance({ missStreak: state.world.spawnMissStreak, config });
  const didSpawn = trySpawnEncounter({ state, config, events, reason: 'reveal', spawnChance });
  if (!didSpawn) {
    state.world.spawnMissStreak += 1;
    events.push({ type: 'revealHex', spawned: false, depth: state.world.travelDepth, spawnChance });
    return;
  }

  state.world.spawnMissStreak = 0;

  const additionalEncounters = getConsecutiveEncounterCount({ travelDepth: state.world.travelDepth, config });
  state.world.pendingEncounters = Math.max(0, additionalEncounters - 1);
  events.push({ type: 'revealHex', spawned: true, depth: state.world.travelDepth, spawnChance });
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
  const { enemyHex, encounterDistance } = getEncounterDistanceForDepth({
    playerHex: state.battlePositions.playerHex,
    moveDirectionIndex: state.world.moveDirectionIndex,
    config
  });

  state.battlePositions.enemyHex = enemyHex;
  const biome = getWorldRegion({ hex: enemyHex, config });
  state.enemy = createEnemyForDistance(encounterDistance, config, {
    biome,
    hex: enemyHex,
    currentDepth: Math.max(1, state.world.travelDepth)
  });
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

export function trySpawnEncounter({ state, config, events, reason, spawnChance }) {
  if (Math.random() > spawnChance) {
    if (reason === 'chain') {
      events.push({ type: 'chainSpawnMiss', depth: state.world.travelDepth, spawnChance });
    }
    return false;
  }

  spawnEncounterFromReveal({ state, config, events, reason });
  return true;
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

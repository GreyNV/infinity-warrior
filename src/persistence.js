import { GAME_CONFIG } from './config.js';
import { createInitialSimulationState, resolveLevelUps } from './simulation.js';

const SAVE_VERSION = 1;
const SAVE_KEY = 'infinity-warrior-save';

export function loadGame(config = GAME_CONFIG) {
  const fallbackState = createInitialSimulationState(config);

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return { state: fallbackState, offlineReport: null, source: 'new' };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state) {
      return { state: fallbackState, offlineReport: null, source: 'new' };
    }

    const hydratedState = mergeDefined(fallbackState, parsed.state);
    const elapsedMs = getElapsedOfflineMs(parsed.savedAt);
    const offlineReport = applyOfflineProgress({
      state: hydratedState,
      elapsedMs,
      config
    });

    return { state: hydratedState, offlineReport, source: 'save' };
  } catch {
    return { state: fallbackState, offlineReport: null, source: 'error' };
  }
}

export function saveGame(state) {
  const payload = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state
  };

  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function applyOfflineProgress({ state, elapsedMs, config = GAME_CONFIG }) {
  const cappedMs = Math.max(0, Math.min(elapsedMs, config.timing.offlineCapHours * 60 * 60 * 1000));
  if (cappedMs <= 1000) return null;

  const secondsAway = cappedMs / 1000;
  const baseEssence = config.persistence.offlineEssencePerSecondBase;
  const floorBonus = state.bestFloor * config.persistence.offlineEssencePerBestFloor;
  const prestigeBonus =
    state.persistent.strengthPrestigeLevel * config.persistence.offlineEssencePerPrestigeLevel +
    state.persistent.endurancePrestigeLevel * config.persistence.offlineEssencePerPrestigeLevel;

  const passiveEssenceGain = Math.floor(secondsAway * (baseEssence + floorBonus + prestigeBonus));
  state.resources.essence += passiveEssenceGain;

  let flowEssenceSpent = 0;
  if (state.unlocks.cultivation) {
    const normalizedFlow = normalizeFlowRates(state.cultivation.flowRates);
    state.cultivation.flowRates = normalizedFlow;

    const maxSpend = secondsAway * config.cultivation.maxFlowEssencePerSecond * config.persistence.offlineFlowEfficiency;
    flowEssenceSpent = Math.min(state.resources.essence, maxSpend);
    state.resources.essence -= flowEssenceSpent;

    distributeCultivationEssence({ state, essence: flowEssenceSpent, flowRates: normalizedFlow, config });
    resolveLevelUps({ run: state.run, persistent: state.persistent, config, events: [] });
  }

  state.elapsedMs += cappedMs;

  return {
    awaySeconds: Math.floor(secondsAway),
    passiveEssenceGain,
    flowEssenceSpent: Math.floor(flowEssenceSpent)
  };
}

function distributeCultivationEssence({ state, essence, flowRates, config }) {
  const bodyEssence = essence * flowRates.body;
  const mindEssence = essence * flowRates.mind;
  const spiritEssence = essence * flowRates.spirit;

  state.run.bodyEssence += bodyEssence;
  state.run.mindEssence += mindEssence;
  state.run.spiritEssence += spiritEssence;

  state.run.bodyPrestigeXp += toCultivationPrestigeXp({ essence: bodyEssence, config });
  state.run.mindPrestigeXp += toCultivationPrestigeXp({ essence: mindEssence, config });
  state.run.spiritPrestigeXp += toCultivationPrestigeXp({ essence: spiritEssence, config });
}

function toCultivationPrestigeXp({ essence, config }) {
  if (essence <= 0) return 0;
  return Math.max(1, Math.floor(essence * config.cultivation.cultivationPrestigeGain));
}

function getElapsedOfflineMs(savedAt) {
  if (!Number.isFinite(savedAt)) return 0;
  return Math.max(0, Date.now() - savedAt);
}

function mergeDefined(base, incoming) {
  if (Array.isArray(base)) {
    return Array.isArray(incoming) ? [...incoming] : [...base];
  }

  if (!isRecord(base)) {
    return incoming === undefined ? base : incoming;
  }

  const merged = { ...base };

  for (const [key, value] of Object.entries(base)) {
    merged[key] = mergeDefined(value, incoming?.[key]);
  }

  if (isRecord(incoming)) {
    for (const [key, value] of Object.entries(incoming)) {
      if (!(key in merged) && value !== undefined) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFlowRates(flowRates = {}) {
  const body = Math.max(0, Number(flowRates.body) || 0);
  const mind = Math.max(0, Number(flowRates.mind) || 0);
  const spirit = Math.max(0, Number(flowRates.spirit) || 0);
  const total = body + mind + spirit;

  if (total <= 0) {
    return { body: 1 / 3, mind: 1 / 3, spirit: 1 / 3 };
  }

  return {
    body: body / total,
    mind: mind / total,
    spirit: spirit / total
  };
}

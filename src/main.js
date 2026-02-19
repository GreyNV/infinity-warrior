import { GAME_CONFIG } from './config.js';
import {
  buildPlayerStats,
  createInitialSimulationState,
  getBodyEssenceThreshold,
  getEncounterDistanceForDepth,
  getEnemyAttack,
  getEnemyMaxHp,
  getHpRegenPerSecond,
  getMaxKi,
  getMindAttackSpeedMultiplier,
  getMindEssenceThreshold,
  getPrestigeXpThreshold,
  getRunXpThreshold,
  getSpiritEssenceThreshold,
  simulateTick
} from './simulation.js';
import { createRenderer } from './render.js';
import { loadGame, saveGame } from './persistence.js';

const UI = getUiElements();
const renderer = createRenderer({ canvas: UI.canvas, config: GAME_CONFIG });

const app = createGameApp({
  config: GAME_CONFIG,
  ui: UI,
  renderer,
  loadGame,
  saveGame,
  simulateTick,
  buildPlayerStats
});

app.start();

function createGameApp({ config, ui, renderer, loadGame: loadFn, saveGame: saveFn, simulateTick: tickFn, buildPlayerStats: buildStats }) {
  let state = createInitialSimulationState(config);
  const loaded = loadFn(config);
  state = loaded.state;

  let selectedTab = getInitialSelectedTab(state);
  state.activityMode = getValidatedMode(state);

  const eventBus = createPubSub();
  const battleFeed = createBattleFeed({ maxEntries: 24 });
  const runtime = createRuntimeClock({ config });

  eventBus.subscribe('simulation:tick', ({ events }) => {
    battleFeed.capture(events);
    renderer.ingestEvents(events);
  });

  bindNavigationHandlers({ ui, getState: () => state, onTabChange: handleTabChange, onModeChange: handleModeChange });
  renderOfflineSummary({ ui, report: loaded.offlineReport });
  syncUiState();
  renderUi();

  function start() {
    window.addEventListener('beforeunload', () => saveFn(state));
    requestAnimationFrame(frame);
  }

  function frame(nowMs) {
    const frameMs = runtime.consumeFrame(nowMs);
    stepSimulation({ frameMs });
    autosave({ frameMs });
    drawFrame({ frameMs });

    syncUiState();
    renderUi();
    requestAnimationFrame(frame);
  }

  function stepSimulation({ frameMs }) {
    runtime.accumulatorMs += frameMs;

    while (runtime.accumulatorMs >= config.timing.simulationDtMs) {
      state = tickFn(state, config.timing.simulationDtMs, config);
      eventBus.publish('simulation:tick', { events: state.combatLog, state });
      runtime.accumulatorMs -= config.timing.simulationDtMs;
    }
  }

  function autosave({ frameMs }) {
    runtime.autosaveMs += frameMs;
    if (runtime.autosaveMs < config.timing.autosaveMs) return;
    runtime.autosaveMs = 0;
    saveFn(state);
  }

  function drawFrame({ frameMs }) {
    renderer.render({
      state: {
        ...state,
        playerStats: buildStats(state.run, state.persistent)
      },
      alpha: frameMs / config.timing.simulationDtMs
    });
  }

  function handleTabChange(nextTab) {
    if (nextTab === 'cultivation' && !state.unlocks.cultivation) return;
    selectedTab = nextTab;
    eventBus.publish('ui:tabChanged', { tab: selectedTab });
    syncUiState();
    renderUi();
  }

  function handleModeChange(nextMode) {
    if (nextMode === 'cultivation' && !state.unlocks.cultivation) return;
    state.activityMode = nextMode;
    eventBus.publish('ui:modeChanged', { mode: state.activityMode });
    syncUiState();
    renderUi();
  }

  function syncUiState() {
    ui.cultivationTabButton.disabled = !state.unlocks.cultivation;
    ui.cultivationModeButton.disabled = !state.unlocks.cultivation;

    if (!state.unlocks.cultivation && selectedTab === 'cultivation') {
      selectedTab = 'character';
      state.activityMode = 'battle';
    }

    syncButtonCollection({ buttons: ui.navButtons, activeValue: selectedTab, datasetKey: 'tab' });
    syncButtonCollection({ buttons: ui.modeButtons, activeValue: state.activityMode, datasetKey: 'mode' });
  }

  function renderUi() {
    ui.coreStats.innerHTML = renderQuickCoreSummary({ state, config });

    const tabMarkup = renderTabContent({
      selectedTab,
      state,
      config,
      battleFeed: battleFeed.lines,
      onFlowSliderRender: bindFlowSlider
    });

    ui.tabContent.innerHTML = tabMarkup;
  }

  function bindFlowSlider(id, key) {
    const slider = document.getElementById(id);
    if (!slider) return;
    slider.addEventListener('input', () => {
      state.cultivation.flowRates[key] = Number(slider.value) / 100;
    });
  }

  return { start };
}

function getUiElements() {
  return {
    canvas: document.getElementById('game'),
    coreStats: document.getElementById('core-stats'),
    tabContent: document.getElementById('tab-content'),
    cultivationTabButton: document.getElementById('cultivation-tab'),
    cultivationModeButton: document.getElementById('cultivation-mode'),
    offlineSummary: document.getElementById('offline-summary'),
    navButtons: [...document.querySelectorAll('.tab-nav button')],
    modeButtons: [...document.querySelectorAll('#activity-switch button')]
  };
}

function createRuntimeClock({ config }) {
  return {
    lastFrameMs: performance.now(),
    accumulatorMs: 0,
    autosaveMs: 0,
    consumeFrame(nowMs) {
      const frameMs = Math.min(100, nowMs - this.lastFrameMs);
      this.lastFrameMs = nowMs;
      return frameMs;
    }
  };
}


function createPubSub() {
  const listenersByTopic = new Map();

  function subscribe(topic, handler) {
    const listeners = listenersByTopic.get(topic) ?? new Set();
    listeners.add(handler);
    listenersByTopic.set(topic, listeners);

    return () => {
      const topicListeners = listenersByTopic.get(topic);
      if (!topicListeners) return;
      topicListeners.delete(handler);
      if (!topicListeners.size) listenersByTopic.delete(topic);
    };
  }

  function publish(topic, payload) {
    const listeners = listenersByTopic.get(topic);
    if (!listeners) return;
    for (const listener of listeners) listener(payload);
  }

  return { subscribe, publish };
}

function createBattleFeed({ maxEntries }) {
  const lines = [];

  function capture(events) {
    for (const event of events) {
      if (event.type === 'playerHit') lines.unshift(`Dealt ${event.amount} · STR XP +${event.strengthXpGain}`);
      if (event.type === 'enemyHit') lines.unshift(`Took ${event.amount} · END XP +${event.enduranceXpGain}`);
      if (event.type === 'victory') lines.unshift(`Victory (${event.rarity}) · Essence +${event.reward}`);
    }

    lines.splice(maxEntries);
  }

  return { lines, capture };
}

function bindNavigationHandlers({ ui, getState, onTabChange, onModeChange }) {
  ui.navButtons.forEach((button) => {
    button.addEventListener('click', () => onTabChange(button.dataset.tab));
  });

  ui.modeButtons.forEach((button) => {
    button.addEventListener('click', () => onModeChange(button.dataset.mode));
  });

  const state = getState();
  if (!state.unlocks.cultivation) return;
}

function syncButtonCollection({ buttons, activeValue, datasetKey }) {
  for (const button of buttons) {
    button.classList.toggle('active', button.dataset[datasetKey] === activeValue);
  }
}

function getInitialSelectedTab(state) {
  return state.activityMode === 'cultivation' && state.unlocks.cultivation ? 'cultivation' : 'character';
}

function getValidatedMode(state) {
  return state.activityMode === 'cultivation' && state.unlocks.cultivation ? 'cultivation' : 'battle';
}

function renderQuickCoreSummary({ state, config }) {
  const maxKi = getMaxKi(state.run, config);
  const overallPower = computeOverallPower(state);

  return `
    <div class="stat-line">Depth ${state.world.travelDepth} · Best ${state.world.bestDepth}</div>
    <div class="stat-line">Revealed ${state.world.revealedHexes} hexes</div>
    <div class="stat-line">Essence ${Math.floor(state.resources.essence)} · Ki ${state.run.ki.toFixed(2)} / ${maxKi.toFixed(1)}</div>
    <div class="stat-line">Power ${overallPower.toLocaleString()}</div>
  `;
}

function renderTabContent({ selectedTab, state, config, battleFeed, onFlowSliderRender }) {
  if (selectedTab === 'battle') return renderBattleTab({ state, battleFeed });
  if (selectedTab === 'cultivation') {
    const markup = renderCultivationTab({ state, config });
    onFlowSliderRender('flow-body', 'body');
    onFlowSliderRender('flow-mind', 'mind');
    onFlowSliderRender('flow-spirit', 'spirit');
    return markup;
  }

  if (selectedTab === 'stats') return renderStatsTab({ state });
  return renderCharacterTab({ state, config });
}

function renderCharacterTab({ state, config }) {
  const chainCount = state.enemy ? state.world.pendingEncounters + 1 : 0;
  const activity = state.enemy ? 'In combat' : state.activityMode === 'cultivation' ? 'Cultivating' : 'Exploring';
  const battleStats = getCharacterBattleStats({ state, config });

  return `
    <h3>Character</h3>
    <div class="stat-grid">
      <div><span>Location</span><strong>Hex ${state.battlePositions.playerHex.q}, ${state.battlePositions.playerHex.r}</strong></div>
      <div><span>Activity</span><strong>${activity}</strong></div>
      <div><span>Progress</span><strong>Depth ${state.world.travelDepth} / Best ${state.world.bestDepth}</strong></div>
      <div><span>Chain</span><strong>${chainCount}</strong></div>
      <div><span>Overall Power</span><strong>${computeOverallPower(state).toLocaleString()}</strong></div>
      <div><span>HP Regen</span><strong>${getHpRegenPerSecond(state.run, config).toFixed(2)}/s</strong></div>
      <div><span>Attack Power</span><strong>${battleStats.attackPower}</strong></div>
      <div><span>Attack Speed</span><strong>${battleStats.attacksPerSecond}/s</strong></div>
      <div><span>Max Health</span><strong>${battleStats.maxHealth}</strong></div>
      <div><span>Enemy Power @ Depth</span><strong>${battleStats.enemyAttack} ATK · ${battleStats.enemyHealth} HP</strong></div>
    </div>
  `;
}

function renderBattleTab({ state, battleFeed }) {
  const enemy = state.enemy;
  const enemyLabel = enemy
    ? `${enemy.rarity?.label ?? 'Unknown'} ${enemy.biome?.name ?? 'Unknown'} · HP ${Math.floor(enemy.hp)} / ${Math.floor(enemy.maxHp)} · ATK ${enemy.attack}`
    : 'No enemy';

  const rows = battleFeed.length ? battleFeed.map((line) => `<li>${line}</li>`).join('') : '<li>Awaiting combat events.</li>';

  return `
    <h3>Battle</h3>
    <p class="battle-enemy">${enemyLabel}</p>
    <ul class="battle-log">${rows}</ul>
  `;
}

function renderCultivationTab({ state, config }) {
  return `
    <h3>Cultivation</h3>
    ${renderCultivationStat({
      key: 'strength',
      label: 'Strength',
      level: state.run.strengthLevel,
      prestigeLevel: state.persistent.strengthPrestigeLevel,
      currentExp: state.run.strengthXp,
      currentThreshold: getRunXpThreshold(state.run.strengthLevel, config),
      prestigeExp: state.persistent.strengthPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.persistent.strengthPrestigeLevel, config),
      showSlider: false,
      flowRate: 0
    })}
    ${renderCultivationStat({
      key: 'endurance',
      label: 'Endurance',
      level: state.run.enduranceLevel,
      prestigeLevel: state.persistent.endurancePrestigeLevel,
      currentExp: state.run.enduranceXp,
      currentThreshold: getRunXpThreshold(state.run.enduranceLevel, config),
      prestigeExp: state.persistent.endurancePrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.persistent.endurancePrestigeLevel, config),
      showSlider: false,
      flowRate: 0
    })}
    ${renderCultivationStat({
      key: 'body',
      label: 'Body',
      level: state.run.bodyLevel,
      prestigeLevel: state.run.bodyPrestigeLevel,
      currentExp: state.run.bodyEssence,
      currentThreshold: getBodyEssenceThreshold(state.run.bodyLevel, config),
      prestigeExp: state.run.bodyPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.bodyPrestigeLevel, config),
      flowRate: state.cultivation.flowRates.body
    })}
    ${renderCultivationStat({
      key: 'mind',
      label: 'Mind',
      level: state.run.mindLevel,
      prestigeLevel: state.run.mindPrestigeLevel,
      currentExp: state.run.mindEssence,
      currentThreshold: getMindEssenceThreshold(state.run.mindLevel, config),
      prestigeExp: state.run.mindPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.mindPrestigeLevel, config),
      flowRate: state.cultivation.flowRates.mind
    })}
    ${renderCultivationStat({
      key: 'spirit',
      label: 'Spirit',
      level: state.run.spiritLevel,
      prestigeLevel: state.run.spiritPrestigeLevel,
      currentExp: state.run.spiritEssence,
      currentThreshold: getSpiritEssenceThreshold(state.run.spiritLevel, config),
      prestigeExp: state.run.spiritPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.spiritPrestigeLevel, config),
      flowRate: state.cultivation.flowRates.spirit
    })}
  `;
}

function renderCultivationStat({ key, label, level, prestigeLevel, currentExp, currentThreshold, prestigeExp, prestigeThreshold, flowRate, showSlider = true }) {
  const currentRatio = getProgressRatio(currentExp, currentThreshold);
  const prestigeRatio = getProgressRatio(prestigeExp, prestigeThreshold);

  return `
    <div class="cultivation-card">
      <div class="stat-header">${label} Lv ${level} · P${prestigeLevel}</div>
      <div class="double-progress">
        <span class="base" style="width:${(currentRatio * 100).toFixed(1)}%"></span>
        <span class="overlay" style="width:${(prestigeRatio * 100).toFixed(1)}%"></span>
      </div>
      <div class="progress-meta">${Math.floor(currentExp)} / ${currentThreshold} · Prestige ${Math.floor(prestigeExp)} / ${prestigeThreshold}</div>
      ${showSlider ? `<input id="flow-${key}" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(flowRate * 100)}" />` : '<div class="progress-meta">Leveled through combat only.</div>'}
    </div>
  `;
}

function renderStatsTab({ state }) {
  const stats = state.statistics;

  return `
    <h3>Stats</h3>
    <div class="stats-list">
      <div>Total deaths <strong>${stats.totalDeaths}</strong></div>
      <div>Total enemies defeated <strong>${stats.totalEnemiesDefeated}</strong></div>
      <div>Common / Uncommon / Rare <strong>${stats.enemiesDefeatedByRarity.common} / ${stats.enemiesDefeatedByRarity.uncommon} / ${stats.enemiesDefeatedByRarity.rare}</strong></div>
      <div>Epic / Legendary <strong>${stats.enemiesDefeatedByRarity.epic} / ${stats.enemiesDefeatedByRarity.legendary}</strong></div>
      <div>Levels gained STR/END <strong>${stats.totalLevelsGained.strength} / ${stats.totalLevelsGained.endurance}</strong></div>
      <div>Levels gained Body/Mind/Spirit <strong>${stats.totalLevelsGained.body} / ${stats.totalLevelsGained.mind} / ${stats.totalLevelsGained.spirit}</strong></div>
      <div>Highest STR/END <strong>${stats.highestLevels.strength} / ${stats.highestLevels.endurance}</strong></div>
      <div>Highest Body/Mind/Spirit <strong>${stats.highestLevels.body} / ${stats.highestLevels.mind} / ${stats.highestLevels.spirit}</strong></div>
      <div>Highest Prestige STR/END <strong>${stats.highestLevels.strengthPrestige} / ${stats.highestLevels.endurancePrestige}</strong></div>
      <div>Highest Prestige Body/Mind/Spirit <strong>${stats.highestLevels.bodyPrestige} / ${stats.highestLevels.mindPrestige} / ${stats.highestLevels.spiritPrestige}</strong></div>
    </div>
  `;
}

function getCharacterBattleStats({ state, config }) {
  const mindMultiplier = getMindAttackSpeedMultiplier({ mindLevel: state.run.mindLevel, config });
  const attackIntervalMs = Math.max(config.combat.minAttackIntervalMs, config.combat.playerAttackIntervalMs / mindMultiplier);
  const previewDepth = Math.max(1, state.world.travelDepth);
  const { encounterDistance } = getEncounterDistanceForDepth({
    playerHex: state.battlePositions.playerHex,
    moveDirectionIndex: state.world.moveDirectionIndex,
    config
  });

  const enemyAttack = state.enemy?.attack ?? getEnemyAttack({ distance: encounterDistance, currentDepth: previewDepth, config }, config);
  const enemyHealth = state.enemy?.maxHp ?? getEnemyMaxHp({ distance: encounterDistance, currentDepth: previewDepth, config }, config);

  return {
    attackPower: Math.max(1, Math.floor(config.combat.playerBaseAttack + (state.run.strengthLevel - 1) * config.combat.strengthAttackPerLevel)),
    attacksPerSecond: (1000 / attackIntervalMs).toFixed(2),
    maxHealth: Math.floor(config.combat.playerBaseHp + (state.run.enduranceLevel - 1) * config.combat.enduranceHpPerLevel),
    enemyAttack,
    enemyHealth
  };
}

function computeOverallPower(state) {
  const base =
    state.run.strengthLevel * 1.4 +
    state.run.enduranceLevel * 1.3 +
    state.run.bodyLevel * 1.1 +
    state.run.mindLevel * 1.2 +
    state.run.spiritLevel * 1.2;

  const prestigeTotal =
    state.persistent.strengthPrestigeLevel +
    state.persistent.endurancePrestigeLevel +
    state.run.bodyPrestigeLevel +
    state.run.mindPrestigeLevel +
    state.run.spiritPrestigeLevel;

  const prestigeMultiplier = 1 + prestigeTotal * 0.08;
  const progressMultiplier = 1 + Math.max(0, state.world.bestDepth - 1) * 0.03;

  return Math.floor(base * prestigeMultiplier * progressMultiplier * 100);
}

function getProgressRatio(current, threshold) {
  return Math.max(0, Math.min(1, current / Math.max(1, threshold)));
}

function renderOfflineSummary({ ui, report }) {
  if (!report) {
    ui.offlineSummary.innerHTML = '<span>No offline gains yet.</span>';
    return;
  }

  const minutesAway = Math.floor(report.awaySeconds / 60);
  ui.offlineSummary.innerHTML = `
    <span>Away ${minutesAway}m · +${report.passiveEssenceGain} Essence</span>
    <span>Flowed ${report.flowEssenceSpent} Essence.</span>
  `;
}

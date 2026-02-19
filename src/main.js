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
  getMindEssenceThreshold,
  getPrestigeXpThreshold,
  getRunXpThreshold,
  getSpiritEssenceThreshold,
  simulateTick
} from './simulation.js';
import { createRenderer } from './render.js';
import { loadGame, saveGame } from './persistence.js';

const canvas = document.getElementById('game');
const renderer = createRenderer({ canvas, config: GAME_CONFIG });

const coreStatsEl = document.getElementById('core-stats');
const tabContentEl = document.getElementById('tab-content');
const cultivationTabEl = document.getElementById('cultivation-tab');
const offlineSummaryEl = document.getElementById('offline-summary');
const navButtons = [...document.querySelectorAll('.tab-nav button')];
const modeButtons = [...document.querySelectorAll('#activity-switch button')];
const cultivationModeEl = document.getElementById('cultivation-mode');

let state = createInitialSimulationState(GAME_CONFIG);
const loadedGame = loadGame(GAME_CONFIG);
state = loadedGame.state;
let selectedTab = state.activityMode === 'cultivation' && state.unlocks.cultivation ? 'cultivation' : 'character';
state.activityMode = state.activityMode === 'cultivation' && state.unlocks.cultivation ? 'cultivation' : 'battle';
let lastFrameMs = performance.now();
let accumulator = 0;
let autosaveMs = 0;
const battleFeed = [];

renderOfflineSummary(loadedGame.offlineReport);

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tab;
    if (target === 'cultivation' && !state.unlocks.cultivation) return;

    selectedTab = target;
    syncNavState();
    renderPanel();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.mode;
    if (target === 'cultivation' && !state.unlocks.cultivation) return;

    state.activityMode = target;
    syncNavState();
    renderPanel();
  });
});

syncNavState();
renderPanel();
requestAnimationFrame(frame);
window.addEventListener('beforeunload', () => saveGame(state));

function frame(nowMs) {
  const frameMs = Math.min(100, nowMs - lastFrameMs);
  lastFrameMs = nowMs;
  accumulator += frameMs;

  while (accumulator >= GAME_CONFIG.timing.simulationDtMs) {
    state = simulateTick(state, GAME_CONFIG.timing.simulationDtMs, GAME_CONFIG);
    captureCombatFeed(state.combatLog);
    renderer.ingestEvents(state.combatLog);
    accumulator -= GAME_CONFIG.timing.simulationDtMs;
  }

  autosaveMs += frameMs;
  if (autosaveMs >= GAME_CONFIG.timing.autosaveMs) {
    autosaveMs = 0;
    saveGame(state);
  }

  renderer.render({
    state: {
      ...state,
      playerStats: buildPlayerStats(state.run, state.persistent)
    },
    alpha: frameMs / GAME_CONFIG.timing.simulationDtMs
  });

  syncNavState();
  renderPanel();
  requestAnimationFrame(frame);
}

function syncNavState() {
  cultivationTabEl.disabled = !state.unlocks.cultivation;
  cultivationModeEl.disabled = !state.unlocks.cultivation;

  if (!state.unlocks.cultivation && selectedTab === 'cultivation') {
    selectedTab = 'character';
    state.activityMode = 'battle';
  }

  for (const button of navButtons) {
    button.classList.toggle('active', button.dataset.tab === selectedTab);
  }

  for (const button of modeButtons) {
    button.classList.toggle('active', button.dataset.mode === state.activityMode);
  }
}

function renderPanel() {
  coreStatsEl.innerHTML = renderQuickCoreSummary();

  if (selectedTab === 'battle') {
    tabContentEl.innerHTML = renderBattleTab();
    return;
  }

  if (selectedTab === 'cultivation') {
    tabContentEl.innerHTML = renderCultivationTab();
    bindFlowSlider('flow-body', 'body');
    bindFlowSlider('flow-mind', 'mind');
    bindFlowSlider('flow-spirit', 'spirit');
    return;
  }

  if (selectedTab === 'stats') {
    tabContentEl.innerHTML = renderStatsTab();
    return;
  }

  tabContentEl.innerHTML = renderCharacterTab();
}

function renderQuickCoreSummary() {
  const maxKi = getMaxKi(state.run, GAME_CONFIG);
  const overallPower = computeOverallPower();

  return `
    <div class="stat-line">Depth ${state.world.travelDepth} · Best ${state.world.bestDepth}</div>
    <div class="stat-line">Revealed ${state.world.revealedHexes} hexes</div>
    <div class="stat-line">Essence ${Math.floor(state.resources.essence)} · Ki ${state.run.ki.toFixed(2)} / ${maxKi.toFixed(1)}</div>
    <div class="stat-line">Power ${overallPower.toLocaleString()}</div>
  `;
}

function renderCharacterTab() {
  const chainCount = state.enemy ? state.world.pendingEncounters + 1 : 0;
  const activity = state.enemy ? 'In combat' : state.activityMode === 'cultivation' ? 'Cultivating' : 'Exploring';
  const battleStats = getCharacterBattleStats();

  return `
    <h3>Character</h3>
    <div class="stat-grid">
      <div><span>Location</span><strong>Hex ${state.battlePositions.playerHex.q}, ${state.battlePositions.playerHex.r}</strong></div>
      <div><span>Activity</span><strong>${activity}</strong></div>
      <div><span>Progress</span><strong>Depth ${state.world.travelDepth} / Best ${state.world.bestDepth}</strong></div>
      <div><span>Chain</span><strong>${chainCount}</strong></div>
      <div><span>Overall Power</span><strong>${computeOverallPower().toLocaleString()}</strong></div>
      <div><span>HP Regen</span><strong>${getHpRegenPerSecond(state.run, GAME_CONFIG).toFixed(2)}/s</strong></div>
      <div><span>Attack Power</span><strong>${battleStats.attackPower}</strong></div>
      <div><span>Attack Speed</span><strong>${battleStats.attacksPerSecond}/s</strong></div>
      <div><span>Max Health</span><strong>${battleStats.maxHealth}</strong></div>
      <div><span>Enemy Power @ Depth</span><strong>${battleStats.enemyAttack} ATK · ${battleStats.enemyHealth} HP</strong></div>
    </div>
  `;
}

function renderBattleTab() {
  const enemy = state.enemy;
  const enemyLabel = enemy
    ? `${enemy.rarity?.label ?? 'Unknown'} ${enemy.biome?.name ?? 'Unknown'} · HP ${Math.floor(enemy.hp)} / ${Math.floor(enemy.maxHp)} · ATK ${enemy.attack}`
    : 'No enemy';

  const rows = battleFeed.length
    ? battleFeed.map((line) => `<li>${line}</li>`).join('')
    : '<li>Awaiting combat events.</li>';

  return `
    <h3>Battle</h3>
    <p class="battle-enemy">${enemyLabel}</p>
    <ul class="battle-log">${rows}</ul>
  `;
}

function renderCultivationTab() {
  return `
    <h3>Cultivation</h3>
    ${renderCultivationStat({
      key: 'strength',
      label: 'Strength',
      level: state.run.strengthLevel,
      prestigeLevel: state.persistent.strengthPrestigeLevel,
      currentExp: state.run.strengthXp,
      currentThreshold: getRunXpThreshold(state.run.strengthLevel, GAME_CONFIG),
      prestigeExp: state.persistent.strengthPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.persistent.strengthPrestigeLevel, GAME_CONFIG),
      showSlider: false
    })}
    ${renderCultivationStat({
      key: 'endurance',
      label: 'Endurance',
      level: state.run.enduranceLevel,
      prestigeLevel: state.persistent.endurancePrestigeLevel,
      currentExp: state.run.enduranceXp,
      currentThreshold: getRunXpThreshold(state.run.enduranceLevel, GAME_CONFIG),
      prestigeExp: state.persistent.endurancePrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.persistent.endurancePrestigeLevel, GAME_CONFIG),
      showSlider: false
    })}
    ${renderCultivationStat({
      key: 'body',
      label: 'Body',
      level: state.run.bodyLevel,
      prestigeLevel: state.run.bodyPrestigeLevel,
      currentExp: state.run.bodyEssence,
      currentThreshold: getBodyEssenceThreshold(state.run.bodyLevel, GAME_CONFIG),
      prestigeExp: state.run.bodyPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.bodyPrestigeLevel, GAME_CONFIG)
    })}
    ${renderCultivationStat({
      key: 'mind',
      label: 'Mind',
      level: state.run.mindLevel,
      prestigeLevel: state.run.mindPrestigeLevel,
      currentExp: state.run.mindEssence,
      currentThreshold: getMindEssenceThreshold(state.run.mindLevel, GAME_CONFIG),
      prestigeExp: state.run.mindPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.mindPrestigeLevel, GAME_CONFIG)
    })}
    ${renderCultivationStat({
      key: 'spirit',
      label: 'Spirit',
      level: state.run.spiritLevel,
      prestigeLevel: state.run.spiritPrestigeLevel,
      currentExp: state.run.spiritEssence,
      currentThreshold: getSpiritEssenceThreshold(state.run.spiritLevel, GAME_CONFIG),
      prestigeExp: state.run.spiritPrestigeXp,
      prestigeThreshold: getPrestigeXpThreshold(state.run.spiritPrestigeLevel, GAME_CONFIG)
    })}
  `;
}

function renderCultivationStat({ key, label, level, prestigeLevel, currentExp, currentThreshold, prestigeExp, prestigeThreshold, showSlider = true }) {
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
      ${showSlider ? `<input id="flow-${key}" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(state.cultivation.flowRates[key] * 100)}" />` : '<div class="progress-meta">Leveled through combat only.</div>'}
    </div>
  `;
}

function renderStatsTab() {
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

function getCharacterBattleStats() {
  const mindMultiplier = Math.min(
    GAME_CONFIG.cultivation.maxAttackSpeedMultiplier,
    1 + Math.log1p(Math.max(0, state.run.mindLevel)) * GAME_CONFIG.cultivation.mindSpeedLogFactor
  );
  const attackIntervalMs = Math.max(GAME_CONFIG.combat.minAttackIntervalMs, GAME_CONFIG.combat.playerAttackIntervalMs / mindMultiplier);
  const previewDepth = Math.max(1, state.world.travelDepth);
  const { encounterDistance } = getEncounterDistanceForDepth({
    playerHex: state.battlePositions.playerHex,
    moveDirectionIndex: state.world.moveDirectionIndex,
    config: GAME_CONFIG
  });
  const enemyAttack = state.enemy?.attack ?? getEnemyAttack({ distance: encounterDistance, currentDepth: previewDepth, config: GAME_CONFIG }, GAME_CONFIG);
  const enemyHealth = state.enemy?.maxHp ?? getEnemyMaxHp({ distance: encounterDistance, currentDepth: previewDepth, config: GAME_CONFIG }, GAME_CONFIG);

  return {
    attackPower: Math.max(1, Math.floor(GAME_CONFIG.combat.playerBaseAttack + (state.run.strengthLevel - 1) * GAME_CONFIG.combat.strengthAttackPerLevel)),
    attacksPerSecond: (1000 / attackIntervalMs).toFixed(2),
    maxHealth: Math.floor(GAME_CONFIG.combat.playerBaseHp + (state.run.enduranceLevel - 1) * GAME_CONFIG.combat.enduranceHpPerLevel),
    enemyAttack,
    enemyHealth
  };
}

function computeOverallPower() {
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

function captureCombatFeed(events) {
  for (const event of events) {
    if (event.type === 'playerHit') {
      battleFeed.unshift(`Dealt ${event.amount} · STR XP +${event.strengthXpGain}`);
    }

    if (event.type === 'enemyHit') {
      battleFeed.unshift(`Took ${event.amount} · END XP +${event.enduranceXpGain}`);
    }

    if (event.type === 'victory') {
      battleFeed.unshift(`Victory (${event.rarity}) · Essence +${event.reward}`);
    }
  }

  battleFeed.splice(24);
}

function getProgressRatio(current, threshold) {
  return Math.max(0, Math.min(1, current / Math.max(1, threshold)));
}

function bindFlowSlider(id, key) {
  const slider = document.getElementById(id);
  slider.addEventListener('input', () => {
    state.cultivation.flowRates[key] = Number(slider.value) / 100;
  });
}

function renderOfflineSummary(report) {
  if (!report) {
    offlineSummaryEl.innerHTML = '<span>No offline gains yet.</span>';
    return;
  }

  const minutesAway = Math.floor(report.awaySeconds / 60);
  offlineSummaryEl.innerHTML = `
    <span>Away ${minutesAway}m · +${report.passiveEssenceGain} Essence</span>
    <span>Flowed ${report.flowEssenceSpent} Essence.</span>
  `;
}

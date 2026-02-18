import { GAME_CONFIG } from './config.js';
import {
  buildPlayerStats,
  createInitialSimulationState,
  getBodyEssenceThreshold,
  getHpRegenPerSecond,
  getMaxKi,
  getMindAttackSpeedMultiplier,
  getMindEssenceThreshold,
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

let state = createInitialSimulationState(GAME_CONFIG);
const loadedGame = loadGame(GAME_CONFIG);
state = loadedGame.state;
let selectedTab = 'battle';
let lastFrameMs = performance.now();
let accumulator = 0;
let autosaveMs = 0;

renderOfflineSummary(loadedGame.offlineReport);

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tab;

    if (target === 'cultivation' && !state.unlocks.cultivation) {
      return;
    }

    selectedTab = target;
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

  if (!state.unlocks.cultivation && selectedTab === 'cultivation') {
    selectedTab = 'battle';
  }

  for (const button of navButtons) {
    button.classList.toggle('active', button.dataset.tab === selectedTab);
  }
}

function renderPanel() {
  const mindMultiplier = getMindAttackSpeedMultiplier({
    mindLevel: state.run.mindLevel,
    mindPrestigeLevel: state.run.mindPrestigeLevel,
    config: GAME_CONFIG
  });
  const speedRatio = Math.min(1, (mindMultiplier - 1) / (GAME_CONFIG.cultivation.maxAttackSpeedMultiplier - 1 || 1));

  const chainCount = state.enemy ? state.world.pendingEncounters + 1 : 0;

  coreStatsEl.innerHTML = `
    <div class="stat-line">Floor ${state.floor} · Best ${state.bestFloor}</div>
    <div class="stat-line">Depth ${state.world.travelDepth} · Chain ${chainCount}</div>
    <div class="stat-line">Essence ${Math.floor(state.resources.essence)}</div>
    <div class="stat-line">HP ${Math.floor(state.run.hp)} · Regen ${getHpRegenPerSecond(state.run, GAME_CONFIG).toFixed(2)}/s</div>
    <div class="stat-line">Ki ${state.run.ki.toFixed(2)} / ${getMaxKi(state.run, GAME_CONFIG).toFixed(1)}</div>
    <div class="stat-line">STR ${state.run.strengthLevel} (${state.persistent.strengthPrestigeLevel})</div>
    <div class="stat-line">END ${state.run.enduranceLevel} (${state.persistent.endurancePrestigeLevel})</div>
    <div class="stat-line">Mind ${state.run.mindLevel} (${state.run.mindPrestigeLevel}) · Speed x${mindMultiplier.toFixed(2)}</div>
  `;

  document.getElementById('mind-speed-fill').style.width = `${speedRatio * 100}%`;

  if (selectedTab === 'battle') {
    tabContentEl.innerHTML = `
      <h3>⚔️ Battle</h3>
      <p>You travel through hex biomes; revealed hexes can spawn enemy chains with rarity tiers.</p>
      <p>Enemy color matches biome, while rarity (common → legendary) boosts stats.</p>
    `;
    return;
  }

  if (selectedTab === 'growth') {
    tabContentEl.innerHTML = `
      <h3>📊 Growth</h3>
      <p>Strength increases outgoing damage and Endurance increases max HP.</p>
      <p>Prestige levels persist through defeats and boost XP gain in future runs.</p>
    `;
    return;
  }

  renderCultivationTab();
}

function renderCultivationTab() {
  const bodyThreshold = getBodyEssenceThreshold(state.run.bodyLevel, GAME_CONFIG);
  const mindThreshold = getMindEssenceThreshold(state.run.mindLevel, GAME_CONFIG);
  const spiritThreshold = getSpiritEssenceThreshold(state.run.spiritLevel, GAME_CONFIG);
  const bodyRatio = Math.max(0, Math.min(1, state.run.bodyEssence / Math.max(1, bodyThreshold)));
  const mindRatio = Math.max(0, Math.min(1, state.run.mindEssence / Math.max(1, mindThreshold)));
  const spiritRatio = Math.max(0, Math.min(1, state.run.spiritEssence / Math.max(1, spiritThreshold)));

  tabContentEl.innerHTML = `
    <h3>🧘 Cultivation</h3>
    <p>Split Essence flow between Body (regen), Mind (attack speed), and Spirit (Ki capacity).</p>

    <p>Body Lv ${state.run.bodyLevel} (P${state.run.bodyPrestigeLevel}) · Essence ${Math.floor(state.run.bodyEssence)} / ${bodyThreshold}</p>
    <input id="flow-body" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(state.cultivation.flowRates.body * 100)}" />
    <div class="mini-bar"><span style="width:${bodyRatio * 100}%"></span></div>

    <p>Mind Lv ${state.run.mindLevel} (P${state.run.mindPrestigeLevel}) · Essence ${Math.floor(state.run.mindEssence)} / ${mindThreshold}</p>
    <input id="flow-mind" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(state.cultivation.flowRates.mind * 100)}" />
    <div class="mini-bar"><span style="width:${mindRatio * 100}%"></span></div>

    <p>Spirit Lv ${state.run.spiritLevel} (P${state.run.spiritPrestigeLevel}) · Essence ${Math.floor(state.run.spiritEssence)} / ${spiritThreshold}</p>
    <input id="flow-spirit" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(state.cultivation.flowRates.spirit * 100)}" />
    <div class="mini-bar"><span style="width:${spiritRatio * 100}%"></span></div>
    <p>Ki regeneration starts at ${GAME_CONFIG.cultivation.kiBaseRegenPerSecond}/s and rises with Spirit.</p>
    <p>Cultivation levels + prestige reset on defeat as requested.</p>
  `;

  bindFlowSlider('flow-body', 'body');
  bindFlowSlider('flow-mind', 'mind');
  bindFlowSlider('flow-spirit', 'spirit');
}

function bindFlowSlider(id, key) {
  const slider = document.getElementById(id);
  slider.addEventListener('input', () => {
    const nextFlow = Number(slider.value) / 100;
    state.cultivation.flowRates[key] = nextFlow;
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
    <span>Flowed ${report.flowEssenceSpent} Essence into cultivation.</span>
  `;
}

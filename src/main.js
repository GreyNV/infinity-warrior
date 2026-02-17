import { GAME_CONFIG } from './config.js';
import {
  buildPlayerStats,
  createInitialSimulationState,
  getAgilityAttackSpeedMultiplier,
  getAgilityEssenceThreshold,
  simulateTick
} from './simulation.js';
import { createRenderer } from './render.js';

const canvas = document.getElementById('game');
const renderer = createRenderer({ canvas, config: GAME_CONFIG });

const coreStatsEl = document.getElementById('core-stats');
const tabContentEl = document.getElementById('tab-content');
const cultivationTabEl = document.getElementById('cultivation-tab');
const navButtons = [...document.querySelectorAll('.tab-nav button')];

let state = createInitialSimulationState(GAME_CONFIG);
let selectedTab = 'battle';
let lastFrameMs = performance.now();
let accumulator = 0;

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

function frame(nowMs) {
  const frameMs = Math.min(100, nowMs - lastFrameMs);
  lastFrameMs = nowMs;
  accumulator += frameMs;

  while (accumulator >= GAME_CONFIG.timing.simulationDtMs) {
    state = simulateTick(state, GAME_CONFIG.timing.simulationDtMs, GAME_CONFIG);
    renderer.ingestEvents(state.combatLog);
    accumulator -= GAME_CONFIG.timing.simulationDtMs;
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
  const agilityMultiplier = getAgilityAttackSpeedMultiplier({ agilityLevel: state.persistent.agilityLevel, config: GAME_CONFIG });
  const speedRatio = Math.min(1, (agilityMultiplier - 1) / (GAME_CONFIG.cultivation.maxAttackSpeedMultiplier - 1 || 1));

  coreStatsEl.innerHTML = `
    <div class="stat-line">Floor ${state.floor} · Best ${state.bestFloor}</div>
    <div class="stat-line">Essence ${state.resources.essence}</div>
    <div class="stat-line">STR ${state.run.strengthLevel} (${state.persistent.strengthPrestigeLevel})</div>
    <div class="stat-line">END ${state.run.enduranceLevel} (${state.persistent.endurancePrestigeLevel})</div>
    <div class="stat-line">AGI ${state.persistent.agilityLevel} · Speed x${agilityMultiplier.toFixed(2)}</div>
  `;

  document.getElementById('agility-speed-fill').style.width = `${speedRatio * 100}%`;

  if (selectedTab === 'battle') {
    tabContentEl.innerHTML = `
      <h3>⚔️ Battle</h3>
      <p>Auto-fight advances floors and earns Essence after each victory.</p>
      <p>Cultivation unlocks after your first defeat, then Essence can be channeled into Agility.</p>
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
  const threshold = getAgilityEssenceThreshold(state.persistent.agilityLevel, GAME_CONFIG);
  const ratio = Math.max(0, Math.min(1, state.persistent.agilityEssence / Math.max(1, threshold)));

  tabContentEl.innerHTML = `
    <h3>🌿 Cultivation</h3>
    <p>Move the flow slider to continuously channel Essence into Agility (no tap-spam).</p>
    <p>Flow: <strong id="flow-value">${Math.round(state.cultivation.flowRate * 100)}%</strong></p>
    <input id="flow-slider" class="cultivate-slider" type="range" min="0" max="100" value="${Math.round(state.cultivation.flowRate * 100)}" />
    <p>Agility Essence: ${Math.floor(state.persistent.agilityEssence)} / ${threshold}</p>
    <div class="mini-bar"><span style="width:${ratio * 100}%"></span></div>
    <p>Each Agility level increases attack speed with a logarithmic bonus.</p>
  `;

  const slider = document.getElementById('flow-slider');
  const flowValue = document.getElementById('flow-value');

  slider.addEventListener('input', () => {
    const nextFlow = Number(slider.value) / 100;
    state.cultivation.flowRate = nextFlow;
    flowValue.textContent = `${Math.round(nextFlow * 100)}%`;
  });
}

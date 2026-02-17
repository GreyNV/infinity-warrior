import { GAME_CONFIG } from './config.js';
import { buildPlayerStats, createInitialSimulationState, simulateTick } from './simulation.js';
import { createRenderer } from './render.js';

const canvas = document.getElementById('game');
const renderer = createRenderer({ canvas, config: GAME_CONFIG });

let state = createInitialSimulationState(GAME_CONFIG);
let lastFrameMs = performance.now();
let accumulator = 0;

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

  requestAnimationFrame(frame);
}

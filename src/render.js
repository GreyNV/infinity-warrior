import { getEnemyMaxHp, getMaxHp } from './simulation.js';

const COLORS = {
  bg: '#111827',
  panel: '#1f2937',
  text: '#e5e7eb',
  muted: '#93a3b8',
  hp: '#22c55e',
  hpBack: '#374151',
  xp: '#60a5fa',
  xpBack: '#1e3a5f',
  prestige: '#f59e0b',
  player: '#60a5fa',
  enemy: '#f97316',
  damage: '#fca5a5',
  gain: '#86efac'
};

export function createRenderer({ canvas, config }) {
  const ctx = canvas.getContext('2d');
  const hitFlash = { player: 0, enemy: 0 };
  const popups = [];

  return {
    render({ state, alpha = 1 }) {
      tickEffects({ hitFlash, popups, alpha });
      drawScene({ ctx, canvas, state, config, hitFlash, popups });
    },
    ingestEvents(events) {
      for (const event of events) {
        if (event.type === 'playerHit') {
          hitFlash.enemy = 1;
          popups.push(createPopup({ text: `-${event.amount}`, x: 650, y: 250, color: COLORS.damage }));
          popups.push(createPopup({ text: `+${event.strengthXpGain} STR XP`, x: 340, y: 145, color: COLORS.gain, life: 54 }));
        }

        if (event.type === 'enemyHit') {
          hitFlash.player = 1;
          popups.push(createPopup({ text: `-${event.amount}`, x: 270, y: 250, color: COLORS.damage }));
          popups.push(createPopup({ text: `+${event.enduranceXpGain} END XP`, x: 340, y: 175, color: COLORS.gain, life: 54 }));
        }
      }
    }
  };
}

function tickEffects({ hitFlash, popups, alpha }) {
  hitFlash.player = Math.max(0, hitFlash.player - 0.08 * alpha);
  hitFlash.enemy = Math.max(0, hitFlash.enemy - 0.08 * alpha);

  for (let i = popups.length - 1; i >= 0; i -= 1) {
    popups[i].life -= alpha;
    popups[i].y -= 0.35 * alpha;

    if (popups[i].life <= 0) {
      popups.splice(i, 1);
    }
  }
}

function drawScene({ ctx, canvas, state, config, hitFlash, popups }) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTopPanel({ ctx, state, config });
  drawEntities({ ctx, state, hitFlash });
  drawCombatHpBars({ ctx, state, config });
  drawBars({ ctx, state, config });
  drawPopups({ ctx, popups });
}

function drawTopPanel({ ctx, state, config }) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(20, 20, 880, 120);

  const maxHp = getMaxHp(state.playerStats, config);
  const enemyMaxHp = getEnemyMaxHp(state.floor, config);

  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText(`Floor ${state.floor}`, 40, 52);
  ctx.fillText(`Essence ${state.resources.essence}`, 40, 82);
  ctx.fillText(`Best ${state.bestFloor}`, 40, 112);

  ctx.font = '16px Inter, sans-serif';
  ctx.fillText(`STR Lv ${state.run.strengthLevel} (P${state.persistent.strengthPrestigeLevel})`, 280, 52);
  ctx.fillText(`END Lv ${state.run.enduranceLevel} (P${state.persistent.endurancePrestigeLevel})`, 280, 82);

  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`HP ${state.run.hp} / ${maxHp}`, 610, 52);
  ctx.fillText(`Enemy HP ${state.enemy.hp} / ${enemyMaxHp}`, 610, 82);
}

function drawEntities({ ctx, state, hitFlash }) {
  const pulse = 1 + Math.sin(state.elapsedMs / 200) * 0.03;

  ctx.save();
  ctx.translate(270, 290);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, 55, 0, Math.PI * 2);
  ctx.fillStyle = blendFlash(COLORS.player, '#ffffff', hitFlash.player);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(650, 290);
  ctx.rotate(Math.sin(state.elapsedMs / 350) * 0.04);
  ctx.fillStyle = blendFlash(COLORS.enemy, '#ffffff', hitFlash.enemy);
  ctx.fillRect(-55, -55, 110, 110);
  ctx.restore();
}


function drawCombatHpBars({ ctx, state, config }) {
  const playerMaxHp = Math.max(1, getMaxHp(state.playerStats, config));
  const enemyMaxHp = Math.max(1, getEnemyMaxHp(state.floor, config));

  drawProgressBar({
    ctx,
    label: 'Player HP',
    value: state.run.hp,
    max: playerMaxHp,
    y: 365,
    color: COLORS.hp,
    back: COLORS.hpBack
  });

  drawProgressBar({
    ctx,
    label: 'Enemy HP',
    value: state.enemy.hp,
    max: enemyMaxHp,
    y: 395,
    color: COLORS.hp,
    back: COLORS.hpBack
  });
}

function drawBars({ ctx, state, config }) {
  const bars = [
    {
      label: 'Strength XP',
      value: state.run.strengthXp,
      max: Math.max(1, Math.floor(config.progression.runXpBase * Math.pow(state.run.strengthLevel, config.progression.runXpExp))),
      y: 430,
      color: COLORS.xp,
      back: COLORS.xpBack
    },
    {
      label: 'Endurance XP',
      value: state.run.enduranceXp,
      max: Math.max(1, Math.floor(config.progression.runXpBase * Math.pow(state.run.enduranceLevel, config.progression.runXpExp))),
      y: 470,
      color: COLORS.xp,
      back: COLORS.xpBack
    },
    {
      label: 'STR Prestige XP',
      value: state.persistent.strengthPrestigeXp,
      max: Math.max(1, Math.floor(config.progression.prestigeXpBase * Math.pow(state.persistent.strengthPrestigeLevel + 1, config.progression.prestigeXpExp))),
      y: 510,
      color: COLORS.prestige,
      back: '#4b3606'
    },
    {
      label: 'END Prestige XP',
      value: state.persistent.endurancePrestigeXp,
      max: Math.max(1, Math.floor(config.progression.prestigeXpBase * Math.pow(state.persistent.endurancePrestigeLevel + 1, config.progression.prestigeXpExp))),
      y: 535,
      color: COLORS.prestige,
      back: '#4b3606'
    }
  ];

  for (const bar of bars) {
    drawProgressBar({ ctx, ...bar });
  }
}

function drawProgressBar({ ctx, label, value, max, y, color, back }) {
  const x = 40;
  const width = 840;
  const height = 22;
  const ratio = Math.max(0, Math.min(1, value / max));

  ctx.fillStyle = back;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * ratio, height);

  ctx.fillStyle = COLORS.text;
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText(`${label}: ${value} / ${max}`, x + 10, y + 15);
}

function drawPopups({ ctx, popups }) {
  ctx.font = 'bold 15px Inter, sans-serif';

  for (const popup of popups) {
    ctx.globalAlpha = popup.life / popup.maxLife;
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y);
  }

  ctx.globalAlpha = 1;
}

function createPopup({ text, x, y, color, life = 40 }) {
  return { text, x, y, color, life, maxLife: life };
}

function blendFlash(base, flash, strength) {
  if (strength <= 0.01) {
    return base;
  }

  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(flash);
  const t = Math.min(1, strength);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

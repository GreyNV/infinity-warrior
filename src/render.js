import { getEnemyMaxHp, getMaxHp } from './simulation.js';

const COLORS = {
  bg: '#111827',
  text: '#e5e7eb',
  muted: '#93a3b8',
  hp: '#22c55e',
  hpBack: '#374151',
  xp: '#60a5fa',
  player: '#60a5fa',
  enemy: '#f97316',
  damage: '#fca5a5',
  gain: '#86efac',
  grid: '#334155',
  gridHighlight: '#475569'
};

const PLAYER_SCREEN_ANCHOR = { x: 460, y: 270 };
const HEX_SIZE = 34;
const GRID_RADIUS = 5;

export function createRenderer({ canvas, config }) {
  const ctx = canvas.getContext('2d');
  const hitFlash = { player: 0, enemy: 0 };
  const popups = [];
  const particles = [];
  const attackAnim = { player: 0, enemy: 0 };
  let latestUnits = {
    player: { ...PLAYER_SCREEN_ANCHOR },
    enemy: hexToPixelWithCamera({ hex: { q: 1, r: 0 }, camera: createCamera({ q: -1, r: 0 }) })
  };

  return {
    render({ state, alpha = 1 }) {
      tickEffects({ hitFlash, popups, particles, attackAnim, alpha });
      latestUnits = getUnitPixels(state);
      drawScene({ ctx, canvas, state, config, hitFlash, popups, particles, attackAnim, units: latestUnits });
    },
    ingestEvents(events) {
      for (const event of events) {
        if (event.type === 'playerHit') {
          hitFlash.enemy = 1;
          attackAnim.player = 1;
          popups.push(createPopup({ text: `-${event.amount}`, x: latestUnits.enemy.x - 6, y: latestUnits.enemy.y - 44, color: COLORS.damage }));
        }

        if (event.type === 'enemyHit') {
          hitFlash.player = 1;
          attackAnim.enemy = 1;
          popups.push(createPopup({ text: `-${event.amount}`, x: latestUnits.player.x - 6, y: latestUnits.player.y - 44, color: COLORS.damage }));
        }

        if (event.type === 'victory') {
          particles.push(...createBurstParticles({ x: latestUnits.enemy.x, y: latestUnits.enemy.y, color: COLORS.enemy }));
          popups.push(createPopup({ text: `+${event.reward} Essence`, x: 24, y: 100, color: COLORS.gain, life: 50 }));
        }

        if (event.type === 'defeat') {
          particles.push(...createBurstParticles({ x: latestUnits.player.x, y: latestUnits.player.y, color: COLORS.player }));
          popups.push(createPopup({ text: 'Defeat: cultivation unlocked', x: 24, y: 130, color: COLORS.gain, life: 72 }));
        }
      }
    }
  };
}

function drawScene({ ctx, canvas, state, config, hitFlash, popups, particles, attackAnim, units }) {
  const worldRegion = getWorldRegion({ hex: state.battlePositions.playerHex, config });

  ctx.fillStyle = worldRegion.fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camera = createCamera(state.battlePositions.playerHex);
  drawHexGrid({ ctx, camera, centerHex: state.battlePositions.playerHex, config });
  drawEntities({ ctx, state, hitFlash, attackAnim, units });
  drawParticles({ ctx, particles });
  drawCombatHpBars({ ctx, state, config });
  drawAttackTimers({ ctx, state, config });
  drawWorldHint({ ctx, worldRegion, state });
  drawPopups({ ctx, popups });
}

function drawWorldHint({ ctx, worldRegion, state }) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(16, 14, 280, 56);
  ctx.fillStyle = COLORS.text;
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText(`Region: ${worldRegion.name}`, 28, 36);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Floor ${state.floor} · Essence ${state.resources.essence}`, 28, 56);
}

function tickEffects({ hitFlash, popups, particles, attackAnim, alpha }) {
  hitFlash.player = Math.max(0, hitFlash.player - 0.08 * alpha);
  hitFlash.enemy = Math.max(0, hitFlash.enemy - 0.08 * alpha);
  attackAnim.player = Math.max(0, attackAnim.player - 0.11 * alpha);
  attackAnim.enemy = Math.max(0, attackAnim.enemy - 0.11 * alpha);

  for (let i = popups.length - 1; i >= 0; i -= 1) {
    popups[i].life -= alpha;
    popups[i].y -= 0.35 * alpha;
    if (popups[i].life <= 0) popups.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    particles[i].life -= alpha;
    particles[i].x += particles[i].vx * alpha;
    particles[i].y += particles[i].vy * alpha;
    particles[i].vy += 0.06 * alpha;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function drawHexGrid({ ctx, camera, centerHex, config }) {
  for (let qOffset = -GRID_RADIUS; qOffset <= GRID_RADIUS; qOffset += 1) {
    for (let rOffset = -GRID_RADIUS; rOffset <= GRID_RADIUS; rOffset += 1) {
      const q = centerHex.q + qOffset;
      const r = centerHex.r + rOffset;
      const sOffset = -qOffset - rOffset;
      if (Math.max(Math.abs(qOffset), Math.abs(rOffset), Math.abs(sOffset)) > GRID_RADIUS) continue;

      const hex = { q, r };
      const center = hexToPixelWithCamera({ hex, camera });
      const worldRegion = getWorldRegion({ hex, config });
      const highlight = getHexDistance(hex, centerHex) <= 1;

      drawHexOutline({
        ctx,
        center,
        strokeColor: highlight ? COLORS.gridHighlight : worldRegion.stroke,
        fillColor: highlight ? worldRegion.accent : worldRegion.fill
      });
    }
  }
}

function drawEntities({ ctx, state, hitFlash, attackAnim, units }) {
  const pulse = 1 + Math.sin(state.elapsedMs / 200) * 0.03;
  const playerLunge = attackAnim.player > 0 ? 8 * Math.sin(attackAnim.player * Math.PI) : 0;
  const enemyLunge = attackAnim.enemy > 0 ? -8 * Math.sin(attackAnim.enemy * Math.PI) : 0;

  ctx.save();
  ctx.translate(units.player.x + playerLunge, units.player.y);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fillStyle = blendFlash(COLORS.player, '#ffffff', hitFlash.player);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(units.enemy.x + enemyLunge, units.enemy.y);
  ctx.rotate(Math.sin(state.elapsedMs / 350) * 0.04);
  ctx.fillStyle = blendFlash(COLORS.enemy, '#ffffff', hitFlash.enemy);
  ctx.fillRect(-22, -22, 44, 44);
  ctx.restore();
}

function drawCombatHpBars({ ctx, state, config }) {
  const playerMaxHp = Math.max(1, getMaxHp(state.playerStats, config));
  const enemyMaxHp = Math.max(1, getEnemyMaxHp(state.floor, config));

  drawProgressBar({ ctx, label: 'Player HP', value: state.run.hp, max: playerMaxHp, y: 468, color: COLORS.hp, back: COLORS.hpBack });
  drawProgressBar({ ctx, label: 'Enemy HP', value: state.enemy.hp, max: enemyMaxHp, y: 500, color: COLORS.hp, back: COLORS.hpBack });
}

function drawAttackTimers({ ctx, state, config }) {
  const playerRatio = Math.max(0, Math.min(1, state.combatTimers.playerMs / config.combat.playerAttackIntervalMs));
  const enemyRatio = Math.max(0, Math.min(1, state.combatTimers.enemyMs / config.combat.enemyAttackIntervalMs));

  drawMiniTimer({ ctx, x: 140, y: 436, ratio: playerRatio, label: 'Player Swing' });
  drawMiniTimer({ ctx, x: 560, y: 436, ratio: enemyRatio, label: 'Enemy Swing' });
}

function drawMiniTimer({ ctx, x, y, ratio, label }) {
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, 220, 10);
  ctx.fillStyle = COLORS.xp;
  ctx.fillRect(x, y, 220 * ratio, 10);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText(label, x, y - 4);
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
  ctx.fillText(`${label}: ${Math.floor(value)} / ${max}`, x + 10, y + 15);
}

function drawHexOutline({ ctx, center, strokeColor, fillColor }) {
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let side = 0; side < 6; side += 1) {
    const angle = ((60 * side - 30) * Math.PI) / 180;
    const x = center.x + HEX_SIZE * Math.cos(angle);
    const y = center.y + HEX_SIZE * Math.sin(angle);
    if (side === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function getUnitPixels(state) {
  const camera = createCamera(state.battlePositions.playerHex);
  return {
    player: hexToPixelWithCamera({ hex: state.battlePositions.playerHex, camera }),
    enemy: hexToPixelWithCamera({ hex: state.battlePositions.enemyHex, camera })
  };
}

function createCamera(playerHex) {
  const playerOffset = hexToAxialOffset(playerHex);
  return { x: PLAYER_SCREEN_ANCHOR.x - playerOffset.x, y: PLAYER_SCREEN_ANCHOR.y - playerOffset.y };
}

function hexToPixelWithCamera({ hex, camera }) {
  const offset = hexToAxialOffset(hex);
  return { x: camera.x + offset.x, y: camera.y + offset.y };
}

function hexToAxialOffset(hex) {
  return { x: HEX_SIZE * Math.sqrt(3) * (hex.q + hex.r / 2), y: HEX_SIZE * 1.5 * hex.r };
}

function getWorldRegion({ hex, config }) {
  const biomes = config.world?.biomes ?? [];
  if (!biomes.length) return { name: 'Unknown', fill: COLORS.bg, accent: COLORS.grid, stroke: COLORS.gridHighlight };

  const bandSize = Math.max(1, config.world?.biomeBandSize ?? 8);
  const distance = getHexDistance(hex, { q: 0, r: 0 });
  const directionalShift = Math.floor((hex.q * 2 + hex.r) / bandSize);
  const bandIndex = Math.floor(distance / bandSize) + directionalShift;
  const normalizedIndex = ((bandIndex % biomes.length) + biomes.length) % biomes.length;

  return biomes[normalizedIndex];
}

function getHexDistance(from, to) {
  return (Math.abs(from.q - to.q) + Math.abs(from.r - to.r) + Math.abs((from.q + from.r) - (to.q + to.r))) / 2;
}

function drawParticles({ ctx, particles }) {
  for (const particle of particles) {
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
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

function createBurstParticles({ x, y, color }) {
  const particles = [];
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const speed = 1 + Math.random() * 2.2;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 0.9, life: 34, maxLife: 34, color, size: 4 });
  }
  return particles;
}

function blendFlash(base, flash, strength) {
  if (strength <= 0.01) return base;
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
  return [Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16), Number.parseInt(full.slice(4, 6), 16)];
}

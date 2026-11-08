import { BOOST_PADS } from './constants.js';

/**
 * Dimensiones estándar de estadio de Rocket League en Unreal Units:
 * X: [-4096, 4096] (ancho = 8192)
 * Y: [-5120, 5120] (largo = 10240, más fondo de porterías hasta +-6000)
 *
 * Dibujaremos el campo en formato horizontal (Landscape) para que encaje de lujo en pantallas anchas:
 * - Izquierda (X_canvas bajo) = Campo Azul (Y = -5120)
 * - Derecha (X_canvas alto)   = Campo Naranja (Y = +5120)
 * - Arriba (Y_canvas bajo)    = Banda Izquierda de Azul (X = -4096)
 * - Abajo (Y_canvas alto)     = Banda Derecha de Azul (X = +4096)
 */
const FIELD_Y_MAX = 5120; // Largo desde el centro a cada línea de gol
const FIELD_X_MAX = 4096; // Ancho desde el centro a cada pared lateral
const GOAL_DEPTH = 880;
const GOAL_HALF_WIDTH = 893;

const PAD_LEFT = 76;
const PAD_RIGHT = 76;
const PAD_TOP = 54;
const PAD_BOTTOM = 54;

/**
 * Convierte coordenadas de Rocket League (rlX, rlY) a coordenadas del Canvas (cx, cy)
 */
export function rlToCanvas(rlX, rlY, width, height) {
  const fieldW = width - PAD_LEFT - PAD_RIGHT;
  const fieldH = height - PAD_TOP - PAD_BOTTOM;

  // rlY en [-5120, +5120] -> eje horizontal del canvas (Izquierda = Azul -5120, Derecha = Naranja +5120)
  const normHoriz = (rlY + FIELD_Y_MAX) / (FIELD_Y_MAX * 2);
  // rlX en [-4096, +4096] -> eje vertical del canvas
  const normVert = (rlX + FIELD_X_MAX) / (FIELD_X_MAX * 2);

  return {
    cx: PAD_LEFT + normHoriz * fieldW,
    cy: PAD_TOP + normVert * fieldH,
  };
}

/**
 * Dibuja las líneas del estadio de Rocket League (paredes achaflanadas, áreas, círculo central, porterías)
 */
export function drawRocketLeaguePitch(ctx, width, height) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Fondo exterior suave
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, width, height);

  const p = (x, y) => rlToCanvas(x, y, width, height);

  // Esquinas achaflanadas del estadio (chaflán de 1152 uu en cada esquina)
  const CHAMFER = 1152;
  const corners = [
    p(-FIELD_X_MAX + CHAMFER, -FIELD_Y_MAX),
    p(FIELD_X_MAX - CHAMFER, -FIELD_Y_MAX),
    p(FIELD_X_MAX, -FIELD_Y_MAX + CHAMFER),
    p(FIELD_X_MAX, FIELD_Y_MAX - CHAMFER),
    p(FIELD_X_MAX - CHAMFER, FIELD_Y_MAX),
    p(-FIELD_X_MAX + CHAMFER, FIELD_Y_MAX),
    p(-FIELD_X_MAX, FIELD_Y_MAX - CHAMFER),
    p(-FIELD_X_MAX, -FIELD_Y_MAX + CHAMFER),
  ];

  // Suelo del estadio con gradiente sutil Azul -> Neutro -> Naranja
  const grad = ctx.createLinearGradient(PAD_LEFT, 0, width - PAD_RIGHT, 0);
  grad.addColorStop(0, 'rgba(14, 116, 144, 0.16)');
  grad.addColorStop(0.45, 'rgba(30, 41, 59, 0.45)');
  grad.addColorStop(0.55, 'rgba(30, 41, 59, 0.45)');
  grad.addColorStop(1, 'rgba(194, 65, 12, 0.16)');

  ctx.beginPath();
  ctx.moveTo(corners[0].cx, corners[0].cy);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].cx, corners[i].cy);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Patrón de franjas de césped sutiles
  const stripes = 10;
  const fieldW = width - PAD_LEFT - PAD_RIGHT;
  const fieldH = height - PAD_TOP - PAD_BOTTOM;
  ctx.save();
  ctx.clip();
  for (let s = 0; s < stripes; s++) {
    if (s % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.fillRect(PAD_LEFT + (s * fieldW) / stripes, PAD_TOP, fieldW / stripes, fieldH);
    }
  }
  ctx.restore();

  // Portería Azul (Izquierda: Y = -5120 a -6000)
  const bg1 = p(-GOAL_HALF_WIDTH, -FIELD_Y_MAX);
  const bg2 = p(GOAL_HALF_WIDTH, -FIELD_Y_MAX - GOAL_DEPTH);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 2;
  ctx.fillRect(bg2.cx, bg1.cy, bg1.cx - bg2.cx, bg2.cy - bg1.cy);
  ctx.strokeRect(bg2.cx, bg1.cy, bg1.cx - bg2.cx, bg2.cy - bg1.cy);

  // Portería Naranja (Derecha: Y = +5120 a +6000)
  const og1 = p(-GOAL_HALF_WIDTH, FIELD_Y_MAX);
  const og2 = p(GOAL_HALF_WIDTH, FIELD_Y_MAX + GOAL_DEPTH);
  ctx.fillStyle = 'rgba(251, 146, 60, 0.14)';
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
  ctx.fillRect(og1.cx, og1.cy, og2.cx - og1.cx, og2.cy - og1.cy);
  ctx.strokeRect(og1.cx, og1.cy, og2.cx - og1.cx, og2.cy - og1.cy);

  // Líneas interiores del campo
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1.5;

  // Línea de medio campo (Y = 0)
  const midTop = p(-FIELD_X_MAX, 0);
  const midBot = p(FIELD_X_MAX, 0);
  ctx.beginPath();
  ctx.moveTo(midTop.cx, midTop.cy);
  ctx.lineTo(midBot.cx, midBot.cy);
  ctx.stroke();

  // Líneas de tercios del campo (Y = -2300 y Y = +2300) punteadas
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  for (const ty of [-2300, 2300]) {
    const t1 = p(-FIELD_X_MAX, ty);
    const t2 = p(FIELD_X_MAX, ty);
    ctx.beginPath();
    ctx.moveTo(t1.cx, t1.cy);
    ctx.lineTo(t2.cx, t2.cy);
    ctx.stroke();
  }
  ctx.restore();

  // Círculo central
  const center = p(0, 0);
  const radPoint = p(0, 1150);
  const radius = Math.abs(radPoint.cx - center.cx);
  ctx.beginPath();
  ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Punto central
  ctx.beginPath();
  ctx.arc(center.cx, center.cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.fill();

  // Áreas de penalti (Azul y Naranja)
  const boxBlue1 = p(-2000, -FIELD_Y_MAX);
  const boxBlue2 = p(2000, -FIELD_Y_MAX + 1500);
  ctx.strokeRect(boxBlue1.cx, boxBlue1.cy, boxBlue2.cx - boxBlue1.cx, boxBlue2.cy - boxBlue1.cy);

  const boxOrange1 = p(-2000, FIELD_Y_MAX - 1500);
  const boxOrange2 = p(2000, FIELD_Y_MAX);
  ctx.strokeRect(boxOrange1.cx, boxOrange1.cy, boxOrange2.cx - boxOrange1.cx, boxOrange2.cy - boxOrange1.cy);

  // Contorno principal del estadio
  ctx.beginPath();
  ctx.moveTo(corners[0].cx, corners[0].cy);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].cx, corners[i].cy);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Etiquetas de Lado Azul y Lado Naranja
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'left';
  ctx.fillText('◀ CAMPO AZUL (PORTERÍA PROPIA EQUIPO 0)', PAD_LEFT + 6, PAD_TOP - 14);

  ctx.fillStyle = '#fb923c';
  ctx.textAlign = 'right';
  ctx.fillText('CAMPO NARANJA (PORTERÍA PROPIA EQUIPO 1) ▶', width - PAD_RIGHT - 6, PAD_TOP - 14);

  ctx.restore();
}

/**
 * Renderiza el Mapa de Calor (Heatmap) de posicionamiento del jugador seleccionado.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} positions - Array de { x, y, z, speedKmh, boostPct, ballY }
 * @param {string} filterMode - 'all' | 'attack' | 'defense' | 'supersonic'
 * @param {number} playerTeam - 0 (Blue) o 1 (Orange)
 */
export function renderPositionHeatmap(canvas, positions, filterMode = 'all', playerTeam = 0) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  drawRocketLeaguePitch(ctx, width, height);

  if (!positions || positions.length === 0) return;

  // Filtrar muestras según el filtro elegido
  const filtered = positions.filter(pt => {
    if (filterMode === 'attack') {
      return playerTeam === 0 ? pt.ballY > 0 : pt.ballY < 0;
    }
    if (filterMode === 'defense') {
      return playerTeam === 0 ? pt.ballY <= 0 : pt.ballY >= 0;
    }
    if (filterMode === 'supersonic') {
      return pt.speedKmh >= 75;
    }
    return true;
  });

  // Crear rejilla de densidad suave (Grid KDE)
  const gridCols = 52;
  const gridRows = 40;
  const grid = new Float32Array(gridCols * gridRows);

  const fieldW = width - PAD_LEFT - PAD_RIGHT;
  const fieldH = height - PAD_TOP - PAD_BOTTOM;

  for (const pt of filtered) {
    const { cx, cy } = rlToCanvas(pt.x, pt.y, width, height);
    const gx = ((cx - PAD_LEFT) / fieldW) * (gridCols - 1);
    const gy = ((cy - PAD_TOP) / fieldH) * (gridRows - 1);
    const c0 = Math.round(gx);
    const r0 = Math.round(gy);

    // Kernel Gaussiano de radio 3 celdas para suavidad
    const R = 3;
    for (let dr = -R; dr <= R; dr++) {
      const rr = r0 + dr;
      if (rr < 0 || rr >= gridRows) continue;
      for (let dc = -R; dc <= R; dc++) {
        const cc = c0 + dc;
        if (cc < 0 || cc >= gridCols) continue;
        const d2 = dr * dr + dc * dc;
        if (d2 <= R * R) {
          const w = Math.exp(-d2 / 2.6);
          grid[rr * gridCols + cc] += w;
        }
      }
    }
  }

  let maxVal = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > maxVal) maxVal = grid[i];
  }
  if (maxVal === 0) return;

  // Renderizar en un canvas offscreen de baja resolución y escalarlo con interpolación bicúbica/bilineal del navegador
  const off = document.createElement('canvas');
  off.width = gridCols;
  off.height = gridRows;
  const offCtx = off.getContext('2d');
  const imgData = offCtx.createImageData(gridCols, gridRows);
  const data = imgData.data;

  for (let i = 0; i < grid.length; i++) {
    const norm = Math.pow(grid[i] / maxVal, 0.78);
    if (norm < 0.05) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const [r, g, b, a] = thermalColorStop(norm);
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  offCtx.putImageData(imgData, 0, 0);

  // Recortar dentro del perímetro del estadio para que no salga por fuera de las paredes
  ctx.save();
  const CHAMFER = 1152;
  const p = (x, y) => rlToCanvas(x, y, width, height);
  const corners = [
    p(-FIELD_X_MAX + CHAMFER, -FIELD_Y_MAX),
    p(FIELD_X_MAX - CHAMFER, -FIELD_Y_MAX),
    p(FIELD_X_MAX, -FIELD_Y_MAX + CHAMFER),
    p(FIELD_X_MAX, FIELD_Y_MAX - CHAMFER),
    p(FIELD_X_MAX - CHAMFER, FIELD_Y_MAX),
    p(-FIELD_X_MAX + CHAMFER, FIELD_Y_MAX),
    p(-FIELD_X_MAX, FIELD_Y_MAX - CHAMFER),
    p(-FIELD_X_MAX, -FIELD_Y_MAX + CHAMFER),
  ];
  ctx.beginPath();
  ctx.moveTo(corners[0].cx, corners[0].cy);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].cx, corners[i].cy);
  ctx.closePath();
  ctx.clip();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, PAD_LEFT, PAD_TOP, fieldW, fieldH);

  // Dibujar centroide (posición media del jugador)
  if (filtered.length > 0) {
    let sumX = 0, sumY = 0;
    for (const pt of filtered) {
      sumX += pt.x;
      sumY += pt.y;
    }
    const avgPos = rlToCanvas(sumX / filtered.length, sumY / filtered.length, width, height);
    ctx.beginPath();
    ctx.arc(avgPos.cx, avgPos.cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = playerTeam === 0 ? '#0284c7' : '#ea580c';
    ctx.stroke();

    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText('Pos. Media', avgPos.cx, avgPos.cy - 12);
  }

  ctx.restore();
}

/**
 * Paleta térmica suave que no cansa la vista:
 * Indigo/Azul profundo -> Cian/Esmeralda -> Ámbar cálido -> Coral/Rojo suave
 */
function thermalColorStop(t) {
  const alpha = Math.min(215, Math.round(t * 240));
  if (t < 0.25) {
    const k = t / 0.25;
    return [
      Math.round(30 + k * 6),
      Math.round(64 + k * 118),
      Math.round(175 + k * 37),
      alpha,
    ];
  } else if (t < 0.55) {
    const k = (t - 0.25) / 0.30;
    return [
      Math.round(36 + k * 14),
      Math.round(182 + k * 30),
      Math.round(212 - k * 80),
      alpha,
    ];
  } else if (t < 0.8) {
    const k = (t - 0.55) / 0.25;
    return [
      Math.round(50 + k * 195),
      Math.round(212 - k * 54),
      Math.round(132 - k * 115),
      alpha,
    ];
  } else {
    const k = (t - 0.8) / 0.2;
    return [
      Math.round(245 + k * 9),
      Math.round(158 - k * 95),
      Math.round(17 + k * 40),
      alpha,
    ];
  }
}

/**
 * Renderiza el Mapa Interactivo de las 34 Pastillas de Turbo con el conteo exacto de recogidas en cada una.
 * Devuelve las posiciones de cada pastilla en el canvas para detectar hover/tooltips.
 */
export function renderBoostPadsMap(canvas, padPickupsById, hoveredPadId = null) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  drawRocketLeaguePitch(ctx, width, height);

  let maxCount = 1;
  for (const pad of BOOST_PADS) {
    const c = padPickupsById?.[pad.id]?.count || 0;
    if (c > maxCount) maxCount = c;
  }

  const renderedPads = [];

  for (const pad of BOOST_PADS) {
    const { cx, cy } = rlToCanvas(pad.x, pad.y, width, height);
    const stat = padPickupsById?.[pad.id] || { count: 0, collected: 0, wasted: 0, steals: 0 };
    const count = stat.count;
    const isBig = pad.type === 'big';
    const isHovered = hoveredPadId === pad.id;

    // Radio base y escalado proporcional al número de recogidas
    const baseRadius = isBig ? 17 : 11;
    const bonusRadius = count > 0 ? (count / maxCount) * (isBig ? 9 : 7) : 0;
    const radius = baseRadius + bonusRadius + (isHovered ? 3 : 0);

    ctx.save();

    // Halo exterior si fue recogido al menos 1 vez
    if (count > 0) {
      const haloGrad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 1.65);
      if (isBig) {
        haloGrad.addColorStop(0, 'rgba(245, 158, 11, 0.48)');
        haloGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        haloGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
        haloGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.65, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();
    }

    // Círculo principal de la pastilla
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);

    if (count === 0) {
      ctx.fillStyle = isBig ? 'rgba(51, 65, 85, 0.65)' : 'rgba(30, 41, 59, 0.65)';
      ctx.strokeStyle = isBig ? 'rgba(245, 158, 11, 0.35)' : 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.5;
    } else if (isBig) {
      ctx.fillStyle = isHovered ? '#fbbf24' : '#d97706';
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = isHovered ? 2.8 : 2;
    } else {
      ctx.fillStyle = isHovered ? '#38bdf8' : '#0284c7';
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = isHovered ? 2.5 : 1.6;
    }

    ctx.fill();
    ctx.stroke();

    // Número exacto de recogidas dentro del círculo
    ctx.font = `${isBig ? '700 12px' : '600 10.5px'} "JetBrains Mono", Inter, monospace`;
    ctx.fillStyle = count === 0 ? 'rgba(148, 163, 184, 0.55)' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy + 0.5);

    ctx.restore();

    renderedPads.push({
      ...pad,
      cx,
      cy,
      radius: Math.max(radius, 14),
      count,
      collected: Math.round(stat.collected),
      wasted: Math.round(stat.wasted),
      steals: stat.steals,
    });
  }

  return renderedPads;
}


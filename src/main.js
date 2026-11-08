import { BOOST_PADS, formatSeconds } from './constants.js';
import { renderPositionHeatmap, renderBoostPadsMap } from './pitchRenderer.js';
import { renderTimelineEvolutionChart, renderCategoryCharts } from './chartsManager.js';

const state = {
  analysis: null,
  activeMainTab: 'overview', // 'overview' | 'stats' | 'timeline' | 'spatial'
  timelineFilter: 'all',
  statsViewMode: 'table', // 'table' | 'charts'
  statsCategory: 'combat', // 'combat' | 'boost' | 'movement' | 'positioning' | 'camera'
  spatialMode: 'heatmap', // 'heatmap' | 'boostpads'
  selectedPlayerKey: null,
  heatmapFilter: 'all',
  hoveredPadId: null,
  renderedPadsCache: [],
};

let worker = null;

function initWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL('./replayWorker.js', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      showLoading(msg.step, msg.pct);
    } else if (msg.type === 'done') {
      hideLoading();
      state.analysis = msg.analysis;
      state.selectedPlayerKey = msg.analysis.players[0]?.key || null;
      openAnalysisScreen();
    } else if (msg.type === 'error') {
      hideLoading();
      showError(msg.message);
    }
  };

  worker.onerror = (err) => {
    hideLoading();
    showError(err.message || 'Error al procesar el archivo .replay.');
  };
}

function showLoading(stepText, pct) {
  document.getElementById('errorSection').classList.add('hidden');
  const sec = document.getElementById('loadingSection');
  sec.classList.remove('hidden');
  document.getElementById('loadingStep').textContent = stepText;
  document.getElementById('loadingPct').textContent = `${pct}%`;
  document.getElementById('loadingBar').style.width = `${pct}%`;
}

function hideLoading() {
  document.getElementById('loadingSection').classList.add('hidden');
}

function showError(msg) {
  const errSec = document.getElementById('errorSection');
  errSec.classList.remove('hidden');
  document.getElementById('errorMessage').textContent = msg;
}

async function processReplayBuffer(arrayBuffer, fileName) {
  // Asegurarse de mostrar el progreso en la pantalla de subida
  document.getElementById('analysisView').classList.add('hidden');
  document.getElementById('uploadView').classList.remove('hidden');
  document.getElementById('loadingTitle').textContent = fileName;
  showLoading('Leyendo archivo binario...', 5);

  initWorker();
  worker.postMessage({ arrayBuffer, fileName }, [arrayBuffer]);
}

function openAnalysisScreen() {
  const { analysis } = state;
  if (!analysis) return;

  // Ocultar pantalla inicial de subida y mostrar el sistema con pestañas
  document.getElementById('uploadView').classList.add('hidden');
  document.getElementById('analysisView').classList.remove('hidden');

  renderScoreboard(analysis);
  renderPlayerCards(analysis);
  renderStatsSection();
  renderTimelineSection(analysis);
  renderSpatialControls(analysis);

  // Activar la primera pestaña por defecto ("Resumen")
  switchMainTab('overview');
}

function switchMainTab(viewName) {
  state.activeMainTab = viewName;

  // Actualizar botones de navegación
  for (const btn of document.querySelectorAll('#mainNavTabs .main-tab')) {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  }

  // Mostrar únicamente la sección de la pestaña activa
  const views = ['overview', 'stats', 'timeline', 'spatial'];
  for (const v of views) {
    const pane = document.getElementById(`view-${v}`);
    if (pane) {
      pane.classList.toggle('hidden', v !== viewName);
    }
  }

  // Renderizar bajo demanda cuando un canvas entra en vista (para que Chart.js y el Canvas 2D midan bien su tamaño)
  if (viewName === 'stats' && state.statsViewMode === 'charts') {
    updateChartTitles(state.statsCategory);
    renderCategoryCharts(state.statsCategory, state.analysis);
  } else if (viewName === 'timeline') {
    renderTimelineEvolutionChart('timelineEvolutionCanvas', state.analysis);
  } else if (viewName === 'spatial') {
    renderSpatialMap();
  }
}

/* ==========================================================================
   CABECERA Y MARCADOR
   ========================================================================== */
function renderScoreboard(analysis) {
  const { meta, players } = analysis;
  document.getElementById('metaReplayName').textContent = meta.replayName || meta.fileName;
  document.getElementById('metaMode').textContent = meta.modeLabel;
  document.getElementById('metaMap').textContent = meta.mapName;
  document.getElementById('metaDuration').textContent = formatSeconds(meta.livePlaySeconds);
  document.getElementById('metaDate').textContent = meta.date;

  const ffBadge = document.getElementById('metaForfeit');
  ffBadge.classList.toggle('hidden', !meta.forfeit);

  document.getElementById('scoreBlue').textContent = meta.team0Score;
  document.getElementById('scoreOrange').textContent = meta.team1Score;

  const blueRoster = document.getElementById('blueRoster');
  const orangeRoster = document.getElementById('orangeRoster');
  blueRoster.innerHTML = '';
  orangeRoster.innerHTML = '';

  for (const p of players) {
    const chip = document.createElement('div');
    chip.className = 'roster-chip';
    chip.innerHTML = `
      <span class="team-dot ${p.team === 0 ? 'dot-blue' : 'dot-orange'}"></span>
      <span>${escapeHtml(p.name)}</span>
      ${p.isMvp ? '<span class="mvp-tag">MVP</span>' : ''}
    `;
    if (p.team === 0) blueRoster.appendChild(chip);
    else orangeRoster.appendChild(chip);
  }
}

/* ==========================================================================
   PESTAÑA 1: RESUMEN POR JUGADOR
   ========================================================================== */
function renderPlayerCards(analysis) {
  const grid = document.getElementById('playerCardsGrid');
  grid.innerHTML = '';

  for (const p of analysis.players) {
    const card = document.createElement('article');
    card.className = `player-card ${p.team === 0 ? 'card-blue' : 'card-orange'}`;

    card.innerHTML = `
      <div class="pcard-header">
        <div>
          <div class="pcard-name-wrap">
            <span class="team-dot ${p.team === 0 ? 'dot-blue' : 'dot-orange'}"></span>
            <h3 class="pcard-name">${escapeHtml(p.name)}</h3>
            ${p.isMvp ? '<span class="mvp-tag">MVP</span>' : ''}
          </div>
          <div class="pcard-sub">${p.team === 0 ? 'Equipo Azul' : 'Equipo Naranja'} · ${escapeHtml(p.carHitbox)} · ${escapeHtml(p.platform)}</div>
        </div>
        <div class="pcard-score-box">
          <span class="pcard-score-val">${p.score}</span>
          <span class="pcard-score-lbl">Puntos</span>
        </div>
      </div>

      <div class="pcard-core-row">
        <div>
          <span class="core-stat-num">${p.goals}</span>
          <span class="core-stat-lbl">Goles</span>
        </div>
        <div>
          <span class="core-stat-num">${p.assists}</span>
          <span class="core-stat-lbl">Asist.</span>
        </div>
        <div>
          <span class="core-stat-num">${p.saves}</span>
          <span class="core-stat-lbl">Salvadas</span>
        </div>
        <div>
          <span class="core-stat-num">${p.shots}</span>
          <span class="core-stat-lbl">Tiros</span>
        </div>
      </div>

      <div class="pcard-metrics-list">
        <div class="pcard-metric-item">
          <span class="metric-k">Efectividad de tiro</span>
          <span class="metric-v">${p.shootingPct.toFixed(1)}%</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Velocidad media</span>
          <span class="metric-v text-info">${p.avgSpeedKmh} km/h (${Math.round(p.avgSpeedUus)} uu/s)</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Tiempo en supersónico</span>
          <span class="metric-v">${p.speedPct.supersonic}%</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Turbo usado (BPM)</span>
          <span class="metric-v text-warn">${p.boostUsed} (${p.bpm}/min)</span>
        </div>
        <div class="pcard-metric-item" title="Turbo sobrante desperdiciado al recoger pastillas sin haber gastado el anterior">
          <span class="metric-k">Turbo perdido (sobrante)</span>
          <span class="metric-v text-danger">${p.boostOverfill}</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Turbos cogidos (100% / 12%)</span>
          <span class="metric-v">${p.bigPadsCollected} grandes · ${p.smallPadsCollected} peq.</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Demoliciones (hechas / recibidas)</span>
          <span class="metric-v">${p.demosInflicted} / ${p.demosTaken}</span>
        </div>
        <div class="pcard-metric-item">
          <span class="metric-k">Mitad defensiva / ofensiva</span>
          <span class="metric-v">${p.fieldHalfPct.defensive}% / ${p.fieldHalfPct.offensive}%</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  }
}

/* ==========================================================================
   PESTAÑA 2: ESTADÍSTICAS Y GRÁFICAS
   ========================================================================== */
function renderStatsSection() {
  const { analysis, statsViewMode, statsCategory } = state;
  if (!analysis) return;

  const tableWrap = document.getElementById('statsTableContainer');
  const chartsWrap = document.getElementById('statsChartsContainer');

  if (statsViewMode === 'table') {
    tableWrap.classList.remove('hidden');
    chartsWrap.classList.add('hidden');
    renderCategoryTable(statsCategory, analysis);
  } else {
    tableWrap.classList.add('hidden');
    chartsWrap.classList.remove('hidden');
    updateChartTitles(statsCategory);
    renderCategoryCharts(statsCategory, analysis);
  }
}

function updateChartTitles(category) {
  const t1 = document.getElementById('chartPrimaryTitle');
  const t2 = document.getElementById('chartSecondaryTitle');
  if (category === 'combat') {
    t1.textContent = 'Perfil de Rendimiento Relativo (0-100%)';
    t2.textContent = 'Goles, Tiros, Salvadas, Asistencias y Demoliciones';
  } else if (category === 'boost') {
    t1.textContent = 'Turbo Usado vs Turbo Perdido (Sobrante) vs Turbo Robado';
    t2.textContent = 'Pastillas Grandes (100%) y Pequeñas (12%) Recogidas';
  } else if (category === 'movement') {
    t1.textContent = 'Velocidad Media del Coche (km/h)';
    t2.textContent = 'Porcentaje de Tiempo por Franja de Velocidad';
  } else if (category === 'positioning') {
    t1.textContent = 'Ocupación por Tercios del Campo (%)';
    t2.textContent = 'Posicionamiento respecto al Balón y Rol en el Equipo';
  } else if (category === 'camera') {
    t1.textContent = 'Mecánicas Ejecutadas (Speed Flips, Wavedashes, Derrapes y Whiffs)';
    t2.textContent = 'Comparativa de Ajustes de Cámara (Distancia, FOV y Altura)';
  }
}

function renderCategoryTable(category, analysis) {
  const container = document.getElementById('statsTableContainer');
  const players = analysis.players;

  let columns = [];

  if (category === 'combat') {
    columns = [
      { label: 'MVP', render: p => (p.isMvp ? '<span class="mvp-tag">MVP</span>' : '—') },
      { label: 'Puntos', val: p => p.score, fmt: v => v, highlightMax: true },
      { label: 'Goles', val: p => p.goals, fmt: v => v, highlightMax: true },
      { label: 'Asistencias', val: p => p.assists, fmt: v => v, highlightMax: true },
      { label: 'Salvadas', val: p => p.saves, fmt: v => v, highlightMax: true },
      { label: 'Tiros', val: p => p.shots, fmt: v => v, highlightMax: true },
      { label: '% Tiro', val: p => p.shootingPct, fmt: v => `${v.toFixed(1)}%`, highlightMax: true },
      { label: 'Toques Balón', val: p => p.touches, fmt: v => v, highlightMax: true },
      { label: 'Toques Aéreos', val: p => p.aerialTouches, fmt: v => v, highlightMax: true },
      { label: 'Pases / Centros', render: p => `${p.passes} / ${p.centers}` },
      { label: 'Demoliciones', val: p => p.demosInflicted, fmt: v => v, highlightMax: true },
      { label: 'Demos Recibidas', val: p => p.demosTaken, fmt: v => v },
      { label: 'Bumps (D / R)', render: p => `${p.bumpsInflicted} / ${p.bumpsTaken}` },
    ];
  } else if (category === 'boost') {
    columns = [
      { label: 'Turbo Usado', val: p => p.boostUsed, fmt: v => v, highlightMax: true },
      { label: 'BPM (Turbo/min)', val: p => p.bpm, fmt: v => `${v}/min`, highlightMax: true },
      { label: 'Turbo Recogido', val: p => p.boostCollected, fmt: v => v, highlightMax: true },
      {
        label: 'Turbo Perdido (Sobrante)',
        val: p => p.boostOverfill,
        fmt: v => `<span class="wasted-val">${v}</span>`,
      },
      { label: 'Turbo Robado', val: p => p.boostStolen, fmt: v => v, highlightMax: true },
      { label: 'Turbo Medio', val: p => p.avgBoost, fmt: v => `${v}%`, highlightMax: true },
      { label: 'Pads 100%', val: p => p.bigPadsCollected, fmt: v => v, highlightMax: true },
      { label: 'Pads 12%', val: p => p.smallPadsCollected, fmt: v => v, highlightMax: true },
      { label: 'Pads 100% Robados', val: p => p.bigPadsStolen, fmt: v => v, highlightMax: true },
      { label: 'Tiempo a 0% Turbo', val: p => p.timeZeroBoostSec, fmt: (v, p) => `${v}s (${p.pctZeroBoost}%)` },
      { label: 'Tiempo a 100% Turbo', val: p => p.timeFullBoostSec, fmt: (v, p) => `${v}s (${p.pctFullBoost}%)` },
      { label: 'Usado Suelo / Aire', render: p => `${p.boostUsedGrounded} / ${p.boostUsedAirborne}` },
    ];
  } else if (category === 'movement') {
    columns = [
      { label: 'Velocidad Media (km/h)', val: p => p.avgSpeedKmh, fmt: v => `${v} km/h`, highlightMax: true },
      { label: 'Velocidad Media (uu/s)', val: p => Math.round(p.avgSpeedUus), fmt: v => `${v} uu/s`, highlightMax: true },
      { label: 'Vel. Máxima', val: p => p.maxSpeedKmh, fmt: v => `${v} km/h` },
      { label: 'Distancia Total', val: p => p.totalDistanceMeters, fmt: v => `${v} m`, highlightMax: true },
      { label: '% Supersónico', val: p => p.speedPct.supersonic, fmt: v => `${v}%`, highlightMax: true },
      { label: '% Vel. Boost', val: p => p.speedPct.boost, fmt: v => `${v}%` },
      { label: '% Vel. Lenta', val: p => p.speedPct.slow, fmt: v => `${v}%` },
      { label: '% Suelo', val: p => p.heightPct.ground, fmt: v => `${v}%` },
      { label: '% Aire Bajo', val: p => p.heightPct.low_air, fmt: v => `${v}%` },
      { label: '% Aire Alto', val: p => p.heightPct.high_air, fmt: v => `${v}%`, highlightMax: true },
      { label: 'Derrapes', render: p => `${p.powerslides} (${p.powerslideDuration.toFixed(1)}s)` },
    ];
  } else if (category === 'positioning') {
    columns = [
      { label: '% Mitad Defensiva', val: p => p.fieldHalfPct.defensive, fmt: v => `${v}%` },
      { label: '% Mitad Ofensiva', val: p => p.fieldHalfPct.offensive, fmt: v => `${v}%`, highlightMax: true },
      { label: '% Tercio Defensivo', val: p => p.fieldThirdPct.defensive, fmt: v => `${v}%` },
      { label: '% Tercio Medio', val: p => p.fieldThirdPct.neutral, fmt: v => `${v}%` },
      { label: '% Tercio Ofensivo', val: p => p.fieldThirdPct.offensive, fmt: v => `${v}%`, highlightMax: true },
      { label: '% Detrás del Balón', val: p => p.ballDepthPct.behind, fmt: v => `${v}%`, highlightMax: true },
      { label: '% Delante del Balón', val: p => p.ballDepthPct.ahead, fmt: v => `${v}%` },
      { label: '% Más Atrasado', val: p => p.depthRolePct.mostBack, fmt: v => `${v}%` },
      { label: '% Más Adelantado', val: p => p.depthRolePct.mostForward, fmt: v => `${v}%` },
      { label: 'Dist. Media Balón', val: p => p.avgDistToBallMeters, fmt: v => `${v.toFixed(1)} m` },
      { label: 'Dist. Media Compañero', val: p => p.avgDistToMateMeters, fmt: v => `${v.toFixed(1)} m` },
      { label: 'Shadow Defense', val: p => p.shadowDefenseSec, fmt: v => `${v.toFixed(1)}s` },
    ];
  } else if (category === 'camera') {
    columns = [
      { label: 'Hitbox', render: p => escapeHtml(p.carHitbox) },
      { label: 'FOV', render: p => p.camera.fov ?? '—' },
      { label: 'Distancia', render: p => p.camera.distance ?? '—' },
      { label: 'Altura', render: p => p.camera.height ?? '—' },
      { label: 'Ángulo', render: p => p.camera.angle ?? '—' },
      { label: 'Rigidez (Stiffness)', render: p => (p.camera.stiffness !== undefined ? Number(p.camera.stiffness).toFixed(2) : '—') },
      { label: 'Giro (Swivel)', render: p => (p.camera.swivel_speed !== undefined ? Number(p.camera.swivel_speed).toFixed(1) : '—') },
      { label: 'Transición', render: p => (p.camera.transition_speed !== undefined ? Number(p.camera.transition_speed).toFixed(2) : '—') },
      { label: 'Speed Flips', val: p => p.speedFlips, fmt: v => v, highlightMax: true },
      { label: 'Wavedashes', val: p => p.wavedashes, fmt: v => v, highlightMax: true },
      { label: 'Whiffs', val: p => p.whiffs, fmt: v => v },
    ];
  }

  const colMaxes = columns.map(col => {
    if (!col.highlightMax || !col.val) return null;
    return Math.max(...players.map(p => col.val(p)));
  });

  let html = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Jugador</th>
          ${columns.map(c => `<th>${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  for (const p of players) {
    html += `
      <tr>
        <td>
          <div class="player-cell">
            <span class="team-dot ${p.team === 0 ? 'dot-blue' : 'dot-orange'}"></span>
            <span>${escapeHtml(p.name)}</span>
          </div>
        </td>
    `;

    columns.forEach((col, cIdx) => {
      if (col.render) {
        html += `<td class="mono">${col.render(p)}</td>`;
      } else {
        const raw = col.val(p);
        const formatted = col.fmt ? col.fmt(raw, p) : raw;
        const isBest = col.highlightMax && raw > 0 && raw === colMaxes[cIdx];
        html += `<td class="mono ${isBest ? 'best-val' : ''}">${formatted}</td>`;
      }
    });

    html += `</tr>`;
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

/* ==========================================================================
   PESTAÑA 3: LÍNEA DE TIEMPO
   ========================================================================== */
function renderTimelineSection(analysis) {
  const rawTotal = Math.max(1, analysis.meta.totalDurationSeconds || analysis.meta.livePlaySeconds);
  const stepSec = 30;
  // Redondear el techo al múltiplo de 30s para que las marcas de cada 30 segundos queden limpias y exactas
  const totalTime = Math.ceil(rawTotal / stepSec) * stepSec;

  const axis = document.getElementById('timelineAxis');
  const track = document.getElementById('timelineTrack');
  const list = document.getElementById('timelineEventsList');
  axis.innerHTML = '';
  track.innerHTML = '';
  list.innerHTML = '';

  // Generar marcas cada 30 segundos (0:00, 0:30, 1:00, 1:30, ...)
  for (let t = 0; t <= totalTime; t += stepSec) {
    const pct = (t / totalTime) * 100;
    const lbl = document.createElement('span');
    lbl.className = 'tl-axis-tick';
    if (t === 0) lbl.classList.add('tick-start');
    else if (t === totalTime) lbl.classList.add('tick-end');
    lbl.style.left = `${pct}%`;
    lbl.textContent = formatSeconds(t);
    axis.appendChild(lbl);

    if (t > 0 && t < totalTime) {
      const gridLine = document.createElement('div');
      gridLine.className = 'tl-grid-line';
      gridLine.style.left = `${pct}%`;
      track.appendChild(gridLine);
    }
  }

  const events = analysis.matchEvents.filter(ev => {
    if (state.timelineFilter === 'all') return true;
    return ev.type === state.timelineFilter;
  });

  const codeForType = (t) => {
    if (t === 'Goal') return 'G';
    if (t === 'Save') return 'S';
    if (t === 'Demo') return 'D';
    if (t === 'Assist') return 'A';
    return 'T';
  };

  const labelForType = (t) => {
    if (t === 'Goal') return 'Gol';
    if (t === 'Save') return 'Salvada';
    if (t === 'Demo') return 'Demolición';
    if (t === 'Assist') return 'Asistencia';
    return 'Tiro';
  };

  for (const ev of events) {
    const pctPos = Math.min(98.5, Math.max(1.5, (ev.time / totalTime) * 100));
    const marker = document.createElement('div');
    marker.className = `tl-marker team-${ev.team} ev-${ev.type}`;
    marker.style.left = `${pctPos}%`;
    marker.title = `[${formatSeconds(ev.time)}] ${ev.detail}`;
    marker.textContent = codeForType(ev.type);
    track.appendChild(marker);

    const pill = document.createElement('div');
    pill.className = `tl-event-pill ${ev.team === 0 ? 'pill-blue' : 'pill-orange'}`;
    pill.innerHTML = `
      <div class="tl-pill-top">
        <span class="tl-pill-badge">${labelForType(ev.type)}</span>
        <span class="tl-pill-time">${formatSeconds(ev.time)}</span>
      </div>
      <div class="tl-pill-desc">${escapeHtml(ev.detail)}</div>
    `;
    list.appendChild(pill);
  }
}

/* ==========================================================================
   PESTAÑA 4: MAPAS ESPACIALES (HEATMAP Y 34 PASTILLAS DE TURBO)
   ========================================================================== */
function renderSpatialControls(analysis) {
  const selector = document.getElementById('spatialPlayerSelector');
  selector.innerHTML = '';

  for (const p of analysis.players) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = p.key === state.selectedPlayerKey;
    const activeClass = isSelected ? (p.team === 0 ? 'active-blue' : 'active-orange') : '';
    btn.className = `player-select-btn ${activeClass}`;
    btn.innerHTML = `
      <span class="team-dot ${p.team === 0 ? 'dot-blue' : 'dot-orange'}"></span>
      <span>${escapeHtml(p.name)}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedPlayerKey = p.key;
      renderSpatialControls(analysis);
      renderSpatialMap();
    });
    selector.appendChild(btn);
  }

  const hmSub = document.getElementById('heatmapSubfilters');
  hmSub.classList.toggle('hidden', state.spatialMode !== 'heatmap');
}

function renderSpatialMap() {
  const { analysis, selectedPlayerKey, spatialMode, heatmapFilter, hoveredPadId } = state;
  if (!analysis) return;

  const player = analysis.players.find(p => p.key === selectedPlayerKey) || analysis.players[0];
  if (!player) return;

  const canvas = document.getElementById('pitchCanvas');
  const sidebar = document.getElementById('spatialSidebar');

  if (spatialMode === 'heatmap') {
    state.renderedPadsCache = [];
    document.getElementById('padTooltip').classList.add('hidden');
    renderPositionHeatmap(canvas, player.positions, heatmapFilter, player.team);

    sidebar.innerHTML = `
      <h3 class="sidebar-title">Posicionamiento: ${escapeHtml(player.name)}</h3>
      <p class="sidebar-sub">${player.team === 0 ? 'Equipo Azul (Ataca hacia la derecha)' : 'Equipo Naranja (Ataca hacia la izquierda)'}</p>

      <div class="sidebar-stat-box">
        <div class="sidebar-stat-row">
          <span class="metric-k">Mitad defensiva</span>
          <span class="metric-v">${player.fieldHalfPct.defensive}%</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Mitad ofensiva</span>
          <span class="metric-v">${player.fieldHalfPct.offensive}%</span>
        </div>
      </div>

      <div class="sidebar-stat-box">
        <div class="sidebar-stat-row">
          <span class="metric-k">Tercio defensivo</span>
          <span class="metric-v">${player.fieldThirdPct.defensive}%</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Tercio medio</span>
          <span class="metric-v">${player.fieldThirdPct.neutral}%</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Tercio ofensivo</span>
          <span class="metric-v">${player.fieldThirdPct.offensive}%</span>
        </div>
      </div>

      <div class="sidebar-stat-box">
        <div class="sidebar-stat-row">
          <span class="metric-k">Detrás del balón</span>
          <span class="metric-v">${player.ballDepthPct.behind}%</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Delante del balón</span>
          <span class="metric-v">${player.ballDepthPct.ahead}%</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Velocidad media</span>
          <span class="metric-v text-info">${player.avgSpeedKmh} km/h</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Distancia media al balón</span>
          <span class="metric-v">${player.avgDistToBallMeters.toFixed(1)} m</span>
        </div>
      </div>
    `;
  } else {
    state.renderedPadsCache = renderBoostPadsMap(canvas, player.padPickupsById, hoveredPadId);

    const sortedPads = BOOST_PADS.map(pad => ({
      ...pad,
      ...(player.padPickupsById[pad.id] || { count: 0, collected: 0, wasted: 0, steals: 0 }),
    })).sort((a, b) => b.count - a.count);

    sidebar.innerHTML = `
      <h3 class="sidebar-title">Recogida de Turbos: ${escapeHtml(player.name)}</h3>
      <p class="sidebar-sub">Cantidad de veces que ha cogido cada pastilla del mapa. Pasa el cursor sobre cualquier turbo en el campo para ver el detalle.</p>

      <div class="sidebar-stat-box">
        <div class="sidebar-stat-row">
          <span class="metric-k">Turbos grandes (100%)</span>
          <span class="metric-v text-warn">${player.bigPadsCollected}</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Turbos pequeños (12%)</span>
          <span class="metric-v text-info">${player.smallPadsCollected}</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Turbo perdido (sobrante)</span>
          <span class="metric-v text-danger">${player.boostOverfill}</span>
        </div>
        <div class="sidebar-stat-row">
          <span class="metric-k">Turbo robado al rival</span>
          <span class="metric-v">${player.boostStolen} (${player.bigPadsStolen} grandes)</span>
        </div>
      </div>

      <div class="toolbar-label" style="margin-top: 6px;">Desglose por pastilla:</div>
      <div class="pad-ranking-list">
        ${sortedPads
          .filter(p => p.count > 0)
          .map(
            p => `
          <div class="pad-rank-item">
            <div>
              <span class="pad-rank-badge ${p.type}">${p.type === 'big' ? '100%' : '12%'}</span>
              <span style="margin-left: 6px;">${escapeHtml(p.label)}</span>
            </div>
            <div class="mono" style="font-weight: 600;">
              ${p.count}x <span style="color: #fb7185; font-size: 0.72rem;" title="Turbo perdido en este pad">(-${Math.round(p.wasted)})</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }
}

/* ==========================================================================
   EVENTOS DE INTERFAZ
   ========================================================================== */
function setupInteractions() {
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const btnSelectFile = document.getElementById('btnSelectFile');
  const btnBackToUpload = document.getElementById('btnBackToUpload');

  btnSelectFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  btnBackToUpload.addEventListener('click', () => {
    fileInput.value = '';
    hideLoading();
    document.getElementById('errorSection').classList.add('hidden');
    document.getElementById('analysisView').classList.add('hidden');
    document.getElementById('uploadView').classList.remove('hidden');
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await processReplayBuffer(buf, file.name);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await processReplayBuffer(buf, file.name);
  });

  // Navegación principal por pestañas
  document.getElementById('mainNavTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('button[data-view]');
    if (!tab) return;
    switchMainTab(tab.dataset.view);
  });

  // Sub-pestañas de Estadísticas
  document.getElementById('categoryTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('button[data-cat]');
    if (!tab) return;
    state.statsCategory = tab.dataset.cat;
    for (const t of document.querySelectorAll('#categoryTabs .sub-tab')) {
      t.classList.toggle('active', t === tab);
    }
    renderStatsSection();
  });

  // Selector Tabla vs Gráficas
  const btnTable = document.getElementById('btnViewTable');
  const btnCharts = document.getElementById('btnViewCharts');
  btnTable.addEventListener('click', () => {
    state.statsViewMode = 'table';
    btnTable.classList.add('active');
    btnCharts.classList.remove('active');
    renderStatsSection();
  });
  btnCharts.addEventListener('click', () => {
    state.statsViewMode = 'charts';
    btnCharts.classList.add('active');
    btnTable.classList.remove('active');
    renderStatsSection();
  });

  // Filtros de Línea de Tiempo
  document.getElementById('timelineFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn || !state.analysis) return;
    state.timelineFilter = btn.dataset.filter;
    for (const b of document.querySelectorAll('#timelineFilters .filter-pill')) {
      b.classList.toggle('active', b === btn);
    }
    renderTimelineSection(state.analysis);
  });

  // Selector Mapa de Calor vs Mapa de Turbos
  const btnHeatmap = document.getElementById('btnMapHeatmap');
  const btnBoostPads = document.getElementById('btnMapBoostPads');
  btnHeatmap.addEventListener('click', () => {
    state.spatialMode = 'heatmap';
    btnHeatmap.classList.add('active');
    btnBoostPads.classList.remove('active');
    if (state.analysis) {
      renderSpatialControls(state.analysis);
      renderSpatialMap();
    }
  });
  btnBoostPads.addEventListener('click', () => {
    state.spatialMode = 'boostpads';
    btnBoostPads.classList.add('active');
    btnHeatmap.classList.remove('active');
    if (state.analysis) {
      renderSpatialControls(state.analysis);
      renderSpatialMap();
    }
  });

  // Sub-filtros del Heatmap
  document.getElementById('heatmapSubfilters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-hmfilter]');
    if (!btn) return;
    state.heatmapFilter = btn.dataset.hmfilter;
    for (const b of document.querySelectorAll('#heatmapSubfilters .filter-pill')) {
      b.classList.toggle('active', b === btn);
    }
    renderSpatialMap();
  });

  // Tooltip al pasar el ratón sobre las pastillas de turbo en el mapa
  const canvas = document.getElementById('pitchCanvas');
  const tooltip = document.getElementById('padTooltip');

  canvas.addEventListener('mousemove', (e) => {
    if (state.spatialMode !== 'boostpads' || state.renderedPadsCache.length === 0) {
      tooltip.classList.add('hidden');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let hit = null;
    for (const pad of state.renderedPadsCache) {
      const d = Math.hypot(pad.cx - mx, pad.cy - my);
      if (d <= pad.radius + 4) {
        hit = pad;
        break;
      }
    }

    if (hit) {
      canvas.style.cursor = 'pointer';
      if (state.hoveredPadId !== hit.id) {
        state.hoveredPadId = hit.id;
        renderBoostPadsMap(
          canvas,
          state.analysis.players.find(p => p.key === state.selectedPlayerKey)?.padPickupsById,
          hit.id
        );
      }

      tooltip.classList.remove('hidden');
      tooltip.innerHTML = `
        <div style="font-weight: 600; color: ${hit.type === 'big' ? '#eab308' : '#60a5fa'}; margin-bottom: 4px;">
          ${hit.type === 'big' ? 'Turbo 100%' : 'Turbo 12%'} — ${escapeHtml(hit.label)}
        </div>
        <div>Veces cogido: <strong class="mono">${hit.count}</strong></div>
        <div>Turbo aprovechado: <strong class="mono">+${hit.collected}</strong></div>
        <div>Turbo perdido (sobrante): <strong class="mono" style="color: #fb7185;">${hit.wasted}</strong></div>
        ${hit.steals > 0 ? `<div>Robado en campo rival: <strong class="mono">${hit.steals}</strong></div>` : ''}
      `;

      const leftPx = Math.min(rect.width - 220, Math.max(10, e.clientX - rect.left + 14));
      const topPx = Math.max(10, e.clientY - rect.top - 70);
      tooltip.style.left = `${leftPx}px`;
      tooltip.style.top = `${topPx}px`;
    } else {
      canvas.style.cursor = 'default';
      if (state.hoveredPadId !== null) {
        state.hoveredPadId = null;
        renderBoostPadsMap(
          canvas,
          state.analysis.players.find(p => p.key === state.selectedPlayerKey)?.padPickupsById,
          null
        );
      }
      tooltip.classList.add('hidden');
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.classList.add('hidden');
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  setupInteractions();
});

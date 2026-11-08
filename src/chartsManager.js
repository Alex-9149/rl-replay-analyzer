import Chart from 'chart.js/auto';

// Configuración global de Chart.js con tonos Slate suaves a la vista
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.12)';
Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";

const BLUE_PALETTE = [
  { bg: 'rgba(56, 189, 248, 0.78)', border: '#38bdf8' },
  { bg: 'rgba(14, 165, 233, 0.78)', border: '#0ea5e9' },
  { bg: 'rgba(99, 102, 241, 0.78)', border: '#6366f1' },
  { bg: 'rgba(45, 212, 191, 0.78)', border: '#2dd4bf' },
];

const ORANGE_PALETTE = [
  { bg: 'rgba(251, 146, 60, 0.78)', border: '#fb923c' },
  { bg: 'rgba(245, 158, 11, 0.78)', border: '#f59e0b' },
  { bg: 'rgba(244, 63, 94, 0.78)', border: '#f43f5e' },
  { bg: 'rgba(217, 119, 6, 0.78)', border: '#d97706' },
];

export function getPlayerColor(player, allPlayers) {
  const sameTeam = allPlayers.filter(p => p.team === player.team);
  const idxInTeam = Math.max(0, sameTeam.findIndex(p => p.key === player.key));
  const palette = player.team === 0 ? BLUE_PALETTE : ORANGE_PALETTE;
  return palette[idxInTeam % palette.length];
}

const activeCharts = {};

function destroyChart(id) {
  if (activeCharts[id]) {
    activeCharts[id].destroy();
    delete activeCharts[id];
  }
}

/**
 * Gráfica evolutiva en la línea de tiempo (Turbo acumulado usado por jugador a lo largo del partido)
 */
export function renderTimelineEvolutionChart(canvasId, analysis) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const datasets = analysis.players.map(p => {
    const col = getPlayerColor(p, analysis.players);
    const pts = analysis.boostTimelineSeries[p.key] || [];
    return {
      label: `${p.name} (${p.team === 0 ? 'Azul' : 'Naranja'})`,
      data: pts.map(pt => ({ x: Math.round(pt.time), y: pt.value })),
      borderColor: col.border,
      backgroundColor: col.bg,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.25,
    };
  });

  activeCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: '#cbd5e1' },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              const s = items[0]?.parsed?.x || 0;
              const m = Math.floor(s / 60);
              const r = Math.round(s % 60).toString().padStart(2, '0');
              return `Minuto ${m}:${r}`;
            },
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} turbo usado`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tiempo de partido', color: '#64748b' },
          ticks: {
            stepSize: 30,
            callback: (val) => {
              const m = Math.floor(val / 60);
              const r = Math.round(val % 60).toString().padStart(2, '0');
              return `${m}:${r}`;
            },
          },
        },
        y: {
          title: { display: true, text: 'Turbo Acumulado Usado', color: '#64748b' },
          beginAtZero: true,
        },
      },
    },
  });
}

/**
 * Renderiza las gráficas comparativas según la categoría activa ('combat', 'boost', 'movement', 'positioning')
 */
export function renderCategoryCharts(category, analysis) {
  const players = analysis.players;
  const labels = players.map(p => p.name);
  const bgColors = players.map(p => getPlayerColor(p, players).bg);
  const borderColors = players.map(p => getPlayerColor(p, players).border);

  destroyChart('chartPrimary');
  destroyChart('chartSecondary');

  const c1 = document.getElementById('chartPrimary');
  const c2 = document.getElementById('chartSecondary');
  if (!c1 || !c2) return;

  if (category === 'combat') {
    // Chart 1: Radar de Rendimiento General normalizado
    const maxScore = Math.max(100, ...players.map(p => p.score));
    const maxGoals = Math.max(1, ...players.map(p => p.goals));
    const maxAssists = Math.max(1, ...players.map(p => p.assists));
    const maxSaves = Math.max(1, ...players.map(p => p.saves));
    const maxShots = Math.max(1, ...players.map(p => p.shots));
    const maxTouches = Math.max(1, ...players.map(p => p.touches));

    activeCharts.chartPrimary = new Chart(c1, {
      type: 'radar',
      data: {
        labels: ['Puntuación', 'Goles', 'Asistencias', 'Salvadas', 'Tiros', 'Toques Balón'],
        datasets: players.map(p => {
          const col = getPlayerColor(p, players);
          return {
            label: p.name,
            data: [
              Math.round((p.score / maxScore) * 100),
              Math.round((p.goals / maxGoals) * 100),
              Math.round((p.assists / maxAssists) * 100),
              Math.round((p.saves / maxSaves) * 100),
              Math.round((p.shots / maxShots) * 100),
              Math.round((p.touches / maxTouches) * 100),
            ],
            borderColor: col.border,
            backgroundColor: col.bg.replace('0.78', '0.16'),
            borderWidth: 2,
            pointBackgroundColor: col.border,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(148, 163, 184, 0.15)' },
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            pointLabels: { color: '#cbd5e1', font: { size: 12, weight: '600' } },
            suggestedMin: 0,
            suggestedMax: 100,
            ticks: { display: false },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
      },
    });

    // Chart 2: Barras agrupadas de Goles, Tiros, Salvadas, Asistencias y Demos
    activeCharts.chartSecondary = new Chart(c2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Goles', data: players.map(p => p.goals), backgroundColor: '#38bdf8' },
          { label: 'Tiros', data: players.map(p => p.shots), backgroundColor: '#818cf8' },
          { label: 'Salvadas', data: players.map(p => p.saves), backgroundColor: '#34d399' },
          { label: 'Asistencias', data: players.map(p => p.assists), backgroundColor: '#fbbf24' },
          { label: 'Demoliciones', data: players.map(p => p.demosInflicted), backgroundColor: '#f87171' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  } else if (category === 'boost') {
    // Chart 1: Turbo Usado vs Turbo Perdido (Overfill/Sobrante) vs Turbo Robado
    activeCharts.chartPrimary = new Chart(c1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Turbo Usado',
            data: players.map(p => p.boostUsed),
            backgroundColor: 'rgba(56, 189, 248, 0.8)',
            borderColor: '#38bdf8',
            borderWidth: 1,
          },
          {
            label: 'Turbo Perdido (Sobrante al recoger)',
            data: players.map(p => p.boostOverfill),
            backgroundColor: 'rgba(244, 63, 94, 0.8)',
            borderColor: '#f43f5e',
            borderWidth: 1,
          },
          {
            label: 'Turbo Robado (Campo rival)',
            data: players.map(p => p.boostStolen),
            backgroundColor: 'rgba(251, 146, 60, 0.8)',
            borderColor: '#fb923c',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Unidades de Turbo (%)', color: '#64748b' } },
        },
      },
    });

    // Chart 2: Pastillas Grandes (100%) vs Pastillas Pequeñas (12%) recogidas
    activeCharts.chartSecondary = new Chart(c2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pastillas Grandes (100%)',
            data: players.map(p => p.bigPadsCollected),
            backgroundColor: 'rgba(245, 158, 11, 0.82)',
            borderColor: '#f59e0b',
            borderWidth: 1,
          },
          {
            label: 'Pastillas Pequeñas (12%)',
            data: players.map(p => p.smallPadsCollected),
            backgroundColor: 'rgba(14, 165, 233, 0.82)',
            borderColor: '#0ea5e9',
            borderWidth: 1,
          },
          {
            label: 'Grandes Robadas',
            data: players.map(p => p.bigPadsStolen),
            backgroundColor: 'rgba(168, 85, 247, 0.82)',
            borderColor: '#a855f7',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Cantidad de pastillas', color: '#64748b' } },
        },
      },
    });
  } else if (category === 'movement') {
    // Chart 1: Velocidad Media (km/h) por jugador
    activeCharts.chartPrimary = new Chart(c1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Velocidad Media (km/h)',
            data: players.map(p => p.avgSpeedKmh),
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: false,
            suggestedMin: 35,
            suggestedMax: 65,
            title: { display: true, text: 'Velocidad Media (km/h)', color: '#64748b' },
          },
        },
      },
    });

    // Chart 2: Distribución de Velocidades (% Lenta, Velocidad Boost, Supersónica)
    activeCharts.chartSecondary = new Chart(c2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '% Velocidad Lenta',
            data: players.map(p => p.speedPct.slow),
            backgroundColor: 'rgba(100, 116, 139, 0.78)',
          },
          {
            label: '% Velocidad de Boost',
            data: players.map(p => p.speedPct.boost),
            backgroundColor: 'rgba(56, 189, 248, 0.78)',
          },
          {
            label: '% Velocidad Supersónica',
            data: players.map(p => p.speedPct.supersonic),
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, max: 100, title: { display: true, text: '% del Tiempo', color: '#64748b' } },
        },
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
      },
    });
  } else if (category === 'positioning') {
    // Chart 1: Tercios del Campo (% Tercio Defensivo, Medio, Ofensivo)
    activeCharts.chartPrimary = new Chart(c1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '% Tercio Defensivo',
            data: players.map(p => p.fieldThirdPct.defensive),
            backgroundColor: 'rgba(56, 189, 248, 0.78)',
          },
          {
            label: '% Tercio Neutral (Medio)',
            data: players.map(p => p.fieldThirdPct.neutral),
            backgroundColor: 'rgba(148, 163, 184, 0.65)',
          },
          {
            label: '% Tercio Ofensivo',
            data: players.map(p => p.fieldThirdPct.offensive),
            backgroundColor: 'rgba(251, 146, 60, 0.82)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, max: 100, title: { display: true, text: '% del Tiempo', color: '#64748b' } },
        },
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
      },
    });

    // Chart 2: Posición respecto al balón y rol (% Detrás del balón, % Delante, % Más atrasado, % Más adelantado)
    activeCharts.chartSecondary = new Chart(c2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '% Detrás del Balón',
            data: players.map(p => p.ballDepthPct.behind),
            backgroundColor: 'rgba(52, 211, 153, 0.8)',
          },
          {
            label: '% Delante del Balón',
            data: players.map(p => p.ballDepthPct.ahead),
            backgroundColor: 'rgba(248, 113, 113, 0.8)',
          },
          {
            label: '% Más Atrasado (Last Man)',
            data: players.map(p => p.depthRolePct.mostBack),
            backgroundColor: 'rgba(96, 165, 250, 0.8)',
          },
          {
            label: '% Más Adelantado (First Man)',
            data: players.map(p => p.depthRolePct.mostForward),
            backgroundColor: 'rgba(251, 191, 36, 0.8)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true, max: 100, title: { display: true, text: '% del Tiempo', color: '#64748b' } },
        },
      },
    });
  } else if (category === 'camera') {
    // Chart 1: Mecánicas ejecutadas por jugador (Speed Flips, Wavedashes, Derrapes, Whiffs)
    activeCharts.chartPrimary = new Chart(c1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Speed Flips',
            data: players.map(p => p.speedFlips),
            backgroundColor: 'rgba(56, 189, 248, 0.82)',
            borderColor: '#38bdf8',
            borderWidth: 1,
          },
          {
            label: 'Wavedashes',
            data: players.map(p => p.wavedashes),
            backgroundColor: 'rgba(52, 211, 153, 0.82)',
            borderColor: '#34d399',
            borderWidth: 1,
          },
          {
            label: 'Derrapes (Powerslides)',
            data: players.map(p => p.powerslides),
            backgroundColor: 'rgba(251, 191, 36, 0.82)',
            borderColor: '#fbbf24',
            borderWidth: 1,
          },
          {
            label: 'Whiffs (Fallos al balón)',
            data: players.map(p => p.whiffs),
            backgroundColor: 'rgba(244, 63, 94, 0.82)',
            borderColor: '#f43f5e',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Cantidad en el partido', color: '#64748b' } },
        },
      },
    });

    // Chart 2: Ajustes principales de Cámara (Distancia, FOV y Altura)
    activeCharts.chartSecondary = new Chart(c2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Distancia de Cámara',
            data: players.map(p => p.camera?.distance ?? 0),
            backgroundColor: 'rgba(96, 165, 250, 0.82)',
            borderColor: '#60a5fa',
            borderWidth: 1,
          },
          {
            label: 'FOV (Campo de visión)',
            data: players.map(p => p.camera?.fov ?? 0),
            backgroundColor: 'rgba(167, 139, 250, 0.82)',
            borderColor: '#a78bfa',
            borderWidth: 1,
          },
          {
            label: 'Altura de Cámara',
            data: players.map(p => p.camera?.height ?? 0),
            backgroundColor: 'rgba(251, 146, 60, 0.82)',
            borderColor: '#fb923c',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Valor de configuración', color: '#64748b' } },
        },
      },
    });
  }
}


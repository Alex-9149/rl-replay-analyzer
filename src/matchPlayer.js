import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BOOST_PADS, formatSeconds } from './constants.js';
import { drawRocketLeaguePitch, rlToCanvas } from './pitchRenderer.js';

const PLAYER_COLORS_BLUE = ['#3b82f6', '#38bdf8', '#6366f1', '#2dd4bf'];
const PLAYER_COLORS_ORANGE = ['#f97316', '#f59e0b', '#f43f5e', '#fb923c'];

export class MatchPlayerController {
  constructor() {
    this.samples = [];
    this.players = [];
    this.events = [];
    this.duration = 0;

    this.currentTime = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.mode = '2d'; // '2d' | '3d'
    this.cameraMode = 'orbit'; // 'orbit' | 'ballcam' | 'pov:0' | 'pov:1' ...

    this.rafId = null;
    this.lastTick = 0;

    // 2D Canvas references
    this.canvas2d = null;
    this.ctx2d = null;

    // 3D Three.js references
    this.container3d = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.ballMesh = null;
    this.ballShadow = null;
    this.ballHeightLine = null;
    this.carGroups = [];
    this.ballTrailLine = null;
    this.ballTrailPoints = [];

    // UI callbacks
    this.onTimeUpdate = null;
  }

  initDOM({ canvas2d, container3d, onTimeUpdate }) {
    this.canvas2d = canvas2d;
    this.ctx2d = canvas2d.getContext('2d');
    this.container3d = container3d;
    this.onTimeUpdate = onTimeUpdate;
  }

  loadMatch(analysis) {
    this.pause();
    this.samples = analysis.replaySamples || [];
    this.players = analysis.players || [];
    this.events = analysis.matchEvents || [];
    this.duration =
      this.samples.length > 0
        ? this.samples[this.samples.length - 1].t
        : analysis.meta?.totalDurationSeconds || 300;
    this.currentTime = 0;

    if (this.scene) {
      this.rebuild3DCars();
    }
    this.renderCurrentFrame();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === '3d') {
      this.ensure3DInitialized();
      this.resize3D();
    }
    this.renderCurrentFrame();
  }

  setCameraMode(camMode) {
    this.cameraMode = camMode;
    if (this.controls) {
      this.controls.enabled = camMode === 'orbit';
      if (camMode === 'orbit') {
        this.camera.position.set(0, 5600, -7800);
        this.controls.target.set(0, 200, 0);
        this.controls.update();
      }
    }
    this.renderCurrentFrame();
  }

  setSpeed(speed) {
    this.playbackSpeed = Number(speed) || 1.0;
  }

  play() {
    if (this.isPlaying) return;
    if (this.currentTime >= this.duration) {
      this.currentTime = 0;
    }
    this.isPlaying = true;
    this.lastTick = performance.now();
    const loop = (now) => {
      if (!this.isPlaying) return;
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;

      this.currentTime += dt * this.playbackSpeed;
      if (this.currentTime >= this.duration) {
        this.currentTime = this.duration;
        this.isPlaying = false;
      }

      this.renderCurrentFrame();
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.currentTime, this.duration, this.isPlaying);
      }

      if (this.isPlaying) {
        this.rafId = requestAnimationFrame(loop);
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pause() {
    this.isPlaying = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime, this.duration, false);
    }
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
    return this.isPlaying;
  }

  seek(timeSec) {
    this.currentTime = Math.max(0, Math.min(this.duration, Number(timeSec) || 0));
    this.renderCurrentFrame();
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime, this.duration, this.isPlaying);
    }
  }

  /**
   * Interpola linealmente entre dos muestras de 10Hz para lograr movimiento fluido a 60fps
   */
  getInterpolatedState(t) {
    const n = this.samples.length;
    if (n === 0) return null;
    if (t <= this.samples[0].t) return this.samples[0];
    if (t >= this.samples[n - 1].t) return this.samples[n - 1];

    // Búsqueda binaria del fotograma
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].t <= t) lo = mid;
      else hi = mid;
    }

    const s0 = this.samples[lo];
    const s1 = this.samples[hi];
    const span = s1.t - s0.t;
    const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (t - s0.t) / span)) : 0;

    // Si hubo un teletransporte (ej. gol/respawn), no interpolar posiciones lejanas
    const lerp = (a, b) => a + (b - a) * alpha;
    const lerpAngle = (a, b) => {
      let diff = b - a;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return a + diff * alpha;
    };

    const ballDist = Math.hypot(s1.ball.x - s0.ball.x, s1.ball.y - s0.ball.y);
    const ball =
      ballDist > 1800
        ? s0.ball
        : {
            x: lerp(s0.ball.x, s1.ball.x),
            y: lerp(s0.ball.y, s1.ball.y),
            z: lerp(s0.ball.z, s1.ball.z),
            speedKmh: Math.round(lerp(s0.ball.speedKmh, s1.ball.speedKmh)),
          };

    const cars = s0.cars.map((c0, idx) => {
      const c1 = s1.cars[idx] || c0;
      const dist = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      if (dist > 1500) return c0;
      return {
        x: lerp(c0.x, c1.x),
        y: lerp(c0.y, c1.y),
        z: lerp(c0.z, c1.z),
        rx: lerpAngle(c0.rx, c1.rx),
        ry: lerpAngle(c0.ry, c1.ry),
        rz: lerpAngle(c0.rz, c1.rz),
        heading: lerpAngle(c0.heading, c1.heading),
        speedKmh: Math.round(lerp(c0.speedKmh, c1.speedKmh)),
        boostPct: Math.round(lerp(c0.boostPct, c1.boostPct)),
      };
    });

    return {
      t,
      clock: s0.clock,
      ball,
      cars,
      sampleIndex: lo,
    };
  }

  getPlayerColorHex(playerIndex) {
    const p = this.players[playerIndex];
    if (!p) return '#3b82f6';
    const sameTeam = this.players.filter(pl => pl.team === p.team);
    const idx = Math.max(0, sameTeam.findIndex(pl => pl.key === p.key));
    return p.team === 0
      ? PLAYER_COLORS_BLUE[idx % PLAYER_COLORS_BLUE.length]
      : PLAYER_COLORS_ORANGE[idx % PLAYER_COLORS_ORANGE.length];
  }

  renderCurrentFrame() {
    const state = this.getInterpolatedState(this.currentTime);
    if (!state) return;

    if (this.mode === '2d') {
      this.render2D(state);
    } else {
      this.render3D(state);
    }
    this.updateLiveTelemetryCards(state);
  }

  /* ==========================================================================
     MODO 2D: PIZARRA TÁCTICA INTERACTIVA
     ========================================================================== */
  render2D(state) {
    if (!this.canvas2d || !this.ctx2d) return;
    const ctx = this.ctx2d;
    const width = this.canvas2d.width;
    const height = this.canvas2d.height;

    drawRocketLeaguePitch(ctx, width, height);

    // 1. Dibujar las 34 pastillas de turbo sutilmente en el suelo
    for (const pad of BOOST_PADS) {
      const { cx, cy } = rlToCanvas(pad.x, pad.y, width, height);
      ctx.beginPath();
      ctx.arc(cx, cy, pad.type === 'big' ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = pad.type === 'big' ? 'rgba(234, 179, 8, 0.35)' : 'rgba(148, 163, 184, 0.22)';
      ctx.fill();
    }

    // 2. Dibujar estela reciente del balón (últimos 2 segundos)
    const idx = state.sampleIndex || 0;
    const startIdx = Math.max(0, idx - 22);
    if (idx > startIdx) {
      ctx.save();
      ctx.beginPath();
      for (let k = startIdx; k <= idx; k++) {
        const b = this.samples[k].ball;
        const pt = rlToCanvas(b.x, b.y, width, height);
        if (k === startIdx) ctx.moveTo(pt.cx, pt.cy);
        else ctx.lineTo(pt.cx, pt.cy);
      }
      const curBallPt = rlToCanvas(state.ball.x, state.ball.y, width, height);
      ctx.lineTo(curBallPt.cx, curBallPt.cy);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Dibujar los coches
    state.cars.forEach((car, i) => {
      const pInfo = this.players[i];
      if (!pInfo) return;
      const color = this.getPlayerColorHex(i);
      const { cx, cy } = rlToCanvas(car.x, car.y, width, height);

      // En rlToCanvas: Horizontal = rlY, Vertical = rlX
      // Por tanto un vector (dx, dy) en RL se proyecta en canvas como (dCanvasX = dy, dCanvasY = dx)
      const canvasAngle = Math.atan2(Math.cos(car.heading), Math.sin(car.heading));

      ctx.save();
      ctx.translate(cx, cy);

      // Sombra de altura si el coche está volando (z > 60)
      const airOffset = Math.max(0, (car.z - 17) / 90);
      if (airOffset > 1.5) {
        ctx.beginPath();
        ctx.arc(0, airOffset + 4, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();
      }

      ctx.translate(0, -airOffset);
      ctx.rotate(canvasAngle);

      // Chorro de turbo / supersónico detrás del coche
      if (car.speedKmh > 65) {
        ctx.beginPath();
        ctx.moveTo(-12, -4);
        ctx.lineTo(-22, 0);
        ctx.lineTo(-12, 4);
        ctx.fillStyle = '#eab308';
        ctx.fill();
      }

      // Chasis del coche (rectángulo redondeado con morro marcado)
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0b1120';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-12, -8, 24, 16, 4);
      ctx.fill();
      ctx.stroke();

      // Parabrisas / Indicador de dirección frontal
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(2, -5.5, 6, 11);

      ctx.restore();

      // Etiqueta con Nombre y Barra de Turbo encima del coche
      ctx.save();
      const labelY = cy - airOffset - 18;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(pInfo.name, cx, labelY - 5);

      // Barra de boost (ancho 34px)
      const barW = 34;
      const barH = 4;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx - barW / 2, labelY - 2, barW, barH);
      ctx.fillStyle = car.boostPct > 25 ? '#eab308' : '#f43f5e';
      ctx.fillRect(cx - barW / 2, labelY - 2, (barW * Math.min(100, car.boostPct)) / 100, barH);
      ctx.restore();
    });

    // 4. Dibujar el Balón (con sombra y escalado según su altura Z)
    const { cx: bx, cy: by } = rlToCanvas(state.ball.x, state.ball.y, width, height);
    const ballAirShift = Math.max(0, (state.ball.z - 93) / 75);
    const ballRadius = 9.5 + Math.min(6, (state.ball.z - 93) / 260);

    ctx.save();
    // Sombra en el suelo
    ctx.beginPath();
    ctx.arc(bx, by + 3, Math.max(5, 9 - ballAirShift * 0.15), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();

    // Esfera del balón elevada según Z
    const drawBy = by - ballAirShift;
    const ballGrad = ctx.createRadialGradient(bx - 3, drawBy - 3, 2, bx, drawBy, ballRadius);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.7, '#e2e8f0');
    ballGrad.addColorStop(1, '#94a3b8');

    ctx.beginPath();
    ctx.arc(bx, drawBy, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();

    // 5. Reloj del partido en la parte superior central del canvas
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 58, 8, 116, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⏱ ${formatSeconds(state.clock)}`, width / 2, 22);
    ctx.restore();
  }

  /* ==========================================================================
     MODO 3D: ESTADIO INTERACTIVO EN THREE.JS (WEBGL)
     ========================================================================== */
  ensure3DInitialized() {
    if (this.scene || !this.container3d) return;

    const w = this.container3d.clientWidth || 920;
    const h = this.container3d.clientHeight || 560;

    // En Three.js usamos Y como eje vertical (altura = rlZ), X = rlY (largo del campo), Z = rlX (ancho)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b101b);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 20, 30000);
    this.camera.position.set(0, 5600, -7800);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container3d.innerHTML = '';
    this.container3d.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 800;
    this.controls.maxDistance = 16000;
    this.controls.target.set(0, 200, 0);
    this.controls.update();

    // Iluminación del estadio
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.75);
    this.scene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(-3000, 6000, -3000);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.45);
    dirLight2.position.set(3000, 5000, 4000);
    this.scene.add(dirLight2);

    this.build3DStadium();
    this.rebuild3DCars();

    window.addEventListener('resize', () => this.resize3D());
  }

  resize3D() {
    if (!this.renderer || !this.container3d || !this.camera) return;
    const w = this.container3d.clientWidth || 920;
    const h = this.container3d.clientHeight || 560;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Convierte coordenadas RL (rlX, rlY, rlZ) a coordenadas Three.js (x = rlY, y = rlZ, z = rlX)
   * De modo que el campo quede horizontal igual que en el mapa 2D:
   * - Izquierda (X = -5120) = Portería Azul
   * - Derecha   (X = +5120) = Portería Naranja
   */
  rlTo3D(rlX, rlY, rlZ) {
    return new THREE.Vector3(rlY, rlZ, rlX);
  }

  build3DStadium() {
    // 1. Suelo del estadio (10240 de largo en eje X, 8192 de ancho en eje Z)
    const floorGeo = new THREE.PlaneGeometry(10240, 8192);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x162032,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Mitad Azul y Mitad Naranja sutiles en el suelo
    const blueHalf = new THREE.Mesh(
      new THREE.PlaneGeometry(5120, 8192),
      new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.08 })
    );
    blueHalf.rotation.x = -Math.PI / 2;
    blueHalf.position.set(-2560, 2, 0);
    this.scene.add(blueHalf);

    const orangeHalf = new THREE.Mesh(
      new THREE.PlaneGeometry(5120, 8192),
      new THREE.MeshBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.08 })
    );
    orangeHalf.rotation.x = -Math.PI / 2;
    orangeHalf.position.set(2560, 2, 0);
    this.scene.add(orangeHalf);

    // Línea central y círculo central
    const lineMat = new THREE.LineBasicMaterial({ color: 0x475569 });
    const midLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 5, -4096),
      new THREE.Vector3(0, 5, 4096),
    ]);
    this.scene.add(new THREE.Line(midLineGeo, lineMat));

    const ringGeo = new THREE.RingGeometry(1130, 1155, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x475569, side: THREE.DoubleSide });
    const centerRing = new THREE.Mesh(ringGeo, ringMat);
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 5;
    this.scene.add(centerRing);

    // Contorno de paredes del estadio y techo (Altura = 2044)
    const WALL_H = 2044;
    const CHAMFER = 1152;
    const X_MAX = 5120;
    const Z_MAX = 4096;

    const perimeterPts = [
      new THREE.Vector3(-X_MAX, 0, -Z_MAX + CHAMFER),
      new THREE.Vector3(-X_MAX + CHAMFER, 0, -Z_MAX),
      new THREE.Vector3(X_MAX - CHAMFER, 0, -Z_MAX),
      new THREE.Vector3(X_MAX, 0, -Z_MAX + CHAMFER),
      new THREE.Vector3(X_MAX, 0, Z_MAX - CHAMFER),
      new THREE.Vector3(X_MAX - CHAMFER, 0, Z_MAX),
      new THREE.Vector3(-X_MAX + CHAMFER, 0, Z_MAX),
      new THREE.Vector3(-X_MAX, 0, Z_MAX - CHAMFER),
      new THREE.Vector3(-X_MAX, 0, -Z_MAX + CHAMFER),
    ];

    const floorBorderMat = new THREE.LineBasicMaterial({ color: 0x64748b });
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(perimeterPts), floorBorderMat));

    const roofPts = perimeterPts.map(pt => new THREE.Vector3(pt.x, WALL_H, pt.z));
    const roofBorderMat = new THREE.LineBasicMaterial({ color: 0x334155 });
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(roofPts), roofBorderMat));

    // Postes verticales en cada esquina achaflanada
    for (let i = 0; i < perimeterPts.length - 1; i++) {
      const colGeo = new THREE.BufferGeometry().setFromPoints([perimeterPts[i], roofPts[i]]);
      this.scene.add(new THREE.Line(colGeo, roofBorderMat));
    }

    // Portería Azul (X = -5120, ancho = 1786, alto = 642, fondo = 880)
    const blueGoalGeo = new THREE.BoxGeometry(880, 642, 1786);
    const blueGoalMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      wireframe: false,
    });
    const blueGoal = new THREE.Mesh(blueGoalGeo, blueGoalMat);
    blueGoal.position.set(-5120 - 440, 321, 0);
    this.scene.add(blueGoal);
    const blueGoalEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(blueGoalGeo),
      new THREE.LineBasicMaterial({ color: 0x38bdf8 })
    );
    blueGoalEdges.position.copy(blueGoal.position);
    this.scene.add(blueGoalEdges);

    // Portería Naranja (X = +5120)
    const orangeGoalMat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0.18,
    });
    const orangeGoal = new THREE.Mesh(blueGoalGeo, orangeGoalMat);
    orangeGoal.position.set(5120 + 440, 321, 0);
    this.scene.add(orangeGoal);
    const orangeGoalEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(blueGoalGeo),
      new THREE.LineBasicMaterial({ color: 0xfb923c })
    );
    orangeGoalEdges.position.copy(orangeGoal.position);
    this.scene.add(orangeGoalEdges);

    // Las 34 pastillas de turbo en 3D
    const bigPadGeo = new THREE.CylinderGeometry(85, 85, 28, 20);
    const bigPadMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xca8a04,
      emissiveIntensity: 0.45,
    });
    const smallPadGeo = new THREE.CylinderGeometry(45, 45, 14, 16);
    const smallPadMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
    });

    for (const pad of BOOST_PADS) {
      const isBig = pad.type === 'big';
      const mesh = new THREE.Mesh(isBig ? bigPadGeo : smallPadGeo, isBig ? bigPadMat : smallPadMat);
      mesh.position.set(pad.y, isBig ? 14 : 7, pad.x);
      this.scene.add(mesh);
    }

    // Balón 3D (Radio real en RL = 92.75 uu)
    const ballGeo = new THREE.SphereGeometry(93, 28, 28);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.2,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.scene.add(this.ballMesh);

    // Sombra circular del balón sobre el césped para percibir la altura fácilmente
    const shadowGeo = new THREE.CircleGeometry(95, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
    });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 4;
    this.scene.add(this.ballShadow);

    // Línea vertical desde el suelo hasta el balón cuando está en el aire
    const heightLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 100, 0),
    ]);
    this.ballHeightLine = new THREE.Line(
      heightLineGeo,
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 })
    );
    this.scene.add(this.ballHeightLine);
  }

  rebuild3DCars() {
    if (!this.scene) return;
    for (const cg of this.carGroups) {
      this.scene.remove(cg.group);
    }
    this.carGroups = [];

    this.players.forEach((p, idx) => {
      const colorHex = this.getPlayerColorHex(idx);
      const group = new THREE.Group();

      // Chasis principal tipo Octane (Largo = 128, Alto = 38, Ancho = 84)
      const bodyGeo = new THREE.BoxGeometry(128, 36, 84);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.35,
        metalness: 0.25,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = 18;
      group.add(bodyMesh);

      // Cabina superior
      const cabinGeo = new THREE.BoxGeometry(66, 24, 68);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
      const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
      cabinMesh.position.set(-8, 42, 0);
      group.add(cabinMesh);

      // Llama de turbo trasera
      const flameGeo = new THREE.ConeGeometry(22, 75, 12);
      flameGeo.rotateZ(Math.PI / 2);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(-95, 18, 0);
      flameMesh.visible = false;
      group.add(flameMesh);

      // Sprite con el nombre del jugador y su % de turbo flotando encima
      const spriteCanvas = document.createElement('canvas');
      spriteCanvas.width = 256;
      spriteCanvas.height = 64;
      const sTex = new THREE.CanvasTexture(spriteCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: sTex, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(420, 105, 1);
      sprite.position.set(0, 145, 0);
      group.add(sprite);

      this.scene.add(group);
      this.carGroups.push({
        group,
        flameMesh,
        spriteCanvas,
        spriteCtx: spriteCanvas.getContext('2d'),
        spriteTex: sTex,
        lastBoostText: '',
        playerName: p.name,
        colorHex,
      });
    });
  }

  updateCarSprite(cg, boostPct) {
    const key = `${cg.playerName}:${boostPct}`;
    if (cg.lastBoostText === key) return;
    cg.lastBoostText = key;

    const ctx = cg.spriteCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Pastilla de fondo
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = cg.colorHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cg.playerName.slice(0, 12), 20, 32);

    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillStyle = boostPct > 25 ? '#facc15' : '#fb7185';
    ctx.textAlign = 'right';
    ctx.fillText(`${boostPct}%`, 236, 32);

    cg.spriteTex.needsUpdate = true;
  }

  render3D(state) {
    this.ensure3DInitialized();
    if (!this.scene || !this.renderer) return;

    // 1. Posicionar Balón
    const bPos = this.rlTo3D(state.ball.x, state.ball.y, state.ball.z);
    this.ballMesh.position.copy(bPos);
    this.ballShadow.position.set(bPos.x, 4, bPos.z);
    const shadowScale = Math.max(0.35, 1 - (bPos.y - 93) / 2200);
    this.ballShadow.scale.set(shadowScale, shadowScale, 1);

    const hPos = this.ballHeightLine.geometry.attributes.position;
    hPos.setXYZ(0, bPos.x, 4, bPos.z);
    hPos.setXYZ(1, bPos.x, Math.max(4, bPos.y - 90), bPos.z);
    hPos.needsUpdate = true;

    // 2. Posicionar y orientar los Coches
    state.cars.forEach((car, i) => {
      const cg = this.carGroups[i];
      if (!cg) return;

      const cPos = this.rlTo3D(car.x, car.y, car.z);
      cg.group.position.copy(cPos);

      // En nuestra convención 3D: X = rlY, Z = rlX
      const yaw3D = Math.atan2(-Math.cos(car.heading), Math.sin(car.heading));
      cg.group.rotation.set(car.rx * 0.4, yaw3D, car.ry * 0.4);

      cg.flameMesh.visible = car.speedKmh > 62;
      this.updateCarSprite(cg, car.boostPct);
    });

    // 3. Actualizar cámara según el modo seleccionado
    if (this.cameraMode === 'ballcam') {
      // Cámara de retransmisión siguiendo el balón suavemente
      const targetCamPos = new THREE.Vector3(bPos.x * 0.55, 2200 + bPos.y * 0.4, -5200);
      this.camera.position.lerp(targetCamPos, 0.08);
      this.camera.lookAt(bPos.x, bPos.y * 0.6, bPos.z * 0.6);
    } else if (this.cameraMode.startsWith('pov:')) {
      const pIdx = Number(this.cameraMode.split(':')[1]) || 0;
      const car = state.cars[pIdx];
      if (car) {
        const cPos = this.rlTo3D(car.x, car.y, car.z);
        // Vector hacia el balón (Ball Cam de jugador en Rocket League)
        const toBall = new THREE.Vector3().subVectors(bPos, cPos);
        toBall.y = 0;
        if (toBall.lengthSq() < 10) toBall.set(1, 0, 0);
        toBall.normalize();

        const camPos = cPos
          .clone()
          .sub(toBall.clone().multiplyScalar(340))
          .add(new THREE.Vector3(0, 145, 0));
        this.camera.position.lerp(camPos, 0.25);
        this.camera.lookAt(bPos.x, Math.max(110, bPos.y), bPos.z);
      }
    } else if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateLiveTelemetryCards(state) {
    const container = document.getElementById('playerLiveTelemetry');
    if (!container) return;

    let html = `
      <div class="live-ball-box">
        <span class="toolbar-label">Balón en vivo:</span>
        <span class="mono" style="color: var(--text-main); font-weight: 600;">${state.ball.speedKmh} km/h</span>
        <span class="dot-sep">·</span>
        <span class="mono" style="color: var(--text-muted);">Altura: ${Math.max(0, Math.round((state.ball.z - 93) / 100))} m</span>
      </div>
    `;

    state.cars.forEach((car, i) => {
      const p = this.players[i];
      if (!p) return;
      const col = this.getPlayerColorHex(i);
      html += `
        <div class="live-car-card" style="border-left: 3px solid ${col};">
          <div class="live-car-top">
            <span class="live-car-name">${p.name}</span>
            <span class="mono live-car-spd">${car.speedKmh} km/h</span>
          </div>
          <div class="live-boost-row">
            <div class="live-boost-track">
              <div class="live-boost-fill" style="width: ${Math.min(100, car.boostPct)}%; background: ${
                car.boostPct > 25 ? '#eab308' : '#f43f5e'
              };"></div>
            </div>
            <span class="mono live-boost-txt">${car.boostPct}%</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }
}


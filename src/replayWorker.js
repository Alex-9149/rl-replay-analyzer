import init, {
  get_stats_timeline_json,
  get_ndarray_with_info,
} from '@rlrml/subtr-actor';
import { BOOST_PADS, getReadableMapName, uusToKmh, rawBoostToPct } from './constants.js';

let wasmReady = false;

async function ensureWasm() {
  if (!wasmReady) {
    try {
      await init();
    } catch {
      const wasmUrl = new URL('../rl_replay_subtr_actor_bg.wasm', self.location.href);
      await init({ module_or_path: wasmUrl });
    }
    wasmReady = true;
  }
}

function getPlayerKey(idObj) {
  if (!idObj) return 'unknown';
  if (typeof idObj === 'string') return idObj;
  const k = Object.keys(idObj)[0];
  return k ? `${k}:${idObj[k]}` : JSON.stringify(idObj);
}

function getPlatformName(idObj) {
  if (!idObj || typeof idObj !== 'object') return 'Epic';
  const k = Object.keys(idObj)[0] || '';
  if (k.toLowerCase().includes('steam')) return 'Steam';
  if (k.toLowerCase().includes('ps')) return 'PlayStation';
  if (k.toLowerCase().includes('xbox')) return 'Xbox';
  if (k.toLowerCase().includes('switch') || k.toLowerCase().includes('nintendo')) return 'Switch';
  return 'Epic Games';
}

function matchClosestPad(px, py, padType) {
  const candidates = BOOST_PADS.filter(p => p.type === padType);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const pad of candidates) {
    const d = Math.hypot(pad.x - px, pad.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = pad;
    }
  }
  return best;
}

self.onmessage = async (e) => {
  const { arrayBuffer, fileName } = e.data;
  try {
    self.postMessage({ type: 'progress', step: 'Inicializando motor WebAssembly (Rust / Boxcars)...', pct: 12 });
    await ensureWasm();

    const replayBytes = new Uint8Array(arrayBuffer);

    self.postMessage({ type: 'progress', step: 'Decodificando fotogramas de red y eventos del partido...', pct: 35 });
    const timelineBytes = get_stats_timeline_json(replayBytes, true);
    const decoder = new TextDecoder('utf-8');
    const timeline = JSON.parse(decoder.decode(timelineBytes));

    self.postMessage({ type: 'progress', step: 'Extrayendo telemetría física de alta frecuencia (30Hz)...', pct: 68 });
    const nd = get_ndarray_with_info(
      replayBytes,
      ['BallRigidBody', 'SecondsRemaining', 'CurrentTime'],
      ['PlayerRigidBody', 'PlayerBoost'],
      30.0
    );

    self.postMessage({ type: 'progress', step: 'Calculando métricas avanzadas de jugadores, turbos y mapas...', pct: 88 });
    const analysis = buildFullAnalysis(timeline, nd, fileName);

    self.postMessage({ type: 'done', analysis });
  } catch (err) {
    console.error('Error parsing replay in worker:', err);
    self.postMessage({
      type: 'error',
      message: err?.message || String(err),
    });
  }
};

function buildFullAnalysis(timeline, nd, fileName) {
  const headersMap = {};
  for (const [k, v] of timeline.replay_meta?.all_headers || []) {
    headersMap[k] = v;
  }

  // Extract nd.metadata.replay_meta for rich PlayerStats header
  const ndMeta = nd?.metadata?.replay_meta || {};
  const ndHeadersMap = {};
  for (const [k, v] of ndMeta.all_headers || []) {
    ndHeadersMap[k] = v;
  }

  const team0Score = ndHeadersMap.Team0Score ?? headersMap.Team0Score ?? 0;
  const team1Score = ndHeadersMap.Team1Score ?? headersMap.Team1Score ?? 0;
  const livePlaySeconds = timeline.activity_summary?.live_play_seconds || headersMap.TotalSecondsPlayed || 300;
  const totalMatchMinutes = Math.max(0.5, livePlaySeconds / 60);

  // Ordered players list matching get_ndarray_with_info columns: team_zero then team_one
  const rawPlayers = [
    ...(ndMeta.team_zero || timeline.replay_meta?.team_zero || []).map(p => ({ ...p, team: 0 })),
    ...(ndMeta.team_one || timeline.replay_meta?.team_one || []).map(p => ({ ...p, team: 1 })),
  ];

  const playersByKey = {};
  const players = rawPlayers.map((rp, idx) => {
    const key = getPlayerKey(rp.remote_id);
    const hStats = rp.stats || {};
    const score = hStats.Score ?? 0;
    const goals = hStats.Goals ?? 0;
    const assists = hStats.Assists ?? 0;
    const saves = hStats.Saves ?? 0;
    const shots = hStats.Shots ?? 0;

    const pObj = {
      index: idx,
      key,
      name: rp.name || hStats.Name || `Jugador ${idx + 1}`,
      team: rp.team, // 0 = Blue, 1 = Orange
      platform: getPlatformName(rp.remote_id),
      carHitbox: rp.car_hitbox_family || 'Octane',
      camera: rp.camera_settings || {},
      // Core Combat Stats
      score,
      goals,
      assists,
      saves,
      shots,
      shootingPct: shots > 0 ? (goals / shots) * 100 : 0,
      isMvp: false,
      demosInflicted: 0,
      demosTaken: 0,
      bumpsInflicted: 0,
      bumpsTaken: 0,
      touches: 0,
      aerialTouches: 0,
      passes: 0,
      centers: 0,
      whiffs: 0,
      speedFlips: 0,
      wavedashes: 0,
      powerslides: 0,
      powerslideDuration: 0,

      // Boost / Turbo Metrics
      boostUsed: 0,
      boostCollected: 0,
      boostOverfill: 0, // Turbo perdido (sobrante)
      boostStolen: 0,
      boostUsedAirborne: 0,
      boostUsedGrounded: 0,
      boostUsedSupersonic: 0,
      bpm: 0,
      avgBoost: 0,
      timeZeroBoostSec: 0,
      timeFullBoostSec: 0,
      pctZeroBoost: 0,
      pctFullBoost: 0,
      bigPadsCollected: 0,
      smallPadsCollected: 0,
      bigPadsStolen: 0,
      smallPadsStolen: 0,
      padPickupsById: {}, // padId (0..33) -> { count, collected, wasted, steals }
      boostPickupEvents: [],

      // Speed & Movement Metrics
      totalDistanceUu: 0,
      totalDistanceMeters: 0,
      avgSpeedUus: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      speedBucketsSec: { slow: 0, boost: 0, supersonic: 0 },
      heightBucketsSec: { ground: 0, low_air: 0, high_air: 0 },

      // Positioning & Rotation Metrics
      fieldHalfSec: { defensive: 0, offensive: 0 },
      fieldThirdSec: { defensive: 0, neutral: 0, offensive: 0 },
      ballDepthSec: { behind_ball: 0, level_with_ball: 0, ahead_of_ball: 0 },
      depthRoleSec: { most_back: 0, most_forward: 0, other: 0 },
      rotationRoleSec: { first_man: 0, second_man: 0, ambiguous: 0 },
      closestToBallSec: 0,
      farthestFromBallSec: 0,
      shadowDefenseSec: 0,
      possessionSec: 0,
      avgDistToBallMeters: 0,
      avgDistToMateMeters: 0,

      // Spatial Telemetry for Heatmaps (sampled at 10Hz)
      positions: [], // { x, y, z, speedKmh, boostPct, ballY }
    };

    for (const pad of BOOST_PADS) {
      pObj.padPickupsById[pad.id] = {
        padId: pad.id,
        count: 0,
        collected: 0,
        wasted: 0,
        steals: 0,
      };
    }

    playersByKey[key] = pObj;
    return pObj;
  });

  // Determine MVP (highest score on winning team)
  const winningTeam = team0Score >= team1Score ? 0 : 1;
  const winners = players.filter(p => p.team === winningTeam);
  if (winners.length > 0) {
    const bestWinner = winners.reduce((a, b) => (b.score > a.score ? b : a), winners[0]);
    bestWinner.isMvp = true;
  }

  // Distance summary from positioning_summary
  for (const posSum of timeline.positioning_summary || []) {
    const p = playersByKey[getPlayerKey(posSum.player_id)];
    if (p && posSum.distance) {
      const totalTrackedTime = (posSum.distance.time_has_possession || 0) + (posSum.distance.time_no_possession || 0);
      if (totalTrackedTime > 0) {
        p.avgDistToBallMeters = (posSum.distance.sum_distance_to_ball / totalTrackedTime) / 100;
        p.avgDistToMateMeters = (posSum.distance.sum_distance_to_teammates / totalTrackedTime) / 100;
      }
      p.possessionSec = posSum.distance.time_has_possession || 0;
    }
  }

  // Accumulation tracks (final totals + time series for chart)
  const boostTimelineSeries = {}; // key -> [{ time, boostUsed, boostOverfill, boostAmount }]
  const frameToTime = {};
  for (const fr of timeline.frames || []) {
    frameToTime[fr.frame_number] = fr.time;
  }

  for (const track of timeline.accumulation_tracks || []) {
    const key = getPlayerKey(track.player_id);
    const p = playersByKey[key];
    if (!p || !track.points || track.points.length === 0) continue;
    const lastValPct = rawBoostToPct(track.points[track.points.length - 1].value);

    if (track.quantity === 'boost_used') {
      p.boostUsed = Math.round(lastValPct);
      // Downsample points for smooth chart
      const step = Math.max(1, Math.floor(track.points.length / 80));
      boostTimelineSeries[key] = track.points
        .filter((_, idx) => idx % step === 0 || idx === track.points.length - 1)
        .map(pt => ({
          frame: pt.frame,
          time: frameToTime[pt.frame] ?? (pt.frame / 30),
          value: Math.round(rawBoostToPct(pt.value)),
        }));
    } else if (track.quantity === 'boost_collected') {
      p.boostCollected = Math.round(lastValPct);
    } else if (track.quantity === 'boost_overfill') {
      p.boostOverfill = Math.round(lastValPct);
    } else if (track.quantity === 'boost_stolen') {
      p.boostStolen = Math.round(lastValPct);
    } else if (track.quantity === 'boost_used_airborne') {
      p.boostUsedAirborne = Math.round(lastValPct);
    } else if (track.quantity === 'boost_used_grounded') {
      p.boostUsedGrounded = Math.round(lastValPct);
    } else if (track.quantity === 'boost_used_supersonic') {
      p.boostUsedSupersonic = Math.round(lastValPct);
    }
  }

  // Timeline match events list (Goals, Saves, Shots, Demos, Assists)
  const matchEvents = [];
  const goalsContextByFrame = {};

  for (const ev of timeline.events?.events || []) {
    const kind = ev.payload?.kind;
    const data = ev.payload?.payload;
    if (!data) continue;

    if (kind === 'goal_context') {
      goalsContextByFrame[data.frame] = data;
    }
  }

  // Process all events from timeline.events.events
  for (const ev of timeline.events?.events || []) {
    const kind = ev.payload?.kind;
    const data = ev.payload?.payload;
    if (!data) continue;

    if (kind === 'boost_pickup') {
      const p = playersByKey[getPlayerKey(data.player_id)];
      if (!p) continue;

      const boostBeforePct = rawBoostToPct(data.boost_before);
      const boostAfterPct = rawBoostToPct(data.boost_after);
      const nominalValue = data.pad_type === 'big' ? 100 : 12;

      // Exact calculation requested by user:
      // E.g. if player has 40 boost and picks up a 100 pad, gained is 60 and wasted (lost) is 40.
      const gainedPct = Math.max(0, Math.min(100 - boostBeforePct, nominalValue));
      const wastedPct = Math.max(0, nominalValue - gainedPct);

      if (data.pad_type === 'big') {
        p.bigPadsCollected += 1;
        if (data.is_steal) p.bigPadsStolen += 1;
      } else {
        p.smallPadsCollected += 1;
        if (data.is_steal) p.smallPadsStolen += 1;
      }

      const [px, py] = data.player_position || [0, 0];
      const matchedPad = matchClosestPad(px, py, data.pad_type);
      if (matchedPad) {
        const slot = p.padPickupsById[matchedPad.id];
        slot.count += 1;
        slot.collected += gainedPct;
        slot.wasted += wastedPct;
        if (data.is_steal) slot.steals += 1;
      }

      p.boostPickupEvents.push({
        time: data.time,
        frame: data.frame,
        padId: matchedPad ? matchedPad.id : 0,
        padType: data.pad_type,
        isSteal: !!data.is_steal,
        boostBefore: Math.round(boostBeforePct),
        boostAfter: Math.round(boostAfterPct),
        gained: Math.round(gainedPct),
        wasted: Math.round(wastedPct),
      });
    } else if (kind === 'demolition') {
      const attacker = playersByKey[getPlayerKey(data.attacker)];
      const victim = playersByKey[getPlayerKey(data.victim)];
      if (attacker) attacker.demosInflicted += 1;
      if (victim) victim.demosTaken += 1;

      matchEvents.push({
        type: 'Demo',
        time: data.time,
        frame: data.frame,
        playerKey: attacker?.key,
        playerName: attacker?.name || 'Jugador',
        secondaryName: victim?.name || 'Rival',
        team: attacker ? attacker.team : (data.attacker_is_team_0 ? 0 : 1),
        detail: `${attacker?.name || 'Jugador'} demolió a ${victim?.name || 'Rival'}`,
      });
    } else if (kind === 'bump') {
      if (!data.is_team_bump) {
        const initiator = playersByKey[getPlayerKey(data.initiator)];
        const victim = playersByKey[getPlayerKey(data.victim)];
        if (initiator) initiator.bumpsInflicted += 1;
        if (victim) victim.bumpsTaken += 1;
      }
    } else if (kind === 'touch') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) {
        p.touches += 1;
        const z = data.player_position?.[2] || 0;
        if (z > 180) p.aerialTouches += 1;
      }
    } else if (kind === 'pass') {
      const p = playersByKey[getPlayerKey(data.passer || data.player)];
      if (p) p.passes += 1;
    } else if (kind === 'center') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) p.centers += 1;
    } else if (kind === 'whiff') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) p.whiffs += 1;
    } else if (kind === 'speed_flip') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) p.speedFlips += 1;
    } else if (kind === 'wavedash') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) p.wavedashes += 1;
    } else if (kind === 'powerslide') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) {
        p.powerslides += 1;
        p.powerslideDuration += data.duration || 0;
      }
    } else if (kind === 'movement') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) {
        const dt = data.dt || 0;
        const dist = data.distance || 0;
        p.totalDistanceUu += dist;
        if (data.speed_band && p.speedBucketsSec[data.speed_band] !== undefined) {
          p.speedBucketsSec[data.speed_band] += dt;
        }
        if (data.height_band && p.heightBucketsSec[data.height_band] !== undefined) {
          p.heightBucketsSec[data.height_band] += dt;
        }
        const spdKmh = uusToKmh(data.speed || 0);
        if (spdKmh > p.maxSpeedKmh && spdKmh <= 85) {
          p.maxSpeedKmh = spdKmh;
        }
      }
    } else if (kind === 'field_half') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && p.fieldHalfSec[data.state] !== undefined) {
        p.fieldHalfSec[data.state] += data.duration || 0;
      }
    } else if (kind === 'field_third') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && p.fieldThirdSec[data.state] !== undefined) {
        p.fieldThirdSec[data.state] += data.duration || 0;
      }
    } else if (kind === 'ball_depth') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && p.ballDepthSec[data.state] !== undefined) {
        p.ballDepthSec[data.state] += data.duration || 0;
      }
    } else if (kind === 'depth_role') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && p.depthRoleSec[data.state] !== undefined) {
        p.depthRoleSec[data.state] += data.duration || 0;
      }
    } else if (kind === 'rotation_role') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && p.rotationRoleSec[data.state] !== undefined) {
        p.rotationRoleSec[data.state] += data.duration || 0;
      }
    } else if (kind === 'ball_proximity') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p && data.state) {
        const dur = data.duration || 0;
        if (data.state.closest_to_ball_team) p.closestToBallSec += dur;
        if (data.state.farthest_from_ball) p.farthestFromBallSec += dur;
      }
    } else if (kind === 'shadow_defense') {
      const p = playersByKey[getPlayerKey(data.player)];
      if (p) p.shadowDefenseSec += data.duration || 0;
    } else if (kind === 'timeline') {
      const p = playersByKey[getPlayerKey(data.player_id)];
      const evType = data.kind; // 'Goal', 'Save', 'Shot', 'Assist'
      let detail = `${p?.name || 'Jugador'} — ${evType}`;
      let goalSpeedKmh = null;

      if (evType === 'Goal') {
        // Look for nearby goal_context
        const nearFrame = Object.keys(goalsContextByFrame).find(
          f => Math.abs(Number(f) - data.frame) <= 15
        );
        if (nearFrame) {
          const gc = goalsContextByFrame[nearFrame];
          goalSpeedKmh = Math.round(uusToKmh(gc.ball_speed_at_goal || 0));
          detail = `¡GOL de ${p?.name || 'Jugador'}! (${goalSpeedKmh} km/h)`;
        } else {
          detail = `¡GOL de ${p?.name || 'Jugador'}!`;
        }
      } else if (evType === 'Save') {
        detail = `Salvada de ${p?.name || 'Jugador'}`;
      } else if (evType === 'Shot') {
        detail = `Tiro a puerta de ${p?.name || 'Jugador'}`;
      } else if (evType === 'Assist') {
        detail = `Asistencia de ${p?.name || 'Jugador'}`;
      }

      matchEvents.push({
        type: evType,
        time: data.time,
        frame: data.frame,
        playerKey: p?.key,
        playerName: p?.name || 'Jugador',
        team: p ? p.team : (data.is_team_0 ? 0 : 1),
        goalSpeedKmh,
        detail,
      });
    }
  }

  // Sort matchEvents chronologically
  matchEvents.sort((a, b) => a.time - b.time);

  // Process 30Hz Spatial NDArray for smooth 2D/3D Replay Player, Heatmaps, Avg Boost, and Avg Speed
  const rows = nd?.array_data || [];
  const globalHeaders = nd?.metadata?.column_headers?.global_headers || [];
  const hasCurrentTime = globalHeaders.length >= 14;
  const basePlayerOffset = hasCurrentTime ? 14 : 13;
  const numPlayers = players.length;

  const replaySamples = [];
  let firstSampleTime = null;
  const prevHeadings = new Array(numPlayers).fill(0);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < basePlayerOffset + numPlayers * 13) continue;

    const ballX = row[0] || 0;
    const ballY = row[1] || 0;
    const ballZ = row[2] || 93;
    const ballVx = row[6] || 0;
    const ballVy = row[7] || 0;
    const ballVz = row[8] || 0;
    const secRem = Math.max(0, Math.round(row[12] || 0));
    const rawTime = hasCurrentTime ? row[13] : r / 30;
    if (firstSampleTime === null) firstSampleTime = rawTime;
    const relTime = Math.max(0, Math.round((rawTime - firstSampleTime) * 1000) / 1000);

    const framePlayers = [];

    for (let i = 0; i < numPlayers; i++) {
      const base = basePlayerOffset + i * 13;
      const px = row[base + 0];
      const py = row[base + 1];
      const pz = row[base + 2];
      const rx = row[base + 3] || 0;
      const ry = row[base + 4] || 0;
      const rz = row[base + 5] || 0;
      const vx = row[base + 6] || 0;
      const vy = row[base + 7] || 0;
      const vz = row[base + 8] || 0;
      const rawBoost = row[base + 12] || 0;

      const validPos = !Number.isNaN(px) && !Number.isNaN(py);
      const safeX = validPos ? Math.round(px * 10) / 10 : 0;
      const safeY = validPos ? Math.round(py * 10) / 10 : 0;
      const safeZ = validPos ? Math.round(pz * 10) / 10 : 17;

      const speedUus = Math.hypot(vx, vy, vz);
      const speedKmh = Math.round(uusToKmh(speedUus) * 10) / 10;
      const boostPct = Math.round(rawBoostToPct(rawBoost));

      // Heading angle in XY plane from velocity (preserving last heading when car slows down)
      const horizSpeed = Math.hypot(vx, vy);
      let heading = prevHeadings[i];
      if (horizSpeed > 35) {
        heading = Math.atan2(vy, vx);
        prevHeadings[i] = heading;
      }

      framePlayers.push({
        x: safeX,
        y: safeY,
        z: safeZ,
        rx: Math.round(rx * 100) / 100,
        ry: Math.round(ry * 100) / 100,
        rz: Math.round(rz * 100) / 100,
        vx: Math.round(vx),
        vy: Math.round(vy),
        vz: Math.round(vz),
        heading: Math.round(heading * 1000) / 1000,
        speedKmh,
        boostPct,
      });

      // Subsample at ~10Hz (every 3rd frame) for 2D KDE Heatmaps to keep heatmap rendering instantaneous
      if (validPos && r % 3 === 0) {
        players[i].positions.push({
          x: Math.round(safeX),
          y: Math.round(safeY),
          z: Math.round(safeZ),
          speedKmh,
          boostPct,
          ballX: Math.round(ballX),
          ballY: Math.round(ballY),
        });
      }
    }

    replaySamples.push({
      t: relTime,
      clock: secRem,
      ball: {
        x: Math.round(ballX * 10) / 10,
        y: Math.round(ballY * 10) / 10,
        z: Math.round(ballZ * 10) / 10,
        vx: Math.round(ballVx),
        vy: Math.round(ballVy),
        vz: Math.round(ballVz),
        speedKmh: Math.round(uusToKmh(Math.hypot(ballVx, ballVy, ballVz))),
      },
      cars: framePlayers,
    });
  }

  // Smooth step-wise network replicated coordinates using velocity-aware keyframe interpolation
  smoothNetworkKeyframes(replaySamples, numPlayers);

  // Finalize per-player derived percentages and averages
  for (const p of players) {
    // Reconcile wasted boost with sum of pad pickup wasted + subtr-actor overfill
    const sumPadWasted = Math.round(
      Object.values(p.padPickupsById).reduce((acc, s) => acc + s.wasted, 0)
    );
    if (sumPadWasted > p.boostOverfill) {
      p.boostOverfill = sumPadWasted;
    }

    p.bpm = Math.round(p.boostUsed / totalMatchMinutes);

    // Speed & Distance finalization
    const totalMoveTime =
      p.speedBucketsSec.slow + p.speedBucketsSec.boost + p.speedBucketsSec.supersonic;
    if (totalMoveTime > 0) {
      p.avgSpeedUus = p.totalDistanceUu / totalMoveTime;
      p.avgSpeedKmh = Math.round(uusToKmh(p.avgSpeedUus) * 10) / 10;
    } else if (p.positions.length > 0) {
      const sumSpd = p.positions.reduce((acc, pt) => acc + pt.speedKmh, 0);
      p.avgSpeedKmh = Math.round((sumSpd / p.positions.length) * 10) / 10;
    }
    p.totalDistanceMeters = Math.round(p.totalDistanceUu / 100);
    p.maxSpeedKmh = Math.round((p.maxSpeedKmh || 82.8) * 10) / 10;

    // Boost average and time at 0% / 100% from 10Hz samples
    if (p.positions.length > 0) {
      const sampleDt = livePlaySeconds / p.positions.length;
      let sumBoost = 0;
      let zeroCount = 0;
      let fullCount = 0;
      for (const pt of p.positions) {
        sumBoost += pt.boostPct;
        if (pt.boostPct < 1.5) zeroCount++;
        if (pt.boostPct > 98.5) fullCount++;
      }
      p.avgBoost = Math.round((sumBoost / p.positions.length) * 10) / 10;
      p.pctZeroBoost = Math.round((zeroCount / p.positions.length) * 1000) / 10;
      p.pctFullBoost = Math.round((fullCount / p.positions.length) * 1000) / 10;
      p.timeZeroBoostSec = Math.round(zeroCount * sampleDt * 10) / 10;
      p.timeFullBoostSec = Math.round(fullCount * sampleDt * 10) / 10;
    }

    // Percentage helpers
    const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

    const spdTotal = p.speedBucketsSec.slow + p.speedBucketsSec.boost + p.speedBucketsSec.supersonic;
    p.speedPct = {
      slow: pct(p.speedBucketsSec.slow, spdTotal),
      boost: pct(p.speedBucketsSec.boost, spdTotal),
      supersonic: pct(p.speedBucketsSec.supersonic, spdTotal),
    };

    const hTotal = p.heightBucketsSec.ground + p.heightBucketsSec.low_air + p.heightBucketsSec.high_air;
    p.heightPct = {
      ground: pct(p.heightBucketsSec.ground, hTotal),
      low_air: pct(p.heightBucketsSec.low_air, hTotal),
      high_air: pct(p.heightBucketsSec.high_air, hTotal),
    };

    const halfTotal = p.fieldHalfSec.defensive + p.fieldHalfSec.offensive;
    p.fieldHalfPct = {
      defensive: pct(p.fieldHalfSec.defensive, halfTotal),
      offensive: pct(p.fieldHalfSec.offensive, halfTotal),
    };

    const thirdTotal = p.fieldThirdSec.defensive + p.fieldThirdSec.neutral + p.fieldThirdSec.offensive;
    p.fieldThirdPct = {
      defensive: pct(p.fieldThirdSec.defensive, thirdTotal),
      neutral: pct(p.fieldThirdSec.neutral, thirdTotal),
      offensive: pct(p.fieldThirdSec.offensive, thirdTotal),
    };

    const depthTotal = p.ballDepthSec.behind_ball + p.ballDepthSec.level_with_ball + p.ballDepthSec.ahead_of_ball;
    p.ballDepthPct = {
      behind: pct(p.ballDepthSec.behind_ball, depthTotal),
      level: pct(p.ballDepthSec.level_with_ball, depthTotal),
      ahead: pct(p.ballDepthSec.ahead_of_ball, depthTotal),
    };

    const roleTotal = p.depthRoleSec.most_back + p.depthRoleSec.most_forward + p.depthRoleSec.other;
    p.depthRolePct = {
      mostBack: pct(p.depthRoleSec.most_back, roleTotal),
      mostForward: pct(p.depthRoleSec.most_forward, roleTotal),
    };
  }

  return {
    meta: {
      fileName: fileName || 'replay.replay',
      replayName: ndHeadersMap.ReplayName || headersMap.ReplayName || 'Partida de Rocket League',
      mapRaw: ndHeadersMap.MapName || headersMap.MapName || 'stadium_day_p',
      mapName: getReadableMapName(ndHeadersMap.MapName || headersMap.MapName),
      date: ndHeadersMap.Date || headersMap.Date || 'Fecha desconocida',
      teamSize: ndHeadersMap.TeamSize || headersMap.TeamSize || 2,
      modeLabel: `${ndHeadersMap.TeamSize || 2}v${ndHeadersMap.TeamSize || 2} ${timeline.replay_meta?.game_type?.game_type || 'Online'}`,
      forfeit: !!(ndHeadersMap.bForfeit ?? headersMap.bForfeit),
      team0Score,
      team1Score,
      livePlaySeconds: Math.round(livePlaySeconds),
      totalDurationSeconds: Math.round(timeline.frames?.[timeline.frames.length - 1]?.time || livePlaySeconds),
      numFrames: ndHeadersMap.NumFrames || headersMap.NumFrames || timeline.frames?.length || 0,
      recordFps: Math.round(ndHeadersMap.RecordFPS || headersMap.RecordFPS || 30),
      buildVersion: ndHeadersMap.BuildVersion || headersMap.BuildVersion || '',
      replayId: ndHeadersMap.Id || headersMap.Id || '',
    },
    players,
    matchEvents,
    boostTimelineSeries,
    replaySamples,
  };
}

/**
 * Rocket League network actors only replicate position updates when needed (often every 2-4 frames),
 * causing raw sampled arrays to hold identical coordinates for 2-3 frames and then jump.
 * This function detects those flat plateau frames and smoothly interpolates between true network updates.
 */
function smoothNetworkKeyframes(samples, numPlayers) {
  const n = samples.length;
  if (n < 3) return;

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  // 1. Smooth Ball trajectory across flat replication steps
  let lastChange = 0;
  for (let i = 1; i < n; i++) {
    const bPrev = samples[lastChange].ball;
    const bCur = samples[i].ball;
    const moved =
      Math.abs(bCur.x - bPrev.x) > 0.2 ||
      Math.abs(bCur.y - bPrev.y) > 0.2 ||
      Math.abs(bCur.z - bPrev.z) > 0.2;

    if (moved || i === n - 1) {
      const gap = i - lastChange;
      const dist = Math.hypot(bCur.x - bPrev.x, bCur.y - bPrev.y);
      // Only interpolate if it's a short replication plateau (<= 8 frames) and not a goal/kickoff teleport
      if (gap > 1 && gap <= 8 && dist < 1600) {
        const t0 = samples[lastChange].t;
        const span = samples[i].t - t0;
        if (span > 0.0001) {
          for (let k = lastChange + 1; k < i; k++) {
            const alpha = (samples[k].t - t0) / span;
            samples[k].ball.x = Math.round(lerp(bPrev.x, bCur.x, alpha) * 10) / 10;
            samples[k].ball.y = Math.round(lerp(bPrev.y, bCur.y, alpha) * 10) / 10;
            samples[k].ball.z = Math.round(lerp(bPrev.z, bCur.z, alpha) * 10) / 10;
          }
        }
      }
      lastChange = i;
    }
  }

  // 2. Smooth each Car's trajectory and heading across flat replication steps
  for (let p = 0; p < numPlayers; p++) {
    let lastCarChange = 0;
    for (let i = 1; i < n; i++) {
      const cPrev = samples[lastCarChange].cars[p];
      const cCur = samples[i].cars[p];
      if (!cPrev || !cCur) continue;

      const moved =
        Math.abs(cCur.x - cPrev.x) > 0.2 ||
        Math.abs(cCur.y - cPrev.y) > 0.2 ||
        Math.abs(cCur.z - cPrev.z) > 0.2;

      if (moved || i === n - 1) {
        const gap = i - lastCarChange;
        const dist = Math.hypot(cCur.x - cPrev.x, cCur.y - cPrev.y);
        if (gap > 1 && gap <= 8 && dist < 1400) {
          const t0 = samples[lastCarChange].t;
          const span = samples[i].t - t0;
          if (span > 0.0001) {
            for (let k = lastCarChange + 1; k < i; k++) {
              const alpha = (samples[k].t - t0) / span;
              const cMid = samples[k].cars[p];
              cMid.x = Math.round(lerp(cPrev.x, cCur.x, alpha) * 10) / 10;
              cMid.y = Math.round(lerp(cPrev.y, cCur.y, alpha) * 10) / 10;
              cMid.z = Math.round(lerp(cPrev.z, cCur.z, alpha) * 10) / 10;
              cMid.rx = Math.round(lerpAngle(cPrev.rx, cCur.rx, alpha) * 100) / 100;
              cMid.ry = Math.round(lerpAngle(cPrev.ry, cCur.ry, alpha) * 100) / 100;
              cMid.rz = Math.round(lerpAngle(cPrev.rz, cCur.rz, alpha) * 100) / 100;
              cMid.heading = Math.round(lerpAngle(cPrev.heading, cCur.heading, alpha) * 1000) / 1000;
            }
          }
        }
        lastCarChange = i;
      }
    }
  }
}

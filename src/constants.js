/**
 * Coordenadas oficiales de las 34 pastillas de Turbo (Boost Pads) en un estadio estándar de Rocket League.
 * - Eje X: [-4096, 4096] (Izquierda a Derecha visto desde la portería Azul)
 * - Eje Y: [-5120, 5120] (Portería Azul en Y = -5120, Portería Naranja en Y = +5120)
 */
export const BOOST_PADS = [
  // 6 Pastillas Grandes (100% Boost)
  { id: 0, type: 'big', x: -3072, y: -4096, label: 'Esquina Defensiva Izq. (Azul)', zone: 'def_blue' },
  { id: 1, type: 'big', x: 3072, y: -4096, label: 'Esquina Defensiva Der. (Azul)', zone: 'def_blue' },
  { id: 2, type: 'big', x: -3584, y: 0, label: 'Medio Lateral Izquierdo', zone: 'mid' },
  { id: 3, type: 'big', x: 3584, y: 0, label: 'Medio Lateral Derecho', zone: 'mid' },
  { id: 4, type: 'big', x: -3072, y: 4096, label: 'Esquina Defensiva Izq. (Naranja)', zone: 'def_orange' },
  { id: 5, type: 'big', x: 3072, y: 4096, label: 'Esquina Defensiva Der. (Naranja)', zone: 'def_orange' },

  // 28 Pastillas Pequeñas (12% Boost)
  { id: 6, type: 'small', x: 0, y: -4240, label: 'Frente Portería Azul', zone: 'def_blue' },
  { id: 7, type: 'small', x: -1792, y: -4184, label: 'Fondo Izq. Azul', zone: 'def_blue' },
  { id: 8, type: 'small', x: 1792, y: -4184, label: 'Fondo Der. Azul', zone: 'def_blue' },
  { id: 9, type: 'small', x: -940, y: -3308, label: 'Área Interior Izq. Azul', zone: 'def_blue' },
  { id: 10, type: 'small', x: 940, y: -3308, label: 'Área Interior Der. Azul', zone: 'def_blue' },
  { id: 11, type: 'small', x: 0, y: -2816, label: 'Eje Central Defensivo Azul', zone: 'def_blue' },
  { id: 12, type: 'small', x: -3584, y: -2484, label: 'Banda Defensiva Izq. Azul', zone: 'def_blue' },
  { id: 13, type: 'small', x: 3584, y: -2484, label: 'Banda Defensiva Der. Azul', zone: 'def_blue' },
  { id: 14, type: 'small', x: -1788, y: -2300, label: 'Carril Interior Izq. Azul', zone: 'def_blue' },
  { id: 15, type: 'small', x: 1788, y: -2300, label: 'Carril Interior Der. Azul', zone: 'def_blue' },
  { id: 16, type: 'small', x: -2048, y: -1036, label: 'Medular Izq. Azul', zone: 'mid' },
  { id: 17, type: 'small', x: 0, y: -1024, label: 'Círculo Central Sur (Azul)', zone: 'mid' },
  { id: 18, type: 'small', x: 2048, y: -1036, label: 'Medular Der. Azul', zone: 'mid' },
  { id: 19, type: 'small', x: -1024, y: 0, label: 'Círculo Central Oeste', zone: 'mid' },
  { id: 20, type: 'small', x: 1024, y: 0, label: 'Círculo Central Este', zone: 'mid' },
  { id: 21, type: 'small', x: -2048, y: 1036, label: 'Medular Izq. Naranja', zone: 'mid' },
  { id: 22, type: 'small', x: 0, y: 1024, label: 'Círculo Central Norte (Naranja)', zone: 'mid' },
  { id: 23, type: 'small', x: 2048, y: 1036, label: 'Medular Der. Naranja', zone: 'mid' },
  { id: 24, type: 'small', x: -1788, y: 2300, label: 'Carril Interior Izq. Naranja', zone: 'def_orange' },
  { id: 25, type: 'small', x: 1788, y: 2300, label: 'Carril Interior Der. Naranja', zone: 'def_orange' },
  { id: 26, type: 'small', x: -3584, y: 2484, label: 'Banda Defensiva Izq. Naranja', zone: 'def_orange' },
  { id: 27, type: 'small', x: 3584, y: 2484, label: 'Banda Defensiva Der. Naranja', zone: 'def_orange' },
  { id: 28, type: 'small', x: 0, y: 2816, label: 'Eje Central Defensivo Naranja', zone: 'def_orange' },
  { id: 29, type: 'small', x: -940, y: 3308, label: 'Área Interior Izq. Naranja', zone: 'def_orange' },
  { id: 30, type: 'small', x: 940, y: 3308, label: 'Área Interior Der. Naranja', zone: 'def_orange' },
  { id: 31, type: 'small', x: -1792, y: 4184, label: 'Fondo Izq. Naranja', zone: 'def_orange' },
  { id: 32, type: 'small', x: 1792, y: 4184, label: 'Fondo Der. Naranja', zone: 'def_orange' },
  { id: 33, type: 'small', x: 0, y: 4240, label: 'Frente Portería Naranja', zone: 'def_orange' },
];

export const MAP_NAMES = {
  stadium_day_p: 'DFH Stadium (Día)',
  stadium_p: 'DFH Stadium',
  stadium_night_p: 'DFH Stadium (Noche)',
  stadium_rainy_p: 'DFH Stadium (Tormenta)',
  eurostadium_p: 'Mannfield',
  eurostadium_night_p: 'Mannfield (Noche)',
  eurostadium_rainy_p: 'Mannfield (Tormenta)',
  cs_p: 'Champions Field',
  cs_day_p: 'Champions Field (Día)',
  trainstation_p: 'Urban Central',
  trainstation_night_p: 'Urban Central (Noche)',
  trainstation_dawn_p: 'Urban Central (Amanecer)',
  park_p: 'Beckwith Park',
  park_night_p: 'Beckwith Park (Medianoche)',
  park_rainy_p: 'Beckwith Park (Tormenta)',
  utopiastadium_p: 'Utopia Coliseum',
  utopiastadium_dusk_p: 'Utopia Coliseum (Atardecer)',
  wasteland_s_p: 'Wasteland',
  neotokyo_standard_p: 'Neo Tokyo',
  underwater_p: 'AquaDome',
  farm_p: 'Farmstead',
  chinastadium_p: 'Forbidden Temple',
  music_p: 'Neon Fields',
  beach_p: 'Salty Shores',
  street_p: 'Sovereign Heights',
  oasis_p: 'Deadeye Canyon (Oasis)',
   Woods_P: 'Drift Woods',
};

export function getReadableMapName(rawMap) {
  if (!rawMap) return 'Estadio Estándar';
  const key = rawMap.toLowerCase();
  for (const [k, v] of Object.entries(MAP_NAMES)) {
    if (k.toLowerCase() === key) return v;
  }
  return rawMap.replace(/_p$/i, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Convierte Unreal Units por segundo (uu/s) a km/h.
 * En Rocket League: 1 uu = 1 cm => 100 uu/s = 1 m/s = 3.6 km/h.
 * Por tanto, uu/s * 0.036 = km/h (Velocidad máxima del coche = 2300 uu/s = 82.8 km/h).
 */
export function uusToKmh(uus) {
  return (uus || 0) * 0.036;
}

/**
 * Convierte unidades crudas de turbo de Rocket League (0..255) a porcentaje (0..100).
 */
export function rawBoostToPct(raw) {
  return ((raw || 0) * 100) / 255;
}

export function formatSeconds(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}


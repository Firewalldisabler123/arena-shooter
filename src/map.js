// Arena: 40 x 40 Einheiten. Alle Hindernisse sind Boxen {x, z, w, d, h} (Mittelpunkt am Boden).
export const HALF = 20;
export const WALL_H = 7;

export const BOXES = [
  // Mitte
  { x: 0, z: 0, w: 5, d: 5, h: 1.0, color: 0xff2bd6 },
  { x: 0, z: 0, w: 2, d: 2, h: 5, color: 0xff2bd6 },
  // Deckungen
  { x: 0, z: 9, w: 9, d: 1, h: 3, color: 0x00f0ff },
  { x: 0, z: -9, w: 9, d: 1, h: 3, color: 0x00f0ff },
  { x: 11, z: 0, w: 3, d: 3, h: 1.0, color: 0xb6ff00 },
  { x: -11, z: 0, w: 3, d: 3, h: 1.0, color: 0xb6ff00 },
  // Ecksäulen
  { x: 11, z: 11, w: 3, d: 3, h: 5, color: 0xff9100 },
  { x: -11, z: 11, w: 3, d: 3, h: 5, color: 0xff9100 },
  { x: 11, z: -11, w: 3, d: 3, h: 5, color: 0xff9100 },
  { x: -11, z: -11, w: 3, d: 3, h: 5, color: 0xff9100 },
  // Seitliche Mauern
  { x: 16, z: 5, w: 1, d: 6, h: 3, color: 0x00f0ff },
  { x: -16, z: -5, w: 1, d: 6, h: 3, color: 0x00f0ff },
];

// Äußere Wände (zählen für Kollision und Schüsse)
const T = 2;
export const WALLS = [
  { x: 0, z: -HALF - T / 2, w: 2 * HALF + 2 * T, d: T, h: WALL_H },
  { x: 0, z: HALF + T / 2, w: 2 * HALF + 2 * T, d: T, h: WALL_H },
  { x: -HALF - T / 2, z: 0, w: T, d: 2 * HALF, h: WALL_H },
  { x: HALF + T / 2, z: 0, w: T, d: 2 * HALF, h: WALL_H },
];

export const SOLIDS = [...BOXES, ...WALLS];

export const SPAWNS = [
  [-17, 0, -17],
  [17, 0, 17],
  [-17, 0, 17],
  [17, 0, -17],
];

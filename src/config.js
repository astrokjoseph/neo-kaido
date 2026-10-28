// Global layout constants and small utilities shared by every system.
export const CFG = {
  GRID: 13,          // main city is GRID x GRID blocks
  PITCH: 82,         // block + street
  BLOCK: 64,         // block footprint (sidewalk included)
  STREET: 18,        // road width
  SIDEWALK: 4.5,     // sidewalk ring width inside a block
  CURB: 0.18,        // sidewalk height
  OUTER: 19,         // outer skyline extends to this block index from the centre
  LAMP_H: 7.2,       // streetlight head height
  BRIDGE_BANDS: [34, 62],
  LANE_ALTS: [48, 80, 105, 135, 170, 220],
  TRAIN_Y: 21,
};

export const HALF = (CFG.GRID - 1) / 2;
export const CITY_HALF = HALF * CFG.PITCH + CFG.BLOCK / 2; // ~524

/** World-space centre of block index i (0..GRID-1, may extend outside for the outer ring). */
export const blockCenter = (i) => (i - HALF) * CFG.PITCH;
/** World-space centre-line of street k (between block k and k+1). */
export const streetLine = (k) => (k - HALF + 0.5) * CFG.PITCH;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rand {
  constructor(seed) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
}

export const NEON = {
  pink: 0xff2a8a,
  cyan: 0x19e8ff,
  violet: 0x8a5cff,
  amber: 0xffa53a,
  red: 0xff2a3a,
  blue: 0x2a6bff,
  green: 0x6dff5a,
  white: 0xeef4ff,
};
export const NEON_LIST = [NEON.pink, NEON.cyan, NEON.violet, NEON.amber, NEON.red, NEON.blue, NEON.cyan, NEON.pink, NEON.green];

/** Shared uniforms (objects are shared by reference across materials). */
export const U = {
  uTime: { value: 0 },
  uNight: { value: 1 },        // 1 = full night, 0 = full day
  uRain: { value: 1 },         // rain/wetness 0..1
  uNeon: { value: 1 },         // neon intensity multiplier
  uLightning: { value: 0 },
  uLampColor: { value: null }, // set in main
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

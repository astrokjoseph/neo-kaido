import * as THREE from 'three';
import { CFG, HALF, Rand, blockCenter, NEON_LIST } from '../config.js';

// Procedural city plan: blocks → lots → buildings → tiers. Pure data; the
// render systems turn it into instanced geometry.

const CORPS = ['Hyperion', 'Kagami', 'Aether', 'Okami', 'Sakura', 'Ryu', 'Tesseract', 'Mirage', 'Nova', 'Kitsune', 'Orbital', 'Shinra', 'Daikoku', 'Yurei', 'Tengu', 'Hoshi'];
const KINDS_TALL = ['Tower', 'Spire', 'Arcology', 'Plaza', 'Center', 'Exchange', 'Heights', 'Monolith'];
const KINDS_LOW = ['Residences', 'Hab Block', 'Apartments', 'Capsule Hotel', 'Market', 'Arcade', 'Clinic', 'Works'];

export function generateLayout(seed = 2077) {
  const R = new Rand(seed);
  const blocks = [];
  const buildings = [];
  const tiers = [];
  const plazaI = HALF, plazaJ = HALF;
  const megaBlocks = new Set(['5,4', '8,6', '4,7', '7,8', '6,3']);

  const tint = (r) => {
    const t = r.next();
    if (t < 0.4) return new THREE.Color().setHSL(0.62, 0.08, r.range(0.12, 0.22));
    if (t < 0.7) return new THREE.Color().setHSL(0.08, 0.06, r.range(0.12, 0.2));
    if (t < 0.9) return new THREE.Color().setHSL(0.55, 0.15, r.range(0.1, 0.18));
    return new THREE.Color().setHSL(0.95, 0.1, r.range(0.12, 0.18));
  };
  const neon = (r, k = 1) => new THREE.Color(r.pick(NEON_LIST)).multiplyScalar(k);

  function addTier(b, t) {
    t.building = b.id;
    t.index = tiers.length;
    tiers.push(t);
    b.tiers.push(t.index);
    b.height = Math.max(b.height, t.y + t.sy);
    return t;
  }

  function makeBuilding(lot, dist, blk, mega) {
    const r = R;
    const b = {
      id: buildings.length, tiers: [], height: 0, block: blk, lot,
      corp: r.pick(CORPS), seed: r.next() * 100,
    };
    buildings.push(b);
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    const minWD = Math.min(w, d);
    let H = (290 * Math.exp(-(dist * dist) / 14) + 34) * r.range(0.45, 1.2);
    if (mega) H = r.range(360, 420);
    if (minWD < 16) H = Math.min(H, 70 + minWD * 3);
    H = Math.max(18, H);
    const style = r.int(0, 4);
    const trimC = neon(r, 1);
    const lit = r.range(0.14, 0.45);
    const seedT = () => Math.round(r.next() * 997) + 0.5;
    const bSeed = seedT();
    b.seedKey = bSeed;
    const common = () => ({ style, seed: bSeed, lit, trimCol: trimC, tint: tint(r) });

    let arche;
    if (mega) arche = r.pick(['setback', 'cyl', 'twist']);
    else if (H > 150) arche = r.pick(['setback', 'setback', 'cyl', 'prism', 'twist', 'podium']);
    else if (H > 70) arche = r.pick(['setback', 'podium', 'prism', 'slab', 'cyl']);
    else arche = r.pick(['slab', 'slab', 'podium', 'setback']);
    if (minWD < 18 && (arche === 'cyl' || arche === 'twist')) arche = 'setback';
    b.arche = arche;

    const m = 0.6; // lot margin
    if (arche === 'setback') {
      const n = H > 200 ? r.int(3, 4) : r.int(1, 3);
      let sx = w - m * 2, sz = d - m * 2, y = 0;
      for (let k = 0; k < n; k++) {
        const hk = k === n - 1 ? H - y : (H - y) * r.range(0.35, 0.6);
        const t = addTier(b, { shape: 'box', x: cx, y, z: cz, sx, sy: hk, sz, rot: 0, ...common(), trim: k === n - 1 ? r.pick([1, 2, 2, 4]) : r.pick([0, 0, 2, 3]) });
        if (k > 0) t.style = r.chance(0.3) ? r.int(0, 4) : style;
        y += hk; sx *= r.range(0.62, 0.85); sz *= r.range(0.62, 0.85);
      }
      if (H > 140 && r.chance(0.6)) addTier(b, { shape: 'cyl', x: cx, y, z: cz, sx: 1.6, sy: r.range(18, 45), sz: 1.6, rot: 0, ...common(), style: 3, trim: 1 });
    } else if (arche === 'cyl') {
      const ph = r.range(8, 16);
      addTier(b, { shape: 'box', x: cx, y: 0, z: cz, sx: w - m * 2, sy: ph, sz: d - m * 2, rot: 0, ...common(), style: 0, trim: 2 });
      const dia = minWD * r.range(0.6, 0.85);
      const h1 = (H - ph) * r.range(0.6, 0.85);
      addTier(b, { shape: 'cyl', x: cx, y: ph, z: cz, sx: dia, sy: h1, sz: dia, rot: 0, ...common(), style: r.pick([1, 3, 0]), trim: r.pick([2, 3, 4]) });
      b.rings = { x: cx, z: cz, r: dia / 2, y0: ph, y1: ph + h1, step: r.range(14, 26) };
      addTier(b, { shape: 'cyl', x: cx, y: ph + h1, z: cz, sx: dia * 0.65, sy: H - ph - h1, sz: dia * 0.65, rot: 0, ...common(), style: 3, trim: 2 });
      if (r.chance(0.7)) addTier(b, { shape: 'cyl', x: cx, y: H, z: cz, sx: 1.4, sy: r.range(20, 50), sz: 1.4, rot: 0, ...common(), style: 3, trim: 1 });
    } else if (arche === 'prism') {
      const shape = r.pick(['hex', 'oct']);
      const dia = minWD * 0.95;
      const h1 = H * r.range(0.6, 1);
      const rot = r.next() * Math.PI;
      addTier(b, { shape, x: cx, y: 0, z: cz, sx: dia, sy: h1, sz: dia, rot, ...common(), trim: r.pick([1, 2, 3]) });
      if (h1 < H - 5) addTier(b, { shape, x: cx, y: h1, z: cz, sx: dia * 0.7, sy: H - h1, sz: dia * 0.7, rot: rot + 0.3, ...common(), trim: 2 });
    } else if (arche === 'twist') {
      const ph = r.range(10, 18);
      addTier(b, { shape: 'box', x: cx, y: 0, z: cz, sx: w - m * 2, sy: ph, sz: d - m * 2, rot: 0, ...common(), style: 0, trim: 2 });
      const n = r.int(12, 20);
      const sh = (H - ph) / n;
      const s0 = minWD * 0.72;
      const twist = r.range(0.04, 0.09) * (r.chance(0.5) ? 1 : -1);
      for (let k = 0; k < n; k++) {
        const s = s0 * (1 - k / n * 0.3);
        addTier(b, { shape: 'box', x: cx, y: ph + k * sh, z: cz, sx: s, sy: sh * 0.94, sz: s, rot: k * twist, ...common(), style: 3, trim: 2 });
      }
      b.twist = true;
    } else if (arche === 'slab') {
      addTier(b, { shape: 'box', x: cx, y: 0, z: cz, sx: w - m * 2, sy: H, sz: d - m * 2, rot: 0, ...common(), style: 4, lit: r.range(0.3, 0.6), trim: r.pick([0, 0, 3, 1]) });
      b.residential = true;
    } else {
      const ph = r.range(10, 18);
      addTier(b, { shape: 'box', x: cx, y: 0, z: cz, sx: w - m * 2, sy: ph, sz: d - m * 2, rot: 0, ...common(), style: 0, trim: 2 });
      const tw = (w - m * 2) * r.range(0.5, 0.75), td = (d - m * 2) * r.range(0.5, 0.75);
      const ox = r.range(-1, 1) * ((w - m * 2) - tw) / 2, oz = r.range(-1, 1) * ((d - m * 2) - td) / 2;
      if (r.chance(0.3)) addTier(b, { shape: 'cyl', x: cx + ox, y: ph, z: cz + oz, sx: Math.min(tw, td), sy: H - ph, sz: Math.min(tw, td), rot: 0, ...common(), trim: r.pick([2, 3]) });
      else addTier(b, { shape: 'box', x: cx + ox, y: ph, z: cz + oz, sx: tw, sy: H - ph, sz: td, rot: 0, ...common(), trim: r.pick([1, 2, 4]) });
    }
    const top = tiers[b.tiers[b.tiers.length - 1]];
    const floors = Math.round(b.height / 3.8);
    const kind = b.height > 120 ? r.pick(KINDS_TALL) : r.pick(KINDS_LOW);
    b.name = kind === 'Hab Block' ? `${b.corp} Hab Block ${r.int(2, 99)}` : `${b.corp} ${kind}`;
    b.floors = floors;
    b.top = top;
    b.base = tiers[b.tiers[0]];
    return b;
  }

  function splitLots(rect, depth, maxDepth, out) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const canX = w > 26, canZ = d > 26;
    if (depth >= maxDepth || (!canX && !canZ) || (depth > 0 && R.chance(0.3))) { out.push(rect); return; }
    const alongX = canX && (!canZ || w > d || (w === d && R.chance(0.5)));
    const gap = R.chance(0.45) ? R.range(2.5, 4) : 0.4;
    const t = R.range(0.38, 0.62);
    if (alongX) {
      const s = rect.x0 + w * t;
      splitLots({ x0: rect.x0, x1: s - gap / 2, z0: rect.z0, z1: rect.z1 }, depth + 1, maxDepth, out);
      splitLots({ x0: s + gap / 2, x1: rect.x1, z0: rect.z0, z1: rect.z1 }, depth + 1, maxDepth, out);
    } else {
      const s = rect.z0 + d * t;
      splitLots({ x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: s - gap / 2 }, depth + 1, maxDepth, out);
      splitLots({ x0: rect.x0, x1: rect.x1, z0: s + gap / 2, z1: rect.z1 }, depth + 1, maxDepth, out);
    }
  }

  // ---- main city ----
  const inner = CFG.BLOCK / 2 - CFG.SIDEWALK;
  for (let i = 0; i < CFG.GRID; i++) {
    for (let j = 0; j < CFG.GRID; j++) {
      const cx = blockCenter(i), cz = blockCenter(j);
      const plaza = i === plazaI && j === plazaJ;
      const blk = { i, j, cx, cz, plaza, outer: false, buildings: [] };
      blocks.push(blk);
      if (plaza) continue;
      const dist = Math.hypot(i - HALF, j - HALF);
      const mega = megaBlocks.has(`${i},${j}`);
      const lots = [];
      splitLots({ x0: cx - inner, x1: cx + inner, z0: cz - inner, z1: cz + inner }, 0, mega ? 0 : dist < 2.5 ? 1 : 2, lots);
      lots.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
      lots.forEach((lot, k) => blk.buildings.push(makeBuilding(lot, dist, blk, mega && k === 0).id));
    }
  }
  const mainBuildingCount = buildings.length;

  // ---- outer skyline ring (simple towers on the same grid) ----
  const outerTiers = [];
  const OR = new Rand(seed + 1);
  for (let di = -CFG.OUTER; di <= CFG.OUTER; di++) {
    for (let dj = -CFG.OUTER; dj <= CFG.OUTER; dj++) {
      const ring = Math.max(Math.abs(di), Math.abs(dj));
      if (ring <= HALF) continue;
      const cx = di * CFG.PITCH, cz = dj * CFG.PITCH;
      blocks.push({ i: di + HALF, j: dj + HALF, cx, cz, plaza: false, outer: true, buildings: [] });
      const n = OR.int(1, 3);
      for (let k = 0; k < n; k++) {
        const sx = OR.range(14, n === 1 ? 50 : 26), sz = OR.range(14, n === 1 ? 50 : 26);
        const x = cx + OR.range(-1, 1) * (inner - sx / 2), z = cz + OR.range(-1, 1) * (inner - sz / 2);
        let h = OR.range(25, 110) * (1 + Math.max(0, 1 - (ring - HALF) / 8) * 0.8);
        if (OR.chance(0.07)) h = OR.range(180, 330);
        const style = OR.int(0, 4);
        const t = { shape: OR.chance(0.12) ? 'cyl' : 'box', x, y: 0, z, sx, sy: h, sz, rot: 0, style, seed: Math.round(OR.next() * 997) + 0.5, lit: OR.range(0.18, 0.45), trim: OR.chance(0.3) ? OR.pick([1, 2, 3]) : 0, trimCol: neon(OR), tint: tint(OR), building: -1, outer: true };
        if (t.shape === 'cyl') { t.sx = t.sz = Math.min(sx, sz); }
        t.index = tiers.length; tiers.push(t); outerTiers.push(t);
      }
    }
  }

  // ---- megastructures on the horizon ----
  const megas = [
    { shape: 'pyr', x: -2350, y: 0, z: -1650, sx: 820, sy: 760, sz: 820, rot: Math.PI / 4, style: 4, seed: 11.5, lit: 0.5, trim: 2, trimCol: new THREE.Color(NEON_LIST[3]), tint: new THREE.Color(0.1, 0.09, 0.1) },
    { shape: 'cyl', x: 1700, y: 0, z: -2300, sx: 150, sy: 900, sz: 150, rot: 0, style: 1, seed: 12.5, lit: 0.5, trim: 3, trimCol: new THREE.Color(NEON_LIST[1]), tint: new THREE.Color(0.1, 0.11, 0.13) },
    { shape: 'cyl', x: 1700, y: 900, z: -2300, sx: 60, sy: 260, sz: 60, rot: 0, style: 3, seed: 13.5, lit: 0.4, trim: 1, trimCol: new THREE.Color(NEON_LIST[1]), tint: new THREE.Color(0.1, 0.11, 0.13) },
    { shape: 'box', x: 2400, y: 0, z: 1300, sx: 260, sy: 520, sz: 160, rot: 0.4, style: 0, seed: 14.5, lit: 0.45, trim: 1, trimCol: new THREE.Color(NEON_LIST[0]), tint: new THREE.Color(0.1, 0.1, 0.12) },
    { shape: 'hex', x: -1500, y: 0, z: 2300, sx: 300, sy: 640, sz: 300, rot: 0.2, style: 2, seed: 15.5, lit: 0.45, trim: 3, trimCol: new THREE.Color(NEON_LIST[2]), tint: new THREE.Color(0.1, 0.1, 0.12) },
  ];
  for (const t of megas) { t.building = -1; t.outer = true; t.index = tiers.length; tiers.push(t); }

  // ---- street-facing facades (for billboards, blade signs, awnings) ----
  const faces = [];
  for (const b of buildings) {
    for (const ti of b.tiers) {
      const t = tiers[ti];
      if (t.shape !== 'box' || Math.abs(t.rot) > 1e-3 || t.sx < 8 || t.sz < 8) continue;
      const blk = b.block;
      const lim = inner - 1.5;
      const sides = [
        { n: [1, 0], plane: t.x + t.sx / 2, edge: t.x + t.sx / 2 - blk.cx >= lim, u: [t.z - t.sz / 2, t.z + t.sz / 2] },
        { n: [-1, 0], plane: t.x - t.sx / 2, edge: blk.cx - (t.x - t.sx / 2) >= lim, u: [t.z - t.sz / 2, t.z + t.sz / 2] },
        { n: [0, 1], plane: t.z + t.sz / 2, edge: t.z + t.sz / 2 - blk.cz >= lim, u: [t.x - t.sx / 2, t.x + t.sx / 2] },
        { n: [0, -1], plane: t.z - t.sz / 2, edge: blk.cz - (t.z - t.sz / 2) >= lim, u: [t.x - t.sx / 2, t.x + t.sx / 2] },
      ];
      for (const s of sides) {
        faces.push({ building: b.id, tier: ti, n: s.n, plane: s.plane, u0: s.u[0], u1: s.u[1], y0: t.y, y1: t.y + t.sy, street: s.edge, ground: t.y < 0.5 });
      }
    }
  }

  // ---- skybridges across streets ----
  const bridges = [];
  const BR = new Rand(seed + 7);
  const streetFaces = faces.filter((f) => f.street && f.ground);
  for (const f of streetFaces) {
    if (f.n[0] !== 1 && f.n[1] !== 1) continue;
    for (const g of streetFaces) {
      if (g.n[0] !== -f.n[0] || g.n[1] !== -f.n[1]) continue;
      const gap = g.plane - f.plane;
      if (gap < 15 || gap > 30) continue;
      const lo = Math.max(f.u0, g.u0) + 2, hi = Math.min(f.u1, g.u1) - 2;
      if (hi - lo < 4) continue;
      if (!BR.chance(0.45)) continue;
      const band = BR.pick(CFG.BRIDGE_BANDS);
      const top = Math.min(f.y1, g.y1);
      if (top < band + 6) continue;
      const u = BR.range(lo, hi);
      const along = f.n[0] === 1 ? 'x' : 'z';
      bridges.push({ along, a: f.plane, b: g.plane, u, y: band + BR.range(0, 3), w: BR.range(3, 4.5), col: neon(BR) });
    }
  }

  // ---- colliders ----
  const colliders = tiers.filter((t) => !t.outer || t.shape !== 'pyr').map((t) => {
    if (t.shape === 'box' && Math.abs(t.rot) < 1e-3) return { box: true, x0: t.x - t.sx / 2, x1: t.x + t.sx / 2, z0: t.z - t.sz / 2, z1: t.z + t.sz / 2, y0: t.y, y1: t.y + t.sy, tier: t.index };
    return { box: false, x: t.x, z: t.z, r: Math.min(t.sx, t.sz) / 2 * (t.shape === 'box' ? 1.0 : 0.98), y0: t.y, y1: t.y + t.sy, tier: t.index };
  });

  return { blocks, buildings, tiers, mainBuildingCount, faces, bridges, colliders, outerTiers };
}

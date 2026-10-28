import * as THREE from 'three';
import { CFG, Rand, NEON_LIST, U, streetLine, blockCenter } from '../config.js';
import { createGlowMaterial, createBeamMaterial } from '../fx/materials.js';
import { createHelipadTexture } from '../fx/textures.js';
import { ChunkedInstances, composeMatrix } from './chunks.js';
import { rectPath } from './paths.js';
import * as G from './geom.js';

// Architectural dressing: rooftop machinery, antennas with aircraft lights,
// glowing floor rings, facade AC units and pipes, skybridges, searchlights and
// the elevated maglev track.
export function buildDetails(layout, group) {
  const R = new Rand(555);
  const out = { sets: [], searchlights: [], lights: [] };
  const grey = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.55, metalness: 0.6 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.8, metalness: 0.3 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.35, metalness: 0.9 });

  const roofUnits = [], tanks = [], antennas = [], tips = [], rings = [], acs = [], pipes = [], pads = [];
  for (const b of layout.buildings) {
    b.tiers.forEach((ti, k) => {
      const t = layout.tiers[ti];
      const top = t.y + t.sy;
      const isTop = k === b.tiers.length - 1;
      if (t.shape === 'box' && Math.abs(t.rot) < 1e-3 && !b.twist && t.sx > 8) {
        const n = R.int(isTop ? 1 : 0, 4);
        for (let i = 0; i < n; i++) {
          const cx = R.chance(0.5) ? 1 : -1, cz = R.chance(0.5) ? 1 : -1;
          const x = isTop ? t.x + R.range(-1, 1) * (t.sx / 2 - 3) : t.x + cx * (t.sx / 2 - 2.6);
          const z = isTop ? t.z + R.range(-1, 1) * (t.sz / 2 - 3) : t.z + cz * (t.sz / 2 - 2.6);
          (b.residential && R.chance(0.6) ? tanks : roofUnits).push({ x, y: top, z, rot: R.pick([0, Math.PI / 2]), s: R.range(0.8, 1.3) });
        }
        if (isTop && t.sx > 24 && t.sz > 24 && t.sy > 60 && R.chance(0.3)) pads.push({ x: t.x, y: top + 0.08, z: t.z, s: Math.min(t.sx, t.sz) * 0.55 });
      }
      if (isTop && t.sx > 3) {
        const n = R.int(0, t.sy > 80 ? 3 : 1);
        for (let i = 0; i < n; i++) {
          const h = R.range(6, 26);
          const rr = Math.min(t.sx, t.sz) / 2 - 2;
          const x = t.x + R.range(-1, 1) * rr * 0.7, z = t.z + R.range(-1, 1) * rr * 0.7;
          antennas.push({ x, y: top, z, h, rot: R.next() * 6 });
          tips.push({ x, y: top + h + 0.2, z, s: 0.35 });
        }
        if (t.shape === 'cyl' && t.sx < 2) tips.push({ x: t.x, y: top + 0.4, z: t.z, s: 0.6 });
        if (b.height > 150 && t.shape === 'box') {
          for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) tips.push({ x: t.x + a * (t.sx / 2 - 0.4), y: top + 0.4, z: t.z + c * (t.sz / 2 - 0.4), s: 0.3 });
        }
      }
    });
    if (b.rings) {
      const g = b.rings;
      for (let y = g.y0 + g.step; y < g.y1 - 4; y += g.step) rings.push({ x: g.x, y, z: g.z, r: g.r + 0.35, col: layout.tiers[b.tiers[1]].trimCol });
    }
    // residential facade clutter
    if (b.residential) {
      const t = layout.tiers[b.tiers[0]];
      const faces = layout.faces.filter((f) => f.tier === t.index);
      for (const f of faces) {
        const len = f.u1 - f.u0;
        const count = Math.min(80, Math.floor(len * (f.y1 - f.y0) / 45));
        const rot = f.n[0] === 1 ? Math.PI / 2 : f.n[0] === -1 ? -Math.PI / 2 : f.n[1] === 1 ? 0 : Math.PI;
        for (let i = 0; i < count; i++) {
          const u = R.range(f.u0 + 1, f.u1 - 1);
          const y = Math.floor(R.range(7, f.y1 - 2) / 3.1) * 3.1 + 0.6;
          acs.push(f.n[0] !== 0 ? { x: f.plane, y, z: u, rot } : { x: u, y, z: f.plane, rot });
        }
        const np = R.int(1, 3);
        for (let i = 0; i < np; i++) {
          const u = R.range(f.u0 + 1, f.u1 - 1), r = R.range(0.12, 0.3);
          pipes.push(f.n[0] !== 0 ? { x: f.plane + f.n[0] * (r + 0.1), z: u, y: f.y1, r } : { x: u, z: f.plane + f.n[1] * (r + 0.1), y: f.y1, r });
        }
      }
    }
  }

  const simple = (items, geo, mat, matrix, maxDist, extra = {}) => {
    const set = new ChunkedInstances({ items, geometry: geo, material: mat, chunk: 410, maxDist, castShadow: true, group, write: { pos: (i) => i, matrix }, ...extra });
    out.sets.push(set);
    return set;
  };
  simple(roofUnits, G.roofUnitGeometry(), grey, (u, m) => composeMatrix(m, u.x, u.y, u.z, u.rot, u.s, u.s, u.s), 700);
  simple(tanks, G.waterTankGeometry(), rust, (u, m) => composeMatrix(m, u.x, u.y, u.z, u.rot, u.s, u.s, u.s), 700);
  simple(antennas, G.antennaGeometry(), grey, (a, m) => composeMatrix(m, a.x, a.y, a.z, a.rot, 1, a.h, 1), 1100);
  simple(acs, G.acUnitGeometry(), grey, (a, m) => composeMatrix(m, a.x, a.y, a.z, a.rot, 1, 1, 1), 280);
  simple(pipes, new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0), pipeMat, (p, m) => composeMatrix(m, p.x, 0, p.z, 0, p.r, p.y, p.r), 400);

  // blinking aircraft-warning lights
  const tipMat = createGlowMaterial({
    colors: [new THREE.Color(1, 0.05, 0.05).multiplyScalar(14)], night: 0.3, fogK: 0.3,
    anim: 'c *= 0.05 + 0.95 * step(0.82, fract(uTime * 0.6 + seed * 3.0));',
  });
  out.sets.push(new ChunkedInstances({
    items: tips, geometry: G.merge([{ geo: new THREE.SphereGeometry(1, 8, 6), aPart: 0 }], ['aPart']), material: tipMat, chunk: 410, group,
    write: { pos: (t) => t, matrix: (t, m) => composeMatrix(m, t.x, t.y, t.z, 0, t.s, t.s, t.s) },
  }));

  // glowing floor rings around cylindrical towers
  const ringMat = createGlowMaterial({ colors: [new THREE.Color(4, 4, 4)], instMask: [1], night: 0.75, fogK: 0.4, side: THREE.DoubleSide,
    anim: 'c *= 0.75 + 0.25 * sin(uTime * 1.5 + instanceMatrix[3].y * 0.15);' });
  out.sets.push(new ChunkedInstances({
    items: rings, geometry: G.merge([{ geo: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), aPart: 0 }], ['aPart']), material: ringMat, chunk: 410, color: true, group,
    write: { pos: (r) => r, matrix: (r, m) => composeMatrix(m, r.x, r.y, r.z, 0, r.r, 0.5, r.r), color: (r, c) => c.copy(r.col) },
  }));

  // helipads
  const padMat = new THREE.MeshBasicMaterial({ map: createHelipadTexture(), color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  out.sets.push(new ChunkedInstances({
    items: pads, geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material: padMat, chunk: 410, group,
    write: { pos: (p) => p, matrix: (p, m) => composeMatrix(m, p.x, p.y, p.z, 0, p.s, 1, p.s) },
  }));
  out.helipads = pads;

  // skybridges
  const bridgeItems = layout.bridges.map((br) => {
    const len = br.b - br.a, mid = (br.a + br.b) / 2;
    return br.along === 'x' ? { x: mid, z: br.u, y: br.y, len, w: br.w, rot: 0, col: br.col } : { x: br.u, z: mid, y: br.y, len, w: br.w, rot: Math.PI / 2, col: br.col };
  });
  const bMatrix = (b, m) => composeMatrix(m, b.x, b.y, b.z, b.rot, b.len, 1, b.w);
  simple(bridgeItems, G.merge([
    { geo: new THREE.BoxGeometry(1, 0.5, 1), matrix: G.M(0, 0.25, 0) },
    { geo: new THREE.BoxGeometry(1, 0.35, 1), matrix: G.M(0, 3.1, 0) },
    { geo: new THREE.BoxGeometry(1, 2.5, 0.06), matrix: G.M(0, 1.7, 0.47) },
    { geo: new THREE.BoxGeometry(1, 2.5, 0.06), matrix: G.M(0, 1.7, -0.47) },
  ]), new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.15, metalness: 0.9 }), bMatrix, 900);
  const bridgeGlow = createGlowMaterial({ colors: [new THREE.Color(1, 0.85, 0.65).multiplyScalar(2.2), new THREE.Color(5, 5, 5)], instMask: [0, 1], night: 0.8 });
  out.sets.push(new ChunkedInstances({
    items: bridgeItems, chunk: 410, group, color: true, material: bridgeGlow,
    geometry: G.merge([
      { geo: new THREE.BoxGeometry(1, 1.1, 0.02), matrix: G.M(0, 1.8, 0.44), aPart: 0 },
      { geo: new THREE.BoxGeometry(1, 1.1, 0.02), matrix: G.M(0, 1.8, -0.44), aPart: 0 },
      { geo: new THREE.BoxGeometry(1, 0.05, 0.03), matrix: G.M(0, -0.02, 0.5), aPart: 1 },
      { geo: new THREE.BoxGeometry(1, 0.05, 0.03), matrix: G.M(0, -0.02, -0.5), aPart: 1 },
    ], ['aPart']),
    write: { pos: (b) => b, matrix: bMatrix, color: (b, c) => c.copy(b.col) },
  }));
  out.bridges = bridgeItems;

  // searchlights sweeping the clouds from the tallest towers
  const tall = layout.buildings.filter((b) => b.height > 200).sort((a, b) => b.height - a.height).slice(0, 7);
  const beamGeo = new THREE.CylinderGeometry(22, 0.6, 900, 24, 1, true).translate(0, 450, 0);
  for (const [i, b] of tall.entries()) {
    const col = i % 2 ? 0xbfe6ff : 0xffd2ef;
    const mat = createBeamMaterial({ color: col, intensity: 0.22, rainBoost: 0.3, tipFade: false, night: 0.9 });
    mat.uniforms.uIntensity.value = 0.2;
    const m = new THREE.Mesh(beamGeo, mat);
    const t = b.top;
    m.position.set(t.x, b.height + 1, t.z);
    m.renderOrder = 6;
    m.frustumCulled = false;
    m.layers.set(2);
    group.add(m);
    out.searchlights.push({ mesh: m, phase: R.next() * 10, speed: R.range(0.15, 0.35), tilt: R.range(0.25, 0.55) });
  }

  // ---- elevated maglev track ----
  const k0 = 3, k1 = CFG.GRID - 5;
  const path = rectPath(streetLine(k0), streetLine(k0), streetLine(k1), streetLine(k1), 8);
  out.trainPath = path;
  const segs = [];
  const step = 6;
  for (let s = 0; s < path.length; s += step) {
    const p = path.at(s + step / 2);
    segs.push({ x: p.x, z: p.z, rot: Math.atan2(-p.dz, p.dx) });
  }
  const sMatrix = (s, m) => composeMatrix(m, s.x, CFG.TRAIN_Y - 1.0, s.z, s.rot, step + 0.4, 1, 1);
  simple(segs, G.merge([
    { geo: new THREE.BoxGeometry(1, 0.9, 4.6) },
    { geo: new THREE.BoxGeometry(1, 0.5, 0.25), matrix: G.M(0, 0.7, 2.2) },
    { geo: new THREE.BoxGeometry(1, 0.5, 0.25), matrix: G.M(0, 0.7, -2.2) },
  ]), new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.4, metalness: 0.7 }), sMatrix, 1200);
  out.sets.push(new ChunkedInstances({
    items: segs, chunk: 410, group,
    geometry: G.merge([
      { geo: new THREE.BoxGeometry(1, 0.06, 0.06), matrix: G.M(0, -0.46, 2.3), aPart: 0 },
      { geo: new THREE.BoxGeometry(1, 0.06, 0.06), matrix: G.M(0, -0.46, -2.3), aPart: 0 },
      { geo: new THREE.BoxGeometry(1, 0.04, 0.12), matrix: G.M(0, 0.47, 0.9), aPart: 1 },
      { geo: new THREE.BoxGeometry(1, 0.04, 0.12), matrix: G.M(0, 0.47, -0.9), aPart: 1 },
    ], ['aPart']),
    material: createGlowMaterial({ colors: [new THREE.Color(NEON_LIST[1]).multiplyScalar(3.5), new THREE.Color(NEON_LIST[0]).multiplyScalar(1.2)], night: 0.8 }),
    write: { pos: (s) => s, matrix: sMatrix },
  }));
  const pillars = [];
  for (let j = 0; j < CFG.GRID; j++) {
    const c = blockCenter(j);
    if (c < streetLine(k0) + 10 || c > streetLine(k1) - 10) continue;
    for (const off of [-16, 16]) {
      for (const line of [streetLine(k0), streetLine(k1)]) {
        pillars.push({ x: line, z: c + off });
        pillars.push({ x: c + off, z: line });
      }
    }
  }
  simple(pillars, G.merge([
    { geo: new THREE.CylinderGeometry(0.75, 0.95, 1, 12), matrix: G.M(0, 0.5, 0) },
    { geo: new THREE.BoxGeometry(5.2, 0.12, 1.6), matrix: G.M(0, 0.97, 0) },
  ]), grey, (p, m) => composeMatrix(m, p.x, 0, p.z, 0, 1, CFG.TRAIN_Y - 1.4, 1), 800);
  return out;
}

export function updateDetails(d, t) {
  for (const s of d.searchlights) {
    const a = t * s.speed + s.phase;
    s.mesh.rotation.set(Math.sin(a) * s.tilt, 0, Math.cos(a * 0.7) * s.tilt);
  }
}

import * as THREE from 'three';

// Procedural model construction helpers. Everything here is built from
// primitives / extrusions and merged into single geometries for instancing.

/** Merge geometries (any indexed-ness) into one non-indexed geometry. Each part can
 *  carry constant custom float attributes, e.g. { aPart: 2 }. */
export function merge(parts, attrNames = []) {
  const pos = [], nor = [], uv = [];
  const custom = Object.fromEntries(attrNames.map((n) => [n, []]));
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (p.matrix) { g = g.clone(); g.applyMatrix4(p.matrix); }
    const P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      if (N) nor.push(N.getX(i), N.getY(i), N.getZ(i)); else nor.push(0, 1, 0);
      if (T) uv.push(T.getX(i), T.getY(i)); else uv.push(0, 0);
      for (const n of attrNames) custom[n].push(p[n] ?? 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const n of attrNames) out.setAttribute(n, new THREE.Float32BufferAttribute(custom[n], 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

// ---------------- street furniture ----------------
export function streetlightGeometry() {
  return {
    body: merge([
      { geo: cyl(0.07, 0.12, 7.0, 8), matrix: M(0, 3.5, 0) },
      { geo: cyl(0.2, 0.24, 0.5, 8), matrix: M(0, 0.25, 0) },
      { geo: box(2.9, 0.09, 0.12), matrix: M(1.35, 7.05, 0, 0, 0, 0.05) },
      { geo: box(1.0, 0.16, 0.42), matrix: M(2.55, 7.2, 0) },
    ]),
    glow: merge([
      { geo: box(0.9, 0.04, 0.32), matrix: M(2.55, 7.11, 0), aPart: 0 },
      { geo: cyl(0.09, 0.09, 0.6, 8, true), matrix: M(0, 2.6, 0), aPart: 1 },
    ], ['aPart']),
  };
}

export function trafficSignalGeometry() {
  return {
    body: merge([
      { geo: cyl(0.08, 0.1, 6.0, 8), matrix: M(0, 3.0, 0) },
      { geo: box(5.0, 0.12, 0.12), matrix: M(2.5, 5.8, 0) },
      { geo: box(0.45, 1.3, 0.4), matrix: M(4.6, 5.1, 0) },
    ]),
    lamps: merge([0, 1, 2].map((k) => ({ geo: new THREE.CircleGeometry(0.14, 10), matrix: M(4.6, 5.5 - k * 0.4, 0.21), aPart: k }))
      .concat([0, 1, 2].map((k) => ({ geo: new THREE.CircleGeometry(0.14, 10), matrix: M(4.6, 5.5 - k * 0.4, -0.21, 0, Math.PI, 0), aPart: k + 3 }))), ['aPart']),
  };
}

export function vendingGeometry() {
  return {
    body: merge([
      { geo: box(1.05, 2.05, 0.8), matrix: M(0, 1.025, 0) },
      { geo: box(1.1, 0.1, 0.9), matrix: M(0, 2.08, 0.02) },
    ]),
    panel: merge([{ geo: new THREE.PlaneGeometry(0.9, 1.75), matrix: M(0, 1.1, 0.405) }]),
  };
}

export function kioskGeometry() {
  return {
    body: merge([
      { geo: box(2.6, 1.05, 1.3), matrix: M(0, 0.53, 0) },
      { geo: box(3.0, 0.1, 2.0), matrix: M(0, 2.45, 0.25, 0.12, 0, 0) },
      { geo: cyl(0.04, 0.04, 2.4, 6), matrix: M(-1.35, 1.2, -0.55) },
      { geo: cyl(0.04, 0.04, 2.4, 6), matrix: M(1.35, 1.2, -0.55) },
      { geo: cyl(0.04, 0.04, 2.3, 6), matrix: M(-1.35, 1.15, 1.1) },
      { geo: cyl(0.04, 0.04, 2.3, 6), matrix: M(1.35, 1.15, 1.1) },
      { geo: box(2.6, 0.5, 0.06), matrix: M(0, 2.15, 1.22) },
      { geo: cyl(0.25, 0.25, 0.55, 10), matrix: M(-0.7, 0.3, 1.0) },
      { geo: cyl(0.25, 0.25, 0.55, 10), matrix: M(0.1, 0.3, 1.0) },
    ]),
    glow: merge([
      { geo: box(2.5, 0.06, 0.06), matrix: M(0, 1.08, 0.66), aPart: 0 },
      { geo: new THREE.PlaneGeometry(2.4, 0.4), matrix: M(0, 2.15, 1.26), aPart: 1 },
      ...[-1.0, -0.33, 0.33, 1.0].map((x) => ({ geo: new THREE.SphereGeometry(0.17, 10, 8), matrix: M(x, 1.75, 1.25, 0, 0, 0, 1, 1.35, 1), aPart: 2 })),
    ], ['aPart']),
  };
}

export function bollardGeometry() {
  return {
    body: merge([{ geo: cyl(0.11, 0.13, 0.9, 8), matrix: M(0, 0.45, 0) }]),
    glow: merge([{ geo: cyl(0.115, 0.115, 0.06, 8, true), matrix: M(0, 0.78, 0) }]),
  };
}

export function acUnitGeometry() {
  return merge([
    { geo: box(1.0, 0.7, 0.6), matrix: M(0, 0, 0.3) },
    { geo: cyl(0.25, 0.25, 0.05, 12), matrix: M(0, 0, 0.61, Math.PI / 2, 0, 0) },
  ]);
}

export function waterTankGeometry() {
  return merge([
    { geo: cyl(1.4, 1.4, 2.8, 14), matrix: M(0, 2.6, 0) },
    { geo: new THREE.ConeGeometry(1.5, 0.7, 14), matrix: M(0, 4.35, 0) },
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ({ geo: box(0.12, 1.2, 0.12), matrix: M(a * 0.9, 0.6, b * 0.9) })),
  ]);
}

export function roofUnitGeometry() {
  return merge([
    { geo: box(3.2, 1.6, 2.2), matrix: M(0, 0.8, 0) },
    { geo: cyl(0.7, 0.7, 0.3, 14), matrix: M(-0.8, 1.75, 0) },
    { geo: cyl(0.7, 0.7, 0.3, 14), matrix: M(0.8, 1.75, 0) },
    { geo: cyl(0.15, 0.15, 3.0, 6), matrix: M(1.8, 0.4, 0, 0, 0, Math.PI / 2) },
  ]);
}

export function antennaGeometry() {
  return merge([
    { geo: cyl(0.06, 0.18, 1, 6), matrix: M(0, 0.5, 0) },
    { geo: box(1.6, 0.05, 0.05), matrix: M(0, 0.55, 0) },
    { geo: box(1.0, 0.05, 0.05), matrix: M(0, 0.75, 0, 0, Math.PI / 2, 0) },
    { geo: new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), matrix: M(0, 0.3, 0.3, Math.PI / 2.4, 0, 0, 1, 0.08, 1) },
  ]);
}

// ---------------- vehicles ----------------
/** Side-profile extrusion for a flying "spinner" car. Forward = +x. */
function profileShape(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

export function spinnerGeometry() {
  const shape = profileShape([[-2.3, 0.05], [1.9, 0.05], [2.45, 0.32], [2.3, 0.55], [1.4, 0.68], [0.55, 1.12], [-0.85, 1.15], [-1.9, 0.82], [-2.45, 0.6]]);
  const ex = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2, curveSegments: 1 });
  ex.translate(0, 0, -0.8);
  const body = merge([
    { geo: ex, aPart: 0 },
    { geo: cyl(0.36, 0.42, 1.5, 12), matrix: M(-1.25, 0.38, 1.18, 0, 0, Math.PI / 2), aPart: 0 },
    { geo: cyl(0.36, 0.42, 1.5, 12), matrix: M(-1.25, 0.38, -1.18, 0, 0, Math.PI / 2), aPart: 0 },
    { geo: box(0.9, 0.1, 0.5), matrix: M(-1.1, 0.4, 0.9), aPart: 0 },
    { geo: box(0.9, 0.1, 0.5), matrix: M(-1.1, 0.4, -0.9), aPart: 0 },
    { geo: box(1.6, 0.45, 1.5), matrix: M(-0.1, 0.95, 0, 0, 0, -0.08), aPart: 1 },
  ], ['aPart']);
  const lights = merge([
    { geo: box(0.08, 0.1, 0.38), matrix: M(2.45, 0.42, 0.52), aPart: 0 },
    { geo: box(0.08, 0.1, 0.38), matrix: M(2.45, 0.42, -0.52), aPart: 0 },
    { geo: box(0.06, 0.08, 1.7), matrix: M(-2.52, 0.62, 0), aPart: 1 },
    { geo: new THREE.CircleGeometry(0.3, 12), matrix: M(-2.01, 0.38, 1.18, 0, -Math.PI / 2, 0), aPart: 2 },
    { geo: new THREE.CircleGeometry(0.3, 12), matrix: M(-2.01, 0.38, -1.18, 0, -Math.PI / 2, 0), aPart: 2 },
    { geo: box(3.4, 0.02, 0.08), matrix: M(0, 0.0, 0.82), aPart: 4 },
    { geo: box(3.4, 0.02, 0.08), matrix: M(0, 0.0, -0.82), aPart: 4 },
    { geo: box(0.25, 0.1, 0.3), matrix: M(-0.4, 1.33, 0.25), aPart: 3 },
    { geo: box(0.25, 0.1, 0.3), matrix: M(-0.4, 1.33, -0.25), aPart: 5 },
  ], ['aPart']);
  return { body, lights, length: 5, tailX: -2.5, engineZ: 1.18 };
}

export function haulerGeometry() {
  const shape = profileShape([[-4.2, 0], [3.6, 0], [4.3, 0.6], [4.3, 1.5], [3.4, 2.4], [-4.2, 2.4]]);
  const ex = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1, curveSegments: 1 });
  ex.translate(0, 0, -1.2);
  const parts = [{ geo: ex, aPart: 0 }];
  for (const [x, z] of [[-3, 1.8], [-3, -1.8], [2.6, 1.8], [2.6, -1.8]]) {
    parts.push({ geo: cyl(0.75, 0.75, 0.45, 14, true), matrix: M(x, 0.9, z), aPart: 0 });
    parts.push({ geo: box(1.2, 0.15, 0.4), matrix: M(x * 0.85, 0.9, z * 0.8), aPart: 0 });
  }
  parts.push({ geo: box(1.2, 0.9, 2.2), matrix: M(3.4, 1.55, 0), aPart: 1 });
  const body = merge(parts, ['aPart']);
  const lp = [
    { geo: box(0.08, 0.2, 0.5), matrix: M(4.35, 0.9, 0.8), aPart: 0 },
    { geo: box(0.08, 0.2, 0.5), matrix: M(4.35, 0.9, -0.8), aPart: 0 },
    { geo: box(0.06, 0.12, 2.4), matrix: M(-4.32, 2.2, 0), aPart: 1 },
    { geo: box(0.06, 0.12, 2.4), matrix: M(-4.32, 0.25, 0), aPart: 1 },
    { geo: box(8.2, 0.08, 0.06), matrix: M(0, 2.3, 1.32), aPart: 4 },
    { geo: box(8.2, 0.08, 0.06), matrix: M(0, 2.3, -1.32), aPart: 4 },
  ];
  for (const [x, z] of [[-3, 1.8], [-3, -1.8], [2.6, 1.8], [2.6, -1.8]]) lp.push({ geo: new THREE.CircleGeometry(0.62, 14), matrix: M(x, 0.75, z, Math.PI / 2, 0, 0), aPart: 2 });
  return { body, lights: merge(lp, ['aPart']), length: 8.6, tailX: -4.3, engineZ: 1.8 };
}

export function groundCarGeometry() {
  const shape = profileShape([[-2.3, 0.25], [2.25, 0.25], [2.35, 0.6], [1.2, 0.8], [0.4, 1.3], [-1.0, 1.32], [-2.1, 0.95], [-2.35, 0.7]]);
  const ex = new THREE.ExtrudeGeometry(shape, { depth: 1.75, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 1 });
  ex.translate(0, 0, -0.875);
  const parts = [{ geo: ex, aPart: 0 }, { geo: box(1.5, 0.42, 1.6), matrix: M(-0.25, 1.08, 0, 0, 0, -0.06), aPart: 1 }];
  for (const [x, z] of [[1.4, 0.9], [1.4, -0.9], [-1.45, 0.9], [-1.45, -0.9]]) parts.push({ geo: cyl(0.33, 0.33, 0.25, 12), matrix: M(x, 0.33, z, Math.PI / 2, 0, 0), aPart: 1 });
  const body = merge(parts, ['aPart']);
  const lights = merge([
    { geo: box(0.06, 0.1, 0.42), matrix: M(2.38, 0.55, 0.55), aPart: 0 },
    { geo: box(0.06, 0.1, 0.42), matrix: M(2.38, 0.55, -0.55), aPart: 0 },
    { geo: box(0.06, 0.08, 1.7), matrix: M(-2.4, 0.75, 0), aPart: 1 },
    { geo: box(4.0, 0.03, 0.05), matrix: M(0, 0.22, 0.9), aPart: 4 },
    { geo: box(4.0, 0.03, 0.05), matrix: M(0, 0.22, -0.9), aPart: 4 },
  ], ['aPart']);
  return { body, lights, length: 4.8, tailX: -2.42, engineZ: 0.6 };
}

/** Additive light-trail ribbon, from x=0 back to x=-1 (scaled per instance). */
export function trailGeometry(z) {
  const parts = [];
  for (const zz of [z, -z]) {
    parts.push({ geo: new THREE.PlaneGeometry(1, 0.22).translate(-0.5, 0, 0), matrix: M(0, 0, zz) });
    parts.push({ geo: new THREE.PlaneGeometry(1, 0.22).translate(-0.5, 0, 0), matrix: M(0, 0, zz, Math.PI / 2, 0, 0) });
  }
  return merge(parts);
}

// ---------------- people ----------------
/** Pedestrian silhouette. aPart: 0 torso/head, 1 left leg, 2 right leg, 3 left arm, 4 right arm. */
export function pedestrianGeometry() {
  return merge([
    { geo: cyl(0.17, 0.27, 0.95, 10), matrix: M(0, 1.02, 0), aPart: 0 },
    { geo: cyl(0.2, 0.17, 0.3, 10), matrix: M(0, 1.42, 0), aPart: 0 },
    { geo: new THREE.SphereGeometry(0.115, 10, 8), matrix: M(0, 1.68, 0.01, 0, 0, 0, 1, 1.12, 1), aPart: 0 },
    { geo: cyl(0.1, 0.1, 0.05, 8), matrix: M(0, 1.55, 0), aPart: 0 },
    { geo: cyl(0.075, 0.06, 0.92, 6).translate(0, -0.46, 0), matrix: M(0.1, 0.92, 0), aPart: 1 },
    { geo: cyl(0.075, 0.06, 0.92, 6).translate(0, -0.46, 0), matrix: M(-0.1, 0.92, 0), aPart: 2 },
    { geo: cyl(0.06, 0.05, 0.68, 6).translate(0, -0.34, 0), matrix: M(0.23, 1.5, 0), aPart: 3 },
    { geo: cyl(0.06, 0.05, 0.68, 6).translate(0, -0.34, 0), matrix: M(-0.23, 1.5, 0), aPart: 4 },
  ], ['aPart']);
}

/** LED umbrella. aPart: 0 canopy, 1 rim, 2 shaft. */
export function umbrellaGeometry() {
  return merge([
    { geo: new THREE.ConeGeometry(0.62, 0.32, 14, 1, true), matrix: M(0, 2.12, 0), aPart: 0 },
    { geo: cyl(0.62, 0.62, 0.03, 14, true), matrix: M(0, 1.965, 0), aPart: 1 },
    { geo: cyl(0.012, 0.012, 1.15, 4), matrix: M(0.18, 1.6, 0.1), aPart: 2 },
  ], ['aPart']);
}

export function trainCarGeometry(len = 14) {
  const s = new THREE.Shape();
  const w = 1.5, h = 3.0, r = 0.6;
  s.moveTo(-w + r, 0); s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r); s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, r); s.quadraticCurveTo(-w, 0, -w + r, 0);
  const ex = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 3 });
  ex.translate(0, 0, -len / 2);
  ex.rotateY(Math.PI / 2); // length along x
  const body = merge([{ geo: ex }]);
  const lights = merge([
    { geo: box(len * 0.92, 0.7, 0.02), matrix: M(0, 1.9, 1.51), aPart: 0 },
    { geo: box(len * 0.92, 0.7, 0.02), matrix: M(0, 1.9, -1.51), aPart: 0 },
    { geo: box(len, 0.08, 0.02), matrix: M(0, 0.5, 1.51), aPart: 1 },
    { geo: box(len, 0.08, 0.02), matrix: M(0, 0.5, -1.51), aPart: 1 },
  ], ['aPart']);
  return { body, lights };
}

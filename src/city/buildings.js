import * as THREE from 'three';
import { createBuildingMaterial } from '../fx/buildingMaterial.js';
import { ChunkedInstances, composeMatrix } from './chunks.js';

function flat(g) { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; }

export function buildBuildings(layout, group) {
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1).translate(0, 0.5, 0),
    hex: flat(new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).translate(0, 0.5, 0)),
    oct: flat(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).translate(0, 0.5, 0)),
    pyr: flat(new THREE.CylinderGeometry(0.03, 0.5, 1, 4, 1).translate(0, 0.5, 0)),
  };
  const segs = { box: 4, cyl: 28, hex: 6, oct: 8, pyr: 4 };
  const byShape = {};
  for (const t of layout.tiers) (byShape[t.shape] ||= []).push(t);
  const sets = [];
  for (const [shape, items] of Object.entries(byShape)) {
    const set = new ChunkedInstances({
      items, geometry: geos[shape], material: createBuildingMaterial(shape, segs[shape]),
      chunk: 410, attributes: { aB0: 4, aTrim: 3 }, castShadow: true, receiveShadow: true, color: true,
      name: 'building', group,
      write: {
        pos: (t) => t,
        matrix: (t, m) => composeMatrix(m, t.x, t.y, t.z, t.rot, t.sx, t.sy, t.sz),
        attrs: (t, i, a) => {
          a.aB0.setXYZW(i, t.style, t.seed, t.lit, t.trim);
          a.aTrim.setXYZ(i, t.trimCol.r, t.trimCol.g, t.trimCol.b);
        },
        color: (t, c) => c.copy(t.tint),
      },
    });
    for (const m of set.meshes) m.userData.kind = 'building';
    sets.push(set);
  }
  return sets;
}

import * as THREE from 'three';

// Splits a large list of instances into spatial chunks, each its own InstancedMesh.
// Chunks get tight bounding spheres for frustum culling, and an optional maxDist
// gives cheap distance-based LOD (small props vanish into the fog).
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

export function composeMatrix(out, x, y, z, rotY, sx, sy, sz, rotX = 0, rotZ = 0) {
  _p.set(x, y, z);
  if (rotX || rotZ) _q.setFromEuler(_e.set(rotX, rotY, rotZ, 'YXZ'));
  else _q.setFromAxisAngle(_up, rotY);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

export class ChunkedInstances {
  constructor({ items, geometry, material, chunk = 410, attributes = {}, write, castShadow = false, receiveShadow = true, maxDist = Infinity, layer = 0, color = false, name = '', group }) {
    this.meshes = [];
    this.maxDist = maxDist;
    const buckets = new Map();
    for (const it of items) {
      const p = write.pos(it);
      const key = Math.floor(p.x / chunk) + ',' + Math.floor(p.z / chunk);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = name;
      const attrs = {};
      for (const [k, size] of Object.entries(attributes)) {
        attrs[k] = new THREE.InstancedBufferAttribute(new Float32Array(list.length * size), size);
      }
      // InstancedBufferAttributes must live on a per-mesh geometry clone
      if (Object.keys(attributes).length) {
        mesh.geometry = geometry.clone();
        for (const [k, a] of Object.entries(attrs)) mesh.geometry.setAttribute(k, a);
      }
      const col = new THREE.Color();
      list.forEach((it, i) => {
        write.matrix(it, _m);
        mesh.setMatrixAt(i, _m);
        if (write.attrs) write.attrs(it, i, attrs);
        if (color && write.color) { write.color(it, col); mesh.setColorAt(i, col); }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      mesh.layers.set(layer);
      mesh.userData.items = list;
      mesh.userData.center = mesh.boundingSphere.center.clone();
      mesh.userData.radius = mesh.boundingSphere.radius;
      this.meshes.push(mesh);
      if (group) group.add(mesh);
    }
  }

  update(camPos) {
    if (this.maxDist === Infinity) return;
    for (const m of this.meshes) {
      m.visible = m.userData.center.distanceTo(camPos) - m.userData.radius < this.maxDist;
    }
  }
}

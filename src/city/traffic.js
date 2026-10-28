import * as THREE from 'three';
import { CFG, Rand, NEON_LIST, U, streetLine, HALF } from '../config.js';
import { createGlowMaterial, createBeamMaterial } from '../fx/materials.js';
import { rectPath } from './paths.js';
import * as G from './geom.js';

// Air and ground traffic. Lane traffic follows the street corridors at fixed
// altitudes (bridges and the maglev live in bands the lanes avoid). Free flyers
// loop around street rectangles and bank into their turns from the actual
// centripetal acceleration. Everything is instanced and updated by writing
// matrices straight into the instance buffers.

const _f = new THREE.Vector3(), _up = new THREE.Vector3(), _z = new THREE.Vector3(), _y = new THREE.Vector3();

function writeBasis(arr, o, px, py, pz, fx, fy, fz, ux, uy, uz, sx, sy = sx, sz = sx) {
  _f.set(fx, fy, fz).normalize();
  _up.set(ux, uy, uz);
  _z.crossVectors(_f, _up).normalize();
  _y.crossVectors(_z, _f);
  arr[o] = _f.x * sx; arr[o + 1] = _f.y * sx; arr[o + 2] = _f.z * sx; arr[o + 3] = 0;
  arr[o + 4] = _y.x * sy; arr[o + 5] = _y.y * sy; arr[o + 6] = _y.z * sy; arr[o + 7] = 0;
  arr[o + 8] = _z.x * sz; arr[o + 9] = _z.y * sz; arr[o + 10] = _z.z * sz; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}

function vehicleBodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.75, envMapIntensity: 1.2 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; varying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vPart > 0.5) diffuseColor.rgb = vec3(0.02, 0.025, 0.035);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vPart > 0.5) roughnessFactor = 0.05;');
  };
  m.customProgramCacheKey = () => 'vehicle-body';
  return m;
}

function trailMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv2; varying vec3 vC;
      #include <fog_pars_vertex>
      void main(){ vUv2 = uv; vC = vec3(1.0, 0.1, 0.15);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 vUv2; varying vec3 vC;
      #include <fog_pars_fragment>
      void main(){ float a = pow(vUv2.x, 2.5) * (1.0 - abs(vUv2.y - 0.5) * 2.0);
        gl_FragColor = vec4(vC * a * 2.2, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity * 0.6);
        #endif
      }`,
  });
}

class Fleet {
  constructor(name, model, count, group, { trails = true, police = false, scale = 1 } = {}) {
    this.name = name; this.model = model; this.list = []; this.scale = scale;
    this.body = new THREE.InstancedMesh(model.body, vehicleBodyMaterial(), count);
    this.body.castShadow = true; this.body.receiveShadow = true;
    const strobe = police ? 'if (part == 3) c *= step(0.5, fract(uTime * 3.0 + seed)); if (part == 5) c *= step(0.5, fract(uTime * 3.0 + seed + 0.5));' : 'if (part == 3 || part == 5) c *= 0.0;';
    this.lights = new THREE.InstancedMesh(model.lights, createGlowMaterial({
      colors: [new THREE.Color(1, 0.95, 0.85).multiplyScalar(10), new THREE.Color(1, 0.04, 0.08).multiplyScalar(8), new THREE.Color(5, 5, 5), new THREE.Color(1, 0.05, 0.05).multiplyScalar(14), new THREE.Color(2, 2, 2), new THREE.Color(0.1, 0.25, 1).multiplyScalar(14)],
      instMask: [0, 0, 1, 0, 1, 0], night: 0.5, fogK: 0.35, anim: strobe,
    }), count);
    for (const m of [this.body, this.lights]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      group.add(m);
    }
    this.body.userData.kind = 'vehicle';
    this.body.userData.fleet = this;
    this.lights.userData.kind = 'vehicle';
    this.lights.userData.fleet = this;
    this.cap = count;
    if (trails) {
      this.trail = new THREE.InstancedMesh(G.trailGeometry(model.engineZ), trailMaterial(), count);
      this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.trail.frustumCulled = false;
      this.trail.layers.set(2);
      this.trail.count = 0;
      group.add(this.trail);
    }
  }
  add(v) {
    if (this.list.length >= this.cap) return null;
    v.fleet = this; v.index = this.list.length; this.list.push(v);
    const c = v.paint;
    this.body.setColorAt(v.index, c);
    this.lights.setColorAt(v.index, v.glow);
    if (this.trail) this.trail.setColorAt(v.index, v.trailCol);
    this.body.count = this.lights.count = this.list.length;
    if (this.trail) this.trail.count = this.list.length;
    return v;
  }
  finalize() {
    for (const m of [this.body, this.lights, this.trail]) if (m && m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

const CALL = 'ABCDEFHJKLMNPRSTVXZ';
const OPERATORS = ['Hyperion Logistics', 'Kagami Cab Co.', 'NKPD Air Patrol', 'Private', 'Orbital Lines Shuttle', 'Ryu Motors Fleet', 'Zero-G Delivery', 'Okami Security'];
const DESTS = ['Shinjuku Arcology', 'Spaceport 3', 'Kaidō Plaza', 'Lower Kowloon', 'Harbour Stacks', 'Corporate Ring', 'Hyperion HQ', 'Old Town Market'];

export function buildTraffic(layout, details, group) {
  const R = new Rand(808);
  const spinner = G.spinnerGeometry(), hauler = G.haulerGeometry(), car = G.groundCarGeometry();
  const fleets = {
    spinner: new Fleet('Spinner', spinner, 900, group),
    police: new Fleet('Police Spinner', spinner, 60, group, { police: true }),
    hauler: new Fleet('Cargo Hauler', hauler, 160, group),
    car: new Fleet('Ground Car', car, 500, group, { trails: false }),
  };
  const paints = [0x1a1d24, 0x2b2f38, 0x5a0f1a, 0x0e2a3a, 0xd8d8dc, 0x14161a, 0x3a2a12, 0x222244, 0x0a3a2a];
  const mk = (fleet, extra) => {
    const police = fleet === fleets.police;
    const glow = new THREE.Color(police ? 0x2a6bff : R.pick(NEON_LIST));
    return fleet.add({
      paint: new THREE.Color(police ? 0x0b0c10 : R.pick(paints)),
      glow, trailCol: R.chance(0.6) ? new THREE.Color(1, 0.08, 0.12) : glow.clone().multiplyScalar(0.8),
      call: `${CALL[R.int(0, CALL.length - 1)]}${CALL[R.int(0, CALL.length - 1)]}-${R.int(1000, 9999)}`,
      operator: police ? 'NKPD Air Patrol' : R.pick(OPERATORS),
      dest: R.pick(DESTS),
      pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 0, up: new THREE.Vector3(0, 1, 0),
      ...extra,
    });
  };

  // ---- lane traffic ----
  const L = 9.5 * CFG.PITCH;
  for (let axis = 0; axis < 2; axis++) {
    for (let k = 0; k < CFG.GRID - 1; k++) {
      const line = streetLine(k);
      const alts = CFG.LANE_ALTS.filter(() => R.chance(0.45));
      for (const alt of alts) {
        for (const dir of [1, -1]) {
          const speed = (18 + alt * 0.12) * R.range(0.85, 1.2);
          const n = R.int(4, 7);
          const off = R.next() * 2 * L;
          for (let i = 0; i < n; i++) {
            const roll = R.next();
            const fleet = roll < 0.12 ? fleets.hauler : roll < 0.16 ? fleets.police : fleets.spinner;
            mk(fleet, { mode: 'lane', axis, line: line + dir * 4.2 + R.range(-0.8, 0.8), alt: alt + R.range(-1.5, 1.5), sgn: dir, speed, s0: off + (i / n) * 2 * L + R.range(-30, 30), L, wob: R.next() * 10 });
          }
        }
      }
    }
  }
  // ---- free flyers on street-aligned loops ----
  const freeAlts = [92, 120, 155, 195, 260, 300];
  for (let i = 0; i < 70; i++) {
    const a = R.int(0, CFG.GRID - 4), b = R.int(a + 2, Math.min(CFG.GRID - 2, a + 7));
    const c = R.int(0, CFG.GRID - 4), d = R.int(c + 2, Math.min(CFG.GRID - 2, c + 7));
    const path = rectPath(streetLine(a), streetLine(c), streetLine(b), streetLine(d), 7);
    const fleet = R.chance(0.1) ? fleets.police : R.chance(0.1) ? fleets.hauler : fleets.spinner;
    mk(fleet, { mode: 'loop', path, s0: R.next() * path.length, speed: R.range(24, 46) * (R.chance(0.5) ? 1 : -1), alt: R.pick(freeAlts) + R.range(-4, 4), wob: R.next() * 10, lat: R.range(-3, 3) });
  }
  // ---- ground cars ----
  const GL = HALF * CFG.PITCH + 40;
  for (let axis = 0; axis < 2; axis++) {
    for (let k = 0; k < CFG.GRID - 1; k++) {
      const line = streetLine(k);
      for (const [off, dir] of [[2.4, 1], [6.3, 1], [-2.4, -1], [-6.3, -1]]) {
        const n = R.int(2, 5);
        const speed = R.range(9, 15);
        const s0 = R.next() * 2 * GL;
        for (let i = 0; i < n; i++) mk(fleets.car, { mode: 'ground', axis, line: line + off, sgn: dir, speed, s0: s0 + (i / n) * 2 * GL + R.range(-10, 10), L: GL, wob: R.next() * 10 });
      }
    }
  }
  for (const f of Object.values(fleets)) f.finalize();

  // ---- maglev train ----
  const tg = G.trainCarGeometry(14);
  const trainBody = new THREE.InstancedMesh(tg.body, new THREE.MeshStandardMaterial({ color: 0xc8ccd6, roughness: 0.25, metalness: 0.85 }), 6);
  const trainLights = new THREE.InstancedMesh(tg.lights, createGlowMaterial({ colors: [new THREE.Color(1, 0.82, 0.6).multiplyScalar(3), new THREE.Color(NEON_LIST[0]).multiplyScalar(5)], night: 0.6 }), 6);
  for (const m of [trainBody, trainLights]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }
  trainBody.castShadow = true;
  trainBody.userData.kind = 'train';
  const train = { body: trainBody, lights: trainLights, path: details.trainPath, speed: 24, s: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3() };

  // ---- police drone with a shadow-casting search spotlight ----
  const dronePath = rectPath(streetLine(4), streetLine(4), streetLine(7), streetLine(7), 9);
  const drone = { path: dronePath, s: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3() };
  const spot = new THREE.SpotLight(0xd8ecff, 9000, 160, 0.32, 0.55, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 2; spot.shadow.camera.far = 160;
  spot.shadow.bias = -0.0004;
  group.add(spot, spot.target);
  const droneBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 14, 60, 24, 1, true).translate(0, -30, 0), createBeamMaterial({ color: 0xd8ecff, intensity: 0.18, rainBoost: 0.6, tipFade: false, night: 0.7 }));
  droneBeam.layers.set(2);
  droneBeam.renderOrder = 6;
  group.add(droneBeam);
  const droneVehicle = mk(fleets.police, { mode: 'drone', call: 'NKPD-07', operator: 'NKPD Air Patrol', dest: 'Patrol sector 7' });
  fleets.police.finalize();

  return { fleets, train, drone, spot, droneBeam, droneVehicle };
}

const _tmp = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export function updateTraffic(T, time, dt) {
  for (const fleet of Object.values(T.fleets)) {
    const B = fleet.body.instanceMatrix.array, Lt = fleet.lights.instanceMatrix.array, Tr = fleet.trail ? fleet.trail.instanceMatrix.array : null;
    const m = fleet.model;
    for (const v of fleet.list) {
      let fx, fy = 0, fz, ux = 0, uy = 1, uz = 0;
      if (v.mode === 'lane' || v.mode === 'ground') {
        const s = ((v.s0 + v.speed * time) % (2 * v.L)) - v.L;
        const p = s * v.sgn;
        const bob = v.mode === 'lane' ? Math.sin(time * 0.7 + v.wob) * 0.5 : 0;
        if (v.axis === 0) { v.pos.set(v.line, (v.mode === 'lane' ? v.alt : 0) + bob, p); fx = 0; fz = v.sgn; }
        else { v.pos.set(p, (v.mode === 'lane' ? v.alt : 0) + bob, v.line); fx = v.sgn; fz = 0; }
        if (v.mode === 'lane') { ux = Math.sin(time * 0.9 + v.wob) * 0.03; uz = Math.cos(time * 0.8 + v.wob) * 0.03; }
        v.vel = v.speed;
      } else if (v.mode === 'loop') {
        const s = v.s0 + v.speed * time;
        const sg = Math.sign(v.speed), sp = Math.abs(v.speed);
        const p = v.path.at(s); const px = p.x, pz = p.z, dx = p.dx * sg, dz = p.dz * sg;
        const q1 = v.path.at(s + v.speed * 0.9); const q1x = q1.dx, q1z = q1.dz;
        const q0 = v.path.at(s - v.speed * 0.9);
        const ax = (q1x - q0.dx) * sg / 1.8 * sp, az = (q1z - q0.dz) * sg / 1.8 * sp;
        // lateral offset (keeps flyers to one side of the corridor)
        v.pos.set(px - dz * v.lat, v.alt + Math.sin(time * 0.35 + v.wob) * 5, pz + dx * v.lat);
        fx = dx; fz = dz; fy = Math.cos(time * 0.35 + v.wob) * 5 * 0.35 / sp;
        ux = ax * 0.025; uz = az * 0.025;
        const hm = Math.hypot(ux, uz); if (hm > 0.8) { ux *= 0.8 / hm; uz *= 0.8 / hm; }
        v.vel = Math.abs(v.speed);
      } else if (v.mode === 'drone') {
        const D = T.drone;
        D.s = time * 11;
        const p = D.path.at(D.s);
        v.pos.set(p.x, 34 + Math.sin(time * 0.5) * 3, p.z);
        fx = p.dx; fz = p.dz; fy = -0.08;
        ux = Math.sin(time * 1.3) * 0.04; uz = Math.cos(time * 1.1) * 0.04;
        D.pos.copy(v.pos); D.dir.set(p.dx, 0, p.dz);
        v.vel = 11;
      }
      v.dir.set(fx, fy, fz).normalize();
      v.up.set(ux, uy, uz).normalize();
      const o = v.index * 16;
      const sc = fleet.scale;
      writeBasis(B, o, v.pos.x, v.pos.y, v.pos.z, fx, fy, fz, ux, uy, uz, sc);
      for (let i = 0; i < 16; i++) Lt[o + i] = B[o + i];
      if (Tr) {
        const len = Math.min(26, v.vel * 0.45);
        const tx = v.pos.x + v.dir.x * m.tailX, ty = v.pos.y + v.dir.y * m.tailX + 0.45, tz = v.pos.z + v.dir.z * m.tailX;
        writeBasis(Tr, o, tx, ty, tz, fx, fy, fz, ux, uy, uz, len, 1, 1);
      }
    }
    fleet.body.instanceMatrix.needsUpdate = true;
    fleet.lights.instanceMatrix.needsUpdate = true;
    if (fleet.trail) fleet.trail.instanceMatrix.needsUpdate = true;
  }

  // train
  const tr = T.train;
  tr.s = time * tr.speed;
  const A = tr.body.instanceMatrix.array, AL = tr.lights.instanceMatrix.array;
  for (let i = 0; i < 6; i++) {
    const p = tr.path.at(tr.s - i * 15.2);
    writeBasis(A, i * 16, p.x, CFG.TRAIN_Y - 0.25, p.z, p.dx, 0, p.dz, 0, 1, 0, 1);
    for (let k = 0; k < 16; k++) AL[i * 16 + k] = A[i * 16 + k];
    if (i === 0) { tr.pos.set(p.x, CFG.TRAIN_Y + 1.5, p.z); tr.dir.set(p.dx, 0, p.dz); }
  }
  tr.body.instanceMatrix.needsUpdate = true; tr.lights.instanceMatrix.needsUpdate = true;

  // drone spotlight sweeps around below the drone
  const D = T.drone;
  const sweep = time * 0.7;
  _tmp.set(D.pos.x + D.dir.x * 14 + Math.sin(sweep) * 10, 0, D.pos.z + D.dir.z * 14 + Math.cos(sweep * 1.3) * 10);
  T.spot.position.copy(D.pos).y -= 0.8;
  T.spot.target.position.copy(_tmp);
  T.spot.target.updateMatrixWorld();
  T.droneBeam.position.copy(T.spot.position);
  _a.subVectors(_tmp, T.spot.position).normalize();
  T.droneBeam.quaternion.setFromUnitVectors(_b.set(0, -1, 0), _a);
  const len = T.spot.position.distanceTo(_tmp);
  T.droneBeam.scale.set(1, len / 60, 1);
}

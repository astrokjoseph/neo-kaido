import * as THREE from 'three';
import { CFG, HALF, Rand, streetLine, smoothstep, lerp } from './config.js';

// Cinematic director: a rotating set of procedurally-placed shots (street dolly,
// plaza orbit, crane up a tower, chase cam, aerial sweep, koi tracking, maglev
// ride, rooftop pan). Every shot is built from the city data so the camera stays
// in street corridors / open air. Shots are joined by a fade + glitch cut.

const ease = (t) => t * t * (3 - 2 * t);
const _t = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _rollQ = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

function aim(cam, target, roll = 0) {
  _m.lookAt(cam.position, target, cam.up.set(0, 1, 0));
  cam.quaternion.setFromRotationMatrix(_m);
  if (roll) cam.quaternion.multiply(_rollQ.setFromAxisAngle(_z, roll));
}

export class Cinematic {
  constructor(camera, world) {
    this.camera = camera; this.w = world;
    this.R = new Rand(Date.now() % 100000);
    this.speed = 1;
    this.fade = 1; this.glitch = 0;
    this.order = ['orbit', 'chase', 'crane', 'aerial', 'koi', 'street', 'train', 'rooftop', 'chase', 'street'];
    this.idx = -1;
    this.shot = null;
    this.label = '';
  }

  start() { this.idx = -1; this.next('street-first'); }

  next(force) {
    let name = force;
    if (!name) { this.idx = (this.idx + 1) % this.order.length; name = this.order[this.idx]; }
    const make = {
      'street-first': () => this.streetShot(true), street: () => this.streetShot(false), orbit: () => this.orbitShot(),
      crane: () => this.craneShot(), aerial: () => this.aerialShot(), chase: () => this.chaseShot(), koi: () => this.koiShot(),
      train: () => this.trainShot(), rooftop: () => this.rooftopShot(),
    }[name];
    this.shot = make() || this.orbitShot();
    this.t = 0;
    this.label = this.shot.label;
    this.camera.fov = this.shot.fov || 55;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.shot) this.start();
    this.t += dt * this.speed;
    const s = this.shot;
    if (this.t > s.duration) { this.next(); return this.update(0); }
    const u = this.t / s.duration;
    s.update(u, this.t);
    const fin = smoothstep(0, 0.7, this.t), fout = 1 - smoothstep(s.duration - 0.6, s.duration, this.t);
    this.fade = Math.min(fin, fout);
    this.glitch = Math.max(0, 1 - this.t / 0.35) * 0.8 + Math.max(0, (this.t - (s.duration - 0.25)) / 0.25) * 0.8;
  }

  // ------------------------------------------------------------------ shots
  streetShot(first) {
    const R = this.R, cam = this.camera;
    const k = first ? HALF : R.int(3, CFG.GRID - 5);
    const axis = first ? 0 : R.int(0, 1);
    const dir = first ? 1 : (R.chance(0.5) ? 1 : -1);
    const line = streetLine(k);
    const lat = (first ? -1 : R.chance(0.5) ? 1 : -1) * 6.6;
    const s0 = first ? -230 : R.range(-300, 100) * dir;
    const dur = 16, spd = 7.5;
    const h = R.range(2.8, 4.2);
    return {
      label: 'STREET LEVEL // ' + (axis ? 'EAST-WEST' : 'NORTH-SOUTH') + ' AVENUE ' + (k + 1), duration: dur, fov: 58,
      update: (u, t) => {
        const s = s0 + dir * spd * t;
        const sway = Math.sin(t * 0.6) * 0.3;
        if (axis === 0) cam.position.set(line + lat + sway, h + Math.sin(t * 0.9) * 0.15, s);
        else cam.position.set(s, h + Math.sin(t * 0.9) * 0.15, line + lat + sway);
        const ahead = 60;
        if (axis === 0) _t.set(line + lat * 0.2 + Math.sin(t * 0.3) * 4, h + 13 + Math.sin(t * 0.2) * 4, s + dir * ahead);
        else _t.set(s + dir * ahead, h + 13 + Math.sin(t * 0.2) * 4, line + lat * 0.2 + Math.sin(t * 0.3) * 4);
        aim(cam, _t, Math.sin(t * 0.4) * 0.02);
      },
    };
  }

  orbitShot() {
    const cam = this.camera, pc = this.w.holo.plaza, R = this.R;
    const a0 = R.next() * Math.PI * 2, dirA = R.chance(0.5) ? 1 : -1;
    return {
      label: 'KAIDŌ PLAZA // AETHER GLOBE', duration: 16, fov: 60,
      update: (u, t) => {
        const a = a0 + dirA * u * 1.6;
        const r = 45;
        cam.position.set(pc.x + Math.cos(a) * r, lerp(14, 52, ease(u)), pc.z + Math.sin(a) * r);
        aim(cam, _t.set(pc.x, lerp(40, 60, u), pc.z), dirA * -0.05);
      },
    };
  }

  craneShot() {
    const cam = this.camera, R = this.R, L = this.w.layout;
    const cands = L.faces.filter((f) => f.street && f.ground && L.buildings[f.building].height > 150 && Math.abs(f.plane) < 400 && Math.abs((f.u0 + f.u1) / 2) < 400);
    if (!cands.length) return null;
    const f = R.pick(cands);
    const b = L.buildings[f.building];
    const u = (f.u0 + f.u1) / 2;
    const d = 7.0;
    const H = b.height;
    return {
      label: 'ASCENT // ' + b.name.toUpperCase(), duration: 15, fov: 62,
      update: (p, t) => {
        const e = ease(p);
        const y = lerp(3, H * 0.92, e);
        const uu = u + Math.sin(t * 0.25) * 3;
        if (f.n[0] !== 0) cam.position.set(f.plane + f.n[0] * d, y, uu); else cam.position.set(uu, y, f.plane + f.n[1] * d);
        const ly = y + lerp(18, 60, e);
        if (f.n[0] !== 0) _t.set(f.plane - f.n[0] * 2, ly, u); else _t.set(u, ly, f.plane - f.n[1] * 2);
        aim(cam, _t);
      },
    };
  }

  aerialShot() {
    const cam = this.camera, R = this.R;
    const a = R.next() * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * 640, 540, Math.sin(a) * 640);
    const to = new THREE.Vector3(Math.cos(a + 1.1) * 520, 470, Math.sin(a + 1.1) * 520);
    return {
      label: 'AERIAL // NEO-KAIDŌ SKYLINE', duration: 18, fov: 52,
      update: (u) => {
        cam.position.lerpVectors(from, to, ease(u));
        aim(cam, _t.set(Math.cos(a + 0.6) * 60, 80, Math.sin(a + 0.6) * 60), 0.04);
      },
    };
  }

  chaseShot() {
    const cam = this.camera, R = this.R;
    const list = this.w.traffic.fleets.spinner.list.filter((v) => v.mode === 'lane' && v.alt > 75 && v.alt < 180);
    let v = null;
    for (let i = 0; i < 40 && !v; i++) {
      const c = R.pick(list);
      const along = c.axis === 0 ? c.pos.z : c.pos.x;
      if (Math.abs(along) < 380 && along * c.sgn < 0) v = c;
    }
    if (!v) return null;
    const off = R.range(14, 20), side = R.range(-2, 2);
    const pos = new THREE.Vector3();
    return {
      label: 'TRAFFIC CAM // ' + v.call, duration: 13, fov: 64, vehicle: v,
      update: (u, t) => {
        pos.copy(v.pos).addScaledVector(v.dir, -off);
        pos.y += 3.2 + Math.sin(t * 0.5) * 0.6;
        pos.x += v.dir.z * side; pos.z -= v.dir.x * side;
        cam.position.copy(pos);
        aim(cam, _t.copy(v.pos).addScaledVector(v.dir, 22).add(new THREE.Vector3(0, 1.5, 0)), Math.sin(t * 0.7) * 0.04);
      },
    };
  }

  koiShot() {
    const cam = this.camera, H = this.w.holo, pc = H.plaza;
    return {
      label: 'ART INSTALLATION // TWIN KOI', duration: 14, fov: 50,
      update: (u, t) => {
        const k = H.koi[0].mesh.position;
        const a = Math.atan2(k.z - pc.z, k.x - pc.x) - 0.55;
        cam.position.set(pc.x + Math.cos(a) * 46, k.y - 6, pc.z + Math.sin(a) * 46);
        aim(cam, _t.copy(k));
      },
    };
  }

  trainShot() {
    const cam = this.camera, tr = this.w.traffic.train;
    return {
      label: 'MAGLEV LINE 7 // LOOP', duration: 14, fov: 66,
      update: (u, t) => {
        const p = tr.path.at(tr.s + 4);
        cam.position.set(p.x, CFG.TRAIN_Y + 3.6, p.z);
        const q = tr.path.at(tr.s + 40);
        aim(cam, _t.set(q.x, CFG.TRAIN_Y + 6, q.z));
      },
    };
  }

  rooftopShot() {
    const cam = this.camera, R = this.R, L = this.w.layout;
    const cands = L.buildings.filter((b) => b.height > 55 && b.height < 150 && b.top.shape === 'box' && b.top.sx > 14 && !b.twist && Math.hypot(b.top.x, b.top.z) < 350);
    if (!cands.length) return null;
    const b = R.pick(cands), t0 = b.top;
    const toC = Math.atan2(-t0.z, -t0.x);
    const x = t0.x + Math.cos(toC) * (t0.sx / 2 - 2), z = t0.z + Math.sin(toC) * (t0.sz / 2 - 2);
    return {
      label: 'ROOFTOP // ' + b.name.toUpperCase(), duration: 15, fov: 56,
      update: (u, t) => {
        cam.position.set(x, b.height + 3 + u * 2, z);
        const a = toC + lerp(-0.45, 0.45, ease(u));
        aim(cam, _t.set(x + Math.cos(a) * 100, b.height + 25, z + Math.sin(a) * 100));
      },
    };
  }
}

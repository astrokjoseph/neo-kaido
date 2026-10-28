import * as THREE from 'three';
import { CFG, clamp } from './config.js';

// First-person walk (gravity, sprint, jump, head-bob, building collisions),
// free-flight aerial mode, and a chase cam for followed vehicles.

export class CollisionWorld {
  constructor(colliders) {
    this.cell = 41;
    this.map = new Map();
    for (const c of colliders) {
      const x0 = c.box ? c.x0 : c.x - c.r, x1 = c.box ? c.x1 : c.x + c.r;
      const z0 = c.box ? c.z0 : c.z - c.r, z1 = c.box ? c.z1 : c.z + c.r;
      for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
        for (let j = Math.floor(z0 / this.cell); j <= Math.floor(z1 / this.cell); j++) {
          const k = i + ',' + j;
          if (!this.map.has(k)) this.map.set(k, []);
          this.map.get(k).push(c);
        }
    }
  }
  /** Push p (Vector3) out of any collider overlapping at height range [p.y - below, p.y + above]. */
  resolve(p, r, below = 1.7, above = 0.3) {
    const list = this.map.get(Math.floor(p.x / this.cell) + ',' + Math.floor(p.z / this.cell));
    if (!list) return false;
    let hit = false;
    for (const c of list) {
      if (p.y + above < c.y0 || p.y - below > c.y1) continue;
      if (c.box) {
        const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
          else {
            // inside: exit through nearest side
            const ex = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z];
            const m = Math.min(...ex), k = ex.indexOf(m);
            if (k === 0) p.x = c.x0 - r; else if (k === 1) p.x = c.x1 + r; else if (k === 2) p.z = c.z0 - r; else p.z = c.z1 + r;
          }
          hit = true;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rr = c.r + r;
        if (d < rr) { if (d > 1e-6) { p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr; } else p.x = c.x + rr; hit = true; }
      }
    }
    return hit;
  }
  inside(p) {
    const list = this.map.get(Math.floor(p.x / this.cell) + ',' + Math.floor(p.z / this.cell));
    if (!list) return false;
    for (const c of list) {
      if (p.y < c.y0 || p.y > c.y1) continue;
      if (c.box ? (p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1) : Math.hypot(p.x - c.x, p.z - c.z) < c.r) return true;
    }
    return false;
  }
}

export function groundHeight(x, z) {
  const P = CFG.PITCH, B = CFG.BLOCK;
  const lx = ((x + B / 2) % P + P) % P, lz = ((z + B / 2) % P + P) % P;
  return lx < B && lz < B ? CFG.CURB : 0;
}

const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _mv = new THREE.Vector3();

export class PlayerControls {
  constructor(camera, dom, world) {
    this.camera = camera; this.dom = dom; this.world = world;
    this.mode = 'cinematic';
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.locked = false;
    this.sens = 1;
    this.speedMul = 1;
    this.wheelMul = 1;
    this.onGround = true;
    this.bob = 0;
    this.vy = 0;
    this.follow = null;
    this.dragging = false;
    this.dragMoved = 0;
    this.onClickLocked = null;
    this.onRequestLock = null;

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && this.mode !== 'cinematic') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.dom; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.look(e.movementX, e.movementY);
      else if (this.dragging && this.mode !== 'cinematic' && this.mode !== 'follow') { this.look(e.movementX, e.movementY); this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY); }
    });
    dom.addEventListener('mousedown', (e) => { if (e.button === 0) { this.dragging = true; this.dragMoved = 0; } });
    addEventListener('mouseup', () => { this.dragging = false; });
    dom.addEventListener('wheel', (e) => {
      if (this.mode === 'fly') { this.wheelMul = clamp(this.wheelMul * (e.deltaY > 0 ? 0.9 : 1.1), 0.2, 6); }
    }, { passive: true });
  }

  look(dx, dy) {
    const k = 0.0022 * this.sens;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.5, 1.5);
  }

  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = clamp(e.x, -1.5, 1.5);
  }

  lock() { if (!this.locked && this.dom.requestPointerLock) { try { const r = this.dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* unsupported */ } } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setMode(mode, opts = {}) {
    const prev = this.mode;
    this.mode = mode;
    this.follow = opts.follow || null;
    const cam = this.camera;
    if (mode === 'walk') {
      this.syncFromCamera();
      const p = cam.position.clone();
      p.y = groundHeight(p.x, p.z) + 1.7;
      if (prev === 'cinematic' || prev === 'follow' || this.world.inside(p) || this.world.inside(new THREE.Vector3(p.x, 0.9, p.z))) {
        const s = opts.spawn;
        if (s) { p.set(s.x, groundHeight(s.x, s.z) + 1.7, s.z); this.yaw = s.yaw; this.pitch = 0.05; }
      }
      cam.position.copy(p);
      this.vel.set(0, 0, 0); this.vy = 0; this.lastBob = 0;
      cam.fov = 72;
    } else if (mode === 'fly') {
      this.syncFromCamera();
      if (opts.aerial) {
        cam.position.y = Math.max(cam.position.y, 150);
        this.pitch = -0.38;
      }
      this.vel.set(0, 0, 0);
      cam.fov = 68;
    } else if (mode === 'follow') {
      cam.fov = 62;
    }
    cam.updateProjectionMatrix();
  }

  update(dt) {
    const cam = this.camera;
    const k = this.keys;
    if (this.mode === 'walk' || this.mode === 'fly') {
      cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      _fw.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _rt.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      _mv.set(0, 0, 0);
      if (k.has('KeyW') || k.has('ArrowUp')) _mv.add(_fw);
      if (k.has('KeyS') || k.has('ArrowDown')) _mv.sub(_fw);
      if (k.has('KeyD') || k.has('ArrowRight')) _mv.add(_rt);
      if (k.has('KeyA') || k.has('ArrowLeft')) _mv.sub(_rt);
      const fast = k.has('ShiftLeft') || k.has('ShiftRight');
      if (this.mode === 'walk') {
        if (_mv.lengthSq() > 0) _mv.normalize();
        const speed = (fast ? 9 : 4.2) * this.speedMul;
        const a = 1 - Math.exp(-dt * 10);
        this.vel.x += (_mv.x * speed - this.vel.x) * a;
        this.vel.z += (_mv.z * speed - this.vel.z) * a;
        cam.position.x += this.vel.x * dt; cam.position.z += this.vel.z * dt;
        const gh = groundHeight(cam.position.x, cam.position.z);
        if (k.has('Space') && this.onGround) { this.vy = 5.5; this.onGround = false; }
        this.vy -= 18 * dt;
        let feet = cam.position.y - 1.7 - (this.lastBob || 0) + this.vy * dt;
        if (feet <= gh) { feet = gh; this.vy = 0; this.onGround = true; }
        // step up the curb smoothly
        const hv = Math.hypot(this.vel.x, this.vel.z);
        this.bob += hv * dt * 1.9;
        cam.position.y = feet + 1.7;
        this.world.resolve(cam.position, 0.45, 1.6, 0.2);
        this.bobAmp = Math.min(1, hv / 4);
        this.lastBob = this.bobOffset();
        cam.position.y += this.lastBob;
      } else {
        // pitch-aware flight
        const fwd3 = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        _mv.set(0, 0, 0);
        if (k.has('KeyW') || k.has('ArrowUp')) _mv.add(fwd3);
        if (k.has('KeyS') || k.has('ArrowDown')) _mv.sub(fwd3);
        if (k.has('KeyD') || k.has('ArrowRight')) _mv.add(_rt);
        if (k.has('KeyA') || k.has('ArrowLeft')) _mv.sub(_rt);
        if (k.has('Space') || k.has('KeyE')) _mv.y += 1;
        if (k.has('KeyC') || k.has('ControlLeft') || k.has('KeyQ')) _mv.y -= 1;
        if (_mv.lengthSq() > 0) _mv.normalize();
        const speed = 38 * this.speedMul * this.wheelMul * (fast ? 3 : 1);
        const a = 1 - Math.exp(-dt * 4);
        this.vel.lerp(_mv.multiplyScalar(speed), a);
        cam.position.addScaledVector(this.vel, dt);
        const gh = groundHeight(cam.position.x, cam.position.z) + 1.2;
        if (cam.position.y < gh) cam.position.y = gh;
        if (cam.position.y > 1400) cam.position.y = 1400;
        this.world.resolve(cam.position, 1.5, 1.0, 1.0);
      }
    } else if (this.mode === 'follow' && this.follow) {
      const v = this.follow;
      const back = v.fleet ? v.fleet.model.length * 2.6 + 6 : 16;
      const desired = new THREE.Vector3().copy(v.pos).addScaledVector(v.dir, -back).add(new THREE.Vector3(0, 3.5 + back * 0.12, 0));
      const a = 1 - Math.exp(-dt * 4);
      cam.position.lerp(desired, a);
      const look = new THREE.Vector3().copy(v.pos).addScaledVector(v.dir, 12);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, 1 - Math.exp(-dt * 6));
    }
  }

  bobOffset() { return this.mode === 'walk' ? Math.sin(this.bob * Math.PI) * 0.045 * (this.bobAmp || 0) : 0; }
}

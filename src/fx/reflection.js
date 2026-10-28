import * as THREE from 'three';

// Planar reflection of the whole scene across y = 0, rendered at reduced
// resolution into an HDR target. Ground/sidewalk materials sample it in
// screen-projected space with ripple distortion and vertical streak blur.
export class PlanarReflection {
  constructor() {
    this.enabled = true;
    this.scale = 0.5;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(0);
    this.matrix = { value: new THREE.Matrix4() };
    this.tex = { value: this.target.texture };
    this.strength = { value: 1 };
    this._n = new THREE.Vector3(0, 1, 0);
    this._p = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._camPos = new THREE.Vector3();
  }

  setSize(w, h) {
    this.target.setSize(Math.max(4, Math.floor(w * this.scale)), Math.max(4, Math.floor(h * this.scale)));
  }

  render(renderer, scene, camera) {
    if (!this.enabled) { this.strength.value = 0; return; }
    this.strength.value = 1;
    const vc = this.camera;
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    if (this._camPos.y <= 0.01) return;
    this._rot.extractRotation(camera.matrixWorld);
    this._view.copy(this._p).sub(this._camPos).reflect(this._n).negate().add(this._p);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._camPos);
    this._target.copy(this._p).sub(this._look).reflect(this._n).negate().add(this._p);
    vc.position.copy(this._view);
    vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(this._n);
    vc.lookAt(this._target);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.matrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.value.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // oblique near plane: clip everything below the mirror
    this._plane.setFromNormalAndCoplanarPoint(this._n, this._p).applyMatrix4(vc.matrixWorldInverse);
    this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(this._clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(this._clip.y) + pm[9]) / pm[5];
    q.z = -1.0;
    q.w = (1.0 + pm[10]) / pm[14];
    this._clip.multiplyScalar(2.0 / this._clip.dot(q));
    pm[2] = this._clip.x; pm[6] = this._clip.y; pm[10] = this._clip.z + 1.0 - 0.003; pm[14] = this._clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
  }
}

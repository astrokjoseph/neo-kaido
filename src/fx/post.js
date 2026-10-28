import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Render → bloom → anamorphic streaks → ACES tone map → cinematic grade
// (split-toning, chromatic aberration, vignette, grain, lightning flash and
// glitch transitions between cinematic shots).

const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

class StreakPass extends Pass {
  constructor(w, h) {
    super();
    this.strength = 0.3;
    const opts = { type: THREE.HalfFloatType };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, opts);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, opts);
    this.thr = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 2.5 } },
      vertexShader: quadVS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * max(l - uThreshold, 0.0) / max(l, 1e-3), 1.0); }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uStep: { value: 1 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: quadVS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uStep; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec3 s = vec3(0.0); float wsum = 0.0;
          for (int i = -6; i <= 6; i++){ float w = exp(-float(i*i) / 14.0); s += texture2D(tDiffuse, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb * w; wsum += w; }
          gl_FragColor = vec4(s / wsum, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tStreak: { value: null }, uStrength: { value: this.strength } },
      vertexShader: quadVS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tStreak; uniform float uStrength; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; vec3 s = texture2D(tStreak, vUv).rgb;
          gl_FragColor = vec4(c + s * vec3(0.55, 0.75, 1.25) * uStrength, 1.0); }`,
    });
    this.quad = new FullScreenQuad(null);
    this.setSize(w, h);
  }
  setSize(w, h) {
    const sw = Math.max(4, Math.floor(w / 4)), sh = Math.max(4, Math.floor(h / 4));
    this.rtA.setSize(sw, sh); this.rtB.setSize(sw, sh);
    this.blur.uniforms.uTexel.value.set(1 / sw, 1 / sh);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.quad.material = this.thr; this.thr.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
    this.quad.material = this.blur;
    let src = this.rtA, dst = this.rtB;
    for (const step of [1, 4, 12]) {
      this.blur.uniforms.tDiffuse.value = src.texture; this.blur.uniforms.uStep.value = step;
      renderer.setRenderTarget(dst); this.quad.render(renderer);
      [src, dst] = [dst, src];
    }
    this.quad.material = this.comp;
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.comp.uniforms.tStreak.value = src.texture;
    this.comp.uniforms.uStrength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.42 }, uGrain: { value: 0.045 }, uCA: { value: 0.0035 },
    uFlash: { value: 0 }, uFade: { value: 1 }, uGlitch: { value: 0 },
    uSat: { value: 1.12 }, uContrast: { value: 1.08 },
    uLift: { value: new THREE.Color(0.012, 0.018, 0.04) }, uGain: { value: new THREE.Color(1.04, 0.98, 1.02) },
  },
  vertexShader: quadVS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uVignette; uniform float uGrain; uniform float uCA;
    uniform float uFlash; uniform float uFade; uniform float uGlitch; uniform float uSat; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGain;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.0) {
        float row = floor(uv.y * 40.0);
        float g = step(1.0 - uGlitch * 0.6, hash(vec2(row, floor(uTime * 30.0))));
        uv.x += (hash(vec2(row * 1.3, floor(uTime * 25.0))) - 0.5) * 0.12 * g * uGlitch;
      }
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      float ca = uCA * (1.0 + uGlitch * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - d * ca * (0.3 + r2 * 4.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + d * ca * (0.3 + r2 * 4.0)).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col += uLift * (1.0 - smoothstep(0.0, 0.5, l));
      col *= mix(vec3(1.0), uGain, smoothstep(0.3, 1.0, l));
      col += vec3(0.75, 0.8, 1.0) * uFlash * 0.1;
      col *= 1.0 - uVignette * smoothstep(0.08, 0.55, r2);
      col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      col *= uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.samples = 4; this.bloomStrength = 0.45; this.streakOn = true;
    this.build();
  }
  build() {
    if (this.composer) { this.composer.dispose(); this.streak?.dispose(); }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // guard: a single NaN/Inf texel would otherwise smear across the whole bloom chain
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } }, vertexShader: quadVS,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); gl_FragColor = vec4(min(c, vec3(64.0)), 1.0); }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), this.bloomStrength, 0.32, 1.8);
    this.composer.addPass(this.bloom);
    this.streak = new StreakPass(size.x, size.y);
    this.streak.enabled = this.streakOn;
    this.composer.addPass(this.streak);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.streak.setSize(size.x, size.y);
    this.grade.uniforms.uRes.value.copy(size);
  }
  render(t) {
    this.grade.uniforms.uTime.value = t;
    this.bloom.strength = this.bloomStrength;
    this.composer.render();
  }
}

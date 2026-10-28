import * as THREE from 'three';
import { U } from '../config.js';
import { GLSL_NOISE } from './glsl.js';

// Night sky dome: light-polluted horizon, low storm clouds lit from below by the
// city, moon, sparse stars, and lightning that lights the cloud deck.
export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uCloud: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.55, -0.7).normalize() },
    uTime: U.uTime, uNight: U.uNight, uLightning: U.uLightning, uRain: U.uRain,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uFog, uCloud, uGlow, uSunDir, uSunCol, uMoonDir;
      uniform float uTime, uNight, uLightning, uRain;
      varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec3 dir = normalize(vW - cameraPosition);
        float h = dir.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.55, h), 0.55));
        col += uGlow * exp(-max(h, 0.0) * 9.0) * (0.4 + 0.6 * uNight);
        // stars
        vec2 sp = dir.xz / (abs(h) + 0.3) * 220.0;
        float st = step(0.9975, hash12(floor(sp))) * smoothstep(0.15, 0.5, h) * uNight * (1.0 - uRain * 0.85);
        col += vec3(0.8, 0.85, 1.0) * st * (0.5 + 0.5 * sin(uTime * 3.0 + hash12(floor(sp)) * 40.0));
        // moon
        float md = dot(dir, uMoonDir);
        col += vec3(0.75, 0.82, 1.0) * (smoothstep(0.9993, 0.9996, md) * 3.0 + pow(max(md, 0.0), 400.0) * 0.6) * uNight;
        // sun
        float sd = max(dot(dir, uSunDir), 0.0);
        col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * (1.0 - uNight);
        // clouds on a virtual plane
        if (h > 0.0) {
          vec2 cp = dir.xz / (h + 0.06) * 1.4;
          vec2 wind = vec2(uTime * 0.012, uTime * 0.004);
          float c1 = fbm(cp * 0.6 + wind);
          float c2 = fbm(cp * 1.7 - wind * 1.8 + c1 * 1.5);
          float cov = mix(0.5, 0.28, uRain);
          float cl = smoothstep(cov, cov + 0.35, c1 * 0.65 + c2 * 0.45);
          float under = exp(-h * 3.0);
          vec3 ccol = mix(uCloud * 0.4, uCloud * 1.2 + uGlow * 0.6 * under, c2);
          ccol += vec3(0.55, 0.6, 1.0) * uLightning * (0.6 + 1.4 * c2);
          col = mix(col, ccol, cl * smoothstep(0.0, 0.12, h) * 0.92);
        }
        col += vec3(0.35, 0.4, 0.7) * uLightning * 0.35;
        col = mix(uFog, col, smoothstep(-0.03, 0.09, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** A small neon-lit environment for PMREM so glass and metal have something to reflect. */
export function createEnvironment(renderer) {
  const scene = new THREE.Scene();
  const g = new THREE.SphereGeometry(50, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
      vec3 c = mix(vec3(0.12,0.04,0.12), vec3(0.01,0.012,0.03), smoothstep(-0.1,0.6,h));
      c += vec3(0.45,0.12,0.3) * exp(-abs(h)*8.0);
      c = mix(c, vec3(0.05,0.03,0.06), step(h, -0.05));
      gl_FragColor = vec4(c,1.0);}`,
  });
  scene.add(new THREE.Mesh(g, m));
  const cols = [0xff2a8a, 0x19e8ff, 0x8a5cff, 0xffa53a, 0x2a6bff, 0xff2a3a];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const c = new THREE.Color(cols[i % cols.length]).multiplyScalar(2.5 + (i % 3));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3 + (i % 4) * 2, 6 + (i % 5) * 3), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    p.position.set(Math.cos(a) * 40, -2 + (i % 6) * 4, Math.sin(a) * 40);
    p.lookAt(0, p.position.y, 0);
    scene.add(p);
  }
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.15, 0.12) }));
  strip.rotation.x = Math.PI / 2; strip.position.y = -12; scene.add(strip);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  return rt.texture;
}

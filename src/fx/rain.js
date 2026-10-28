import * as THREE from 'three';
import { U, Rand } from '../config.js';
import { GLSL_LAMPS, CITY_DEFINES } from './glsl.js';

// GPU rain: every drop lives on a world-fixed lattice that wraps around the
// camera, so thousands of streaks cost one draw call and zero CPU. Drops are
// motion-blurred along their velocity and catch light from nearby street lamps.

function quadInstances(count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size, fn] of attrs) {
    const a = new Float32Array(count * size);
    for (let i = 0; i < count; i++) fn(a, i * size);
    g.setAttribute(name, new THREE.InstancedBufferAttribute(a, size));
  }
  g.instanceCount = count;
  return g;
}

function rainMaterial({ box, width, length, alpha, speed }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uTime: U.uTime, uRain: U.uRain, uNight: U.uNight, uLampColor: U.uLampColor, uLightning: U.uLightning,
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uWind: { value: new THREE.Vector2(2.5, 1.0) }, uSpeed: { value: speed }, uWidth: { value: width }, uLen: { value: length }, uAlpha: { value: alpha },
      uAmbient: { value: new THREE.Color(0.35, 0.4, 0.55) },
    },
    defines: { ...CITY_DEFINES },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aRand;
      uniform float uTime; uniform float uRain; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind; uniform float uSpeed; uniform float uWidth; uniform float uLen;
      varying vec2 vUv2; varying float vFade; varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){
        vUv2 = uv;
        float spd = uSpeed * (0.8 + aRand.w * 0.4);
        float fall = uTime * spd;
        vec3 p = aRand.xyz * uBox;
        p.y -= fall;
        p.xz += uWind * fall / uSpeed;
        vec3 base = uCam - uBox * 0.5;
        vec3 wp = base + mod(p - base, uBox);
        vec3 vel = normalize(vec3(uWind.x, -uSpeed, uWind.y));
        vec3 toCam = normalize(uCam - wp);
        vec3 side = normalize(cross(vel, toCam));
        float on = step(aRand.w, uRain);
        float len = uLen * (0.7 + aRand.w * 0.6);
        wp += side * position.x * uWidth * on - vel * position.y * len * on;
        vFade = smoothstep(0.0, 2.0, length(uCam - wp)) * smoothstep(uBox.x * 0.5, uBox.x * 0.25, length((uCam - wp).xz)) * on;
        vFade *= step(0.0, wp.y);
        vWP = wp;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; uniform float uAlpha; uniform float uLightning; uniform vec3 uAmbient;
      varying vec2 vUv2; varying float vFade; varying vec3 vWP;
      #include <fog_pars_fragment>
      ${GLSL_LAMPS}
      void main(){
        float a = (1.0 - abs(vUv2.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv2.y) * smoothstep(1.0, 0.6, vUv2.y);
        float lamp = min(lampField(vWP) * 45.0, 2.0) * smoothstep(0.2, 0.5, uNight);
        vec3 c = uAmbient * (0.5 + 0.5 * (1.0 - uNight) * 2.0) + uLampColor * lamp + vec3(0.6, 0.7, 1.0) * uLightning * 2.0;
        gl_FragColor = vec4(c * a * vFade * uAlpha, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vWP, fogDensity) * 0.7;
        #endif
      }`,
  });
}

export function createRain(maxNear = 30000, maxFar = 9000) {
  const R = new Rand(31337);
  const rnd4 = (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = R.next(); a[o + 3] = R.next(); };
  const near = new THREE.Mesh(quadInstances(maxNear, [['aRand', 4, rnd4]]), rainMaterial({ box: [70, 46, 70], width: 0.018, length: 0.85, alpha: 0.55, speed: 24 }));
  const far = new THREE.Mesh(quadInstances(maxFar, [['aRand', 4, rnd4]]), rainMaterial({ box: [260, 140, 260], width: 0.09, length: 3.2, alpha: 0.16, speed: 22 }));
  for (const m of [near, far]) { m.frustumCulled = false; m.layers.set(2); m.renderOrder = 9; }

  // splashes: tiny expanding rings on the ground / sidewalk
  const splashN = 4000;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  sg.setIndex([0, 2, 1, 0, 3, 2]);
  const sr = new Float32Array(splashN * 4); for (let i = 0; i < splashN * 4; i++) sr[i] = R.next();
  sg.setAttribute('aRand', new THREE.InstancedBufferAttribute(sr, 4));
  sg.instanceCount = splashN;
  const splash = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime, uRain: U.uRain, uNight: U.uNight, uLampColor: U.uLampColor, uCam: { value: new THREE.Vector3() } },
    defines: { ...CITY_DEFINES },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aRand; uniform float uTime; uniform float uRain; uniform vec3 uCam;
      varying vec2 vUv2; varying float vLife; varying vec3 vWP;
      #include <fog_pars_vertex>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vUv2 = uv;
        float rate = 1.6 + aRand.z;
        float cyc = uTime * rate + aRand.w * 10.0;
        float id = floor(cyc); vLife = fract(cyc);
        vec2 q = vec2(h(aRand.xy + id), h(aRand.yx + id * 1.7)) * 56.0 - 28.0;
        vec3 wp = vec3(uCam.x + q.x, 0.0, uCam.z + q.y);
        vec2 L = mod(wp.xz + BLOCKW * 0.5, PITCH);
        wp.y = (L.x < BLOCKW && L.y < BLOCKW) ? 0.19 : 0.02;
        float r = 0.04 + vLife * 0.16;
        float on = step(aRand.x, uRain) * step(abs(uCam.y - wp.y), 60.0);
        wp.xz += position.xz * r * on;
        vWP = wp;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; varying vec2 vUv2; varying float vLife; varying vec3 vWP;
      #include <fog_pars_fragment>
      ${GLSL_LAMPS}
      void main(){
        float d = length(vUv2 - 0.5) * 2.0;
        float ring = smoothstep(0.75, 0.9, d) * smoothstep(1.0, 0.92, d);
        float a = ring * (1.0 - vLife) * 0.9 + (1.0 - smoothstep(0.0, 0.3, d)) * (1.0 - smoothstep(0.0, 0.25, vLife)) * 0.8;
        float lamp = min(lampField(vWP) * 50.0, 1.5) * smoothstep(0.2, 0.5, uNight);
        vec3 c = vec3(0.35, 0.42, 0.55) + uLampColor * lamp;
        gl_FragColor = vec4(c * a * 0.5, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vWP, fogDensity);
        #endif
      }`,
  }));
  splash.frustumCulled = false; splash.layers.set(2); splash.renderOrder = 9;

  const group = new THREE.Group();
  group.add(near, far, splash);
  const rain = {
    group, near, far, splash, maxNear, maxFar,
    setDensity(q) { near.geometry.instanceCount = Math.floor(maxNear * q); far.geometry.instanceCount = Math.floor(maxFar * q); splash.geometry.instanceCount = Math.floor(splashN * q); },
    update(cam) { near.material.uniforms.uCam.value.copy(cam); far.material.uniforms.uCam.value.copy(cam); splash.material.uniforms.uCam.value.copy(cam); },
  };
  return rain;
}

/** Steam plumes rising from manholes and food stalls. */
export function createSteam(emitters) {
  const per = 14;
  const n = emitters.length * per;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const E = new Float32Array(n * 4), P = new Float32Array(n * 2);
  const R = new Rand(77);
  emitters.forEach((e, i) => {
    for (let k = 0; k < per; k++) {
      const j = i * per + k;
      E[j * 4] = e.x; E[j * 4 + 1] = e.y; E[j * 4 + 2] = e.z; E[j * 4 + 3] = e.size;
      P[j * 2] = k / per + R.range(0, 0.05); P[j * 2 + 1] = R.next();
    }
  });
  g.setAttribute('aEmit', new THREE.InstancedBufferAttribute(E, 4));
  g.setAttribute('aPh', new THREE.InstancedBufferAttribute(P, 2));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime, uNight: U.uNight, uBurst: { value: new THREE.Vector4(0, 0, 0, -100) } },
    fog: true, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 aEmit; attribute vec2 aPh; uniform float uTime; uniform vec4 uBurst;
      varying vec2 vUv2; varying float vA;
      #include <fog_pars_vertex>
      void main(){
        vUv2 = uv;
        float burst = exp(-max(uTime - uBurst.w, 0.0) * 0.6) * step(distance(aEmit.xz, uBurst.xz), 1.5);
        float life = fract(uTime * (0.12 + 0.05 * aPh.y) * (1.0 + burst * 2.0) + aPh.x);
        float sz = aEmit.w * (0.8 + life * 4.5);
        vec3 c = aEmit.xyz + vec3(sin(aPh.y * 30.0 + uTime * 0.3) * life * 1.5 + life * 2.0, life * 9.0 * aEmit.w, cos(aPh.y * 20.0) * life * 1.2);
        vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * (0.55 + burst * 0.8);
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(c, 1.0);
        mvPosition.xy += position.xy * sz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; varying vec2 vUv2; varying float vA;
      #include <fog_pars_fragment>
      void main(){
        float d = length(vUv2 - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d); a *= a;
        vec3 c = mix(vec3(0.7, 0.72, 0.75), vec3(0.32, 0.28, 0.38), uNight);
        gl_FragColor = vec4(c, a * vA * 0.32);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.layers.set(2); mesh.renderOrder = 4;
  return { mesh, burst: mat.uniforms.uBurst };
}

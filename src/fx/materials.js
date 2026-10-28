import * as THREE from 'three';
import { U } from '../config.js';
import { GLSL_NOISE } from './glsl.js';

// Small library of custom materials: unlit HDR glow parts, volumetric-looking
// light beams, and holograms.

const FOG_FRAG = /* glsl */`
  #ifdef FOG_EXP2
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cityFogAmount(vFogWorldPos, fogDensity * FOGK));
  #endif`;

/**
 * Unlit emissive material. `colors` is indexed by the geometry's aPart attribute.
 * instMask[i] = 1 multiplies part i by the instance colour. night = how much the
 * part dims in daylight. Optional `anim` GLSL can modulate `c` (vars: part, seed, uTime).
 */
export function createGlowMaterial({ colors, instMask = [], night = 0.7, fogK = 0.55, anim = '', side = THREE.FrontSide, extraAttrs = '', extraVertex = '', transparent = false, blending = THREE.NormalBlending }) {
  const cols = [];
  for (let i = 0; i < 8; i++) cols.push(new THREE.Color(colors[i] ?? colors[colors.length - 1]));
  const mask = []; for (let i = 0; i < 8; i++) mask.push(instMask[i] ?? 0);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uColors: { value: cols }, uMask: { value: mask }, uNightK: { value: night },
      uTime: U.uTime, uNight: U.uNight, uNeon: U.uNeon,
    },
    fog: true, side, transparent, blending, depthWrite: !transparent,
    defines: { FOGK: fogK.toFixed(3) },
    vertexShader: /* glsl */`
      attribute float aPart; ${extraAttrs}
      uniform vec3 uColors[8]; uniform float uMask[8]; uniform float uTime;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main(){
        int part = int(aPart + 0.5);
        vec3 c = uColors[part];
        float seed = 0.0;
        #ifdef USE_INSTANCING
          seed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.0713);
        #endif
        #ifdef USE_INSTANCING_COLOR
          c = mix(c, c * instanceColor, uMask[part]);
        #endif
        ${anim}
        vCol = c;
        #include <begin_vertex>
        ${extraVertex}
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uNightK; uniform float uNight; uniform float uNeon;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main(){
        vec3 c = vCol * mix(1.0, 0.25 + 0.75 * uNight, uNightK) * uNeon;
        gl_FragColor = vec4(c, 1.0);
        ${FOG_FRAG}
      }`,
  });
}

/** Additive cone/beam with soft edges (fake volumetrics). uv.y runs along the beam. */
export function createBeamMaterial({ color = 0xffe2b0, intensity = 0.25, tipFade = true, rainBoost = 0.6, night = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity },
      uNight: U.uNight, uRain: U.uRain, uTime: U.uTime, uRainBoost: { value: rainBoost }, uNightK: { value: night },
    },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    defines: tipFade ? { TIPFADE: '' } : {},
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec2 vUv2; varying vec3 vIC;
      #include <fog_pars_vertex>
      void main(){
        vUv2 = uv;
        vIC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vIC = instanceColor;
        #endif
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        vN = normalize(transformedNormal);
        #include <begin_vertex>
        #include <project_vertex>
        vV = -mvPosition.xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity; uniform float uNight; uniform float uRain; uniform float uTime; uniform float uRainBoost; uniform float uNightK;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv2; varying vec3 vIC;
      #include <fog_pars_fragment>
      void main(){
        float edge = abs(dot(normalize(vN), normalize(vV)));
        edge = pow(edge, 1.6);
        float along = vUv2.y;
        #ifdef TIPFADE
          float fade = smoothstep(0.0, 0.25, along) * pow(along, 0.6);
        #else
          float fade = 1.0;
        #endif
        float k = uIntensity * edge * fade * (1.0 - uRainBoost + uRainBoost * uRain) * mix(1.0, uNight, uNightK);
        gl_FragColor = vec4(uColor * vIC * k, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity) * 0.8;
        #endif
      }`,
  });
}

/** Hologram: fresnel rim, scanlines, flicker, glitch slices. Additive. */
export function createHologramMaterial({ color = 0x19e8ff, color2 = 0xff2a8a, intensity = 1.5, deform = '', pattern = '', side = THREE.DoubleSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2) },
      uIntensity: { value: intensity }, uTime: U.uTime, uGlitch: { value: 0 }, uPhase: { value: 0 },
    },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPhase; uniform float uGlitch;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv2;
      #include <fog_pars_vertex>
      void main(){
        vUv2 = uv; vP = position;
        #include <beginnormal_vertex>
        #include <begin_vertex>
        ${deform}
        float gl = step(0.92, fract(sin(floor(position.y * 3.0 + uTime * 9.0) * 43.7) * 917.3)) * uGlitch;
        transformed.x += gl * 0.8;
        #include <defaultnormal_vertex>
        vN = normalize(transformedNormal);
        #include <project_vertex>
        vV = -mvPosition.xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uColor2; uniform float uIntensity; uniform float uTime; uniform float uPhase; uniform float uGlitch;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv2;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        fres = pow(fres, 1.8);
        vec3 col = mix(uColor, uColor2, smoothstep(0.2, 0.9, fres));
        float alpha = 0.18 + fres * 1.2;
        ${pattern}
        float scan = 0.65 + 0.35 * sin(vFogWorldPos.y * 7.0 - uTime * 6.0);
        float band = smoothstep(0.0, 0.02, fract(vFogWorldPos.y * 0.05 - uTime * 0.4)) * (1.0 - step(0.985, fract(vFogWorldPos.y * 0.05 - uTime * 0.4)) * -2.0);
        float flick = 0.88 + 0.12 * sin(uTime * 37.0 + uPhase) * sin(uTime * 13.0);
        gl_FragColor = vec4(col * alpha * scan * band * flick * uIntensity, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity * 0.6);
        #endif
      }`,
  });
}

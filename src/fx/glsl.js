import * as THREE from 'three';

// Common GLSL helpers injected into custom shaders.
export const GLSL_NOISE = /* glsl */`
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
`;

// Replaces three's fog with an analytic height fog: dense in the street canyons,
// thinning with altitude, so towers rise out of the haze.
export function installHeightFog() {
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float cityFogAmount(vec3 wp, float density){
    vec3 ro = cameraPosition; ro.y = abs(ro.y);
    vec3 d = wp - ro; float dist = length(d);
    float b = 0.0062;
    float rdY = d.y / max(dist, 1e-3);
    float base = density * exp(-max(ro.y, 0.0) * b);
    float k = rdY * dist * b;
    float fog = abs(k) < 1e-3 ? base * dist : base * (1.0 - exp(-k)) / (rdY * b);
    return 1.0 - exp(-max(fog, 0.0));
  }
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = cityFogAmount(vFogWorldPos, fogDensity);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, length(vFogWorldPos - cameraPosition));
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
}

/** GLSL for periodic street-lamp lookups (lamp heads on both curbs of every street). */
export const GLSL_LAMPS = /* glsl */`
uniform vec3 uLampColor;
float wrapP(float d){ return d - PITCH * floor(d / PITCH + 0.5); }
// returns accumulated lamp irradiance factor at world point (xz) at height y
float lampField(vec3 p){
  vec2 l = mod(p.xz + BLOCKW * 0.5, PITCH);
  if (max(abs(p.x), abs(p.z)) > CITYHALF + 10.0) return 0.0;
  float acc = 0.0;
  float h = max(LAMPH - p.y, 0.0) + 0.6;
  // streets running along z (x band)
  for (int s = 0; s < 2; s++){
    float hx = s == 0 ? BLOCKW + 1.8 : PITCH - 1.8;
    float dx = wrapP(l.x - hx);
    float zc = l.y < 21.0 ? 10.0 : (l.y < 43.0 ? 32.0 : (l.y < 73.0 ? 54.0 : 92.0));
    float dz = wrapP(l.y - zc);
    float d2 = dx*dx + dz*dz + h*h;
    acc += h / (d2 * sqrt(d2));
    // streets running along x (z band)
    float hz = s == 0 ? BLOCKW + 1.8 : PITCH - 1.8;
    float dz2 = wrapP(l.y - hz);
    float xc = l.x < 21.0 ? 10.0 : (l.x < 43.0 ? 32.0 : (l.x < 73.0 ? 54.0 : 92.0));
    float dx2 = wrapP(l.x - xc);
    float e2 = dx2*dx2 + dz2*dz2 + h*h;
    acc += h / (e2 * sqrt(e2));
  }
  return acc;
}
`;

import { CFG, CITY_HALF } from '../config.js';
export const CITY_DEFINES = {
  PITCH: CFG.PITCH.toFixed(1),
  BLOCKW: CFG.BLOCK.toFixed(1),
  CITYHALF: CITY_HALF.toFixed(1),
  LAMPH: CFG.LAMP_H.toFixed(2),
};

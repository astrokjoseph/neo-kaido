import * as THREE from 'three';
import { U } from '../config.js';
import { GLSL_NOISE, GLSL_LAMPS, CITY_DEFINES } from './glsl.js';

// Rain-soaked asphalt / paving. Procedural road markings, puddles, animated rain
// ripples, analytic street-lamp light pools, and a planar reflection sampled with
// ripple distortion and a vertical streak blur (the classic neon smear).
export function createWetMaterial(kind, reflection) {
  const mat = new THREE.MeshStandardMaterial({
    color: kind === 'road' ? 0x2a2c33 : 0x45464f,
    roughness: 0.4, metalness: 0.0, envMapIntensity: 0.25,
  });
  mat.defines = { ...CITY_DEFINES };
  if (kind === 'road') mat.defines.ROAD = '';
  mat.customProgramCacheKey = () => 'wet-' + kind;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: U.uTime, uRain: U.uRain, uNight: U.uNight, uLampColor: U.uLampColor,
      tReflect: reflection.tex, uReflMatrix: reflection.matrix, uReflOn: reflection.strength,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform mat4 uReflMatrix; varying vec4 vReflCoord; varying vec3 vGWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 gim = mat4(1.0);
        #ifdef USE_INSTANCING
          gim = instanceMatrix;
        #endif
        vec4 gwp = modelMatrix * gim * vec4(position, 1.0);
        vGWPos = gwp.xyz;
        vReflCoord = uReflMatrix * gwp;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uRain; uniform float uNight; uniform float uReflOn;
        uniform sampler2D tReflect;
        varying vec4 vReflCoord; varying vec3 vGWPos;
        ${GLSL_NOISE}
        ${GLSL_LAMPS}
        // expanding rain ripple rings, returns xz slope
        vec2 ripples(vec2 p, float t){
          vec2 acc = vec2(0.0);
          for (int k = 0; k < 2; k++){
            vec2 q = p * (k == 0 ? 1.6 : 2.3) + float(k) * 7.3;
            vec2 id = floor(q); vec2 fq = fract(q) - 0.5;
            vec2 off = hash22(id) - 0.5;
            float ph = hash12(id + 3.1);
            float life = fract(t * (0.9 + ph * 0.6) + ph);
            vec2 d = fq - off * 0.6;
            float r = length(d);
            float wave = sin((r - life * 0.55) * 60.0) * smoothstep(0.0, 0.08, life * 0.55 - r + 0.08) * (1.0 - life) * smoothstep(0.5, 0.2, r);
            acc += (r > 1e-3 ? d / r : vec2(0.0)) * wave;
          }
          return acc;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 wp = vGWPos.xz;
        vec2 L = mod(wp + BLOCKW * 0.5, PITCH);
        float grit = fbm(wp * 0.35);
        float fine = vnoise(wp * 7.0);
        float puddleN = fbm(wp * 0.045 + 3.0) * 0.7 + fbm(wp * 0.19) * 0.3;
        float wetLevel = mix(0.18, 0.62, uRain);
        float puddle = smoothstep(wetLevel, wetLevel - 0.08, 1.0 - puddleN);
        vec3 base = diffuseColor.rgb * (0.65 + 0.5 * grit) * (0.9 + 0.2 * fine);
        float mark = 0.0; vec3 markCol = vec3(0.85);
        #ifdef ROAD
          bool inX = L.x > BLOCKW; bool inZ = L.y > BLOCKW;
          float sx = L.x - BLOCKW - 9.0; float sz = L.y - BLOCKW - 9.0;
          if (inX && !inZ) {
            float dash = step(0.45, fract(L.y / 6.0));
            mark += (1.0 - smoothstep(0.06, 0.1, abs(abs(sx) - 4.5))) * dash;
            mark += (1.0 - smoothstep(0.05, 0.08, abs(abs(sx) - 0.18)));
            if (abs(sx) < 0.4) markCol = vec3(1.0, 0.65, 0.15);
            float cw = step(L.y, 3.6) + step(BLOCKW - 3.6, L.y);
            mark = max(mark, cw * step(0.5, fract(sx / 1.2)) * step(abs(sx), 8.2) * step(0.4, L.y) * step(L.y, BLOCKW - 0.4));
          } else if (inZ && !inX) {
            float dash = step(0.45, fract(L.x / 6.0));
            mark += (1.0 - smoothstep(0.06, 0.1, abs(abs(sz) - 4.5))) * dash;
            mark += (1.0 - smoothstep(0.05, 0.08, abs(abs(sz) - 0.18)));
            if (abs(sz) < 0.4) markCol = vec3(1.0, 0.65, 0.15);
            float cw = step(L.x, 3.6) + step(BLOCKW - 3.6, L.x);
            mark = max(mark, cw * step(0.5, fract(sz / 1.2)) * step(abs(sz), 8.2) * step(0.4, L.x) * step(L.x, BLOCKW - 0.4));
          } else if (inX && inZ) {
            // intersection: faint grid box
            vec2 g = abs(vec2(sx, sz));
            mark += (1.0 - smoothstep(0.05, 0.1, abs(max(g.x, g.y) - 8.6))) * 0.6;
          }
          // manholes
          vec2 mh = mod(wp + vec2(23.0, 11.0), vec2(41.0, 57.0)) - vec2(20.5, 28.5);
          float mhr = length(mh);
          base *= 1.0 - 0.45 * (1.0 - smoothstep(0.55, 0.6, mhr)) * step(0.5, fract(mh.x * 4.0)) ;
          mark *= 0.75 + 0.25 * fine;
          mark *= 1.0 - 0.6 * smoothstep(0.55, 0.85, grit);
          base = mix(base, markCol * 0.55, clamp(mark, 0.0, 1.0));
        #else
          // pavers + curb
          vec2 tl = fract(wp / 1.25);
          vec2 tid = floor(wp / 1.25);
          float grout = step(0.95, max(tl.x, tl.y));
          base *= 0.8 + 0.35 * hash12(tid);
          base *= 1.0 - grout * 0.45;
          vec2 eb = min(L, BLOCKW - L);
          float curb = 1.0 - smoothstep(0.3, 0.32, min(eb.x, eb.y));
          base = mix(base, vec3(0.42, 0.42, 0.45), curb);
          // tactile strips at crossings
          float tac = step(min(eb.x, eb.y), 1.1) * step(0.35, min(eb.x, eb.y)) * step(max(eb.x, eb.y), 9.0);
          base = mix(base, vec3(0.6, 0.45, 0.08), tac * 0.7);
        #endif
        diffuseColor.rgb = base * mix(1.0, 0.55, uRain * 0.6) * (1.0 - puddle * 0.35);
        `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float wet = mix(0.25, 1.0, uRain);
        roughnessFactor = mix(0.85, mix(0.32, 0.05, puddle), wet) + 0.1 * fine * (1.0 - puddle);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 rip = ripples(wp, uTime) * uRain * (0.25 + 0.75 * puddle);
        vec2 slope = rip * 0.35 + (vec2(vnoise(wp * 3.1), vnoise(wp * 3.1 + 9.0)) - 0.5) * 0.18 * (1.0 - puddle);
        vec3 wN = normalize(vec3(-slope.x, 1.0, -slope.y));
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
        // analytic street-lamp pools
        float lf = lampField(vGWPos);
        outgoingLight += diffuseColor.rgb * uLampColor * lf * 90.0 * smoothstep(0.15, 0.5, uNight);
        // planar reflection with ripple distortion + vertical streak blur
        vec3 Vw = normalize(cameraPosition - vGWPos);
        float NoV = clamp(dot(wN, Vw), 0.0, 1.0);
        float fres = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
        vec2 ruv = vReflCoord.xy / vReflCoord.w;
        ruv += slope * 0.035;
        float spread = mix(0.03, 0.004, puddle) * (0.4 + 0.6 * wet);
        vec3 refl = vec3(0.0); float wsum = 0.0;
        for (int i = -3; i <= 3; i++) {
          float o = float(i) / 3.0;
          float wgt = exp(-o * o * 2.0);
          refl += texture2D(tReflect, ruv + vec2(o * spread * 0.12, o * spread)).rgb * wgt;
          wsum += wgt;
        }
        refl /= wsum;
        float reflAmt = uReflOn * wet * mix(0.35, 1.0, puddle) * (0.15 + 0.85 * fres);
        outgoingLight = outgoingLight * (1.0 - reflAmt * 0.5) + refl * reflAmt;
        #include <opaque_fragment>`);
  };
  return mat;
}
